import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/uae/uae_emirates.dart';

import 'uae_fake_api.dart';
import 'uae_walks.dart';

String _shown(WidgetTester tester, String key) => (tester.widget<Text>(find.byKey(ValueKey(key)))).data ?? '';

void main() {
  tearDown(() {
    moneyCountry = 'IN';
    uaeProfile.value = null;
  });

  for (final language in ['en', 'ar']) {
    final ar = language == 'ar';

    testWidgets('$language: VAT 201 for the last quarter shows every box from ae_vat_return, the due date and the EmaraTax note', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      await openUaeScreen(tester, 'vat');
      expect(find.byKey(const ValueKey('uae.vat.quarter')), findsOneWidget);
      expect(_shown(tester, 'uae.vat.quarter'), ar ? 'يوليو - سبتمبر 2026' : 'Jul–Sep 2026');
      expect(api.queryArgs.last.args['period'], '2026-07/2026-09');
      expect(api.queryArgs.last.args['lines'], isEmpty);
      await fillVatQuarter(tester);
      final lines = api.queryArgs.last.args['lines'] as List;
      expect(lines, containsAll([
        {'kind': 'supply', 'treatment': 'standard', 'emirate': 'DXB', 'net': 200000},
        {'kind': 'supply', 'treatment': 'standard', 'emirate': 'AUH', 'net': 50000.5},
        {'kind': 'supply', 'treatment': 'zero-rated', 'net': 30000},
        {'kind': 'supply', 'treatment': 'exempt', 'net': 1000},
        {'kind': 'expense', 'treatment': 'standard', 'net': 80000},
        {'kind': 'expense', 'treatment': 'reverse-charge', 'net': 10000},
      ]));
      expect(lines, hasLength(6));
      for (final box in ['1a', '1b', '1c', '1d', '1e', '1f', '1g', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']) {
        await uaeScrollTo(tester, 'uae.box.$box.amount');
        expect(find.byKey(ValueKey('uae.box.$box.amount')), findsOneWidget, reason: 'box $box');
      }
      for (final emirate in emirates) {
        expect(find.textContaining(emirate.name(ar)), findsWidgets);
      }
      await uaeScrollTo(tester, 'uae.vat.14');
      expect(_shown(tester, 'uae.vat.12'), contains('13,000.03'));
      expect(_shown(tester, 'uae.vat.13'), contains('4,500.00'));
      expect(_shown(tester, 'uae.vat.14'), contains('8,500.03'));
      expect(_shown(tester, 'uae.vat.14'), contains('AED'));
      expect(find.text(ar ? 'الضريبة المستحقة الدفع عن الفترة' : 'Payable tax for the period'), findsOneWidget);
      await uaeScrollTo(tester, 'uae.vat.emaratax');
      expect(find.textContaining(ar ? 'إمارات تاكس' : 'EmaraTax'), findsWidgets);
      await uaeScrollTo(tester, 'uae.vat.due');
      expect(find.text(ar ? 'تاريخ الاستحقاق 28 أكتوبر 2026' : 'Due 28 October 2026'), findsOneWidget);
      expect(Directionality.of(tester.element(find.byKey(const ValueKey('uae.vat.12')))), ar ? TextDirection.rtl : TextDirection.ltr);
      expect(find.textContaining('₹'), findsNothing);
    });

    testWidgets('$language: corporate tax estimate sends every field and shows 9% above AED 375,000 with losses', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      await openUaeScreen(tester, 'ct');
      await fillCt(tester);
      final args = api.queryArgs.last.args;
      expect(api.queryArgs.last.name, 'ae_ct_estimate');
      expect(args['periodStart'], '2026-01-01');
      expect(args['periodEnd'], '2026-12-31');
      expect(args['revenue'], 5000000);
      expect(args['accountingProfit'], 900000);
      expect(args['lossesBroughtForward'], 100000);
      expect(args['electSmallBusinessRelief'], false);
      expect(args['qualifyingFreeZonePerson'], false);
      await uaeScrollTo(tester, 'uae.ct.due');
      expect(_shown(tester, 'uae.ct.taxable'), contains('800,000.00'));
      expect(_shown(tester, 'uae.ct.tax'), contains('38,250.00'));
      expect(_shown(tester, 'uae.ct.lossUsed'), contains('100,000.00'));
      expect(_shown(tester, 'uae.ct.lossCarried'), contains('0.00'));
      expect(_shown(tester, 'uae.ct.relief'), ar ? 'لا يوجد' : 'None');
      expect(_shown(tester, 'uae.ct.due'), ar ? '30 سبتمبر 2027' : '30 September 2027');
    });

    testWidgets('$language: Small Business Relief and Qualifying Free Zone Person', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      await openUaeScreen(tester, 'ct');
      await uaeType(tester, 'uae.ct.revenue', '2500000');
      await uaeType(tester, 'uae.ct.profit', '600000');
      await uaeTap(tester, 'uae.ct.sbr');
      await uaeTap(tester, 'uae.ct.work');
      expect(api.queryArgs.last.args['electSmallBusinessRelief'], true);
      await uaeScrollTo(tester, 'uae.ct.relief');
      expect(_shown(tester, 'uae.ct.relief'), ar ? 'الإعفاء للأعمال الصغيرة' : 'Small Business Relief');
      expect(_shown(tester, 'uae.ct.payable'), contains('0.00'));
      await uaeTap(tester, 'uae.ct.sbr');
      await uaeTap(tester, 'uae.ct.qfzp');
      await uaeType(tester, 'uae.ct.qualifying', '400000');
      await uaeTap(tester, 'uae.ct.work');
      expect(api.queryArgs.last.args['qualifyingFreeZonePerson'], true);
      expect(api.queryArgs.last.args['qualifyingIncome'], 400000);
      await uaeScrollTo(tester, 'uae.ct.relief');
      expect(_shown(tester, 'uae.ct.relief'), ar ? 'شخص مؤهل في منطقة حرة' : 'Qualifying Free Zone Person');
      expect(_shown(tester, 'uae.ct.tax'), contains('18,000.00'));
    });

    testWidgets('$language: the business profile checks the TRN and saves only after confirmation', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      await openUaeScreen(tester, 'profile');
      await uaeType(tester, 'uae.profile.trn', '12345');
      await uaeTap(tester, 'uae.profile.checkTrn');
      expect(find.text(ar ? 'الرقم الضريبي غير صحيح' : 'The TRN is not right'), findsOneWidget);
      expect(find.text('A TRN has 15 digits; this one has 5.'), findsOneWidget);
      await fillProfile(tester);
      expect(find.text(ar ? 'صيغة الرقم الضريبي صحيحة' : 'The TRN is well formed'), findsOneWidget);
      expect(find.textContaining('TIN 1001234567'), findsOneWidget);
      await uaeTap(tester, 'uae.profile.preview');
      expect(find.text(ar ? 'اختر إمارة المنشأة الرئيسية.' : 'Choose the emirate of the main establishment.'), findsOneWidget);
      expect(api.aeProposals, isEmpty);
      await uaeTap(tester, 'uae.profile.emirate');
      await tester.tap(find.text(ar ? 'الشارقة' : 'Sharjah').last);
      await tester.pumpAndSettle();
      await uaeType(tester, 'uae.profile.licence', 'CN-1234567');
      await uaeTap(tester, 'uae.profile.freeZone');
      await uaeType(tester, 'uae.profile.freeZoneName', 'SAIF Zone');
      await uaeTap(tester, 'uae.profile.preview');
      final proposal = api.aeProposals.single;
      expect(proposal.tool, 'set_ae_business_profile');
      expect(proposal.args, containsPair('trn', '100123456700003'));
      expect(proposal.args, containsPair('emirate', 'SHJ'));
      expect(proposal.args, containsPair('nameAr', 'النور للتجارة ذ.م.م'));
      expect(proposal.args, containsPair('freeZone', true));
      expect(proposal.args, containsPair('freeZoneName', 'SAIF Zone'));
      expect(api.savedProfile, isNull);
      expect(find.text(ar ? 'لم يُحفظ بعد' : 'Not saved yet'), findsOneWidget);
      await tester.tap(find.text(ar ? 'تأكيد' : 'Confirm'));
      await tester.pumpAndSettle();
      expect(api.savedProfile, isNotNull);
      expect(uaeProfile.value?['emirate'], 'SHJ');
      expect(find.text(ar ? 'تم الحفظ.' : 'Saved.'), findsOneWidget);
    });

    testWidgets('$language: an invalid TRN is blocked by the backend and nothing is saved', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      await openUaeScreen(tester, 'profile');
      await uaeType(tester, 'uae.profile.trn', '1001234');
      await uaeTap(tester, 'uae.profile.emirate');
      await tester.tap(find.text(ar ? 'دبي' : 'Dubai').last);
      await tester.pumpAndSettle();
      await uaeTap(tester, 'uae.profile.preview');
      expect(find.text(ar ? 'لم يتم' : 'Not done'), findsOneWidget);
      expect(find.textContaining('A TRN has 15 digits'), findsOneWidget);
      expect(api.savedProfile, isNull);
    });

    testWidgets('$language: an e-invoice lists its problems, then checks clean and is issued in the sandbox after confirmation', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      await openUaeScreen(tester, 'einvoice');
      expect(find.byKey(const ValueKey('uae.einvoice.sandbox')), findsOneWidget);
      await uaeTap(tester, 'uae.einvoice.check');
      await uaeScrollTo(tester, 'uae.einvoice.problems');
      expect(find.text('${ar ? 'رقم الفاتورة' : 'Invoice number'}: The invoice number is required and must be unique.'), findsOneWidget);
      expect(find.textContaining('${ar ? 'ملف المنشأة' : 'Business profile'}: Save the business profile first'), findsOneWidget);
      expect(find.text('${ar ? 'الاسم القانوني للمشتري' : 'Buyer\'s legal name'}: The registered legal name is required.'), findsOneWidget);
      expect(find.textContaining('buyer.'), findsNothing);
      expect(find.byKey(const ValueKey('uae.einvoice.issue')), findsNothing);
      api.savedProfile = {'name': 'Al Noor Trading LLC'};
      await fillEinvoice(tester);
      await uaeTap(tester, 'uae.einvoice.check');
      final sent = api.queryArgs.last.args;
      expect((sent['buyer'] as Map)['trn'], '100987654300003');
      expect(((sent['lines'] as List).single as Map)['taxCategory'], 'S');
      await uaeScrollTo(tester, 'uae.einvoice.total');
      expect(_shown(tester, 'uae.einvoice.tax'), contains('600.00'));
      expect(_shown(tester, 'uae.einvoice.total'), contains('12,600.00'));
      await uaeTap(tester, 'uae.einvoice.issue');
      expect(api.aeProposals.single.tool, 'issue_ae_einvoice');
      expect(api.issued, isEmpty);
      await tester.tap(find.text(ar ? 'تأكيد' : 'Confirm'));
      await tester.pumpAndSettle();
      expect(api.issued, hasLength(1));
      await uaeScrollTo(tester, 'uae.einvoice.issued');
      expect(find.textContaining('INV-2026-0042'), findsWidgets);
      expect(find.textContaining('UUID 3f2a9c1e-4b7d'), findsOneWidget);
    });

    testWidgets('$language: zero-rated and exempt e-invoice lines carry no VAT and a reason', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      api.savedProfile = {'name': 'Al Noor Trading LLC'};
      await openUaeScreen(tester, 'einvoice');
      await fillEinvoice(tester);
      await uaeTap(tester, 'uae.einvoice.category.Z');
      await uaeTap(tester, 'uae.einvoice.check');
      final line = ((api.queryArgs.last.args['lines'] as List).single as Map);
      expect(line['taxCategory'], 'Z');
      expect(line['exemptionReason'], isNotEmpty);
      await uaeScrollTo(tester, 'uae.einvoice.total');
      expect(_shown(tester, 'uae.einvoice.tax'), contains('0.00'));
    });
  }

  testWidgets('bad typed amounts are refused before anything is asked', (tester) async {
    await uaeView(tester);
    final api = await openUaeApp(tester);
    await openUaeScreen(tester, 'vat');
    await uaeTap(tester, 'uae.vat.edit');
    final before = api.queryArgs.length;
    await uaeType(tester, 'uae.vat.sales.DXB', '12.345');
    await uaeTap(tester, 'uae.vat.work');
    expect(api.queryArgs.length, before);
    expect(find.text('Enter amounts in dirhams, for example 1250000.50.'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await uaeTap(tester, 'uae.open.ct');
    await uaeType(tester, 'uae.ct.end', '2026-13-45');
    await uaeTap(tester, 'uae.ct.work');
    expect(find.byKey(const ValueKey('uae.ct.note')), findsOneWidget);
    await uaeType(tester, 'uae.ct.end', '2026-12-31');
    await uaeType(tester, 'uae.ct.revenue', '-5');
    await uaeTap(tester, 'uae.ct.work');
    expect(find.text('Enter amounts in dirhams, for example 1250000.50.'), findsOneWidget);
    expect(api.queryArgs.where((c) => c.name == 'ae_ct_estimate'), isEmpty);
  });

  testWidgets('a refund quarter says refundable and the quarter cannot move past the current one', (tester) async {
    await uaeView(tester);
    final api = await openUaeApp(tester);
    await openUaeScreen(tester, 'vat');
    await uaeTap(tester, 'uae.vat.next');
    expect(api.queryArgs.last.args['period'], '2026-10/2026-12');
    expect(tester.widget<IconButton>(find.byKey(const ValueKey('uae.vat.next'))).onPressed, isNull);
    await uaeTap(tester, 'uae.vat.previous');
    await uaeTap(tester, 'uae.vat.previous');
    expect(api.queryArgs.last.args['period'], '2026-04/2026-06');
    await uaeTap(tester, 'uae.vat.edit');
    await uaeType(tester, 'uae.vat.expenses', '100000');
    await uaeTap(tester, 'uae.vat.work');
    await uaeScrollTo(tester, 'uae.vat.14');
    expect(find.text('Refundable tax for the period'), findsOneWidget);
    expect(_shown(tester, 'uae.vat.14'), contains('5,000.00'));
    expect(_shown(tester, 'uae.vat.14').contains('-'), isFalse);
    await uaeScrollTo(tester, 'uae.vat.warnings');
    expect(find.textContaining('Box 14 is a refund position'), findsOneWidget);
  });
}
