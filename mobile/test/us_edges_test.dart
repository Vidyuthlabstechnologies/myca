import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/crash_reports.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/phone_sign_in_screen.dart';
import 'package:myca/screens/us/us_form_editor_screen.dart';
import 'package:myca/screens/us/us_interview_screen.dart';
import 'package:myca/screens/us/us_profile_screen.dart';
import 'package:myca/screens/us/us_review_screen.dart';
import 'package:myca/screens/us/us_sign_screen.dart';
import 'package:myca/us/us_filing_fee.dart';
import 'package:myca/us/us_return.dart';

import 'cloud_test.dart' show sessionOn;
import 'fake_api.dart' show MemoryOnboardingStore;
import 'fake_cloud.dart';
import 'us_return_test.dart' show usState;
import 'us_walk.dart';
import '../tool/fonts.dart';

Future<void> openOn(WidgetTester tester, Widget screen) async {
  tester.state<NavigatorState>(find.byType(Navigator).first).push(MaterialPageRoute<void>(builder: (_) => screen));
  await tester.pumpAndSettle();
}

Future<void> smallPhone(WidgetTester tester, {double scale = 1}) async {
  tester.view.physicalSize = const Size(640, 1136);
  tester.view.devicePixelRatio = 2;
  tester.platformDispatcher.textScaleFactorTestValue = scale;
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  addTearDown(tester.view.reset);
}

