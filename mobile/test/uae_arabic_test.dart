import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/registers.dart';
import 'package:myca/uae/uae_emirates.dart';
import 'package:myca/uae/uae_strings.dart';

import 'uae_cloud_walks.dart';
import 'uae_fake_api.dart';
import 'uae_walks.dart';

final _arabic = RegExp(r'[؀-ۿ]');

final _allowed = RegExp(
  r'MyCA|EmaraTax|PINT\s?AE|VAT\s?201|\bAED ?[\d.,]*\d[KM]?\b|\bAED\b|\b[A-Z]{2,5}(-\d+)+\b|\b(DXB|AUH|SHJ|AJM|UAQ|RAK|FUJ)\b|\bYYYY-MM-DD\b|\b\d{1,2}[a-g]\b|^[A-Z]$',
);

const _bookData = [
  'Al Noor Trading LLC',
  'Gulf Star General Trading LLC',
  'Desert Rose Interiors',
  'Emirates Office Supplies',
  'Consulting, August',
  'Consulting, November',
  'Fit-out design',
  'Site visits',
  'Printer paper',
  'Export freight',
  'Toner',
  'Cloud software licence',
  'Office rent',
  'Taxi fares',
  'Other expenses',
  'Rent',
  'Expenses this quarter',
];

final _serverText = RegExp(
  r'VAT for \d{4}-\d{2}|Gujarat Weaves|Fabric Co|Rajesh|Pay rent|Airtel|Ganga Mills|bill-78\.jpg|NEFT CR|IPP FABRIC|SMS CHARGES|INT PD|Sales by customer|Firm Admin|Tax of AED|Invoice to Gulf Star|From 1 April 2026|usually pays|average of|before head-by-head|Every entry has a matching|Your books tie|This is only what has been recorded|Supplier payments are not recorded|thing needs you now|cannot go in the VAT return|Bill from Ganga|On 1 invoice|Customers owe you|Same amount on the same day|Locked the books|\d UTC|As at \d|^Posted ',
);

final _email = RegExp(r'[\w.+-]+@[\w-]+\.[\w.-]+');

List<String> _english(Iterable<String> shown) => [
  for (final text in shown)
    if (!_arabic.hasMatch(text) && !_serverText.hasMatch(text))
      if (RegExp('[A-Za-z]').hasMatch([..._bookData, ...uaeCloudData].fold(text, (left, data) => left.replaceAll(data, '')).replaceAll(_email, '').replaceAll(_allowed, ''))) text,
];

