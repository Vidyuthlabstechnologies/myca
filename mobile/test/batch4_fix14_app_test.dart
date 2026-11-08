import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'accessibility_test.dart' show open, screens;
import 'fake_api.dart';
import 'ims_test.dart' show decideInSheet, openIms;

const _gujarat = '2026-10|24AAACF7856R1ZY|GM77|B2B';

ActionChip _acceptAll(WidgetTester tester) => tester.widget<ActionChip>(find.widgetWithText(ActionChip, 'Accept all matched'));

void main() {
  group('Accept all matched', () {
    testWidgets('is on while a matched invoice is not accepted, and off once every matched invoice is', (tester) async {
      final api = FakeMycaApi(signedIn: true)..has2b = true;
      await openIms(tester, testState(api));
      expect(_acceptAll(tester).onPressed, isNotNull);
      await tester.tap(find.widgetWithText(ActionChip, 'Accept all matched'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Post it'));
      await tester.pumpAndSettle();
      expect(api.imsDecisions.keys.toList(), [_gujarat]);
      expect(_acceptAll(tester).onPressed, isNull);
    });

    testWidgets('stays on when the matched invoice was rejected, because accepting would change it', (tester) async {
      final api = FakeMycaApi(signedIn: true)..has2b = true;
      await openIms(tester, testState(api));
      await decideInSheet(tester, _gujarat, 'Reject');
      await tester.tap(find.text('Post it'));
      await tester.pumpAndSettle();
      expect(api.imsDecisions[_gujarat]?['decision'], 'reject');
      expect(_acceptAll(tester).onPressed, isNotNull);
    });

    testWidgets('stays on after the preview of a decision is discarded', (tester) async {
      final api = FakeMycaApi(signedIn: true)..has2b = true;
      await openIms(tester, testState(api));
      await tester.tap(find.widgetWithText(ActionChip, 'Accept all matched'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Discard'));
      await tester.pumpAndSettle();
      expect(_acceptAll(tester).onPressed, isNotNull);
    });
  });

  group('the largest type size on a 360 dp wide phone', () {
    for (final entry in screens.entries) {
      testWidgets('${entry.key}: nothing is cut off', (tester) async {
        tester.view.physicalSize = const Size(1080, 2400);
        tester.view.devicePixelRatio = 3.0;
        tester.platformDispatcher.textScaleFactorTestValue = 2.0;
        addTearDown(tester.view.reset);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        await open(tester);
        await entry.value(tester);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  });
}
