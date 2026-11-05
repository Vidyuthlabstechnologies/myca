import 'package:flutter_test/flutter_test.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/screens/plan_screen.dart';

void main() {
  test('a plan reads its price limits in plain words', () {
    final free = PlanOffer.fromJson({'id': 'free', 'title': 'Free', 'monthlyRupees': 0, 'buyable': false, 'features': ['books'], 'limits': {'invoicesPerMonth': 30, 'members': 1}});
    final pro = PlanOffer.fromJson({'id': 'pro', 'title': 'Pro', 'monthlyRupees': 499, 'buyable': true, 'features': ['einvoice'], 'limits': {'invoicesPerMonth': null, 'members': 5}});
    expect(planLimits(free), '30 invoices a month, just you');
    expect(planLimits(pro), 'Unlimited invoices, up to 5 people');
    expect(pro.buyable, isTrue);
  });

  test('the entitlement line says trial, checkout, failed payment or paid', () {
    expect(entitlementLine(Entitlement.fromJson({'plan': 'pro', 'planTitle': 'Pro', 'trial': {'daysLeft': 1}})), 'Free trial of Pro: 1 day left.');
    expect(entitlementLine(Entitlement.fromJson({'plan': 'free', 'planTitle': 'Free', 'subscription': {'status': 'created', 'plan': 'pro'}})), startsWith('Checkout started'));
    expect(entitlementLine(Entitlement.fromJson({'plan': 'free', 'planTitle': 'Free', 'subscription': {'status': 'halted'}})), contains('payment failed'));
    final paid = Entitlement.fromJson({'plan': 'firm', 'planTitle': 'CA firm', 'subscription': {'status': 'active', 'currentEnd': '2026-12-05T00:00:00.000Z'}});
    expect(paid.paying, isTrue);
    expect(entitlementLine(paid), 'You are on CA firm, paid to 2026-12-05.');
  });
}
