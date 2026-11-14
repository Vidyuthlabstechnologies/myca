import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';
import 'package:myca/format.dart';
import 'package:myca/invoice_pdf.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/invoice_screen.dart';

import 'fake_api.dart';

ByteData fontBytes(String key) => ByteData.sublistView(File(key).readAsBytesSync());

class Sent {
  final shared = <String, Uint8List>{};
  final printed = <String, Uint8List>{};
  bool accept = true;

  PdfActions get actions => PdfActions(
    share: (name, bytes) async {
      shared[name] = bytes;
      return accept;
    },
    print: (name, bytes) async {
      printed[name] = bytes;
      return true;
    },
    loadAsset: (key) async => fontBytes(key),
  );
}

AppState stateWith(FakeMycaApi api, Sent sent) => AppState(
  api: api,
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => null,
  pdf: sent.actions,
  now: () => DateTime(2026, 10, 5, 22, 30),
);

Future<void> openInvoice(WidgetTester tester, FakeMycaApi api, Sent sent) async {
  await tester.pumpWidget(MycaApp(state: stateWith(api, sent)));
  await tester.pumpAndSettle();
  await tapRow(tester, 'Sales');
  await tester.tap(find.text('Gujarat Weaves'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Invoice INV-0002'));
  await tester.pumpAndSettle();
}

Future<void> showButtons(WidgetTester tester) async {
  final list = find.byType(Scrollable).last;
  await tester.scrollUntilVisible(find.text('Print or save as PDF'), 200, scrollable: list);
  await tester.drag(list, const Offset(0, -800));
  await tester.pumpAndSettle();
}

void main() {
  test('dates and quantities read plainly', () {
    expect(longDate('2026-08-12'), '12 August 2026');
    expect(longDate('soon'), 'soon');
    expect(plainNumber(3), '3');
    expect(plainNumber(3.0), '3');
    expect(plainNumber(2.5), '2.5');
  });

  test('the note names everything an invoice lacks', () {
    expect(missingNote(const []), '');
    expect(missingNote(const ['HSN']), contains('does not carry an HSN or SAC code on every item.'));
    expect(
      missingNote(const ['SELLER_GSTIN', 'SELLER_ADDRESS', 'HSN']),
      contains('your GSTIN, your business address and an HSN or SAC code on every item'),
    );
    expect(missingNote(const ['SOMETHING_NEW']), contains('something new'));
  });

  test('an invoice document is read from the tool result, and a refusal reads as nothing', () async {
    final api = FakeMycaApi(signedIn: true);
    final doc = InvoiceDocument.fromTool(await api.query('invoice_document', {'id': 'INV-0002'}))!;
    expect(doc.title, 'Tax invoice');
    expect(doc.sellerAddress, '12 Market Road, Pune, 411001');
    expect(doc.placeOfSupply.label, 'Gujarat (24)');
    expect(doc.taxHeads, [('IGST', 55123.81)]);
    expect(doc.lines.length, 2);
    expect(doc.balance, 277600);
    expect(InvoiceDocument.fromTool(await api.query('invoice_document', {'id': 'INV-9999'})), isNull);
  });

  test('the PDF is a real PDF named after the invoice', () async {
    final api = FakeMycaApi(signedIn: true);
    final doc = InvoiceDocument.fromTool(await api.query('invoice_document', {'id': 'INV-0002'}))!;
    final bytes = await buildInvoicePdf(doc, regular: fontBytes(invoiceFontRegular), bold: fontBytes(invoiceFontBold));
    expect(latin1.decode(bytes.sublist(0, 5)), '%PDF-');
    expect(bytes.length, greaterThan(2000));
    expect(invoiceFileName(doc), 'INV-0002.pdf');
  });

  test('an invoice with a UPI payment link reads it and draws a payable PDF with the QR code', () async {
    final api = FakeMycaApi(signedIn: true);
    final json = await api.query('invoice_document', {'id': 'INV-0002'}) as Map<String, dynamic>;
    final data = Map<String, dynamic>.from(json['data'] as Map);
    data['template'] = {'bankWords': 'HDFC Bank, UPI asha.traders@okhdfcbank'};
    data['upiPayment'] = {'upi': 'asha.traders@okhdfcbank', 'amount': 277600, 'link': 'upi://pay?pa=asha.traders%40okhdfcbank&pn=Nalanda&am=277600.00&cu=INR&tn=INV-0002'};
    final doc = InvoiceDocument.fromTool({'ok': true, 'data': data})!;
    expect(doc.upiLink, startsWith('upi://pay?pa=asha.traders%40okhdfcbank'));
    final withQr = await buildInvoicePdf(doc, regular: fontBytes(invoiceFontRegular), bold: fontBytes(invoiceFontBold));
    expect(latin1.decode(withQr.sublist(0, 5)), '%PDF-');
    data.remove('upiPayment');
    final plainDoc = InvoiceDocument.fromTool({'ok': true, 'data': data})!;
    expect(plainDoc.upiLink, isEmpty);
    final plain = await buildInvoicePdf(plainDoc, regular: fontBytes(invoiceFontRegular), bold: fontBytes(invoiceFontBold));
    expect(withQr.length, greaterThan(plain.length));
  });

  test('an e-invoice PDF carries the IRN, ack and signed QR, the reverse-charge line and the bill of supply title', () async {
    final api = FakeMycaApi(signedIn: true);
    final json = await api.query('invoice_document', {'id': 'INV-0002'}) as Map<String, dynamic>;
    final data = Map<String, dynamic>.from(json['data'] as Map);
    data['documentTitle'] = 'Tax invoice';
    data['reverseChargeLine'] = 'Tax payable on reverse charge: No';
    data['einvoice'] = {'status': 'issued', 'irn': 'a' * 64, 'ackNo': '112010036563310', 'ackDate': '2026-10-03 11:05:00', 'signedQrCode': 'eyJhbGciOiJSUzI1NiJ9.signed.qr', 'why': ''};
    final doc = InvoiceDocument.fromTool({'ok': true, 'data': data})!;
    expect(doc.einvoice!.onPdf, isTrue);
    expect(doc.einvoice!.valid, isTrue);
    expect(doc.statutoryLines, ['Tax payable on reverse charge: No']);
    final withIrn = await buildInvoicePdf(doc, regular: fontBytes(invoiceFontRegular), bold: fontBytes(invoiceFontBold));
    data['einvoice'] = {'status': 'ready', 'irn': '', 'why': ''};
    final plain = await buildInvoicePdf(InvoiceDocument.fromTool({'ok': true, 'data': data})!, regular: fontBytes(invoiceFontRegular), bold: fontBytes(invoiceFontBold));
    expect(withIrn.length, greaterThan(plain.length));
    data['einvoice'] = {'status': 'sandbox', 'irn': 'b' * 64, 'ackNo': '1', 'signedQrCode': 'sandbox.qr', 'why': ''};
    expect(InvoiceDocument.fromTool({'ok': true, 'data': data})!.einvoice!.valid, isFalse);
    data['documentTitle'] = 'Bill of supply';
    expect(InvoiceDocument.fromTool({'ok': true, 'data': data})!.title, 'Bill of supply');
    data.remove('documentTitle');
    expect(InvoiceDocument.fromTool({'ok': true, 'data': data})!.title, 'Tax invoice');
  });

  test('the invoice design from the server is read, with the standard design when none is set', () {
    final design = InvoiceTemplate.fromJson({'accent': '#1d4ed8', 'layout': 'minimal', 'signatory': 'Asha Rao', 'footer': 'Thank you', 'terms': 'Net 30', 'bankWords': 'HDFC Bank, A/c 50100123456789, IFSC HDFC0001234', 'showHsn': false});
    expect(design.accent, 0xFF1D4ED8);
    expect(design.minimal, isTrue);
    expect(design.signatory, 'Asha Rao');
    expect(design.bankWords, contains('IFSC HDFC0001234'));
    expect(design.showHsn, isFalse);
    final plain = InvoiceTemplate.fromJson(null);
    expect(plain.accent, 0xFFB42318);
    expect(plain.minimal, isFalse);
    expect(plain.showHsn, isTrue);
  });

  testWidgets('an invoice opens from the customer chat with the figures the engine returned', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openInvoice(tester, api, Sent());

    expect(api.queries, contains('invoice_document'));
    expect(find.text('TAX INVOICE'), findsOneWidget);
    expect(find.text('Nalanda Textiles LLP'), findsOneWidget);
    expect(find.text('GSTIN 24AAACG1234F1Z5'), findsOneWidget);
    expect(find.text('12 August 2026'), findsOneWidget);
    expect(find.text('Gujarat (24)'), findsOneWidget);
    expect(find.text('3 × ₹1,00,000.00 · GST 18% · HSN 5007'), findsOneWidget);
    expect(find.text('1 × ₹22,476.19 · GST 5%'), findsOneWidget);
    await showButtons(tester);
    expect(find.text('IGST'), findsOneWidget);
    expect(find.text('CGST'), findsNothing);
    expect(find.text('₹55,123.81'), findsOneWidget);
    expect(find.text('₹3,77,600.00'), findsOneWidget);
    expect(find.text('₹2,77,600.00'), findsOneWidget);
    expect(find.textContaining('does not carry an HSN or SAC code on every item'), findsOneWidget);
    expect(find.textContaining('MyCA sends nothing by itself'), findsOneWidget);
  });

  testWidgets('sending hands a PDF to the share sheet and does not claim delivery', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    final sent = Sent();
    await openInvoice(tester, api, sent);
    await showButtons(tester);

    await tester.tap(find.text('Send to Gujarat Weaves'));
    await tester.pumpAndSettle();
    expect(sent.shared.keys.single, 'INV-0002.pdf');
    expect(latin1.decode(sent.shared.values.single.sublist(0, 5)), '%PDF-');
    expect(find.textContaining('cannot see whether it was delivered'), findsOneWidget);
    expect(api.proposals, isEmpty);
    expect(api.sent, isEmpty);

    await tester.tap(find.text('Print or save as PDF'));
    await tester.pumpAndSettle();
    expect(sent.printed.keys.single, 'INV-0002.pdf');
  });

  testWidgets('a cancelled share says so', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    final sent = Sent()..accept = false;
    await openInvoice(tester, api, sent);
    await showButtons(tester);
    await tester.tap(find.text('Send to Gujarat Weaves'));
    await tester.pumpAndSettle();
    expect(find.text('Not sent.'), findsOneWidget);
  });

  testWidgets('an invoice that cannot be opened offers to try again', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: stateWith(api, Sent())));
    await tester.pumpAndSettle();
    final context = tester.element(find.text('Sales'));
    Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const InvoiceScreen(invoiceId: 'INV-9999')));
    await tester.pumpAndSettle();
    expect(find.text('This invoice could not be opened.'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });
}
