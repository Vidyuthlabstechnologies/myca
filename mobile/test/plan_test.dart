import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:myca/billing/store_billing.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/screens/plan_screen.dart';

class FakeStore implements StoreBilling {
  final controller = StreamController<List<StorePurchase>>.broadcast();
  final finished = <String>[];

  @override
  Stream<List<StorePurchase>> get purchases => controller.stream;
  @override
  Future<bool> available() async => true;
  @override
  Future<Map<String, StoreProduct>> products(Set<String> ids) async => {for (final id in ids) id: StoreProduct(id: id, price: '₹499.00')};
  @override
  Future<bool> buy(String productId, String accountId) async => true;
  @override
  Future<bool> buyOnce(String productId, String accountId) async => true;
  @override
  Future<void> restore(String accountId) async {}
  @override
  Future<void> finish(StorePurchase purchase) async => finished.add(purchase.token);
}

void main() {
  test('a plan reads its price and limits in plain words, preferring the Play Store price', () {
    final essentials = PlanOffer.fromJson({'id': 'essentials', 'title': 'Essentials', 'monthlyRupees': 999, 'yearlyRupees': 9999, 'buyable': false, 'features': ['post'], 'limits': {'invoicesPerMonth': null, 'members': 2}});
    final pro = PlanOffer.fromJson({'id': 'pro', 'title': 'Pro', 'monthlyRupees': 1999, 'buyable': true, 'productId': 'myca_pro_monthly', 'features': ['einvoice'], 'limits': {'invoicesPerMonth': null, 'members': 5}});
    expect(planLimits(essentials), 'Unlimited invoices, up to 2 people');
    expect(planLimits(pro), 'Unlimited invoices, up to 5 people');
    expect(pro.productId, 'myca_pro_monthly');
    expect(planPrice(essentials, null), '₹999 a month or ₹9,999 a year');
    expect(planPrice(pro, null), '₹1,999 a month');
    expect(wholeRupees(24999), '₹24,999');
    expect(wholeRupees(150000), '₹1,50,000');
    expect(planPrice(pro, const StoreProduct(id: 'myca_pro_monthly', price: '₹549.00')), '₹549.00 a month on Google Play');
  });

  test('the entitlement line says trial, pending, on hold, ending or renewing', () {
    expect(entitlementLine(Entitlement.fromJson({'plan': 'pro', 'planTitle': 'Pro', 'trial': {'daysLeft': 1}})), 'Free trial of Pro: 1 day left.');
    expect(entitlementLine(Entitlement.fromJson({'plan': 'lapsed', 'planTitle': 'Trial ended', 'subscription': {'status': 'pending', 'plan': 'pro'}})), startsWith('Google Play is still processing'));
    expect(entitlementLine(Entitlement.fromJson({'plan': 'lapsed', 'planTitle': 'Trial ended', 'subscription': {'status': 'on_hold', 'plan': 'pro'}})), contains('could not take the last payment'));
    final paid = Entitlement.fromJson({'plan': 'firm', 'planTitle': 'CA firm', 'manageUrl': 'https://play.google.com/store/account/subscriptions', 'subscription': {'status': 'active', 'plan': 'firm', 'renews': true, 'currentEnd': '2026-12-05T00:00:00.000Z'}});
    expect(paid.paying, isTrue);
    expect(paid.manageUrl, startsWith('https://play.google.com'));
    expect(entitlementLine(paid), 'You are on CA firm, renews 2026-12-05.');
    final ending = Entitlement.fromJson({'plan': 'firm', 'planTitle': 'CA firm', 'subscription': {'status': 'canceled', 'plan': 'firm', 'renews': false, 'currentEnd': '2026-12-05T00:00:00.000Z'}});
    expect(ending.paying, isTrue);
    expect(entitlementLine(ending), 'You are on CA firm until 2026-12-05. It will not renew.');
    expect(Entitlement.fromJson({'plan': 'pro', 'planTitle': 'Pro', 'trial': {'daysLeft': 3}, 'subscription': {'status': 'expired', 'plan': 'pro'}}).paying, isFalse);
    expect(entitlementLine(Entitlement.fromJson({'plan': 'lapsed', 'planTitle': 'Trial ended'})), contains('read-only'));
  });

  test('a bought plan is sent to MyCA once and only finished with Google Play after MyCA accepts it', () async {
    final store = FakeStore();
    final recorded = <String>[];
    final results = <String>[];
    var fail = true;
    final recorder = PurchaseRecorder(
      store: store,
      record: (productId, token) async {
        if (fail) throw StateError('offline');
        recorded.add('$productId:$token');
      },
      onResult: (p, error) => results.add('${p.state.name}:${error == null ? 'ok' : 'error'}'),
    );
    const bought = StorePurchase(productId: 'myca_pro_monthly', token: 'tok-1', state: StorePurchaseState.purchased, needsFinish: true);
    await recorder.handle([bought]);
    expect(store.finished, isEmpty, reason: 'an unconfirmed purchase stays open so it is offered again');
    fail = false;
    await recorder.handle([bought]);
    await recorder.handle([bought]);
    expect(recorded, ['myca_pro_monthly:tok-1']);
    expect(store.finished, ['tok-1', 'tok-1']);
    await recorder.handle([const StorePurchase(productId: 'myca_pro_monthly', token: 'tok-2', state: StorePurchaseState.pending)]);
    await recorder.handle([const StorePurchase(productId: 'myca_pro_monthly', token: 'tok-3', state: StorePurchaseState.canceled)]);
    expect(recorded, hasLength(1));
    expect(results, ['purchased:error', 'purchased:ok', 'purchased:ok', 'pending:ok', 'canceled:ok']);
    expect(store.finished.last, 'tok-3');
  });
}
