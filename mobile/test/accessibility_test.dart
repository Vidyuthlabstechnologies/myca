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
  'home with MSME card': (t) async {
    final card = find.byKey(const ValueKey('home.msme'));
    await t.scrollUntilVisible(card, 200, scrollable: find.byType(Scrollable).first);
    await t.pumpAndSettle();
    await t.ensureVisible(card);
    await t.pumpAndSettle();
  },
  'supplier terms sheet': (t) async {
    await tapRow(t, 'Purchases');
    await t.tap(find.text('Fabric Co'));
    await t.pumpAndSettle();
    await t.tap(find.widgetWithText(ActionChip, 'Supplier terms'));
    await t.pumpAndSettle();
    await t.tap(find.widgetWithText(SwitchListTile, 'MSME supplier'));
    await t.pumpAndSettle();
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
  'audit trail': (t) async {
    await tapRow(t, 'Reports');
    await t.tap(find.text('Audit trail'));
    await t.pumpAndSettle();
  },
  'taxes': (t) async {
    await t.tap(find.text('3 things need you'));
    await t.pumpAndSettle();
  },
  'form 26as check': (t) async {
    await t.tap(find.text('3 things need you'));
    await t.pumpAndSettle();
    final row = find.text('Form 26AS check');
    await scrollTo(t, row);
    await t.tap(row);
    await t.pumpAndSettle();
  },
  'tds withheld sheet': (t) async {
    await tapRow(t, 'Sales');
    await t.tap(find.text('Gujarat Weaves'));
    await t.pumpAndSettle();
    await t.tap(find.widgetWithText(ActionChip, 'TDS withheld'));
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
  'bank': (t) async {
    await tapRow(t, 'Bank');
  },
  'bank line sheet': (t) async {
    await tapRow(t, 'Bank');
    final line = find.text('NEFT CR GUJARAT WEAVES INV0002');
    await scrollTo(t, line);
    await t.tap(line);
    await t.pumpAndSettle();
  },
  'record a transfer': (t) async {
    await tapRow(t, 'Bank');
    final chip = find.text('Record a transfer');
    await scrollTo(t, chip);
    await t.tap(chip);
    await t.pumpAndSettle();
  },
  'bank, two years of lines': (t) async {
    await tapRow(t, 'Bank');
    final older = find.text('Show older');
    await scrollTo(t, older);
    await t.tap(older);
    await t.pumpAndSettle();
  },
  'bank, no statement yet': (t) async {
    await t.pumpWidget(MycaApp(key: UniqueKey(), state: testState(FakeMycaApi(signedIn: true)..bankLines.clear())));
    await t.pumpAndSettle();
    await tapRow(t, 'Bank');
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
