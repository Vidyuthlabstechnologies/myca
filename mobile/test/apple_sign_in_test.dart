import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/apple_auth.dart';
import 'package:myca/cloud/google_auth.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/apple_sign_in_button.dart';

import 'cloud_test.dart' show sessionOn;
import 'fake_api.dart' show MemoryOnboardingStore;
import 'fake_cloud.dart';

class FakeApple implements AppleAuth {
  FakeApple({this.answer = const AppleCredential(idToken: 'apple-id-token', rawNonce: 'raw-nonce-0123456789abcdef', givenName: 'Dana', familyName: 'Whitfield'), this.error});

  AppleCredential? answer;
  MycaApiException? error;
  int asked = 0;

  @override
  Future<AppleCredential?> credential() async {
    asked += 1;
    if (error != null) throw error!;
    return answer;
  }
}

class FakeGoogle implements GoogleAuth {
  int asked = 0;

  @override
  Future<String?> idToken() async {
    asked += 1;
    return 'google-id-token';
  }

  @override
  Future<void> signOut() async {}
}

AppState _us(FakeCloud cloud, {AppleAuth? apple, GoogleAuth? google}) => AppState(
  cloud: sessionOn(cloud, MemoryTokenStore()),
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => null,
  now: () => DateTime(2026, 11, 14, 10),
  edition: 'US',
  apple: apple,
  google: google,
);

Future<void> _phone(WidgetTester tester, {double width = 320, double scale = 1}) async {
  tester.view.physicalSize = Size(width * 2, 1136);
  tester.view.devicePixelRatio = 2;
  tester.platformDispatcher.textScaleFactorTestValue = scale;
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  addTearDown(tester.view.reset);
}

