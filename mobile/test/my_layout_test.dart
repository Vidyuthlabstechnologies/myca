import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/format.dart';
import 'package:myca/my/my_codes.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/google_auth.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/my/my_tools.dart';
import 'package:myca/my/my_turnover.dart';
import 'package:myca/screens/invitation_cards.dart';
import 'package:myca/screens/name_screen.dart';
import 'package:myca/screens/phone_sign_in_screen.dart';
import 'package:myca/screens/privacy_notice_screen.dart';
import 'package:myca/screens/my/my_consolidated_screen.dart';
import 'package:myca/screens/my/my_einvoice_create_screen.dart';
import 'package:myca/screens/my/my_einvoice_detail_screen.dart';
import 'package:myca/screens/my/my_einvoice_list_screen.dart';
import 'package:myca/screens/my/my_home_screen.dart';
import 'package:myca/screens/my/my_plan_screen.dart';
import 'package:myca/screens/my/my_profile_screens.dart';
import 'package:myca/screens/my/my_self_billed_screen.dart';
import 'package:myca/screens/my/my_sst_screen.dart';
import 'package:myca/screens/my/my_tax_screen.dart';
import 'package:myca/screens/my/my_welcome_screen.dart';

import 'fake_api.dart';
import 'fake_cloud.dart';
import 'my_support.dart';

const sizes = [Size(320, 568), Size(360, 640), Size(375, 667), Size(390, 844), Size(412, 915), Size(430, 932), Size(600, 960), Size(800, 1280)];

typedef Screen = Widget Function(MyTestApi api, Snapshot snapshot);

final Map<String, Screen> screens = {
  'welcome': (_, _) => const MyWelcomeScreen(),
  'home': (_, snapshot) => MyHomeScreen(snapshot: snapshot),
  'profile': (_, _) => const MyProfileScreen(),
  'msic': (_, _) => const MsicPickerScreen(),
  'create': (_, _) => const MyEinvoiceCreateScreen(),
  'creditNote': (api, _) => MyEinvoiceCreateScreen(type: 'credit-note', original: MyEinvoice.fromJson(api.books.malaysia.einvoices.first)),
  'detailValid': (api, _) => MyEinvoiceDetailScreen(record: MyEinvoice.fromJson(api.books.malaysia.einvoices.first)),
  'detailInvalid': (api, _) => MyEinvoiceDetailScreen(record: MyEinvoice.fromJson(api.books.malaysia.einvoices[1])),
  'detailReceived': (api, _) => MyEinvoiceDetailScreen(record: MyEinvoice.fromJson(api.books.malaysia.einvoices.last)),
  'list': (_, _) => const MyEinvoiceListScreen(),
  'consolidated': (_, _) => const MyConsolidatedScreen(),
  'sstReturn': (_, _) => const MySstScreen(),
  'sstRegistration': (_, _) => const MySstScreen(startOnRegistration: true),
  'tax': (_, _) => const MyTaxScreen(),
  'plan': (_, _) => const MyPlanScreen(),
  'selfBilled': (_, _) => const MySelfBilledScreen(),
  'selfBilledNote': (api, _) => MySelfBilledScreen(type: 'self-billed-credit-note', original: MyEinvoice.fromJson({...api.books.malaysia.einvoices.first, 'type': 'self-billed-invoice', 'kind': 'self-billed', 'supplierName': 'Shenzhen Brightway Electronics Co Ltd', 'totals': {'net': 1200, 'tax': 0, 'payable': 1200, 'currency': 'USD'}})),
  'detailSelfBilled': (api, _) => MyEinvoiceDetailScreen(record: MyEinvoice.fromJson({...api.books.malaysia.einvoices.first, 'type': 'self-billed-invoice', 'kind': 'self-billed', 'supplierName': 'Shenzhen Brightway Electronics Co Ltd'})),
  'homeTurnover': (_, snapshot) => MyHomeScreen(snapshot: snapshot),
  'homeTurnoverRelated': (_, snapshot) => MyHomeScreen(snapshot: snapshot),
};

const malayToo = {'selfBilled', 'selfBilledNote', 'detailSelfBilled', 'homeTurnover', 'homeTurnoverRelated', 'home', 'signIn', 'signInPhone', 'privacy', 'name', 'invitations'};

MyTurnoverStore? turnoverFor(String screen) => switch (screen) {
  'homeTurnover' => MemoryMyTurnoverStore()..saved['Teratai Digital Sdn Bhd'] = const MyTurnover(annual: 2400000),
  'homeTurnoverRelated' => MemoryMyTurnoverStore()..saved['Teratai Digital Sdn Bhd'] = const MyTurnover(annual: 2999999.99, related: 12500000),
  _ => null,
};

