import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/screens/counter_sale_screen.dart';

import 'counter_sale_test.dart' show CounterApi, FakePrinter;
import 'fake_api.dart';

Future<CounterApi> _billReady(WidgetTester tester, {String code = '8901063010031'}) async {
  final api = CounterApi();
  api.known['TV55'] = {'found': true, 'sku': 'TV55', 'name': 'LED TV 55', 'price': 50000, 'gstRate': 18, 'hsn': '8528'};
  await tester.pumpWidget(MaterialApp(
    home: AppScope(
      state: testState(api),
      child: CounterSaleScreen(scan: (_) async => code, printer: FakePrinter()),
    ),
  ));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const Key('counter-scan')));
  await tester.pumpAndSettle();
  return api;
}

Future<void> _make(WidgetTester tester) async {
  await tester.ensureVisible(find.byKey(const Key('counter-make')));
  await tester.tap(find.byKey(const Key('counter-make')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('typing the buyer GSTIN after Make bill drops the preview, so the bill posted carries the GSTIN', (tester) async {
    final api = await _billReady(tester);
    await _make(tester);
    expect(find.byKey(const Key('counter-post')), findsOneWidget);
    expect(api.proposals.last.args.containsKey('partyGstin'), isFalse);

    await tester.enterText(find.byKey(const Key('counter-gstin')), '27AAPFU0939F1ZV');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('counter-post')), findsNothing);
    expect(find.byKey(const Key('counter-make')), findsOneWidget);

    await _make(tester);
    expect(api.proposals.last.args['partyGstin'], '27AAPFU0939F1ZV');
    expect(api.confirmed, isEmpty);
  });

  testWidgets('changing the buyer address after Make bill drops the preview of a large bill', (tester) async {
    final api = await _billReady(tester, code: 'TV55');
    await tester.enterText(find.byKey(const Key('counter-customer')), 'Meera Rao');
    await tester.enterText(find.byKey(const Key('counter-address')), '12 MG Road, Pune');
    await _make(tester);
    expect(find.byKey(const Key('counter-post')), findsOneWidget);

    await tester.enterText(find.byKey(const Key('counter-address')), '12 MG Road, Pune, Maharashtra 411001');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('counter-post')), findsNothing);

    await _make(tester);
    expect(api.proposals.last.args['partyAddress'], '12 MG Road, Pune, Maharashtra 411001');
  });
}
