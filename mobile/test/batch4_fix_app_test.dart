import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:myca/api/models.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/main.dart';
import 'package:myca/widgets.dart' show Bubble, RowCard;

import 'screen_walks.dart' show phone;
import 'cloud_test.dart' show sessionOn, signedIn;
import 'fake_api.dart';
import 'fake_cloud.dart';
import 'gstr2b_test.dart' show scrollTo;
import 'ims_test.dart' show decideInSheet, openIms, rowOf;
import 'security_test.dart' show expectTooltips, hosted, ownerWithBusiness, phoneCodeSignIn, press;
import 'supplier_terms_test.dart' show enter, openSheet, save;

const over = 'This sign-in attempt is over. Tap Start over and sign in again.';
const usedAlready = 'That code was already used. Wait for the next one on your authenticator and try again.';
const noteSeven = 'You used a recovery code. 7 left. Make new ones in Security.';
const mediumWords = 'The 45-day rule covers micro and small suppliers only.';

typedef Answer = (int, Map<String, Object?>);

Answer wrong(int left) => (400, {'ok': false, 'error': 'INVALID_CODE', 'attemptsRemaining': left});

Answer refused(int status, String error) => (status, {'ok': false, 'error': error});

Matcher says(String sentence) => throwsA(isA<MycaApiException>().having((e) => e.message, 'message', sentence));

http.Client scripted(FakeCloud cloud, Map<String, List<Answer>> answers) {
  final queues = {for (final entry in answers.entries) entry.key: [...entry.value]};
  return MockClient((request) async {
    final queue = queues[request.url.path];
    if (queue != null && queue.isNotEmpty) {
      final (status, body) = queue.removeAt(0);
      return http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json; charset=utf-8'});
    }
    final copy = http.Request(request.method, request.url)
      ..headers.addAll(request.headers)
      ..bodyBytes = request.bodyBytes;
    return http.Response.fromStream(await cloud.client.send(copy));
  });
}

CloudSession scriptedSession(FakeCloud cloud, Map<String, List<Answer>> answers, [MemoryTokenStore? tokens]) =>
    CloudSession(baseUrl: 'https://api.example.test', tokens: tokens ?? MemoryTokenStore(), client: scripted(cloud, answers));

AppState hostedOn(CloudSession session) => AppState(
      cloud: session,
      store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true, isLockEnabled: false),
      pickTextFile: (_) async => null,
      now: () => DateTime(2026, 10, 6, 10),
    );

Future<dynamic> secondStepOutcome(CloudSession session, String code) => session.completeSecondStep(code);

Future<CloudSession> waitingForSecondStep(FakeCloud cloud, [CloudSession? session]) async {
  final waiting = session ?? sessionOn(cloud);
  await waiting.requestCode('9876543210');
  await waiting.verifyCode(FakeCloud.code);
  expect(waiting.secondStepPending, isTrue);
  return waiting;
}

Future<void> typeSecondStep(WidgetTester tester, String code) async {
  await tester.enterText(find.byType(TextField), code);
  await press(tester, find.text('Sign in'));
}

Future<void> signInWithRecoveryCode(WidgetTester tester, FakeCloud cloud, AppState state) async {
  await tester.pumpWidget(MycaApp(key: UniqueKey(), state: state));
  await tester.pumpAndSettle();
  await phoneCodeSignIn(tester);
  expect(find.text('Enter your authenticator code'), findsOneWidget);
  await typeSecondStep(tester, cloud.recoveryCode);
}

class _Payables extends FakeMycaApi {
  _Payables(this.items) : super(signedIn: true);

  final List<Map<String, Object?>> items;

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    if (name != 'week_ahead') return super.query(name, args);
    return {
      'ok': true,
      'data': {
        'today': '2026-10-05',
        'until': '2026-10-12',
        'items': items,
        'overdue': items.where((item) => item['overdue'] == true).length,
        'count': items.length,
      },
    };
  }
}

class _AsRole extends FakeMycaApi {
  _AsRole(this.role) : super(signedIn: true);

  final String role;

  @override
  Future<Snapshot> snapshot() async {
    final books = await super.snapshot();
    return Snapshot(
      company: books.company,
      invoices: books.invoices,
      purchases: books.purchases,
      expenses: books.expenses,
      creditNotes: books.creditNotes,
      customerTerms: books.customerTerms,
      quotes: books.quotes,
      users: books.users,
      activeUser: FirmUser(userId: 'USR-X', name: 'Someone', role: role, locked: false),
      sharedAsOf: books.sharedAsOf,
    );
  }
}

class _DuesDown extends FakeMycaApi {
  _DuesDown({required this.throws}) : super(signedIn: true);

