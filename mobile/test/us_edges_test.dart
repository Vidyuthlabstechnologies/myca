import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/crash_reports.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/phone_sign_in_screen.dart';
import 'package:myca/screens/us/us_consent_screen.dart';
import 'package:myca/screens/us/us_form_editor_screen.dart';
import 'package:myca/screens/us/us_interview_screen.dart';
import 'package:myca/screens/us/us_profile_screen.dart';
import 'package:myca/screens/us/us_review_screen.dart';
import 'package:myca/screens/us/us_sign_screen.dart';
import 'package:myca/us/us_consents.dart';
import 'package:myca/us/us_filing_fee.dart';
import 'package:myca/us/us_return.dart';

import 'cloud_test.dart' show sessionOn, signedIn;
import 'fake_api.dart' show MemoryOnboardingStore;
import 'fake_cloud.dart';
import 'us_return_test.dart' show usState;
import 'us_walk.dart';
import '../tool/fonts.dart';

class FakeConsents implements UsConsents {
  bool ready = true;
  String signedAt = '';
  int lists = 0;
  MycaApiException? nextError;
  final signed = <String>[];
  final revoked = <String>[];

  UsConsentForm get form => UsConsentForm(
        document: usPartnerTinsConsent,
        version: 'v2',
        title: 'Consent to disclose your Social Security numbers to our e-file partner',
        text: 'Federal law requires this consent form be provided to you. You can choose a date after which this consent ends.',
        ready: ready,
        signedAt: signedAt,
        validUntil: signedAt.isEmpty ? '' : '2027-03-02T00:00:00.000Z',
      );

  @override
  Future<List<UsConsentForm>> list() async {
    lists += 1;
    return [form];
  }

  @override
  Future<void> sign(UsConsentForm form, {required String signedName, required String validUntil}) async {
    final error = nextError;
    nextError = null;
    if (error != null) throw error;
    signed.add('${form.document}:${form.version}:$signedName:$validUntil');
    signedAt = '2026-03-02T10:00:00.000Z';
  }

