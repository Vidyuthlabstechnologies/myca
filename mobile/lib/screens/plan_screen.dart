import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../billing/store_billing.dart';
import '../cloud/cloud_session.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../theme.dart';

bool get buyInApp => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

Map<String, String> featureWordsIn(String lang) => {
  'books': inLine(lang, 'See and export your books'),
  'post': inLine(lang, 'Unlimited invoices, bills, receipts and payments'),
  'gst-reports': inLine(lang, 'GSTR-1 and GSTR-3B worked out from your books'),
  'gst-returns': inLine(lang, 'File GSTR-1 and GSTR-3B on the GST portal, with your CA\'s approval'),
  'chat': inLine(lang, 'Ask MyCA in plain words'),
  'einvoice': inLine(lang, 'E-invoices (IRN) and GSTIN checks'),
  'connectors': inLine(lang, 'Amazon, Shopify, Razorpay, Zoho and bank connections'),
  'whatsapp': inLine(lang, 'Ask and post on WhatsApp'),
  'team': inLine(lang, 'Staff and your accountant in the same books'),
  'ca-assured': inLine(lang, 'An independent GST practitioner or chartered accountant, named before you subscribe, reviews and files your GST and TDS returns every month. That professional, not MyCA, is responsible for their work'),
  'accuracy-promise': inLine(lang, 'Correction promise: if a return filed through MyCA is wrong because of an error in MyCA, we prepare the correction at no charge. Interest, late fees and penalties are not covered'),
  'priority-support': inLine(lang, 'Priority support'),
};

final featureWords = featureWordsIn('en');

