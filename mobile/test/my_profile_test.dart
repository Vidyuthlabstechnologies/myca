import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/my/my_codes.dart';
import 'package:myca/screens/my/my_profile_screens.dart';
import 'package:myca/tour/sample_malaysia.dart';

import 'cloud_test.dart' show signedIn;
import 'fake_api.dart';
import 'fake_cloud.dart';
import 'my_support.dart';

Widget launcher(Widget screen) => Builder(
  builder: (context) => Scaffold(
    body: Center(
      child: TextButton(key: const Key('open'), onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen)), child: const Text('Open')),
    ),
  ),
);

Future<void> pickPetCare(WidgetTester tester) async {
  await tester.runAsync(loadMsicCodes);
  await tapKey(tester, 'myProfile.msic');
  await tester.enterText(find.byKey(const Key('msic.search')), 'pet care');
  await settle(tester);
  await tester.tap(find.byKey(const Key('msic.96094')));
  await settle(tester);
}

Future<void> fillProfile(WidgetTester tester, {String tin = 'C20880050010'}) async {
  await typeKey(tester, 'myProfile.name', 'Kedai Runcit Mawar Sdn Bhd');
  await typeKey(tester, 'myProfile.tin', tin);
  await typeKey(tester, 'myProfile.idValue', '202301012345');
  await pickPetCare(tester);
  await typeKey(tester, 'myProfile.line', '8 Jalan Mawar');
  await typeKey(tester, 'myProfile.postcode', '81200');
  await typeKey(tester, 'myProfile.city', 'Johor Bahru');
  await pickOption(tester, 'myProfile.state', 'Johor');
  await typeKey(tester, 'myProfile.phone', '+60127654321');
}

void main() {
  testWidgets('the saved business details load, the activity is picked by search and the details are saved', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), launcher(const MyProfileScreen())));
    await tester.tap(find.byKey(const Key('open')));
    await settle(tester);
    expect(find.text('Teratai Digital Sdn Bhd'), findsOneWidget);
    expect(find.text('C25845632020'), findsOneWidget);
    await tester.runAsync(loadMsicCodes);
    await tapKey(tester, 'myProfile.msic');
    await tester.enterText(find.byKey(const Key('msic.search')), 'pet care');
    await settle(tester);
    expect(find.text('Pet care services'), findsOneWidget);
    await tester.tap(find.byKey(const Key('msic.96094')));
    await settle(tester);
    expect(find.textContaining('96094'), findsWidgets);
    await tapKey(tester, 'myProfile.save');
    expect(find.text('Saved. Every new e-invoice uses these details.'), findsOneWidget);
    expect(api.args['propose:set_my_einvoice_profile']!['msic'], '96094');
    expect(api.books.malaysia.profile['msic'], '96094');
  });

  testWidgets('empty and badly shaped details are caught on the phone', (tester) async {
    final api = MyTestApi();
    api.books.malaysia.hasProfile = false;
    await tester.pumpWidget(myApp(myState(api), launcher(const MyProfileScreen())));
    await tester.tap(find.byKey(const Key('open')));
    await settle(tester);
    await typeKey(tester, 'myProfile.name', '');
    await typeKey(tester, 'myProfile.tin', 'X123');
    await typeKey(tester, 'myProfile.postcode', '123');
    await typeKey(tester, 'myProfile.phone', '12ab');
    await tapKey(tester, 'myProfile.save');
    await reveal(tester, find.textContaining('That is not an LHDN TIN'));
    expect(find.textContaining('That is not an LHDN TIN'), findsOneWidget);
    await reveal(tester, find.text('Choose the business activity.'));
    expect(find.text('Choose the business activity.'), findsOneWidget);
    await reveal(tester, find.text('Choose the state.'));
    expect(find.text('Choose the state.'), findsOneWidget);
    expect(api.calls, isNot(contains('validate_my_tin')));
  });

  testWidgets('a TIN LHDN does not know is not saved, and a failed check can be tried again', (tester) async {
    final api = MyTestApi()..failNext['validate_my_tin'] = 1;
    api.books.malaysia.hasProfile = false;
    await tester.pumpWidget(myApp(myState(api), launcher(const MyProfileScreen())));
    await tester.tap(find.byKey(const Key('open')));
    await settle(tester);
    await fillProfile(tester, tin: 'C20880059999');
    await tapKey(tester, 'myProfile.save');
    expect(find.textContaining('Cannot reach MyCA'), findsOneWidget);
    await tapKey(tester, 'myProfile.save');
    expect(find.textContaining('LHDN does not know this TIN'), findsOneWidget);
    expect(api.calls, isNot(contains('propose:set_my_einvoice_profile')));
    await typeKey(tester, 'myProfile.tin', 'C20880050010');
    await tapKey(tester, 'myProfile.save');
    expect(api.calls.where((call) => call == 'propose:set_my_einvoice_profile'), hasLength(1));
    expect(api.books.malaysia.hasProfile, isTrue);
  });

  testWidgets('a new hosted business is created once in Malaysia even when the TIN check has to be redone', (tester) async {
    final cloud = FakeCloud();
    final tokens = MemoryTokenStore();
    final session = await tester.runAsync(() => signedIn(cloud, tokens));
    final notice = await tester.runAsync(() => session!.privacyNotice(region: 'MY'));
    expect(notice!.version, 'my-test');
    final sample = SampleMalaysia(clock: () => myNow)..hasProfile = false;
    Map<String, Object?> args(Map<String, dynamic> body) => ((body['args'] as Map?) ?? const {}).cast<String, Object?>();
    cloud.booksAnswer = (action, body) => switch (action) {
      'query' => sample.query('${body['name']}', args(body)) as Map<String, Object?>?,
      'propose' => sample.propose('${body['name']}', args(body)),
      'confirm' => sample.confirm(),
      _ => null,
    };
    final state = AppState(
      cloud: session,
      store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
      pickTextFile: (_) async => null,
      now: () => myNow,
      edition: 'MY',
      languages: MemoryLanguageStore(),
    );
    await tester.pumpWidget(myApp(state, const MySetupScreen()));
    await settle(tester);
    expect(find.text('Tell us about the business'), findsOneWidget);
    await fillProfile(tester, tin: 'C20880059999');
    await tapKey(tester, 'myProfile.save');
    expect(find.textContaining('LHDN does not know this TIN'), findsOneWidget);
    await typeKey(tester, 'myProfile.tin', 'C20880050010');
    await tapKey(tester, 'myProfile.save');
    expect(cloud.createdBodies, [
      {'name': 'Kedai Runcit Mawar Sdn Bhd', 'country': 'MY'},
    ]);
    expect(sample.hasProfile, isTrue);
    expect(sample.profile['tin'], 'C20880050010');
  });
}
