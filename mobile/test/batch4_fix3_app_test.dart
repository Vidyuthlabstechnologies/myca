import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:myca/api/models.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/ims_screen.dart';
import 'package:myca/screens/tds_credit_screen.dart';
import 'package:myca/widgets.dart' show StatusTag;

import 'screen_walks.dart' show phone;
import 'batch4_fix2_app_test.dart' show narrowPhone, signedInScripted, used;
import 'batch4_fix_app_test.dart' show Answer, imsRow, over, refused, says, scriptedSession, typeSecondStep, usedAlready, waitingForSecondStep, withManyRows;
import 'fake_api.dart';
import 'fake_cloud.dart';
import 'ims_test.dart' show openIms;
import 'security_test.dart' show hosted, ownerWithBusiness, phoneCodeSignIn, press, wrongCode;
import 'tds_credit_test.dart' show openCheck;

const _restart = 'Too many wrong codes. Start the setup again.';
const _setup = 'Start the two-step setup again.';
const _unknown = 'Something went wrong (SOMETHING_NEW).';

const _counts = <int?>[null, 0, 1, 3];

const _sweep = <String, List<String>>{
  'INVALID_CODE': [wrongCode, over, 'That code is not right. 1 try left.', 'That code is not right. 3 tries left.'],
  'CODE_USED': [over, over, usedAlready, usedAlready],
  'CODE_EXPIRED': [over, over, over, over],
  'TOO_MANY_ATTEMPTS': [over, over, over, over],
  'ENROLMENT_RESTART': [_restart, _restart, _restart, _restart],
  'NOT_ENROLLING': [_setup, _setup, _setup, _setup],
  'SOMETHING_NEW': [_unknown, _unknown, _unknown, _unknown],
};

const _shortNote = 'Books date it 3 Nov 2026; Form 26AS dates it 12 Aug 2026.';

const _longNote =
    'Books date it 3 Nov 2026 to 28 Nov 2026; Form 26AS dates it 12 Aug 2026 to 30 Aug 2026. '
    'These are the same TDS booked in different quarters, so the amounts agree and no entry needs to be fixed at all.';

const _lateBooked = <String, Object?>{
  'section': '194J',
  'tan': 'LATE12345E',
  'deductor': 'LATE BOOKED LTD',
  'customer': 'LATE BOOKED LTD',
  'quarter': 'Q2 2026-27',
  'in26as': 1200,
  'inBooks': 1200,
  'gap': 0,
  'status': 'matched',
  'note': _shortNote,
};

const _refusal = 'I did not post anything, because:\n· IMS takes up to 500 invoices in one go; pick fewer, or decide in parts.';
const _offline = 'Cannot reach MyCA. Check your connection and try again.';

http.Client _losingTheAnswer(FakeCloud cloud, {required Map<String, Object?> then}) {
  var asked = 0;
  return MockClient((request) async {
    if (request.url.path == '/v1/auth/second-step') {
      asked++;
      if (asked == 1) throw http.ClientException('the answer was lost');
      return http.Response(jsonEncode(then), 400, headers: {'content-type': 'application/json; charset=utf-8'});
    }
    final copy = http.Request(request.method, request.url)
      ..headers.addAll(request.headers)
      ..bodyBytes = request.bodyBytes;
    return http.Response.fromStream(await cloud.client.send(copy));
  });
}

class _Decides extends FakeMycaApi {
  _Decides(int count, this.answer) : super(signedIn: true) {
    has2b = true;
    imsRows
      ..clear()
      ..addAll([for (var i = 0; i < count; i++) imsRow(i)]);
  }

  final Future<ChatReply> Function() answer;

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) {
    if (name != 'ims_decide') return super.propose(name, args);
    return answer();
  }
}

Future<ChatReply> _refused() async => ChatReply.fromJson({'reply': _refusal, 'posted': false, 'blocked': true});

Future<ChatReply> _unreachable() async => throw const MycaApiException(_offline);

Future<void> acceptAllMatched(WidgetTester tester) async {
  await tester.tap(find.widgetWithText(ActionChip, 'Accept all matched'));
  await tester.pumpAndSettle();
}

void expectInView(WidgetTester tester, Finder what, String reason) {
  expect(what, findsOneWidget, reason: '$reason: it is built');
  final screen = tester.getRect(find.byType(Scrollable).last);
  final box = tester.getRect(what);
  expect(box.top, greaterThanOrEqualTo(screen.top), reason: '$reason: $box against the list $screen');
  expect(box.bottom, lessThanOrEqualTo(screen.bottom), reason: '$reason: $box against the list $screen');
}

