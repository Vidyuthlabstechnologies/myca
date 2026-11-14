import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/format.dart';
import 'package:myca/growth.dart';
import 'package:myca/main.dart';
import 'package:myca/migration.dart';

import 'fake_api.dart';
import 'uk_fake_api.dart';

final indiaOnly = RegExp(r'GST|GSTIN|\bPAN\b|₹|\bTDS\b|\bTCS\b|Udyam|lakh|crore');

AppState gbFirstRun(GbFakeApi api) => AppState(
  api: api,
  store: MemoryOnboardingStore(isWelcomed: true),
  pickTextFile: (_) async => null,
  edition: 'GB',
  now: () => DateTime(2026, 11, 14, 10),
);

Set<String> shownTexts() => {
  for (final e in find.byWidgetPredicate((w) => w is Text || w is RichText || w is EditableText || w is Tooltip).evaluate())
    switch (e.widget) {
      Text(:final data, :final textSpan) => data ?? textSpan?.toPlainText() ?? '',
      RichText(:final text) => text.toPlainText(),
      EditableText(:final controller) => controller.text,
      Tooltip(:final message) => message ?? '',
      _ => '',
    },
};

Future<Set<String>> everythingOnScreen(WidgetTester tester) async {
  final seen = {...shownTexts()};
  final count = find.byType(Scrollable).evaluate().length;
  for (var n = 0; n < count; n++) {
    ScrollableState? at() {
      final all = find.byType(Scrollable).evaluate().toList();
      if (n >= all.length) return null;
      final state = (all[n] as StatefulElement).state as ScrollableState;
      return state.mounted && state.position.axis == Axis.vertical ? state : null;
    }
    final first = at();
    if (first == null) continue;
    first.position.jumpTo(0);
    await tester.pump();
    for (var i = 0; i < 80; i++) {
      final state = at();
      if (state == null || state.position.pixels >= state.position.maxScrollExtent) break;
      state.position.jumpTo((state.position.pixels + 300).clamp(0, state.position.maxScrollExtent));
      await tester.pump();
      seen.addAll(shownTexts());
    }
  }
  return seen;
}

Future<void> openFromHome(WidgetTester tester, String row) async {
  final list = find.byType(Scrollable).first;
  tester.state<ScrollableState>(list).position.jumpTo(0);
  await tester.pumpAndSettle();
  await tester.scrollUntilVisible(find.text(row).first, 200, scrollable: list, maxScrolls: 100);
  await tester.pumpAndSettle();
  await tester.tap(find.text(row).first);
  await tester.pumpAndSettle();
}

