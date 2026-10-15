import 'dart:convert';

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
  'CONSENT_REQUIRED': 'Read and accept the privacy notice to continue.',
  'NOTICE_CHANGED': 'The privacy notice has changed. Read the new one and accept it.',
  'INVALID_PHONE': 'Enter a 10-digit Indian mobile number.',
  'TOO_MANY_REQUESTS': 'Too many codes requested. Try again in an hour.',
  'INVALID_CODE': 'That code is not right. Check the SMS and try again.',
  'CODE_EXPIRED': 'That code has expired. Ask for a new one.',
  'CODE_USED': 'That code was already used. Ask for a new one.',
  'TOO_MANY_ATTEMPTS': 'Too many wrong tries. Ask for a new code.',
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
};

String cloudMessage(String code) =>
    _messages[code] ?? 'Something went wrong ($code).';

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
  const InboundKey({required this.id, required this.label, required this.source, required this.enabled, this.todayCount = 0, this.todayTotal = 0, this.secret = ''});

  final String id;
  final String label;
  final String source;
  final bool enabled;
  final int todayCount;
  final num todayTotal;
  final String secret;
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
  const SignInMethods({required this.phone, required this.google});

  final bool phone;
  final bool google;
}

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
  String? _phone;
  Future<bool>? _refreshing;

  bool get signedIn => _refresh != null;
  bool get ready => signedIn && _businessId != null;
  bool get awaitingCode => _challengeId != null;
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
    return (
      response.statusCode,
      decoded is Map ? decoded.cast<String, dynamic>() : <String, dynamic>{},
    );
  }

  Future<bool> _rotate() {
    return _refreshing ??= () async {
      try {
        final refresh = _refresh;
        if (refresh == null) return false;
        final (status, body) = await _send('POST', '/v1/auth/refresh', {
          'refreshToken': refresh,
        }, authed: false);
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
      throw MycaApiException(cloudMessage(reply['error'] as String));
    }
    return reply;
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
      'deviceLabel': 'Android',
    }, authed: false);
    if (body['ok'] != true) {
      throw MycaApiException(cloudMessage('${body['error'] ?? 'UNKNOWN'}'));
    }
    await _keep(body);
    _challengeId = null;
    await _signedIn(body);
  }

  Future<SignInMethods> methods() async {
    try {
      final (status, body) = await _send('GET', '/v1/auth/methods', null, authed: false);
      if (status == 200 && body['ok'] == true) {
        return SignInMethods(phone: body['phone'] == true, google: body['google'] == true);
      }
    } on MycaApiException {
      return const SignInMethods(phone: true, google: true);
    }
    return const SignInMethods(phone: true, google: true);
  }

  Future<void> signInWithGoogle(String idToken) async {
    final (_, body) = await _send('POST', '/v1/auth/google', {
      'idToken': idToken,
      'deviceLabel': 'Android',
    }, authed: false);
    if (body['ok'] != true) {
      throw MycaApiException(cloudMessage('${body['error'] ?? 'UNKNOWN'}'));
    }
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
      if (signedIn) await _send('POST', '/v1/auth/logout', const {});
    } on MycaApiException {
      // Signing out must always work on the phone, even with no connection.
    }
    await _forget();
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
        ),
    ];
  }

  Future<InboundKey> createInboundKey(String label, String source) async {
    final body = await call('POST', '$_books/inbound', {'label': label, 'source': source});
    if (body['ok'] == false) throw MycaApiException(cloudMessage('${body['error']}'));
    final key = body['key'] as Map;
    return InboundKey(id: '${key['id']}', label: '${key['label']}', source: '${key['source']}', enabled: true, secret: '${key['secret']}');
  }

  Future<void> disableInboundKey(String id) => call('DELETE', '$_books/inbound/$id');

  Future<void> changeRole(String userId, String role) async {
    final body = await call('PATCH', '$_books/members/$userId', {'role': role});
    if (body['ok'] == false) throw MycaApiException(cloudMessage('${body['error']}'));
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
