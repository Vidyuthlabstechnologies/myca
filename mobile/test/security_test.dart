import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/google_auth.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/lock/app_lock.dart';
import 'package:myca/main.dart';
import 'package:myca/widgets/qr_image.dart';
import 'package:qr/qr.dart' as qr;

import 'accessibility_test.dart' show phone;
import 'cloud_test.dart' show sessionOn, signedIn;
import 'fake_api.dart';
import 'fake_cloud.dart';
import 'lock_test.dart' show FakeLock;

const wrongCode = 'That code is not right. Check it and try again.';

class FakeGoogle implements GoogleAuth {
  @override
  Future<String?> idToken() async => 'google-id-token';

  @override
  Future<void> signOut() async {}
}

Future<(FakeCloud, MemoryTokenStore)> ownerWithBusiness() async {
  final cloud = FakeCloud()..userName = 'Asha';
  final tokens = MemoryTokenStore();
  final session = await signedIn(cloud, tokens);
  await session.createBusiness(name: 'Asha Traders', state: '29');
  return (cloud, tokens);
}

AppState hosted(
  FakeCloud cloud,
  MemoryTokenStore tokens, {
  AppLock lock = const NoAppLock(),
  List<Uri>? opened,
  Future<bool> Function(Uri url)? openLink,
  GoogleAuth? google,
}) =>
    AppState(
      cloud: sessionOn(cloud, tokens),
      store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true, isLockEnabled: false),
      pickTextFile: (_) async => null,
      lock: lock,
      google: google,
      now: () => DateTime(2026, 10, 6, 10),
      openLink: openLink ??
          (url) async {
            opened?.add(url);
            return true;
          },
    );

List<String> captureClipboard(WidgetTester tester) {
  final copied = <String>[];
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
    if (call.method == 'Clipboard.setData') copied.add('${(call.arguments as Map)['text']}');
    return null;
  });
  addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
  return copied;
}

void expectTooltips(WidgetTester tester) {
  for (final button in tester.widgetList<IconButton>(find.byType(IconButton))) {
    expect(button.tooltip, isNotNull, reason: 'every icon button names itself');
  }
}

Future<void> press(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> typeIn(WidgetTester tester, Finder field, String text) async {
  await tester.scrollUntilVisible(field, 200, scrollable: find.byType(Scrollable).first);
  await tester.enterText(field, text);
  await tester.pump();
}

Future<void> openSecurity(WidgetTester tester) async {
  await tester.tap(find.byTooltip('Your business'));
  await tester.pumpAndSettle();
  await press(tester, find.text('Security'));
}

Future<void> phoneCodeSignIn(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField), '9876543210');
  await press(tester, find.text('Send code'));
  await tester.enterText(find.byType(TextField), FakeCloud.code);
  await press(tester, find.text('Sign in'));
}

Future<void> openSetup(WidgetTester tester) async {
  await openSecurity(tester);
  await tester.tap(find.text('Turn on'));
  await tester.pumpAndSettle();
}

Future<void> finishSetup(WidgetTester tester, FakeCloud cloud) async {
  await openSetup(tester);
  await typeIn(tester, find.widgetWithText(TextField, 'Code from the app'), cloud.totpCode);
  await press(tester, find.widgetWithText(FilledButton, 'Turn on'));
}

