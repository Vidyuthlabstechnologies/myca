import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/india/india_strings.dart';
import 'package:myca/screens/counter_sale_screen.dart';

import 'counter_sale_test.dart' show CounterApi, FakePrinter;
import 'fake_api.dart';

void main() {
  testWidgets('on a Hindi phone the counter says in Hindi how the bill was paid', (tester) async {
    final api = CounterApi();
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('hi', 'IN'),
      supportedLocales: indiaLocales,
      localizationsDelegates: indiaLocalizationsDelegates,
      home: AppScope(
        state: testState(api),
        child: CounterSaleScreen(scan: (_) async => '8901063010031', printer: FakePrinter()),
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('counter-scan')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('counter-pay-upi')));
    await tester.tap(find.byKey(const Key('counter-pay-upi')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('counter-make')));
    await tester.tap(find.byKey(const Key('counter-make')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('counter-post')));
    await tester.tap(find.byKey(const Key('counter-post')));
    await tester.pumpAndSettle();
    final message = tester.widget<Text>(find.byKey(const Key('counter-message'))).data!;
    expect(message, isNot(contains('Paid by')));
    expect(message, contains(inLine('hi', 'Paid by {mode}.').replaceAll('{mode}', inLine('hi', 'UPI'))));
  });
}
