import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/uae/uae_emirates.dart';
import 'package:myca/uae/uae_strings.dart';

import 'uae_fake_api.dart';
import 'uae_walks.dart';

String _shown(WidgetTester tester, String key) => (tester.widget<Text>(find.byKey(ValueKey(key)))).data ?? '';

Future<void> _confirm(WidgetTester tester, UaeStrings s) async {
  await tester.tap(find.text(s.confirm));
  await tester.pumpAndSettle();
}

void main() {
  tearDown(() {
    moneyCountry = 'IN';
    uaeProfile.value = null;
  });

  for (final language in ['en', 'ar']) {
    final ar = language == 'ar';
    final s = UaeStrings(ar);

    testWidgets('$language: a new sale picks the customer and TRN, shows live AED totals, and posts create_ae_invoice only after confirming', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      api.savedProfile = uaeSavedProfile;
      await openUaeSale(tester);
      expect(find.text(s.newSaleTitle), findsOneWidget);
      expect(find.text('Gulf Star General Trading LLC'), findsOneWidget);
      expect(find.text('100987654300003'), findsOneWidget);
      expect(find.text(emirateByCode('DXB')!.name(ar)), findsOneWidget);
      expect(Directionality.of(tester.element(find.byKey(const ValueKey('uae.sale.party')))), ar ? TextDirection.rtl : TextDirection.ltr);
      await fillUaeSale(tester);
      await pickFromMenu(tester, 'uae.sale.line.1.treatment', s.treatmentName('zero-rated'));
      await uaeScrollTo(tester, 'uae.sale.total');
      expect(_shown(tester, 'uae.sale.net'), contains('11,000.00'));
      expect(_shown(tester, 'uae.sale.vat'), contains('500.00'));
      expect(_shown(tester, 'uae.sale.total'), contains('11,500.00'));
      expect(_shown(tester, 'uae.sale.total'), contains('AED'));
      await pickFromMenu(tester, 'uae.sale.currency', 'USD');
      await uaeType(tester, 'uae.sale.exchangeRate', '3.6725');
      await uaeScrollTo(tester, 'uae.sale.total');
      expect(_shown(tester, 'uae.sale.total'), contains('42,233.75'));
      await uaeTap(tester, 'uae.sale.preview');
      final proposal = api.aeProposals.last;
      expect(proposal.tool, 'create_ae_invoice');
      expect(proposal.args['partyName'], 'Gulf Star General Trading LLC');
      expect(proposal.args['buyerTrn'], '100987654300003');
      expect(proposal.args['emirate'], 'DXB');
      expect(proposal.args['currency'], 'USD');
      expect(proposal.args['exchangeRate'], 3.6725);
      expect(proposal.args['date'], '2026-11-14');
      expect(proposal.args['lang'], language);
      expect(proposal.args['lines'], [
        {'description': 'Consulting, November', 'qty': 2, 'rate': 5000, 'treatment': 'standard'},
        {'description': 'Export freight', 'qty': 1, 'rate': 1000, 'treatment': 'zero-rated'},
      ]);
      expect(api.aeWrites, isEmpty);
      await uaeScrollTo(tester, 'uae.sale.held');
      expect(find.textContaining(ar ? 'فاتورة إلى Gulf Star' : 'Invoice to Gulf Star'), findsOneWidget);
      await _confirm(tester, s);
      expect(api.aeWrites.single.tool, 'create_ae_invoice');
      await uaeScrollTo(tester, 'uae.sale.done');
      expect(find.text(s.saleRecorded('INV-0003')), findsOneWidget);
      await uaeTap(tester, 'uae.sale.open');
      expect(find.text(s.invoiceTitle('INV-0003')), findsOneWidget);
      await uaeScrollTo(tester, 'uae.invoice.total');
      expect(_shown(tester, 'uae.invoice.total'), contains('42,233.75'));
      expect(find.textContaining('₹'), findsNothing);
      expect(find.textContaining('GST'), findsNothing);
    });

    testWidgets('$language: every create_ae_invoice error is shown in the app\'s words', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      api.savedProfile = uaeSavedProfile;
      await openUaeSale(tester);
      await uaeType(tester, 'uae.sale.line.0.description', 'Consulting');
      await uaeType(tester, 'uae.sale.line.0.rate', '1000');
      for (final code in ['NO_LINES', 'EMIRATE_REQUIRED', 'BAD_EMIRATE', 'BAD_TRN', 'EXCHANGE_RATE_REQUIRED', 'ZERO_AMOUNT', 'DUPLICATE_ID', 'PERIOD_LOCKED']) {
        api.forceError = {'error': code};
        await uaeTap(tester, 'uae.sale.preview');
        await uaeScrollTo(tester, 'uae.sale.problems');
        expect(find.text(s.writeError(code, currency: 'AED')), findsOneWidget, reason: code);
      }
      api.forceError = {
        'error': 'BAD_LINES',
        'problems': [
          {'line': 0, 'field': 'qty', 'why': ar ? 'الكمية رقم أكبر من صفر.' : 'The quantity is a number above zero.'},
        ],
      };
      await uaeTap(tester, 'uae.sale.preview');
      await uaeScrollTo(tester, 'uae.sale.problems');
      expect(find.text(s.writeError('BAD_LINES')), findsOneWidget);
      expect(find.text(s.lineProblem(1, s.fieldName('qty'), ar ? 'الكمية رقم أكبر من صفر.' : 'The quantity is a number above zero.')), findsOneWidget);
      expect(api.aeWrites, isEmpty);
    });

    testWidgets('$language: errors from the books themselves: no lines, zero amount, no emirate, a bad TRN, a missing rate, a locked period and a clash at confirm', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      await openUaeSale(tester, party: 'Desert Rose Interiors');
      await uaeTap(tester, 'uae.sale.preview');
      expect(api.aeProposals.last.args['lines'], isEmpty);
      expect(find.text(s.writeError('NO_LINES')), findsOneWidget);
      await uaeType(tester, 'uae.sale.line.0.description', 'Design');
      await uaeType(tester, 'uae.sale.line.0.rate', '2500');
      await uaeTap(tester, 'uae.sale.preview');
      expect(api.aeProposals.last.args.containsKey('emirate'), isFalse);
      expect(find.text(s.writeError('EMIRATE_REQUIRED')), findsOneWidget);
      await pickFromMenu(tester, 'uae.sale.emirate', emirateByCode('SHJ')!.name(ar));
      await uaeType(tester, 'uae.sale.line.0.rate', '0');
      await uaeTap(tester, 'uae.sale.preview');
      expect(find.text(s.writeError('ZERO_AMOUNT')), findsOneWidget);
      await uaeType(tester, 'uae.sale.line.0.rate', '2500');
      await uaeType(tester, 'uae.sale.trn', '000000000000000');
      await uaeTap(tester, 'uae.sale.preview');
      expect(api.aeProposals.last.args['emirate'], 'SHJ');
      expect(find.text(s.writeError('BAD_TRN')), findsOneWidget);
      await uaeType(tester, 'uae.sale.trn', '');
      await pickFromMenu(tester, 'uae.sale.currency', 'EUR');
      await uaeTap(tester, 'uae.sale.preview');
      expect(api.aeProposals.last.args.containsKey('exchangeRate'), isFalse);
      expect(find.text(s.writeError('EXCHANGE_RATE_REQUIRED', currency: 'EUR')), findsOneWidget);
      await uaeType(tester, 'uae.sale.exchangeRate', '4.01');
      api.lockedThrough = '2026-12-31';
      await uaeTap(tester, 'uae.sale.preview');
      expect(find.text(s.writeError('PERIOD_LOCKED')), findsOneWidget);
      api.lockedThrough = null;
      api.confirmFails = 'DUPLICATE_ID';
      await uaeTap(tester, 'uae.sale.preview');
      await _confirm(tester, s);
      await uaeScrollTo(tester, 'uae.sale.problems');
      expect(find.text(s.writeError('DUPLICATE_ID')), findsOneWidget);
      expect(api.aeWrites, isEmpty);
      expect(tester.takeException(), isNull);
    });

    testWidgets('$language: a TRN that is not 15 digits is caught before anything is asked', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      api.savedProfile = uaeSavedProfile;
      await openUaeSale(tester);
      await uaeType(tester, 'uae.sale.trn', '10098765430000');
      expect(find.text(s.trnLength(14)), findsOneWidget);
      await uaeType(tester, 'uae.sale.line.0.description', 'Consulting');
      await uaeType(tester, 'uae.sale.line.0.rate', '1000');
      await uaeTap(tester, 'uae.sale.preview');
      expect(api.aeProposals, isEmpty);
      await uaeScrollTo(tester, 'uae.sale.note');
      expect(_shown(tester, 'uae.sale.note'), s.trnLength(14));
      await uaeType(tester, 'uae.sale.trn', '1009876543000AB');
      expect(find.text(s.trnDigitsOnly), findsOneWidget);
    });

    testWidgets('$language: a purchase bill with reverse charge and blocked VAT books create_ae_purchase', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      await openUaeBill(tester);
      expect(find.text(s.newBillTitle), findsOneWidget);
      expect(find.text('100555666700003'), findsOneWidget);
      await fillUaeBill(tester);
      await pickFromMenu(tester, 'uae.bill.line.1.treatment', s.treatmentName('reverse-charge'));
      await uaeTap(tester, 'uae.bill.line.0.blocked');
      await uaeScrollTo(tester, 'uae.bill.total');
      expect(_shown(tester, 'uae.bill.net'), contains('6,000.00'));
      expect(_shown(tester, 'uae.bill.vat'), contains('200.00'));
      expect(_shown(tester, 'uae.bill.selfVat'), contains('100.00'));
      expect(_shown(tester, 'uae.bill.recoverable'), contains('100.00'));
      expect(_shown(tester, 'uae.bill.total'), contains('6,200.00'));
      await uaeTap(tester, 'uae.bill.preview');
      final args = api.aeProposals.last.args;
      expect(api.aeProposals.last.tool, 'create_ae_purchase');
      expect(args['partyName'], 'Emirates Office Supplies');
      expect(args['supplierTrn'], '100555666700003');
      expect(args['supplierInvoiceNo'], 'EOS-7781');
      expect(args['lang'], language);
      expect(args['lines'], [
        {'description': 'Toner', 'qty': 1, 'rate': 4000, 'treatment': 'standard', 'blocked': true},
        {'description': 'Cloud software licence', 'qty': 1, 'rate': 2000, 'treatment': 'reverse-charge'},
      ]);
      await _confirm(tester, s);
      await uaeScrollTo(tester, 'uae.bill.done');
      expect(find.text(s.billRecorded('BILL-0002')), findsOneWidget);
      expect(find.textContaining(ar ? 'تُسجّل ضريبة المدخلات المحظورة' : 'Blocked input VAT'), findsOneWidget);
      expect(api.purchases.last['id'], 'BILL-0002');
    });

    testWidgets('$language: a purchase bill maps its errors and the VAT typed from the bill', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      await openUaeBill(tester);
      await uaeType(tester, 'uae.bill.line.0.description', 'Desk');
      await uaeType(tester, 'uae.bill.line.0.rate', '1000');
      await uaeType(tester, 'uae.bill.line.0.vat', '49.50');
      await uaeScrollTo(tester, 'uae.bill.total');
      expect(_shown(tester, 'uae.bill.vat'), contains('49.50'));
      for (final code in ['NO_LINES', 'BAD_TRN', 'EXCHANGE_RATE_REQUIRED', 'ZERO_AMOUNT', 'DUPLICATE_ID', 'PERIOD_LOCKED']) {
        api.forceError = {'error': code};
        await uaeTap(tester, 'uae.bill.preview');
        await uaeScrollTo(tester, 'uae.bill.problems');
        expect(find.text(s.writeError(code, currency: 'AED')), findsOneWidget, reason: code);
      }
      api.forceError = {'error': 'BAD_LINES', 'problems': [{'line': 0, 'field': 'vat', 'why': 'x'}]};
      await uaeTap(tester, 'uae.bill.preview');
      expect(find.text(s.lineProblem(1, s.fieldName('vat'), 'x')), findsOneWidget);
      await uaeTap(tester, 'uae.bill.preview');
      expect(api.aeProposals.last.args['lines'], [
        {'description': 'Desk', 'qty': 1, 'rate': 1000, 'treatment': 'standard', 'vat': 49.5},
      ]);
      await _confirm(tester, s);
      expect(api.aeWrites.single.tool, 'create_ae_purchase');
    });

    testWidgets('$language: a credit note from a UAE invoice: reason, more than the invoice, then the whole of it, then already credited', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      await openUaeInvoice(tester);
      expect(find.text(s.invoiceTitle('INV-0002')), findsOneWidget);
      expect(find.text('Fit-out design'), findsOneWidget);
      await uaeScrollTo(tester, 'uae.invoice.total');
      expect(_shown(tester, 'uae.invoice.vat'), contains('500.00'));
      expect(_shown(tester, 'uae.invoice.total'), contains('10,500.00'));
      await uaeTap(tester, 'uae.invoice.credit');
      await tester.tap(find.byKey(const ValueKey('uae.credit.preview')));
      await tester.pumpAndSettle();
      expect(api.aeProposals.last.tool, 'create_ae_credit_note');
      expect(api.aeProposals.last.args['reason'], '');
      expect(find.text(s.writeError('REASON_REQUIRED')), findsOneWidget);
      await uaeTap(tester, 'uae.invoice.credit');
      await tester.enterText(find.byKey(const ValueKey('uae.credit.amount')), '99999');
      await tester.enterText(find.byKey(const ValueKey('uae.credit.reason')), 'Price agreed lower');
      await tester.tap(find.byKey(const ValueKey('uae.credit.preview')));
      await tester.pumpAndSettle();
      expect(find.text(s.writeError('MORE_THAN_INVOICE')), findsOneWidget);
      await uaeTap(tester, 'uae.invoice.credit');
      await tester.enterText(find.byKey(const ValueKey('uae.credit.amount')), '2100');
      await tester.enterText(find.byKey(const ValueKey('uae.credit.reason')), 'Two site visits not made');
      await tester.tap(find.byKey(const ValueKey('uae.credit.preview')));
      await tester.pumpAndSettle();
      expect(api.aeProposals.last.args, {'invoiceId': 'INV-0002', 'amount': 2100, 'date': '2026-11-14', 'reason': 'Two site visits not made', 'lang': language});
      await uaeScrollTo(tester, 'uae.credit.held');
      await _confirm(tester, s);
      await uaeScrollTo(tester, 'uae.credit.done');
      expect(find.text(s.creditRecorded('CN-0001')), findsOneWidget);
      await uaeScrollTo(tester, 'uae.invoice.left');
      expect(_shown(tester, 'uae.invoice.left'), contains('8,400.00'));
      await uaeTap(tester, 'uae.invoice.credit');
      await tester.enterText(find.byKey(const ValueKey('uae.credit.reason')), 'Contract ended');
      await tester.tap(find.byKey(const ValueKey('uae.credit.preview')));
      await tester.pumpAndSettle();
      expect(api.aeProposals.last.args.containsKey('amount'), isFalse);
      await _confirm(tester, s);
      expect(find.text(s.creditRecorded('CN-0002')), findsOneWidget);
      await uaeTap(tester, 'uae.invoice.credit');
      await tester.enterText(find.byKey(const ValueKey('uae.credit.reason')), 'Again');
      await tester.tap(find.byKey(const ValueKey('uae.credit.preview')));
      await tester.pumpAndSettle();
      expect(find.text(s.writeError('ALREADY_CREDITED')), findsOneWidget);
      api.forceError = {'error': 'INVOICE_NOT_FOUND'};
      await uaeTap(tester, 'uae.invoice.credit');
      await tester.enterText(find.byKey(const ValueKey('uae.credit.reason')), 'Again');
      await tester.tap(find.byKey(const ValueKey('uae.credit.preview')));
      await tester.pumpAndSettle();
      expect(find.text(s.writeError('INVOICE_NOT_FOUND')), findsOneWidget);
      api.forceError = {'error': 'PERIOD_LOCKED'};
      await uaeTap(tester, 'uae.invoice.credit');
      await tester.enterText(find.byKey(const ValueKey('uae.credit.reason')), 'Again');
      await tester.tap(find.byKey(const ValueKey('uae.credit.preview')));
      await tester.pumpAndSettle();
      expect(find.text(s.writeError('PERIOD_LOCKED')), findsOneWidget);
      expect(api.aeWrites.map((p) => p.tool), ['create_ae_credit_note', 'create_ae_credit_note']);
    });

    testWidgets('$language: an error code written only in the reply text is still mapped, and a reply with no code is shown as the server said it', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      api.savedProfile = uaeSavedProfile;
      await openUaeSale(tester);
      await uaeType(tester, 'uae.sale.line.0.description', 'Consulting');
      await uaeType(tester, 'uae.sale.line.0.rate', '1000');
      api.forceError = {'error': '', 'hint': 'ALREADY_CREDITED'};
      await uaeTap(tester, 'uae.sale.preview');
      expect(find.text(s.writeError('ALREADY_CREDITED')), findsOneWidget);
      api.forceError = {'error': '', 'hint': ar ? 'تعذّر الحفظ لسبب آخر.' : 'Could not save for another reason.'};
      await uaeTap(tester, 'uae.sale.preview');
      expect(find.textContaining(ar ? 'تعذّر الحفظ لسبب آخر.' : 'Could not save for another reason.'), findsOneWidget);
    });

    testWidgets('$language: the VAT return fills from the books by default and can still be typed by hand', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      await openUaeScreen(tester, 'vat');
      final first = api.queryArgs.where((c) => c.name == 'ae_vat_return').last.args;
      expect(first['fromBooks'], isTrue);
      expect(first.containsKey('lines'), isFalse);
      expect(first['lang'], ar ? 'ar' : isNull);
      expect(find.text(s.fromBooksCounts(1, 0, 1)), findsOneWidget);
      await uaeScrollTo(tester, 'uae.vat.14');
      expect(_shown(tester, 'uae.vat.14'), contains('900.00'));
      await uaeTap(tester, 'uae.vat.edit');
      expect(api.queryArgs.last.name, 'ae_vat_lines');
      expect(tester.widget<TextField>(find.byKey(const ValueKey('uae.vat.sales.DXB'))).controller!.text, '20000');
      expect(tester.widget<TextField>(find.byKey(const ValueKey('uae.vat.expenses'))).controller!.text, '2000');
      await uaeType(tester, 'uae.vat.zero', '5000');
      await uaeTap(tester, 'uae.vat.work');
      final typed = api.queryArgs.last.args;
      expect(typed.containsKey('fromBooks'), isFalse);
      expect(typed['lines'], hasLength(3));
      expect(find.byKey(const ValueKey('uae.vat.fromBooks')), findsNothing);
      await uaeTap(tester, 'uae.vat.books');
      expect(api.queryArgs.last.args['fromBooks'], isTrue);
    });

    testWidgets('$language: an expense in the UAE edition has no GST rate, shows AED and points to a purchase bill', (tester) async {
      await uaeView(tester, language: language);
      await openUaeApp(tester);
      await openNewEntry(tester, 'I paid an expense');
      expect(find.text(s.amountPaidWithVat), findsOneWidget);
      expect(find.text('AED '), findsOneWidget);
      expect(find.textContaining('GST'), findsNothing);
      expect(find.textContaining('₹'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('expense.aeBill')));
      await tester.pumpAndSettle();
      expect(find.text(s.newBillTitle), findsOneWidget);
    });

    testWidgets('$language: a new customer from the register asks for a TRN, not a GSTIN, and opens the UAE sale', (tester) async {
      await uaeView(tester, language: language);
      await openUaeApp(tester);
      await uaeHomeRow(tester, 'Sales');
      await tester.tap(find.text(s.newParty(true)));
      await tester.pumpAndSettle();
      expect(find.text(s.trnOptional), findsOneWidget);
      expect(find.textContaining('GST'), findsNothing);
      await tester.enterText(find.byType(TextField).first, 'Falcon Logistics LLC');
      await tester.enterText(find.byKey(const ValueKey('party.taxId')), '12345');
      await tester.tap(find.text(s.continueLabel));
      await tester.pumpAndSettle();
      expect(find.text(s.trnLength(5)), findsOneWidget);
      await tester.enterText(find.byKey(const ValueKey('party.taxId')), '100111222300003');
      await tester.tap(find.text(s.continueLabel));
      await tester.pumpAndSettle();
      expect(find.text(s.newSaleTitle), findsOneWidget);
      expect(find.text('Falcon Logistics LLC'), findsOneWidget);
      expect(find.text('100111222300003'), findsOneWidget);
    });
  }
}
