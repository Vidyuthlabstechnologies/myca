import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';
import 'fake_cloud.dart';

CloudSession sessionOn(FakeCloud cloud, [MemoryTokenStore? tokens]) =>
    CloudSession(baseUrl: 'https://api.example.test', tokens: tokens ?? MemoryTokenStore(), client: cloud.client);

Future<CloudSession> signedIn(FakeCloud cloud, [MemoryTokenStore? tokens]) async {
  final session = sessionOn(cloud, tokens);
  await session.requestCode('9876543210');
  await session.verifyCode(FakeCloud.code);
  return session;
}

AppState hostedState(CloudSession session, {bool welcomed = true}) => AppState(
      cloud: session,
      store: MemoryOnboardingStore(isWelcomed: welcomed),
      pickTextFile: (_) async => const PickedText(name: 'daybook.csv', content: 'Date,Voucher Type\n01-08-2026,Sales\n'),
      now: () => DateTime(2026, 10, 6, 10),
    );

void main() {
  test('signing in keeps the tokens in the store and never the code', () async {
    final cloud = FakeCloud();
    final tokens = MemoryTokenStore();
    final session = await signedIn(cloud, tokens);
    expect(session.signedIn, isTrue);
    expect(session.ready, isFalse);
    expect(tokens.values['cloud.access'], 'access-1');
    expect(tokens.values['cloud.refresh'], 'refresh-1');
    expect(tokens.values.values.any((value) => value.contains(FakeCloud.code)), isFalse);
  });

  test('wrong code and bad phone surface plain messages', () async {
    final session = sessionOn(FakeCloud());
    await expectLater(session.requestCode('12345'), throwsA(isA<MycaApiException>().having((e) => e.message, 'message', contains('10-digit'))));
    await session.requestCode('9876543210');
    await expectLater(session.verifyCode('000000'), throwsA(isA<MycaApiException>().having((e) => e.message, 'message', contains('not right'))));
    expect(session.signedIn, isFalse);
  });

  test('an expired access token is refreshed once and the call is retried', () async {
    final cloud = FakeCloud();
    final session = await signedIn(cloud);
    await session.createBusiness(name: 'Asha Traders', state: '29');
    cloud.expireAccessOnce = true;
    final snapshot = await session.api.snapshot();
    expect(snapshot.company.name, 'Asha Traders');
    expect(cloud.refreshes, 1);
    expect(snapshot.activeUser?.name, 'Asha');
  });

  test('several calls hitting an expired token share one refresh', () async {
    final cloud = FakeCloud();
    final session = await signedIn(cloud);
    await session.createBusiness(name: 'Asha Traders', state: '29');
    cloud.access = 'expired';
    await Future.wait([session.api.snapshot(), session.api.query('gst_payable'), session.api.query('deadlines')]);
    expect(cloud.refreshes, 1);
  });

  test('when refresh is refused the phone forgets everything and reports signed out', () async {
    final cloud = FakeCloud();
    final tokens = MemoryTokenStore();
    final session = await signedIn(cloud, tokens);
    await session.createBusiness(name: 'Asha Traders', state: '29');
    cloud
      ..access = 'expired'
      ..refreshFails = true;
    await expectLater(session.api.snapshot(), throwsA(isA<SignedOutException>()));
    expect(session.signedIn, isFalse);
    expect(tokens.values, isEmpty);
  });

  test('a restart restores the session and the chosen business from the store', () async {
    final cloud = FakeCloud();
    final tokens = MemoryTokenStore();
    final first = await signedIn(cloud, tokens);
    await first.createBusiness(name: 'Asha Traders', state: '29');
    final second = sessionOn(cloud, tokens);
    expect(second.ready, isFalse);
    await second.restore();
    expect(second.ready, isTrue);
    expect((await second.api.snapshot()).company.name, 'Asha Traders');
  });

  test('signing out works with no connection and clears the phone', () async {
    final cloud = FakeCloud();
    final tokens = MemoryTokenStore();
    final session = await signedIn(cloud, tokens);
    await session.signOut();
    expect(cloud.logouts, 1);
    expect(session.signedIn, isFalse);
    expect(tokens.values, isEmpty);
  });

  test('server refusals become plain words', () async {
    final cloud = FakeCloud();
    final session = await signedIn(cloud);
    await expectLater(
      session.createBusiness(name: 'X', gstin: '27AABCU9603R1ZX'),
      throwsA(isA<MycaApiException>().having((e) => e.message, 'message', contains('GSTIN is not valid'))),
    );
    await session.createBusiness(name: 'Asha Traders', state: '29');
    await expectLater(
      session.api.propose('import_tally', {'csv': 'x'}),
      throwsA(isA<MycaApiException>().having((e) => e.message, 'message', contains('has to be uploaded'))),
    );
  });

  testWidgets('hosted first run: phone, code, business, then home with the first-sale prompt', (tester) async {
    final cloud = FakeCloud();
    final state = hostedState(sessionOn(cloud), welcomed: false);
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Get started'));
    await tester.pumpAndSettle();
    expect(find.text('Your mobile number'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '98765 43210');
    await tester.tap(find.text('Send code'));
    await tester.pumpAndSettle();
    expect(find.text('Enter the code'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '000000');
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    expect(find.textContaining('not right'), findsOneWidget);
    await tester.enterText(find.byType(TextField), FakeCloud.code);
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();

    expect(find.text('Tell us about the business'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Business name'), 'Asha Traders');
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Choose the state your business is in.'), findsOneWidget);
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Karnataka').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(cloud.company, {'name': 'Asha Traders', 'gstin': '', 'state': '29'});

    expect(find.text('Where are your books today?'), findsOneWidget);
    await tester.tap(find.text('Tally'));
    await tester.pumpAndSettle();
    expect(find.text('Bring your books across'), findsOneWidget);
    expect(find.text('Business name'), findsNothing);
    await tester.tap(find.text('Tally Day Book (CSV)'));
    await tester.pumpAndSettle();
    expect(cloud.uploads, {'hash-1': 'Date,Voucher Type\n01-08-2026,Sales\n'});
    expect(cloud.imports, ['import_tally:hash-1']);
    expect(find.text('Tally import: 12 vouchers ready, 1 skipped.'), findsOneWidget);
    await tester.tap(find.text('Bring it in'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open my books'));
    await tester.pumpAndSettle();

    expect(find.text('Asha Traders'), findsOneWidget);
    expect(find.text('You are all caught up'), findsOneWidget);
  });

  testWidgets('hosted: a returning owner goes straight home, and signing out returns to the phone screen', (tester) async {
    final cloud = FakeCloud();
    final tokens = MemoryTokenStore();
    final first = await signedIn(cloud, tokens);
    await first.createBusiness(name: 'Asha Traders', gstin: '29AAACH7409R1ZV');
    final state = AppState(
      cloud: sessionOn(cloud, tokens),
      store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
      pickTextFile: (_) async => null,
      now: () => DateTime(2026, 10, 6, 10),
    );
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    expect(find.text('Good morning'), findsOneWidget);
    expect(find.text('Asha Traders'), findsOneWidget);

    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    expect(find.text('Bring in more books'), findsOneWidget);
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();
    expect(find.text('Your mobile number'), findsOneWidget);
    expect(tokens.values, isEmpty);
  });

  testWidgets('hosted: when the session dies mid-use the app returns to sign-in', (tester) async {
    final cloud = FakeCloud();
    final tokens = MemoryTokenStore();
    final first = await signedIn(cloud, tokens);
    await first.createBusiness(name: 'Asha Traders', state: '29');
    final state = AppState(
      cloud: sessionOn(cloud, tokens),
      store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
      pickTextFile: (_) async => null,
    );
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    cloud
      ..access = 'expired'
      ..refreshFails = true;
    await state.refresh();
    await tester.pumpAndSettle();
    expect(find.text('Your mobile number'), findsOneWidget);
  });
}
