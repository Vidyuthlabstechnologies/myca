import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../billing/store_billing.dart';
import '../cloud/cloud_session.dart';
import '../theme.dart';

bool get buyInApp => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

const featureWords = {
  'books': 'See and export your books',
  'post': 'Unlimited invoices, bills, receipts and payments',
  'gst-reports': 'GSTR-1 and GSTR-3B worked out from your books',
  'gst-returns': 'File GSTR-1 and GSTR-3B on the GST portal, with your CA\'s approval',
  'chat': 'Ask MyCA in plain words',
  'einvoice': 'E-invoices (IRN) and GSTIN checks',
  'connectors': 'Amazon, Shopify, Razorpay, Zoho and bank connections',
  'whatsapp': 'Ask and post on WhatsApp',
  'team': 'Staff and your accountant in the same books',
  'priority-support': 'Priority support',
};

String planLimits(PlanOffer plan) {
  final invoices = plan.invoicesPerMonth == null ? 'Unlimited invoices' : '${plan.invoicesPerMonth} invoices a month';
  final people = plan.members == null ? 'any number of people' : plan.members == 1 ? 'just you' : 'up to ${plan.members} people';
  return '$invoices, $people';
}

String wholeRupees(int amount) {
  final digits = '$amount';
  if (digits.length <= 3) return '₹$digits';
  final last = digits.substring(digits.length - 3);
  var rest = digits.substring(0, digits.length - 3);
  final groups = <String>[];
  while (rest.length > 2) {
    groups.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) groups.insert(0, rest);
  return '₹${groups.join(',')},$last';
}

String planPrice(PlanOffer plan, StoreProduct? product) {
  if (product != null && product.price.isNotEmpty) return '${product.price} a month on Google Play';
  final monthly = '${wholeRupees(plan.monthlyRupees)} a month';
  return plan.yearlyRupees > 0 ? '$monthly or ${wholeRupees(plan.yearlyRupees)} a year' : monthly;
}

String entitlementLine(Entitlement e) {
  final until = e.currentEnd.length >= 10 ? e.currentEnd.substring(0, 10) : '';
  if (e.trialDaysLeft != null) return 'Free trial of ${e.planTitle}: ${e.trialDaysLeft} ${e.trialDaysLeft == 1 ? 'day' : 'days'} left.';
  if (e.status == 'pending') return 'Google Play is still processing the payment. The plan starts as soon as it clears.';
  if (e.status == 'on_hold' || e.status == 'paused') return 'Google Play could not take the last payment, so the books are read-only. Fix the payment method in Google Play to get the plan back.';
  if (e.plan == 'lapsed') return 'The free trial has ended, so the books are read-only: you can still see, ask and export. Choose a plan to post again.';
  if (e.paying && !e.renews) return 'You are on ${e.planTitle}${until.isEmpty ? '' : ' until $until'}. It will not renew.';
  if (e.paying) return 'You are on ${e.planTitle}${until.isEmpty ? '' : ', renews $until'}.';
  return 'You are on ${e.planTitle}.';
}

class PlanScreen extends StatefulWidget {
  const PlanScreen({super.key, this.store});

  final StoreBilling? store;

  @override
  State<PlanScreen> createState() => _PlanScreenState();
}

