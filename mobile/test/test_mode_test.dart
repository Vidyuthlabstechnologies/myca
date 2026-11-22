import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/crash_reports.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/businesses_screen.dart';

import 'cloud_test.dart' show signedIn;
import 'fake_api.dart';
import 'fake_cloud.dart';

Future<AppState> ownerOn(FakeCloud cloud, {bool business = true}) async {
  final session = await signedIn(cloud);
  if (business) await session.createBusiness(name: 'Asha Traders', state: '29');
  return AppState(cloud: session, store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true), pickTextFile: (_) async => null);
}

void main() {
  testWidgets('a staging server shows the test banner on every screen', (tester) async {
    final cloud = FakeCloud()
      ..userName = 'Asha'
      ..serverEnvironment = 'staging';
    await tester.pumpWidget(MycaApp(state: await ownerOn(cloud)));
    await tester.pumpAndSettle();
    expect(find.text('Test environment: nothing is filed, paid or sent'), findsOneWidget);
    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('test-server-banner')), findsOneWidget);
  });

  testWidgets('a production server shows no banner', (tester) async {
    final cloud = FakeCloud()
      ..userName = 'Asha'
      ..serverEnvironment = 'production';
    await tester.pumpWidget(MycaApp(state: await ownerOn(cloud)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('test-server-banner')), findsNothing);
  });

  testWidgets('the production server on sandbox keys says so on every screen', (tester) async {
    final cloud = FakeCloud()
      ..userName = 'Asha'
      ..serverEnvironment = 'production'
      ..providerMode = 'test';
    await tester.pumpWidget(MycaApp(state: await ownerOn(cloud)));
    await tester.pumpAndSettle();
    expect(find.text('Sandbox mode: nothing is filed with the government yet'), findsOneWidget);
    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('test-server-banner')), findsOneWidget);
  });

  testWidgets('switching the server to live keys takes the sandbox banner away', (tester) async {
    final cloud = FakeCloud()
      ..userName = 'Asha'
      ..serverEnvironment = 'production'
      ..providerMode = 'live';
    await tester.pumpWidget(MycaApp(state: await ownerOn(cloud)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('test-server-banner')), findsNothing);
  });

  testWidgets('a server that does not say where it runs shows no banner', (tester) async {
    final cloud = FakeCloud()..userName = 'Asha';
    await tester.pumpWidget(MycaApp(state: await ownerOn(cloud)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('test-server-banner')), findsNothing);
  });

  testWidgets('a new owner can try a demo business from setup, and it is marked as a demo', (tester) async {
    final cloud = FakeCloud()..userName = 'Asha';
    await tester.pumpWidget(MycaApp(state: await ownerOn(cloud, business: false)));
    await tester.pumpAndSettle();
    expect(find.text('Tell us about the business'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('setup.tryDemo')));
    await tester.tap(find.byKey(const Key('setup.tryDemo')));
    await tester.pumpAndSettle();
    expect(find.text('Tell us about the business'), findsNothing);
    expect(cloud.businesses.single['demo'], true);
    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Your businesses'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Demo business, made-up figures'), findsOneWidget);
  });

  testWidgets('the businesses screen says which build and which server this is', (tester) async {
    final cloud = FakeCloud()
      ..userName = 'Asha'
      ..serverEnvironment = 'staging';
    await tester.pumpWidget(MycaApp(state: await ownerOn(cloud)));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Your businesses'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('about.version')), 200);
    expect(find.text('MyCA $appVersion · test environment (staging)'), findsOneWidget);
  });

  test('the about line names a live service and an unreachable one plainly', () {
    expect(aboutLine(const ServerInfo(environment: 'production', version: '1')), 'MyCA $appVersion · live service');
    expect(aboutLine(null), 'MyCA $appVersion · server not reached');
    expect(aboutLine(const ServerInfo(environment: 'production', version: '1', providerMode: 'test')), 'MyCA $appVersion · sandbox mode (test)');
    expect(aboutLine(const ServerInfo(environment: 'production', version: '1', providerMode: 'simulated')), 'MyCA $appVersion · sandbox mode (simulated)');
    expect(aboutLine(const ServerInfo(environment: 'production', version: '1', providerMode: 'live')), 'MyCA $appVersion · live service');
  });
}
