import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/lock/app_lock.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';
import 'fake_cloud.dart';

class FakeLock implements AppLock {
  FakeLock({this.isAvailable = true, List<bool>? answers}) : answers = answers ?? [];

  bool isAvailable;
  final List<bool> answers;
  final prompts = <String>[];

  @override
  Future<bool> available() async => isAvailable;

  @override
  Future<bool> unlock(String reason) async {
    prompts.add(reason);
    return answers.isEmpty ? true : answers.removeAt(0);
  }
}

class Clock {
  DateTime now = DateTime(2026, 10, 6, 10);
}

Future<(FakeCloud, MemoryTokenStore)> signedInPhone() async {
  final cloud = FakeCloud()..userName = 'Asha';
  final tokens = MemoryTokenStore();
  final session = CloudSession(baseUrl: 'https://api.example.test', tokens: tokens, client: cloud.client);
  await session.requestCode('9876543210');
  await session.verifyCode(FakeCloud.code);
  await session.createBusiness(name: 'Asha Traders', state: '29');
  return (cloud, tokens);
}

AppState hosted(FakeCloud cloud, MemoryTokenStore tokens, FakeLock lock, {MemoryOnboardingStore? store, Clock? clock}) => AppState(
      cloud: CloudSession(baseUrl: 'https://api.example.test', tokens: tokens, client: cloud.client),
      store: store ?? MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
      pickTextFile: (_) async => null,
      lock: lock,
      now: () => (clock ?? Clock()).now,
    );

void main() {
  testWidgets('a signed-in phone opens locked, loads nothing, and unlocks into the books', (tester) async {
    final (cloud, tokens) = await signedInPhone();
    final lock = FakeLock(answers: [false, true]);
    final requestsBefore = cloud.requests.length;
    await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens, lock)));
    await tester.pumpAndSettle();

    expect(find.text('MyCA is locked'), findsOneWidget);
    expect(lock.prompts, ['Unlock MyCA'], reason: 'it asks once on its own');
    expect(find.text('That did not work. Try again.'), findsOneWidget);
    expect(cloud.requests.length, requestsBefore, reason: 'no books are fetched while locked');
    expect(find.text('Asha Traders'), findsNothing);

    await tester.tap(find.text('Unlock'));
    await tester.pumpAndSettle();
    expect(find.text('MyCA is locked'), findsNothing);
    expect(find.text('Asha Traders'), findsOneWidget);
    expect(lock.prompts.length, 2);
  });

  testWidgets('coming back after a long absence locks over whatever screen was open', (tester) async {
    final (cloud, tokens) = await signedInPhone();
    final lock = FakeLock();
    final clock = Clock();
    final state = hosted(cloud, tokens, lock, clock: clock);
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Sales');
    expect(find.text('New customer'), findsOneWidget);

    state.leftApp();
    clock.now = clock.now.add(const Duration(seconds: 90));
    state.returnedToApp();
    await tester.pumpAndSettle();
    expect(find.text('MyCA is locked'), findsNothing, reason: 'a short absence does not lock');

    state.leftApp();
    clock.now = clock.now.add(lockAfter);
    state.returnedToApp();
    await tester.pump();
    expect(find.text('MyCA is locked'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(find.text('MyCA is locked'), findsNothing, reason: 'the prompt succeeded');
    expect(find.text('New customer'), findsOneWidget, reason: 'they are back where they were');
  });

  testWidgets('a phone with no screen lock is not locked and is told why', (tester) async {
    final (cloud, tokens) = await signedInPhone();
    final lock = FakeLock(isAvailable: false);
    await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens, lock)));
    await tester.pumpAndSettle();
    expect(find.text('MyCA is locked'), findsNothing);
    expect(lock.prompts, isEmpty);
    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Set a screen lock on this phone'), findsOneWidget);
    expect(find.text('App lock'), findsNothing);
  });

  testWidgets('turning the lock off needs the lock itself, and the choice is remembered', (tester) async {
    final (cloud, tokens) = await signedInPhone();
    final lock = FakeLock(answers: [true, false, true]);
    final store = MemoryOnboardingStore(isWelcomed: true, isMigrated: true);
    final state = hosted(cloud, tokens, lock, store: store);
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('App lock'));

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(state.lockEnabled, isTrue, reason: 'a failed check leaves it on');
    expect(store.isLockEnabled, isTrue);

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(state.lockEnabled, isFalse);
    expect(store.isLockEnabled, isFalse);
    expect(lock.prompts.last, 'Turn off app lock');

    final next = hosted(cloud, tokens, FakeLock(), store: store);
    await next.start();
    expect(next.locked, isFalse);
  });

  testWidgets('signing out from the lock screen clears the phone without unlocking', (tester) async {
    final (cloud, tokens) = await signedInPhone();
    final lock = FakeLock(answers: [false]);
    await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens, lock)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign out instead'));
    await tester.pumpAndSettle();
    expect(find.text('Your mobile number'), findsOneWidget);
    expect(find.text('MyCA is locked'), findsNothing);
    expect(tokens.values, isEmpty);
    expect(find.text('Asha Traders'), findsNothing);
  });

  testWidgets('a fresh sign-in is not asked to unlock straight away', (tester) async {
    final cloud = FakeCloud()..userName = 'Asha';
    final lock = FakeLock();
    final state = hosted(cloud, MemoryTokenStore(), lock);
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '9876543210');
    await tester.tap(find.text('Send code'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), FakeCloud.code);
    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('MyCA is locked'), findsNothing);
    expect(lock.prompts, isEmpty);
    expect(find.text('Tell us about the business'), findsOneWidget);
  });

  testWidgets('the desktop-server mode never locks', (tester) async {
    final lock = FakeLock();
    final state = AppState(
      api: FakeMycaApi(signedIn: true),
      store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
      pickTextFile: (_) async => null,
      lock: lock,
    );
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    state
      ..leftApp()
      ..returnedToApp();
    await tester.pumpAndSettle();
    expect(find.text('MyCA is locked'), findsNothing);
    expect(lock.prompts, isEmpty);
    expect(find.text('YOUR BOOKS'), findsOneWidget);
  });
}
