import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/screens/my/my_tax_screen.dart';

import 'my_support.dart';

void main() {
  setUp(() => moneyCountry = 'MY');
  tearDown(() => moneyCountry = 'IN');

  testWidgets('a resident YA2025 estimate caps a relief, takes off PCB and says it is not yet reviewed', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MyTaxScreen()));
    await settle(tester);
    expect(find.textContaining('Prepared in MyCA, you file in MyTax'), findsOneWidget);
    expect(find.textContaining('does not e-file'), findsOneWidget);
    await typeKey(tester, 'myTax.employment', '80,000');
    await tapKey(tester, 'myTax.reliefs');
    await typeKey(tester, 'myTax.lifestyle', '5000');
    await typeKey(tester, 'myTax.pcb', '3000');
    await tapKey(tester, 'myTax.estimate');
    expect(find.byKey(const Key('myTax.result')), findsOneWidget);
    expect(find.text('You still have RM535.00 to pay'), findsOneWidget);
    expect(find.text('Allowed RM2,500.00 of the RM2,500.00 cap'), findsOneWidget);
    expect(find.text('RM68,500.00'), findsOneWidget);
    expect(find.text('RM3,535.00'), findsWidgets);
    await reveal(tester, find.text('Not yet reviewed by a Malaysian tax agent.'));
    expect(find.text('Not yet reviewed by a Malaysian tax agent.'), findsOneWidget);
    final sent = api.args['my_tax_estimate']!;
    expect(sent['yearOfAssessment'], '2025');
    expect((sent['reliefs'] as Map)['lifestyle'], 5000);
  });

  testWidgets('a low income gets the RM400 rebate and an overpaid PCB shows a refund', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MyTaxScreen()));
    await settle(tester);
    await typeKey(tester, 'myTax.employment', '40000');
    await typeKey(tester, 'myTax.pcb', '1000');
    await tapKey(tester, 'myTax.estimate');
    expect(find.text('You should get RM920.00 back'), findsOneWidget);
    expect(find.text('-RM400.00'), findsOneWidget);
  });

  testWidgets('no income is caught before asking MyCA', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MyTaxScreen()));
    await settle(tester);
    await tapKey(tester, 'myTax.estimate');
    expect(find.text('Enter at least one income.'), findsOneWidget);
    await typeKey(tester, 'myTax.employment', 'abc');
    await tapKey(tester, 'myTax.estimate');
    expect(find.text('Enter an amount of zero or more.'), findsOneWidget);
    expect(api.calls, isNot(contains('my_tax_estimate')));
  });

  testWidgets('a year of assessment without checked figures says so', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MyTaxScreen()));
    await settle(tester);
    await pickOption(tester, 'myTax.year', '2026');
    await typeKey(tester, 'myTax.employment', '80000');
    await tapKey(tester, 'myTax.estimate');
    expect(find.text('MyCA has no checked figures for that year of assessment yet.'), findsOneWidget);
    expect(find.byKey(const Key('myTax.result')), findsNothing);
  });

  testWidgets('a non-resident is taxed at the flat rate with no reliefs', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MyTaxScreen()));
    await settle(tester);
    await tapKey(tester, 'myTax.resident');
    expect(find.byKey(const Key('myTax.reliefs')), findsNothing);
    await typeKey(tester, 'myTax.employment', '100000');
    await tapKey(tester, 'myTax.estimate');
    expect(find.text('You still have RM30,000.00 to pay'), findsOneWidget);
    expect(find.textContaining('Form M'), findsOneWidget);
    expect(api.args['my_tax_estimate']!['resident'], false);
  });

  testWidgets('an estimate that cannot reach MyCA can be tried again', (tester) async {
    final api = MyTestApi()..failNext['my_tax_estimate'] = 1;
    await tester.pumpWidget(myApp(myState(api), const MyTaxScreen()));
    await settle(tester);
    await typeKey(tester, 'myTax.employment', '40000');
    await tapKey(tester, 'myTax.estimate');
    expect(find.textContaining('Cannot reach MyCA'), findsOneWidget);
    await tester.tap(find.text('Try again'));
    await settle(tester);
    expect(find.byKey(const Key('myTax.result')), findsOneWidget);
  });

  testWidgets('the estimator reads in Malay and still says it is not e-filed', (tester) async {
    await tester.pumpWidget(myApp(myState(MyTestApi()), const MyTaxScreen(), language: 'ms'));
    await settle(tester);
    expect(find.text('Anggaran cukai pendapatan'), findsOneWidget);
    expect(find.textContaining('anda failkan dalam MyTax'), findsOneWidget);
  });
}