void main() {
  test('the nonce sent to Apple is the SHA-256 hex of a fresh, url-safe raw nonce', () {
    expect(appleNonceHash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    final first = appleRawNonce(Random(1));
    final second = appleRawNonce(Random(2));
    expect(first, matches(RegExp(r'^[A-Za-z0-9_-]{43}$')));
    expect(first, isNot(second));
    expect(appleRawNonce(), isNot(appleRawNonce()));
  });

  test('Sign in with Apple is offered on iOS in the US app, and on Android only with a web flow', () {
    expect(appleSignInOffered(platform: TargetPlatform.iOS, edition: 'US'), isTrue);
    expect(appleSignInOffered(platform: TargetPlatform.iOS, edition: 'IN'), isFalse);
    expect(appleSignInOffered(platform: TargetPlatform.android, edition: 'US'), isFalse);
    expect(appleSignInOffered(platform: TargetPlatform.android, edition: 'US', webFlowConfigured: true), isTrue);
    expect(appleSignInOffered(platform: TargetPlatform.windows, edition: 'US'), isFalse);
  });

  testWidgets('on a test server the US app keeps the test-number sign-in beside Apple and Google', (tester) async {
    final cloud = FakeCloud()
      ..appleOn = true
      ..serverEnvironment = 'staging';
    await tester.pumpWidget(MycaApp(state: _us(cloud, apple: FakeApple(), google: FakeGoogle())));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('signIn.apple')), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Continue with Google'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Mobile number'), findsOneWidget);
  });

  testWidgets('the Apple button comes first, black, at least as large as Google, and signs a new user in with the name Apple gave', (tester) async {
    final cloud = FakeCloud()..appleOn = true;
    final apple = FakeApple();
    final google = FakeGoogle();
    await tester.pumpWidget(MycaApp(state: _us(cloud, apple: apple, google: google)));
    await tester.pumpAndSettle();

    expect(find.text('Use your Apple or Google account. No new password to remember.'), findsOneWidget);
    final appleButton = find.byKey(const Key('signIn.apple'));
    final googleButton = find.widgetWithText(FilledButton, 'Continue with Google');
    expect(appleButton, findsOneWidget);
    expect(tester.getTopLeft(appleButton).dy, lessThan(tester.getTopLeft(googleButton).dy));
    expect(tester.getSize(appleButton).height, greaterThanOrEqualTo(tester.getSize(googleButton).height));
    expect(tester.getSize(appleButton).width, greaterThanOrEqualTo(tester.getSize(googleButton).width));
    final style = tester.widget<FilledButton>(appleButton).style!;
    expect(style.backgroundColor!.resolve({}), Colors.black);
    expect(style.foregroundColor!.resolve({}), Colors.white);
    expect(find.bySemanticsLabel(appleSignInLabel), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Mobile number'), findsNothing);

    await tester.tap(appleButton);
    await tester.pumpAndSettle();
    expect(apple.asked, 1);
    expect(google.asked, 0);
    expect(cloud.requests, contains('POST /v1/auth/apple'));
    expect(cloud.appleBodies.single['rawNonce'], 'raw-nonce-0123456789abcdef');
    expect(cloud.appleBodies.single['idToken'], 'apple-id-token');
    expect(cloud.appleBodies.single['fullName'], {'givenName': 'Dana', 'familyName': 'Whitfield'});
    expect(cloud.userName, 'Dana Whitfield');
    expect(find.byKey(const Key('signIn.apple')), findsNothing);
    expect(find.text('What should we call you?'), findsNothing);
  });

  testWidgets('a later Apple sign-in carries no name, so none is sent', (tester) async {
    final cloud = FakeCloud()
      ..appleOn = true
      ..userName = 'Dana Whitfield';
    final apple = FakeApple(answer: const AppleCredential(idToken: 'apple-id-token', rawNonce: 'raw-nonce-0123456789abcdef'));
    await tester.pumpWidget(MycaApp(state: _us(cloud, apple: apple)));
    await tester.pumpAndSettle();
    expect(find.text('Use your Apple account. No new password to remember.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('signIn.apple')));
    await tester.pumpAndSettle();
    expect(cloud.appleBodies.single.containsKey('fullName'), isFalse);
    expect(find.byKey(const Key('signIn.apple')), findsNothing);
  });

  testWidgets('closing the Apple sheet leaves the person where they were, with no message', (tester) async {
    final cloud = FakeCloud()..appleOn = true;
    final apple = FakeApple(answer: null);
    await tester.pumpWidget(MycaApp(state: _us(cloud, apple: apple)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('signIn.apple')));
    await tester.pumpAndSettle();
    expect(apple.asked, 1);
    expect(cloud.requests, isNot(contains('POST /v1/auth/apple')));
    expect(find.byKey(const Key('signIn.apple')), findsOneWidget);
    expect(find.text(appleSignInLabel), findsOneWidget);
    expect(find.textContaining('Try again'), findsNothing);
  });

  testWidgets('a token the server refuses, or an Apple failure on the device, shows a plain message and the button again', (tester) async {
    final cloud = FakeCloud()..appleOn = true;
    final apple = FakeApple(answer: const AppleCredential(idToken: 'forged', rawNonce: 'raw-nonce-0123456789abcdef'));
    await tester.pumpWidget(MycaApp(state: _us(cloud, apple: apple)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('signIn.apple')));
    await tester.pumpAndSettle();
    expect(find.text('Apple could not confirm who you are. Try again.'), findsOneWidget);
    apple.error = const MycaApiException(appleSignInFailed);
    await tester.tap(find.byKey(const Key('signIn.apple')));
    await tester.pumpAndSettle();
    expect(find.text(appleSignInFailed), findsOneWidget);
    expect(find.text(appleSignInLabel), findsOneWidget);
  });

  testWidgets('with Apple sign-in off on the server there is no Apple button', (tester) async {
    final off = FakeCloud()..appleOn = false;
    await tester.pumpWidget(MycaApp(state: _us(off, apple: FakeApple(), google: FakeGoogle())));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('signIn.apple')), findsNothing);
    expect(find.text('Continue with Google'), findsOneWidget);
  });

  testWidgets('a device without Apple sign-in, such as an Android phone, shows no Apple button', (tester) async {
    final android = FakeCloud()..appleOn = true;
    await tester.pumpWidget(MycaApp(state: _us(android, google: FakeGoogle())));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('signIn.apple')), findsNothing);
    expect(find.text('Use your Google account. No new password to remember.'), findsOneWidget);
  });

  for (final scale in [1.0, 2.0]) {
    testWidgets('at 320 points wide and ${scale}x text the Apple and Google buttons fit without overflow', (tester) async {
      await _phone(tester, scale: scale);
      final cloud = FakeCloud()..appleOn = true;
      await tester.pumpWidget(MycaApp(state: _us(cloud, apple: FakeApple(), google: FakeGoogle())));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final appleButton = find.byKey(const Key('signIn.apple'));
      await tester.ensureVisible(appleButton);
      await tester.pumpAndSettle();
      final rect = tester.getRect(appleButton);
      expect(rect.left, greaterThanOrEqualTo(0));
      expect(rect.right, lessThanOrEqualTo(320));
      expect(rect.height, greaterThanOrEqualTo(48));
      expect(find.text(appleSignInLabel), findsOneWidget);
      await tester.tap(appleButton);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(cloud.requests, contains('POST /v1/auth/apple'));
    });
  }

  testWidgets('on a dark background the Apple button is white with a black logo and title', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: ThemeData.dark(),
      home: Scaffold(body: Center(child: AppleSignInButton(onPressed: () {}))),
    ));
    final style = tester.widget<FilledButton>(find.byKey(const Key('signIn.apple'))).style!;
    expect(style.backgroundColor!.resolve({}), Colors.white);
    expect(style.foregroundColor!.resolve({}), Colors.black);
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: Center(child: AppleSignInButton(onPressed: null, busy: true))),
    ));
    expect(find.text('Please wait…'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byKey(const Key('signIn.apple'))).onPressed, isNull);
  });
}
