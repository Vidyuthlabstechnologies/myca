import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/uae/uae_emirates.dart';
import 'package:myca/uae/uae_format.dart';
import 'package:myca/uae/uae_strings.dart';

import 'uae_fake_api.dart';
import 'uae_walks.dart';

String _shown(WidgetTester tester, String key) {
  final found = find.byKey(ValueKey(key));
  final widget = tester.widget(found);
  if (widget is Text) return widget.data ?? '';
  return tester.widget<Text>(find.descendant(of: found, matching: find.byType(Text)).first).data ?? '';
}

Future<void> _back(WidgetTester tester) async {
  Navigator.of(tester.element(find.byType(Scaffold).last)).pop();
  await tester.pumpAndSettle();
}

Future<String> _see(WidgetTester tester, String key) async {
  await uaeScrollTo(tester, key);
  return _shown(tester, key);
}

/// A sale of AED 1,050 to a buyer with no TRN: small enough for a simplified tax invoice.
void _seedSmallSale(UaeFakeApi api) {
  api.invoices.add({
    'id': 'INV-0003',
    'date': '2026-11-12',
    'country': 'AE',
    'partyName': 'Desert Rose Interiors',
    'partyGstin': '',
    'partyTrn': '',
    'emirate': 'DXB',
    'currency': 'AED',
    'exchangeRate': 1,
    'lines': [
      {'description': 'Site visits', 'qty': 1, 'rate': 1000, 'treatment': 'standard', 'subtotal': 1000, 'vat': 50, 'amount': 1050},
    ],
    'subtotal': 1000,
    'vat': 50,
    'total': 1050,
    'status': 'posted',
    'receipts': <Object?>[],
  });
}

