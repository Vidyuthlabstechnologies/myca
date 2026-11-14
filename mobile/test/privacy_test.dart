import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/privacy_rights_screen.dart';

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

      await tester.tap(find.text('I am 18 or over'));

      await tester.pump();

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
    await tester.tap(find.text('I am 18 or over'));
    await tester.pump();
    await tester.tap(find.text('I agree'));
    await tester.pumpAndSettle();
    expect(find.text('How MyCA uses your information'), findsNothing);
    expect(cloud.consents, ['privacy@v-test']);
  });

  testWidgets('"I agree" stays off until the person says they are 18 or over', (tester) async {
    final cloud = FakeCloud()..noticeAccepted = false;
    await tester.pumpWidget(MycaApp(state: _hosted(_session(cloud, MemoryTokenStore()))));
    await tester.pumpAndSettle();
    await _signIn(tester);
    final agree = find.byKey(const ValueKey('consent.agree'));
    expect(tester.widget<FilledButton>(agree).onPressed, isNull);
    await tester.tap(find.text('I am 18 or over'));
    await tester.pump();
    expect(tester.widget<FilledButton>(agree).onPressed, isNotNull);
    final handle = tester.ensureSemantics();
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    handle.dispose();
  });

  testWidgets('the privacy notice can be read before a number is typed', (tester) async {
    final cloud = FakeCloud()..noticeAccepted = false;
    await tester.pumpWidget(MycaApp(state: _hosted(_session(cloud, MemoryTokenStore()))));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('signIn.privacy')));
    await tester.pumpAndSettle();
    expect(find.text('How MyCA uses your information'), findsOneWidget);
    expect(find.text('I agree'), findsNothing);
    expect(cloud.consents, isEmpty);
  });

  testWidgets('your privacy rights shows the Grievance Officer and sends a complaint with a reference', (tester) async {
    final cloud = FakeCloud()..userName = 'Asha';
    final session = _session(cloud, MemoryTokenStore());
    await session.requestCode('9876543210');
    await session.verifyCode(FakeCloud.code);
    await tester.pumpWidget(MaterialApp(home: AppScope(state: _hosted(session), child: const PrivacyRightsScreen())));
    await tester.pumpAndSettle();
    expect(find.textContaining('Grievance Officer: Asha Rao, grievance@myca.test'), findsOneWidget);
    expect(find.textContaining('[phone'), findsNothing);
    expect(find.byKey(const ValueKey('rights.link.terms')), findsOneWidget);
    final handle = tester.ensureSemantics();
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    handle.dispose();
    await tester.tap(find.byKey(const ValueKey('rights.ask.grievance')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('rights.message')), 'My invoice was shared with the wrong person.');
    await tester.tap(find.byKey(const ValueKey('rights.send')));
    await tester.pumpAndSettle();
    expect(cloud.privacyRequests.single['kind'], 'grievance');
    expect(find.textContaining('DPR-20261114-ABC0'), findsWidgets);
  });
}