class _Google implements GoogleAuth {
  @override
  Future<String?> idToken() async => null;

  @override
  Future<void> signOut() async {}
}

AppState hostedFor(FakeCloud cloud, {bool google = true}) => AppState(
  google: google ? _Google() : null,
  cloud: CloudSession(baseUrl: 'https://api.example.test', tokens: MemoryTokenStore(), client: cloud.client),
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => null,
  now: () => myNow,
  edition: 'MY',
  languages: MemoryLanguageStore(),
);

final Map<String, Widget> shared = {
  'signIn': const PhoneSignInScreen(),
  'signInPhone': const PhoneSignInScreen(),
  'privacy': const PrivacyNoticeScreen(),
  'name': const NameScreen(),
  'invitations': Scaffold(
    body: ListView(
      padding: const EdgeInsets.all(16),
      children: [
        InvitationCards(
          invitations: const [
            InvitationRef(id: '1', businessName: 'Syarikat Pembinaan Teguh Bersatu Sdn Bhd', role: 'accountant', invitedBy: 'Nurul Aisyah binti Abdul Rahman'),
            InvitationRef(id: '2', businessName: 'Kedai Runcit Mawar', role: 'staff', invitedBy: ''),
          ],
          onChanged: ({required joined}) async {},
        ),
      ],
    ),
  ),
};

Future<void> scrollThrough(WidgetTester tester) async {
  final scrollables = find.byWidgetPredicate((widget) => widget is Scrollable && axisDirectionToAxis(widget.axisDirection) == Axis.vertical).evaluate().toList();
  for (final element in scrollables) {
    final position = ((element as StatefulElement).state as ScrollableState).position;
    if (!position.hasContentDimensions) continue;
    var steps = 0;
    while (position.pixels < position.maxScrollExtent && steps < 40) {
      position.jumpTo((position.pixels + position.viewportDimension * 0.8).clamp(0, position.maxScrollExtent));
      await tester.pump();
      steps += 1;
    }
  }
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => moneyCountry = 'MY');
  tearDown(() => moneyCountry = 'IN');

  for (final entry in screens.entries) {
    for (final language in malayToo.contains(entry.key) ? const ['en', 'ms'] : const ['en']) {
      for (final dark in [false, true]) {
        for (final scale in [1.0, 2.0]) {
          testWidgets('${entry.key} lays out at every phone and tablet size, $language, ${dark ? 'dark' : 'light'}, text ×$scale', (tester) async {
            await tester.runAsync(loadMsicCodes);
            addTearDown(tester.view.reset);
            tester.view.devicePixelRatio = 1;
            for (final size in sizes) {
              tester.view.physicalSize = size;
              final api = MyTestApi();
              final snapshot = await api.snapshot();
              await tester.pumpWidget(myApp(myState(api, turnover: turnoverFor(entry.key)), entry.value(api, snapshot), language: language, dark: dark, textScale: scale));
              await tester.pumpAndSettle();
              expect(tester.takeException(), isNull, reason: '${entry.key} at ${size.width.toInt()}x${size.height.toInt()}');
              await scrollThrough(tester);
              expect(tester.takeException(), isNull, reason: '${entry.key} scrolled at ${size.width.toInt()}x${size.height.toInt()}');
              await tester.pumpWidget(const SizedBox());
            }
          });
        }
      }
    }
  }

  for (final entry in shared.entries) {
    for (final language in const ['en', 'ms']) {
      for (final dark in [false, true]) {
        for (final scale in [1.0, 2.0]) {
          testWidgets('shared ${entry.key} lays out at every phone and tablet size, $language, ${dark ? 'dark' : 'light'}, text ×$scale', (tester) async {
            addTearDown(tester.view.reset);
            tester.view.devicePixelRatio = 1;
            for (final size in sizes) {
              tester.view.physicalSize = size;
              final cloud = FakeCloud()..phoneOn = entry.key == 'signInPhone';
              await tester.pumpWidget(myApp(hostedFor(cloud, google: entry.key != 'signInPhone'), entry.value, language: language, dark: dark, textScale: scale));
              await tester.pumpAndSettle();
              expect(tester.takeException(), isNull, reason: '${entry.key} at ${size.width.toInt()}x${size.height.toInt()}');
              await scrollThrough(tester);
              expect(tester.takeException(), isNull, reason: '${entry.key} scrolled at ${size.width.toInt()}x${size.height.toInt()}');
              await tester.pumpWidget(const SizedBox());
            }
          });
        }
      }
    }
  }
}