void main() {
  test('the grouped key splits the base32 secret into fours', () {
    expect(const SecondStepSetup(secret: 'JBSWY3DPEHPK3PXP', uri: '', account: '').groupedSecret, 'JBSW Y3DP EHPK 3PXP');
    expect(const SecondStepSetup(secret: 'ABCDEFG', uri: '', account: '').groupedSecret, 'ABCD EFG');
    expect(const SecondStepSetup(secret: '', uri: '', account: '').groupedSecret, '');
  });

  test('a second-step challenge holds no tokens, and Start over clears it', () async {
    final cloud = FakeCloud()..secondStepOn = true;
    final tokens = MemoryTokenStore();
    final session = sessionOn(cloud, tokens);
    await session.requestCode('9876543210');
    await session.verifyCode(FakeCloud.code);
    expect(session.secondStepPending, isTrue);
    expect(session.signedIn, isFalse);
    expect(tokens.values, isEmpty);
    session.cancelSecondStep();
    expect(session.secondStepPending, isFalse);
    expect(session.awaitingCode, isFalse);
    expect(cloud.secondSteps, isEmpty);
  });

  test('signing out forgets a second step that was waiting', () async {
    final cloud = FakeCloud()..secondStepOn = true;
    final session = sessionOn(cloud);
    await session.requestCode('9876543210');
    await session.verifyCode(FakeCloud.code);
    expect(session.secondStepPending, isTrue);
    await session.signOut();
    expect(session.secondStepPending, isFalse);
    expect(session.awaitingCode, isFalse);
    expect(cloud.logouts, 0, reason: 'nothing was signed in to sign out of');
  });

  test('a Google sign-in stops at the second step, and a recovery code with spaces finishes it', () async {
    final cloud = FakeCloud()..secondStepOn = true;
    final tokens = MemoryTokenStore();
    final session = sessionOn(cloud, tokens);
    await session.signInWithGoogle('google-id-token');
    expect(session.secondStepPending, isTrue);
    expect(session.signedIn, isFalse);
    expect(tokens.values, isEmpty);
    await session.completeSecondStep('ABCDE FGHJK');
    expect(session.signedIn, isTrue);
    expect(session.secondStepPending, isFalse);
    expect(tokens.values['cloud.refresh'], 'refresh-1');
    expect(cloud.secondSteps, ['ABCDE FGHJK']);
    expect(cloud.secondStepBodies.single, {'challengeId': FakeCloud.secondStepChallenge, 'code': 'ABCDE FGHJK', 'deviceLabel': 'Android'});
    expect(cloud.recoveryLeft, 7);
    expect(cloud.deviceLabels, ['Android']);
  });

  test('a firm sign-in stops at the second step too', () async {
    final cloud = FakeCloud()
      ..secondStepOn = true
      ..oidcOn = true;
    final tokens = MemoryTokenStore();
    final session = sessionOn(cloud, tokens);
    await session.signInWithOidc(cloud.oidcToken);
    expect(session.secondStepPending, isTrue);
    expect(tokens.values, isEmpty);
    await session.completeSecondStep(cloud.totpCode);
    expect(session.signedIn, isTrue);
    expect(cloud.recoveryLeft, 8, reason: 'an authenticator code does not use up a recovery code');
  });

  test('a second step announced without a challenge is refused and keeps nothing', () async {
    final tokens = MemoryTokenStore();
    final client = MockClient((request) async => http.Response(jsonEncode({'ok': true, 'secondStep': true}), 200, headers: {'content-type': 'application/json'}));
    final session = CloudSession(baseUrl: 'https://api.example.test', tokens: tokens, client: client);
    await expectLater(session.signInWithGoogle('google-id-token'), throwsA(isA<MycaApiException>()));
    expect(session.secondStepPending, isFalse);
    expect(session.signedIn, isFalse);
    expect(tokens.values, isEmpty);
  });

  test('every two-step and device refusal becomes a plain sentence', () async {
    final cloud = FakeCloud();
    final session = await signedIn(cloud);
    Matcher says(String sentence) => throwsA(isA<MycaApiException>().having((e) => e.message, 'message', sentence));
    await expectLater(session.signOutDevice('nope'), says('That device is already signed out.'));
    await expectLater(session.signOutDevice('dev-1'), says('Use Sign out to leave this phone.'));
    await expectLater(session.disableSecondStep('246810'), says('Two-step sign-in is off.'));
    await expectLater(session.newRecoveryCodes('246810'), says('Two-step sign-in is off.'));
    await expectLater(session.confirmSecondStep('246810'), says('Start the two-step setup again.'));
    expect(await session.signOutOtherDevices(), 1);
    expect(cloud.revoked, ['dev-2']);
    final setup = await session.beginSecondStep();
    expect(setup.account, '+919876543210');
    expect(setup.secret, 'JBSWY3DPEHPK3PXP');
    await expectLater(session.confirmSecondStep('000000'), says('That code is not right. 4 tries left.'));
    expect(await session.confirmSecondStep('246810'), hasLength(8));
    await expectLater(session.beginSecondStep(), says('Two-step sign-in is already on.'));
    final status = await session.secondStepStatus();
    expect(status.enabled, isTrue);
    expect(status.recoveryCodesLeft, 8);
    expect(status.enabledAt, isNotEmpty);
    await session.disableSecondStep('246810');
    expect((await session.secondStepStatus()).enabled, isFalse);
    expect((await session.secondStepStatus()).enabledAt, isEmpty);
  });

  test('five wrong codes while turning it on end the setup with its own sentence', () async {
    final cloud = FakeCloud();
    final session = await signedIn(cloud);
    Matcher says(String sentence) => throwsA(isA<MycaApiException>().having((e) => e.message, 'message', sentence));
    await session.beginSecondStep();
    for (final words in ['4 tries left.', '3 tries left.', '2 tries left.', '1 try left.']) {
      await expectLater(session.confirmSecondStep('000000'), says('That code is not right. $words'));
    }
    await expectLater(session.confirmSecondStep('000000'), says('Too many wrong codes. Start the setup again.'));
    await expectLater(session.confirmSecondStep('246810'), says('Start the two-step setup again.'));
    await session.beginSecondStep();
    expect(await session.confirmSecondStep('246810'), hasLength(8));
  });

  test('the sign-in answers that are not about the code keep their own sentences', () async {
    final cloud = FakeCloud()..secondStepOn = true;
    final session = sessionOn(cloud);
    await session.requestCode('9876543210');
    await session.verifyCode(FakeCloud.code);
    Matcher says(String sentence) => throwsA(isA<MycaApiException>().having((e) => e.message, 'message', sentence));
    cloud.secondStepError = 'CODE_EXPIRED';
    await expectLater(session.completeSecondStep('246810'), says('This sign-in attempt is over. Tap Start over and sign in again.'));
    cloud
      ..secondStepError = 'CODE_USED'
      ..secondStepLeft = 2;
    await expectLater(session.completeSecondStep('246810'), says('That code was already used. Wait for the next one on your authenticator and try again.'));
    cloud.secondStepError = 'TOO_MANY_ATTEMPTS';
    await expectLater(session.completeSecondStep('246810'), says('This sign-in attempt is over. Tap Start over and sign in again.'));
    expect(session.secondStepPending, isTrue);
    expect(session.signedIn, isFalse);
  });

  testWidgets('with two-step on, sign-in asks for the authenticator code and only the right one opens the books', (tester) async {
    final (cloud, _) = await ownerWithBusiness();
    cloud.secondStepOn = true;
    final tokens = MemoryTokenStore();
    await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens)));
    await tester.pumpAndSettle();
    expect(find.text('Your mobile number'), findsOneWidget);
    await phoneCodeSignIn(tester);
    expect(find.text('Enter your authenticator code'), findsOneWidget);
    expect(find.text('Open your authenticator app and type the 6-digit code. A recovery code works too.'), findsOneWidget);
    expect(find.text('Use a different number'), findsNothing);
    expect(find.text('Enter the code'), findsNothing);
    expect(tokens.values, isEmpty, reason: 'no tokens before the second step');

    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.maxLength, 11);
    expect(field.autofillHints, [AutofillHints.oneTimeCode]);
    expect(field.inputFormatters, isNull, reason: 'recovery codes have letters');
    expect(find.widgetWithText(TextField, 'Code'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '000000');
    await press(tester, find.text('Sign in'));
    expect(find.text('That code is not right. 4 tries left.'), findsOneWidget);
    expect(find.text('Enter your authenticator code'), findsOneWidget);
    expect(tokens.values, isEmpty);

    await tester.enterText(find.byType(TextField), cloud.totpCode);
    await press(tester, find.text('Sign in'));
    expect(cloud.secondSteps, ['000000', '246810']);
    expect(find.text('Good morning'), findsOneWidget);
    expect(find.text('Asha Traders'), findsOneWidget);
    expect(tokens.values['cloud.refresh'], isNotNull);
  });

  testWidgets('a recovery code with letters signs in from the same field, and Start over goes back to the number', (tester) async {
    final (cloud, _) = await ownerWithBusiness();
    cloud.secondStepOn = true;
    await tester.pumpWidget(MycaApp(state: hosted(cloud, MemoryTokenStore())));
    await tester.pumpAndSettle();
    await phoneCodeSignIn(tester);
    expect(find.text('Enter your authenticator code'), findsOneWidget);
    await press(tester, find.text('Start over'));
    expect(find.text('Your mobile number'), findsOneWidget);
    expect(find.text('Enter your authenticator code'), findsNothing);
    expect(cloud.secondSteps, isEmpty);

    await phoneCodeSignIn(tester);
    await tester.enterText(find.byType(TextField), cloud.recoveryCode);
    await press(tester, find.text('Sign in'));
    expect(cloud.secondSteps, ['abcde-fghjk']);
    expect(find.text('Asha Traders'), findsOneWidget);
  });

  testWidgets('a second step that ran out says so and Start over begins again', (tester) async {
    final (cloud, _) = await ownerWithBusiness();
    cloud.secondStepOn = true;
    await tester.pumpWidget(MycaApp(state: hosted(cloud, MemoryTokenStore())));
    await tester.pumpAndSettle();
    await phoneCodeSignIn(tester);

    cloud.secondStepError = 'CODE_EXPIRED';
    await tester.enterText(find.byType(TextField), cloud.totpCode);
    await press(tester, find.text('Sign in'));
    expect(find.text('This sign-in attempt is over. Tap Start over and sign in again.'), findsOneWidget);
    expect(find.text('Enter your authenticator code'), findsOneWidget);

    cloud.secondStepError = 'TOO_MANY_ATTEMPTS';
    await press(tester, find.text('Sign in'));
    expect(find.text('This sign-in attempt is over. Tap Start over and sign in again.'), findsOneWidget);

    await press(tester, find.text('Start over'));
    expect(find.text('Your mobile number'), findsOneWidget);
    expect(find.text('This sign-in attempt is over. Tap Start over and sign in again.'), findsNothing);

    cloud.secondStepError = '';
    await phoneCodeSignIn(tester);
    await tester.enterText(find.byType(TextField), cloud.totpCode);
    await press(tester, find.text('Sign in'));
    expect(find.text('Asha Traders'), findsOneWidget);
  });

  testWidgets('Google leads to the second step too, and the Google button is gone while it is asked', (tester) async {
    final (cloud, tokens) = await ownerWithBusiness();
    cloud.secondStepOn = true;
    await tester.pumpWidget(MycaApp(state: hosted(cloud, MemoryTokenStore(), google: FakeGoogle())));
    await tester.pumpAndSettle();
    expect(find.text('Continue with Google'), findsOneWidget);
    expect(find.text('Or use your mobile number'), findsOneWidget);

    await press(tester, find.text('Continue with Google'));
    expect(find.text('Enter your authenticator code'), findsOneWidget);
    expect(find.text('Continue with Google'), findsNothing);
    expect(find.text('Or use your mobile number'), findsNothing);
    expect(find.text('Send code'), findsNothing);
    expect(cloud.deviceLabels, ['Android']);

    await tester.enterText(find.byType(TextField), cloud.totpCode);
    await press(tester, find.text('Sign in'));
    expect(cloud.secondSteps, ['246810']);
    expect(find.text('Asha Traders'), findsOneWidget);
    expect(tokens.values, isNotEmpty);
  });

  testWidgets('after the second step the usual gates still come first: the privacy notice, then the name', (tester) async {
    final cloud = FakeCloud()
      ..secondStepOn = true
      ..noticeAccepted = false;
    await tester.pumpWidget(MycaApp(state: hosted(cloud, MemoryTokenStore())));
    await tester.pumpAndSettle();
    await phoneCodeSignIn(tester);
    expect(find.text('Enter your authenticator code'), findsOneWidget);
    expect(find.text('How MyCA uses your information'), findsNothing);

    await tester.enterText(find.byType(TextField), cloud.totpCode);
    await press(tester, find.text('Sign in'));
    expect(find.text('Enter your authenticator code'), findsNothing);
    expect(find.text('How MyCA uses your information'), findsOneWidget);
    expect(cloud.requests.where((r) => r.startsWith('GET /v1/businesses')), isEmpty, reason: 'no business data before consent');

    await press(tester, find.text('I agree'));
    expect(cloud.consents, ['privacy@v-test']);
    expect(find.text('What should we call you?'), findsOneWidget);
  });

  testWidgets('Security lists the signed-in devices and marks this phone', (tester) async {
    final (cloud, tokens) = await ownerWithBusiness();
    await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens)));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    expect(find.text('Security'), findsOneWidget);
    expect(find.text('Two-step sign-in and where you are signed in'), findsOneWidget);
    await press(tester, find.text('Security'));
    expect(find.text('Two-step sign-in'), findsOneWidget);
    expect(find.text('Off · ask for an authenticator code at every sign-in'), findsOneWidget);
    expect(find.text('Turn on'), findsOneWidget);
    expect(find.text('New recovery codes'), findsNothing);
    expect(find.text('Where you are signed in'.toUpperCase()), findsOneWidget);
    expect(find.text('Android'), findsOneWidget);
    expect(find.text('iPhone'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const ValueKey('device.dev-1')), matching: find.text('This phone')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const ValueKey('device.dev-1')), matching: find.text('Sign out')), findsNothing);
    expect(find.descendant(of: find.byKey(const ValueKey('device.dev-2')), matching: find.text('This phone')), findsNothing);
    expect(find.descendant(of: find.byKey(const ValueKey('device.dev-2')), matching: find.widgetWithText(TextButton, 'Sign out')), findsOneWidget);
    expect(find.text('Signed in 1 October 2026 · last active 6 October 2026'), findsOneWidget);
    expect(find.text('Signed in 20 September 2026 · last active 5 October 2026'), findsOneWidget);
    expect(find.text('Sign out other devices'), findsOneWidget);
    expect(cloud.requests, contains('GET /v1/me/devices'));
    expect(cloud.requests, contains('GET /v1/me/second-step'));
  });

  testWidgets('device dates are read in Indian time, plain dates are accepted and a missing one is left out', (tester) async {
    final (cloud, tokens) = await ownerWithBusiness();
    cloud.devices[1]
      ..['signedInOn'] = '2026-09-20'
      ..['lastActive'] = '2026-10-05T22:30:00.000Z';
    cloud.devices.add({'id': 'dev-3', 'label': 'Android', 'signedInOn': '2026-08-02T10:00:00.000Z', 'lastActive': '', 'current': false});
    await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens)));
    await tester.pumpAndSettle();
    await openSecurity(tester);
    expect(find.text('Signed in 20 September 2026 · last active 6 October 2026'), findsOneWidget);
    expect(find.text('Signed in 2 August 2026'), findsOneWidget);
  });

  testWidgets('signing out another device asks first, then the phone lock, then tells the server', (tester) async {
    final (cloud, tokens) = await ownerWithBusiness();
    final lock = FakeLock();
    await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens, lock: lock)));
    await tester.pumpAndSettle();
    await openSecurity(tester);
    await tester.tap(find.widgetWithText(TextButton, 'Sign out'));
    await tester.pumpAndSettle();
    expect(find.text('Sign out that device?'), findsOneWidget);
    expect(find.text('It stops working at once. Anyone holding it has to sign in again.'), findsOneWidget);
    expect(cloud.revoked, isEmpty, reason: 'nothing happens before confirming');
    await tester.tap(find.text('Keep'));
    await tester.pumpAndSettle();
    expect(lock.prompts, isEmpty);
    expect(cloud.revoked, isEmpty);

    await tester.tap(find.widgetWithText(TextButton, 'Sign out'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Sign out'));
    await tester.pumpAndSettle();
    expect(lock.prompts, ['Sign out that device']);
    expect(cloud.revoked, ['dev-2']);
    expect(cloud.requests, contains('POST /v1/me/devices/dev-2/sign-out'));
    expect(find.text('Signed out.'), findsOneWidget);
    expect(find.text('iPhone'), findsNothing);
    expect(find.text('Sign out other devices'), findsNothing, reason: 'only this phone is left');
  });

  testWidgets('a refused unlock signs nothing out', (tester) async {
    final (cloud, tokens) = await ownerWithBusiness();
    final lock = FakeLock(answers: [false]);
    await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens, lock: lock)));
    await tester.pumpAndSettle();
    await openSecurity(tester);
    await tester.tap(find.widgetWithText(TextButton, 'Sign out'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Sign out'));
    await tester.pumpAndSettle();
    expect(lock.prompts, ['Sign out that device']);
    expect(cloud.revoked, isEmpty);
    expect(cloud.requests.where((r) => r.contains('sign-out')), isEmpty);
    expect(find.text('Unlock to continue.'), findsOneWidget);
    expect(find.text('iPhone'), findsOneWidget);
  });

  testWidgets('a phone with no screen lock signs the other device out after the question alone', (tester) async {
    final (cloud, tokens) = await ownerWithBusiness();
    final lock = FakeLock(isAvailable: false);
    await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens, lock: lock)));
    await tester.pumpAndSettle();
    await openSecurity(tester);
    await tester.tap(find.widgetWithText(TextButton, 'Sign out'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Sign out'));
    await tester.pumpAndSettle();
    expect(lock.prompts, isEmpty);
    expect(cloud.revoked, ['dev-2']);
  });

  testWidgets('a device that was already signed out is dropped from the list with a plain sentence', (tester) async {
    final (cloud, tokens) = await ownerWithBusiness();
    await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens)));
    await tester.pumpAndSettle();
    await openSecurity(tester);
    expect(find.text('iPhone'), findsOneWidget);
    cloud.devices.removeWhere((d) => d['id'] == 'dev-2');
    await tester.tap(find.widgetWithText(TextButton, 'Sign out'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Sign out'));
    await tester.pumpAndSettle();
    expect(find.text('That device is already signed out.'), findsOneWidget);
    expect(find.text('iPhone'), findsNothing);
    expect(find.text('Signed out.'), findsNothing);
  });

  testWidgets('Sign out other devices revokes everything but this phone, after the same question and lock', (tester) async {
    final (cloud, tokens) = await ownerWithBusiness();
    final lock = FakeLock();
    await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens, lock: lock)));
    await tester.pumpAndSettle();
    await openSecurity(tester);
    await tester.tap(find.text('Sign out other devices'));
    await tester.pumpAndSettle();
    expect(find.text('Sign out that device?'), findsOneWidget);
    expect(cloud.signedOutOthers, 0);
    expect(lock.prompts, isEmpty);
    await tester.tap(find.widgetWithText(FilledButton, 'Sign out'));
    await tester.pumpAndSettle();
    expect(lock.prompts, ['Sign out that device']);
    expect(cloud.signedOutOthers, 1);
    expect(cloud.revoked, ['dev-2']);
    expect(find.text('Signed out 1 device.'), findsOneWidget);
    expect(find.text('iPhone'), findsNothing);
    expect(find.text('This phone'), findsOneWidget);
  });

  testWidgets('turning on two-step shows the key and QR, hands off to the authenticator app, and ends with recovery codes', (tester) async {
    final (cloud, tokens) = await ownerWithBusiness();
    final opened = <Uri>[];
    final copied = captureClipboard(tester);
    await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens, opened: opened)));
    await tester.pumpAndSettle();
    await openSetup(tester);
    expect(cloud.requests.where((r) => r == 'POST /v1/me/second-step/begin'), hasLength(1));
    expect(find.text('Turn on two-step sign-in'), findsOneWidget);
    expect(find.text('JBSW Y3DP EHPK 3PXP'), findsOneWidget);
    expect(find.byType(QrSquare), findsOneWidget);
    expect(tester.widget<QrSquare>(find.byType(QrSquare)).data, FakeCloud.totpUri);
    expect(find.byTooltip('Copy key'), findsOneWidget);
    expect(find.text('Scan this with Google Authenticator, Authy or any authenticator app, or copy the key into it. Then type the code it shows.'), findsOneWidget);
    expect(tester.widget<TextField>(find.widgetWithText(TextField, 'Code from the app')).maxLength, 6);

    await tester.tap(find.byTooltip('Copy key'));
    await tester.pumpAndSettle();
    expect(copied, ['JBSWY3DPEHPK3PXP']);

    await tester.tap(find.text('Open in authenticator app'));
    await tester.pumpAndSettle();
    expect(opened, [Uri.parse(FakeCloud.totpUri)]);

    await typeIn(tester, find.widgetWithText(TextField, 'Code from the app'), '12');
    await press(tester, find.widgetWithText(FilledButton, 'Turn on'));
    expect(find.text('Type the 6-digit code the app shows.'), findsOneWidget);
    expect(cloud.requests, isNot(contains('POST /v1/me/second-step/confirm')));

    await typeIn(tester, find.widgetWithText(TextField, 'Code from the app'), '000000');
    await press(tester, find.widgetWithText(FilledButton, 'Turn on'));
    expect(find.text('That code is not right. 4 tries left.'), findsOneWidget);
    expect(cloud.twoStepEnabled, isFalse);
    expect(find.text('Turn on two-step sign-in'), findsOneWidget);

    await typeIn(tester, find.widgetWithText(TextField, 'Code from the app'), cloud.totpCode);
    await press(tester, find.widgetWithText(FilledButton, 'Turn on'));
    expect(cloud.twoStepEnabled, isTrue);
    expect(find.text('Save these recovery codes'), findsOneWidget);
    expect(find.text('Each one signs you in once if you lose your authenticator. Keep them somewhere safe; MyCA cannot show them again.'), findsOneWidget);
    for (final code in FakeCloud.freshRecoveryCodes) {
      expect(find.textContaining(code), findsOneWidget);
    }
    expect(find.text('Turn on two-step sign-in'), findsNothing, reason: 'the setup screen was replaced');

    await tester.tap(find.text('Copy all'));
    await tester.pumpAndSettle();
    expect(find.text('Copied'), findsOneWidget);
    expect(copied.last, FakeCloud.freshRecoveryCodes.join('\n'));
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(find.text('Security'), findsOneWidget);
    expect(find.text('On · 8 recovery codes left'), findsOneWidget);
    expect(find.text('Turn off'), findsOneWidget);
    expect(find.text('New recovery codes'), findsOneWidget);
  });

  testWidgets('when no authenticator app can take the link the screen says what to do instead', (tester) async {
    for (final throws in [false, true]) {
      final (cloud, tokens) = await ownerWithBusiness();
      await tester.pumpWidget(
        MycaApp(
          key: UniqueKey(),
          state: hosted(cloud, tokens, openLink: (url) async {
            if (throws) throw PlatformException(code: 'ACTIVITY_NOT_FOUND');
            return false;
          }),
        ),
      );
      await tester.pumpAndSettle();
      await openSetup(tester);
      await press(tester, find.text('Open in authenticator app'));
      expect(find.text('No authenticator app could open this. Scan the code or copy the key instead.'), findsOneWidget);
      expect(find.text('JBSW Y3DP EHPK 3PXP'), findsOneWidget);
    }
  });

  testWidgets('five wrong codes in the setup say to start again, and starting again works', (tester) async {
    final (cloud, tokens) = await ownerWithBusiness();
    await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens)));
    await tester.pumpAndSettle();
    await openSetup(tester);
    for (final words in ['4 tries left.', '3 tries left.', '2 tries left.', '1 try left.']) {
      await typeIn(tester, find.widgetWithText(TextField, 'Code from the app'), '000000');
      await press(tester, find.widgetWithText(FilledButton, 'Turn on'));
      expect(find.text('That code is not right. $words'), findsOneWidget);
      expect(find.textContaining('That code is not right'), findsOneWidget);
    }
    await typeIn(tester, find.widgetWithText(TextField, 'Code from the app'), '000000');
    await press(tester, find.widgetWithText(FilledButton, 'Turn on'));
    expect(find.text('Too many wrong codes. Start the setup again.'), findsOneWidget);
    expect(find.textContaining('That code is not right'), findsNothing);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Off · ask for an authenticator code at every sign-in'), findsOneWidget);
    await tester.tap(find.text('Turn on'));
    await tester.pumpAndSettle();
    expect(cloud.requests.where((r) => r == 'POST /v1/me/second-step/begin'), hasLength(2));
    await typeIn(tester, find.widgetWithText(TextField, 'Code from the app'), cloud.totpCode);
    await press(tester, find.widgetWithText(FilledButton, 'Turn on'));
    expect(cloud.twoStepEnabled, isTrue);
    expect(find.text('Save these recovery codes'), findsOneWidget);
  });

  testWidgets('leaving the setup keeps two-step off', (tester) async {
    final (cloud, tokens) = await ownerWithBusiness();
    await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens)));
    await tester.pumpAndSettle();
    await openSetup(tester);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(cloud.twoStepEnabled, isFalse);
    expect(find.text('Off · ask for an authenticator code at every sign-in'), findsOneWidget);
    expect(find.text('Turn on'), findsOneWidget);
  });

  testWidgets('a setup that is already finished elsewhere says so, and the row catches up', (tester) async {
    final (cloud, tokens) = await ownerWithBusiness();
    await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens)));
    await tester.pumpAndSettle();
    await openSecurity(tester);
    expect(find.text('Turn on'), findsOneWidget);
    cloud
      ..twoStepEnabled = true
      ..recoveryLeft = 5;
    await tester.tap(find.text('Turn on'));
    await tester.pumpAndSettle();
    expect(find.text('Two-step sign-in is already on.'), findsOneWidget);
    expect(find.text('JBSW Y3DP EHPK 3PXP'), findsNothing);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('On · 5 recovery codes left'), findsOneWidget);
    expect(find.text('Turn off'), findsOneWidget);
  });

  testWidgets('when the session has died the Security screen says so once instead of reloading', (tester) async {
    final (cloud, tokens) = await ownerWithBusiness();
    await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens)));
    await tester.pumpAndSettle();
    await openSecurity(tester);
    cloud
      ..access = 'expired'
      ..refreshFails = true;
    await tester.tap(find.widgetWithText(TextButton, 'Sign out'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Sign out'));
    await tester.pumpAndSettle();
    expect(find.text('Please sign in again.'), findsOneWidget);
    expect(cloud.revoked, isEmpty);
    expect(tokens.values, isEmpty);
  });

  testWidgets('turning two-step off needs a code, and the row says off', (tester) async {
    final (cloud, tokens) = await ownerWithBusiness();
    cloud
      ..twoStepEnabled = true
      ..recoveryLeft = 1;
    await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens)));
    await tester.pumpAndSettle();
    await openSecurity(tester);
    expect(find.text('On · 1 recovery code left'), findsOneWidget);

    await tester.tap(find.text('Turn off'));
    await tester.pumpAndSettle();
    expect(find.text('Turn off two-step sign-in?'), findsOneWidget);
    expect(find.text('Code from your authenticator app or a recovery code'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Code from your authenticator app or a recovery code'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Code'), findsOneWidget);
    expect(tester.widget<TextField>(find.byType(TextField)).maxLength, 11);
    final action = find.widgetWithText(FilledButton, 'Turn off');
    expect(tester.widget<FilledButton>(action).onPressed, isNull, reason: 'nothing to send until a code is typed');
    await tester.enterText(find.widgetWithText(TextField, 'Code'), '123456');
    await tester.pump();
    expect(tester.widget<FilledButton>(action).onPressed, isNotNull);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(cloud.requests, isNot(contains('POST /v1/me/second-step/disable')));
    expect(cloud.twoStepEnabled, isTrue);

    await tester.tap(find.text('Turn off'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Code'), '999999');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Turn off'));
    await tester.pumpAndSettle();
    expect(find.text('That code is not right. 4 tries left.'), findsOneWidget);
    expect(find.text(wrongCode), findsNothing);
    expect(cloud.twoStepEnabled, isTrue);
    expect(find.text('On · 1 recovery code left'), findsOneWidget);

    await tester.tap(find.text('Turn off'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Code'), 'ABCDE FGHJK');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Turn off'));
    await tester.pumpAndSettle();
    expect(cloud.twoStepEnabled, isFalse);
    expect(find.text('Off · ask for an authenticator code at every sign-in'), findsOneWidget);
    expect(find.text('Two-step sign-in is off.'), findsOneWidget);
    expect(find.text(wrongCode), findsNothing);
    expect(find.text('New recovery codes'), findsNothing);
    expect(find.text('Turn on'), findsOneWidget);
  });

  testWidgets('new recovery codes need a code and replace the old ones', (tester) async {
    final (cloud, tokens) = await ownerWithBusiness();
    cloud
      ..twoStepEnabled = true
      ..recoveryLeft = 3;
    await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens)));
    await tester.pumpAndSettle();
    await openSecurity(tester);
    expect(find.text('On · 3 recovery codes left'), findsOneWidget);
    expect(find.text('Replaces the ones you have'), findsOneWidget);
    await tester.tap(find.text('Make new'));
    await tester.pumpAndSettle();
    expect(find.text('Make new recovery codes?'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Code'), cloud.totpCode);
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Make new'));
    await tester.pumpAndSettle();
    expect(cloud.requests, contains('POST /v1/me/second-step/recovery-codes'));
    expect(find.text('Save these recovery codes'), findsOneWidget);
    expect(find.textContaining('mnpqr-stuvw'), findsOneWidget);
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(find.text('On · 8 recovery codes left'), findsOneWidget);
  });

  testWidgets('the QR square paints exactly the dark modules of the setup link', (tester) async {
    final code = qr.QrImage(qr.QrCode.fromData(data: FakeCloud.totpUri, errorCorrectLevel: qr.QrErrorCorrectLevel.L));
    final count = code.moduleCount;
    expect(count, greaterThanOrEqualTo(21));
    for (final (row, col) in [(0, 0), (0, count - 7), (count - 7, 0)]) {
      for (var i = 0; i < 7; i++) {
        expect(code.isDark(row, col + i), isTrue);
        expect(code.isDark(row + 6, col + i), isTrue);
        expect(code.isDark(row + i, col), isTrue);
        expect(code.isDark(row + i, col + 6), isTrue);
      }
      expect(code.isDark(row + 3, col + 3), isTrue);
      expect(code.isDark(row + 1, col + 1), isFalse);
    }
    const cell = 8;
    final side = count * cell;
    await tester.runAsync(() async {
      final recorder = ui.PictureRecorder();
      QrPainter(FakeCloud.totpUri).paint(Canvas(recorder), Size.square(side.toDouble()));
      final image = await recorder.endRecording().toImage(side, side);
      final bytes = (await image.toByteData())!;
      for (var row = 0; row < count; row++) {
        for (var col = 0; col < count; col++) {
          final at = ((row * cell + cell ~/ 2) * side + col * cell + cell ~/ 2) * 4;
          expect(bytes.getUint8(at + 3) > 0, code.isDark(row, col), reason: 'module $row,$col');
        }
      }
    });
    expect(QrPainter('a').shouldRepaint(QrPainter('a')), isFalse);
    expect(QrPainter('a').shouldRepaint(QrPainter('b')), isTrue);
  });

  final hostedWalks = <String, Future<void> Function(WidgetTester tester, FakeCloud cloud)>{
    'security': (t, cloud) async {
      await openSecurity(t);
    },
    'security, two-step on': (t, cloud) async {
      cloud.twoStepEnabled = true;
      await openSecurity(t);
    },
    'security, sign-out question': (t, cloud) async {
      await openSecurity(t);
      await press(t, find.widgetWithText(TextButton, 'Sign out'));
    },
    'security, code question': (t, cloud) async {
      cloud.twoStepEnabled = true;
      await openSecurity(t);
      await press(t, find.text('Turn off'));
    },
    'two-step setup': (t, cloud) async {
      await openSetup(t);
    },
    'two-step setup, with a wrong code': (t, cloud) async {
      await openSetup(t);
      await typeIn(t, find.widgetWithText(TextField, 'Code from the app'), '12');
      await press(t, find.widgetWithText(FilledButton, 'Turn on'));
    },
    'recovery codes': (t, cloud) async {
      await finishSetup(t, cloud);
    },
    'second step at sign-in': (t, cloud) async {
      cloud.secondStepOn = true;
      await t.pumpWidget(MycaApp(key: UniqueKey(), state: hosted(cloud, MemoryTokenStore())));
      await t.pumpAndSettle();
      await phoneCodeSignIn(t);
      expect(find.text('Enter your authenticator code'), findsOneWidget);
    },
  };

  for (final entry in hostedWalks.entries) {
    testWidgets('${entry.key}: every tap target is big enough and labelled, and text has enough contrast', (tester) async {
      await phone(tester);
      final (cloud, tokens) = await ownerWithBusiness();
      await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens)));
      await tester.pumpAndSettle();
      await entry.value(tester, cloud);
      expectTooltips(tester);
      final handle = tester.ensureSemantics();
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      handle.dispose();
    });

    for (final scale in [1.5, 2.0]) {
      testWidgets('${entry.key}: at ${scale}x type size nothing overflows', (tester) async {
        await phone(tester, textScale: scale);
        final (cloud, tokens) = await ownerWithBusiness();
        await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens)));
        await tester.pumpAndSettle();
        await entry.value(tester, cloud);
        final error = tester.takeException();
        expect(error, isNull, reason: 'overflow or layout error at text scale $scale: $error');
      });
    }
  }
}
