import 'package:myca_design/myca_design.dart' show MycaThemeContext;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../billing/store_billing.dart';
import '../cloud/cloud_session.dart';
import '../theme.dart';
import 'us_return.dart';

class UsFilingFee {
  const UsFilingFee({
    required this.taxYear,
    required this.enforced,
    required this.paid,
    required this.priceUsd,
    this.listPriceUsd = 0,
    this.productId = '',
    this.testPurchase = false,
    this.checkout = 'play',
    this.priceLine = '',
    this.filingOpen = true,
    this.purchased = false,
  });

  factory UsFilingFee.fromJson(Map<String, dynamic> json, int taxYear) => UsFilingFee(
        taxYear: (json['taxYear'] as num?)?.toInt() ?? taxYear,
        enforced: json['enforced'] == true,
        paid: json['paid'] != false,
        priceUsd: (json['priceUsd'] as num?)?.toInt() ?? usFilingPriceUsd,
        listPriceUsd: (json['listPriceUsd'] as num?)?.toInt() ?? 0,
        productId: '${json['productId'] ?? ''}',
        testPurchase: json['testPurchase'] == true,
        checkout: '${json['checkout'] ?? 'play'}',
        priceLine: '${json['priceLine'] ?? ''}',
        filingOpen: json['filingOpen'] != false,
        purchased: json['purchased'] == true,
      );

  final int taxYear;
  final bool enforced;
  final bool paid;
  final int priceUsd;
  final int listPriceUsd;
  final String productId;
  final bool testPurchase;
  final String checkout;
  final String priceLine;
  final bool filingOpen;
  final bool purchased;

  bool get due => enforced && !paid;
  bool get launchPrice => !purchased && listPriceUsd > priceUsd;
  bool get byCard => checkout == 'card';
  String get line => priceLine.isEmpty ? usPriceLine(priceUsd) : priceLine;
}

const usFilingPriceUsd = 129;

String usPriceLine(int priceUsd) => '\$$priceUsd to file your federal return. One price, no upgrade fees.';

class UsCardCheckout {
  const UsCardCheckout({required this.url, required this.sessionId});

  final String url;
  final String sessionId;
}

abstract class UsFilingFees {
  String get accountId;
  Future<UsFilingFee> status(int taxYear);
  Future<UsFilingFee> record(int taxYear, String productId, String purchaseToken);
  Future<UsCardCheckout> startCard(int taxYear);
  Future<UsFilingFee> confirmCard(int taxYear, String sessionId);
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

  @override
  Future<UsCardCheckout> startCard(int taxYear) async {
    final out = await cloud.startUsCheckout('return', taxYear: taxYear);
    return UsCardCheckout(url: '${out['url'] ?? ''}', sessionId: '${out['sessionId'] ?? ''}');
  }

  @override
  Future<UsFilingFee> confirmCard(int taxYear, String sessionId) async => UsFilingFee.fromJson(await cloud.confirmUsCheckout(sessionId), taxYear);
}

class NoFilingFees implements UsFilingFees {
  const NoFilingFees();

  @override
  String get accountId => '';

  @override
  Future<UsFilingFee> status(int taxYear) async => UsFilingFee(taxYear: taxYear, enforced: false, paid: true, priceUsd: usFilingPriceUsd);

  @override
  Future<UsFilingFee> record(int taxYear, String productId, String purchaseToken) => status(taxYear);

  @override
  Future<UsCardCheckout> startCard(int taxYear) async => throw const MycaApiException('Card payments are not set up on this server.');

  @override
  Future<UsFilingFee> confirmCard(int taxYear, String sessionId) => status(taxYear);
}

String usFeeSpoken(UsFilingFee fee) => fee.launchPrice
    ? 'Filing fee for your ${fee.taxYear} return: \$${fee.priceUsd} launch price, list price \$${fee.listPriceUsd}, paid once. Preparing and checking your return are free.'
    : 'Filing fee for your ${fee.taxYear} return: \$${fee.priceUsd}, paid once. Preparing and checking your return are free.';

String usFilingFeeLine(UsFilingFee fee) => fee.launchPrice
    ? 'Filing your ${fee.taxYear} return with the IRS is \$${fee.priceUsd}, paid once. That is our launch price for this season; it is usually \$${fee.listPriceUsd}. One price for your federal return, with no upgrade fees. Preparing and checking it stay free.'
    : 'Filing your ${fee.taxYear} return with the IRS is \$${fee.priceUsd}, paid once. One price for your federal return, with no upgrade fees. Preparing and checking it stay free.';

