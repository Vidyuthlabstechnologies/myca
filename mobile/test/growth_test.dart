import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/growth.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';
import 'fake_cloud.dart';

Future<AppState> hostedWithFunnel(FakeCloud cloud, {List<String> shared = const [], String edition = 'IN'}) async {
  cloud.userName = 'Asha';
  final tokens = MemoryTokenStore();
  final first = CloudSession(baseUrl: 'https://api.example.test', tokens: tokens, client: cloud.client);
  await first.requestCode('9876543210');
  await first.verifyCode(FakeCloud.code);
  await first.createBusiness(name: 'Asha Traders', state: '29');
  cloud.role = 'owner';
  return AppState(
    cloud: CloudSession(baseUrl: 'https://api.example.test', tokens: tokens, client: cloud.client),
    store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
    pickTextFile: (_) async => null,
    funnel: FunnelTracker(store: MemoryFunnelStore(), edition: edition),
    edition: edition,
    shareText: (text) async {
      shared.add(text);
      return true;
    },
  );
}

void main() {
  test('each step is sent once, with the edition and any source, and retried only after a failure', () async {
    final store = MemoryFunnelStore();
    final tracker = FunnelTracker(store: store, edition: 'IN');
    final sent = <List<Map<String, Object?>>>[];
    var fail = true;
    Future<void> send(List<Map<String, Object?>> steps) async {
      if (fail) throw Exception('offline');
      sent.add(steps);
    }

    expect(await tracker.reach(['signed_in'], send), 0);
    expect(store.steps, isEmpty);
    fail = false;
    expect(await tracker.reach(['signed_in', 'signed_in', 'business_created'], send, source: 'play'), 2);
    expect(sent.single, [
      {'step': 'signed_in', 'edition': 'india', 'source': 'play'},
      {'step': 'business_created', 'edition': 'india', 'source': 'play'},
    ]);
    expect(await tracker.reach(['signed_in', 'business_created'], send), 0);
    expect(sent, hasLength(1));
  });

  test('the US app sends nothing until the switch is on', () async {
    final sent = <Object>[];
    final off = FunnelTracker(store: MemoryFunnelStore(), edition: 'US');
    expect(off.active, isFalse);
    expect(await off.reach(['signed_in'], (steps) async => sent.add(steps)), 0);
    final on = FunnelTracker(store: MemoryFunnelStore(), edition: 'US', usAllowed: true);
    expect(await on.reach(['signed_in'], (steps) async => sent.add(steps)), 1);
    expect(sent.single, [
      {'step': 'signed_in', 'edition': 'us'},
    ]);
  });

  test('an invite reads in plain words for each app', () {
    final info = ReferralInfo.fromJson({'code': 'AB2CD3EF', 'link': 'https://myca.example/r/AB2CD3EF', 'invited': 2, 'converted': 1, 'reward': ''});
    expect(info.reward, isNull);
    expect(info.shareText(us: false), 'I keep my books and GST in MyCA. Get it at https://myca.example/r/AB2CD3EF and use my invite code AB2CD3EF when you sign up.');
    final noLink = ReferralInfo.fromJson({'code': 'AB2CD3EF'});
    expect(noLink.shareText(us: true), contains('MyCA US on the app store'));
    expect(referralClaimMessage('OWN_CODE'), 'That is your own code. Share it with someone else.');
    expect(referralClaimMessage('???'), startsWith('MyCA could not use that code'));
  });

  testWidgets('opening the books reports sign-in and the business, once', (tester) async {
    final cloud = FakeCloud();
    final state = await hostedWithFunnel(cloud);
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    expect(cloud.funnelSteps.map((s) => s['step']), ['signed_in', 'business_created']);
    await state.refresh();
    await tester.pumpAndSettle();
    expect(cloud.funnelSteps, hasLength(2));
  });

  testWidgets('the owner shares an invite code and uses one they were sent', (tester) async {
    final cloud = FakeCloud()..referralInvited = 3;
    final shared = <String>[];
    await tester.pumpWidget(MycaApp(state: await hostedWithFunnel(cloud, shared: shared)));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Invite a business owner'), 120, scrollable: find.byType(Scrollable).last);
    await tester.tap(find.text('Invite a business owner'));
    await tester.pumpAndSettle();

    expect(find.text('AB2CD3EF'), findsOneWidget);
    expect(find.text('3 joined with your code, 0 of them on a paid plan.'), findsOneWidget);
    await tester.tap(find.text('Share your invite'));
    await tester.pumpAndSettle();
    expect(shared.single, contains('AB2CD3EF'));
    expect(cloud.funnelSteps.map((s) => s['step']), contains('referral_shared'));

    await tester.enterText(find.byKey(const Key('claim-code')), 'ab2cd3ef');
    await tester.tap(find.text('Use this code'));
    await tester.pumpAndSettle();
    expect(find.text('That is your own code. Share it with someone else.'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('claim-code')), 'ZX9KQ4MN');
    await tester.tap(find.text('Use this code'));
    await tester.pumpAndSettle();
    expect(cloud.claimedCodes, ['ZX9KQ4MN']);
    expect(find.textContaining('The person who invited you'), findsOneWidget);
  });
}
