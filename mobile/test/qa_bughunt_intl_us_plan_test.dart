import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';

import 'cloud_test.dart' show sessionOn, signedIn;
import 'fake_api.dart' show MemoryOnboardingStore;
import 'fake_cloud.dart';

void main() {
  tearDown(() => moneyCountry = 'IN');

  testWidgets('Plan and billing in the US app shows the US prices, never the Indian rupee plans', (tester) async {
    final cloud = FakeCloud()
      ..subscription = {
        'plan': 'household',
        'planTitle': 'Personal tax return',
        'enforced': true,
        'trial': null,
        'usReturn': {'enforced': true, 'filingOpen': true, 'priceUsd': 129, 'listPriceUsd': 129, 'checkout': 'card'},
        'usPlus': {'priceUsd': 249, 'per': 'year', 'active': false, 'buyable': true},
      };
    final tokens = MemoryTokenStore();
    final session = await signedIn(cloud, tokens);
    await session.setName('Jordan');
    final state = AppState(cloud: sessionOn(cloud, tokens), store: MemoryOnboardingStore(isWelcomed: true), pickTextFile: (_) async => null, now: () => DateTime(2026, 3, 2, 10), edition: 'US');
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('usSetup.first')), 'Jordan');
    await tester.enterText(find.byKey(const Key('usSetup.last')), 'Rivera');
    await tester.tap(find.byKey(const Key('usSetup.continue')));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Your account'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usAccount.plan')));
    await tester.pumpAndSettle();
    expect(find.text('Plan and billing'), findsOneWidget);
    expect(find.textContaining('₹'), findsNothing);
    expect(find.textContaining('GST'), findsNothing);
    expect(find.textContaining('chartered accountants'), findsNothing);
    expect(find.textContaining('\$129'), findsWidgets);
    expect(find.textContaining('\$249 a year'), findsOneWidget);
  });
}