const usFilingNotOpenLine = 'E-filing is not open in MyCA yet. Your return is saved and nothing has been charged. You can still review it and download it as a PDF.';

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
  String _sessionId = '';

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
    if (widget.fee.byCard) return;
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

  Future<void> _payByCard() async {
    final state = AppScope.of(context);
    setState(() {
      _buying = true;
      _note = '';
    });
    try {
      final checkout = await widget.fees.startCard(widget.fee.taxYear);
      final opened = checkout.url.isNotEmpty && await state.openLink(Uri.parse(checkout.url));
      if (!mounted) return;
      setState(() {
        _buying = false;
        _sessionId = checkout.sessionId;
        _note = opened ? '' : 'The card payment page could not be opened. Try again.';
      });
    } on MycaApiException catch (err) {
      if (mounted) {
        setState(() {
          _buying = false;
          _note = err.message;
        });
      }
    }
  }

  Future<void> _checkCard() async {
    setState(() {
      _buying = true;
      _note = '';
    });
    try {
      final fee = await widget.fees.confirmCard(widget.fee.taxYear, _sessionId);
      if (!mounted) return;
      setState(() => _buying = false);
      if (fee.paid) widget.onPaid(fee);
    } on MycaApiException catch (err) {
      if (mounted) {
        setState(() {
          _buying = false;
          _note = err.message;
        });
      }
    }
  }

  List<Widget> _cardButtons(TextTheme text) => [
        FilledButton(
          key: const Key('usFee.payCard'),
          onPressed: _buying ? null : _payByCard,
          child: Text(_buying && _sessionId.isEmpty ? 'Opening the payment page…' : 'Pay \$${widget.fee.priceUsd} by card'),
        ),
        if (_sessionId.isNotEmpty) ...[
          const SizedBox(height: 8),
          OutlinedButton(key: const Key('usFee.paidCard'), onPressed: _buying ? null : _checkCard, child: const Text("I've paid, continue")),
        ],
        const SizedBox(height: 8),
        Text('Card payment by Stripe for the US company. MyCA never sees your card number.', style: text.bodySmall?.copyWith(color: Palette.muted)),
      ];

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final price = _product?.price ?? '\$${widget.fee.priceUsd}';
    final storeDiffers = _product != null && num.tryParse(price.replaceAll(RegExp(r'[^0-9.]'), '')) != widget.fee.priceUsd;
    return Container(
      key: const Key('usFee.card'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: context.myca.accentSoft, borderRadius: BorderRadius.circular(radiusCard)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('One step before filing', style: text.titleMedium),
          const SizedBox(height: 6),
          Text(usFilingFeeLine(widget.fee), key: const Key('usFee.line'), semanticsLabel: usFeeSpoken(widget.fee), style: text.bodyMedium),
          if (!widget.fee.byCard && _ready && storeDiffers) ...[
            const SizedBox(height: 8),
            Text('Google Play charges $price here, and that is the price you pay.', key: const Key('usFee.storePrice'), style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
          ],
          const SizedBox(height: 14),
          if (widget.fee.byCard)
            ..._cardButtons(text)
          else if (_ready)
            FilledButton(key: const Key('usFee.pay'), onPressed: _buying ? null : _buy, child: Text(_buying ? 'Opening Google Play…' : 'Pay $price and continue'))
          else
            Text(
              defaultTargetPlatform == TargetPlatform.android
                  ? 'Google Play is not ready on this phone. Check that you are signed in to the Play Store, then open this screen again.'
                  : 'The filing fee cannot be paid in this app on this device yet. Your return is saved; nothing has been charged.',
              key: const Key('usFee.unavailable'),
              style: text.bodySmall?.copyWith(color: Palette.muted),
            ),
          if (_note.isNotEmpty) ...[const SizedBox(height: 10), Text(_note, key: const Key('usFee.note'), style: text.bodySmall?.copyWith(color: Palette.danger))],
        ],
      ),
    );
  }
}

class UsUnsupportedNotice extends StatelessWidget {
  const UsUnsupportedNotice({super.key, required this.forms});

  final List<UsUnsupportedForm> forms;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      key: const Key('usUnsupported.notice'),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Palette.warnSoft, borderRadius: BorderRadius.circular(radiusCard)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("MyCA can't file this return yet", style: text.titleMedium),
          const SizedBox(height: 6),
          Text(unsupportedFormsLine(forms), style: text.bodyMedium),
          for (final f in forms)
            if (f.reason.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text('${f.form}: ${f.reason}', style: text.bodySmall)),
          const SizedBox(height: 6),
          Text('You can still prepare, check and download it for free.', style: text.bodySmall?.copyWith(color: Palette.muted)),
        ],
      ),
    );
  }
}
