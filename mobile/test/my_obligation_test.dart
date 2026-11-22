import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/my/my_turnover.dart';
import 'package:myca/screens/my/my_home_screen.dart';

import 'my_support.dart';

Future<void> openHome(WidgetTester tester, MyTestApi api, {MyTurnoverStore? store, String language = 'en', DateTime? now}) async {
  final snapshot = await api.snapshot();
  await tester.pumpWidget(myApp(myState(api, turnover: store, now: now), MyHomeScreen(snapshot: snapshot), language: language));
  await settle(tester);
  await reveal(tester, find.byKey(const Key('myHome.obligation')));
}

Future<void> enterTurnover(WidgetTester tester, String annual, {String related = ''}) async {
  final open = find.byKey(const Key('myHome.enterTurnover')).evaluate().isNotEmpty ? 'myHome.enterTurnover' : 'myHome.changeTurnover';
  await tapKey(tester, open);
  await tester.enterText(find.byKey(const Key('myTurnover.annual')), annual);
  await tester.enterText(find.byKey(const Key('myTurnover.related')), related);
  await tester.tap(find.byKey(const Key('myTurnover.save')));
  await settle(tester);
}

void main() {
  setUp(() => moneyCountry = 'MY');
  tearDown(() => moneyCountry = 'IN');

  testWidgets('turnover under RM3 million is entered once, shown as exempt with the reason, and kept for next time', (tester) async {
    final api = MyTestApi();
    final store = MemoryMyTurnoverStore();
    await openHome(tester, api, store: store);
    expect(find.byKey(const Key('myHome.exemption')), findsOneWidget);
    expect(api.calls, isNot(contains('my_einvoice_required')));
    await enterTurnover(tester, '2,400,000');
    expect(api.args['my_einvoice_required'], {'annualTurnover': 2400000, 'date': '2026-10-05'});
    expect(find.byKey(const Key('myHome.obligation.exempt')), findsOneWidget);
    expect(find.text('Exempt'), findsOneWidget);
    expect(find.text('Your annual turnover of RM2,400,000 is below the RM3,000,000 exemption limit.'), findsOneWidget);
    expect(find.text('You can still send e-invoices if your buyers ask for them.'), findsOneWidget);
    expect(store.saved['Teratai Digital Sdn Bhd']!.annual, 2400000);

    await tester.pumpWidget(const SizedBox());
    api.calls.clear();
    await openHome(tester, api, store: store);
    expect(api.calls, contains('my_einvoice_required'));
    expect(find.byKey(const Key('myHome.obligation.exempt')), findsOneWidget);
    expect(find.byKey(const Key('myHome.enterTurnover')), findsNothing);
  });

  testWidgets('a related company at RM3 million or more takes the exemption away', (tester) async {
    final api = MyTestApi();
    await openHome(tester, api);
    await enterTurnover(tester, '2400000', related: '5000000');
    expect(api.args['my_einvoice_required']!['relatedCompanyTurnover'], 5000000);
    expect(find.byKey(const Key('myHome.obligation.required')), findsOneWidget);
    expect(find.text('e-Invoicing applies to you'), findsOneWidget);
    expect(find.textContaining('a related, holding or shareholder company has RM3 million or more'), findsOneWidget);
    await enterTurnover(tester, '2400000', related: '2000000');
    expect(find.byKey(const Key('myHome.obligation.exempt')), findsOneWidget);
  });

  testWidgets('turnover of RM3 million or more is required, and the turnover can be changed', (tester) async {
    final api = MyTestApi();
    await openHome(tester, api);
    await enterTurnover(tester, '4500000');
    expect(find.text('Required'), findsOneWidget);
    expect(find.text('Your annual turnover of RM4,500,000 is at or above the RM3,000,000 exemption limit.'), findsOneWidget);
    await enterTurnover(tester, '3000000');
    expect(find.byKey(const Key('myHome.obligation.required')), findsOneWidget);
    await enterTurnover(tester, '2999999.99');
    expect(find.text('Your annual turnover of RM2,999,999.99 is below the RM3,000,000 exemption limit.'), findsOneWidget);
  });

  testWidgets('before 1 September 2026 the exemption stops at RM1 million', (tester) async {
    final api = MyTestApi();
    await openHome(tester, api, now: DateTime(2026, 8, 20, 9));
    await enterTurnover(tester, '2400000');
    expect(api.args['my_einvoice_required']!['date'], '2026-08-20');
    expect(find.byKey(const Key('myHome.obligation.required')), findsOneWidget);
    expect(find.text('Your annual turnover of RM2,400,000 is at or above the RM1,000,000 exemption limit.'), findsOneWidget);
  });

  testWidgets('a turnover that is not a number or is negative is refused in the sheet', (tester) async {
    final api = MyTestApi();
    await openHome(tester, api);
    await tapKey(tester, 'myHome.enterTurnover');
    await tester.tap(find.byKey(const Key('myTurnover.save')));
    await settle(tester);
    expect(find.text('Enter the turnover in ringgit, zero or more.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('myTurnover.annual')), '-5');
    await tester.enterText(find.byKey(const Key('myTurnover.related')), 'abc');
    await tester.tap(find.byKey(const Key('myTurnover.save')));
    await settle(tester);
    expect(find.text('Enter the turnover in ringgit, zero or more.'), findsNWidgets(2));
    expect(api.calls, isNot(contains('my_einvoice_required')));
  });

  testWidgets('a failed check says so and tries again', (tester) async {
    final api = MyTestApi()..failNext['my_einvoice_required'] = 1;
    await openHome(tester, api);
    await enterTurnover(tester, '500000');
    expect(find.textContaining('Cannot reach MyCA'), findsOneWidget);
    await tester.tap(find.text('Try again'));
    await settle(tester);
    expect(find.byKey(const Key('myHome.obligation.exempt')), findsOneWidget);
  });

  testWidgets('a rule the server does not hold for the date is explained plainly', (tester) async {
    final api = MyTestApi();
    await openHome(tester, api, now: DateTime(2025, 12, 1, 9));
    await enterTurnover(tester, '500000');
    expect(find.text('MyCA has no checked e-invoice rule for that date yet.'), findsOneWidget);
    expect(find.byKey(const Key('myHome.obligation.exempt')), findsNothing);
  });

  testWidgets('the obligation card reads in Malay', (tester) async {
    final api = MyTestApi();
    await openHome(tester, api, language: 'ms');
    expect(find.text('Masukkan jualan tahunan'), findsOneWidget);
    await enterTurnover(tester, '1000000');
    expect(find.text('Dikecualikan'), findsOneWidget);
    expect(find.textContaining('di bawah had pengecualian RM3,000,000'), findsOneWidget);
  });
}
