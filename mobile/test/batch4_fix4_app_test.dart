import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:myca/api/models.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/main.dart';

import 'accessibility_test.dart' show phone;
import 'batch4_fix2_app_test.dart' show signedInScripted;
import 'batch4_fix_app_test.dart' show refused, says, scriptedSession, wrong;
import 'cloud_test.dart' show signedIn;
import 'fake_api.dart';
import 'fake_cloud.dart';

AuditTrail trailWith(Map<String, Object?> chain) => AuditTrail.fromTool({
  'ok': true,
  'data': {
    'from': '2026-10-01',
    'to': '2026-10-31',
    'label': '2026-10',
    'view': 'changes',
    'events': <Object?>[],
    'count': 0,
    'total': 0,
    'more': false,
    'chain': chain,
    'ledger': {'ok': true, 'last': 3},
  },
})!;

void main() {
  test('the chain sentence names the events recorded before sealing that the chain does not cover', () {
    expect(
      trailWith({'ok': true, 'chained': 2, 'unchained': 4}).chainWords,
      'Log chain verified (2 events; the client an event is filed under is not sealed; 4 earlier events were recorded before sealing and are not covered)',
    );
    expect(
      trailWith({'ok': true, 'chained': 1, 'unchained': 1}).chainWords,
      'Log chain verified (1 event; the client an event is filed under is not sealed; 1 earlier event was recorded before sealing and is not covered)',
    );
    expect(
      trailWith({'ok': true, 'chained': 0, 'unchained': 7}).chainWords,
      'Log chain verified (0 events; 7 earlier events were recorded before sealing and are not covered)',
    );
  });

  test('the chain sentence is unchanged when every event is sealed or the count is missing or not a number', () {
    expect(trailWith({'ok': true, 'chained': 2, 'unchained': 0}).chainWords, 'Log chain verified (2 events; the client an event is filed under is not sealed)');
    expect(trailWith({'ok': true, 'chained': 1}).chainWords, 'Log chain verified (1 event; the client an event is filed under is not sealed)');
    expect(trailWith({'ok': true, 'chained': 0, 'unchained': 0}).chainWords, 'Log chain verified (0 events)');
    expect(trailWith({'ok': true, 'chained': 0}).chainWords, 'Log chain verified (0 events)');
    expect(trailWith({'ok': true, 'chained': 3, 'unchained': 'many'}).chainWords, 'Log chain verified (3 events; the client an event is filed under is not sealed)');
    expect(trailWith({'ok': true, 'chained': 3, 'unchained': null}).chainWords, 'Log chain verified (3 events; the client an event is filed under is not sealed)');
    expect(trailWith({'ok': true, 'chained': 3, 'unchained': -2}).chainWords, 'Log chain verified (3 events; the client an event is filed under is not sealed)');
  });

  test('a broken chain keeps its own sentence whatever the unchained count says', () {
    final broken = trailWith({'ok': false, 'error': 'LINK_BROKEN', 'at': 'AUD-000004', 'chained': 2, 'unchained': 4});
    expect(broken.chainOk, isFalse);
    expect(broken.chainWords, 'Log chain broken at AUD-000004');
  });

  testWidgets('the audit trail screen shows the events recorded before sealing, and a long sentence wraps at the largest text size', (tester) async {
    final api = FakeMycaApi(signedIn: true)..auditChain = {'ok': true, 'chained': 2, 'unchained': 4};
    await phone(tester, textScale: 2.0);
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Reports');
    await tester.tap(find.text('Audit trail'));
    await tester.pumpAndSettle();
    expect(
      find.text('Log chain verified (2 events; the client an event is filed under is not sealed; 4 earlier events were recorded before sealing and are not covered)'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  group('turning two-step on counts the wrong codes down', () {
    test('each wrong code says how many tries are left, the fifth ends the setup, and starting again works', () async {
      final cloud = FakeCloud();
      final session = await signedIn(cloud);
      await session.beginSecondStep();
      for (final words in ['4 tries left.', '3 tries left.', '2 tries left.', '1 try left.']) {
        await expectLater(session.confirmSecondStep('000000'), says('That code is not right. $words'));
      }
      await expectLater(session.confirmSecondStep('000000'), says('Too many wrong codes. Start the setup again.'));
      await expectLater(session.confirmSecondStep(cloud.totpCode), says('Start the two-step setup again.'));
      await session.beginSecondStep();
      expect(await session.confirmSecondStep(cloud.totpCode), hasLength(8));
    });

    test('a refusal that comes without a count keeps the plain sentence, and a count of none left never borrows the wait-15-minutes sentence', () async {
      final session = await signedInScripted({
        '/v1/me/second-step/confirm': [
          (400, {'ok': false, 'error': 'INVALID_CODE'}),
          wrong(2),
          wrong(0),
          (400, {'ok': false, 'error': 'INVALID_CODE', 'attemptsRemaining': 'soon'}),
        ],
      });
      await expectLater(session.confirmSecondStep('000000'), says('That code is not right. Check it and try again.'));
      await expectLater(session.confirmSecondStep('000000'), says('That code is not right. 2 tries left.'));
      await expectLater(session.confirmSecondStep('000000'), says('That code is not right. Check it and try again.'));
      await expectLater(session.confirmSecondStep('000000'), says('That code is not right. Check it and try again.'));
    });
  });

  group('a busy or failing server is said in words', () {
    test('SERVER_BUSY and INTERNAL_ERROR have their own sentences on a signed-in call and at sign-in, and an unknown code still shows itself', () async {
      final session = await signedInScripted({
        '/v1/me/second-step': [refused(503, 'SERVER_BUSY'), refused(500, 'INTERNAL_ERROR'), refused(500, 'SOMETHING_NEW')],
      });
      await expectLater(session.secondStepStatus(), says('MyCA is busy for a moment. Try again in a minute.'));
      await expectLater(session.secondStepStatus(), says('Something went wrong on our side. Try again in a minute.'));
      await expectLater(session.secondStepStatus(), says('Something went wrong (SOMETHING_NEW).'));

      final signingIn = scriptedSession(FakeCloud(), {
        '/v1/auth/otp': [refused(503, 'SERVER_BUSY')],
      });
      await expectLater(signingIn.requestCode('9876543210'), says('MyCA is busy for a moment. Try again in a minute.'));
    });

    test('a busy or failing server on the token refresh keeps the person signed in and says so in words', () async {
      final cloud = FakeCloud();
      final tokens = MemoryTokenStore();
      final session = scriptedSession(cloud, {
        '/v1/me/second-step': [for (var i = 0; i < 3; i += 1) refused(401, 'UNAUTHENTICATED')],
        '/v1/auth/refresh': [refused(503, 'SERVER_BUSY'), refused(500, 'INTERNAL_ERROR'), refused(429, 'TOO_MANY_REQUESTS')],
      }, tokens);
      await session.requestCode('9876543210');
      await session.verifyCode(FakeCloud.code);
      for (var i = 0; i < 3; i += 1) {
        await expectLater(session.secondStepStatus(), says('MyCA is busy for a moment. Try again in a minute.'));
        expect(session.signedIn, isTrue);
        expect(tokens.values, isNotEmpty);
      }
      expect((await session.secondStepStatus()).enabled, isFalse);
      expect(cloud.refreshes, 0);
    });

    test('a refused refresh still signs the person out', () async {
      final cloud = FakeCloud();
      final tokens = MemoryTokenStore();
      final session = scriptedSession(cloud, {
        '/v1/me/second-step': [refused(401, 'UNAUTHENTICATED')],
        '/v1/auth/refresh': [refused(400, 'DEVICE_REVOKED')],
      }, tokens);
      await session.requestCode('9876543210');
      await session.verifyCode(FakeCloud.code);
      await expectLater(session.secondStepStatus(), throwsA(isA<SignedOutException>()));
      expect(session.signedIn, isFalse);
      expect(tokens.values, isEmpty);
    });

    test('a gateway error page with no JSON in it is said as busy and not read as an empty reply', () async {
      final cloud = FakeCloud();
      final pages = {
        '/v1/auth/otp': [503],
        '/v1/me/second-step': [502, 503, 504],
      };
      final client = MockClient((request) async {
        final queue = pages[request.url.path];
        if (queue != null && queue.isNotEmpty) {
          return http.Response('<html><body>Bad gateway</body></html>', queue.removeAt(0), headers: {'content-type': 'text/html'});
        }
        final copy = http.Request(request.method, request.url)
          ..headers.addAll(request.headers)
          ..bodyBytes = request.bodyBytes;
        return http.Response.fromStream(await cloud.client.send(copy));
      });
      final session = CloudSession(baseUrl: 'https://api.example.test', tokens: MemoryTokenStore(), client: client);
      await expectLater(session.requestCode('9876543210'), says('MyCA is busy for a moment. Try again in a minute.'));
      await session.requestCode('9876543210');
      await session.verifyCode(FakeCloud.code);
      for (var i = 0; i < 3; i += 1) {
        await expectLater(session.secondStepStatus(), says('MyCA is busy for a moment. Try again in a minute.'));
      }
      expect((await session.secondStepStatus()).enabled, isFalse);
    });
  });

  group('a restore that is too large', () {
    test('says it is too large to restore and that the books were not changed, while an upload keeps the 8 MB sentence', () async {
      final books = '/v1/businesses/${FakeCloud.businessId}';
      final session = scriptedSession(FakeCloud(), {
        '$books/replace': [refused(413, 'BODY_TOO_LARGE'), refused(503, 'SERVER_BUSY'), refused(400, 'INVALID_BACKUP')],
        '$books/uploads': [refused(413, 'BODY_TOO_LARGE')],
      });
      await session.requestCode('9876543210');
      await session.verifyCode(FakeCloud.code);
      await session.createBusiness(name: 'Asha Traders', state: '29');
      await expectLater(session.replaceBooks({'books': {}}), says('That file is too large to restore from the app. Your books were not changed.'));
      await expectLater(session.replaceBooks({'books': {}}), says('MyCA is busy for a moment. Try again in a minute.'));
      await expectLater(session.replaceBooks({'books': {}}), says('Something went wrong (INVALID_BACKUP).'));
      await expectLater(session.api.upload('bank.csv', 'date,amount'), says('That file is larger than 8 MB. Export a shorter period and try again.'));
    });
  });
}
