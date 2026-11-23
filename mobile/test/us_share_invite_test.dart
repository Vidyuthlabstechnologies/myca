import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/people_screen.dart';

import 'cloud_test.dart' show signedIn, sessionOn;
import 'fake_api.dart';
import 'fake_cloud.dart';

void main() {
  testWidgets('US: inviting anyone but a joint-return spouse asks for a signed consent naming them first', (tester) async {
    final cloud = FakeCloud()..userName = 'Avery';
    final tokens = MemoryTokenStore();
    final first = await signedIn(cloud, tokens);
    await first.createBusiness(name: 'Avery Lee', country: 'US', kind: 'household');
    final state = AppState(edition: 'US', cloud: sessionOn(cloud, tokens), store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true), pickTextFile: (_) async => null);
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    tester.state<NavigatorState>(find.byType(Navigator).first).push(MaterialPageRoute<void>(builder: (_) => const PeopleScreen()));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Invite someone'));
    await tester.pumpAndSettle();
    expect(find.textContaining('CA or bookkeeper'), findsNothing);
    expect(find.text('+1  '), findsOneWidget);

    await tester.enterText(find.byKey(const Key('invite.name')), 'Sam Tax');
    await tester.enterText(find.byKey(const Key('invite.phone')), '(415) 555-0172');
    await tester.tap(find.byKey(const Key('invite.relationship.other')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Invite'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Sam Tax, at the phone number ending 0172'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usShare.sign')));
    await tester.pumpAndSettle();
    expect(find.text('Type your full name to sign.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('usShare.name')), 'Avery Lee');
    await tester.tap(find.byKey(const Key('usShare.sign')));
    await tester.pumpAndSettle();
    final sent = cloud.inviteBodies.last;
    expect(sent['relationship'], 'other');
    expect((sent['consent'] as Map)['signedName'], 'Avery Lee');
    expect((sent['consent'] as Map)['recipientName'], 'Sam Tax');
    expect(cloud.invited.length, 1);

    await tester.tap(find.text('Invite someone'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('invite.name')), 'Jo Lee');
    await tester.enterText(find.byKey(const Key('invite.phone')), '4155550199');
    await tester.tap(find.text('Invite'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usShare.text')), findsNothing, reason: 'a spouse on the joint return needs no consent');
    expect(cloud.inviteBodies.last['relationship'], 'spouse');
    expect(cloud.invited.length, 2);
  });
}