  final bool throws;

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) {
    if (name != 'supplier_dues') return super.query(name, args);
    if (throws) throw const MycaApiException('MyCA is out of reach.');
    return Future.value({'ok': false, 'error': 'UNKNOWN_TOOL'});
  }
}

class _MovingDues extends FakeMycaApi {
  _MovingDues() : super(signedIn: true);

  @override
  Future<ChatReply> confirm(String token) async {
    final reply = await super.confirm(token);
    supplierDues['bills'] = [dueRow('BILL-0003', '2026-11-17', msme: true, date: '2026-10-02', total: 5900)];
    return reply;
  }
}

Map<String, Object?> dueRow(String billId, String payBy, {required bool msme, String date = '2026-10-01', num total = 11800}) => {
      'billId': billId,
      'supplier': 'Fabric Co',
      'gstin': '27AABCT1332L1ZE',
      'date': date,
      'total': total,
      'outstanding': total,
      'payBy': payBy,
      'daysLeft': 30,
      'overdue': false,
      'msme': msme,
    };

FakeMycaApi staleStamps(FakeMycaApi api) {
  api.purchases.first
    ..['dueDate'] = '2026-08-21'
    ..['msme'] = true;
  api.purchases.add({
    'id': 'BILL-0003',
    'date': '2026-10-02',
    'partyName': 'Fabric Co',
    'partyGstin': '27AABCT1332L1ZE',
    'total': 5900,
    'status': 'posted',
    'dueDate': '2026-12-02',
    'msme': true,
  });
  api.supplierDues['bills'] = [
    dueRow('BILL-0001', '2026-08-21', msme: true, date: '2026-08-06', total: 42000),
    dueRow('BILL-0003', '2026-12-17', msme: true, date: '2026-10-02', total: 5900),
  ];
  return api;
}

Future<void> openThread(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(key: UniqueKey(), state: testState(api)));
  await tester.pumpAndSettle();
  await tapRow(tester, 'Purchases');
  await tester.tap(find.text('Fabric Co'));
  await tester.pumpAndSettle();
}

Map<String, Object?> imsRow(int i) {
  final matched = i % 10 == 0;
  final no = i.toString().padLeft(4, '0');
  return {
    'key': '2026-10|27AAACB$no|N$no|B2B',
    'section': 'B2B',
    'supplierGstin': '27AAACB${no}B1Z5',
    'supplierName': 'SUPPLIER $no',
    'invoiceNo': 'N-$no',
    'invoiceDate': '2026-10-15',
    'taxableValue': 1000,
    'cgst': 0,
    'sgst': 0,
    'igst': 180,
    'cess': 0,
    'totalValue': 1180,
    'credit': 180,
    'itcAvailability': 'Y',
    'billId': matched ? 'BILL-$no' : '',
    'match': matched ? 'matched' : 'not in books',
    'why': matched ? 'Matches BILL-$no in your books.' : 'No purchase bill with this number from this supplier.',
    'suggested': matched ? 'accept' : 'pending',
    'decision': '',
    'note': '',
    'decidedBy': '',
    'decidedOn': '',
  };
}

FakeMycaApi withManyRows(int count) {
  final api = FakeMycaApi(signedIn: true)..has2b = true;
  api.imsRows
    ..clear()
    ..addAll([for (var i = 0; i < count; i++) imsRow(i)]);
  return api;
}

Finder previewCard() => find.byWidgetPredicate((widget) => widget is Bubble && widget.label == 'Not posted yet');

Future<void> decideInTallSheet(WidgetTester tester, String key, String choice) async {
  await scrollTo(tester, rowOf(key));
  await tester.tap(rowOf(key));
  await tester.pumpAndSettle();
  final sheet = find.byType(BottomSheet);
  final chip = find.descendant(of: sheet, matching: find.widgetWithText(ChoiceChip, choice));
  await tester.scrollUntilVisible(chip, 100, scrollable: find.descendant(of: sheet, matching: find.byType(Scrollable)));
  await tester.ensureVisible(chip);
  await tester.pumpAndSettle();
  await tester.tap(chip);
  await tester.pumpAndSettle();
  await tester.tap(find.descendant(of: sheet, matching: find.text('Save')));
  await tester.pumpAndSettle();
}

void expectPreviewInView(WidgetTester tester, String reason) {
  expect(find.text('Post it'), findsOneWidget, reason: '$reason: the bar is showing');
  expect(previewCard(), findsOneWidget, reason: '$reason: the preview is built');
  final screen = tester.getRect(find.byType(Scrollable).last);
  final card = tester.getRect(previewCard());
  expect(card.bottom, lessThanOrEqualTo(screen.bottom), reason: '$reason: the card $card against the list $screen');
  if (card.height <= screen.height - 16) {
    expect(card.top, greaterThanOrEqualTo(screen.top), reason: '$reason: the card $card against the list $screen');
  }
}

