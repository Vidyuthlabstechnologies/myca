import 'package:flutter/material.dart';

import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../billing/store_billing.dart';
import '../../cloud/cloud_session.dart';
import '../../theme.dart';
import '../../uae/uae_plan_strings.dart';
import '../../uae/uae_strings.dart';
import '../plan_screen.dart' show buyInApp;

abstract class UaePlanBilling {
  String? get accountId;
  Future<Map<String, dynamic>> plans();
  Future<Entitlement?> entitlement();
  Future<void> record(String productId, String purchaseToken);
}

class CloudUaePlanBilling implements UaePlanBilling {
  CloudUaePlanBilling(this.cloud);

  final CloudSession cloud;

  @override
  String? get accountId => cloud.businessId;

  @override
  Future<Map<String, dynamic>> plans() => cloud.countryPlans('AE');

  @override
  Future<Entitlement?> entitlement() => cloud.entitlement();

  @override
  Future<void> record(String productId, String purchaseToken) async => cloud.recordPurchase(productId, purchaseToken);
}

class UaePlanScreen extends StatefulWidget {
  const UaePlanScreen({super.key, this.store, this.billing, this.owner});

  final StoreBilling? store;
  final UaePlanBilling? billing;
  final bool? owner;

  @override
  State<UaePlanScreen> createState() => _UaePlanScreenState();
}

