import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';
import 'security_test.dart' show hosted, ownerWithBusiness;

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
  'ims': (t) async {
    await t.pumpWidget(MycaApp(key: UniqueKey(), state: testState(FakeMycaApi(signedIn: true)..has2b = true)));
    await t.pumpAndSettle();
    await t.tap(find.text('3 things need you'));
    await t.pumpAndSettle();
    final review = find.text('Review in IMS');
    await scrollTo(t, review);
    await t.tap(review);
    await t.pumpAndSettle();
  },
  'ims row sheet': (t) async {
    await t.pumpWidget(MycaApp(key: UniqueKey(), state: testState(FakeMycaApi(signedIn: true)..has2b = true)));
    await t.pumpAndSettle();
    await t.tap(find.text('3 things need you'));
    await t.pumpAndSettle();
    final review = find.text('Review in IMS');
    await scrollTo(t, review);
    await t.tap(review);
    await t.pumpAndSettle();
    final row = find.text('GUJARAT MILLS · GM/77');
    await scrollTo(t, row);
    await t.tap(row);
    await t.pumpAndSettle();
  },
  'ask': (t) async {
    await t.tap(find.byTooltip('Send'));
    await t.pumpAndSettle();
  },
  ...moreScreens,
};

final vertical = find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down);

Future<void> reveal(WidgetTester t, Finder what) async {
  if (what.hitTestable().evaluate().isEmpty) {
    await t.scrollUntilVisible(what, 200, scrollable: vertical.last);
  }
  await t.ensureVisible(what);
  await t.pumpAndSettle();
  await t.tap(what);
  await t.pumpAndSettle();
}

Future<void> fresh(WidgetTester t, FakeMycaApi api, {bool onboarded = true}) async {
  await t.pumpWidget(MycaApp(key: UniqueKey(), state: testState(api, onboarded: onboarded)));
  await t.pumpAndSettle();
}

Future<void> menu(WidgetTester t, String item) async {
  final (cloud, tokens) = await ownerWithBusiness();
  await t.pumpWidget(MycaApp(key: UniqueKey(), state: hosted(cloud, tokens)));
  await t.pumpAndSettle();
  await t.tap(find.byTooltip('Your business'));
  await t.pumpAndSettle();
  final row = find.text(item);
  await t.ensureVisible(row);
  await t.pumpAndSettle();
  await t.tap(row);
  await t.pumpAndSettle();
}

Future<void> customer(WidgetTester t) async {
  await tapRow(t, 'Sales');
  await t.tap(find.text('Gujarat Weaves'));
  await t.pumpAndSettle();
}

final Map<String, Walk> moreScreens = {
  'sign in': (t) async {
    await fresh(t, FakeMycaApi());
  },
  'welcome': (t) async {
    await fresh(t, FakeMycaApi(signedIn: true), onboarded: false);
  },
  'where are your books': (t) async {
    await fresh(t, FakeMycaApi(signedIn: true), onboarded: false);
    await reveal(t, find.text('Get started'));
  },
  'business setup': (t) async {
    await fresh(t, FakeMycaApi(signedIn: true), onboarded: false);
    await reveal(t, find.text('Get started'));
    await reveal(t, find.text('Tally'));
    await t.pumpAndSettle();
  },
  'bring books across': (t) async {
    await fresh(t, FakeMycaApi(signedIn: true), onboarded: false);
    await reveal(t, find.text('Get started'));
    await reveal(t, find.text('Tally'));
    await t.pumpAndSettle();
    await reveal(t, find.text('Continue'));
    await t.pumpAndSettle();
  },
  'purchases register': (t) async {
    await tapRow(t, 'Purchases');
  },
  'supplier thread': (t) async {
    await tapRow(t, 'Purchases');
    await t.tap(find.text('Fabric Co'));
    await t.pumpAndSettle();
  },
  'customer thread': (t) async {
    await customer(t);
  },
  'invoice': (t) async {
    await customer(t);
    await reveal(t, find.text('Invoice INV-0002'));
  },
  'quote': (t) async {
    await customer(t);
    await reveal(t, find.text('Quote QT-0001'));
  },
  'who did you buy from': (t) async {
    await t.tap(find.byTooltip('New entry'));
    await t.pumpAndSettle();
    await t.tap(find.text('I bought something'));
    await t.pumpAndSettle();
  },
  'what did you spend on': (t) async {
    await t.tap(find.byTooltip('New entry'));
    await t.pumpAndSettle();
    await t.tap(find.text('I paid an expense'));
    await t.pumpAndSettle();
  },
  'employees': (t) async {
    await tapRow(t, 'Employees');
  },
  'marketplace': (t) async {
    await tapRow(t, 'Marketplace');
  },
  'repeating entries': (t) async {
    await tapRow(t, 'Repeating entries');
  },
  'reports': (t) async {
    await tapRow(t, 'Reports');
  },
  'statements': (t) async {
    await tapRow(t, 'Statements');
  },
  'your ca': (t) async {
    await tapRow(t, 'Your CA');
  },
  'reminders': (t) async {
    await tapRow(t, 'Reminders');
  },
  'books check': (t) async {
    await tapRow(t, 'Books check');
  },
  'business menu, signed in': (t) async {
    final (cloud, tokens) = await ownerWithBusiness();
    await t.pumpWidget(MycaApp(key: UniqueKey(), state: hosted(cloud, tokens)));
    await t.pumpAndSettle();
    await t.tap(find.byTooltip('Your business'));
    await t.pumpAndSettle();
  },
  'people': (t) async {
    await menu(t, 'People');
  },
  'plan and billing': (t) async {
    await menu(t, 'Plan and billing');
  },
  'invite a business owner': (t) async {
    await menu(t, 'Invite a business owner');
  },
  'security': (t) async {
    await menu(t, 'Security');
  },
  'connections to banks and apps': (t) async {
    await menu(t, 'Connections to banks and apps');
  },
  'your businesses': (t) async {
    await menu(t, 'Your businesses');
  },
};
