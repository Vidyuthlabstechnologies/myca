import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';
import 'fake_cloud.dart';

Future<AppState> hostedAs(FakeCloud cloud, String role) async {
  cloud.userName = 'Asha';
  final tokens = MemoryTokenStore();
  final first = CloudSession(
    baseUrl: 'https://api.example.test',
    tokens: tokens,
    client: cloud.client,
  );
  await first.requestCode('9876543210');
  await first.verifyCode(FakeCloud.code);
  await first.createBusiness(name: 'Asha Traders', state: '29');
  cloud.role = role;
  return AppState(
    cloud: CloudSession(
      baseUrl: 'https://api.example.test',
      tokens: tokens,
      client: cloud.client,
    ),
    store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
    pickTextFile: (_) async => null,
  );
}

void main() {
  testWidgets('the owner switches the Monday brief on from the business menu, and it is remembered', (tester) async {
    final cloud = FakeCloud();
    final state = await hostedAs(cloud, 'owner');
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();

    final tile = find.widgetWithText(SwitchListTile, 'Monday brief on WhatsApp');
    expect(tile, findsOneWidget);
    expect(tester.widget<SwitchListTile>(tile).value, isFalse);
    await tester.tap(tile);
    await tester.pumpAndSettle();
    expect(cloud.briefChanges, [true]);
    expect(tester.widget<SwitchListTile>(tile).value, isTrue);
    expect(find.textContaining('Every Monday at 7 am'), findsOneWidget);
  });

  testWidgets('an accountant is not offered the Monday brief', (tester) async {
    final cloud = FakeCloud();
    final state = await hostedAs(cloud, 'accountant');
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    expect(find.text('Monday brief on WhatsApp'), findsNothing);
  });
}
