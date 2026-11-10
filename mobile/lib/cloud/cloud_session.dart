import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../api/models.dart';
import '../api/myca_api.dart';
import 'token_store.dart';

const _messages = {
  'SHARED_VIEW_READ_ONLY': 'The owner shares these books with you as of an earlier date, so nothing can be posted from here. Ask the owner to make the change, or to share the books again.',
  'CA_SEES_LIVE_BOOKS': 'Your accountant already sees the books as they change.',
  'NOT_SHARED_YET': 'The owner has not shared the books with you yet.',
  'PHONE_SIGN_IN_UNAVAILABLE': 'Sign-in by mobile number is not available yet. Continue with Google.',
  'GOOGLE_SIGN_IN_UNAVAILABLE': 'Google sign-in is not available yet.',
  'INVALID_GOOGLE_TOKEN': 'Google could not confirm who you are. Try again.',
  'WRONG_AUDIENCE': 'This copy of the app is not set up for Google sign-in.',
  'GOOGLE_TOKEN_EXPIRED': 'That Google sign-in took too long. Try again.',
  'GOOGLE_UNREACHABLE': 'MyCA could not reach Google. Try again in a minute.',
  'OIDC_SIGN_IN_UNAVAILABLE': 'Sign-in with your firm\'s account is not available yet.',
  'INVALID_OIDC_TOKEN': 'Your firm\'s sign-in could not confirm who you are. Try again.',
  'OIDC_TOKEN_EXPIRED': 'That sign-in took too long. Try again.',
  'OIDC_UNREACHABLE': 'MyCA could not reach your firm\'s sign-in. Try again in a minute.',
  'CONSENT_REQUIRED': 'Read and accept the privacy notice to continue.',
  'NOTICE_CHANGED': 'The privacy notice has changed. Read the new one and accept it.',
  'INVALID_PHONE': 'Enter a 10-digit Indian mobile number.',
  'TOO_MANY_REQUESTS': 'Too many codes requested. Try again in an hour.',
  'INVALID_CODE': 'That code is not right. Check it and try again.',
  'CODE_EXPIRED': 'That code has expired. Ask for a new one.',
  'CODE_USED': 'That code was already used. Ask for a new one.',
  'TOO_MANY_ATTEMPTS': 'Too many wrong tries. Ask for a new code.',
  'ALREADY_ENABLED': 'Two-step sign-in is already on.',
  'NOT_ENABLED': 'Two-step sign-in is off.',
  'NOT_ENROLLING': 'Start the two-step setup again.',
  'ENROLMENT_RESTART': 'Too many wrong codes. Start the setup again.',
  'DEVICE_NOT_FOUND': 'That device is already signed out.',
  'CURRENT_DEVICE': 'Use Sign out to leave this phone.',
  'COMPANY_NAME_REQUIRED': 'Enter your business name.',
  'INVALID_GSTIN':
      'That GSTIN is not valid. Check it against your registration certificate.',
  'STATE_REQUIRED': 'Choose the state your business is in.',
  'INVALID_STATE_CODE': 'Choose the state your business is in.',
  'OWNER_ONLY': 'Only the owner can change this.',
  'INVALID_ROLE': 'Choose staff or accountant.',
  'ALREADY_A_MEMBER': 'That person is already in this business.',
  'TOO_MANY_INVITATIONS': 'There are too many open invitations. Cancel one first.',
  'INVITATION_NOT_FOUND': 'That invitation is no longer open.',
  'INVITATION_EXPIRED': 'That invitation has expired. Ask to be invited again.',
  'MEMBER_NOT_FOUND': 'That person is no longer in this business.',
  'LAST_OWNER': 'A business must keep at least one owner.',
  'NAME_REQUIRED': 'Enter your name.',
  'BUSINESS_NOT_FOUND': 'This business is no longer available to you.',
  'IMPORT_NEEDS_UPLOAD': 'That file has to be uploaded before it can be imported.',
  'BODY_TOO_LARGE': 'That file is larger than 8 MB. Export a shorter period and try again.',
  'EMPTY_FILE': 'That file is empty.',
  'PLAN_REQUIRED': 'Your plan does not include this. The owner can upgrade under Plan and billing.',
  'PLAN_LIMIT_REACHED': 'This business has reached its plan limit. The owner can upgrade under Plan and billing.',
  'PURCHASE_BELONGS_TO_ANOTHER_BUSINESS': 'This Google Play subscription already pays for another business. Each business needs its own plan.',
  'PURCHASE_NOT_FOUND': 'Google Play does not show this purchase yet. Try again in a minute.',
  'PURCHASE_PRODUCT_MISMATCH': 'This purchase is for a different plan. Open Plan and billing again.',
  'PROVIDER_UNAVAILABLE': 'Google Play could not be reached. Your purchase is safe; open Plan and billing again in a minute.',
  'BILLING_NOT_CONFIGURED': 'Plans cannot be bought yet. Try again later.',
  'GST_PORTAL_UNAVAILABLE': 'Filing on the GST portal is not set up on this server yet.',
  'GST_PORTAL_OFF': 'Filing on the GST portal is switched off on this server.',
  'GSP_KEYS_MISSING': 'The GST portal keys are not set on this server yet.',
  'GST_PORTAL_NOT_CONNECTED': 'Connect the GST portal for this GSTIN first.',
  'GST_PORTAL_SESSION_ENDED': 'The GST portal session ended. Ask for a new OTP to reconnect.',
  'NOT_FOR_STAFF': 'Only the owner or the accountant can do this.',
  'NIC_NOT_CONNECTED': 'Add this business\'s e-invoice keys under Connections to banks and apps first.',
  'SERVER_BUSY': 'MyCA is busy for a moment. Try again in a minute.',
  'INTERNAL_ERROR': 'Something went wrong on our side. Try again in a minute.',
};

String cloudMessage(String code, [String hint = '']) =>
    _messages[code] ?? (hint.trim().isNotEmpty ? hint.trim() : 'Something went wrong ($code).');

const _secondStepOver = 'This sign-in attempt is over. Tap Start over and sign in again.';

