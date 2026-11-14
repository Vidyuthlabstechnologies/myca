import 'package:flutter/material.dart';
import 'package:myca_design/myca_design.dart' show MycaThemeContext;

import '../../app_state.dart';
import '../../billing/store_billing.dart';
import '../../cloud/cloud_session.dart';
import '../../format.dart';
import '../../my/my_strings.dart';
import '../plan_screen.dart' show buyInApp;
import 'my_widgets.dart';

class MyPlanOffer {
  const MyPlanOffer({required this.id, required this.yearlyRinggit, required this.productId, required this.features});

  final String id;
  final int yearlyRinggit;
  final String productId;
  final List<String> features;
}

const myPlans = [
  MyPlanOffer(id: 'my-starter', yearlyRinggit: 299, productId: 'myca_my_starter_yearly', features: ['einvoice', 'sst', 'tax']),
  MyPlanOffer(id: 'my-business', yearlyRinggit: 699, productId: 'myca_my_business_yearly', features: ['starter', 'consolidated', 'team']),
  MyPlanOffer(id: 'my-pro', yearlyRinggit: 1999, productId: 'myca_my_pro_yearly', features: ['business', 'agent', 'support']),
];

String wholeRinggit(int amount) => ringgit(amount).replaceFirst('.00', '');

class MyPlanScreen extends StatefulWidget {
  const MyPlanScreen({super.key, this.store});

  final StoreBilling? store;

  @override
  State<MyPlanScreen> createState() => _MyPlanScreenState();
}

class _MyPlanScreenState extends State<MyPlanScreen> {
  Entitlement? _entitlement;
  Map<String, StoreProduct> _products = const {};
  StoreBilling? _store;
  PurchaseRecorder? _recorder;
  bool _storeReady = false;
  bool _buying = false;
  bool _started = false;
  String _note = '';
  String _error = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    final cloud = AppScope.of(context).cloud;
    if (cloud != null && !mySandbox(context)) _start(cloud);
  }

  @override
  void dispose() {
    _recorder?.stop();
    super.dispose();
  }

  Future<void> _start(CloudSession cloud) async {
    final t = MyStrings.of(context);
    try {
      final entitlement = await cloud.entitlement();
      if (mounted) setState(() => _entitlement = entitlement);
    } catch (error) {
      if (mounted) setState(() => _error = myErrorMessage(t, error));
    }
    final store = widget.store ?? (buyInApp ? PlayBilling() : null);
    final accountId = cloud.businessId;
    if (store == null || accountId == null) return;
    _store = store;
    try {
      if (!await store.available()) return;
      final products = await store.products({for (final plan in myPlans) plan.productId});
      _recorder = PurchaseRecorder(
        store: store,
        accepts: (id) => myPlans.any((plan) => plan.productId == id),
        record: (productId, token) async => _entitlement = await cloud.recordPurchase(productId, token),
        onResult: _onPurchase,
      )..start();
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
    final t = MyStrings.of(context);
    setState(() {
      if (purchase.state != StorePurchaseState.pending) _buying = false;
      _note = switch (purchase.state) {
        StorePurchaseState.pending => t.purchasePending,
        StorePurchaseState.canceled => '',
        StorePurchaseState.failed => t.purchaseFailed,
        StorePurchaseState.purchased => error == null ? t.purchaseDone(_entitlement?.planTitle ?? '') : myErrorMessage(t, error),
      };
    });
  }

  Future<void> _buy(MyPlanOffer plan) async {
    final store = _store;
    final accountId = AppScope.of(context).cloud?.businessId;
    if (store == null || accountId == null || _buying) return;
    final t = MyStrings.of(context);
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

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    final text = Theme.of(context).textTheme;
    final palette = context.myca;
    final state = AppScope.of(context);
    final sandbox = mySandbox(context);
    final owner = state.snapshot?.activeUser?.role == 'owner' || state.cloud == null;
    final entitlement = _entitlement;
    final canBuy = owner && _storeReady && !sandbox && !(entitlement?.paying ?? false);
    return Scaffold(
      appBar: AppBar(title: Text(t.planTitle)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            if (sandbox) ...[MyNote(t.sandboxNoBuy, tone: MyTone.warn), const SizedBox(height: 12)],
            if (_error.isNotEmpty) ...[MyErrorBox(message: _error), const SizedBox(height: 12)],
            if (_note.isNotEmpty) ...[MyNote(_note), const SizedBox(height: 12)],
            for (final plan in myPlans) ...[
              MyPanel(
                key: Key('myPlan.${plan.id}'),
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
                            decoration: BoxDecoration(color: palette.accentSoft, borderRadius: BorderRadius.circular(99)),
                            child: Text(t.current, style: text.labelMedium?.copyWith(color: palette.accent)),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _products[plan.productId]?.price.isNotEmpty == true ? t.onPlay(_products[plan.productId]!.price) : t.perYear(wholeRinggit(plan.yearlyRinggit)),
                      style: text.titleMedium?.copyWith(color: palette.accent),
                    ),
                    const SizedBox(height: 8),
                    for (final feature in plan.features)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(Icons.check, size: 18, color: palette.accent),
                            const SizedBox(width: 8),
                            Expanded(child: Text(t.planFeature(feature), style: text.bodyMedium)),
                          ],
                        ),
                      ),
                    if (canBuy && _products.containsKey(plan.productId)) ...[
                      const SizedBox(height: 12),
                      FilledButton(key: Key('myPlan.buy.${plan.id}'), onPressed: _buying ? null : () => _buy(plan), child: Text(t.subscribe(t.planName(plan.id)))),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
            Text(t.playNote, style: text.bodySmall?.copyWith(color: palette.muted)),
            if (!owner) ...[const SizedBox(height: 8), Text(t.ownerOnly, style: text.bodyMedium)],
            if (!sandbox && owner && !buyInApp) ...[const SizedBox(height: 8), Text(t.playUnavailable, style: text.bodyMedium)],
            if (owner && (entitlement?.paying ?? false) && (entitlement?.manageUrl ?? '').isNotEmpty) ...[
              const SizedBox(height: 12),
              OutlinedButton(onPressed: () => state.openLink(Uri.parse(entitlement!.manageUrl)), child: Text(t.manage)),
            ],
          ],
        ),
      ),
    );
  }
}
