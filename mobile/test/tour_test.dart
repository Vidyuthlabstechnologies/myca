import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';
import 'package:myca_design/myca_design.dart' show Bahi;

import 'fake_api.dart';

Future<void> settle(WidgetTester tester) async {
  await tester.pumpAndSettle();
  await tester.pump(const Duration(seconds: 4));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the tour runs a sale end to end on sample books and then starts setup', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    final state = testState(api, onboarded: false);
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();

    expect(find.byType(Bahi), findsOneWidget);
    await tester.tap(find.text('Take a 2-minute tour first'));
    await settle(tester);

    expect(find.textContaining('Namaste!'), findsOneWidget);
    expect(find.text('Nalanda Textiles LLP'), findsOneWidget);
    expect(find.text('Bahi · 1 of 11'), findsOneWidget);

    await tester.tap(find.text('Show me around'));
    await settle(tester);
    expect(find.textContaining('day at a glance'), findsOneWidget);

    await tester.tap(find.text('Next').last);
    await settle(tester);
    expect(find.textContaining('log a sale'), findsOneWidget);

    await tester.tap(find.text('Show me'));
    await settle(tester);
    expect(find.textContaining('Type an amount'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Amount before GST'), '8000');
    await tester.tap(find.widgetWithText(ActionChip, '18%'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Preview'));
    await settle(tester);
    expect(find.textContaining('only a preview'), findsOneWidget);

    await tester.tap(find.text('Post it'));
    await settle(tester);
    expect(find.textContaining('Posted!'), findsOneWidget);

    await tester.tap(find.text('Next').last);
    await settle(tester);
    expect(find.text('Taxes and filings'), findsOneWidget);

    for (var step = 0; step < 4; step++) {
      await tester.tap(find.text('Next').last);
      await settle(tester);
    }
    expect(find.textContaining('Ready to set up your own books'), findsOneWidget);

    await tester.tap(find.text('Start my books'));
    await settle(tester);
    expect(state.welcomed, isTrue);
    expect(find.textContaining('Namaste!'), findsNothing);
    expect(api.confirmed, isEmpty);
    expect(api.proposals, isEmpty, reason: 'the sample sale never reaches the real books');
    expect(api.sent, isEmpty, reason: 'no tour message is sent to the real assistant');
    expect(api.uploads, isEmpty, reason: 'no sample file is uploaded');
    expect(api.companyUpdates, isEmpty, reason: 'the sample business never renames the real one');
  });

  testWidgets('the coach steps aside while the keyboard is open, so the field being typed in stays visible', (tester) async {
    final state = testState(FakeMycaApi(signedIn: true), onboarded: false);
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Take a 2-minute tour first'));
    await settle(tester);
    await tester.tap(find.text('Show me around'));
    await settle(tester);
    await tester.tap(find.text('Next').last);
    await settle(tester);
    await tester.tap(find.text('Show me'));
    await settle(tester);

    final say = find.textContaining('Type an amount');
    AnimatedOpacity coachFade() => tester.widget<AnimatedOpacity>(find.ancestor(of: say, matching: find.byType(AnimatedOpacity)).first);
    IgnorePointer coachTaps() => tester.widget<IgnorePointer>(find.ancestor(of: say, matching: find.byType(IgnorePointer)).first);
    expect(coachFade().opacity, 1);
    expect(coachTaps().ignoring, isFalse);

    tester.view.viewInsets = const FakeViewPadding(bottom: 800);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    expect(coachFade().opacity, 0);
    expect(coachTaps().ignoring, isTrue);
    expect(find.semantics.byLabel(RegExp('Type an amount')), findsNothing);

    tester.view.resetViewInsets();
    await tester.pumpAndSettle();
    expect(coachFade().opacity, 1);
    expect(coachTaps().ignoring, isFalse);
  });

  testWidgets('ending the tour early leaves the welcome screen as it was', (tester) async {
    final state = testState(FakeMycaApi(signedIn: true), onboarded: false);
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Take a 2-minute tour first'));
    await settle(tester);
    await tester.tap(find.text('End tour'));
    await settle(tester);
    expect(state.welcomed, isFalse);
    expect(find.text('Get started'), findsOneWidget);
  });

  testWidgets('the US edition welcome has no India sample tour', (tester) async {
    final state = AppState(
      api: FakeMycaApi(signedIn: true),
      store: MemoryOnboardingStore(isWelcomed: false, isMigrated: false),
      pickTextFile: (_) async => null,
      edition: 'US',
    );
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    expect(find.text('Get started'), findsOneWidget);
    expect(find.text('Take a 2-minute tour first'), findsNothing);
  });
}