const _secondStepMessages = {
  'CODE_EXPIRED': _secondStepOver,
  'TOO_MANY_ATTEMPTS': _secondStepOver,
  'CODE_USED': 'That code was already used. Wait for the next one on your authenticator and try again.',
};

const _changeLocked = 'Too many wrong codes. Wait 15 minutes, or sign in again with your authenticator code, then try again.';

String _triesLeft(int left) => 'That code is not right. $left ${left == 1 ? 'try' : 'tries'} left.';

bool _lastTry(String code, int? left) => left != null && left <= 0 && (code == 'INVALID_CODE' || code == 'CODE_USED');

String secondStepMessage(String code, Object? attemptsRemaining) {
  final left = attemptsRemaining is num ? attemptsRemaining.toInt() : null;
  if (_lastTry(code, left)) return _secondStepOver;
  if (code == 'CODE_USED' && left == null) return _secondStepOver;
  if (code == 'INVALID_CODE' && left != null) return _triesLeft(left);
  return _secondStepMessages[code] ?? cloudMessage(code);
}

String? _changeCodeMessage(String code, Object? attemptsRemaining) {
  final left = attemptsRemaining is num ? attemptsRemaining.toInt() : null;
  if (code == 'TOO_MANY_ATTEMPTS' || _lastTry(code, left)) return _changeLocked;
  if (code == 'INVALID_CODE' && left != null) return _triesLeft(left);
  return code == 'CODE_USED' ? _secondStepMessages[code] : null;
}

String? _restoreMessage(String code, Object? attemptsRemaining) =>
    code == 'BODY_TOO_LARGE' ? 'That file is too large to restore from the app. Your books were not changed.' : null;

String? _setupCodeMessage(String code, Object? attemptsRemaining) {
  final left = attemptsRemaining is num ? attemptsRemaining.toInt() : null;
  return code == 'INVALID_CODE' && left != null && left > 0 ? _triesLeft(left) : null;
}

class SecondStepResult {
  const SecondStepResult({required this.usedRecoveryCode, required this.recoveryCodesLeft});

  final bool usedRecoveryCode;
  final int? recoveryCodesLeft;

  String get recoveryNote {
    if (!usedRecoveryCode) return '';
    final left = recoveryCodesLeft;
    return left == null
        ? 'You used a recovery code. Make new ones in Security.'
        : 'You used a recovery code. $left left. Make new ones in Security.';
  }
}

const connectorOrder = ['nic', 'quicko', 'plaid', 'taxjar', 'gusto', 'track1099', 'amazon', 'shopify', 'razorpay', 'zoho'];

class ConnectorView {
  const ConnectorView({
    required this.channel,
    required this.title,
    required this.country,
    required this.configured,
    required this.enabled,
    required this.lastFetchedTo,
    required this.kinds,
    required this.fields,
    required this.secrets,
    required this.optional,
    required this.values,
  });

  factory ConnectorView.fromJson(Map<String, dynamic> map) {
    final fields = _strings(map['fields']);
    return ConnectorView(
      channel: '${map['channel'] ?? ''}',
      title: '${map['title'] ?? ''}',
      country: '${map['country'] ?? 'IN'}'.toUpperCase(),
      configured: map['configured'] == true,
      enabled: map['enabled'] != false,
      lastFetchedTo: '${map['lastFetchedTo'] ?? ''}',
      kinds: _strings(map['kinds']),
      fields: fields,
      secrets: _strings(map['secrets']),
      optional: _strings(map['optional']),
      values: {for (final field in fields) field: '${map[field] ?? ''}'},
    );
  }

  final String channel;
  final String title;
  final String country;
  final bool configured;
  final bool enabled;
  final String lastFetchedTo;
  final List<String> kinds;
  final List<String> fields;
  final List<String> secrets;
  final List<String> optional;
  final Map<String, String> values;

  bool isSecret(String field) => secrets.contains(field);
  bool isSet(String field) => isSecret(field) ? values[field] == 'set' : (values[field] ?? '').isNotEmpty;
}

class ConnectorList {
  const ConnectorList({required this.pulls, required this.connectors});

  final bool pulls;
  final List<ConnectorView> connectors;

  List<ConnectorView> forCountry(String country) {
    final mine = connectors.where((c) => c.country == country).toList()
      ..sort((a, b) => connectorOrder.indexOf(a.channel).compareTo(connectorOrder.indexOf(b.channel)));
    return mine;
  }
}

class PlanOffer {
  const PlanOffer({required this.id, required this.title, required this.monthlyRupees, this.yearlyRupees = 0, required this.buyable, required this.features, required this.invoicesPerMonth, required this.members, this.productId = ''});

