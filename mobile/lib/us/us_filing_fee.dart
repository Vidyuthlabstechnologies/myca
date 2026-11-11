import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../billing/store_billing.dart';
import '../cloud/cloud_session.dart';
import '../theme.dart';

class UsFilingFee {
  const UsFilingFee({required this.taxYear, required this.enforced, required this.paid, required this.priceUsd, this.productId = '', this.testPurchase = false});

  factory UsFilingFee.fromJson(Map<String, dynamic> json, int taxYear) => UsFilingFee(
        taxYear: (json['taxYear'] as num?)?.toInt() ?? taxYear,
        enforced: json['enforced'] == true,
        paid: json['paid'] != false,
        priceUsd: (json['priceUsd'] as num?)?.toInt() ?? usFilingPriceUsd,
        productId: '${json['productId'] ?? ''}',
        testPurchase: json['testPurchase'] == true,
      );

  final int taxYear;
  final bool enforced;
  final bool paid;
  final int priceUsd;
  final String productId;
  final bool testPurchase;

  bool get due => enforced && !paid;
}

const usFilingPriceUsd = 39;

abstract class UsFilingFees {
  String get accountId;
  Future<UsFilingFee> status(int taxYear);
  Future<UsFilingFee> record(int taxYear, String productId, String purchaseToken);
}

class CloudFilingFees implements UsFilingFees {
  CloudFilingFees(this.cloud);

  final CloudSession cloud;

  @override
  String get accountId => cloud.businessId ?? '';

  @override
  Future<UsFilingFee> status(int taxYear) async => UsFilingFee.fromJson(await cloud.usReturnFee(taxYear), taxYear);

  @override
  Future<UsFilingFee> record(int taxYear, String productId, String purchaseToken) async =>
      UsFilingFee.fromJson(await cloud.recordUsReturnPayment(taxYear, productId, purchaseToken), taxYear);
}

class NoFilingFees implements UsFilingFees {
  const NoFilingFees();

  @override
  String get accountId => '';

  @override
  Future<UsFilingFee> status(int taxYear) async => UsFilingFee(taxYear: taxYear, enforced: false, paid: true, priceUsd: usFilingPriceUsd);

  @override
  Future<UsFilingFee> record(int taxYear, String productId, String purchaseToken) => status(taxYear);
}

String usFilingFeeLine(UsFilingFee fee) => 'Filing your ${fee.taxYear} return with the IRS is \$${fee.priceUsd}, paid once. Preparing, reviewing and downloading it stay free.';

class UsFilingFeeCard extends StatefulWidget {
  const UsFilingFeeCard({super.key, required this.fee, required this.fees, required this.store, required this.onPaid});

  final UsFilingFee fee;
  final UsFilingFees fees;
  final StoreBilling? store;
  final ValueChanged<UsFilingFee> onPaid;

  @override
  State<UsFilingFeeCard> createState() => _UsFilingFeeCardState();
}

class _UsFilingFeeCardState extends State<UsFilingFeeCard> {
  PurchaseRecorder? _recorder;
  StoreProduct? _product;
  bool _ready = false;
  bool _buying = false;
  String _note = '';

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void dispose() {
    _recorder?.stop();
    super.dispose();
  }

  Future<void> _start() async {
    final store = widget.store;
    final id = widget.fee.productId;
    if (store == null || id.isEmpty || widget.fees.accountId.isEmpty) return;
    try {
      if (!await store.available()) return;
      final products = await store.products({id});
      _recorder = PurchaseRecorder(
        store: store,
        accepts: (productId) => productId == id,
        record: (productId, token) async {
          final fee = await widget.fees.record(widget.fee.taxYear, productId, token);
          if (fee.paid) widget.onPaid(fee);
        },
        onResult: _onResult,
      )..start();
      if (mounted) {
        setState(() {
          _product = products[id];
          _ready = products.containsKey(id);
        });
      }
    } catch (_) {
      if (mounted) setState(() => _ready = false);
    }
  }

  void _onResult(StorePurchase purchase, Object? error) {
    if (!mounted) return;
    setState(() {
      if (purchase.state != StorePurchaseState.pending) _buying = false;
      _note = switch (purchase.state) {
        StorePurchaseState.pending => 'Google Play is processing the payment. Filing unlocks as soon as it clears.',
        StorePurchaseState.canceled => '',
        StorePurchaseState.failed => 'Google Play did not complete the payment. Nothing was charged.',
        StorePurchaseState.purchased => error == null ? '' : error is MycaApiException ? error.message : 'The payment went through but MyCA could not confirm it yet. Open this screen again in a minute.',
      };
    });
  }

  Future<void> _buy() async {
    final store = widget.store;
    if (store == null) return;
    setState(() {
      _buying = true;
      _note = '';
    });
    final started = await store.buyOnce(widget.fee.productId, widget.fees.accountId).catchError((_) => false);
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
    final price = _product?.price ?? '\$${widget.fee.priceUsd}';
    return Container(
      key: const Key('usFee.card'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Palette.accentSoft, borderRadius: BorderRadius.circular(radiusCard)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('One step before filing', style: text.titleMedium),
          const SizedBox(height: 6),
          Text(usFilingFeeLine(widget.fee), style: text.bodyMedium),
          const SizedBox(height: 14),
          if (_ready)
            FilledButton(key: const Key('usFee.pay'), onPressed: _buying ? null : _buy, child: Text(_buying ? 'Opening Google Play…' : 'Pay $price and continue'))
          else
            Text('Pay the filing fee in the MyCA app for Android, then come back here to file.', style: text.bodySmall?.copyWith(color: Palette.muted)),
          if (_note.isNotEmpty) ...[const SizedBox(height: 10), Text(_note, key: const Key('usFee.note'), style: text.bodySmall?.copyWith(color: Palette.danger))],
        ],
      ),
    );
  }
}