void main() {
  group('cloud-app-1: signing out ends the phone\'s server session whatever the age of the access token', () {
    test('an access token that ran out is renewed once and exactly one logout reaches the server', () async {
      final cloud = FakeCloud();
      final tokens = MemoryTokenStore();
      final session = await signedIn(cloud, tokens);
      cloud.expireAccessOnce = true;
      await session.signOut();
      expect(cloud.logouts, 1);
      expect(cloud.refreshes, 1);
      expect(cloud.requests.where((r) => r == 'POST /v1/auth/logout'), hasLength(2), reason: 'one refused for the old token, one accepted');
      expect(session.signedIn, isFalse);
      expect(tokens.values, isEmpty);
    });

    test('a signed-in phone with a live token still sends one logout and no refresh', () async {
      final cloud = FakeCloud();
      final tokens = MemoryTokenStore();
      final session = await signedIn(cloud, tokens);
      await session.signOut();
      expect(cloud.logouts, 1);
      expect(cloud.refreshes, 0);
      expect(tokens.values, isEmpty);
    });

    test('when the refresh is refused the phone still signs out without an error', () async {
      final cloud = FakeCloud();
      final tokens = MemoryTokenStore();
      final session = await signedIn(cloud, tokens);
      cloud
        ..expireAccessOnce = true
        ..refreshFails = true;
      await session.signOut();
      expect(cloud.logouts, 0);
      expect(session.signedIn, isFalse);
      expect(tokens.values, isEmpty);
    });

    test('with no connection the phone still signs out', () async {
      final cloud = FakeCloud();
      final tokens = MemoryTokenStore();
      var offline = false;
      final client = MockClient((request) async {
        if (offline) throw http.ClientException('offline');
        final copy = http.Request(request.method, request.url)
          ..headers.addAll(request.headers)
          ..bodyBytes = request.bodyBytes;
        return http.Response.fromStream(await cloud.client.send(copy));
      });
      final session = CloudSession(baseUrl: 'https://api.example.test', tokens: tokens, client: client);
      await session.requestCode('9876543210');
      await session.verifyCode(FakeCloud.code);
      offline = true;
      await session.signOut();
      expect(session.signedIn, isFalse);
      expect(tokens.values, isEmpty);
    });
  });

  group('cloud-app-2: the second step knows how many tries are left and when the attempt is over', () {
    test('each wrong code counts the tries down, the fifth says the attempt is over, and so does a right code after it', () async {
      final cloud = FakeCloud()..secondStepOn = true;
      final session = await waitingForSecondStep(
        cloud,
        scriptedSession(cloud, {
          '/v1/auth/second-step': [for (var left = 4; left >= 0; left--) wrong(left), refused(429, 'TOO_MANY_ATTEMPTS')],
        }),
      );
      await expectLater(session.completeSecondStep('000000'), says('That code is not right. 4 tries left.'));
      await expectLater(session.completeSecondStep('000000'), says('That code is not right. 3 tries left.'));
      await expectLater(session.completeSecondStep('000000'), says('That code is not right. 2 tries left.'));
      await expectLater(session.completeSecondStep('000000'), says('That code is not right. 1 try left.'));
      await expectLater(session.completeSecondStep('000000'), says(over));
      await expectLater(session.completeSecondStep(cloud.totpCode), says(over));
      expect(session.secondStepPending, isTrue);
      expect(session.signedIn, isFalse);
    });

    test('an expired challenge, a used code and too many tries each have a second-step sentence', () async {
      final cloud = FakeCloud()..secondStepOn = true;
      final session = await waitingForSecondStep(
        cloud,
        scriptedSession(cloud, {
          '/v1/auth/second-step': [refused(400, 'CODE_EXPIRED'), (400, {'ok': false, 'error': 'CODE_USED', 'attemptsRemaining': 2}), refused(429, 'TOO_MANY_ATTEMPTS')],
        }),
      );
      await expectLater(session.completeSecondStep('246810'), says(over));
      await expectLater(session.completeSecondStep('246810'), says(usedAlready));
      await expectLater(session.completeSecondStep('246810'), says(over));
    });

    test('a wrong code that comes with no count keeps the plain sentence', () async {
      final cloud = FakeCloud()..secondStepOn = true;
      final session = await waitingForSecondStep(
        cloud,
        scriptedSession(cloud, {
          '/v1/auth/second-step': [refused(400, 'INVALID_CODE')],
        }),
      );
      await expectLater(session.completeSecondStep('000000'), says('That code is not right. Check it and try again.'));
    });

    test('the first step keeps its own sentences, and ignores the count', () async {
      final cloud = FakeCloud();
      final session = scriptedSession(cloud, {
        '/v1/auth/verify': [wrong(4), refused(400, 'CODE_EXPIRED'), refused(400, 'CODE_USED'), refused(429, 'TOO_MANY_ATTEMPTS')],
      });
      await session.requestCode('9876543210');
      await expectLater(session.verifyCode('000000'), says('That code is not right. Check it and try again.'));
      await expectLater(session.verifyCode('000000'), says('That code has expired. Ask for a new one.'));
      await expectLater(session.verifyCode('000000'), says('That code was already used. Ask for a new one.'));
      await expectLater(session.verifyCode('000000'), says('Too many wrong tries. Ask for a new code.'));
    });

    testWidgets('the sign-in screen counts down, says the attempt is over, and Start over begins again', (tester) async {
      final (cloud, _) = await ownerWithBusiness();
      cloud.secondStepOn = true;
      final session = scriptedSession(cloud, {
        '/v1/auth/second-step': [for (var left = 4; left >= 0; left--) wrong(left), refused(429, 'TOO_MANY_ATTEMPTS')],
      });
      await tester.pumpWidget(MycaApp(state: hostedOn(session)));
      await tester.pumpAndSettle();
      await phoneCodeSignIn(tester);
      expect(find.text('Enter your authenticator code'), findsOneWidget);

      for (final words in ['4 tries left.', '3 tries left.', '2 tries left.', '1 try left.']) {
        await typeSecondStep(tester, '000000');
        expect(find.text('That code is not right. $words'), findsOneWidget);
        expect(find.text('Enter your authenticator code'), findsOneWidget);
      }
      await typeSecondStep(tester, '000000');
      expect(find.text(over), findsOneWidget);
      expect(find.textContaining('tries left'), findsNothing);
      expect(find.textContaining('try left'), findsNothing);

      await typeSecondStep(tester, cloud.totpCode);
      expect(find.text(over), findsOneWidget);
      expect(find.text('Enter your authenticator code'), findsOneWidget);

      await press(tester, find.text('Start over'));
      expect(find.text('Your mobile number'), findsOneWidget);
      expect(find.text(over), findsNothing);

      await phoneCodeSignIn(tester);
      await typeSecondStep(tester, cloud.totpCode);
      expect(find.text('Asha Traders'), findsOneWidget);
    });

    testWidgets('a code that was just used tells the user to wait for the next one', (tester) async {
      final (cloud, _) = await ownerWithBusiness();
      cloud.secondStepOn = true;
      await tester.pumpWidget(MycaApp(state: hosted(cloud, MemoryTokenStore())));
      await tester.pumpAndSettle();
      await phoneCodeSignIn(tester);
      cloud
        ..secondStepError = 'CODE_USED'
        ..secondStepLeft = 2;
      await typeSecondStep(tester, cloud.totpCode);
      expect(find.text(usedAlready), findsOneWidget);
      expect(find.text('Enter your authenticator code'), findsOneWidget);

      cloud.secondStepError = '';
      await typeSecondStep(tester, cloud.totpCode);
      expect(find.text(usedAlready), findsNothing);
      expect(find.text('Asha Traders'), findsOneWidget);
    });
  });

  group('cloud-app-3: signing in with a recovery code says so once, on Home', () {
    test('completing the second step returns what the server said about recovery codes', () async {
      final cloud = FakeCloud()..secondStepOn = true;
      final session = await waitingForSecondStep(cloud);
      final result = await secondStepOutcome(session, cloud.recoveryCode);
      expect(result.usedRecoveryCode, isTrue);
      expect(result.recoveryCodesLeft, 7);

      final other = FakeCloud()..secondStepOn = true;
      final plain = await waitingForSecondStep(other);
      final fresh = await secondStepOutcome(plain, other.totpCode);
      expect(fresh.usedRecoveryCode, isFalse);
      expect(fresh.recoveryCodesLeft, 8);
    });

    testWidgets('Home shows one note with how many are left, and Got it clears it', (tester) async {
      final (cloud, _) = await ownerWithBusiness();
      cloud.secondStepOn = true;
      await signInWithRecoveryCode(tester, cloud, hosted(cloud, MemoryTokenStore()));
      expect(find.text('Good morning'), findsOneWidget);
      expect(find.text('Asha Traders'), findsOneWidget);
      expect(find.text(noteSeven), findsOneWidget);
      expect(find.text('Got it'), findsOneWidget);
      expect(cloud.recoveryLeft, 7);

      await tester.tap(find.text('Got it'));
      await tester.pumpAndSettle();
      expect(find.text(noteSeven), findsNothing);
      expect(find.text('Got it'), findsNothing);
      expect(find.text('Asha Traders'), findsOneWidget);
    });

    testWidgets('the note is gone when the app starts again', (tester) async {
      final (cloud, _) = await ownerWithBusiness();
      cloud.secondStepOn = true;
      final tokens = MemoryTokenStore();
      await signInWithRecoveryCode(tester, cloud, hosted(cloud, tokens));
      expect(find.text(noteSeven), findsOneWidget);

      await tester.pumpWidget(MycaApp(key: UniqueKey(), state: hosted(cloud, tokens)));
      await tester.pumpAndSettle();
      expect(find.text('Asha Traders'), findsOneWidget);
      expect(find.text(noteSeven), findsNothing);
      expect(find.text('Got it'), findsNothing);
    });

    testWidgets('one left and none left read the same way', (tester) async {
      for (final (start, words) in [(2, '1 left'), (1, '0 left')]) {
        final (cloud, _) = await ownerWithBusiness();
        cloud
          ..secondStepOn = true
          ..recoveryLeft = start;
        await signInWithRecoveryCode(tester, cloud, hosted(cloud, MemoryTokenStore()));
        expect(find.text('You used a recovery code. $words. Make new ones in Security.'), findsOneWidget);
      }
    });

    testWidgets('an authenticator code gives no note', (tester) async {
      final (cloud, _) = await ownerWithBusiness();
      cloud.secondStepOn = true;
      await tester.pumpWidget(MycaApp(state: hosted(cloud, MemoryTokenStore())));
      await tester.pumpAndSettle();
      await phoneCodeSignIn(tester);
      await typeSecondStep(tester, cloud.totpCode);
      expect(find.text('Asha Traders'), findsOneWidget);
      expect(find.textContaining('recovery code'), findsNothing);
      expect(find.text('Got it'), findsNothing);
    });

    testWidgets('signing out clears an undismissed note, and the next sign-in with the app code shows none', (tester) async {
      final (cloud, _) = await ownerWithBusiness();
      cloud.secondStepOn = true;
      final state = hosted(cloud, MemoryTokenStore());
      await signInWithRecoveryCode(tester, cloud, state);
      expect(find.text(noteSeven), findsOneWidget);
      await state.signOut();
      await tester.pumpAndSettle();
      expect(find.text('Your mobile number'), findsOneWidget);
      await phoneCodeSignIn(tester);
      await typeSecondStep(tester, cloud.totpCode);
      expect(find.text('Asha Traders'), findsOneWidget);
      expect(find.textContaining('recovery code'), findsNothing);
    });

    testWidgets('Home with the note: tap targets, contrast, and 1.5x and 2x type', (tester) async {
      await phone(tester);
      final (cloud, _) = await ownerWithBusiness();
      cloud.secondStepOn = true;
      await signInWithRecoveryCode(tester, cloud, hosted(cloud, MemoryTokenStore()));
      expect(find.text(noteSeven), findsOneWidget);
      expectTooltips(tester);
      final handle = tester.ensureSemantics();
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      handle.dispose();
    });

    for (final scale in [1.5, 2.0]) {
      testWidgets('Home with the note at ${scale}x type size: nothing overflows', (tester) async {
        await phone(tester, textScale: scale);
        final (cloud, _) = await ownerWithBusiness();
        cloud.secondStepOn = true;
        await signInWithRecoveryCode(tester, cloud, hosted(cloud, MemoryTokenStore()));
        expect(find.text(noteSeven), findsOneWidget);
        final error = tester.takeException();
        expect(error, isNull, reason: 'overflow or layout error at text scale $scale: $error');
      });
    }
  });

  group('engine-app-5: the payable line of This week shows its amount as money', () {
    testWidgets('a payable reads like a receivable, with rupees and the MSME mark', (tester) async {
      final api = _Payables([
        {'kind': 'payable', 'when': '2026-10-05', 'overdue': true, 'title': 'Pay Fabric Co 105000 on BILL-0001 (MSME)', 'detail': 'Past the MSMED limit since 2026-10-05', 'billId': 'BILL-0001', 'amount': 105000, 'msme': true},
        {'kind': 'payable', 'when': '2026-10-09', 'overdue': false, 'title': 'Pay Gupta on Wheels 2500.5 on BILL-0007', 'detail': 'Pay by 2026-10-09', 'billId': 'BILL-0007', 'amount': 2500.5, 'msme': false},
        {'kind': 'payable', 'when': '2026-10-10', 'overdue': false, 'title': 'Pay Micro Dyes ₹11,800.00 on BILL-0002 (MSME)', 'detail': 'Pay by 2026-10-10', 'billId': 'BILL-0002', 'amount': 11800, 'msme': true},
        {'kind': 'receivable', 'when': '2026-09-30', 'overdue': true, 'title': 'Gujarat Weaves owes 277600 on INV-0002', 'detail': 'Overdue since 2026-09-30', 'amount': 277600, 'invoiceId': 'INV-0002'},
        {'kind': 'filing', 'when': '2026-10-11', 'overdue': false, 'title': 'GSTR-1 (monthly) for 2026-09', 'detail': 'Due 2026-10-11'},
      ]);
      await tester.pumpWidget(MycaApp(state: testState(api)));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('THIS WEEK · 2 OVERDUE'), 200, scrollable: find.byType(Scrollable).first);
      expect(find.text('Pay Fabric Co ₹1,05,000.00 on BILL-0001 (MSME)'), findsOneWidget);
      expect(find.text('Pay Gupta on Wheels ₹2,500.50 on BILL-0007'), findsOneWidget);
      expect(find.text('Pay Micro Dyes ₹11,800.00 on BILL-0002 (MSME)'), findsOneWidget);
      expect(find.text('Gujarat Weaves owes ₹2,77,600.00 on INV-0002'), findsOneWidget);
      expect(find.text('GSTR-1 (monthly) for 2026-09'), findsOneWidget);
      expect(find.textContaining('105000'), findsNothing);
      expect(find.textContaining('2500.5 '), findsNothing);
    });
  });

  group('engine-app-6: Add GSTR-2B sends a file name the engine accepts', () {
    testWidgets('a long picked name is cut to 120 characters and keeps its extension', (tester) async {
      final api = FakeMycaApi(signedIn: true);
      var picked = '';
      final state = AppState(
        api: api,
        store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
        pickTextFile: (_) async => PickedText(name: picked, content: 'SECTION,SUPPLIER GSTIN\nB2B,24AAACF7856R1ZY'),
        now: () => DateTime(2026, 10, 5, 22, 30),
      );
      await tester.pumpWidget(MycaApp(state: state));
      await tester.pumpAndSettle();
      await tester.tap(find.text('3 things need you'));
      await tester.pumpAndSettle();

      final cases = <(String, String)>[
        ('${'a' * 146}.csv', '${'a' * 116}.csv'),
        ('GSTR2B_102026.csv', 'GSTR2B_102026.csv'),
        ('${'b' * 116}.csv', '${'b' * 116}.csv'),
        ('${'c' * 117}.csv', '${'c' * 116}.csv'),
        ('d' * 200, 'd' * 120),
        ('${'e' * 115}😀😀😀.csv', '${'e' * 115}.csv'),
      ];
      for (final (name, sent) in cases) {
        picked = name;
        final add = find.text('Add GSTR-2B for October 2026');
        await scrollTo(tester, add);
        await tester.tap(add);
        await tester.pumpAndSettle();
        expect(api.proposals.last.tool, 'import_gstr2b');
        expect(api.proposals.last.args['fileName'], sent, reason: '${name.length} characters in');
        expect((api.proposals.last.args['fileName'] as String).length, lessThanOrEqualTo(120));
        await tester.tap(find.text('Cancel'));
        await tester.pumpAndSettle();
      }
      expect(api.proposals, hasLength(cases.length));
    });
  });

  group('extra (a): Supplier terms is offered to the owner only', () {
    testWidgets('staff, accountant, partner and reviewer do not see it, owner and admin do', (tester) async {
      for (final role in ['staff', 'accountant', 'partner', 'reviewer', 'owner', 'admin']) {
        await openThread(tester, _AsRole(role));
        expect(find.widgetWithText(ActionChip, 'Bill'), findsOneWidget, reason: '$role still has the thread');
        expect(find.widgetWithText(ActionChip, 'Supplier terms'), role == 'owner' || role == 'admin' ? findsOneWidget : findsNothing, reason: role);
      }
    });
  });

  group('extra (b): the supplier thread shows the pay-by date Home shows', () {
    testWidgets('the date comes from the supplier dues rows, not from the stamp on the bill', (tester) async {
      final api = staleStamps(FakeMycaApi(signedIn: true));
      api.purchases.add({'id': 'BILL-0004', 'date': '2026-10-05', 'partyName': 'Fabric Co', 'partyGstin': '27AABCT1332L1ZE', 'total': 3000, 'status': 'posted'});
      (api.supplierDues['bills'] as List).add(dueRow('BILL-0004', '2026-11-20', msme: false, date: '2026-10-05', total: 3000));
      await openThread(tester, api);
      expect(find.text('Pay by 17 December 2026 (MSME)'), findsOneWidget);
      expect(find.text('Pay by 2 December 2026 (MSME)'), findsNothing);
      expect(find.text('Pay by 21 August 2026 (MSME)'), findsOneWidget);
      expect(find.text('Pay by 20 November 2026'), findsOneWidget);
    });

    testWidgets('a bill the dues rows do not list has no pay-by line, even with a stamp', (tester) async {
      final api = staleStamps(FakeMycaApi(signedIn: true));
      api.supplierDues['bills'] = [dueRow('BILL-0003', '2026-12-17', msme: true, date: '2026-10-02', total: 5900)];
      await openThread(tester, api);
      expect(find.text('Pay by 17 December 2026 (MSME)'), findsOneWidget);
      expect(find.textContaining('21 August 2026'), findsNothing);
      expect(find.textContaining('2 December 2026'), findsNothing);
    });

    testWidgets('with no dues answer the stamped date is shown', (tester) async {
      for (final throws in [true, false]) {
        final api = staleStamps(_DuesDown(throws: throws));
        await openThread(tester, api);
        expect(find.text('Pay by 2 December 2026 (MSME)'), findsOneWidget, reason: throws ? 'thrown' : 'refused');
        expect(find.text('Pay by 21 August 2026 (MSME)'), findsOneWidget, reason: throws ? 'thrown' : 'refused');
        expect(find.textContaining('17 December 2026'), findsNothing);
      }
    });

    testWidgets('a paid bill has none, and the dates follow new terms once they are posted', (tester) async {
      final api = staleStamps(_MovingDues());
      api.purchases.add({'id': 'BILL-0005', 'date': '2026-09-01', 'partyName': 'Fabric Co', 'partyGstin': '27AABCT1332L1ZE', 'total': 1000, 'status': 'paid', 'dueDate': '2026-09-16', 'msme': true});
      await openThread(tester, api);
      expect(find.text('Pay by 17 December 2026 (MSME)'), findsOneWidget);
      expect(find.textContaining('16 September 2026'), findsNothing);

      await openSheet(tester);
      await enter(tester, 'Agreed days', '30');
      await save(tester);
      await tester.tap(find.text('Yes'));
      await tester.pumpAndSettle();
      expect(api.supplierTermsSet, hasLength(1));
      expect(find.text('Pay by 17 November 2026 (MSME)'), findsOneWidget);
      expect(find.text('Pay by 17 December 2026 (MSME)'), findsNothing);
      expect(find.textContaining('21 August 2026'), findsNothing);
    });
  });

  group('extra (c): the Medium chip says what the 45-day rule covers', () {
    testWidgets('one line under the chips, and Medium still works', (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openThread(tester, api);
      await openSheet(tester);
      expect(find.text(mediumWords), findsNothing, reason: 'the chips come with the switch');
      await tester.tap(find.widgetWithText(SwitchListTile, 'MSME supplier'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(ChoiceChip, 'Medium'), findsOneWidget);
      expect(find.text(mediumWords), findsOneWidget);
      await tester.tap(find.widgetWithText(ChoiceChip, 'Medium'));
      await tester.pumpAndSettle();
      expect(find.text(mediumWords), findsOneWidget);
      await enter(tester, 'Agreed days', '30');
      await save(tester);
      expect(api.proposals.single.args['category'], 'medium');
    });
  });

  group('extra (d): the IMS screen builds only the rows near the screen', () {
    testWidgets('2,000 rows, a handful built, and the last one is reachable', (tester) async {
      final api = withManyRows(2000);
      await openIms(tester, testState(api));
      expect(find.text('IMS · October 2026'), findsOneWidget);
      expect(tester.widget<Text>(find.byKey(const ValueKey('ims.counts'))).data, '2000 invoices · 0 accepted · 0 rejected · 0 pending · 2000 not decided');
      expect(find.byType(RowCard).evaluate().length, lessThan(60));
      expect(rowOf(imsRow(0)['key'] as String), findsOneWidget);
      expect(rowOf(imsRow(1999)['key'] as String), findsNothing);

      final position = tester.state<ScrollableState>(find.byType(Scrollable).last).position;
      for (var i = 0; i < 6; i++) {
        position.jumpTo(position.maxScrollExtent);
        await tester.pump();
      }
      await tester.pumpAndSettle();
      expect(rowOf(imsRow(1999)['key'] as String), findsOneWidget);
      expect(find.textContaining('does not send them to the GST portal'), findsOneWidget);
      expect(find.byType(RowCard).evaluate().length, lessThan(60));
    });

    testWidgets('a decision taken from the middle of 2,000 rows is previewed in view', (tester) async {
      final api = withManyRows(2000);
      await openIms(tester, testState(api));
      final position = tester.state<ScrollableState>(find.byType(Scrollable).last).position;
      position.jumpTo(60000);
      await tester.pumpAndSettle();
      final screen = tester.getRect(find.byType(Scrollable).last);
      final row = find.byType(RowCard).evaluate().map((element) => find.byWidget(element.widget)).firstWhere((finder) => screen.contains(tester.getRect(finder).topLeft) && screen.contains(tester.getRect(finder).bottomRight));
      await tester.tap(row);
      await tester.pumpAndSettle();
      await tester.tap(find.descendant(of: find.byType(BottomSheet), matching: find.widgetWithText(ChoiceChip, 'Accept')));
      await tester.pumpAndSettle();
      await tester.tap(find.descendant(of: find.byType(BottomSheet), matching: find.text('Save')));
      await tester.pumpAndSettle();
      final preview = find.textContaining('as accepted in IMS for 2026-10');
      expect(preview, findsOneWidget);
      expect(screen.contains(tester.getCenter(preview)), isTrue);
    });

    testWidgets('with 2,000 rows a bulk decision is previewed in view', (tester) async {
      final api = withManyRows(2000);
      await openIms(tester, testState(api));
      await tester.tap(find.widgetWithText(ActionChip, 'Accept all matched'));
      await tester.pumpAndSettle();
      final preview = find.textContaining('Mark 200 invoices in IMS for 2026-10 as accepted');
      expect(preview, findsOneWidget);
      final screen = tester.getRect(find.byType(Scrollable).last);
      expect(screen.contains(tester.getCenter(preview)), isTrue);
      expect(find.byType(RowCard).evaluate().length, lessThan(60));
    });
  });

  group('extra (d), again: the decision preview is scrolled fully into view whatever the number of rows', () {
    for (final count in [1, 3, 4, 6, 12, 20, 25, 30, 60]) {
      testWidgets('$count rows: Accept all matched shows the preview above the bar', (tester) async {
        await phone(tester);
        await openIms(tester, testState(withManyRows(count)));
        await tester.tap(find.widgetWithText(ActionChip, 'Accept all matched'));
        await tester.pumpAndSettle();
        expectPreviewInView(tester, '$count rows, bulk');
      });
    }

    for (final count in [3, 6, 12, 20, 30]) {
      testWidgets('$count rows: one decision from the sheet shows the preview above the bar', (tester) async {
        await phone(tester);
        await openIms(tester, testState(withManyRows(count)));
        await decideInSheet(tester, imsRow(0)['key'] as String, 'Accept');
        expectPreviewInView(tester, '$count rows, one row');
      });
    }

    for (final scale in [1.5, 2.0]) {
      for (final count in [4, 12]) {
        testWidgets('$count rows at $scale times type: Accept all matched shows the preview', (tester) async {
          await phone(tester, textScale: scale);
          await openIms(tester, testState(withManyRows(count)));
          await tester.tap(find.widgetWithText(ActionChip, 'Accept all matched'));
          await tester.pumpAndSettle();
          expectPreviewInView(tester, '$count rows, bulk, $scale times');
        });

        testWidgets('$count rows at $scale times type: one decision from the sheet shows the preview', (tester) async {
          await phone(tester, textScale: scale);
          await openIms(tester, testState(withManyRows(count)));
          await decideInTallSheet(tester, imsRow(0)['key'] as String, 'Reject');
          expectPreviewInView(tester, '$count rows, one row, $scale times');
        });
      }
    }

    testWidgets('a second proposal after the first is discarded is also brought into view', (tester) async {
      await phone(tester);
      await openIms(tester, testState(withManyRows(12)));
      await tester.tap(find.widgetWithText(ActionChip, 'Accept all matched'));
      await tester.pumpAndSettle();
      expectPreviewInView(tester, 'first');
      await tester.tap(find.text('Discard'));
      await tester.pumpAndSettle();
      tester.state<ScrollableState>(find.byType(Scrollable).last).position.jumpTo(0);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(ActionChip, 'Accept all matched'));
      await tester.pumpAndSettle();
      expect(find.text('Post it'), findsOneWidget);
      final screen = tester.getRect(find.byType(Scrollable).last);
      final card = tester.getRect(previewCard().last);
      expect(card.top, greaterThanOrEqualTo(screen.top));
      expect(card.bottom, lessThanOrEqualTo(screen.bottom));
    });
  });
}