RenderParagraph paragraphOf(WidgetTester tester, Finder text) =>
    tester.renderObject<RenderParagraph>(find.descendant(of: text, matching: find.byType(RichText)));

Future<void> pushScreen(WidgetTester tester, AppState state, Widget screen) async {
  await tester.pumpWidget(MycaApp(state: state));
  await tester.pumpAndSettle();
  tester.state<NavigatorState>(find.byType(Navigator)).push(MaterialPageRoute<void>(builder: (_) => screen));
  await tester.pumpAndSettle();
}

Future<void> openNoted(WidgetTester tester, Object note, {bool direct = false}) async {
  final api = FakeMycaApi(signedIn: true)..tdsCreditRows.add({..._lateBooked, 'note': note});
  if (direct) return pushScreen(tester, testState(api), const TdsCreditScreen());
  await openCheck(tester, testState(api));
}

void main() {
  group('APP3-1: a spent second-step challenge', () {
    test('a used code with no count is a spent challenge and says the attempt is over; with tries left it still says to wait', () {
      expect(secondStepMessage('CODE_USED', null), over);
      expect(secondStepMessage('CODE_USED', 3), usedAlready);
      expect(secondStepMessage('CODE_USED', 2), usedAlready);
      expect(secondStepMessage('CODE_USED', 1), usedAlready);
      expect(secondStepMessage('CODE_USED', 0), over);
      expect(secondStepMessage('CODE_USED', -1), over);
    });

    test('every refusal of the second step, with no count and with 0, 1 and 3 tries left, says what it said before except a spent challenge', () async {
      final cloud = FakeCloud()..secondStepOn = true;
      final answers = <Answer>[
        for (final code in _sweep.keys)
          for (final left in _counts) (code == 'TOO_MANY_ATTEMPTS' ? 429 : 400, {'ok': false, 'error': code, 'attemptsRemaining': ?left}),
      ];
      final session = await waitingForSecondStep(cloud, scriptedSession(cloud, {'/v1/auth/second-step': answers}));
      for (final entry in _sweep.entries) {
        for (var i = 0; i < _counts.length; i++) {
          await expectLater(session.completeSecondStep('246810'), says(entry.value[i]), reason: '${entry.key} with ${_counts[i] ?? 'no count'} tries left');
        }
      }
      expect(session.secondStepPending, isTrue);
      expect(session.signedIn, isFalse);
    });

    test('a right code whose answer was lost: the retries are told the attempt is over, not to wait for a code that can never work', () async {
      final cloud = FakeCloud()..secondStepOn = true;
      final session = CloudSession(
        baseUrl: 'https://api.example.test',
        tokens: MemoryTokenStore(),
        client: _losingTheAnswer(cloud, then: {'ok': false, 'error': 'CODE_USED'}),
      );
      await session.requestCode('9876543210');
      await session.verifyCode(FakeCloud.code);
      await expectLater(session.completeSecondStep('246810'), says(_offline));
      for (final fresh in ['135790', '864209', '314159']) {
        await expectLater(session.completeSecondStep(fresh), says(over));
      }
      expect(session.secondStepPending, isTrue);
      session.cancelSecondStep();
      expect(session.secondStepPending, isFalse);
    });

    test('a replayed authenticator step keeps its wait sentence, and the count decides', () async {
      final cloud = FakeCloud()..secondStepOn = true;
      final session = await waitingForSecondStep(
        cloud,
        scriptedSession(cloud, {
          '/v1/auth/second-step': [used(4), used(2), used(1), used(0), refused(400, 'CODE_USED')],
        }),
      );
      await expectLater(session.completeSecondStep('246810'), says(usedAlready));
      await expectLater(session.completeSecondStep('246810'), says(usedAlready));
      await expectLater(session.completeSecondStep('246810'), says(usedAlready));
      await expectLater(session.completeSecondStep('246810'), says(over));
      await expectLater(session.completeSecondStep('246810'), says(over));
    });

    test('turning two-step off and renewing the recovery codes keep the wait sentence for a replayed code, with or without a count', () async {
      final session = await signedInScripted({
        '/v1/me/second-step/disable': [refused(400, 'CODE_USED'), used(2)],
        '/v1/me/second-step/recovery-codes': [refused(400, 'CODE_USED'), used(2)],
      });
      await expectLater(session.disableSecondStep('246810'), says(usedAlready));
      await expectLater(session.disableSecondStep('246810'), says(usedAlready));
      await expectLater(session.newRecoveryCodes('246810'), says(usedAlready));
      await expectLater(session.newRecoveryCodes('246810'), says(usedAlready));
    });

    testWidgets('the sign-in screen says the attempt is over for a spent challenge, Start over begins again, and a right code then signs in', (tester) async {
      final (cloud, _) = await ownerWithBusiness();
      cloud.secondStepOn = true;
      await tester.pumpWidget(MycaApp(state: hosted(cloud, MemoryTokenStore())));
      await tester.pumpAndSettle();
      await phoneCodeSignIn(tester);
      expect(find.text('Enter your authenticator code'), findsOneWidget);

      cloud.secondStepError = 'CODE_USED';
      await typeSecondStep(tester, cloud.totpCode);
      expect(find.text(over), findsOneWidget);
      expect(find.text(usedAlready), findsNothing);
      expect(find.text('Start over'), findsOneWidget);

      await typeSecondStep(tester, cloud.totpCode);
      expect(find.text(over), findsOneWidget);
      expect(find.text(usedAlready), findsNothing);

      await press(tester, find.text('Start over'));
      expect(find.text('Your mobile number'), findsOneWidget);
      expect(find.text(over), findsNothing);

      cloud.secondStepError = '';
      await phoneCodeSignIn(tester);
      await typeSecondStep(tester, cloud.totpCode);
      expect(find.text('Asha Traders'), findsOneWidget);
    });
  });

  group('APP3-2: the note on a Form 26AS row', () {
    test('a row carries the note the engine sends, and a missing, null or blank note is no note', () {
      final row = TdsCreditRow.fromJson(_lateBooked);
      expect(row.note, _shortNote);
      expect([row.section, row.tan, row.deductor, row.customer, row.quarter, row.status], ['194J', 'LATE12345E', 'LATE BOOKED LTD', 'LATE BOOKED LTD', 'Q2 2026-27', 'matched']);
      expect([row.in26as, row.inBooks, row.gap], [1200, 1200, 0]);
      expect(row.who, 'LATE BOOKED LTD');
      expect(TdsCreditRow.fromJson({..._lateBooked}..remove('note')).note, '');
      expect(TdsCreditRow.fromJson({..._lateBooked, 'note': null}).note, '');
      expect(TdsCreditRow.fromJson({..._lateBooked, 'note': '   '}).note, '');
      expect(TdsCreditRow.fromJson('not a row').note, '');
    });

    test('the check hands each row its own note', () {
      final check = TdsCreditCheck.fromTool({
        'ok': true,
        'data': {
          'fy': '2026-27',
          'source': '26AS imported 2026-11-08',
          'rows': [
            _lateBooked,
            {..._lateBooked, 'deductor': 'PLAIN LTD'}..remove('note'),
          ],
          'totals': {'in26as': 2400, 'inBooks': 2400, 'gap': 0},
          'note': 'AIS is not read yet.',
        },
      })!;
      expect(check.rows.map((row) => row.note).toList(), [_shortNote, '']);
      expect(check.note, 'AIS is not read yet.');
    });

    testWidgets('a row paired across quarters shows the engine note on its own card, below its status; the rows without a note are as they were', (tester) async {
      await openNoted(tester, _shortNote);
      final noted = find.byKey(const ValueKey('tds26.4'));
      expect(noted, findsOneWidget);
      expect(find.text(_shortNote), findsOneWidget);
      expect(find.descendant(of: noted, matching: find.text(_shortNote)), findsOneWidget);
      expect(find.descendant(of: noted, matching: find.text('LATE BOOKED LTD · Q2 2026-27')), findsOneWidget);
      expect(find.descendant(of: noted, matching: find.text('26AS ₹1,200.00 · books ₹1,200.00 · Section 194J · TAN LATE12345E')), findsOneWidget);
      expect(find.descendant(of: noted, matching: find.text('matched')), findsOneWidget);
      expect(find.descendant(of: noted, matching: find.byType(StatusTag)), findsOneWidget);
      final tag = tester.getRect(find.descendant(of: noted, matching: find.byType(StatusTag)));
      expect(tester.getRect(find.text(_shortNote)).top, greaterThanOrEqualTo(tag.bottom));

      for (var i = 0; i < 4; i++) {
        final plain = find.byKey(ValueKey('tds26.$i'));
        expect(find.descendant(of: plain, matching: find.byType(Text)), findsNWidgets(3), reason: 'row $i: title, figures and status, nothing more');
      }
    });

    testWidgets('an empty note adds nothing to the row', (tester) async {
      await openNoted(tester, '');
      final row = find.byKey(const ValueKey('tds26.4'));
      expect(row, findsOneWidget);
      expect(find.descendant(of: row, matching: find.byType(Text)), findsNWidgets(3));
      expect(find.descendant(of: row, matching: find.text('matched')), findsOneWidget);
    });

    for (final (note, length) in [(_shortNote, 57), (_longNote, 200)]) {
      testWidgets('at 2x text size on a 360 dp phone a $length-character note is whole on its row and nothing overflows', (tester) async {
        expect(note, hasLength(length));
        await narrowPhone(tester, 2.0);
        await openNoted(tester, note, direct: true);
        final text = find.text(note);
        expect(text, findsOneWidget);
        await tester.scrollUntilVisible(text, 200, scrollable: find.byType(Scrollable).first);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        final paragraph = paragraphOf(tester, text);
        expect(paragraph.didExceedMaxLines, isFalse);
        final box = tester.getRect(text);
        final card = tester.getRect(find.byKey(const ValueKey('tds26.4')));
        expect(box.left, greaterThanOrEqualTo(0));
        expect(box.right, lessThanOrEqualTo(360));
        expect(card.left, greaterThanOrEqualTo(0));
        expect(card.right, lessThanOrEqualTo(360));
        expect(box.top, greaterThanOrEqualTo(card.top));
        expect(box.bottom, lessThanOrEqualTo(card.bottom));
        final style = tester.widget<Text>(text);
        expect(style.maxLines, isNull);
        expect(style.overflow, isNot(TextOverflow.ellipsis));
      });
    }

    testWidgets('the screen with a note keeps its tap targets, labels and contrast', (tester) async {
      await phone(tester);
      await openNoted(tester, _shortNote);
      final handle = tester.ensureSemantics();
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      handle.dispose();
    });
  });

  group('APP3-3: the IMS screen shows the answer to the tapped action', () {
    for (final count in [7, 12, 60, 620]) {
      testWidgets('$count rows: a refused Accept all matched shows its label and the engine sentence', (tester) async {
        await phone(tester);
        await openIms(tester, testState(_Decides(count, _refused)));
        await acceptAllMatched(tester);
        expectInView(tester, find.text('NOT POSTED'), '$count rows, label');
        expectInView(tester, find.textContaining('IMS takes up to 500 invoices in one go'), '$count rows, sentence');
        expect(find.text('Post it'), findsNothing);
        expect(tester.takeException(), isNull);
      });

      testWidgets('$count rows: an answer lost on the way shows its sentence', (tester) async {
        await phone(tester);
        await openIms(tester, testState(_Decides(count, _unreachable)));
        await acceptAllMatched(tester);
        expectInView(tester, find.text(_offline), '$count rows, network error');
        expect(tester.takeException(), isNull);
      });
    }

    testWidgets('a posted decision shows its Posted answer, even when the list was scrolled back up before posting', (tester) async {
      await phone(tester);
      await openIms(tester, testState(withManyRows(60)));
      await acceptAllMatched(tester);
      expect(find.text('Post it'), findsOneWidget);
      tester.state<ScrollableState>(find.byType(Scrollable).last).position.jumpTo(0);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Post it'));
      await tester.pumpAndSettle();
      expectInView(tester, find.text('POSTED'), 'the label');
      expectInView(tester, find.textContaining('rows accepted in IMS for 2026-10'), 'the sentence');
    });

    testWidgets('a preview still comes into view', (tester) async {
      await phone(tester);
      await openIms(tester, testState(withManyRows(60)));
      await acceptAllMatched(tester);
      expectInView(tester, find.text('NOT POSTED YET'), 'the preview label');
      expect(find.text('Post it'), findsOneWidget);
    });

    testWidgets('at 2x text size on a 360 dp phone the refusal is whole and in view', (tester) async {
      await narrowPhone(tester, 2.0);
      await pushScreen(tester, testState(_Decides(12, _refused)), const ImsScreen(period: '2026-10'));
      await acceptAllMatched(tester);
      expect(tester.takeException(), isNull);
      expectInView(tester, find.text('NOT POSTED'), 'label');
      expectInView(tester, find.textContaining('IMS takes up to 500 invoices in one go'), 'sentence');
    });
  });
}