  factory PlanOffer.fromJson(Map<String, dynamic> map) {
    final limits = map['limits'] is Map ? (map['limits'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
    return PlanOffer(
      id: '${map['id'] ?? ''}',
      title: '${map['title'] ?? ''}',
      monthlyRupees: map['monthlyRupees'] is num ? (map['monthlyRupees'] as num).toInt() : 0,
      yearlyRupees: map['yearlyRupees'] is num ? (map['yearlyRupees'] as num).toInt() : 0,
      buyable: map['buyable'] == true,
      features: _strings(map['features']),
      invoicesPerMonth: limits['invoicesPerMonth'] is num ? (limits['invoicesPerMonth'] as num).toInt() : null,
      members: limits['members'] is num ? (limits['members'] as num).toInt() : null,
      productId: '${map['productId'] ?? ''}',
    );
  }

  final String id;
  final String title;
  final int monthlyRupees;
  final int yearlyRupees;
  final bool buyable;
  final List<String> features;
  final int? invoicesPerMonth;
  final int? members;
  final String productId;
}

class Entitlement {
  const Entitlement({required this.plan, required this.planTitle, required this.enforced, required this.trialDaysLeft, required this.status, required this.currentEnd, this.subscriptionPlan = '', this.renews = false, this.testPurchase = false, this.manageUrl = ''});

  factory Entitlement.fromJson(Map<String, dynamic> map) {
    final trial = map['trial'] is Map ? (map['trial'] as Map).cast<String, dynamic>() : null;
    final sub = map['subscription'] is Map ? (map['subscription'] as Map).cast<String, dynamic>() : null;
    return Entitlement(
      plan: '${map['plan'] ?? 'lapsed'}',
      planTitle: '${map['planTitle'] ?? ''}',
      enforced: map['enforced'] == true,
      trialDaysLeft: trial == null ? null : (trial['daysLeft'] is num ? (trial['daysLeft'] as num).toInt() : 0),
      status: '${sub?['status'] ?? ''}',
      currentEnd: '${sub?['currentEnd'] ?? ''}',
      subscriptionPlan: '${sub?['plan'] ?? ''}',
      renews: sub?['renews'] == true,
      testPurchase: sub?['testPurchase'] == true,
      manageUrl: '${map['manageUrl'] ?? ''}',
    );
  }

  final String plan;
  final String planTitle;
  final bool enforced;
  final int? trialDaysLeft;
  final String status;
  final String currentEnd;
  final String subscriptionPlan;
  final bool renews;
  final bool testPurchase;
  final String manageUrl;

  bool get paying => const {'active', 'in_grace_period', 'canceled'}.contains(status) && subscriptionPlan == plan && plan != 'lapsed';
}

class PlaidLinkToken {
  const PlaidLinkToken({required this.linkToken, required this.environment, required this.mock});

  final String linkToken;
  final String environment;
  final bool mock;
}

class EinvoiceOutcome {
  const EinvoiceOutcome({required this.ok, required this.error, required this.hint, required this.irn, required this.mode, required this.sandbox});

  factory EinvoiceOutcome.fromJson(Map<String, dynamic> map) => EinvoiceOutcome(
        ok: map['ok'] == true,
        error: '${map['error'] ?? ''}',
        hint: '${map['hint'] ?? ''}',
        irn: '${map['irn'] ?? ''}',
        mode: '${map['mode'] ?? ''}',
        sandbox: map['sandbox'] == true,
      );

  final bool ok;
  final String error;
  final String hint;
  final String irn;
  final String mode;
  final bool sandbox;
}

class PlaidItem {
  const PlaidItem({required this.itemId, required this.linkedOn});

  final String itemId;
  final String linkedOn;
}

class GustoConnect {
  const GustoConnect({required this.url, required this.redirectUri});

  final String url;
  final String redirectUri;
}

class TaxRate {
  const TaxRate({required this.code, required this.name, required this.ratePercent, required this.parts, required this.recorded});

  final String code;
  final String name;
  final num ratePercent;
  final Map<String, num> parts;
  final bool recorded;

  String get line {
    num part(String key) => parts[key] ?? 0;
    return '$name: $ratePercent% combined (state ${part('state')}%, county ${part('county')}%, city ${part('city')}%, special ${part('special')}%)${recorded ? ', recorded as $code' : ''}.';
  }
}

class GstPortalSession {
  const GstPortalSession({required this.gstin, required this.username, required this.connected, required this.expiresAt, required this.waitingForOtp, required this.needsReconnect, required this.lastError});

  factory GstPortalSession.fromJson(Map<String, dynamic> json) => GstPortalSession(
        gstin: '${json['gstin'] ?? ''}',
        username: '${json['username'] ?? ''}',
        connected: json['connected'] == true,
        expiresAt: DateTime.tryParse('${json['expiresAt'] ?? ''}'),
        waitingForOtp: json['waitingForOtp'] == true,
        needsReconnect: json['needsReconnect'] == true,
        lastError: '${json['lastError'] ?? ''}',
      );

  final String gstin;
  final String username;
  final bool connected;
  final DateTime? expiresAt;
  final bool waitingForOtp;
  final bool needsReconnect;
  final String lastError;
}

class GstPortalStatus {
  const GstPortalStatus({required this.available, required this.reason, required this.mode, required this.simulated, required this.sessions});

  factory GstPortalStatus.fromJson(Map<String, dynamic> json) => GstPortalStatus(
        available: json['available'] == true,
        reason: '${json['reason'] ?? ''}',
        mode: '${json['mode'] ?? ''}',
        simulated: json['simulated'] == true,
        sessions: [for (final row in _rows(json['sessions'])) GstPortalSession.fromJson(row)],
      );

  final bool available;
  final String reason;
  final String mode;
  final bool simulated;
  final List<GstPortalSession> sessions;

  GstPortalSession? sessionFor(String gstin) {
    for (final session in sessions) {
      if (gstin.isEmpty || session.gstin == gstin) return session;
    }
    return null;
  }
}

class SyncResult {
  const SyncResult({required this.channel, required this.kind, required this.ok, required this.rows, required this.error, required this.empty, required this.dryRun});

  final String channel;
  final String kind;
  final bool ok;
  final int rows;
  final String error;
  final bool empty;
  final bool dryRun;

  String get line {
    if (!ok) return '$kind: ${error.isEmpty ? 'failed' : error}';
    if (dryRun) return '$kind: dry run, pulls are off on the service';
    if (empty) return '$kind: nothing new';
    return '$kind: $rows ${rows == 1 ? 'row' : 'rows'} pulled; see the reminder in MyCA';
  }
}

class ConnectorSync {
  const ConnectorSync({required this.fetched, required this.results});

  final String fetched;
  final List<SyncResult> results;

  List<SyncResult> forChannel(String channel) => results.where((r) => r.channel == channel).toList();
}

List<String> _strings(Object? value) => [
      if (value is List)
        for (final item in value) '$item',
    ];

class BusinessRef {
  const BusinessRef({required this.id, required this.name, required this.role});

  final String id;
  final String name;
  final String role;
}

class InvitationRef {
  const InvitationRef({required this.id, required this.businessName, required this.role, required this.invitedBy});

  final String id;
  final String businessName;
  final String role;
  final String invitedBy;
}

class InboundKey {
  const InboundKey({required this.id, required this.label, required this.source, required this.enabled, this.todayCount = 0, this.todayTotal = 0, this.secret = '', this.email = ''});

  final String id;
  final String label;
  final String source;
  final bool enabled;
  final int todayCount;
  final num todayTotal;
  final String secret;
  final String email;
}

class MemberRef {
  const MemberRef({required this.id, required this.name, required this.role});

  final String id;
  final String name;
  final String role;
}

class OpenInvite {
  const OpenInvite({required this.id, required this.phoneHint, required this.role});

  final String id;
  final String phoneHint;
  final String role;
}

class People {
  const People({required this.members, required this.invites});

  final List<MemberRef> members;
  final List<OpenInvite> invites;
}

class Me {
  const Me({required this.id, required this.name, required this.businesses, required this.invitations});

  final String id;
  final String name;
  final List<BusinessRef> businesses;
  final List<InvitationRef> invitations;
}

List<Map<String, dynamic>> _rows(Object? value) => [
      if (value is List)
        for (final row in value)
          if (row is Map) row.cast<String, dynamic>(),
    ];

class NoticeSection {
  const NoticeSection({required this.heading, required this.body});

  final String heading;
  final String body;
}

class PrivacyNotice {
  const PrivacyNotice({
    required this.document,
    required this.version,
    required this.title,
    required this.status,
    required this.sections,
  });

  factory PrivacyNotice.fromJson(Object? json) {
    final map = json is Map ? json : const {};
    return PrivacyNotice(
      document: '${map['document'] ?? ''}',
      version: '${map['version'] ?? ''}',
      title: '${map['title'] ?? ''}',
      status: '${map['status'] ?? ''}',
      sections: [
        for (final row in _rows(map['sections']))
          NoticeSection(heading: '${row['heading'] ?? ''}', body: '${row['body'] ?? ''}'),
      ],
    );
  }

  final String document;
  final String version;
  final String title;
  final String status;
  final List<NoticeSection> sections;
}

class SignInMethods {
  const SignInMethods({required this.phone, required this.google, this.oidc = false, this.oidcIssuer = ''});

  final bool phone;
  final bool google;
  final bool oidc;
  final String oidcIssuer;

  String get oidcIssuerHost => Uri.tryParse(oidcIssuer)?.host ?? '';
}

class SecondStepStatus {
  const SecondStepStatus({required this.enabled, required this.enabledAt, required this.recoveryCodesLeft});

  factory SecondStepStatus.fromJson(Map<String, dynamic> map) => SecondStepStatus(
        enabled: map['enabled'] == true,
        enabledAt: '${map['enabledAt'] ?? ''}',
        recoveryCodesLeft: (map['recoveryCodesLeft'] as num?)?.toInt() ?? 0,
      );

  final bool enabled;
  final String enabledAt;
  final int recoveryCodesLeft;
}

class SecondStepSetup {
  const SecondStepSetup({required this.secret, required this.uri, required this.account});

  final String secret;
  final String uri;
  final String account;

  String get groupedSecret => [
        for (var i = 0; i < secret.length; i += 4) secret.substring(i, i + 4 > secret.length ? secret.length : i + 4),
      ].join(' ');
}

class SignedInDevice {
  const SignedInDevice({required this.id, required this.label, required this.signedInOn, required this.lastActive, required this.current});

  factory SignedInDevice.fromJson(Map<String, dynamic> map) => SignedInDevice(
        id: '${map['id'] ?? ''}',
        label: '${map['label'] ?? ''}',
        signedInOn: '${map['signedInOn'] ?? ''}',
        lastActive: '${map['lastActive'] ?? ''}',
        current: map['current'] == true,
      );

  final String id;
  final String label;
  final String signedInOn;
  final String lastActive;
  final bool current;
}

String get deviceLabel => defaultTargetPlatform == TargetPlatform.iOS ? 'iPhone' : 'Android';

class CaSync {
  const CaSync({required this.mode, required this.sharedAsOf});

  final String mode;
  final String sharedAsOf;
}

class StateRef {
  const StateRef({required this.code, required this.name});

  final String code;
  final String name;
}

class SignedOutException extends MycaApiException {
  const SignedOutException() : super('Please sign in again.');
}

class CloudSession {
  CloudSession({
    required this.baseUrl,
    required this.tokens,
    http.Client? client,
  }) : _client = client ?? http.Client();

  static const _accessKey = 'cloud.access';
  static const _refreshKey = 'cloud.refresh';
  static const _businessKey = 'cloud.business';
  static const _timeout = Duration(seconds: 20);

  final String baseUrl;
  final TokenStore tokens;
  final http.Client _client;

  String? _access;
  String? _refresh;
  String? _businessId;
  String? _challengeId;
  String? _secondStepChallenge;
  String? _phone;
  Future<bool>? _refreshing;

  bool get signedIn => _refresh != null;
  bool get ready => signedIn && _businessId != null;
  bool get awaitingCode => _challengeId != null;
  bool get secondStepPending => _secondStepChallenge != null;
  bool needsName = false;
  bool needsConsent = false;
  String? get businessId => _businessId;
  late final MycaApi api = _CloudBooksApi(this);

  Future<void> restore() async {
    _access = await tokens.read(_accessKey);
    _refresh = await tokens.read(_refreshKey);
    _businessId = await tokens.read(_businessKey);
  }

  Future<void> _forget() async {
    _access = null;
    _refresh = null;
    _businessId = null;
    _challengeId = null;
    _secondStepChallenge = null;
    await tokens.delete(_accessKey);
    await tokens.delete(_refreshKey);
    await tokens.delete(_businessKey);
  }

  Future<void> _keep(Map<String, dynamic> body) async {
    _access = body['accessToken'] as String?;
    _refresh = body['refreshToken'] as String?;
    if (_access != null) await tokens.write(_accessKey, _access!);
    if (_refresh != null) await tokens.write(_refreshKey, _refresh!);
  }

  Future<(int, Map<String, dynamic>)> _send(
    String method,
    String path,
    Map<String, Object?>? body, {
    bool authed = true,
  }) async {
    final request = http.Request(method, Uri.parse('$baseUrl$path'));
    request.headers['content-type'] = 'application/json';
    if (request.url.host.contains('ngrok')) request.headers['ngrok-skip-browser-warning'] = '1';
    if (authed && _access != null) {
      request.headers['authorization'] = 'Bearer $_access';
    }
    if (body != null) request.body = jsonEncode(body);
    final http.Response response;
    try {
      response = await http.Response.fromStream(
        await _client.send(request).timeout(_timeout),
      );
    } on Exception {
      throw const MycaApiException(
        'Cannot reach MyCA. Check your connection and try again.',
      );
    }
    Object? decoded;
    try {
      decoded = jsonDecode(utf8.decode(response.bodyBytes));
    } on FormatException {
      decoded = null;
    }
    final map = decoded is Map ? decoded.cast<String, dynamic>() : <String, dynamic>{};
    if (response.statusCode >= 500 && map['error'] is! String && !map.containsKey('reply')) {
      return (response.statusCode, {'ok': false, 'error': 'SERVER_BUSY'});
    }
    return (response.statusCode, map);
  }

  Future<bool> _rotate() {
    return _refreshing ??= () async {
      try {
        final refresh = _refresh;
        if (refresh == null) return false;
        final (status, body) = await _send('POST', '/v1/auth/refresh', {
          'refreshToken': refresh,
        }, authed: false);
        if (status >= 500 || status == 429) throw MycaApiException(cloudMessage('SERVER_BUSY'));
        if (status != 200 || body['ok'] == false) return false;
        await _keep(body);
        return true;
      } finally {
        _refreshing = null;
      }
    }();
  }

  Future<Map<String, dynamic>> call(
    String method,
    String path, [
    Map<String, Object?>? body,
    String? Function(String code, Object? attemptsRemaining)? explain,
  ]) async {
    if (!signedIn) throw const SignedOutException();
    var (status, reply) = await _send(method, path, body);
    if (status == 401) {
      if (!await _rotate()) {
        await _forget();
        throw const SignedOutException();
      }
      (status, reply) = await _send(method, path, body);
    }
    if (status == 401) {
      await _forget();
      throw const SignedOutException();
    }
    if (status == 403 && reply['error'] == 'CONSENT_REQUIRED') {
      needsConsent = true;
    }
    if (status >= 400 &&
        reply['error'] is String &&
        !reply.containsKey('reply')) {
      final code = reply['error'] as String;
      throw MycaApiException(explain?.call(code, reply['attemptsRemaining']) ?? cloudMessage(code, '${reply['hint'] ?? ''}'));
    }
    return reply;
  }

  Map<String, dynamic> _accepted(Map<String, dynamic> body) {
    if (body['ok'] == false) throw MycaApiException(cloudMessage('${body['error'] ?? 'UNKNOWN'}', '${body['hint'] ?? ''}'));
    return body;
  }

  Map<String, dynamic> _data(Map<String, dynamic> body) {
    final data = _accepted(body)['data'];
    return data is Map ? data.cast<String, dynamic>() : <String, dynamic>{};
  }

  Future<ConnectorList> listConnectors() async {
    final body = _accepted(await call('GET', '$_books/connectors'));
    return ConnectorList(
      pulls: body['pulls'] == true,
      connectors: [for (final row in _rows(body['connectors'])) ConnectorView.fromJson(row)],
    );
  }

  Future<ConnectorView> saveConnector(String channel, Map<String, Object?> fields) async {
    final body = _accepted(await call('POST', '$_books/connectors', {'channel': channel, ...fields}));
    return ConnectorView.fromJson(body);
  }

  Future<List<PlanOffer>> plans() async {
    final body = _accepted(await call('GET', '/v1/plans'));
    final rows = body['plans'];
    return [if (rows is List) for (final row in rows) if (row is Map) PlanOffer.fromJson(row.cast<String, dynamic>())];
  }

  Future<Entitlement> entitlement() async => Entitlement.fromJson(_accepted(await call('GET', '$_books/subscription')));

  Future<Entitlement> recordPurchase(String productId, String purchaseToken) async {
    final body = _accepted(await call('POST', '$_books/subscription', {'productId': productId, 'purchaseToken': purchaseToken}));
    final entitlement = body['entitlement'];
    return entitlement is Map ? Entitlement.fromJson(entitlement.cast<String, dynamic>()) : await this.entitlement();
  }

  Future<EinvoiceOutcome> generateEinvoice(String invoiceId) async {
    return EinvoiceOutcome.fromJson(await call('POST', '$_books/einvoice', {'invoiceId': invoiceId}));
  }

  Future<List<Map<String, dynamic>>> pendingEinvoiceApprovals(String invoiceId) async {
    final body = _accepted(await call('GET', '$_books/approvals'));
    final rows = body['approvals'];
    if (rows is! List) return const [];
    return [
      for (final row in rows)
        if (row is Map && row['operation'] == 'einvoice' && row['status'] == 'pending' && row['params'] is Map && (row['params'] as Map)['invoiceId'] == invoiceId) row.cast<String, dynamic>(),
    ];
  }

  Future<Map<String, dynamic>> requestEinvoiceApproval(String invoiceId) async {
    return call('POST', '$_books/approvals', {'operation': 'einvoice', 'invoiceId': invoiceId});
  }

  Future<Map<String, dynamic>> approve(String approvalId) async {
    return call('POST', '$_books/approvals', {'approvalId': approvalId, 'decision': 'approve'});
  }

  Future<PlaidLinkToken> plaidLinkToken() async {
    final data = _data(await call('POST', '$_books/plaid-link-token', const {}));
    return PlaidLinkToken(linkToken: '${data['linkToken'] ?? ''}', environment: '${data['environment'] ?? ''}', mock: data['mock'] == true);
  }

  Future<PlaidItem> plaidExchange(String publicToken) async {
    final data = _data(await call('POST', '$_books/plaid-exchange', {'publicToken': publicToken}));
    return PlaidItem(itemId: '${data['itemId'] ?? ''}', linkedOn: '${data['linkedOn'] ?? ''}');
  }

  Future<GustoConnect> gustoConnect() async {
    final data = _data(await call('POST', '$_books/gusto-connect', const {}));
    return GustoConnect(url: '${data['url'] ?? ''}', redirectUri: '${data['redirectUri'] ?? ''}');
  }

  Future<TaxRate> taxjarRate({required String zip, required String city, required String state}) async {
    final data = _data(await call('POST', '$_books/taxjar-rate', {'zip': zip, 'city': city, 'state': state}));
    final parts = data['parts'];
    return TaxRate(
      code: '${data['code'] ?? ''}',
      name: '${data['name'] ?? ''}',
      ratePercent: data['ratePercent'] as num? ?? 0,
      parts: {
        if (parts is Map)
          for (final entry in parts.entries)
            if (entry.value is num) '${entry.key}': entry.value as num,
      },
      recorded: data['recorded'] == true,
    );
  }

  Future<ConnectorSync> connectorSync() async {
    final data = _data(await call('POST', '$_books/connector-sync', const {}));
    return ConnectorSync(
      fetched: '${data['fetched'] ?? ''}',
      results: [
        for (final row in _rows(data['results']))
          SyncResult(
            channel: '${row['channel'] ?? ''}',
            kind: '${row['kind'] ?? ''}',
            ok: row['ok'] != false,
            rows: (row['rows'] as num?)?.toInt() ?? 0,
            error: '${row['hint'] ?? row['error'] ?? ''}',
            empty: row['empty'] == true,
            dryRun: row['dryRun'] == true,
          ),
      ],
    );
  }

  Future<GstPortalStatus> gstPortalStatus() async => GstPortalStatus.fromJson(_accepted(await call('GET', '$_books/gst-portal')));

  Future<Map<String, dynamic>> gstPortalConnect(String step, {String gstin = '', String username = '', String otp = ''}) async {
    return _accepted(await call('POST', '$_books/gst-portal', {
      'step': step,
      if (gstin.isNotEmpty) 'gstin': gstin,
      if (username.isNotEmpty) 'username': username,
      if (otp.isNotEmpty) 'otp': otp,
    }));
  }

  Future<Map<String, dynamic>> gstr1Step(String step, {required String period, String gstin = '', String otp = '', String pan = ''}) => returnStep('gstr1', step, period: period, gstin: gstin, otp: otp, pan: pan);

  Future<Map<String, dynamic>> returnStep(String form, String step, {required String period, String gstin = '', String otp = '', String pan = ''}) async {
    return _accepted(await call('POST', '$_books/gst-${form == 'gstr3b' ? 'gstr3b' : 'gstr1'}', {
      'step': step,
      'period': period,
      if (gstin.isNotEmpty) 'gstin': gstin,
      if (otp.isNotEmpty) 'otp': otp,
      if (pan.isNotEmpty) 'pan': pan,
    }));
  }

  Future<void> sendCrashReports(List<Map<String, Object?>> reports) async {
    await call('POST', '/v1/crash-reports', {'reports': reports});
  }

  Future<void> requestCode(String phone) async {
    final (_, body) = await _send('POST', '/v1/auth/otp', {
      'phone': phone,
    }, authed: false);
    if (body['ok'] != true) {
      throw MycaApiException(cloudMessage('${body['error'] ?? 'UNKNOWN'}'));
    }
    _challengeId = body['challengeId'] as String?;
    _phone = phone;
  }

  void changeNumber() => _challengeId = null;

  Future<void> verifyCode(String code) async {
    final (_, body) = await _send('POST', '/v1/auth/verify', {
      'challengeId': _challengeId,
      'phone': _phone,
      'code': code,
      'deviceLabel': deviceLabel,
    }, authed: false);
    if (body['ok'] != true) {
      throw MycaApiException(cloudMessage('${body['error'] ?? 'UNKNOWN'}'));
    }
    if (_challenged(body)) return;
    await _keep(body);
    _challengeId = null;
    await _signedIn(body);
  }

  bool _challenged(Map<String, dynamic> body) {
    if (body['secondStep'] != true) return false;
    final challenge = body['challengeId'];
    if (challenge is! String || challenge.isEmpty) throw MycaApiException(cloudMessage('UNKNOWN'));
    _secondStepChallenge = challenge;
    return true;
  }

  Future<SecondStepResult> completeSecondStep(String code) async {
    final (_, body) = await _send('POST', '/v1/auth/second-step', {
      'challengeId': _secondStepChallenge,
      'code': code,
      'deviceLabel': deviceLabel,
    }, authed: false);
    if (body['ok'] != true) {
      throw MycaApiException(secondStepMessage('${body['error'] ?? 'UNKNOWN'}', body['attemptsRemaining']));
    }
    await _keep(body);
    _secondStepChallenge = null;
    _challengeId = null;
    await _signedIn(body);
    return SecondStepResult(
      usedRecoveryCode: body['usedRecoveryCode'] == true,
      recoveryCodesLeft: (body['recoveryCodesLeft'] as num?)?.toInt(),
    );
  }

  void cancelSecondStep() {
    _secondStepChallenge = null;
    _challengeId = null;
  }

  Future<SignInMethods> methods() async {
    try {
      final (status, body) = await _send('GET', '/v1/auth/methods', null, authed: false);
      if (status == 200 && body['ok'] == true) {
        return SignInMethods(
          phone: body['phone'] == true,
          google: body['google'] == true,
          oidc: body['oidc'] == true,
          oidcIssuer: '${body['oidcIssuer'] ?? ''}',
        );
      }
    } on MycaApiException {
      return const SignInMethods(phone: true, google: true);
    }
    return const SignInMethods(phone: true, google: true);
  }

  Future<void> signInWithGoogle(String idToken) => _signInWithIdToken('/v1/auth/google', idToken);

  Future<void> signInWithOidc(String idToken) => _signInWithIdToken('/v1/auth/oidc', idToken);

  Future<void> _signInWithIdToken(String path, String idToken) async {
    final (_, body) = await _send('POST', path, {
      'idToken': idToken,
      'deviceLabel': deviceLabel,
    }, authed: false);
    if (body['ok'] != true) {
      throw MycaApiException(cloudMessage('${body['error'] ?? 'UNKNOWN'}'));
    }
    if (_challenged(body)) return;
    await _keep(body);
    _challengeId = null;
    await _signedIn(body);
  }

  Future<void> _signedIn(Map<String, dynamic> body) async {
    final user = body['user'];
    needsName = user is Map && '${user['name'] ?? ''}'.trim().isEmpty;
    final consent = body['consent'];
    needsConsent = consent is Map && consent['accepted'] == false;
    if (needsConsent) return;
    final mine = await businesses();
    if (mine.isNotEmpty) await _choose(mine.first.id);
  }

  Future<void> checkConsent() async {
    if (!signedIn) return;
    try {
      final body = await call('GET', '/v1/me');
      final consent = body['consent'];
      needsConsent = consent is Map && consent['accepted'] == false;
    } on MycaApiException {
      return;
    }
  }

  Future<PrivacyNotice> privacyNotice() async {
    final (status, body) = await _send('GET', '/v1/privacy-notice', null, authed: false);
    if (status != 200 || body['notice'] is! Map) {
      throw MycaApiException(cloudMessage('${body['error'] ?? 'UNKNOWN'}'));
    }
    return PrivacyNotice.fromJson(body['notice']);
  }

  Future<void> acceptNotice(PrivacyNotice notice) async {
    await call('POST', '/v1/me/consent', {'document': notice.document, 'version': notice.version});
    needsConsent = false;
    if (_businessId == null) {
      final mine = await businesses();
      if (mine.isNotEmpty) await _choose(mine.first.id);
    }
  }

  Future<void> _choose(String id) async {
    _businessId = id;
    await tokens.write(_businessKey, id);
  }

  Future<List<BusinessRef>> businesses() async {
    final body = await call('GET', '/v1/businesses');
    final rows = body['businesses'];
    return [
      if (rows is List)
        for (final row in rows)
          if (row is Map)
            BusinessRef(
              id: '${row['id']}',
              name: '${row['name']}',
              role: '${row['role']}',
            ),
    ];
  }

  Future<List<StateRef>> states() async {
    final body = await call('GET', '/v1/reference/states');
    final rows = body['states'];
    return [
      if (rows is List)
        for (final row in rows)
          if (row is Map)
            StateRef(code: '${row['code']}', name: '${row['name']}'),
    ];
  }

  Future<void> createBusiness({
    required String name,
    String gstin = '',
    String state = '',
  }) async {
    final body = await call('POST', '/v1/businesses', {
      'name': name,
      if (gstin.isNotEmpty) 'gstin': gstin,
      if (state.isNotEmpty) 'state': state,
    });
    final business = body['business'];
    if (business is! Map) {
      throw const MycaApiException('The business was not created.');
    }
    await _choose('${business['id']}');
  }

  Future<void> signOut() async {
    try {
      if (signedIn) await call('POST', '/v1/auth/logout', const {});
    } on MycaApiException {
      return;
    } finally {
      await _forget();
    }
  }

  Future<Me> me() async {
    final body = await call('GET', '/v1/me');
    final user = body['user'];
    return Me(
      id: user is Map ? '${user['id']}' : '',
      name: user is Map ? '${user['name'] ?? ''}' : '',
      businesses: [
        for (final row in _rows(body['businesses'])) BusinessRef(id: '${row['id']}', name: '${row['name']}', role: '${row['role']}'),
      ],
      invitations: [
        for (final row in _rows(body['invitations']))
          InvitationRef(
            id: '${row['id']}',
            businessName: '${row['businessName']}',
            role: '${row['role']}',
            invitedBy: '${row['invitedBy'] ?? ''}',
          ),
      ],
    );
  }

  Future<void> setName(String name) async {
    final body = await call('PATCH', '/v1/me', {'name': name});
    if (body['ok'] == false) throw MycaApiException(cloudMessage('${body['error']}'));
    needsName = false;
  }

  Future<void> switchBusiness(String id) => _choose(id);

  Future<void> respondToInvitation(String id, {required bool accept}) async {
    final body = await call('POST', '/v1/invitations/$id/${accept ? 'accept' : 'decline'}');
    final business = body['business'];
    if (accept && business is Map) await _choose('${business['id']}');
  }

  Future<People> people() async {
    final body = await call('GET', '$_books/members');
    return People(
      members: [
        for (final row in _rows(body['members'])) MemberRef(id: '${row['id']}', name: '${row['name'] ?? ''}', role: '${row['role']}'),
      ],
      invites: [
        for (final row in _rows(body['invitations'])) OpenInvite(id: '${row['id']}', phoneHint: '${row['phoneHint']}', role: '${row['role']}'),
      ],
    );
  }

  Future<bool> weeklyBrief() async {
    final body = await call('GET', '$_books/brief');
    return body['weekly'] == true;
  }

  Future<bool> setWeeklyBrief(bool on) async {
    final body = await call('POST', '$_books/brief', {'weekly': on});
    return body['weekly'] == true;
  }

  Future<CaSync> caSync() async {
    final body = await call('GET', '$_books/ca-sync');
    return CaSync(mode: '${body['mode'] ?? 'live'}', sharedAsOf: '${body['sharedAsOf'] ?? ''}');
  }

  Future<CaSync> setCaSync(String mode) async {
    final body = await call('POST', '$_books/ca-sync', {'mode': mode});
    return CaSync(mode: '${body['mode'] ?? mode}', sharedAsOf: '${body['sharedAsOf'] ?? ''}');
  }

  Future<String> shareWithCa() async {
    final body = await call('POST', '$_books/ca-share');
    return '${body['sharedAsOf'] ?? ''}';
  }

  Future<void> invite(String phone, String role) => call('POST', '$_books/invitations', {'phone': phone, 'role': role});

  Future<void> revokeInvitation(String id) => call('DELETE', '$_books/invitations/$id');

  Future<void> removeMember(String userId) => call('DELETE', '$_books/members/$userId');

  Future<List<InboundKey>> inboundKeys() async {
    final body = await call('GET', '$_books/inbound');
    return [
      for (final row in _rows(body['keys']))
        InboundKey(
          id: '${row['id']}',
          label: '${row['label']}',
          source: '${row['source']}',
          enabled: row['enabled'] != false,
          todayCount: (row['todayCount'] as num?)?.toInt() ?? 0,
          todayTotal: row['todayTotal'] as num? ?? 0,
          email: '${row['email'] ?? ''}',
        ),
    ];
  }

  Future<InboundKey> createInboundKey(String label, String source) async {
    final body = await call('POST', '$_books/inbound', {'label': label, 'source': source});
    if (body['ok'] == false) throw MycaApiException(cloudMessage('${body['error']}'));
    final key = body['key'] as Map;
    return InboundKey(id: '${key['id']}', label: '${key['label']}', source: '${key['source']}', enabled: true, secret: '${key['secret']}', email: '${key['email'] ?? ''}');
  }

  Future<void> disableInboundKey(String id) => call('DELETE', '$_books/inbound/$id');

  Future<void> changeRole(String userId, String role) async {
    final body = await call('PATCH', '$_books/members/$userId', {'role': role});
    if (body['ok'] == false) throw MycaApiException(cloudMessage('${body['error']}'));
  }

  Future<Map<String, dynamic>> exportBusiness() => call('GET', '$_books/export');

  Future<Map<String, dynamic>> replaceBooks(Map<String, Object?> payload) async {
    final body = await call('POST', '$_books/replace', payload, _restoreMessage);
    if (body['ok'] == false) throw MycaApiException(cloudMessage('${body['error']}'));
    return body;
  }

  Future<void> deleteBusiness() async {
    final id = _businessId;
    if (id == null) return;
    final body = await call('DELETE', '/v1/businesses/$id');
    if (body['ok'] == false) throw MycaApiException(cloudMessage('${body['error']}'));
    _businessId = null;
    await tokens.delete(_businessKey);
    final mine = await businesses();
    if (mine.isNotEmpty) await _choose(mine.first.id);
  }

  Future<void> deleteAccount() async {
    final body = await call('DELETE', '/v1/me');
    if (body['ok'] == false) throw MycaApiException(cloudMessage('${body['error']}'));
    await _forget();
  }

  Future<SecondStepStatus> secondStepStatus() async => SecondStepStatus.fromJson(_accepted(await call('GET', '/v1/me/second-step')));

  Future<SecondStepSetup> beginSecondStep() async {
    final body = _accepted(await call('POST', '/v1/me/second-step/begin', const {}));
    return SecondStepSetup(secret: '${body['secret'] ?? ''}', uri: '${body['uri'] ?? ''}', account: '${body['account'] ?? ''}');
  }

  Future<List<String>> confirmSecondStep(String code) async =>
      _strings(_accepted(await call('POST', '/v1/me/second-step/confirm', {'code': code}, _setupCodeMessage))['recoveryCodes']);

  Future<void> disableSecondStep(String code) async {
    _accepted(await call('POST', '/v1/me/second-step/disable', {'code': code}, _changeCodeMessage));
  }

  Future<List<String>> newRecoveryCodes(String code) async =>
      _strings(_accepted(await call('POST', '/v1/me/second-step/recovery-codes', {'code': code}, _changeCodeMessage))['recoveryCodes']);

  Future<List<SignedInDevice>> devices() async {
    final body = _accepted(await call('GET', '/v1/me/devices'));
    return [for (final row in _rows(body['devices'])) SignedInDevice.fromJson(row)];
  }

  Future<void> signOutDevice(String id) async {
    _accepted(await call('POST', '/v1/me/devices/$id/sign-out', const {}));
  }

  Future<int> signOutOtherDevices() async {
    final body = _accepted(await call('POST', '/v1/me/devices/sign-out-others', const {}));
    return (body['revoked'] as num?)?.toInt() ?? 0;
  }

  Future<void> leaveBusiness(String userId) async {
    await removeMember(userId);
    _businessId = null;
    await tokens.delete(_businessKey);
    final mine = await businesses();
    if (mine.isNotEmpty) await _choose(mine.first.id);
  }

  String get _books {
    final id = _businessId;
    if (id == null) throw const SignedOutException();
    return '/v1/businesses/$id';
  }
}

class _CloudBooksApi implements MycaApi {
  _CloudBooksApi(this._session);

  final CloudSession _session;

  @override
  Future<Snapshot> snapshot() async {
    final body = await _session.call('GET', '${_session._books}/snapshot');
    final user = body['user'];
    return Snapshot.fromJson({
      ...body,
      'users': const <Object?>[],
      'activeUser': user is Map
          ? {
              'userId': '${user['id']}',
              'name': '${user['name'] ?? ''}',
              'role': '${body['role'] ?? ''}',
            }
          : null,
    });
  }

  @override
  Future<SignInResult> signIn(String userId, String pin) async =>
      const SignInResult(ok: false, error: 'USE_PHONE_SIGN_IN');

  @override
  Future<void> signOut() => _session.signOut();

  @override
  Future<ChatReply> chat(String message) async => ChatReply.fromJson(
    await _session.call('POST', '${_session._books}/ask', {'message': message}),
  );

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async {
    final body = await _session.call('POST', '${_session._books}/propose', {
      'name': name,
      'args': args,
    });
    return ChatReply.fromJson(body);
  }

  @override
  Future<ChatReply> confirm(String token) async => ChatReply.fromJson(
    await _session.call('POST', '${_session._books}/confirm', {'token': token}),
  );

  @override
  Future<ChatReply> discard() async => ChatReply.fromJson(
    await _session.call('POST', '${_session._books}/discard', const {}),
  );

  @override
  Future<String> upload(String name, String content) async {
    checkUploadSize(content);
    return uploadedHash(await _session.call('POST', '${_session._books}/uploads', {'name': name, 'content': content}));
  }

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) =>
      _session.call('POST', '${_session._books}/query', {
        'name': name,
        'args': args,
      });

  @override
  Future<ToolOutcome> updateCompany({
    required String name,
    String gstin = '',
  }) async => ToolOutcome.fromJson(
    await _session.call('POST', '${_session._books}/company', {
      'name': name,
      if (gstin.isNotEmpty) 'gstin': gstin,
    }),
  );
}