String planLimits(PlanOffer plan, [String lang = 'en']) {
  final parts = {'invoices': plan.invoicesPerMonth, 'people': plan.members};
  final line = plan.invoicesPerMonth == null
      ? (plan.members == null
            ? inLine(lang, 'Unlimited invoices, any number of people')
            : plan.members == 1
            ? inLine(lang, 'Unlimited invoices, just you')
            : inLine(lang, 'Unlimited invoices, up to {people} people'))
      : (plan.members == null
            ? inLine(lang, '{invoices} invoices a month, any number of people')
            : plan.members == 1
            ? inLine(lang, '{invoices} invoices a month, just you')
            : inLine(lang, '{invoices} invoices a month, up to {people} people'));
  return inFill(line, parts);
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

String planPrice(PlanOffer plan, StoreProduct? product, [String lang = 'en']) {
  if (product != null && product.price.isNotEmpty) return inFill(inLine(lang, '{price} a month on Google Play, GST included'), {'price': product.price});
  return inFill(inLine(lang, '{price} a month plus GST'), {'price': wholeRupees(plan.monthlyRupees)});
}

String renewalTerms(PlanOffer plan, StoreProduct? product, [String lang = 'en']) {
  if (product != null && product.price.isNotEmpty) {
    return inFill(inLine(lang, 'Renews every month at {price} until you cancel. Cancel any time in Google Play, Subscriptions; the plan runs to the end of the month you paid for. Google Play handles refunds.'), {'price': product.price});
  }
  return inFill(inLine(lang, 'Renews every month at {price} plus GST until you cancel. Cancel any time in Google Play, Subscriptions; the plan runs to the end of the month you paid for. Google Play handles refunds.'), {'price': wholeRupees(plan.monthlyRupees)});
}

String entitlementLine(Entitlement e, [String lang = 'en']) {
  final until = e.currentEnd.length >= 10 ? longDate(e.currentEnd.substring(0, 10)) : '';
  final parts = {'plan': e.planTitle, 'n': e.trialDaysLeft, 'date': until};
  if (e.trialDaysLeft != null) return inFill(e.trialDaysLeft == 1 ? inLine(lang, 'Free trial of {plan}: 1 day left.') : inLine(lang, 'Free trial of {plan}: {n} days left.'), parts);
  if (e.status == 'pending') return inLine(lang, 'Google Play is still processing the payment. The plan starts as soon as it clears.');
  if (e.status == 'on_hold' || e.status == 'paused') return inLine(lang, 'Google Play could not take the last payment, so the books are read-only. Fix the payment method in Google Play to get the plan back.');
  if (e.plan == 'lapsed') return inLine(lang, 'The free trial has ended, so the books are read-only: you can still see, ask and export. Choose a plan to post again.');
  if (e.paying && !e.renews) return inFill(until.isEmpty ? inLine(lang, 'You are on {plan}. It will not renew.') : inLine(lang, 'You are on {plan} until {date}. It will not renew.'), parts);
  if (e.paying) return inFill(until.isEmpty ? inLine(lang, 'You are on {plan}.') : inLine(lang, 'You are on {plan}, renews {date}.'), parts);
  return inFill(inLine(lang, 'You are on {plan}.'), parts);
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
      _recorder = PurchaseRecorder(store: store, accepts: (id) => plans.any((p) => p.productId == id), record: (productId, token) async => _entitlement = await cloud.recordPurchase(productId, token), onResult: _onPurchase)..start();
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
        StorePurchaseState.pending => inText(context, 'Google Play is processing the payment. The plan starts as soon as it clears.'),
        StorePurchaseState.canceled => '',
        StorePurchaseState.failed => inText(context, 'Google Play did not complete the payment. Nothing was charged.'),
        StorePurchaseState.purchased => error == null
            ? (_entitlement == null ? inText(context, 'Thank you. The plan is on for this business.') : inFormat(context, 'Thank you. {plan} is on for this business.', {'plan': _entitlement!.planTitle}))
            : error is MycaApiException
            ? error.message
            : inText(context, 'The payment went through but MyCA could not confirm it yet. It will be picked up automatically.'),
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
        AppScope.of(context).reachSteps(['plan_viewed', if (entitlement.trialDaysLeft != null) 'trial_started', if (entitlement.paying) 'paid']);
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
        _note = inText(context, 'Google Play could not open the payment. Check that you are signed in to the Play Store and try again.');
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
    final lang = indiaLang(context);
    final features = featureWordsIn(lang);
    return Scaffold(
      appBar: AppBar(title: Text(inText(context, 'Plan and billing'))),
      body: plans == null || e == null
          ? Center(
              child: _error.isEmpty
                  ? const CircularProgressIndicator()
                  : Padding(padding: const EdgeInsets.all(24), child: Text(_error, textAlign: TextAlign.center, style: text.bodyMedium?.copyWith(color: paletteOf(context).danger))),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                Text(entitlementLine(e, lang), style: text.titleMedium),
                if (e.testPurchase) ...[
                  const SizedBox(height: 6),
                  Text(inText(context, 'This is a Google Play test purchase: no real money is taken.'), style: text.bodyMedium?.copyWith(color: paletteOf(context).warn)),
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
                          Text(plan.id == e.plan ? inFormat(context, '{plan} (current)', {'plan': plan.title}) : plan.title, style: text.titleMedium),
                          const SizedBox(height: 4),
                          Text(planPrice(plan, _products[plan.productId], lang), style: text.bodyLarge),
                          const SizedBox(height: 4),
                          Text(planLimits(plan, lang), style: text.bodyMedium),
                          const SizedBox(height: 8),
                          for (final feature in plan.features) Text('• ${features[feature] ?? feature}', style: text.bodyMedium),
                          if (plan.opening) ...[
                            const SizedBox(height: 8),
                            Text(inText(context, 'Opening soon. It opens once the professional who reviews and files is named here.'), style: text.bodyMedium?.copyWith(color: paletteOf(context).warn)),
                          ],
                          if (plan.professional.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Text(inFormat(context, 'Your reviewing professional: {name}', {'name': plan.professional}), style: text.bodyMedium),
                          ],
                          if (canBuy && plan.buyable && _products.containsKey(plan.productId) && !e.paying) ...[
                            const SizedBox(height: 12),
                            Text(renewalTerms(plan, _products[plan.productId], lang), key: ValueKey('renewal.${plan.id}'), style: text.bodySmall),
                            const SizedBox(height: 8),
                            FilledButton(key: ValueKey('buy.${plan.id}'), onPressed: _busy || _buying ? null : () => _buy(plan), child: Text(inFormat(context, 'Subscribe to {plan}', {'plan': plan.title}))),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
                if (owner && e.paying && e.manageUrl.isNotEmpty && buyInApp) ...[
                  const SizedBox(height: 16),
                  OutlinedButton(onPressed: () => state.openLink(Uri.parse(e.manageUrl)), child: Text(inText(context, 'Manage or cancel in Google Play'))),
                  const SizedBox(height: 6),
                  Text(inText(context, 'To switch plans, cancel in Google Play and subscribe to the other plan when this one ends.'), style: text.bodySmall),
                ],
                if (!owner) ...[
                  const SizedBox(height: 16),
                  Text(inText(context, 'Only the owner can change the plan.'), style: text.bodyMedium),
                ],
                const SizedBox(height: 16),
                Text(inText(context, 'MyCA is software. It is not a firm of chartered accountants and does not give tax or legal advice. You approve every return before it is filed.'), key: const ValueKey('plan.notAdvice'), style: text.bodySmall),
                if (owner && !buyInApp && defaultTargetPlatform != TargetPlatform.iOS) ...[
                  const SizedBox(height: 16),
                  Text(inText(context, 'Plans are bought from Google Play in the MyCA Android app. A plan bought there works here too.'), style: text.bodyMedium),
                ],
              ],
            ),
    );
  }
}