  @override
  Future<void> revoke(String document) async {
    revoked.add(document);
    signedAt = '';
  }
}

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

  testWidgets('7216: the partner view offers SSN prefill only through a signed consent, typed name, valid-until date', (tester) async {
    final api = filledApi()..route = 'partner';
    final consents = FakeConsents();
    final shared = <String>[];
    await tester.pumpWidget(MycaApp(state: usState(api, sharedText: shared)));
    await tester.pumpAndSettle();
    await openOn(tester, UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: true, paid: true, priceUsd: 99)), consents: consents));
    expect(find.textContaining('there you only add your SSN'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usSign.prefillTins')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usConsent.text')), findsOneWidget);
    expect(tester.widget<TextField>(find.byKey(const Key('usConsent.name'))).controller!.text, isEmpty, reason: 'never prefilled');
    expect(find.textContaining('March 2, 2027'), findsOneWidget, reason: 'one year from today by default');
    await tester.ensureVisible(find.byKey(const Key('usConsent.copy')));
    await tester.tap(find.byKey(const Key('usConsent.copy')));
    expect(shared, [consents.form.text]);
    await tester.ensureVisible(find.byKey(const Key('usConsent.sign')));
    await tester.tap(find.byKey(const Key('usConsent.sign')));
    await tester.pumpAndSettle();
    expect(find.text('Type your full name to sign.'), findsOneWidget);
    expect(consents.signed, isEmpty);

    consents.nextError = const MycaApiException('This consent changed.', code: 'CONSENT_CHANGED');
    await tester.enterText(find.byKey(const Key('usConsent.name')), 'Jordan Rivera');
    await tester.ensureVisible(find.byKey(const Key('usConsent.sign')));
    await tester.tap(find.byKey(const Key('usConsent.sign')));
    await tester.pumpAndSettle();
    expect(find.textContaining('just updated'), findsOneWidget);
    expect(consents.lists, 3);

    await tester.enterText(find.byKey(const Key('usConsent.name')), 'Jordan  Rivera ');
    await tester.ensureVisible(find.byKey(const Key('usConsent.sign')));
    await tester.tap(find.byKey(const Key('usConsent.sign')));
    await tester.pumpAndSettle();
    expect(consents.signed, ['us-7216-partner-tins:v2:Jordan Rivera:2027-03-02']);
    expect(find.textContaining('We pass on your name, address, Social Security numbers'), findsOneWidget);

    await tester.tap(find.byKey(const Key('usSign.prefillTins')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usConsent.signed')), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('usConsent.withdraw')));
    await tester.tap(find.byKey(const Key('usConsent.withdraw')));
    await tester.pumpAndSettle();
    expect(consents.revoked, ['us-7216-partner-tins']);
    expect(find.textContaining('there you only add your SSN'), findsOneWidget);
  });

  testWidgets('7216: a consent with blanks cannot be signed and says why', (tester) async {
    final consents = FakeConsents()..ready = false;
    await tester.pumpWidget(MycaApp(state: usState(filledApi())));
    await tester.pumpAndSettle();
    await openOn(tester, UsConsentScreen(consents: consents, document: usPartnerTinsConsent));
    expect(find.byKey(const Key('usConsent.notReady')), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byKey(const Key('usConsent.sign'))).onPressed, isNull);
  });

  testWidgets('two-step sign-in required before signing: the hint and a button to Security', (tester) async {
    final api = filledApi()..proposeFails = const MycaApiException('Turn on two-step sign-in under Security before you sign or e-file.', code: 'SECOND_STEP_REQUIRED');
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await openOn(tester, UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: false, paid: true, priceUsd: 129))));
    await tester.enterText(find.byKey(const Key('usSign.pin')), '24680');
    await tester.enterText(find.byKey(const Key('usSign.spousePin')), '13579');
    await tester.ensureVisible(find.byKey(const Key('usSign.filedLastYear')));
    await tester.tap(find.byKey(const Key('usSign.filedLastYear')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('usSign.routing')), '021000021');
    await tester.enterText(find.byKey(const Key('usSign.account')), '000123456789');
    await tester.ensureVisible(find.byKey(const Key('usSign.consent')));
    await tester.tap(find.byKey(const Key('usSign.consent')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('usSign.sign')));
    await tester.tap(find.byKey(const Key('usSign.sign')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usSign.secondStep')), findsOneWidget);
    expect(find.textContaining('two-step sign-in under Security'), findsOneWidget);
    expect(find.byKey(const Key('usSign.openSecurity')), findsOneWidget);
  });

  testWidgets('the fee line is read by screen readers as one sentence with launch and list price', (tester) async {
    final semantics = tester.ensureSemantics();
    final api = filledApi()..efile = 'signed';
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await openOn(tester, UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: true, paid: false, priceUsd: 99, listPriceUsd: 129, checkout: 'card'))));
    expect(find.byKey(const Key('usFee.line')), findsOneWidget);
    expect(tester.getSemantics(find.byKey(const Key('usFee.line'))).label, contains('Filing fee for your 2025 return: \$99 launch price, list price \$129, paid once.'));
    semantics.dispose();
  });

  testWidgets('Delete my account is in the US account sheet, asks first, then erases and signs out', (tester) async {
    final cloud = FakeCloud();
    final tokens = MemoryTokenStore();
    final session = await signedIn(cloud, tokens);
    await session.setName('Jordan');
    final state = AppState(cloud: sessionOn(cloud, tokens), store: MemoryOnboardingStore(isWelcomed: true), pickTextFile: (_) async => null, now: () => DateTime(2026, 3, 2, 10), edition: 'US');
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('usSetup.first')), 'Jordan');
    await tester.enterText(find.byKey(const Key('usSetup.last')), 'Rivera');
    await tester.tap(find.byKey(const Key('usSetup.continue')));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Your account'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usAccount.consent')), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('usAccount.delete')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usAccount.delete')));
    await tester.pumpAndSettle();
    expect(find.text('Delete your account?'), findsOneWidget);
    await tester.tap(find.text('Keep my account'));
    await tester.pumpAndSettle();
    expect(cloud.accountDeleted, isFalse);
    await tester.tap(find.byTooltip('Your account'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('usAccount.delete')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usAccount.delete')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usAccount.confirmDelete')));
    await tester.pumpAndSettle();
    expect(cloud.accountDeleted, isTrue);
    expect(find.text('Your 2025 federal return'), findsNothing);
  });

  testWidgets('the US privacy notice crash line names Social Security numbers, not GSTINs', (tester) async {
    final cloud = FakeCloud()..noticeAccepted = false;
    final tokens = MemoryTokenStore();
    await signedIn(cloud, tokens);
    await tester.pumpWidget(MycaApp(state: AppState(cloud: sessionOn(cloud, tokens), store: MemoryOnboardingStore(isWelcomed: true), pickTextFile: (_) async => null, edition: 'US')));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const ValueKey('consent.crashReports')), 200, scrollable: find.byType(Scrollable).first);
    expect(find.textContaining('Social Security numbers and phone numbers removed'), findsOneWidget);
    expect(find.textContaining('GSTIN'), findsNothing);
  });

  for (final (device, scale) in [(usDevices[0], 2.0), (usDevices[3], 1.0), (usDevices[6], 2.0)]) {
    testWidgets('every US screen lays out on a ${device.name} at ${scale}x text with no overflow', (tester) async {
      final problems = await walkUs(tester, device, scale);
      expect(problems, isEmpty, reason: problems.join('\n'));
    });
  }
}