void main() {
  tearDown(() {
    moneyCountry = 'IN';
    uaeProfile.value = null;
  });

  for (final screen in uaeScreenWalks.entries) {
    testWidgets('ar: ${screen.key} in the UAE edition shows no English', (tester) async {
      await uaeView(tester, language: 'ar');
      final api = await openUaeApp(tester);
      await screen.value(tester, api);
      expect(tester.takeException(), isNull);
      final english = _english(await uaeEveryText(tester));
      expect(english, isEmpty, reason: '${screen.key} shows: ${english.join(' | ')}');
    });
  }

  for (final walk in uaeCloudWalks.entries) {
    testWidgets('ar: ${walk.key} in the UAE edition shows no English', (tester) async {
      await uaeView(tester, language: 'ar');
      await walk.value(tester);
      expect(tester.takeException(), isNull);
      final english = _english(await uaeEveryText(tester));
      expect(english, isEmpty, reason: '${walk.key} shows: ${english.join(' | ')}');
    });
  }

  test('the allowlist keeps brand names, IDs, emirates and amounts and nothing else', () {
    expect(_english(['MyCA', 'EmaraTax', 'PINT AE', 'VAT 201', 'INV-0001', 'BILL-0001', 'DXB', 'AED 1,050.00', '100123456700003', '2026-11-14', 'G']), isEmpty);
    expect(_english(['Sales', 'New entry', 'Paid', 'Your CA', 'Due today']), hasLength(5));
  });

  for (final language in ['en', 'ar']) {
    testWidgets('$language: the accountant screens never say CA or chartered', (tester) async {
      await uaeView(tester, language: language);
      await openUaeApp(tester);
      final s = UaeStrings(language == 'ar');
      final ca = RegExp(r'\bCA\b|chartered|محاسب قانوني', caseSensitive: false);
      List<String> said(Iterable<String> shown) => [for (final text in shown) if (ca.hasMatch(text.replaceAll('MyCA', ''))) text];
      expect(said(await uaeEveryText(tester)), isEmpty);
      await uaeHomeRow(tester, s.yourAccountant);
      expect(find.text(s.yourAccountant), findsWidgets);
      expect(find.text(s.accountantSees), findsOneWidget);
      expect(said(await uaeEveryText(tester)), isEmpty);
      await tester.tap(find.text('INV-0002 · Desert Rose Interiors'));
      await tester.pumpAndSettle();
      expect(find.text(s.accountantStatus('answered').toUpperCase()), findsOneWidget);
      expect(said(await uaeEveryText(tester)), isEmpty);
      uaeMockClipboard(tester);
      await tester.tap(find.text(s.copyToSend));
      await tester.pumpAndSettle();
      expect(find.text(s.copiedForAccountant), findsOneWidget);
      expect(said(await uaeEveryText(tester)), isEmpty);
    });
  }

  for (final language in ['en', 'ar']) {
    testWidgets('$language: the deadlines request carries the language and the card reads in it', (tester) async {
      await uaeView(tester, language: language);
      final api = await openUaeApp(tester);
      await openUaeTaxes(tester);
      final calls = api.queryArgs.where((c) => c.name == 'ae_deadlines').toList();
      expect(calls, isNotEmpty);
      for (final call in calls) {
        expect(call.args['lang'], language == 'ar' ? 'ar' : isNull);
      }
      final s = UaeStrings(language == 'ar');
      expect(find.text(s.comingUp.toUpperCase()), findsOneWidget);
      expect(find.text(s.vatReturnDue), findsOneWidget);
      expect(find.text(s.ctReturnDue), findsOneWidget);
      if (language == 'ar') {
        expect(_english(await uaeEveryText(tester)), isEmpty);
      }
    });
  }

  testWidgets('ar: a payment on a customer reads in Arabic up to the confirm bar', (tester) async {
    await uaeView(tester, language: 'ar');
    await openUaeApp(tester);
    const s = UaeStrings(true);
    await openRegister(tester, RegisterKind.sales);
    await tester.tap(find.text('Desert Rose Interiors').last);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ActionChip, s.paymentChip(true)));
    await tester.pumpAndSettle();
    expect(find.text(s.paymentTitle(true)), findsOneWidget);
    expect(find.text(s.amountReceivedOrPaid(true)), findsOneWidget);
    await uaeTapFound(tester, find.widgetWithText(FilledButton, s.preview));
    expect(find.text(s.receivedSaid(rupees(10500), 'bank', 'INV-0002')), findsOneWidget);
    expect(find.text(s.postIt), findsOneWidget);
    expect(find.text(s.discard), findsOneWidget);
    expect(find.text(s.notPostedYet), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('the fake deadlines answer in Arabic when asked', () async {
    final api = UaeFakeApi();
    Future<List<String>> whats(Map<String, Object?> extra) async {
      final answer = await api.query('ae_deadlines', {'today': '2026-11-14', 'vatPeriodEnd': '2026-09-30', 'ctPeriodEnd': '2025-12-31', 'revenue': 1000000, ...extra});
      final items = ((answer as Map)['data'] as Map)['items'] as List;
      return [for (final item in items) '${(item as Map)['what']}'];
    }

    final arabic = await whats({'lang': 'ar'});
    expect(arabic, hasLength(4));
    for (final what in arabic) {
      expect(what, matches(_arabic));
    }
    expect(arabic, contains('إقرار ضريبة الشركات والسداد عبر إمارات تاكس'));
    final english = await whats({});
    expect(english, contains('Corporate Tax return and payment on EmaraTax'));
    expect(english.where(_arabic.hasMatch), isEmpty);
  });

  testWidgets('switching to Arabic on the taxes screen asks for the dates again in Arabic', (tester) async {
    await uaeView(tester, language: 'en');
    final api = await openUaeApp(tester);
    await openUaeTaxes(tester);
    final before = api.queryArgs.where((c) => c.name == 'ae_deadlines').length;
    tester.platformDispatcher.localesTestValue = [const Locale('ar', 'AE')];
    await tester.pumpAndSettle();
    final after = api.queryArgs.where((c) => c.name == 'ae_deadlines').toList();
    expect(after.length, greaterThan(before));
    expect(after.last.args['lang'], 'ar');
    expect(find.text(const UaeStrings(true).vatReturnDue), findsOneWidget);
  });
}