void main() {
  tearDown(() => moneyCountry = 'IN');

  testWidgets('the GB first run offers UK choices only and asks for no GSTIN', (tester) async {
    final api = GbFakeApi();
    await tester.pumpWidget(MycaApp(state: gbFirstRun(api)));
    await tester.pumpAndSettle();
    expect(find.text('Where are your books today?'), findsOneWidget);
    for (final shown in ['Excel, Google Sheets or a CSV file', 'Another bookkeeping app', 'Paper, or my accountant has them', 'Starting fresh']) {
      expect(find.text(shown), findsOneWidget, reason: shown);
    }
    for (final hidden in ['Tally', 'Zoho Books', 'QuickBooks or Xero', 'Another billing app', 'Paper, or my CA has them']) {
      expect(find.text(hidden), findsNothing, reason: hidden);
    }
    expect(find.textContaining('Vyapar'), findsNothing);
    expect(find.textContaining('Busy'), findsNothing);
    expect((await everythingOnScreen(tester)).where(indiaOnly.hasMatch), isEmpty);
    await tester.tap(find.text('Excel, Google Sheets or a CSV file'));
    await tester.pumpAndSettle();
    expect(find.text('Tell us about the business'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'GSTIN'), findsNothing);
    expect((await everythingOnScreen(tester)).where(indiaOnly.hasMatch), isEmpty);
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Bring your books across'), findsOneWidget);
    expect(find.text('Bank statement (CSV)'), findsOneWidget);
    expect(find.textContaining('Tally'), findsNothing);
    expect((await everythingOnScreen(tester)).where(indiaOnly.hasMatch), isEmpty);
  });

  test('the India, US and UAE first runs keep their choices', () {
    expect(migrationPathsFor('IN'), same(migrationPaths));
    expect(migrationPathsFor('US'), same(migrationPaths));
    expect(migrationPathsFor('AE'), same(migrationPaths));
    expect(migrationPathsFor('GB').map((p) => p.source), [BooksSource.spreadsheet, BooksSource.otherApp, BooksSource.paper, BooksSource.fresh]);
    for (final path in gbMigrationPaths) {
      expect(path.imports.map((i) => i.tool).toSet().difference({'import_bank'}), isEmpty, reason: path.title);
      expect('${path.title} ${path.subtitle} ${path.promise}', isNot(matches(indiaOnly)));
    }
  });

  test('the UK app counts as uk in the funnel, sends only when switched on, and India, US and UAE are unchanged', () async {
    expect(funnelEdition('GB'), 'uk');
    expect(funnelEdition('uk'), 'uk');
    expect(funnelEdition('US'), 'us');
    expect(funnelEdition('IN'), 'india');
    expect(funnelEdition('AE'), 'ae');
    expect(funnelEdition('MY'), 'my');
    expect(FunnelTracker(store: MemoryFunnelStore(), edition: 'AE').active, isFalse);
    final off = FunnelTracker(store: MemoryFunnelStore(), edition: 'GB');
    expect(off.edition, 'uk');
    expect(off.active, isFalse);
    final sent = <List<Map<String, Object?>>>[];
    expect(await off.reach(['signed_in'], (steps) async => sent.add(steps)), 0);
    final on = FunnelTracker(store: MemoryFunnelStore(), edition: 'GB', ukAllowed: true);
    expect(await on.reach(['signed_in', 'business_created'], (steps) async => sent.add(steps), source: 'play'), 2);
    expect(sent.single, [
      {'step': 'signed_in', 'edition': 'uk', 'source': 'play'},
      {'step': 'business_created', 'edition': 'uk', 'source': 'play'},
    ]);
    expect(FunnelTracker(store: MemoryFunnelStore(), edition: 'US', ukAllowed: true).active, isFalse);
    expect(FunnelTracker(store: MemoryFunnelStore(), edition: 'IN').active, isTrue);
  });

  test('a UK invite reads the UK way', () {
    final info = ReferralInfo.fromJson({'code': 'AB2CD3EF', 'link': null, 'invited': 0, 'converted': 0});
    expect(info.shareText(us: false, uk: true), 'I keep my books and VAT in MyCA. Get it at MyCA UK on Google Play and use my invite code AB2CD3EF when you sign up.');
    expect(info.shareText(us: false), contains('GST'));
  });

  testWidgets('the UK home has no Indian marketplace row and calls the adviser an accountant; India keeps both', (tester) async {
    useFakeDevice();
    await tester.pumpWidget(MycaApp(state: gbState(GbFakeApi()..connected = true)));
    await tester.pumpAndSettle();
    final uk = await everythingOnScreen(tester);
    expect(uk, isNot(contains('Marketplace')));
    expect(uk.where((t) => t.contains('TCS') || t.contains('GST registrations')), isEmpty);
    expect(uk, contains('Your accountant'));
    expect(uk, isNot(contains('Your CA')));
    expect(uk, isNot(contains('Employees')));
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true))));
    await tester.pumpAndSettle();
    final india = await everythingOnScreen(tester);
    expect(india, contains('Marketplace'));
    expect(india, contains('Payouts, TCS and TDS, margins by SKU, stock, GST registrations'));
    expect(india, contains('Your CA'));
  });

  testWidgets('no main GB screen a user can reach shows GST, GSTIN, PAN, ₹, TDS, TCS, Udyam, lakh or crore', (tester) async {
    await setUkView(tester, const Size(430, 932));
    useFakeDevice();
    final api = GbFakeApi()..connected = true;
    await tester.pumpWidget(MycaApp(state: gbState(api)));
    await tester.pumpAndSettle();
    final found = <String, Set<String>>{};
    void note(String where, Set<String> texts) {
      final bad = texts.where(indiaOnly.hasMatch).toSet();
      if (bad.isNotEmpty) found[where] = bad;
    }

    note('home', await everythingOnScreen(tester));
    for (final row in ['Sales', 'Purchases', 'Expenses', 'Cash', 'Bank', 'Repeating entries', 'Reports', 'Statements', 'Your accountant', 'Reminders', 'Books check']) {
      await openFromHome(tester, row);
      note(row, await everythingOnScreen(tester));
      await tester.pageBack();
      await tester.pumpAndSettle();
    }
    await openFromHome(tester, 'UK TAXES');
    note('UK taxes', await everythingOnScreen(tester));
    for (final row in ['Your details', 'Self Assessment estimate', 'VAT returns', 'Making Tax Digital for Income Tax', 'Sent to HMRC', 'Connect to HMRC']) {
      final list = find.byType(Scrollable).first;
      await tester.scrollUntilVisible(find.text(row).last, 200, scrollable: list, maxScrolls: 100);
      await tester.pumpAndSettle();
      await tester.tap(find.text(row).last);
      await tester.pumpAndSettle();
      note(row, await everythingOnScreen(tester));
      await tester.pageBack();
      await tester.pumpAndSettle();
    }
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    note('business sheet', await everythingOnScreen(tester));
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();
    for (final (entry, party) in [('I sold something', 'Acme'), ('I bought something', 'Supplier'), ('I paid an expense', ''), ('Just ask', '')]) {
      await tester.tap(find.byTooltip('New entry'));
      await tester.pumpAndSettle();
      note('new entry', await everythingOnScreen(tester));
      await tester.tap(find.text(entry));
      await tester.pumpAndSettle();
      if (party.isNotEmpty) {
        note('$entry picker', await everythingOnScreen(tester));
        await tester.enterText(find.byType(TextField).last, party);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Add “$party”'));
        await tester.pumpAndSettle();
        note('$entry new party', await everythingOnScreen(tester));
        await tester.tap(find.text('Continue'));
        await tester.pumpAndSettle();
      }
      note(entry, await everythingOnScreen(tester));
      await tester.pageBack();
      await tester.pumpAndSettle();
    }
    expect(found, isEmpty);
    expect(tester.takeException(), isNull);
  });
}
