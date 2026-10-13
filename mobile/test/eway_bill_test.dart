import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

ByteData fontBytes(String key) => ByteData.sublistView(File(key).readAsBytesSync());

AppState printingState(FakeMycaApi api) => AppState(
  api: api,
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => null,
  pdf: PdfActions(
    share: (name, bytes) async => true,
    print: (name, bytes) async => true,
    loadAsset: (key) async => fontBytes(key),
  ),
  now: () => DateTime(2026, 10, 5, 22, 30),
);

Future<void> openInvoice(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: printingState(api)));
  await tester.pumpAndSettle();
  await tapRow(tester, 'Sales');
  await tester.tap(find.text('Gujarat Weaves'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Invoice INV-0002'));
  await tester.pumpAndSettle();
}

void main() {
  test('the document model reads the buyer address, shares and e-way bill state', () {
    final doc = InvoiceDocument.fromTool({'ok': true, 'data': {
      'id': 'INV-0001',
      'date': '2026-09-05',
      'seller': {'name': 'A', 'gstin': '', 'address': '', 'state': {'code': '27', 'name': 'Maharashtra'}},
      'buyer': {'name': 'B', 'gstin': '', 'address': '7 Ring Road, Surat'},
      'placeOfSupply': {'code': '24', 'name': 'Gujarat'},
      'lines': [],
      'taxable': 0, 'cgst': 0, 'sgst': 0, 'igst': 0, 'total': 0,
      'receipts': [], 'received': 0, 'credited': 0, 'creditNotes': [],
      'shares': [{'on': '2026-10-05T10:00:00.000Z', 'by': 'u', 'channel': 'share_sheet', 'outcome': 'shared'}],
      'ewayBill': {'needed': true, 'why': 'Goods move.', 'status': 'ready', 'transport': {'words': '120 km by road, vehicle MH12AB1234'}, 'ewbNo': '', 'ewbValidity': '', 'next': 'Ready.'},
      'status': 'posted', 'balance': 0, 'missing': [],
    }})!;
    expect(doc.buyerAddress, '7 Ring Road, Surat');
    expect(doc.shares.single.channel, 'share_sheet');
    expect(doc.ewayBill!.status, 'ready');
    expect(doc.ewayBill!.transportWords, '120 km by road, vehicle MH12AB1234');
  });

  testWidgets('an invoice that needs an e-way bill shows why, takes transport details after a preview, and a share is noted in the log', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openInvoice(tester, api);
    final list = find.byType(Scrollable).last;
    await tester.scrollUntilVisible(find.text('E-WAY BILL'), 200, scrollable: list);
    expect(find.text('Needed for this invoice'), findsOneWidget);
    expect(find.textContaining('above the ₹50,000.00 limit'), findsOneWidget);
    await tester.tap(find.text('Add transport details'));
    await tester.pumpAndSettle();
    expect(find.text('Transport for INV-0002'), findsOneWidget);
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(find.textContaining('whole kilometres'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Vehicle number'), 'mh 12 ab 1234');
    await tester.enterText(find.widgetWithText(TextField, 'Distance in km'), '120');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.single.tool, 'set_transport');
    expect(api.proposals.single.args, {'invoiceId': 'INV-0002', 'distanceKm': 120, 'mode': 'road', 'vehicleNo': 'MH12AB1234'});
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.textContaining('Transport: 120 km by road'), 200, scrollable: find.byType(Scrollable).last);
    expect(find.textContaining('Generate the e-invoice (IRN) first'), findsOneWidget);
    expect(find.text('Generate e-way bill'), findsNothing);

    await tester.scrollUntilVisible(find.text('Print or save as PDF'), 200, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.text('Print or save as PDF'));
    await tester.pumpAndSettle();
    expect(api.queries.where((q) => q == 'record_share').length, 1);
    expect(api.shares.single['outcome'], 'printed');
    await tester.scrollUntilVisible(find.textContaining('Shared once, last on 5 October 2026'), 200, scrollable: find.byType(Scrollable).last);
  });
}