class _UaePlanScreenState extends State<UaePlanScreen> {
  bool _started = false;
  UaePlanBilling? _billing;
  StoreBilling? _store;
  PurchaseRecorder? _recorder;
  Entitlement? _entitlement;
  Set<String> _buyable = const {};
  Map<String, StoreProduct> _products = const {};
  bool _buying = false;
  String _note = '';
  String _boughtProduct = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    final cloud = AppScope.maybeOf(context)?.cloud;
    _billing = widget.billing ?? (cloud != null && cloud.ready ? CloudUaePlanBilling(cloud) : null);
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
      final entitlement = await billing.entitlement();
      if (mounted) setState(() => _entitlement = entitlement);
    } catch (_) {}
    try {
      final body = await billing.plans();
      final rows = body['plans'];
      final buyable = <String>{
        if (rows is List)
          for (final row in rows)
            if (row is Map && row['buyable'] == true && uaePlans.any((plan) => plan.productId == '${row['productId'] ?? ''}')) '${row['productId']}',
      };
      final accountId = billing.accountId;
      final store = widget.store ?? (buyInApp ? PlayBilling() : null);
      if (buyable.isEmpty || store == null || accountId == null || !await store.available()) return;
      final products = await store.products(buyable);
      _store = store;
      _recorder = PurchaseRecorder(
        store: store,
        accepts: (id) => uaePlans.any((plan) => plan.productId == id),
        record: (productId, token) async {
          _boughtProduct = productId;
          await billing.record(productId, token);
        },
        onResult: _onPurchase,
      )..start();
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

  void _onPurchase(StorePurchase purchase, Object? error) {
    if (!mounted) return;
    final t = UaeStrings.of(context);
    final bought = uaePlans.where((plan) => plan.productId == (_boughtProduct.isEmpty ? purchase.productId : _boughtProduct));
    setState(() {
      if (purchase.state != StorePurchaseState.pending) _buying = false;
      _note = switch (purchase.state) {
        StorePurchaseState.pending => t.purchasePending,
        StorePurchaseState.canceled => '',
        StorePurchaseState.failed => t.purchaseFailed,
        StorePurchaseState.purchased => error == null ? t.purchaseDone(bought.isEmpty ? '' : t.planName(bought.first.id)) : error is MycaApiException ? error.message : t.purchaseUnconfirmed,
      };
    });
  }

  Future<void> _buy(UaePlan plan) async {
    final store = _store;
    final accountId = _billing?.accountId;
    if (store == null || accountId == null || _buying) return;
    final t = UaeStrings.of(context);
    setState(() {
      _buying = true;
      _note = '';
    });
    final started = await store.buy(plan.productId, accountId).catchError((_) => false);
    if (!started && mounted) {
      setState(() {
        _buying = false;
        _note = t.purchaseOpenFailed;
      });
    }
  }

  bool _canBuy(UaePlan plan) => _buyable.contains(plan.productId) && _products.containsKey(plan.productId);

  @override
  Widget build(BuildContext context) {
    final t = UaeStrings.of(context);
    final text = Theme.of(context).textTheme;
    final state = AppScope.maybeOf(context);
    final owner = widget.owner ?? (state?.snapshot?.activeUser?.role == 'owner' || state?.cloud == null);
    final entitlement = _entitlement;
    final paying = entitlement?.paying ?? false;
    final open = uaePlans.any(_canBuy);
    final trialDays = entitlement?.trialDaysLeft;
    return Scaffold(
      appBar: AppBar(title: Text(t.planTitle)),
      body: SafeArea(
        child: ListView(
          key: const ValueKey('uae.plan.list'),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            if (!open) _Note(key: const ValueKey('uae.plan.notOpen'), text: t.plansNotOpen),
            if (trialDays != null) _Note(key: const ValueKey('uae.plan.trial'), text: t.trialLeft(trialDays)),
            if (entitlement?.plan == 'lapsed') _Note(key: const ValueKey('uae.plan.lapsed'), text: t.trialEnded, warn: true),
            if (_note.isNotEmpty) _Note(key: const ValueKey('uae.plan.note'), text: _note),
            for (final plan in uaePlans) ...[
              Container(
                key: ValueKey('uae.plan.${plan.id}'),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: Palette.surface, borderRadius: BorderRadius.circular(radiusCard), border: Border.all(color: entitlement?.plan == plan.id ? Palette.accent : Palette.line)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(t.planName(plan.id), style: text.titleLarge),
                        if (entitlement?.plan == plan.id)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(color: Palette.accentSoft, borderRadius: BorderRadius.circular(99)),
                            child: Text(t.currentPlan, style: text.labelMedium?.copyWith(color: Palette.accent)),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _canBuy(plan) ? t.playPrice(_products[plan.productId]!.price) : t.planPrice(plan),
                      key: ValueKey('uae.plan.price.${plan.id}'),
                      style: text.titleMedium?.copyWith(color: Palette.accent),
                    ),
                    const SizedBox(height: 4),
                    Text(t.planFor(plan.id), style: text.bodyMedium?.copyWith(color: Palette.muted)),
                    const SizedBox(height: 8),
                    for (final line in t.planIncludes(plan.id))
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(Icons.check, size: 18, color: Palette.accent),
                            const SizedBox(width: 8),
                            Expanded(child: Text(line, style: text.bodyMedium)),
                          ],
                        ),
                      ),
                    if (owner && !paying && _canBuy(plan)) ...[
                      const SizedBox(height: 12),
                      FilledButton(key: ValueKey('uae.plan.buy.${plan.id}'), onPressed: _buying ? null : () => _buy(plan), child: Text(t.subscribe(t.planName(plan.id)))),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
            Text(t.planTerms, key: const ValueKey('uae.plan.terms'), style: text.bodySmall?.copyWith(color: Palette.muted)),
            const SizedBox(height: 8),
            Text(t.planNotAgent, key: const ValueKey('uae.plan.notAgent'), style: text.bodySmall?.copyWith(color: Palette.muted)),
            if (!owner) ...[const SizedBox(height: 8), Text(t.ownerOnlyPlan, style: text.bodyMedium)],
            if (owner && paying && (entitlement?.manageUrl ?? '').isNotEmpty) ...[
              const SizedBox(height: 12),
              OutlinedButton(key: const ValueKey('uae.plan.manage'), onPressed: () => state?.openLink(Uri.parse(entitlement!.manageUrl)), child: Text(t.managePlan)),
            ],
          ],
        ),
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note({super.key, required this.text, this.warn = false});

  final String text;
  final bool warn;

  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 12),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: warn ? Palette.warnSoft : Palette.sunken, borderRadius: BorderRadius.circular(radiusCard)),
    child: Text(text, style: Theme.of(context).textTheme.bodyMedium),
  );
}
