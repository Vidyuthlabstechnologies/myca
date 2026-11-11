import 'dart:async';

import 'package:in_app_purchase/in_app_purchase.dart';

class StoreProduct {
  const StoreProduct({required this.id, required this.price});

  final String id;
  final String price;
}

enum StorePurchaseState { pending, purchased, failed, canceled }

class StorePurchase {
  const StorePurchase({required this.productId, required this.token, required this.state, this.needsFinish = false, this.source});

  final String productId;
  final String token;
  final StorePurchaseState state;
  final bool needsFinish;
  final Object? source;
}

abstract class StoreBilling {
  Stream<List<StorePurchase>> get purchases;
  Future<bool> available();
  Future<Map<String, StoreProduct>> products(Set<String> ids);
  Future<bool> buy(String productId, String accountId);
  Future<bool> buyOnce(String productId, String accountId);
  Future<void> restore(String accountId);
  Future<void> finish(StorePurchase purchase);
}

StorePurchaseState _stateOf(PurchaseStatus status) => switch (status) {
      PurchaseStatus.pending => StorePurchaseState.pending,
      PurchaseStatus.purchased || PurchaseStatus.restored => StorePurchaseState.purchased,
      PurchaseStatus.canceled => StorePurchaseState.canceled,
      PurchaseStatus.error => StorePurchaseState.failed,
    };

class PlayBilling implements StoreBilling {
  PlayBilling([InAppPurchase? store]) : _store = store ?? InAppPurchase.instance;

  final InAppPurchase _store;
  final Map<String, ProductDetails> _details = {};

  @override
  Stream<List<StorePurchase>> get purchases => _store.purchaseStream.map((list) => [
        for (final p in list)
          StorePurchase(productId: p.productID, token: p.verificationData.serverVerificationData, state: _stateOf(p.status), needsFinish: p.pendingCompletePurchase, source: p),
      ]);

  @override
  Future<bool> available() => _store.isAvailable();

  @override
  Future<Map<String, StoreProduct>> products(Set<String> ids) async {
    final found = await _store.queryProductDetails(ids);
    final out = <String, StoreProduct>{};
    for (final d in found.productDetails) {
      _details.putIfAbsent(d.id, () => d);
      out.putIfAbsent(d.id, () => StoreProduct(id: d.id, price: d.price));
    }
    return out;
  }

  @override
  Future<bool> buy(String productId, String accountId) async {
    final details = _details[productId];
    if (details == null) return false;
    return _store.buyNonConsumable(purchaseParam: PurchaseParam(productDetails: details, applicationUserName: accountId));
  }

  @override
  Future<bool> buyOnce(String productId, String accountId) async {
    final details = _details[productId];
    if (details == null) return false;
    return _store.buyConsumable(purchaseParam: PurchaseParam(productDetails: details, applicationUserName: accountId));
  }

  @override
  Future<void> restore(String accountId) => _store.restorePurchases(applicationUserName: accountId);

  @override
  Future<void> finish(StorePurchase purchase) async {
    final source = purchase.source;
    if (purchase.needsFinish && source is PurchaseDetails) await _store.completePurchase(source);
  }
}

class PurchaseRecorder {
  PurchaseRecorder({required this.store, required this.record, required this.onResult, this.accepts});

  final StoreBilling store;
  final bool Function(String productId)? accepts;
  final Future<void> Function(String productId, String token) record;
  final void Function(StorePurchase purchase, Object? error) onResult;
  StreamSubscription<List<StorePurchase>>? _sub;
  final Set<String> _recorded = {};

  void start() {
    _sub ??= store.purchases.listen(handle);
  }

  Future<void> handle(List<StorePurchase> list) async {
    for (final p in list) {
      if (accepts != null && !accepts!(p.productId)) continue;
      if (p.state != StorePurchaseState.purchased) {
        if (p.state != StorePurchaseState.pending) await store.finish(p);
        onResult(p, null);
        continue;
      }
      Object? error;
      if (!_recorded.contains(p.token)) {
        try {
          await record(p.productId, p.token);
          _recorded.add(p.token);
        } catch (err) {
          error = err;
        }
      }
      if (error == null) await store.finish(p);
      onResult(p, error);
    }
  }

  Future<void> stop() async {
    await _sub?.cancel();
    _sub = null;
  }
}
