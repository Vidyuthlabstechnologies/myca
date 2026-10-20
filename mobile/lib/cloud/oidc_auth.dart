import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;

import '../api/myca_api.dart';

typedef OpenInBrowser = Future<bool> Function(Uri url);

const oidcRedirectUri = 'com.mldynamic.myca://oidc';
const oidcTimeout = Duration(minutes: 2);
const oidcFailed = 'Could not finish the sign-in.';

class OidcRequest {
  const OidcRequest({required this.url, required this.state, required this.nonce});

  final Uri url;
  final String state;
  final String nonce;
}

class OidcAuth {
  OidcAuth({
    required this.clientId,
    required this.open,
    required this.links,
    http.Client? client,
    Random? random,
    this.timeout = oidcTimeout,
  }) : _client = client ?? http.Client(),
       _random = random ?? Random.secure();

  final String clientId;
  final OpenInBrowser open;
  final Stream<Uri> links;
  final http.Client _client;
  final Random _random;
  final Duration timeout;

  static String discoveryUrl(String issuer) => '${issuer.replaceFirst(RegExp(r'/+$'), '')}/.well-known/openid-configuration';

  Future<Uri> authorizationEndpoint(String issuer) async {
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
    final endpoint = body is Map ? Uri.tryParse('${body['authorization_endpoint'] ?? ''}') : null;
    if (endpoint == null || endpoint.scheme != 'https' || endpoint.host.isEmpty) throw const MycaApiException(oidcFailed);
    return endpoint;
  }

  String token() => base64UrlEncode(List<int>.generate(24, (_) => _random.nextInt(256))).replaceAll('=', '');

  OidcRequest request(Uri endpoint) {
    final state = token();
    final nonce = token();
    final url = endpoint.replace(
      queryParameters: {
        ...endpoint.queryParameters,
        'response_type': 'id_token',
        'scope': 'openid email profile',
        'response_mode': 'fragment',
        'client_id': clientId,
        'redirect_uri': oidcRedirectUri,
        'state': state,
        'nonce': nonce,
      },
    );
    return OidcRequest(url: url, state: state, nonce: nonce);
  }

  static Map<String, String> fragmentOf(Uri link) {
    if (link.fragment.isEmpty) return const {};
    try {
      return Uri.splitQueryString(link.fragment);
    } on FormatException {
      return const {};
    }
  }

  static bool isRedirect(Uri link) => link.scheme == 'com.mldynamic.myca' && link.host == 'oidc';

  static String? idTokenFrom(Uri link, OidcRequest request) {
    if (!isRedirect(link)) return null;
    final fragment = fragmentOf(link);
    if (fragment['state'] != request.state) return null;
    final idToken = fragment['id_token'] ?? '';
    if (idToken.isEmpty || nonceOf(idToken) != request.nonce) return null;
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
    final endpoint = await authorizationEndpoint(issuer);
    final request = this.request(endpoint);
    final answer = Completer<String?>();
    void finish(String? token) {
      if (!answer.isCompleted) answer.complete(token);
    }

    final subscription = links.listen(
      (link) {
        final token = idTokenFrom(link, request);
        if (token != null) finish(token);
      },
      onError: (Object _) {},
      onDone: () => finish(null),
    );
    final timer = Timer(timeout, () => finish(null));
    try {
      if (!await open(request.url)) throw const MycaApiException(oidcFailed);
      final idToken = await answer.future;
      if (idToken == null) throw const MycaApiException(oidcFailed);
      return idToken;
    } finally {
      timer.cancel();
      unawaited(subscription.cancel());
    }
  }
}
