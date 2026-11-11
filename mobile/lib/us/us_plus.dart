import '../api/myca_api.dart';
import '../cloud/cloud_session.dart';

Map<String, dynamic> _map(Object? value) => value is Map ? value.cast<String, dynamic>() : const <String, dynamic>{};

int _int(Object? value, int fallback) => value is num ? value.toInt() : int.tryParse('${value ?? ''}') ?? fallback;

const usPlusPriceUsd = 79;
const usExpertReviewPriceUsd = 129;

class UsPlusStatus {
  const UsPlusStatus({required this.enforced, required this.active, required this.subscribed, required this.renews, required this.until, required this.priceUsd, required this.buyable, this.checkout = 'card', this.productId = '', this.manageUrl = ''});

  factory UsPlusStatus.fromJson(Map<String, dynamic> json) => UsPlusStatus(
        enforced: json['enforced'] == true,
        active: json['active'] == true,
        subscribed: json['subscribed'] == true,
        renews: json['renews'] == true,
        until: '${json['until'] ?? ''}',
        priceUsd: _int(json['priceUsd'], usPlusPriceUsd),
        buyable: json['buyable'] == true,
        checkout: '${json['checkout'] ?? 'card'}',
        productId: '${json['productId'] ?? ''}',
        manageUrl: '${json['manageUrl'] ?? ''}',
      );

  final bool enforced;
  final bool active;
  final bool subscribed;
  final bool renews;
  final String until;
  final int priceUsd;
  final bool buyable;
  final String checkout;
  final String productId;
  final String manageUrl;

  bool get onPlay => checkout == 'play';
}

class UsOffers {
  const UsOffers({this.expertReview = false, this.expertReviewPriceUsd = usExpertReviewPriceUsd, this.waitlist = const []});

  factory UsOffers.fromJson(Map<String, dynamic> json) {
    final review = _map(json['usExpertReview']);
    final list = json['usWaitlist'];
    return UsOffers(
      expertReview: review['available'] == true,
      expertReviewPriceUsd: _int(review['priceUsd'], usExpertReviewPriceUsd),
      waitlist: [
        if (list is List)
          for (final item in list)
            if (item is Map) ('${item['id'] ?? ''}', '${item['title'] ?? ''}'),
      ],
    );
  }

  final bool expertReview;
  final int expertReviewPriceUsd;
  final List<(String, String)> waitlist;
}

const defaultWaitlist = [('done_for_you', 'Done For You'), ('international', 'International add-on')];

abstract class UsPlusService {
  String get accountId;
  Future<UsPlusStatus> status();
  Future<UsPlusStatus> recordPlay(String productId, String purchaseToken);
  Future<UsOffers> offers();
  Future<(String, String)> startCheckout();
  Future<UsPlusStatus> confirm(String sessionId);
  Future<UsPlusStatus> cancel();
  Future<void> joinWaitlist(String product);
}

class CloudUsPlus implements UsPlusService {
  CloudUsPlus(this.cloud);

  final CloudSession cloud;

  @override
  String get accountId => cloud.businessId ?? '';

  @override
  Future<UsPlusStatus> status() async => UsPlusStatus.fromJson(await cloud.usPlus());

  @override
  Future<UsPlusStatus> recordPlay(String productId, String purchaseToken) async => UsPlusStatus.fromJson(await cloud.recordUsPlusPurchase(productId, purchaseToken));

  @override
  Future<UsOffers> offers() async => UsOffers.fromJson(await cloud.usOffers());

  @override
  Future<(String, String)> startCheckout() async {
    final out = await cloud.startUsCheckout('plus');
    return ('${out['url'] ?? ''}', '${out['sessionId'] ?? ''}');
  }

  @override
  Future<UsPlusStatus> confirm(String sessionId) async => UsPlusStatus.fromJson(await cloud.confirmUsCheckout(sessionId));

  @override
  Future<UsPlusStatus> cancel() async => UsPlusStatus.fromJson(await cloud.cancelUsPlus());

  @override
  Future<void> joinWaitlist(String product) async => cloud.joinUsWaitlist(product);
}

class NoUsPlus implements UsPlusService {
  const NoUsPlus();

  static const _open = UsPlusStatus(enforced: false, active: true, subscribed: false, renews: false, until: '', priceUsd: usPlusPriceUsd, buyable: false);

  @override
  String get accountId => '';

  @override
  Future<UsPlusStatus> status() async => _open;

  @override
  Future<UsPlusStatus> recordPlay(String productId, String purchaseToken) async => _open;

  @override
  Future<UsOffers> offers() async => const UsOffers(waitlist: defaultWaitlist);

  @override
  Future<(String, String)> startCheckout() async => throw const MycaApiException('MyCA Plus is not set up on this server.');

  @override
  Future<UsPlusStatus> confirm(String sessionId) async => _open;

  @override
  Future<UsPlusStatus> cancel() async => _open;

  @override
  Future<void> joinWaitlist(String product) async {}
}

class UsQuarter {
  const UsQuarter(this.due, this.amount);

  final String due;
  final num amount;
}

String isoDay(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
