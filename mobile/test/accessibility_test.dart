import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

typedef Walk = Future<void> Function(WidgetTester tester);

Future<void> phone(WidgetTester tester, {double textScale = 1.0}) async {
  tester.view.physicalSize = const Size(1080, 2280);
  tester.view.devicePixelRatio = 2.75;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
}

Future<void> open(WidgetTester tester, {bool empty = false}) async {
  await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true, emptyBooks: empty))));
  await tester.pumpAndSettle();
}

Future<void> scrollTo(WidgetTester tester, Finder what) async {
  await tester.scrollUntilVisible(what, 200, scrollable: find.byType(Scrollable).last);
  await tester.ensureVisible(what);
  await tester.pumpAndSettle();
}

final Map<String, Walk> screens = {
  'home': (t) async {},
  'home, first day': (t) async {
    await open(t, empty: true);
  },
  'business menu': (t) async {
    await t.tap(find.byTooltip('Your business'));
    await t.pumpAndSettle();
  },
  'what happened': (t) async {
    await t.tap(find.byTooltip('New entry'));
    await t.pumpAndSettle();
  },
  'who did you sell to': (t) async {
    await t.tap(find.byTooltip('New entry'));
    await t.pumpAndSettle();
    await t.tap(find.text('I sold something'));
    await t.pumpAndSettle();
  },
  'customer thread with the sale form': (t) async {
    await tapRow(t, 'Sales');
    await t.tap(find.text('Gujarat Weaves'));
    await t.pumpAndSettle();
    await t.tap(find.widgetWithText(ActionChip, 'Sale'));
    await t.pumpAndSettle();
  },
  'sales register': (t) async {
    await tapRow(t, 'Sales');
  },
  'taxes': (t) async {
    await t.tap(find.text('3 things need you'));
    await t.pumpAndSettle();
  },
  'review the return': (t) async {
    await t.tap(find.text('3 things need you'));
    await t.pumpAndSettle();
    final review = find.text('Review the October 2026 return');
    await scrollTo(t, review);
    await t.tap(review);
    await t.pumpAndSettle();
  },
  'expenses': (t) async {
    await tapRow(t, 'Expenses');
  },
  'expense form': (t) async {
    await tapRow(t, 'Expenses');
    await t.tap(find.text('Other expenses'));
    await t.pumpAndSettle();
    await t.tap(find.widgetWithText(ActionChip, 'Expense'));
    await t.pumpAndSettle();
  },
  'cash': (t) async {
    await tapRow(t, 'Cash');
  },
  'who to pay': (t) async {
    await tapRow(t, 'Cash');
    await scrollTo(t, find.text('Who to pay'));
    await t.tap(find.text('Who to pay'));
    await t.pumpAndSettle();
  },
  'ask': (t) async {
    await t.tap(find.byTooltip('Send'));
    await t.pumpAndSettle();
  },
};

void main() {
  for (final entry in screens.entries) {
    testWidgets('${entry.key}: every tap target is big enough and labelled, and text has enough contrast', (tester) async {
      await phone(tester);
      await open(tester);
      await entry.value(tester);
      final handle = tester.ensureSemantics();
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      handle.dispose();
    });

    testWidgets('${entry.key}: at the largest type size nothing overflows', (tester) async {
      await phone(tester, textScale: 2.0);
      await open(tester);
      await entry.value(tester);
      final error = tester.takeException();
      expect(error, isNull, reason: 'overflow or layout error at text scale 2.0: $error');
    });
  }
}