void main() {
  tearDown(() {
    moneyCountry = 'IN';
    uaeProfile.value = null;
  });

  for (final language in ['en', 'ar']) {
    final ar = language == 'ar';
    final s = UaeStrings(ar);
    final f = UaeFormat(Locale(language, 'AE'));

    testWidgets('$language: a full tax invoice shows the engine title, both parties with TRN and address, and AED totals', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      api.savedProfile = uaeFullProfile;
      api.invoices.first['partyAddress'] = uaeBuyerAddress;
      await pushUaeDocument(tester, 'INV-0001');
      final call = api.queryArgs.lastWhere((q) => q.name == 'invoice_document');
      expect(call.args, {'id': 'INV-0001', if (ar) 'lang': 'ar'});
      expect(find.text(s.invoiceTitle('INV-0001')), findsOneWidget);
      expect(_shown(tester, 'uae.invoice.title'), ar ? 'فاتورة ضريبية' : 'Tax Invoice');
      expect(_shown(tester, 'uae.invoice.status'), s.status('paid'));
      expect(_shown(tester, 'uae.invoice.number'), 'INV-0001');
      expect(_shown(tester, 'uae.invoice.date'), f.date('2026-08-05'));
      expect(find.text(emirateByCode('DXB')!.name(ar)), findsOneWidget);
      expect(find.byKey(const ValueKey('uae.invoice.missingNotes')), findsNothing);
      expect(await _see(tester, 'uae.invoice.seller.name'), 'Al Noor Trading LLC');
      expect(_shown(tester, 'uae.invoice.seller.nameAr'), 'النور للتجارة ذ.م.م');
      expect(_shown(tester, 'uae.invoice.seller.trn'), s.trnOf('100123456700003'));
      expect(await _see(tester, 'uae.invoice.seller.address'), 'Office 1204, Bay Square, Business Bay, Dubai');
      expect(await _see(tester, 'uae.invoice.buyer.name'), 'Gulf Star General Trading LLC');
      expect(_shown(tester, 'uae.invoice.buyer.trn'), s.trnOf('100987654300003'));
      expect(await _see(tester, 'uae.invoice.buyer.address'), uaeBuyerAddress);
      expect(await _see(tester, 'uae.invoice.line.0.unit'), s.quantityTimes('1', f.money(20000)));
      expect(find.byKey(const ValueKey('uae.invoice.line.0.aed')), findsNothing);
      expect(_shown(tester, 'uae.invoice.line.0.vat'), contains(s.vatRateOf('5')));
      expect(_shown(tester, 'uae.invoice.line.0.amount'), f.money(21000));
      await uaeScrollTo(tester, 'uae.invoice.balance');
      expect(find.text(s.netAed), findsOneWidget);
      expect(find.text(s.vatAed), findsOneWidget);
      expect(find.text(s.totalAed), findsOneWidget);
      expect(_shown(tester, 'uae.invoice.net'), f.money(20000));
      expect(_shown(tester, 'uae.invoice.vat'), f.money(1000));
      expect(_shown(tester, 'uae.invoice.total'), f.money(21000));
      expect(_shown(tester, 'uae.invoice.received'), f.money(21000));
      expect(_shown(tester, 'uae.invoice.balance'), f.money(0));
      expect(tester.takeException(), isNull);
    });

    testWidgets('$language: a small sale to a buyer with no TRN is a simplified tax invoice and does not ask for the buyer address', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      api.savedProfile = uaeFullProfile;
      _seedSmallSale(api);
      await pushUaeDocument(tester, 'INV-0003');
      expect(_shown(tester, 'uae.invoice.title'), ar ? 'فاتورة ضريبية مبسطة' : 'Simplified Tax Invoice');
      expect(find.byKey(const ValueKey('uae.invoice.missingNotes')), findsNothing);
      expect(await _see(tester, 'uae.invoice.seller.trn'), s.trnOf('100123456700003'));
      expect(await _see(tester, 'uae.invoice.buyer.trn'), s.noTrn);
      expect(await _see(tester, 'uae.invoice.buyer.address'), s.noAddress);
      expect(await _see(tester, 'uae.invoice.total'), f.money(1050));
    });

    testWidgets('$language: with no seller TRN it is a plain invoice and says, item by item, what is missing', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      api.savedProfile = {'name': 'Al Noor Trading LLC', 'emirate': 'DXB'};
      await pushUaeDocument(tester, 'INV-0002');
      expect(_shown(tester, 'uae.invoice.title'), ar ? 'فاتورة' : 'Invoice');
      expect(find.text(ar ? 'فاتورة ضريبية' : 'Tax Invoice'), findsNothing);
      expect(find.text(s.taxInvoice), findsNothing);
      await uaeScrollTo(tester, 'uae.invoice.missingNotes');
      expect(find.text(s.missingTitle), findsOneWidget);
      for (final code in ['SELLER_TRN', 'SELLER_ADDRESS', 'BUYER_ADDRESS']) {
        expect(_shown(tester, 'uae.invoice.missing.$code'), s.missingItem(code), reason: code);
      }
      expect(await _see(tester, 'uae.invoice.seller.trn'), s.noTrn);
      expect(await _see(tester, 'uae.invoice.seller.address'), s.noAddress);
      expect(await _see(tester, 'uae.invoice.buyer.address'), s.noAddress);
    });

    testWidgets('$language: a USD line shows its USD price and the AED unit price, and the totals stay in AED', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      api.savedProfile = uaeFullProfile;
      seedUaeForeignInvoice(api);
      await pushUaeDocument(tester, 'INV-0003');
      expect(_shown(tester, 'uae.invoice.currency'), s.inCurrency('USD', '3.6725'));
      final unit = await _see(tester, 'uae.invoice.line.0.unit');
      expect(unit, s.quantityTimes('2', f.moneyIn('USD', 5000)));
      expect(unit, contains('USD'));
      expect(unit, isNot(contains('AED')));
      expect(_shown(tester, 'uae.invoice.line.0.aed'), s.unitPriceAed(f.money(18362.5)));
      expect(_shown(tester, 'uae.invoice.line.0.aed'), contains('AED'));
      expect(_shown(tester, 'uae.invoice.line.0.amount'), f.money(38561.25));
      expect(await _see(tester, 'uae.invoice.line.1.unit'), s.quantityTimes('1', f.moneyIn('USD', 1000)));
      expect(_shown(tester, 'uae.invoice.line.1.aed'), s.unitPriceAed(f.money(3672.5)));
      expect(_shown(tester, 'uae.invoice.line.1.vat'), startsWith(ar ? 'خاضع للنسبة الصفرية' : 'Zero-rated'));
      expect(await _see(tester, 'uae.invoice.total'), f.money(42233.75));
      expect(_shown(tester, 'uae.invoice.net'), f.money(40397.5));
      expect(_shown(tester, 'uae.invoice.vat'), f.money(1836.25));
      expect(_shown(tester, 'uae.invoice.total'), contains('AED'));
    });

    testWidgets('$language: a credit note opens from the customer, shows both TRNs, the original invoice, the reason and the totals, and links back', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      api.savedProfile = uaeFullProfile;
      api.invoices[1]['partyTrn'] = '100444555600003';
      api.invoices[1]['partyAddress'] = 'Shop 3, Al Wasl Road, Jumeirah';
      seedUaeCreditNote(api, reason: 'Two site visits not made');
      await openUaeCreditNote(tester);
      expect(api.queryArgs.lastWhere((q) => q.name == 'invoice_document').args['id'], 'CN-0001');
      expect(find.text(s.creditNoteTitle('CN-0001')), findsOneWidget);
      expect(_shown(tester, 'uae.invoice.title'), ar ? 'إشعار دائن ضريبي' : 'Tax Credit Note');
      expect(_shown(tester, 'uae.invoice.number'), 'CN-0001');
      expect(_shown(tester, 'uae.invoice.date'), f.date('2026-11-02'));
      expect(find.byKey(const ValueKey('uae.invoice.missingNotes')), findsNothing);
      expect(await _see(tester, 'uae.invoice.seller.trn'), s.trnOf('100123456700003'));
      expect(await _see(tester, 'uae.invoice.buyer.trn'), s.trnOf('100444555600003'));
      expect(await _see(tester, 'uae.credit.originalId'), 'INV-0002');
      expect(_shown(tester, 'uae.credit.originalDate'), f.date('2026-10-12'));
      expect(_shown(tester, 'uae.credit.originalTotal'), f.money(10500));
      expect(await _see(tester, 'uae.credit.why'), 'Two site visits not made');
      expect(find.byKey(const ValueKey('uae.credit.cancels')), findsNothing);
      expect(await _see(tester, 'uae.invoice.total'), f.money(2100));
      expect(_shown(tester, 'uae.invoice.net'), f.money(2000));
      expect(_shown(tester, 'uae.invoice.vat'), f.money(100));
      expect(find.byKey(const ValueKey('uae.invoice.credit')), findsNothing);
      await uaeTap(tester, 'uae.credit.openInvoice');
      expect(find.text(s.invoiceTitle('INV-0002')), findsOneWidget);
      expect(_shown(tester, 'uae.invoice.title'), ar ? 'فاتورة ضريبية' : 'Tax Invoice');
      expect(await _see(tester, 'uae.invoice.credited'), '−${f.money(2100)}');
      expect(_shown(tester, 'uae.invoice.left'), f.money(8400));
      await uaeTap(tester, 'uae.invoice.note.CN-0001');
      expect(find.text(s.creditNoteTitle('CN-0001')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('$language: a credit note with no seller TRN is a plain credit note, and one that cancels says so', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      seedUaeCreditNote(api, cancels: true);
      await pushUaeDocument(tester, 'CN-0001');
      expect(_shown(tester, 'uae.invoice.title'), ar ? 'إشعار دائن' : 'Credit Note');
      await uaeScrollTo(tester, 'uae.invoice.missingNotes');
      expect(_shown(tester, 'uae.invoice.missing.SELLER_TRN'), s.missingItem('SELLER_TRN', creditNote: true));
      expect(_shown(tester, 'uae.invoice.missing.BUYER_ADDRESS'), s.missingItem('BUYER_ADDRESS', creditNote: true));
      expect(await _see(tester, 'uae.credit.cancels'), s.cancelsInFull);
    });

    testWidgets('$language: a credit note issued on the invoice screen opens from its done card', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      await openUaeInvoice(tester);
      await uaeTap(tester, 'uae.invoice.credit');
      await tester.enterText(find.byKey(const ValueKey('uae.credit.amount')), '2100');
      await tester.enterText(find.byKey(const ValueKey('uae.credit.reason')), 'Two site visits not made');
      await tester.tap(find.byKey(const ValueKey('uae.credit.preview')));
      await tester.pumpAndSettle();
      await tester.tap(find.text(s.confirm));
      await tester.pumpAndSettle();
      expect(api.aeWrites.single.tool, 'create_ae_credit_note');
      expect(await _see(tester, 'uae.invoice.credited'), '−${f.money(2100)}');
      await uaeTap(tester, 'uae.credit.open');
      expect(find.text(s.creditNoteTitle('CN-0001')), findsOneWidget);
      expect(await _see(tester, 'uae.credit.originalId'), 'INV-0002');
      expect(await _see(tester, 'uae.invoice.total'), f.money(2100));
    });

    testWidgets('$language: an unknown number says it is not in the books, and a failed load can be tried again', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      await pushUaeDocument(tester, 'INV-0099');
      expect(find.byKey(const ValueKey('uae.invoice.missing')), findsOneWidget);
      expect(find.text(s.notInBooks), findsOneWidget);
      await _back(tester);
      api.documentFails = 'TIMEOUT';
      await pushUaeDocument(tester, 'INV-0002');
      expect(find.byKey(const ValueKey('uae.invoice.error')), findsOneWidget);
      await tester.tap(find.text(s.tryAgain));
      await tester.pumpAndSettle();
      expect(_shown(tester, 'uae.invoice.number'), 'INV-0002');
    });
  }

  testWidgets('ar: the document reads right to left in Arabic, with Arabic labels, the Arabic title and the Arabic seller name', (tester) async {
    await uaeView(tester, language: 'ar');
    final api = await openUaeApp(tester);
    api.savedProfile = uaeFullProfile;
    api.invoices.first['partyAddress'] = uaeBuyerAddress;
    await pushUaeDocument(tester, 'INV-0001');
    const s = UaeStrings(true);
    expect(api.queryArgs.lastWhere((q) => q.name == 'invoice_document').args['lang'], 'ar');
    expect(Directionality.of(tester.element(find.byKey(const ValueKey('uae.invoice.title')))), TextDirection.rtl);
    expect(_shown(tester, 'uae.invoice.title'), 'فاتورة ضريبية');
    expect(find.text('Tax Invoice'), findsNothing);
    expect(find.text(s.documentNumber), findsOneWidget);
    expect(find.text('الفاتورة INV-0001'), findsOneWidget);
    await uaeScrollTo(tester, 'uae.invoice.seller.nameAr');
    expect(_shown(tester, 'uae.invoice.seller.nameAr'), 'النور للتجارة ذ.م.م');
    expect(_shown(tester, 'uae.invoice.seller.trn'), 'الرقم الضريبي 100123456700003');
    await uaeScrollTo(tester, 'uae.invoice.total');
    expect(find.text('الإجمالي بالدرهم'), findsOneWidget);
    expect(find.text('الضريبة بالدرهم'), findsOneWidget);
    api.savedProfile = null;
    await _back(tester);
    await pushUaeDocument(tester, 'INV-0002');
    expect(_shown(tester, 'uae.invoice.title'), 'فاتورة');
    await uaeScrollTo(tester, 'uae.invoice.missing.SELLER_TRN');
    expect(_shown(tester, 'uae.invoice.missing.SELLER_TRN'), 'رقمك الضريبي غير موجود، لذا لا تُعدّ هذه فاتورة ضريبية. أضف الرقم في ملف المنشأة.');
    expect(find.text(s.missingTitle), findsOneWidget);
  });

  test('every missing item and document label has English and Arabic wording, with no India terms', () {
    final india = RegExp(r'GST|GSTIN|HSN|₹|place of supply', caseSensitive: false);
    for (final ar in [false, true]) {
      final s = UaeStrings(ar);
      final words = [
        for (final code in ['SELLER_TRN', 'SELLER_ADDRESS', 'BUYER_ADDRESS']) ...[s.missingItem(code), s.missingItem(code, creditNote: true)],
        s.missingTitle, s.seller, s.buyer, s.noAddress, s.originalInvoice, s.originalInvoiceDate, s.originalTotal, s.originalVat,
        s.creditReasonLabel, s.cancelsInFull, s.netAed, s.vatAed, s.creditedLabel, s.balanceDue, s.openCreditNote, s.creditNoteTitle('CN-0001'),
        s.creditNoteNotInBooks, s.documentNumber, s.dateOfSupply, s.tapToOpen,
      ];
      for (final word in words) {
        expect(word, isNotEmpty);
        expect(india.hasMatch(word), isFalse, reason: word);
        expect(RegExp(r'[؀-ۿ]').hasMatch(word), ar, reason: word);
      }
    }
    expect(const UaeStrings(false).missingItem('SELLER_TRN'), isNot(const UaeStrings(true).missingItem('SELLER_TRN')));
  });
}
