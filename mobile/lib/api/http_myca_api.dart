import 'dart:convert';

import 'package:http/http.dart' as http;

import '../app_config.dart';
import 'models.dart';
import 'myca_api.dart';

class HttpMycaApi implements MycaApi {
  HttpMycaApi(this.config, {http.Client? client})
    : _client = client ?? http.Client();

  static const _timeout = Duration(seconds: 20);

  final AppConfig config;
  final http.Client _client;

  Map<String, String> get _headers => {
    'content-type': 'application/json',
    'x-myca-client': config.clientToken,
  };

  Uri _uri(String path) => Uri.parse('${config.baseUrl}$path');

  String _unreachableMessage() {
    if (config.baseUrl.contains('127.0.0.1') || config.baseUrl.contains('localhost')) {
      return 'Cannot reach MyCA. Check the desktop app is running and adb reverse tcp:4780 tcp:4780 is set, or use the hosted sign-in.';
    }
    return 'Cannot reach MyCA. Check your connection and try again.';
  }

  Future<Object?> _decode(Future<http.Response> pending) async {
    final http.Response response;
    try {
      response = await pending.timeout(_timeout);
    } on Exception {
      throw MycaApiException(_unreachableMessage());
    }
    Object? body;
    try {
      body = jsonDecode(utf8.decode(response.bodyBytes));
    } on FormatException {
      body = null;
    }
    if (response.statusCode != 200) {
      final error = body is Map ? body['error'] : null;
      throw MycaApiException(
        error == null
            ? 'MyCA returned ${response.statusCode}.'
            : error.toString(),
      );
    }
    if (body == null) {
      throw const MycaApiException(
        'MyCA returned an unreadable reply. Update the desktop app and try again.',
      );
    }
    return body;
  }

  Future<Object?> _get(String path) =>
      _decode(_client.get(_uri(path), headers: _headers));

  Future<Object?> _post(String path, Map<String, Object?> body) => _decode(
    _client.post(_uri(path), headers: _headers, body: jsonEncode(body)),
  );

  @override
  Future<Snapshot> snapshot() async =>
      Snapshot.fromJson(await _get('/api/snapshot'));

  @override
  Future<SignInResult> signIn(String userId, String pin) async =>
      SignInResult.fromJson(
        await _post('/api/session/login', {'userId': userId, 'pin': pin}),
      );

  @override
  Future<void> signOut() async {
    await _post('/api/session/logout', const {});
  }

  @override
  Future<ChatReply> chat(String message) async =>
      ChatReply.fromJson(await _post('/api/chat', {'message': message}));

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async =>
      ChatReply.fromJson(
        await _post('/api/propose', {'name': name, 'args': args}),
      );

  @override
  Future<ChatReply> confirm(String token) async =>
      ChatReply.fromJson(await _post('/api/confirm', {'token': token}));

  @override
  Future<ChatReply> discard() async =>
      ChatReply.fromJson(await _post('/api/discard', const {}));

  @override
  Future<String> upload(String name, String content) async {
    checkUploadSize(content);
    return uploadedHash(await _post('/api/upload', {'name': name, 'content': content}));
  }

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) =>
      _post('/api/query', {'name': name, 'args': args});

  @override
  Future<ToolOutcome> updateCompany({
    required String name,
    String gstin = '',
  }) async => ToolOutcome.fromJson(
    await _post('/api/company', {
      'name': name,
      if (gstin.isNotEmpty) 'gstin': gstin,
    }),
  );
}
