import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/screens/my/my_sst_screen.dart';

import 'my_support.dart';

void main() {
  setUp(() => moneyCountry = 'MY');
  tearDown(() => moneyCountry = 'IN');

  testWidgets('an SST-02 for the period due soon adds service tax, sales tax and the card flat rate', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MySstScreen()));
    await settle(tester);
    expect(find.text('Sep 2026 – Oct 2026'), findsOneWidget);
    await typeKey(tester, 'mySst.line0.value', '10000');
    await tapKey(tester, 'mySst.addLine');
    await tapKey(tester, 'mySst.line1.kind.sales');
    await typeKey(tester, 'mySst.line1.value', '5,000');
    await tapKey(tester, 'mySst.addLine');
    await pickOption(tester, 'mySst.line2.category', 'Credit and charge cards');
    await typeKey(tester, 'mySst.line2.cards', '3');
    await tapKey(tester, 'mySst.prepare');
    expect(find.byKey(const Key('mySst.result')), findsOneWidget);
    expect(find.text('RM800.00'), findsWidgets);
    expect(find.text('RM500.00'), findsWidgets);
    expect(find.text('RM75.00'), findsOneWidget);
    expect(find.text('RM1,375.00'), findsOneWidget);
    expect(find.text('Due 30/11/2026'), findsOneWidget);
    expect(find.text('56 days left'), findsOneWidget);
    expect(find.textContaining('You file this in MySST'), findsOneWidget);
    expect(find.text('Not yet reviewed by a Malaysian tax agent.'), findsOneWidget);
    final sent = api.args['my_sst_return']!;
    expect(sent['period'], '2026-09/2026-10');
    final lines = (sent['lines'] as List).cast<Map>();
    expect(lines[0]['date'], '2026-10-31');
    expect(lines[1]['rateBasisPoints'], 1000);
    expect(lines[2]['cards'], 3);
  });

  testWidgets('a badly written date and a date outside the period are caught before preparing', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MySstScreen()));
    await settle(tester);
    await typeKey(tester, 'mySst.line0.value', '100');
    await typeKey(tester, 'mySst.line0.date', '2026-10-31');
    await tapKey(tester, 'mySst.prepare');
    expect(find.text('Write the date as dd/mm/yyyy.'), findsOneWidget);
    await typeKey(tester, 'mySst.line0.date', '15/08/2026');
    await tapKey(tester, 'mySst.prepare');
    expect(find.text('The date must be inside the taxable period.'), findsOneWidget);
    await typeKey(tester, 'mySst.line0.value', '-5');
    await typeKey(tester, 'mySst.line0.date', '15/09/2026');
    await tapKey(tester, 'mySst.prepare');
    expect(find.text('Enter an amount of zero or more.'), findsOneWidget);
    expect(api.calls, isNot(contains('my_sst_return')));
  });

  testWidgets('an SST-02 that cannot reach MyCA says so and prepares on the retry', (tester) async {
    final api = MyTestApi()..failNext['my_sst_return'] = 1;
    await tester.pumpWidget(myApp(myState(api), const MySstScreen()));
    await settle(tester);
    await typeKey(tester, 'mySst.line0.value', '1000');
    await tapKey(tester, 'mySst.prepare');
    expect(find.textContaining('Cannot reach MyCA'), findsOneWidget);
    await tester.tap(find.text('Try again'));
    await settle(tester);
    expect(find.byKey(const Key('mySst.result')), findsOneWidget);
    expect(find.text('RM80.00'), findsWidgets);
  });

  testWidgets('an earlier period can be chosen and its due date follows', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MySstScreen()));
    await settle(tester);
    await pickOption(tester, 'mySst.period', 'Jul 2026 – Aug 2026');
    await typeKey(tester, 'mySst.line0.value', '1000');
    await tapKey(tester, 'mySst.prepare');
    expect(find.text('Due 30/09/2026'), findsOneWidget);
    expect(find.text('5 days overdue'), findsOneWidget);
  });

  testWidgets('the registration check says when a business must register and when it need not yet', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MySstScreen(startOnRegistration: true)));
    await settle(tester);
    await typeKey(tester, 'mySstReg.value', '600000');
    await tapKey(tester, 'mySstReg.check');
    expect(find.text('You must register for SST'), findsOneWidget);
    expect(find.text('RM500,000.00'), findsOneWidget);
    await pickOption(tester, 'mySstReg.category', 'Food and beverage');
    await typeKey(tester, 'mySstReg.value', '1200000');
    await tapKey(tester, 'mySstReg.check');
    expect(find.text('You do not need to register yet'), findsOneWidget);
    expect(find.text('RM1,500,000.00'), findsOneWidget);
    expect(find.text('Not yet reviewed by a Malaysian tax agent.'), findsOneWidget);
    expect(api.args['my_sst_registration']!['category'], 'food-and-beverage');
    await typeKey(tester, 'mySstReg.value', 'lots');
    await tapKey(tester, 'mySstReg.check');
    expect(find.text('Enter an amount of zero or more.'), findsOneWidget);
  });

  testWidgets('the SST screen reads in Malay', (tester) async {
    await tester.pumpWidget(myApp(myState(MyTestApi()), const MySstScreen(), language: 'ms'));
    await settle(tester);
    expect(find.textContaining('SST'), findsWidgets);
    expect(find.text('Perkhidmatan bercukai lain'), findsOneWidget);
  });
}
