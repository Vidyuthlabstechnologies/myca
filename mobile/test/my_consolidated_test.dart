import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/screens/my/my_consolidated_screen.dart';

import 'my_support.dart';

void main() {
  setUp(() => moneyCountry = 'MY');
  tearDown(() => moneyCountry = 'IN');

  test('only months that have ended are offered', () {
    expect(endedMonths(DateTime(2026, 10, 5)), ['2026-09', '2026-08', '2026-07']);
    expect(endedMonths(DateTime(2026, 1, 3)), ['2025-12', '2025-11', '2025-10']);
  });

  testWidgets('the monthly consolidated e-invoice is previewed, confirmed and sent to the general public', (tester) async {
    final api = MyTestApi();
    final state = myState(api, now: DateTime(2026, 10, 5, 10, 30));
    await tester.pumpWidget(myApp(state, const MyConsolidatedScreen()));
    await settle(tester);
    expect(find.text('Sep 2026'), findsOneWidget);
    await typeKey(tester, 'myCons.line0.amount', '8,640.50');
    await typeKey(tester, 'myCons.line0.largest', '1,250');
    await typeKey(tester, 'myCons.line0.receipts', 'R0001-R0420');
    await tapKey(tester, 'myCons.send');
    expect(find.text('Send the consolidated e-invoice to LHDN?'), findsOneWidget);
    expect(find.textContaining('LHDN expects it by 2026-10-07'), findsOneWidget);
    expect(find.text('RM8,640.50'), findsWidgets);
    await tester.tap(find.byKey(const Key('myCons.confirm')));
    await settle(tester);
    expect(find.text('e-Invoice CONS-202609'), findsOneWidget);
    final sent = api.args['propose:issue_my_consolidated_einvoice']!;
    expect(sent['month'], '2026-09');
    expect(sent.containsKey('acknowledgeLate'), isFalse);
    final line = (sent['lines'] as List).single as Map;
    expect(line['amount'], 8640.5);
    expect(line['largestTransaction'], 1250);
    expect(line['receipts'], 'R0001-R0420');
    expect(line['description'], 'Sales to the general public');
    expect(api.books.malaysia.einvoices.first['kind'], 'consolidated');
  });

  testWidgets('a receipt above RM10,000 is refused and the largest receipt cannot exceed the total', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MyConsolidatedScreen()));
    await settle(tester);
    await typeKey(tester, 'myCons.line0.amount', '500');
    await typeKey(tester, 'myCons.line0.largest', '900');
    await tapKey(tester, 'myCons.send');
    expect(find.text('The largest receipt cannot be more than the total.'), findsOneWidget);
    expect(api.calls, isNot(contains('propose:issue_my_consolidated_einvoice')));
    await typeKey(tester, 'myCons.line0.amount', '48000');
    await typeKey(tester, 'myCons.line0.largest', '12000');
    await tapKey(tester, 'myCons.send');
    expect(find.byKey(const Key('myCons.problems')), findsOneWidget);
    expect(find.textContaining('a transaction above RM10,000 needs its own e-invoice'), findsOneWidget);
  });

  testWidgets('a late month asks for the reason, then sends it with the late flag', (tester) async {
    final api = MyTestApi();
    api.books.clock = () => DateTime(2026, 10, 20, 9);
    await tester.pumpWidget(myApp(myState(api, now: DateTime(2026, 10, 20, 9)), const MyConsolidatedScreen()));
    await settle(tester);
    await typeKey(tester, 'myCons.line0.amount', '3000');
    await typeKey(tester, 'myCons.line0.largest', '400');
    await tapKey(tester, 'myCons.send');
    expect(find.textContaining('within 7 days after the month ends'), findsWidgets);
    expect(find.byKey(const Key('myCons.lateReason')), findsOneWidget);
    await tapKey(tester, 'myCons.send');
    expect(find.text('Say why it is late.'), findsOneWidget);
    await typeKey(tester, 'myCons.lateReason', 'Point-of-sale export failed');
    await tapKey(tester, 'myCons.send');
    expect(find.textContaining('This is late'), findsOneWidget);
    await tester.tap(find.byKey(const Key('myCons.confirm')));
    await settle(tester);
    final sent = api.args['propose:issue_my_consolidated_einvoice']!;
    expect(sent['acknowledgeLate'], true);
    expect(sent['lateReason'], 'Point-of-sale export failed');
  });

  testWidgets('a network failure after confirming keeps the preview and the retry sends once', (tester) async {
    final api = MyTestApi()..failNext['confirm'] = 1;
    await tester.pumpWidget(myApp(myState(api), const MyConsolidatedScreen()));
    await settle(tester);
    await typeKey(tester, 'myCons.line0.amount', '2000');
    await typeKey(tester, 'myCons.line0.largest', '300');
    await tapKey(tester, 'myCons.send');
    await tester.tap(find.byKey(const Key('myCons.confirm')));
    await settle(tester);
    expect(find.textContaining('Cannot reach MyCA'), findsOneWidget);
    await tapKey(tester, 'myCons.send');
    expect(api.calls.where((call) => call == 'propose:issue_my_consolidated_einvoice'), hasLength(1));
    expect(api.confirms, 2);
    expect(api.books.malaysia.einvoices.where((row) => row['number'] == 'CONS-202609'), hasLength(1));
  });

  testWidgets('the consolidated screen reads in Malay', (tester) async {
    await tester.pumpWidget(myApp(myState(MyTestApi()), const MyConsolidatedScreen(), language: 'ms'));
    await settle(tester);
    expect(find.text('e-Invois disatukan bulanan'), findsOneWidget);
    expect(find.text('Semak dan hantar ke LHDN'), findsOneWidget);
  });
}
