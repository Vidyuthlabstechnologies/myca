import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_config.dart';
import 'package:myca/format.dart';
import 'package:myca/uae/uae_emirates.dart';
import 'package:myca/uae/uae_format.dart';

import 'uae_fake_api.dart';

void main() {
  tearDown(() {
    moneyCountry = 'IN';
    uaeProfile.value = null;
  });

  test('the uae flavor and MYCA_EDITION=AE pick the AE edition; IN and US stay as they were', () {
    expect(editionFor('uae', defined: ''), 'AE');
    expect(editionFor(null, defined: 'AE'), 'AE');
    expect(editionFor('india', defined: 'AE'), 'AE');
    expect(editionFor('us', defined: ''), 'US');
    expect(editionFor('india', defined: ''), 'IN');
    expect(editionFor(null, defined: ''), 'IN');
  });

  test('a UAE business reads money in dirhams with fils', () {
    moneyCountry = 'AE';
    expect(rupees(1234567.5), 'AED\u00a01,234,567.50');
    expect(rupees(-42), '-AED\u00a042.00');
    expect(compactRupees(903000).startsWith('AED'), isTrue);
    expect(compactRupees(903000).contains('₹'), isFalse);
    expect(UaeFormat(const Locale('ar')).money(1234.5).contains('1,234.50'), isTrue);
    expect(UaeFormat(const Locale('ar')).money(1234.5).contains('AED'), isTrue);
  });

  test('quarters, typed dirhams and Arabic digits', () {
    const q = UaeQuarter(2026, 1);
    expect(q.period, '2026-01/2026-03');
    expect(q.end, '2026-03-31');
    expect(q.previous.period, '2025-10/2025-12');
    expect(const UaeQuarter(2026, 4).next.period, '2027-01/2027-03');
    expect(UaeQuarter.containing(DateTime(2026, 11, 14)).previous.end, '2026-09-30');
    expect(const UaeQuarter(2024, 1).end, '2024-03-31');
    expect(parseDirhams('1,250,000.50'), 1250000.5);
    expect(parseDirhams('١٢٣٫٤٥'), 123.45);
    expect(parseDirhams(''), 0);
    expect(parseDirhams('12.345'), isNull);
    expect(parseDirhams('abc'), isNull);
    expect(UaeFormat(const Locale('en')).quarter(q), 'Jan–Mar 2026');
    expect(UaeFormat(const Locale('ar')).quarter(q), 'يناير - مارس 2026');
    expect(UaeFormat(const Locale('ar')).date('2026-04-28'), '28 أبريل 2026');
  });

  for (final language in ['en', 'ar']) {
    testWidgets('$language: Home shows UAE taxes and hides GST, TDS, Quicko and the marketplace', (tester) async {
      await uaeView(tester, language: language);
      await openUaeApp(tester);
      expect(find.byKey(const ValueKey('home.uae')), findsOneWidget);
      expect(find.text('FEDERAL AND OWNER TAXES'), findsNothing);
      expect(find.text('SALES TAX'), findsNothing);
      expect(find.text('Marketplace'), findsNothing);
      expect(find.textContaining('GST'), findsNothing);
      expect(find.textContaining('TDS'), findsNothing);
      expect(find.textContaining('₹'), findsNothing);
      final direction = Directionality.of(tester.element(find.byKey(const ValueKey('home.uae'))));
      expect(direction, language == 'ar' ? TextDirection.rtl : TextDirection.ltr);
      expect(find.text(language == 'ar' ? 'الضرائب في الإمارات' : 'UAE TAXES'), findsOneWidget);
    });

    testWidgets('$language: the UAE taxes area lists the dates from ae_deadlines', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      await openUaeTaxes(tester);
      final call = api.queryArgs.where((c) => c.name == 'ae_deadlines').toList();
      expect(call.first.args['vatPeriodEnd'], '2026-09-30');
      expect(call.first.args['ctPeriodEnd'], '2025-12-31');
      expect(call.last.args['vatPeriodEnd'], '2026-12-31');
      expect(call.last.args['ctPeriodEnd'], '2026-12-31');
      expect(find.byKey(const ValueKey('uae.deadline.vat-return')), findsOneWidget);
      expect(find.byKey(const ValueKey('uae.deadline.ct-return')), findsOneWidget);
      expect(find.byKey(const ValueKey('uae.deadline.einvoice-asp')), findsOneWidget);
      if (language == 'en') {
        expect(find.textContaining('28 January 2027'), findsOneWidget);
        expect(find.textContaining('31 March 2027 · 137 days left · For revenue under AED 50 million'), findsOneWidget);
        expect(find.textContaining('1 July 2027'), findsOneWidget);
        expect(find.textContaining('30 September 2027'), findsOneWidget);
      } else {
        expect(find.textContaining('28 يناير 2027'), findsOneWidget);
        expect(find.textContaining('31 مارس 2027 · متبقٍ 137 يومًا'), findsOneWidget);
        expect(find.text('تعيين مزوّد خدمة معتمد للفوترة الإلكترونية'), findsOneWidget);
      }
    });
  }

  testWidgets('dates that cannot be read show a retry, not a crash', (tester) async {
    await uaeView(tester);
    final api = UaeFakeApi()..failDeadlines = true;
    await openUaeApp(tester, api: api);
    await openUaeTaxes(tester);
    expect(find.text('Add your business profile and a VAT quarter to see your dates.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a profile saved on the server fills the profile form on a new start', (tester) async {
    await uaeView(tester);
    final api = UaeFakeApi()..savedProfile = {'name': 'Falcon Trading LLC', 'trn': '100123456700003', 'emirate': 'DXB', 'legalId': 'CN-1234567'};
    await openUaeApp(tester, api: api);
    await openUaeScreen(tester, 'profile');
    expect(find.text('Falcon Trading LLC'), findsWidgets);
    expect(find.text('100123456700003'), findsOneWidget);
    expect(find.text('CN-1234567'), findsOneWidget);
  });
}
