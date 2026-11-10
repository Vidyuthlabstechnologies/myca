import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;

import '../api/myca_api.dart';

typedef OpenInBrowser = Future<bool> Function(Uri url);

const oidcRedirectUri = 'com.mldynamic.myca://oidc';
const oidcTimeout = Duration(minutes: 2);
const oidcFailed = 'Could not finish the sign-in.';

class OidcRequest {
  const OidcRequest({required this.url, required this.state, required this.nonce, required this.verifier});

  final Uri url;
  final String state;
  final String nonce;
  final String verifier;
}

class OidcEndpoints {
  const OidcEndpoints({required this.authorization, required this.token});

  final Uri authorization;
  final Uri token;
}

class OidcAuth {
  OidcAuth({required this.clientId, required this.open, required this.links, http.Client? client, Random? random, this.timeout = oidcTimeout})
    : _client = client ?? http.Client(),
      _random = random ?? Random.secure();

  final String clientId;
  final OpenInBrowser open;
  final Stream<Uri> links;
  final http.Client _client;
  final Random _random;
  final Duration timeout;

  static String discoveryUrl(String issuer) => '${issuer.replaceFirst(RegExp(r'/+$'), '')}/.well-known/openid-configuration';

  Future<OidcEndpoints> endpoints(String issuer) async {
    final http.Response response;
    try {
      response = await _client.get(Uri.parse(discoveryUrl(issuer))).timeout(const Duration(seconds: 20));
    } on Exception {
      throw const MycaApiException(oidcFailed);
    }
    if (response.statusCode != 200) throw const MycaApiException(oidcFailed);
    final Object? body;
    try {
      body = jsonDecode(response.body);
    } on FormatException {
      throw const MycaApiException(oidcFailed);
    }
    if (body is! Map) throw const MycaApiException(oidcFailed);
    final methods = body['code_challenge_methods_supported'];
    if (methods is List && !methods.contains('S256')) throw const MycaApiException(oidcFailed);
    return OidcEndpoints(authorization: _https(body['authorization_endpoint']), token: _https(body['token_endpoint']));
  }

  static Uri _https(Object? value) {
    final endpoint = Uri.tryParse('${value ?? ''}');
    if (endpoint == null || endpoint.scheme != 'https' || endpoint.host.isEmpty) throw const MycaApiException(oidcFailed);
    return endpoint;
  }

  String token([int bytes = 24]) => _b64(List<int>.generate(bytes, (_) => _random.nextInt(256)));

  static String _b64(List<int> bytes) => base64UrlEncode(bytes).replaceAll('=', '');

  static String challengeOf(String verifier) => _b64(sha256.convert(ascii.encode(verifier)).bytes);

  OidcRequest request(Uri endpoint) {
    final state = token();
    final nonce = token();
    final verifier = token(48);
    final url = endpoint.replace(
      queryParameters: {
        ...endpoint.queryParameters,
        'response_type': 'code',
        'scope': 'openid email profile',
        'client_id': clientId,
        'redirect_uri': oidcRedirectUri,
        'state': state,
        'nonce': nonce,
        'code_challenge': challengeOf(verifier),
        'code_challenge_method': 'S256',
      },
    );
    return OidcRequest(url: url, state: state, nonce: nonce, verifier: verifier);
  }

  static bool isRedirect(Uri link) => link.scheme == 'com.mldynamic.myca' && link.host == 'oidc';

  static String? codeFrom(Uri link, OidcRequest request) {
    if (!isRedirect(link)) return null;
    final query = link.queryParameters;
    if (query['state'] != request.state) return null;
    final code = query['code'] ?? '';
    return code.isEmpty ? null : code;
  }

  Future<String> exchange(Uri tokenEndpoint, String code, OidcRequest request) async {
    final http.Response response;
    try {
      response = await _client
          .post(
            tokenEndpoint,
            headers: {'accept': 'application/json'},
            body: {'grant_type': 'authorization_code', 'code': code, 'redirect_uri': oidcRedirectUri, 'client_id': clientId, 'code_verifier': request.verifier},
          )
          .timeout(const Duration(seconds: 20));
    } on Exception {
      throw const MycaApiException(oidcFailed);
    }
    if (response.statusCode != 200) throw const MycaApiException(oidcFailed);
    final Object? body;
    try {
      body = jsonDecode(response.body);
    } on FormatException {
      throw const MycaApiException(oidcFailed);
    }
    final idToken = body is Map ? '${body['id_token'] ?? ''}' : '';
    if (idToken.isEmpty || nonceOf(idToken) != request.nonce) throw const MycaApiException(oidcFailed);
    return idToken;
  }

  static String? nonceOf(String idToken) {
    final parts = idToken.split('.');
    if (parts.length != 3) return null;
    try {
      final payload = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))));
      return payload is Map ? '${payload['nonce'] ?? ''}' : null;
    } on FormatException {
      return null;
    }
  }

  Future<String> idToken(String issuer) async {
    final found = await endpoints(issuer);
    final request = this.request(found.authorization);
    final answer = Completer<String?>();
    void finish(String? token) {
      if (!answer.isCompleted) answer.complete(token);
    }

    final subscription = links.listen(
      (link) {
        final code = codeFrom(link, request);
        if (code != null) finish(code);
      },
      onError: (Object _) {},
      onDone: () => finish(null),
    );
    final timer = Timer(timeout, () => finish(null));
    try {
      if (!await open(request.url)) throw const MycaApiException(oidcFailed);
      final code = await answer.future;
      if (code == null) throw const MycaApiException(oidcFailed);
      return await exchange(found.token, code, request);
    } finally {
      timer.cancel();
      unawaited(subscription.cancel());
    }
  }
}
