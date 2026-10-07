import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class FakeCloud {
  static const code = '428913';
  static const challengeId = '11111111-1111-4111-8111-111111111111';
  static const businessId = '22222222-2222-4222-8222-222222222222';

  final requests = <String>[];
  final businesses = <Map<String, Object?>>[];
  final invoices = <Map<String, Object?>>[];
  final uploads = <String, String>{};
  final imports = <String>[];
  final myInvitations = <Map<String, Object?>>[];
  final members = <Map<String, Object?>>[];
  final openInvites = <Map<String, Object?>>[];
  final invited = <String>[];
  final removed = <String>[];
  final crashReports = <Map<String, Object?>>[];
  bool crashServerDown = false;
  bool noticeAccepted = true;
  bool phoneOn = true;
  bool googleOn = true;
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

  late final http.Client client = MockClient(_handle);

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

    if (path == '/v1/privacy-notice') {
      return _json(200, {
        'ok': true,
        'notice': {
          'document': 'privacy',
          'version': 'v-test',
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
      return _json(200, {'ok': true, 'phone': phoneOn, 'google': googleOn});
    }
    if (path == '/v1/auth/google') {
      if (body['idToken'] != 'google-id-token') return _json(400, {'ok': false, 'error': 'INVALID_GOOGLE_TOKEN'});
      if (userName.isEmpty) userName = 'Asha Rao';
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
      return _json(200, {
        ..._issue(),
        'user': {'id': 'u1', 'name': userName, 'isNew': businesses.isEmpty},
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
    if (path == '/v1/me/consent' && request.method == 'POST') {
      if (body['version'] != 'v-test') return _json(400, {'ok': false, 'error': 'NOTICE_CHANGED'});
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
      final gstin = '${body['gstin'] ?? ''}';
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
      });
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
