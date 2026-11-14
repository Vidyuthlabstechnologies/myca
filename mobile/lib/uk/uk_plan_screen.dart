import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../billing/store_billing.dart';
import '../cloud/cloud_session.dart';
import '../screens/plan_screen.dart' show buyInApp;
import 'uk_common.dart';

class UkPlan {
  const UkPlan({required this.id, required this.title, required this.price, required this.forWho, required this.includes, required this.productId});

  final String id;
  final String title;
  final String price;
  final String forWho;
  final List<String> includes;
  final String productId;
}

const ukPlans = <UkPlan>[
  UkPlan(id: 'uk-sole-trader', productId: 'myca_uk_sole_trader_monthly', title: 'Sole Trader', price: '£49 a month', forWho: 'One sole trader or landlord', includes: [
    'Digital records, invoices and bills with VAT',
    'MTD for Income Tax: quarterly updates, calculations, final declaration and amendments',
    'MTD for VAT: nine-box returns built from your books',
    'Tax estimate, deadline calendar and penalty points guide',
  ]),
  UkPlan(id: 'uk-business', productId: 'myca_uk_business_monthly', title: 'Business', price: '£99 a month', forWho: 'A growing business with staff or an accountant in the books', includes: [
    'Everything in Sole Trader',
    'More people in the same books',
    'Priority help',
  ]),
  UkPlan(id: 'uk-accountant', productId: 'myca_uk_accountant_monthly', title: 'Accountant firm', price: '£499 a month', forWho: 'Firms filing for many clients', includes: [
    'Everything in Business, for every client',
    'File as the agent with HMRC\'s agent declaration',
  ]),
];

const ukSelfAssessmentAddOn = 'Self Assessment return preparation: £149 per return, paid separately.';

const ukPlansNotOpen = 'Plans open when MyCA UK launches on Google Play. Until then the app runs against HMRC\'s test service and nothing is charged.';

const ukPlanTerms = 'Each plan has a 14-day free trial. Google Play shows the final price, including VAT, before you pay, and you can cancel any time in Google Play, Subscriptions.';

abstract class UkPlanBilling {
  String? get accountId;
  Future<Map<String, dynamic>> plans();
  Future<String> record(String productId, String purchaseToken);
}

class CloudUkPlanBilling implements UkPlanBilling {
  CloudUkPlanBilling(this.cloud);

  final CloudSession cloud;

  @override
  String? get accountId => cloud.businessId;

  @override
  Future<Map<String, dynamic>> plans() => cloud.countryPlans('GB');

  @override
  Future<String> record(String productId, String purchaseToken) async => (await cloud.recordPurchase(productId, purchaseToken)).planTitle;
}

const ukPlayFailed = 'Google Play could not open the payment. Check that you are signed in to the Play Store and try again.';

class UkPlanScreen extends StatefulWidget {
  const UkPlanScreen({super.key, this.store, this.billing});

  final StoreBilling? store;
  final UkPlanBilling? billing;

  @override
  State<UkPlanScreen> createState() => _UkPlanScreenState();
}

class _UkPlanScreenState extends State<UkPlanScreen> {
  bool _started = false;
  UkPlanBilling? _billing;
  StoreBilling? _store;
  PurchaseRecorder? _recorder;
  Set<String> _buyable = const {};
  Map<String, StoreProduct> _products = const {};
  bool _buying = false;
  String _note = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    final cloud = AppScope.of(context).cloud;
    _billing = widget.billing ?? (cloud != null && cloud.ready ? CloudUkPlanBilling(cloud) : null);
    if (_billing != null) _load();
  }

  @override
  void dispose() {
    _recorder?.stop();
    super.dispose();
  }

  Future<void> _load() async {
    final billing = _billing!;
    try {
      final body = await billing.plans();
      final rows = body['plans'];
      final buyable = <String>{
        if (rows is List)
          for (final row in rows)
            if (row is Map && row['buyable'] == true && '${row['productId'] ?? ''}'.isNotEmpty) '${row['productId']}',
      };
      final accountId = billing.accountId;
      final store = widget.store ?? (buyInApp ? PlayBilling() : null);
      if (buyable.isEmpty || store == null || accountId == null || !await store.available()) return;
      final products = await store.products(buyable);
      _store = store;
      _recorder = PurchaseRecorder(store: store, accepts: (id) => ukPlans.any((plan) => plan.productId == id), record: (productId, token) async => _onRecorded(await billing.record(productId, token)), onResult: _onPurchase)..start();
      await store.restore(accountId);
      if (mounted) {
        setState(() {
          _buyable = buyable;
          _products = products;
        });
      }
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    } catch (_) {}
  }

  String _recordedTitle = '';

  void _onRecorded(String title) => _recordedTitle = title;

  void _onPurchase(StorePurchase purchase, Object? error) {
    if (!mounted) return;
    setState(() {
      if (purchase.state != StorePurchaseState.pending) _buying = false;
      _note = switch (purchase.state) {
        StorePurchaseState.pending => 'Google Play is processing the payment. The plan starts as soon as it clears.',
        StorePurchaseState.canceled => '',
        StorePurchaseState.failed => 'Google Play did not complete the payment. Nothing was charged.',
        StorePurchaseState.purchased => error == null ? 'Thank you. ${_recordedTitle.isEmpty ? 'The plan' : _recordedTitle} is on for this business.' : error is MycaApiException ? error.message : 'The payment went through but MyCA could not confirm it yet. It will be picked up automatically.',
      };
    });
  }

  Future<void> _buy(UkPlan plan) async {
    final store = _store;
    final accountId = _billing?.accountId;
    if (store == null || accountId == null) return;
    setState(() {
      _buying = true;
      _note = '';
    });
    final started = await store.buy(plan.productId, accountId).catchError((_) => false);
    if (!started && mounted) {
      setState(() {
        _buying = false;
        _note = ukPlayFailed;
      });
    }
  }

  bool _canBuy(UkPlan plan) => _buyable.contains(plan.productId) && _products.containsKey(plan.productId);

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final open = ukPlans.any(_canBuy);
    return Scaffold(
      appBar: AppBar(title: const Text('Plan and billing')),
      body: ListView(
        padding: ukPagePadding,
        children: [
          if (!open) const UkCard(key: Key('uk.plan.notOpen'), children: [UkNote(ukPlansNotOpen)]),
          if (_note.isNotEmpty) UkCard(key: const Key('uk.plan.note'), children: [UkNote(_note)]),
          const SizedBox(height: 12),
          for (final plan in ukPlans) ...[
            UkCard(
              key: Key('uk.plan.${plan.id}'),
              children: [
                Text(plan.title, style: text.titleMedium),
                const SizedBox(height: 4),
                Text(_canBuy(plan) ? '${_products[plan.productId]!.price} a month on Google Play' : plan.price, style: text.headlineSmall),
                const SizedBox(height: 4),
                Text(plan.forWho, style: text.bodyMedium),
                const SizedBox(height: 8),
                for (final line in plan.includes)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text('• $line', style: text.bodyMedium),
                  ),
                if (_canBuy(plan)) ...[
                  const SizedBox(height: 8),
                  FilledButton(key: Key('uk.plan.buy.${plan.id}'), onPressed: _buying ? null : () => _buy(plan), child: Text('Subscribe to ${plan.title}')),
                ],
              ],
            ),
            const SizedBox(height: 12),
          ],
          const UkNote(ukSelfAssessmentAddOn),
          const UkNote(ukPlanTerms),
          const UkFooter(),
        ],
      ),
    );
  }
}
