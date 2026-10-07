import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

Future<void> back(WidgetTester tester) async {
  await tester.pageBack();
  await tester.pumpAndSettle();
}

void main() {
  for (final scale in [1.5, 2.0]) {
    testWidgets('the main screens fit at ${scale}x text size', (tester) async {
      tester.view.physicalSize = const Size(1080, 2280);
      tester.view.devicePixelRatio = 2.75;
      addTearDown(tester.view.reset);
      tester.platformDispatcher.textScaleFactorTestValue = scale;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final api = FakeMycaApi(signedIn: true);
      await tester.pumpWidget(MycaApp(state: testState(api)));
      await tester.pumpAndSettle();
      expect(
        MediaQuery.of(tester.element(find.text('3 things need you'))).textScaler.scale(10),
        10 * scale,
      );

      await tester.tap(find.text('3 things need you'));
      await tester.pumpAndSettle();
      await back(tester);

      for (final row in [
        'Sales',
        'Purchases',
        'Expenses',
        'Employees',
        'Cash',
        'Your CA',
        'Reminders',
        'Books check',
      ]) {
        await tapRow(tester, row);
        await back(tester);
      }

      await tester.fling(
        find.byType(Scrollable).first,
        const Offset(0, 4000),
        4000,
      );
      await tester.pumpAndSettle();
      await tapRow(tester, 'Sales');
      await tester.tap(find.text('Gujarat Weaves'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Invoice INV-0002'));
      await tester.pumpAndSettle();
      await back(tester);
      await back(tester);
      await back(tester);

      await tester.tap(find.byTooltip('New entry'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('I sold something'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  }
}
