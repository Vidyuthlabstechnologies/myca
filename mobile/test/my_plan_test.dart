import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/billing/store_billing.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/format.dart';
import 'package:myca/screens/my/my_plan_screen.dart';

import 'cloud_test.dart' show signedIn;
import 'fake_api.dart';
import 'fake_cloud.dart';
import 'my_support.dart';

class RinggitStore implements StoreBilling {
  final controller = StreamController<List<StorePurchase>>.broadcast();
  final bought = <String>[];
  final finished = <String>[];

  @override
  Stream<List<StorePurchase>> get purchases => controller.stream;
  @override
  Future<bool> available() async => true;
  @override
  Future<Map<String, StoreProduct>> products(Set<String> ids) async => {
    for (final id in ids) id: StoreProduct(id: id, price: id.contains('starter') ? 'RM 299.00' : (id.contains('business') ? 'RM 699.00' : 'RM 1,999.00')),
  };
  @override
  Future<bool> buy(String productId, String accountId) async {
    bought.add(productId);
    return true;
  }

  @override
  Future<bool> buyOnce(String productId, String accountId) async => true;
  @override
  Future<void> restore(String accountId) async {}
  @override
  Future<void> finish(StorePurchase purchase) async => finished.add(purchase.token);
}

void main() {
  setUp(() => moneyCountry = 'MY');
  tearDown(() => moneyCountry = 'IN');

  test('the plans are RM299, RM699 and RM1,999 a year with their own Play products', () {
    expect([for (final plan in myPlans) wholeRinggit(plan.yearlyRinggit)], ['RM299', 'RM699', 'RM1,999']);
    expect([for (final plan in myPlans) plan.productId], ['myca_my_starter_yearly', 'myca_my_business_yearly', 'myca_my_pro_yearly']);
  });

  testWidgets('without an account the plans show their yearly ringgit price and no buy button', (tester) async {
    await tester.pumpWidget(myApp(myState(MyTestApi()), const MyPlanScreen()));
    await settle(tester);
    expect(find.text('RM299 a year'), findsOneWidget);
    expect(find.text('RM699 a year'), findsOneWidget);
    await reveal(tester, find.text('RM1,999 a year'));
    expect(find.text('RM1,999 a year'), findsOneWidget);
    expect(find.byKey(const Key('myPlan.buy.my-starter')), findsNothing);
  });

  testWidgets('an owner buys a plan on Google Play and MyCA records it once', (tester) async {
    final cloud = FakeCloud();
    final tokens = MemoryTokenStore();
    final session = (await tester.runAsync(() async {
      final session = await signedIn(cloud, tokens);
      await session.createBusiness(name: 'Teratai Digital Sdn Bhd', country: 'MY');
      return session;
    }))!;
    final store = RinggitStore();
    final state = AppState(cloud: session, store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true), pickTextFile: (_) async => null, now: () => myNow, edition: 'MY', languages: MemoryLanguageStore());
    await tester.runAsync(state.refresh);
    expect(state.snapshot?.activeUser?.role, 'owner');
    await tester.pumpWidget(myApp(state, MyPlanScreen(store: store)));
    await settle(tester);
    expect(find.text('RM 699.00 on Google Play'), findsOneWidget);
    await tapKey(tester, 'myPlan.buy.my-business');
    expect(store.bought, ['myca_my_business_yearly']);
    store.controller.add([const StorePurchase(productId: 'myca_my_business_yearly', token: 'tok-my-1', state: StorePurchaseState.purchased, needsFinish: true)]);
    await settle(tester);
    expect(cloud.recordedPurchases, ['myca_my_business_yearly:tok-my-1']);
    expect(store.finished, ['tok-my-1']);
    expect(find.textContaining('Business is on for this business'), findsOneWidget);
  });

  testWidgets('the plan screen reads in Malay', (tester) async {
    await tester.pumpWidget(myApp(myState(MyTestApi()), const MyPlanScreen(), language: 'ms'));
    await settle(tester);
    expect(find.text('RM299 setahun'), findsOneWidget);
  });
}