class _PlanScreenState extends State<PlanScreen> {
  List<PlanOffer>? _plans;
  Entitlement? _entitlement;
  Map<String, StoreProduct> _products = const {};
  StoreBilling? _store;
  PurchaseRecorder? _recorder;
  bool _storeReady = false;
  bool _buying = false;
  String _error = '';
  String _note = '';
  bool _busy = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_plans == null && !_busy && _error.isEmpty) _reload();
  }

  @override
  void dispose() {
    _recorder?.stop();
    super.dispose();
  }

  Future<void> _startStore(CloudSession cloud, List<PlanOffer> plans) async {
    final store = widget.store ?? (buyInApp ? PlayBilling() : null);
    final accountId = cloud.businessId;
    if (store == null || accountId == null || _store != null) return;
    _store = store;
    try {
      if (!await store.available()) return;
      final ids = {for (final p in plans) if (p.buyable && p.productId.isNotEmpty) p.productId};
      final products = ids.isEmpty ? const <String, StoreProduct>{} : await store.products(ids);
      _recorder = PurchaseRecorder(store: store, record: (productId, token) async => _entitlement = await cloud.recordPurchase(productId, token), onResult: _onPurchase)..start();
      await store.restore(accountId);
      if (mounted) {
        setState(() {
          _products = products;
          _storeReady = true;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _storeReady = false);
    }
  }

  void _onPurchase(StorePurchase purchase, Object? error) {
    if (!mounted) return;
    final shown = _buying;
    setState(() {
      if (purchase.state != StorePurchaseState.pending) _buying = false;
      if (!shown && error != null) return;
      _note = switch (purchase.state) {
        StorePurchaseState.pending => 'Google Play is processing the payment. The plan starts as soon as it clears.',
        StorePurchaseState.canceled => '',
        StorePurchaseState.failed => 'Google Play did not complete the payment. Nothing was charged.',
        StorePurchaseState.purchased => error == null ? 'Thank you. ${_entitlement?.planTitle ?? 'The plan'} is on for this business.' : error is MycaApiException ? error.message : 'The payment went through but MyCA could not confirm it yet. It will be picked up automatically.',
      };
    });
  }

  Future<void> _reload() async {
    final cloud = AppScope.of(context).cloud!;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final plans = await cloud.plans();
      final entitlement = await cloud.entitlement();
      if (mounted) {
        setState(() {
          _plans = plans;
          _entitlement = entitlement;
        });
      }
      await _startStore(cloud, plans);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _buy(PlanOffer plan) async {
    final store = _store;
    final accountId = AppScope.of(context).cloud?.businessId;
    if (store == null || accountId == null) return;
    setState(() {
      _buying = true;
      _note = '';
    });
    final started = await store.buy(plan.productId, accountId).catchError((_) => false);
    if (!started && mounted) {
      setState(() {
        _buying = false;
        _note = 'Google Play could not open the payment. Check that you are signed in to the Play Store and try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final state = AppScope.of(context);
    final owner = state.snapshot?.activeUser?.role == 'owner';
    final plans = _plans;
    final e = _entitlement;
    final canBuy = owner && buyInApp && _storeReady;
    return Scaffold(
      appBar: AppBar(title: const Text('Plan and billing')),
      body: plans == null || e == null
          ? Center(
              child: _error.isEmpty
                  ? const CircularProgressIndicator()
                  : Padding(padding: const EdgeInsets.all(24), child: Text(_error, textAlign: TextAlign.center, style: text.bodyMedium?.copyWith(color: Palette.danger))),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                Text(entitlementLine(e), style: text.titleMedium),
                if (e.testPurchase) ...[
                  const SizedBox(height: 6),
                  Text('This is a Google Play test purchase: no real money is taken.', style: text.bodyMedium?.copyWith(color: Palette.warn)),
                ],
                if (_note.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(_note, style: text.bodyMedium),
                ],
                for (final plan in plans) ...[
                  const SizedBox(height: 16),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(plan.id == e.plan ? '${plan.title} (current)' : plan.title, style: text.titleMedium),
                          const SizedBox(height: 4),
                          Text(planPrice(plan, _products[plan.productId]), style: text.bodyLarge),
                          const SizedBox(height: 4),
                          Text(planLimits(plan), style: text.bodyMedium),
                          const SizedBox(height: 8),
                          for (final feature in plan.features) Text('• ${featureWords[feature] ?? feature}', style: text.bodyMedium),
                          if (canBuy && plan.buyable && _products.containsKey(plan.productId) && !e.paying) ...[
                            const SizedBox(height: 12),
                            FilledButton(key: ValueKey('buy.${plan.id}'), onPressed: _busy || _buying ? null : () => _buy(plan), child: Text('Subscribe to ${plan.title}')),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
                if (owner && e.paying && e.manageUrl.isNotEmpty && buyInApp) ...[
                  const SizedBox(height: 16),
                  OutlinedButton(onPressed: () => state.openLink(Uri.parse(e.manageUrl)), child: const Text('Manage or cancel in Google Play')),
                  const SizedBox(height: 6),
                  Text('To switch plans, cancel in Google Play and subscribe to the other plan when this one ends.', style: text.bodySmall),
                ],
                if (!owner) ...[
                  const SizedBox(height: 16),
                  Text('Only the owner can change the plan.', style: text.bodyMedium),
                ],
                if (owner && !buyInApp && defaultTargetPlatform != TargetPlatform.iOS) ...[
                  const SizedBox(height: 16),
                  Text('Plans are bought from Google Play in the MyCA Android app. A plan bought there works here too.', style: text.bodyMedium),
                ],
              ],
            ),
    );
  }
}