void main() {
  setUpAll(loadFonts);
  test('US phone numbers are read as 10-digit NANP numbers and sent as +1', () {
    expect(usPhoneNumber('(415) 555-0123'), '+14155550123');
    expect(usPhoneNumber('1 415 555 0123'), '+14155550123');
    expect(usPhoneNumber('415-555-012'), isNull);
    expect(usPhoneNumber('015 555 0123'), isNull);
    expect(usPhoneNumber('415 155 0123'), isNull);
  });

  testWidgets('US sign-in shows +1, refuses a short number, and sends +1XXXXXXXXXX', (tester) async {
    final cloud = FakeCloud();
    await tester.pumpWidget(MycaApp(state: AppState(cloud: sessionOn(cloud, MemoryTokenStore()), store: MemoryOnboardingStore(isWelcomed: true), pickTextFile: (_) async => null, edition: 'US')));
    await tester.pumpAndSettle();
    expect(find.text('+1  '), findsOneWidget);
    expect(find.text('+91  '), findsNothing);
    await tester.enterText(find.byType(TextField), '415 555');
    await tester.tap(find.text('Send code'));
    await tester.pumpAndSettle();
    expect(find.textContaining('10-digit US phone number'), findsOneWidget);
    expect(cloud.requestedPhones, isEmpty);
    await tester.enterText(find.byType(TextField), '(415) 555-0123');
    await tester.tap(find.text('Send code'));
    await tester.pumpAndSettle();
    expect(cloud.requestedPhones, ['+14155550123']);
    expect(find.text('Enter the code'), findsOneWidget);
  });

  testWidgets('the India app keeps +91', (tester) async {
    final cloud = FakeCloud();
    await tester.pumpWidget(MycaApp(state: AppState(cloud: sessionOn(cloud, MemoryTokenStore()), store: MemoryOnboardingStore(isWelcomed: true), pickTextFile: (_) async => null)));
    await tester.pumpAndSettle();
    expect(find.text('+91  '), findsOneWidget);
  });

  testWidgets('About you offline: no blank form that could overwrite saved details; Try again loads it', (tester) async {
    final api = filledApi()..failing.add('us_taxpayer');
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await openOn(tester, const UsProfileScreen(taxYear: walkYear));
    expect(find.text(offline), findsOneWidget);
    expect(find.byKey(const Key('usProfile.save')), findsNothing);
    api.failing.clear();
    await tester.tap(find.byKey(const Key('usLoadError.retry')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usLoadError')), findsNothing);
    expect(find.text('Jordan'), findsOneWidget);
    expect(find.text('Alexandra'), findsOneWidget);
  });

  testWidgets('Review and questions offline offer Try again', (tester) async {
    final api = filledApi()..failing.addAll(['us_return_review', 'us_interview']);
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await openOn(tester, const UsReviewScreen(taxYear: walkYear));
    expect(find.text(offline), findsOneWidget);
    api.failing.remove('us_return_review');
    await tester.tap(find.byKey(const Key('usLoadError.retry')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usReview.result')), findsOneWidget);
    tester.state<NavigatorState>(find.byType(Navigator).first).pop();
    await tester.pumpAndSettle();
    await openOn(tester, const UsInterviewScreen(taxYear: walkYear));
    expect(find.text(offline), findsOneWidget);
    api.failing.clear();
    await tester.tap(find.byKey(const Key('usLoadError.retry')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usLoadError')), findsNothing);
  });

  testWidgets('hub offline shows the reason and a Try again button', (tester) async {
    final api = filledApi()..failing.add('us_return_status');
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    expect(find.text(offline), findsOneWidget);
    api.failing.clear();
    await tester.tap(find.byKey(const Key('usLoadError.retry')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usHub.summary')), findsOneWidget);
  });

  testWidgets('before e-file opens, Sign and e-file says so and offers no payment or send button', (tester) async {
    final api = filledApi()..efile = 'signed';
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await openOn(tester, UsSignScreen(taxYear: walkYear, fees: WalkFees(UsFilingFee.fromJson({'enforced': false, 'paid': true, 'filingOpen': false}, walkYear))));
    expect(find.byKey(const Key('usSign.notOpen')), findsOneWidget);
    expect(find.textContaining('nothing has been charged'), findsOneWidget);
    expect(find.byKey(const Key('usSign.prepare')), findsNothing);
    expect(find.byKey(const Key('usFee.card')), findsNothing);
  });

  testWidgets('partner route before e-file opens: no partner button', (tester) async {
    final api = filledApi()..route = 'partner';
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await openOn(tester, UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: true, paid: false, priceUsd: 99, filingOpen: false))));
    expect(find.byKey(const Key('usSign.notOpen')), findsOneWidget);
    expect(find.byKey(const Key('usSign.partner')), findsNothing);
  });

  testWidgets('the launch price says what it usually costs', (tester) async {
    final fee = UsFilingFee.fromJson({'taxYear': 2026, 'enforced': true, 'paid': false, 'priceUsd': 99, 'listPriceUsd': 129, 'productId': 'myca_us_1040'}, 2026);
    expect(fee.launchPrice, isTrue);
    expect(usFilingFeeLine(fee), contains('\$99, paid once. That is our launch price for this season; it is usually \$129.'));
    expect(UsFilingFee.fromJson({'priceUsd': 99, 'listPriceUsd': 129, 'purchased': true}, 2026).launchPrice, isFalse);
    expect(UsFilingFee.fromJson({'priceUsd': 129, 'listPriceUsd': 129}, 2026).launchPrice, isFalse);
    expect(UsFilingFee.fromJson({}, 2026).filingOpen, isTrue);

    final api = filledApi()..efile = 'signed';
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await openOn(tester, UsSignScreen(taxYear: 2026, fees: WalkFees(fee)));
    expect(find.textContaining('usually \$129'), findsOneWidget);
  });

  testWidgets('a blocked return lists what to fix on Sign and e-file', (tester) async {
    final api = filledApi()
      ..checks = [
        {'code': 'DEP_SSN', 'message': 'Alexandra needs a Social Security number.', 'fix': 'Add it under About you.', 'step': 'profile', 'level': 'error'},
      ];
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await openOn(tester, UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: false, paid: true, priceUsd: 129))));
    expect(find.byKey(const Key('usSign.blocked')), findsOneWidget);
    expect(find.text('Alexandra needs a Social Security number.'), findsOneWidget);
    expect(find.byKey(const Key('usSign.pin')), findsNothing);
  });

  testWidgets('tax owed shows the full due date for the tax year', (tester) async {
    final api = filledApi()
      ..owed = 812
      ..refund = 0;
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await openOn(tester, const UsReviewScreen(taxYear: walkYear));
    expect(find.textContaining('Due by April 15, 2026.'), findsOneWidget);
  });

  testWidgets('on a small phone with large text the account menu scrolls to Sign out', (tester) async {
    await smallPhone(tester, scale: 2);
    await tester.pumpWidget(MycaApp(state: usState(filledApi())));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Your account'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('usAccount.signOut')), 100, scrollable: find.descendant(of: find.byKey(const Key('usHub.accountMenu')), matching: find.byType(Scrollable)));
    await tester.ensureVisible(find.byKey(const Key('usAccount.signOut')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usAccount.signOut')).hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('form boxes keep the box number as the label and the full name as help text', (tester) async {
    await smallPhone(tester, scale: 2);
    await tester.pumpWidget(MycaApp(state: usState(filledApi())));
    await tester.pumpAndSettle();
    await openOn(tester, UsFormEditorScreen(taxYear: walkYear, kind: builtInFormKinds.firstWhere((k) => k.kind == '1099-B')));
    expect(find.text('Box 1d'), findsOneWidget);
    expect(find.text('Proceeds'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  test('crash reports remove US Social Security numbers, phone numbers and dollar amounts', () {
    final clean = scrubCrashText(r'SSN 123-45-6789 phone (415) 555-0123 or 415-555-0123 owes $4,812.33');
    expect(clean, isNot(contains('6789')));
    expect(clean, isNot(contains('555')));
    expect(clean, isNot(contains('4,812')));
    expect(clean, contains('[SSN]'));
    expect(clean, contains('[PHONE]'));
  });

  for (final (device, scale) in [(usDevices[0], 2.0), (usDevices[3], 1.0), (usDevices[6], 2.0)]) {
    testWidgets('every US screen lays out on a ${device.name} at ${scale}x text with no overflow', (tester) async {
      final problems = await walkUs(tester, device, scale);
      expect(problems, isEmpty, reason: problems.join('\n'));
    });
  }
}
