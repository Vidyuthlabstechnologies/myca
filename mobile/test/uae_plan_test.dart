import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/billing/store_billing.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/screens/uae/uae_plan_screen.dart';
import 'package:myca/uae/uae_format.dart';
import 'package:myca/uae/uae_plan_strings.dart';
import 'package:myca_design/myca_design.dart';

class _Store implements StoreBilling {
  final controller = StreamController<List<StorePurchase>>.broadcast();
  final finished = <String>[];
  final bought = <String>[];

  @override
  Stream<List<StorePurchase>> get purchases => controller.stream;
  @override
  Future<bool> available() async => true;
  @override
  Future<Map<String, StoreProduct>> products(Set<String> ids) async => {for (final id in ids) id: StoreProduct(id: id, price: id.contains('business') ? 'AED 799.00' : 'AED 299.00')};
  @override
  Future<bool> buy(String productId, String accountId) async {
    bought.add('$productId:$accountId');
    return true;
  }

  @override
  Future<bool> buyOnce(String productId, String accountId) async => true;
  @override
  Future<void> restore(String accountId) async {}
  @override
  Future<void> finish(StorePurchase purchase) async => finished.add(purchase.token);
}

class _Billing implements UaePlanBilling {
  _Billing({this.open = true, this.trialDays = 9});

  final bool open;
  final int? trialDays;
  final recorded = <String>[];

  @override
  String? get accountId => 'biz-ae';

  @override
  Future<Map<String, dynamic>> plans() async => {
    'currency': 'AED',
    'plans': [
      {'id': 'ae-starter', 'productId': 'myca_ae_starter_monthly', 'buyable': open},
      {'id': 'ae-business', 'productId': 'myca_ae_business_monthly', 'buyable': open},
      {'id': 'ae-firm', 'productId': 'myca_ae_firm_monthly', 'buyable': false},
    ],
  };

  @override
  Future<Entitlement?> entitlement() async => Entitlement(plan: trialDays == null ? 'lapsed' : 'pro', planTitle: 'Pro', enforced: true, trialDaysLeft: trialDays, status: '', currentEnd: '');

  @override
  Future<void> record(String productId, String purchaseToken) async => recorded.add('$productId:$purchaseToken');
}

Future<void> _pump(WidgetTester tester, String lang, Widget screen, {Size size = const Size(360, 780), double textScale = 1}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  await tester.pumpWidget(MaterialApp(
    locale: Locale(lang, 'AE'),
    supportedLocales: uaeDesign.supportedLocales,
    localizationsDelegates: MycaDesign.localizationsDelegates,
    theme: uaeDesign.light,
    home: screen,
  ));
  await tester.pumpAndSettle();
}

void main() {
  test('the app sells the same three UAE plans and Play products as the server pack', () {
    expect(uaePlans.map((plan) => plan.id), ['ae-starter', 'ae-business', 'ae-firm']);
    expect(uaePlans.map((plan) => plan.productId), ['myca_ae_starter_monthly', 'myca_ae_business_monthly', 'myca_ae_firm_monthly']);
    expect(uaePlans.map((plan) => plan.monthlyAed), [299, 799, 2499]);
    expect(wholeDirhams(2499), '2,499');
  });

  for (final lang in ['en', 'ar']) {
    final ar = lang == 'ar';

    testWidgets('$lang: before launch the UAE plans show AED prices, the trial and the not-a-tax-agent line, and nothing to buy', (tester) async {
      await _pump(tester, lang, UaePlanScreen(store: _Store(), billing: _Billing(open: false), owner: true));
      expect(find.byKey(const ValueKey('uae.plan.notOpen')), findsOneWidget);
      expect(find.byKey(const ValueKey('uae.plan.trial')), findsOneWidget);
      for (final plan in uaePlans) {
        final price = find.byKey(ValueKey('uae.plan.price.${plan.id}'));
        await tester.scrollUntilVisible(price, 200, scrollable: find.byType(Scrollable).first);
        expect((tester.widget<Text>(price).data ?? ''), contains(wholeDirhams(plan.monthlyAed)));
        expect((tester.widget<Text>(price).data ?? ''), contains('AED'));
      }
      expect(find.byType(FilledButton), findsNothing);
      await tester.scrollUntilVisible(find.byKey(const ValueKey('uae.plan.notAgent')), 200, scrollable: find.byType(Scrollable).first);
      expect(find.textContaining(ar ? 'إمارات تاكس' : 'EmaraTax'), findsWidgets);
      expect(find.textContaining('₹'), findsNothing);
      expect(find.textContaining('GST'), findsNothing);
      expect(find.textContaining(' CA'), findsNothing);
      expect(Directionality.of(tester.element(find.byKey(const ValueKey('uae.plan.terms')))), ar ? TextDirection.rtl : TextDirection.ltr);
      expect(tester.takeException(), isNull);
    });

    testWidgets('$lang: once open, a plan is bought in Google Play and confirmed with MyCA', (tester) async {
      final store = _Store();
      final billing = _Billing();
      await _pump(tester, lang, UaePlanScreen(store: store, billing: billing, owner: true));
      expect(find.byKey(const ValueKey('uae.plan.notOpen')), findsNothing);
      expect(find.byKey(const ValueKey('uae.plan.buy.ae-firm')), findsNothing, reason: 'only plans the server sells get a button');
      final buy = find.byKey(const ValueKey('uae.plan.buy.ae-business'));
      await tester.scrollUntilVisible(buy, 200, scrollable: find.byType(Scrollable).first);
      expect((tester.widget<Text>(find.byKey(const ValueKey('uae.plan.price.ae-business'))).data ?? ''), contains('AED 799.00'));
      await tester.ensureVisible(buy);
      await tester.pumpAndSettle();
      await tester.tap(buy);
      await tester.pump();
      expect(store.bought, ['myca_ae_business_monthly:biz-ae']);
      store.controller.add([const StorePurchase(productId: 'myca_ae_business_monthly', token: 'tok-ae', state: StorePurchaseState.purchased, needsFinish: true)]);
      await tester.pumpAndSettle();
      expect(billing.recorded, ['myca_ae_business_monthly:tok-ae']);
      expect(store.finished, ['tok-ae']);
      await tester.scrollUntilVisible(find.byKey(const ValueKey('uae.plan.note')), -200, scrollable: find.byType(Scrollable).first);
      expect(find.text(ar ? 'شكرًا لك. باقة الأعمال مفعّلة لهذه المنشأة.' : 'Thank you. Business is on for this business.'), findsOneWidget);
    });

    testWidgets('$lang: after the trial the screen says the books are read-only; a staff member cannot buy', (tester) async {
      await _pump(tester, lang, UaePlanScreen(store: _Store(), billing: _Billing(trialDays: null), owner: false));
      expect(find.byKey(const ValueKey('uae.plan.lapsed')), findsOneWidget);
      expect(find.byType(FilledButton), findsNothing);
    });

    testWidgets('$lang: the plan screen fits a small phone at large text without overflow', (tester) async {
      await _pump(tester, lang, UaePlanScreen(store: _Store(), billing: _Billing(), owner: true), size: const Size(320, 640), textScale: 1.6);
      for (final plan in uaePlans) {
        await tester.scrollUntilVisible(find.byKey(ValueKey('uae.plan.${plan.id}')), 200, scrollable: find.byType(Scrollable).first);
      }
      expect(tester.takeException(), isNull);
    });
  }
}
