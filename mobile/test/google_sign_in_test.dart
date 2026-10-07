import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/google_auth.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';
import 'fake_cloud.dart';

class FakeGoogle implements GoogleAuth {
  FakeGoogle({this.token = 'google-id-token'});

  String? token;
  int asked = 0;
  int signedOut = 0;

  @override
  Future<String?> idToken() async {
    asked += 1;
    return token;
  }

  @override
  Future<void> signOut() async => signedOut += 1;
}

AppState _hosted(FakeCloud cloud, FakeGoogle google) => AppState(
  cloud: CloudSession(
    baseUrl: 'https://api.example.test',
    tokens: MemoryTokenStore(),
    client: cloud.client,
  ),
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => null,
  now: () => DateTime(2026, 10, 7, 10),
  google: google,
);

void main() {
  testWidgets(
    'with phone sign-in off, the owner signs in with Google and goes straight to the business, named by Google',
    (tester) async {
      final cloud = FakeCloud()..phoneOn = false;
      final google = FakeGoogle();
      await tester.pumpWidget(MycaApp(state: _hosted(cloud, google)));
      await tester.pumpAndSettle();

      expect(find.text('Sign in'), findsOneWidget);
      expect(find.text('Continue with Google'), findsOneWidget);
      expect(find.widgetWithText(TextField, 'Mobile number'), findsNothing);

      await tester.tap(find.text('Continue with Google'));
      await tester.pumpAndSettle();
      expect(google.asked, 1);
      expect(cloud.requests, contains('POST /v1/auth/google'));
      expect(find.text('What should we call you?'), findsNothing);
      expect(find.text('Tell us about the business'), findsOneWidget);
    },
  );

  testWidgets('closing the Google chooser leaves the owner where they were', (
    tester,
  ) async {
    final cloud = FakeCloud()..phoneOn = false;
    final google = FakeGoogle(token: null);
    await tester.pumpWidget(MycaApp(state: _hosted(cloud, google)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue with Google'));
    await tester.pumpAndSettle();
    expect(cloud.requests, isNot(contains('POST /v1/auth/google')));
    expect(find.text('Continue with Google'), findsOneWidget);
    expect(find.textContaining('not'), findsNothing);
  });

  testWidgets('a token the server refuses shows a plain message', (
    tester,
  ) async {
    final cloud = FakeCloud()..phoneOn = false;
    await tester.pumpWidget(
      MycaApp(state: _hosted(cloud, FakeGoogle(token: 'forged'))),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue with Google'));
    await tester.pumpAndSettle();
    expect(
      find.text('Google could not confirm who you are. Try again.'),
      findsOneWidget,
    );
  });

  testWidgets(
    'with both on, Google comes first and the mobile number is offered below',
    (tester) async {
      final cloud = FakeCloud();
      await tester.pumpWidget(MycaApp(state: _hosted(cloud, FakeGoogle())));
      await tester.pumpAndSettle();
      expect(find.text('Continue with Google'), findsOneWidget);
      expect(find.text('Or use your mobile number'), findsOneWidget);
      expect(find.widgetWithText(TextField, 'Mobile number'), findsOneWidget);
      expect(
        tester.getTopLeft(find.text('Continue with Google')).dy,
        lessThan(tester.getTopLeft(find.text('Send code')).dy),
      );
    },
  );

  test('signing out of MyCA also signs out of Google', () async {
    final cloud = FakeCloud()..userName = 'Asha';
    final google = FakeGoogle();
    final state = _hosted(cloud, google);
    await state.cloud!.signInWithGoogle('google-id-token');
    expect(state.cloud!.signedIn, isTrue);
    await state.signOut();
    expect(state.cloud!.signedIn, isFalse);
    expect(google.signedOut, 1);
  });
}
