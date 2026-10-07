import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';
import 'fake_cloud.dart';

CloudSession _session(FakeCloud cloud, MemoryTokenStore tokens) => CloudSession(
  baseUrl: 'https://api.example.test',
  tokens: tokens,
  client: cloud.client,
);

AppState _hosted(CloudSession session) => AppState(
  cloud: session,
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => null,
  now: () => DateTime(2026, 10, 6, 10),
);

Future<void> _signIn(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField), '98765 43210');
  await tester.tap(find.text('Send code'));
  await tester.pumpAndSettle();
  await tester.enterText(find.byType(TextField), FakeCloud.code);
  await tester.tap(find.text('Sign in'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'a new user reads the privacy notice after the code, and nothing else opens until they agree',
    (tester) async {
      final cloud = FakeCloud()..noticeAccepted = false;
      final state = _hosted(_session(cloud, MemoryTokenStore()));
      await tester.pumpWidget(MycaApp(state: state));
      await tester.pumpAndSettle();
      await _signIn(tester);

      expect(find.text('How MyCA uses your information'), findsOneWidget);
      expect(find.text('Draft for legal review.'), findsOneWidget);
      expect(find.text('Your rights'), findsOneWidget);
      expect(
        cloud.requests.where((r) => r.startsWith('GET /v1/businesses')),
        isEmpty,
        reason: 'no business data is asked for before consent',
      );

      await tester.tap(find.text('I agree'));
      await tester.pumpAndSettle();
      expect(cloud.consents, ['privacy@v-test']);
      expect(find.text('What should we call you?'), findsOneWidget);
    },
  );

  testWidgets('"Not now" signs out and records nothing', (tester) async {
    final cloud = FakeCloud()..noticeAccepted = false;
    final session = _session(cloud, MemoryTokenStore());
    await tester.pumpWidget(MycaApp(state: _hosted(session)));
    await tester.pumpAndSettle();
    await _signIn(tester);
    await tester.tap(find.text('Not now, sign me out'));
    await tester.pumpAndSettle();
    expect(session.signedIn, isFalse);
    expect(cloud.consents, isEmpty);
    expect(find.text('Your mobile number'), findsOneWidget);
  });

  testWidgets('a returning user is shown a changed notice when the app opens', (
    tester,
  ) async {
    final cloud = FakeCloud()..userName = 'Asha';
    final tokens = MemoryTokenStore();
    final first = _session(cloud, tokens);
    await first.requestCode('9876543210');
    await first.verifyCode(FakeCloud.code);
    await first.createBusiness(name: 'Asha Traders', state: '29');
    cloud.noticeAccepted = false;

    await tester.pumpWidget(MycaApp(state: _hosted(_session(cloud, tokens))));
    await tester.pumpAndSettle();
    expect(find.text('How MyCA uses your information'), findsOneWidget);
    await tester.tap(find.text('I agree'));
    await tester.pumpAndSettle();
    expect(find.text('How MyCA uses your information'), findsNothing);
    expect(cloud.consents, ['privacy@v-test']);
  });
}
