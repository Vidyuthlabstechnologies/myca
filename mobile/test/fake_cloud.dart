import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class FakeCloud {
  final List<Map<String, Object?>> privacyRequests = [];
  static const code = '428913';
  static const challengeId = '11111111-1111-4111-8111-111111111111';
  static const businessId = '22222222-2222-4222-8222-222222222222';

  final requests = <String>[];
  final businesses = <Map<String, Object?>>[];
  final createdBodies = <Map<String, Object?>>[];
  final invoices = <Map<String, Object?>>[];
  final uploads = <String, String>{};
  final quickoCalls = <Map<String, Object?>>[];
  final quickoSessions = <Map<String, Object?>>[];
  final imports = <String>[];
  final myInvitations = <Map<String, Object?>>[];
  final members = <Map<String, Object?>>[];
  final openInvites = <Map<String, Object?>>[];
  final invited = <String>[];
  final removed = <String>[];
  final roleChanges = <String>[];
  final briefChanges = <bool>[];
  bool weeklyBrief = false;
  final inboundKeys = <Map<String, Object?>>[];
  final disabledKeys = <String>[];
  static const connectorSpecs = <String, Map<String, Object>>{
    'amazon': {'title': 'Amazon Seller Central (SP-API)', 'country': 'IN', 'fields': ['clientId', 'clientSecret', 'refreshToken', 'marketplaceId', 'region'], 'secrets': ['clientSecret', 'refreshToken'], 'optional': ['region'], 'kinds': ['settlement', 'orders']},
    'shopify': {'title': 'Shopify Admin API', 'country': 'IN', 'fields': ['shopDomain', 'accessToken'], 'secrets': ['accessToken'], 'optional': <String>[], 'kinds': ['settlement', 'orders']},
    'razorpay': {'title': 'Razorpay', 'country': 'IN', 'fields': ['keyId', 'keySecret'], 'secrets': ['keySecret'], 'optional': <String>[], 'kinds': ['settlement']},
    'zoho': {'title': 'Zoho Books', 'country': 'IN', 'fields': ['orgId', 'dc', 'clientId', 'clientSecret', 'refreshToken'], 'secrets': ['clientSecret', 'refreshToken'], 'optional': ['dc'], 'kinds': <String>[]},
    'plaid': {'title': 'Plaid (US bank feeds)', 'country': 'US', 'fields': ['clientId', 'secret', 'environment', 'accessToken', 'itemId', 'cursor'], 'secrets': ['secret', 'accessToken'], 'optional': ['itemId', 'cursor'], 'kinds': ['bank']},
    'taxjar': {'title': 'TaxJar (US sales tax rates)', 'country': 'US', 'fields': ['apiToken', 'environment'], 'secrets': ['apiToken'], 'optional': ['environment'], 'kinds': <String>[]},
    'gusto': {'title': 'Gusto (US payroll)', 'country': 'US', 'fields': ['clientId', 'clientSecret', 'environment', 'redirectUri', 'accessToken', 'refreshToken', 'companyUuid', 'oauthState'], 'secrets': ['clientSecret', 'accessToken', 'refreshToken'], 'optional': ['environment', 'redirectUri', 'companyUuid', 'oauthState'], 'kinds': ['payroll']},
    'track1099': {'title': 'Track1099 (US 1099 e-filing)', 'country': 'US', 'fields': ['apiToken', 'teamApiId', 'testMode'], 'secrets': ['apiToken'], 'optional': ['testMode'], 'kinds': <String>[]},
  };
  final connectorValues = <String, Map<String, String>>{};
  final connectorEnabled = <String, bool>{};
  final connectorFetchedTo = <String, String>{};
  final connectorSaves = <Map<String, dynamic>>[];
  final plaidExchanges = <String>[];
  final taxjarLookups = <Map<String, dynamic>>[];
  int connectorSyncs = 0;
  bool gstPortalAvailable = true;
  final gstPortalSessions = <String, Map<String, Object?>>{};
  final gstr1Steps = <Map<String, dynamic>>[];
  final gstr3bSteps = <Map<String, dynamic>>[];
  bool filingNeedsApproval = false;
  bool approverIsSomeoneElse = false;
  bool filingSimulated = false;
  String serverEnvironment = '';
  String providerMode = 'live';
  final filingApprovals = <Map<String, Object?>>[];
  int plaidLinkTokens = 0;
  int gustoConnects = 0;
  bool connectorsUnavailable = false;
  bool pullsOn = true;

  Map<String, Object?> _connectorView(String channel) {
    final spec = connectorSpecs[channel]!;
    final fields = (spec['fields'] as List).cast<String>();
    final secrets = (spec['secrets'] as List).cast<String>();
    final optional = (spec['optional'] as List).cast<String>();
    final values = connectorValues[channel] ?? const {};
    final configured = values.isNotEmpty && fields.every((f) => (values[f] ?? '').isNotEmpty || optional.contains(f));
    return {
      'channel': channel,
      'title': spec['title'],
      'country': spec['country'],
      'configured': configured,
      'enabled': connectorEnabled[channel] ?? true,
      if (connectorFetchedTo[channel] != null) 'lastFetchedTo': connectorFetchedTo[channel],
      'kinds': spec['kinds'],
      'fields': fields,
      'secrets': secrets,
      'optional': optional,
      for (final f in fields) f: secrets.contains(f) ? ((values[f] ?? '').isNotEmpty ? 'set' : '') : (values[f] ?? ''),
    };
  }

  static const connectorsOff = {'ok': false, 'error': 'CONNECTORS_UNAVAILABLE', 'hint': 'The service has no connector key; ask the operator to set MYCA_CONNECTOR_KEY.'};
  final deletedBusinesses = <String>[];
  bool accountDeleted = false;
  int exports = 0;
  final replaced = <Map<String, dynamic>>[];
  final crashReports = <Map<String, Object?>>[];
  final funnelSteps = <Map<String, Object?>>[];
  final claimedCodes = <String>[];
  int referralInvited = 0;
  bool crashServerDown = false;
  bool noticeAccepted = true;
  bool phoneOn = true;
  bool googleOn = true;
  bool oidcOn = false;
  String oidcIssuer = 'https://login.firm.example';
  String oidcToken = 'oidc-id-token';
  final deviceLabels = <String>[];
  String caMode = 'live';
  String sharedAsOf = '';
  int shares = 0;
  final consents = <String>[];
  String userName = '';
  String role = 'owner';
  Map<String, Object?> company = const {};
  int tokenSerial = 0;
  String access = '';
  String refresh = '';
  bool expireAccessOnce = false;
  bool refreshFails = false;
  int refreshes = 0;
  int logouts = 0;
  bool secondStepOn = false;
  String totpCode = '246810';
  String recoveryCode = 'abcde-fghjk';
  bool twoStepEnabled = false;
  bool enrolling = false;
  int enrolAttempts = 0;
  String secondStepError = '';
  int? secondStepLeft;
  int changeTries = 0;
  int recoveryLeft = 8;
  static const secondStepChallenge = 'ss-1';
  static const totpSecret = 'JBSWY3DPEHPK3PXP';
  static const totpUri = 'otpauth://totp/MyCA:%2B919876543210?secret=JBSWY3DPEHPK3PXP&issuer=MyCA&algorithm=SHA1&digits=6&period=30';
  static const freshRecoveryCodes = ['abcde-fghjk', 'mnpqr-stuvw', 'xyz23-45678', '9abcd-efghj', 'kmnpq-rstuv', 'wxyz2-34567', '89abc-defgh', 'jkmnp-qrstu'];
  final devices = <Map<String, Object?>>[
    {'id': 'dev-1', 'label': 'Android', 'signedInOn': '2026-10-01T04:30:00.000Z', 'lastActive': '2026-10-06T04:25:00.000Z', 'current': true},
    {'id': 'dev-2', 'label': 'iPhone', 'signedInOn': '2026-09-20T12:00:00.000Z', 'lastActive': '2026-10-05T15:40:00.000Z', 'current': false},
  ];
  final secondSteps = <String>[];
  final secondStepBodies = <Map<String, dynamic>>[];
  final revoked = <String>[];
  int signedOutOthers = 0;

  late final http.Client client = MockClient(_handle);

  Map<String, Object?> _secondStep() => {
        'ok': true,
        'secondStep': true,
        'challengeId': secondStepChallenge,
        'expiresInSeconds': 300,
        'user': {'id': 'u1', 'name': userName, 'isNew': false},
        'consent': {'document': 'privacy', 'version': 'v-test', 'accepted': noticeAccepted},
      };

  String _plainCode(Object? code) => '$code'.replaceAll(RegExp(r'[\s-]'), '').toLowerCase();

  bool _codeOk(Object? code) => '$code' == totpCode || _plainCode(code) == _plainCode(recoveryCode);

  http.Response _json(int status, Map<String, Object?> body) =>
      http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json; charset=utf-8'});

  Map<String, Object?> _issue() {
    tokenSerial += 1;
    access = 'access-$tokenSerial';
    refresh = 'refresh-$tokenSerial';
    return {'ok': true, 'accessToken': access, 'refreshToken': refresh, 'expiresInSeconds': 900};
  }

  Future<http.Response> _handle(http.Request request) async {
    final path = request.url.path;
    requests.add('${request.method} $path');
    final body = request.body.isEmpty ? <String, dynamic>{} : (jsonDecode(request.body) as Map).cast<String, dynamic>();

    if (path == '/v1/health/live') {
      if (serverEnvironment.isEmpty) return _json(404, {'ok': false, 'error': 'NOT_FOUND'});
      return _json(200, {'ok': true, 'environment': serverEnvironment, 'providerMode': providerMode, 'version': 'test'});
    }
    if (path == '/v1/privacy-notice' && request.url.queryParameters['region'] == 'US') {
      return _json(200, {
        'ok': true,
        'notice': {
          'document': 'privacy',
          'version': 'us-test',
          'title': 'How MyCA uses your information (United States)',
          'status': 'Draft for legal review.',
          'sections': [
            {'heading': 'How we use it', 'body': 'Section 7216 does not let us use your tax return information for anything else.'},
          ],
        },
      });
    }
    if (path == '/v1/privacy-notice') {
      return _json(200, {
        'ok': true,
        'notice': {
          'document': 'privacy',
          'version': 'v-test',
          'requiresAdult': true,
          'contact': {'grievanceOfficer': {'name': 'Asha Rao', 'email': 'grievance@myca.test', 'phone': '[phone, optional]'}},
          'links': {'terms': 'https://myca.test/terms', 'refunds': 'https://myca.test/refunds', 'grievance': 'https://myca.test/grievance'},
          'title': 'How MyCA uses your information',
          'status': 'Draft for legal review.',
          'sections': [
            {'heading': 'Who we are', 'body': 'MyCA is provided by ML Dynamic Solutions Private Limited.'},
            {'heading': 'Your rights', 'body': 'You can ask to see, correct or erase your information.'},
          ],
        },
      });
    }
    if (path == '/v1/auth/methods') {
      return _json(200, {'ok': true, 'phone': phoneOn, 'google': googleOn, 'oidc': oidcOn, if (oidcOn) 'oidcIssuer': oidcIssuer});
    }
    if (path == '/v1/auth/oidc') {
      deviceLabels.add('${body['deviceLabel']}');
      if (!oidcOn) return _json(503, {'ok': false, 'error': 'OIDC_SIGN_IN_UNAVAILABLE'});
      if (body['idToken'] != oidcToken) return _json(400, {'ok': false, 'error': 'INVALID_OIDC_TOKEN'});
      if (userName.isEmpty) userName = 'Asha Rao';
      if (secondStepOn) return _json(200, _secondStep());
      return _json(200, {
        ..._issue(),
        'user': {'id': 'u1', 'name': userName, 'isNew': businesses.isEmpty},
        'consent': {'document': 'privacy', 'version': 'v-test', 'accepted': noticeAccepted},
      });
    }
    if (path == '/v1/auth/google') {
      deviceLabels.add('${body['deviceLabel']}');
      if (body['idToken'] != 'google-id-token') return _json(400, {'ok': false, 'error': 'INVALID_GOOGLE_TOKEN'});
      if (userName.isEmpty) userName = 'Asha Rao';
      if (secondStepOn) return _json(200, _secondStep());
      return _json(200, {
        ..._issue(),
        'user': {'id': 'u1', 'name': userName, 'isNew': businesses.isEmpty},
        'consent': {'document': 'privacy', 'version': 'v-test', 'accepted': noticeAccepted},
      });
    }
    if (path == '/v1/auth/otp') {
      if (!phoneOn) return _json(503, {'ok': false, 'error': 'PHONE_SIGN_IN_UNAVAILABLE'});
      final phone = '${body['phone']}'.replaceAll(' ', '');
      if (!RegExp(r'^(\+91)?[6-9]\d{9}$').hasMatch(phone)) return _json(400, {'ok': false, 'error': 'INVALID_PHONE'});
      return _json(200, {'ok': true, 'challengeId': challengeId, 'expiresInSeconds': 300});
    }
    if (path == '/v1/auth/verify') {
      if (body['code'] != code) return _json(400, {'ok': false, 'error': 'INVALID_CODE', 'attemptsRemaining': 4});
      if (secondStepOn) return _json(200, _secondStep());
      return _json(200, {
        ..._issue(),
        'user': {'id': 'u1', 'name': userName, 'isNew': businesses.isEmpty},
        'consent': {'document': 'privacy', 'version': 'v-test', 'accepted': noticeAccepted},
      });
    }
    if (path == '/v1/auth/second-step') {
      secondSteps.add('${body['code']}');
      secondStepBodies.add(body);
      if (secondStepError.isNotEmpty) {
        return _json(secondStepError == 'TOO_MANY_ATTEMPTS' ? 429 : 400, {'ok': false, 'error': secondStepError, if (secondStepLeft != null) 'attemptsRemaining': secondStepLeft});
      }
      if (body['challengeId'] != secondStepChallenge) return _json(400, {'ok': false, 'error': 'INVALID_CODE'});
      if (!_codeOk(body['code'])) return _json(400, {'ok': false, 'error': 'INVALID_CODE', 'attemptsRemaining': 4});
      changeTries = 0;
      final usedRecoveryCode = '${body['code']}' != totpCode;
      if (usedRecoveryCode) recoveryLeft -= 1;
      return _json(200, {
        ..._issue(),
        'user': {'id': 'u1', 'name': userName, 'isNew': false},
        'usedRecoveryCode': usedRecoveryCode,
        'recoveryCodesLeft': recoveryLeft,
        'consent': {'document': 'privacy', 'version': 'v-test', 'accepted': noticeAccepted},
      });
    }
    if (path == '/v1/auth/refresh') {
      refreshes += 1;
      if (refreshFails || body['refreshToken'] != refresh) return _json(400, {'ok': false, 'error': 'DEVICE_REVOKED'});
      return _json(200, _issue());
    }

    if (request.headers['authorization'] != 'Bearer $access') {
      return _json(401, {'ok': false, 'error': 'UNAUTHENTICATED', 'reason': 'BAD_SIGNATURE'});
    }
    if (expireAccessOnce) {
      expireAccessOnce = false;
      access = 'expired';
      return _json(401, {'ok': false, 'error': 'UNAUTHENTICATED', 'reason': 'TOKEN_EXPIRED'});
    }
    if (path == '/v1/me/privacy-requests' && request.method == 'POST') {
      if (body['kind'] == 'grievance' && '${body['message'] ?? ''}'.isEmpty) return _json(400, {'ok': false, 'error': 'MESSAGE_REQUIRED'});
      final made = {'reference': 'DPR-20261114-ABC${privacyRequests.length}', 'kind': body['kind'], 'status': 'open', 'message': body['message'] ?? '', 'reply': '', 'createdAt': '2026-11-14T00:00:00.000Z', 'dueAt': '2026-12-14T00:00:00.000Z'};
      privacyRequests.insert(0, made);
      return _json(200, {'ok': true, 'request': made, 'replyWithinDays': 30});
    }
    if (path == '/v1/me/privacy-requests' && request.method == 'GET') {
      return _json(200, {'ok': true, 'requests': privacyRequests, 'replyWithinDays': 30});
    }
    if (path == '/v1/me/consent' && request.method == 'POST') {
      if (body['version'] != 'v-test' && body['version'] != 'us-test') return _json(400, {'ok': false, 'error': 'NOTICE_CHANGED'});
      if (body['version'] == 'v-test' && body['adult'] != true) return _json(400, {'ok': false, 'error': 'ADULT_REQUIRED'});
      noticeAccepted = true;
      consents.add('${body['document']}@${body['version']}');
      return _json(200, {'ok': true});
    }
    final exempt = path == '/v1/me' && request.method == 'GET' || path == '/v1/crash-reports' || path == '/v1/auth/logout';
    if (!noticeAccepted && !exempt) {
      return _json(403, {'ok': false, 'error': 'CONSENT_REQUIRED', 'document': 'privacy', 'version': 'v-test'});
    }
    if (path == '/v1/auth/logout') {
      logouts += 1;
      return _json(200, {'ok': true});
    }
    if (path == '/v1/crash-reports' && request.method == 'POST') {
      if (crashServerDown) return _json(500, {'ok': false, 'error': 'INTERNAL_ERROR'});
      final reports = (body['reports'] as List).cast<Map<String, Object?>>();
      crashReports.addAll(reports);
      return _json(200, {'ok': true, 'accepted': reports.length, 'refused': 0});
    }
    if (path == '/v1/funnel' && request.method == 'POST') {
      final steps = (body['steps'] as List).cast<Map<String, Object?>>();
      funnelSteps.addAll(steps);
      return _json(200, {'ok': true, 'accepted': steps.length, 'refused': 0});
    }
    if (path == '/v1/me/referral' && request.method == 'GET') {
      return _json(200, {'ok': true, 'code': 'AB2CD3EF', 'link': 'https://myca.example/r/AB2CD3EF', 'invited': referralInvited, 'converted': 0, 'reward': null});
    }
    if (path == '/v1/me/referral/claim' && request.method == 'POST') {
      final code = '${body['code']}'.toUpperCase();
      if (code == 'AB2CD3EF') return _json(200, {'ok': false, 'error': 'OWN_CODE'});
      if (claimedCodes.isNotEmpty) return _json(200, {'ok': false, 'error': 'ALREADY_CLAIMED'});
      claimedCodes.add(code);
      return _json(200, {'ok': true});
    }
    if (path == '/v1/me' && request.method == 'GET') {
      return _json(200, {
        'ok': true,
        'user': {'id': 'u1', 'name': userName},
        'consent': {'document': 'privacy', 'version': 'v-test', 'accepted': noticeAccepted},
        'businesses': businesses,
        'invitations': myInvitations,
      });
    }
    if (path == '/v1/me' && request.method == 'PATCH') {
      userName = '${body['name']}'.trim();
      return _json(200, {'ok': true, 'name': userName});
    }
    if (path == '/v1/me/second-step' && request.method == 'GET') {
      return _json(200, {'ok': true, 'enabled': twoStepEnabled, 'enabledAt': twoStepEnabled ? '2026-10-01T09:00:00.000Z' : null, 'recoveryCodesLeft': twoStepEnabled ? recoveryLeft : 0});
    }
    if (path == '/v1/me/second-step/begin' && request.method == 'POST') {
      if (twoStepEnabled) return _json(409, {'ok': false, 'error': 'ALREADY_ENABLED'});
      enrolling = true;
      enrolAttempts = 0;
      return _json(200, {'ok': true, 'secret': totpSecret, 'uri': totpUri, 'account': '+919876543210'});
    }
    if (path == '/v1/me/second-step/confirm' && request.method == 'POST') {
      if (!enrolling || twoStepEnabled) return _json(400, {'ok': false, 'error': 'NOT_ENROLLING'});
      enrolAttempts += 1;
      if (body['code'] != totpCode) {
        if (enrolAttempts < 5) return _json(400, {'ok': false, 'error': 'INVALID_CODE', 'attemptsRemaining': 5 - enrolAttempts});
        enrolling = false;
        return _json(400, {'ok': false, 'error': 'ENROLMENT_RESTART'});
      }
      enrolling = false;
      twoStepEnabled = true;
      recoveryLeft = freshRecoveryCodes.length;
      return _json(200, {'ok': true, 'recoveryCodes': freshRecoveryCodes});
    }
    if ((path == '/v1/me/second-step/disable' || path == '/v1/me/second-step/recovery-codes') && request.method == 'POST') {
      if (!twoStepEnabled) return _json(400, {'ok': false, 'error': 'NOT_ENABLED'});
      if (changeTries >= 5) return _json(429, {'ok': false, 'error': 'TOO_MANY_ATTEMPTS'});
      if (!_codeOk(body['code'])) {
        changeTries += 1;
        return _json(400, {'ok': false, 'error': 'INVALID_CODE', 'attemptsRemaining': 5 - changeTries});
      }
      changeTries = 0;
      if (path.endsWith('/disable')) {
        twoStepEnabled = false;
        recoveryLeft = 0;
        return _json(200, {'ok': true});
      }
      recoveryLeft = freshRecoveryCodes.length;
      return _json(200, {'ok': true, 'recoveryCodes': freshRecoveryCodes});
    }
    if (path == '/v1/me/devices' && request.method == 'GET') {
      return _json(200, {'ok': true, 'devices': devices});
    }
    if (path == '/v1/me/devices/sign-out-others' && request.method == 'POST') {
      signedOutOthers += 1;
      final others = devices.where((d) => d['current'] != true).toList();
      for (final device in others) {
        revoked.add('${device['id']}');
      }
      devices.removeWhere((d) => d['current'] != true);
      return _json(200, {'ok': true, 'revoked': others.length});
    }
    final signOut = RegExp(r'^/v1/me/devices/([^/]+)/sign-out$').firstMatch(path);
    if (signOut != null && request.method == 'POST') {
      final id = signOut.group(1);
      final found = devices.where((d) => d['id'] == id).toList();
      if (found.isEmpty) return _json(404, {'ok': false, 'error': 'DEVICE_NOT_FOUND'});
      if (found.single['current'] == true) return _json(409, {'ok': false, 'error': 'CURRENT_DEVICE'});
      devices.remove(found.single);
      revoked.add('$id');
      return _json(200, {'ok': true});
    }
    final answer = RegExp(r'^/v1/invitations/([^/]+)/(accept|decline)$').firstMatch(path);
    if (answer != null) {
      final found = myInvitations.where((i) => i['id'] == answer.group(1)).toList();
      if (found.isEmpty) return _json(404, {'ok': false, 'error': 'INVITATION_NOT_FOUND'});
      myInvitations.remove(found.single);
      if (answer.group(2) == 'decline') return _json(200, {'ok': true, 'declined': true});
      role = '${found.single['role']}';
      company = {'name': found.single['businessName'], 'gstin': '', 'state': '29'};
      final joined = {'id': businessId, 'name': found.single['businessName'], 'gstin': '', 'role': role};
      businesses.add(joined);
      return _json(200, {'ok': true, 'business': joined});
    }
    if (path == '/v1/businesses' && request.method == 'GET') return _json(200, {'ok': true, 'businesses': businesses});
    if (path == '/v1/businesses' && request.method == 'POST') {
      if (body['demo'] == true) {
        company = {'name': 'Demo: Kaveri Traders', 'gstin': '29AAACD0000D1ZL', 'state': '29'};
        final demo = {'id': businessId, 'name': 'Demo: Kaveri Traders', 'gstin': '29AAACD0000D1ZL', 'role': 'owner', 'demo': true};
        businesses.add(demo);
        return _json(200, {'ok': true, 'business': demo, 'seeded': 12});
      }
      final gstin = '${body['gstin'] ?? ''}';
      if (body['country'] == 'US') {
        final household = body['kind'] == 'household';
        company = {'name': body['name'], 'gstin': '', 'state': '', 'country': 'US', if (household) 'entityType': 'household'};
        final made = {'id': businessId, 'name': body['name'], 'gstin': '', 'role': 'owner', 'country': 'US', 'kind': household ? 'household' : 'business'};
        businesses.add(made);
        createdBodies.add(Map<String, Object?>.from(body));
        return _json(200, {'ok': true, 'business': made});
      }
      if (body['kind'] == 'household') return _json(400, {'ok': false, 'error': 'HOUSEHOLD_US_ONLY'});
      if (gstin.isEmpty && body['state'] == null) return _json(400, {'ok': false, 'error': 'STATE_REQUIRED'});
      if (gstin == '27AABCU9603R1ZX') return _json(400, {'ok': false, 'error': 'INVALID_GSTIN'});
      company = {'name': body['name'], 'gstin': gstin, 'state': body['state'] ?? gstin.substring(0, 2)};
      final created = {'id': businessId, 'name': body['name'], 'gstin': gstin, 'role': 'owner'};
      businesses.add(created);
      return _json(200, {'ok': true, 'business': created});
    }
    if (path == '/v1/reference/states') {
      return _json(200, {
        'ok': true,
        'states': [
          {'code': '29', 'name': 'Karnataka'},
          {'code': '27', 'name': 'Maharashtra'},
        ],
      });
    }
    final books = '/v1/businesses/$businessId';
    if (path == '$books/members' && request.method == 'GET') {
      return _json(200, {
        'ok': true,
        'members': [
          {'id': 'u1', 'name': userName, 'role': role},
          ...members,
        ],
        'invitations': role == 'owner' ? openInvites : const <Object?>[],
      });
    }
    if (path == '$books/invitations' && request.method == 'POST') {
      final phone = '${body['phone']}'.replaceAll(' ', '');
      if (!RegExp(r'^(\+91)?[6-9]\d{9}$').hasMatch(phone)) return _json(400, {'ok': false, 'error': 'INVALID_PHONE'});
      invited.add('$phone:${body['role']}');
      final open = {'id': 'inv-${invited.length}', 'phoneHint': 'xxxxxxx${phone.substring(phone.length - 3)}', 'role': body['role']};
      openInvites.add(open);
      return _json(200, {'ok': true, 'invitation': open});
    }
    if (path.startsWith('$books/invitations/') && request.method == 'DELETE') {
      openInvites.removeWhere((i) => path.endsWith('/${i['id']}'));
      return _json(200, {'ok': true});
    }
    if (path == '$books/inbound' && request.method == 'GET') {
      return _json(200, {'ok': true, 'keys': inboundKeys});
    }
    if (path == '$books/inbound' && request.method == 'POST') {
      final key = {'id': 'key-${inboundKeys.length + 1}', 'label': body['label'], 'source': body['source'], 'enabled': true, 'todayCount': 0, 'todayTotal': 0, 'email': body['source'] == 'documents' ? 'tok${inboundKeys.length + 1}abcdefg@inbox.example.test' : ''};
      inboundKeys.add(key);
      return _json(200, {'ok': true, 'key': {...key, 'secret': 'mk_testsecret${inboundKeys.length}'}});
    }
    if (path == '$books/connectors' && request.method == 'GET') {
      if (role != 'owner') return _json(403, {'ok': false, 'error': 'OWNER_ONLY'});
      if (connectorsUnavailable) return _json(200, connectorsOff);
      return _json(200, {'ok': true, 'enabled': true, 'pulls': pullsOn, 'connectors': [for (final channel in connectorSpecs.keys) _connectorView(channel)]});
    }
    if (path == '$books/connectors' && request.method == 'POST') {
      if (role != 'owner') return _json(403, {'ok': false, 'error': 'OWNER_ONLY'});
      if (connectorsUnavailable) return _json(200, connectorsOff);
      connectorSaves.add(body);
      final channel = '${body['channel']}';
      if (!connectorSpecs.containsKey(channel)) return _json(200, {'ok': false, 'error': 'UNKNOWN_CHANNEL', 'hint': 'Choose a listed channel.'});
      final values = connectorValues.putIfAbsent(channel, () => {});
      for (final field in (connectorSpecs[channel]!['fields'] as List).cast<String>()) {
        if (body[field] is String && '${body[field]}'.isNotEmpty) values[field] = '${body[field]}';
      }
      if (body['enabled'] is bool) connectorEnabled[channel] = body['enabled'] as bool;
      return _json(200, {'ok': true, ..._connectorView(channel)});
    }
    if (path == '$books/gst-portal' && request.method == 'GET') {
      if (role == 'staff') return _json(403, {'ok': false, 'error': 'NOT_FOR_STAFF'});
      return _json(200, {
        'ok': true,
        'available': gstPortalAvailable,
        if (!gstPortalAvailable) 'reason': 'GSP_KEYS_MISSING',
        'mode': 'test',
        'simulated': false,
        'sessions': [for (final row in gstPortalSessions.values) row],
      });
    }
    if (path == '$books/gst-portal' && request.method == 'POST') {
      final gstin = '${body['gstin'] ?? '29ABCDE1234F1Z5'}';
      if (body['step'] == 'otp') {
        if ('${body['username'] ?? ''}'.isEmpty) return _json(200, {'ok': false, 'error': 'USERNAME_REQUIRED', 'hint': 'Enter the GST portal username of this GSTIN.'});
        gstPortalSessions[gstin] = {'gstin': gstin, 'username': body['username'], 'connected': false, 'waitingForOtp': true, 'needsReconnect': false, 'lastError': ''};
        return _json(200, {'ok': true, 'gstin': gstin, 'otpSent': true, 'hint': 'The GST portal sent an OTP to the phone and email registered for this GSTIN.'});
      }
      if (body['step'] == 'verify') {
        if (body['otp'] != '575757') return _json(200, {'ok': false, 'error': 'OTP_REFUSED', 'hint': 'The GST portal did not accept that OTP.'});
        gstPortalSessions[gstin] = {...gstPortalSessions[gstin]!, 'connected': true, 'waitingForOtp': false, 'expiresAt': '2026-11-09T18:00:00.000Z'};
        return _json(200, {'ok': true, ...gstPortalSessions[gstin]!});
      }
      if (body['step'] == 'disconnect') {
        gstPortalSessions.remove(gstin);
        return _json(200, {'ok': true, 'gstin': gstin, 'disconnected': true});
      }
    }
    if (path == '$books/quicko' && request.method == 'GET') {
      return _json(200, {'ok': true, 'available': true, 'simulated': false, 'tools': const ['read_form16'], 'sessions': quickoSessions});
    }
    if (path == '$books/quicko' && request.method == 'POST') {
      final tool = '${body['tool']}';
      final args = (body['args'] as Map?)?.cast<String, Object?>() ?? const <String, Object?>{};
      quickoCalls.add({'tool': tool, ...args});
      if (tool == 'read_form16') {
        if (!uploads.containsKey(args['documentSha256'])) return _json(200, {'ok': false, 'error': 'DOCUMENT_NOT_FOUND'});
        return _json(200, {'ok': true, 'mode': 'test', 'simulated': false, 'data': {
          'summary': {
            'assessmentYear': '2026-27',
            'employer': {'name': 'Acme Pvt Ltd', 'tan': 'BLRA12345B'},
            'employee': {'pan': 'ABCDE1234F', 'name': 'Asha Rao'},
            'figuresAsPrinted': {'totalTaxableIncome': 1725000, 'netTaxPayable': 180000, 'grossTotalIncome': null},
          },
          'note': 'Every figure is as printed.',
        }});
      }
      if (tool == 'check_206ab') {
        if (args['consent'] != true) return _json(200, {'ok': false, 'error': 'CONSENT_REQUIRED'});
        return _json(200, {'ok': true, 'mode': 'test', 'data': {'pan': args['pan'], 'name': 'KIRAN TRADERS', 'specifiedPerson': 'no', 'panStatus': 'operative'}});
      }
      if (tool == 'verify_bank_account') {
        if ('${args['ifsc']}'.length != 11) return _json(200, {'ok': false, 'error': 'INVALID_IFSC'});
        return _json(200, {'ok': true, 'mode': 'test', 'data': {'accountEndsWith': '${args['accountNumber']}'.substring('${args['accountNumber']}'.length - 4), 'result': {'account_exists': true, 'name_at_bank': 'KIRAN TRADERS'}}});
      }
      return _json(200, {'ok': false, 'error': 'UNKNOWN_TOOL'});
    }
    if (path == '$books/quicko-session' && request.method == 'POST') {
      if (body['step'] == 'disconnect') {
        quickoSessions.clear();
        return _json(200, {'ok': true, 'portal': 'itd', 'disconnected': true});
      }
      if (body['password'] != 'right-password') return _json(200, {'ok': false, 'error': 'PORTAL_SIGN_IN_REFUSED'});
      quickoSessions
        ..clear()
        ..add({'portal': 'itd', 'subject': body['pan'], 'connected': true, 'expiresAt': '2026-11-09T18:00:00.000Z'});
      return _json(200, {'ok': true, 'portal': 'itd', 'subject': body['pan'], 'connected': true});
    }
    if (path == '$books/approvals' && request.method == 'GET') {
      return _json(200, {'ok': true, 'approvals': filingApprovals});
    }
    if (path == '$books/approvals' && request.method == 'POST') {
      if (body['approvalId'] != null) {
        final found = filingApprovals.where((a) => a['approvalId'] == body['approvalId']).toList();
        if (found.isEmpty) return _json(200, {'ok': false, 'error': 'APPROVAL_NOT_FOUND'});
        if (!approverIsSomeoneElse) return _json(200, {'ok': false, 'error': 'MAKER_CHECKER_VIOLATION'});
        found.first['status'] = 'approved';
        return _json(200, {'ok': true, 'approval': found.first});
      }
      final approval = <String, Object?>{'approvalId': 'APR-${filingApprovals.length + 1}', 'operation': body['operation'], 'params': {'period': body['period'], 'gstin': body['gstin']}, 'status': 'pending'};
      filingApprovals.add(approval);
      return _json(200, {'ok': true, 'approval': approval});
    }
    if ((path == '$books/gst-gstr1' || path == '$books/gst-gstr3b') && request.method == 'POST' && filingNeedsApproval && body['step'] != 'check' && body['step'] != 'summary' && body['step'] != 'liability') {
      final operation = '${path.endsWith('gstr3b') ? 'gstr3b' : 'gstr1'}_${body['step']}';
      final approved = filingApprovals.any((a) => a['approvalId'] == body['caApprovalId'] && a['operation'] == operation && a['status'] == 'approved');
      if (!approved) {
        (path.endsWith('gstr3b') ? gstr3bSteps : gstr1Steps).add({...body, 'refused': true});
        return _json(200, {'ok': false, 'error': 'CA_APPROVAL_REQUIRED'});
      }
    }
    if (path == '$books/gst-gstr1' && request.method == 'POST') {
      gstr1Steps.add(body);
      final step = body['step'];
      if (step == 'save') return _json(200, {'ok': true, 'save': {'referenceId': 'REF-1'}});
      if (step == 'check') return _json(200, {'ok': true, 'processing': 'processed'});
      if (step == 'submit') return _json(200, {'ok': true, 'submittedOn': '2026-11-09'});
      if (step == 'summary') return _json(200, {'ok': true, 'sections': [{'section': 'B2B', 'records': 2, 'value': 20000, 'tax': 3600}]});
      if (step == 'otp') return _json(200, {'ok': true, 'sent': true});
      if (step == 'file') return _json(200, {'ok': true, 'ackNum': 'AA2711260012345', 'simulated': filingSimulated});
    }
    if (path == '$books/gst-gstr3b' && request.method == 'POST') {
      gstr3bSteps.add(body);
      final step = body['step'];
      if (step == 'save') return _json(200, {'ok': true, 'save': {'referenceId': 'REF-3B'}, 'sections': {'outward': {'txval': 12000, 'iamt': 240, 'camt': 250, 'samt': 250, 'csamt': 0}, 'credit': {'iamt': 0, 'camt': 100, 'samt': 100, 'csamt': 0}}});
      if (step == 'liability') return _json(200, {'ok': true, 'liability': {}});
      if (step == 'offset') return _json(200, {'ok': true, 'creditUsed': 200, 'cashPaid': 540});
      if (step == 'otp') return _json(200, {'ok': true, 'sent': true});
      if (step == 'file') return _json(200, {'ok': true, 'ackNum': 'AA2711260099999'});
    }
    if (path == '$books/plaid-link-token') {
      plaidLinkTokens += 1;
      if ((connectorValues['plaid'] ?? const {})['clientId'] == null) return _json(200, {'ok': false, 'error': 'CONNECTOR_NOT_CONFIGURED', 'hint': 'Save the Plaid client id and secret first.'});
      return _json(200, {'ok': true, 'data': {'linkToken': 'link-sandbox-token-$plaidLinkTokens', 'environment': 'sandbox', 'mock': true}});
    }
    if (path == '$books/plaid-exchange') {
      plaidExchanges.add('${body['publicToken']}');
      connectorValues.putIfAbsent('plaid', () => {})
        ..['accessToken'] = 'access-sandbox-1'
        ..['itemId'] = 'item-sandbox-1';
      return _json(200, {'ok': true, 'data': {'channel': 'plaid', 'itemId': 'item-sandbox-1', 'linkedOn': '2026-10-21'}});
    }
    if (path == '$books/gusto-connect') {
      gustoConnects += 1;
      return _json(200, {'ok': true, 'data': {'url': 'https://api.gusto-demo.com/oauth/authorize?client_id=demo&state=abc', 'redirectUri': 'https://api.example.test/v1/gusto/callback'}});
    }
    if (path == '$books/taxjar-rate') {
      taxjarLookups.add(body);
      if (!RegExp(r'^\d{5}(-\d{4})?$').hasMatch('${body['zip']}')) return _json(200, {'ok': false, 'error': 'BAD_ZIP', 'hint': 'A US zip code is five digits, optionally plus four.'});
      return _json(200, {'ok': true, 'data': {'code': 'TX-AUSTIN', 'name': 'Austin, TX', 'ratePercent': 8.25, 'parts': {'state': 6.25, 'county': 0, 'city': 1, 'special': 1}, 'recorded': true}});
    }
    if (path == '$books/connector-sync') {
      connectorSyncs += 1;
      final results = <Map<String, Object?>>[];
      for (final channel in connectorValues.keys) {
        if (_connectorView(channel)['configured'] != true) continue;
        for (final kind in (connectorSpecs[channel]!['kinds'] as List).cast<String>()) {
          results.add({'channel': channel, 'kind': kind, 'ok': true, 'rows': kind == 'bank' ? 12 : 3, 'empty': false, 'dryRun': !pullsOn});
          if (pullsOn) connectorFetchedTo[channel] = '2026-10-21';
        }
      }
      if (results.isEmpty) return _json(200, {'ok': false, 'error': 'NO_CONNECTORS', 'hint': 'Connect a channel first.'});
      return _json(200, {'ok': true, 'data': {'fetched': '2026-10-21', 'results': results}});
    }
    if (path.startsWith('$books/inbound/') && request.method == 'DELETE') {
      final id = path.split('/').last;
      disabledKeys.add(id);
      for (final k in inboundKeys) {
        if (k['id'] == id) k['enabled'] = false;
      }
      return _json(200, {'ok': true});
    }
    if (path.startsWith('$books/members/') && request.method == 'PATCH') {
      final id = path.split('/').last;
      roleChanges.add('$id:${body['role']}');
      for (final m in members) {
        if (m['id'] == id) m['role'] = body['role'];
      }
      return _json(200, {'ok': true, 'role': body['role'], 'was': 'staff'});
    }
    if (path == '$books/replace' && request.method == 'POST') {
      replaced.add(body);
      return _json(200, {'ok': true, 'replaced': true, 'restored': {'invoices': 2, 'clients': 0, 'documents': 1}});
    }
    if (path == '$books/export' && request.method == 'GET') {
      exports += 1;
      return _json(200, {'ok': true, 'exportedAt': '2026-10-15T10:00:00.000Z', 'business': {'id': businessId, 'name': 'Asha Traders', 'gstin': ''}, 'members': const <Object?>[], 'connections': const <Object?>[], 'books': {'company': company}, 'documents': const <String, Object?>{}, 'audit': const <Object?>[]});
    }
    if (path == '/v1/businesses/$businessId' && request.method == 'DELETE') {
      deletedBusinesses.add(businessId);
      businesses.clear();
      return _json(200, {'ok': true, 'deleted': true});
    }
    if (path == '/v1/me' && request.method == 'DELETE') {
      accountDeleted = true;
      return _json(200, {'ok': true});
    }
    if (path.startsWith('$books/members/') && request.method == 'DELETE') {
      final id = path.split('/').last;
      removed.add(id);
      members.removeWhere((m) => m['id'] == id);
      return _json(200, {'ok': true});
    }
    if (path == '$books/snapshot') {
      return _json(200, {
        'ok': true,
        'company': company,
        'invoices': invoices,
        'purchases': const <Object?>[],
        'role': role,
        'user': {'id': 'u1', 'name': userName.isEmpty ? 'Asha' : userName},
        if (role == 'accountant' && caMode != 'live') 'sharedAsOf': sharedAsOf,
      });
    }
    if (path == '$books/brief' && request.method == 'GET') {
      return _json(200, {'ok': true, 'weekly': weeklyBrief, 'channel': 'whatsapp', 'when': 'Monday 07:00 IST'});
    }
    if (path == '$books/brief' && request.method == 'POST') {
      if (role == 'accountant') return _json(403, {'ok': false, 'error': 'NOT_FOR_ACCOUNTANTS'});
      weeklyBrief = body['weekly'] == true;
      briefChanges.add(weeklyBrief);
      return _json(200, {'ok': true, 'weekly': weeklyBrief, 'channel': 'whatsapp', 'when': 'Monday 07:00 IST'});
    }
    if (path == '$books/ca-sync' && request.method == 'GET') {
      return _json(200, {'ok': true, 'mode': caMode, 'sharedAsOf': caMode == 'live' ? null : sharedAsOf});
    }
    if (path == '$books/ca-sync' && request.method == 'POST') {
      caMode = '${body['mode']}';
      sharedAsOf = caMode == 'live' ? '' : '2026-10-07T09:30:00.000Z';
      return _json(200, {'ok': true, 'mode': caMode, 'sharedAsOf': caMode == 'live' ? null : sharedAsOf});
    }
    if (path == '$books/ca-share') {
      shares += 1;
      sharedAsOf = '2026-10-07T12:45:00.000Z';
      return _json(200, {'ok': true, 'sharedAsOf': sharedAsOf});
    }
    if (path == '$books/query') {
      return _json(200, switch (body['name']) {
        'expense_heads' => {'ok': true, 'data': const <Object?>[]},
        'business_summary' => {'ok': false, 'error': 'X'},
        'credit_at_risk' => {'ok': false, 'error': 'X'},
        'books_check' => {'ok': false, 'error': 'X'},
        'list_reminders' => {'ok': false, 'error': 'X'},
        'cash_forecast' => {'ok': false, 'error': 'X'},
        'list_ca_requests' => {'ok': false, 'error': 'X'},
        'gst_period_summary' => {
            'ok': true,
            'data': {
              'period': '2026-10',
              'periods': const <Object?>[],
              'salesCount': 0,
              'purchaseCount': 0,
              'taxableSales': 0,
              'outputTax': {'igst': 0, 'cgst': 0, 'sgst': 0, 'total': 0},
              'inputCredit': {'igst': 0, 'cgst': 0, 'sgst': 0, 'total': 0},
              'gstr1': {'fp': '102026', 'b2b': 0, 'b2cl': 0, 'b2cs': 0, 'held': const <Object?>[], 'warnings': const <Object?>[], 'caveat': ''},
            },
          },
        'deadlines' => {'ok': true, 'data': {'deadlines': const <Object?>[]}},
        _ => {'ok': true, 'data': {'exceptions': const <Object?>[]}},
      });
    }
    if (path == '$books/uploads') {
      final content = '${body['content'] ?? ''}';
      if (content.isEmpty) return _json(200, {'ok': false, 'error': 'EMPTY_FILE'});
      uploads['hash-${uploads.length + 1}'] = content;
      return _json(200, {'ok': true, 'sha256': 'hash-${uploads.length}', 'bytes': content.length});
    }
    if (path == '$books/propose') {
      final args = (body['args'] as Map?) ?? const {};
      if ('${body['name']}'.startsWith('import_')) {
        if (!uploads.containsKey(args['documentSha256'])) return _json(400, {'ok': false, 'error': 'IMPORT_NEEDS_UPLOAD'});
        imports.add('${body['name']}:${args['documentSha256']}');
        return _json(200, {
          'reply': 'Import preview',
          'posted': false,
          'awaitingConfirmation': true,
          'preview': {'token': 'abc123abc123', 'summary': 'Tally import: 12 vouchers ready, 1 skipped.', 'effects': const <Object?>[]},
        });
      }
      return _json(200, {
        'reply': 'Invoice preview',
        'posted': false,
        'awaitingConfirmation': true,
        'preview': {'token': 'abc123abc123', 'summary': 'Invoice to Kiran: total ₹9,440.00.', 'effects': const <Object?>[]},
      });
    }
    if (path == '$books/confirm') {
      invoices.add({'id': 'INV-0001', 'date': '2026-10-06', 'partyName': 'Kiran', 'partyGstin': '', 'total': 9440, 'status': 'posted'});
      return _json(200, {'reply': 'Posted INV-0001 to Kiran for ₹9,440.00.', 'posted': true, 'confirmed': true});
    }
    return _json(404, {'ok': false, 'error': 'NOT_FOUND'});
  }
}
