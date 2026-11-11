import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/oidc_auth.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';
import 'fake_cloud.dart';

const issuer = 'https://login.firm.example';

String idTokenWithNonce(String nonce) {
  String part(Map<String, Object?> json) => base64UrlEncode(utf8.encode(jsonEncode(json))).replaceAll('=', '');
  return '${part({'alg': 'RS256'})}.${part({'sub': 'u1', 'nonce': nonce})}.sig';
}

class Provider {
  Provider({this.endpoint = 'https://login.firm.example/authorize', this.tokenEndpoint = 'https://login.firm.example/token', this.status = 200, this.methods = const ['S256'], this.tokenStatus = 200});

  final String endpoint;
  final String tokenEndpoint;
  final int status;
  final List<String>? methods;
  final int tokenStatus;
  final challenges = <String, String>{};
  final nonces = <String, String>{};
  final exchanges = <Map<String, String>>[];

  late final http.Client client = MockClient((request) async {
    if (request.url.toString() == '$issuer/.well-known/openid-configuration') {
      return http.Response(
        jsonEncode({'issuer': issuer, 'authorization_endpoint': endpoint, 'token_endpoint': tokenEndpoint, 'code_challenge_methods_supported': ?methods}),
        status,
        headers: {'content-type': 'application/json'},
      );
    }
    if (request.method == 'POST' && request.url.toString() == tokenEndpoint) {
      final form = Uri.splitQueryString(request.body);
      exchanges.add(form);
      final code = form['code'] ?? '';
      if (tokenStatus != 200) return http.Response('{"error":"server_error"}', tokenStatus);
      if (form['grant_type'] != 'authorization_code' || form['redirect_uri'] != 'com.mldynamic.myca://oidc' || form['client_id'] != 'myca-mobile') {
        return http.Response('{"error":"invalid_request"}', 400);
      }
      if (challenges[code] == null || OidcAuth.challengeOf(form['code_verifier'] ?? '') != challenges[code]) {
        return http.Response('{"error":"invalid_grant"}', 400);
      }
      return http.Response(jsonEncode({'id_token': idTokenWithNonce(nonces[code]!), 'token_type': 'Bearer'}), 200, headers: {'content-type': 'application/json'});
    }
    return http.Response('', 404);
  });

  Uri redirectFor(Uri opened, {String? state, String? nonce, String code = 'code-1'}) {
    final q = opened.queryParameters;
    challenges[code] = q['code_challenge']!;
    nonces[code] = nonce ?? q['nonce']!;
    return Uri.parse('com.mldynamic.myca://oidc?code=$code&state=${state ?? q['state']}');
  }
}

class Browser {
  Browser({this.answer = true, this.reply});

  final bool answer;
  final Uri? Function(Uri opened)? reply;
  final opened = <Uri>[];
  final links = StreamController<Uri>.broadcast();

  Future<bool> open(Uri url) async {
    opened.add(url);
    final link = reply?.call(url);
    if (link != null) scheduleMicrotask(() => links.add(link));
    return answer;
  }
}

OidcAuth auth(Browser browser, {Provider? provider, Duration timeout = const Duration(minutes: 2)}) =>
    OidcAuth(clientId: 'myca-mobile', open: browser.open, links: browser.links.stream, client: (provider ?? Provider()).client, random: Random(7), timeout: timeout);

AppState hosted(FakeCloud cloud, OidcAuth oidc) => AppState(
  cloud: CloudSession(baseUrl: 'https://api.example.test', tokens: MemoryTokenStore(), client: cloud.client),
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => null,
  now: () => DateTime(2026, 10, 7, 10),
  oidc: oidc,
);

void main() {
  test('discovery reads the authorization and token endpoints from the issuer\'s well-known document', () async {
    expect(OidcAuth.discoveryUrl('https://login.firm.example/'), 'https://login.firm.example/.well-known/openid-configuration');
    final found = await auth(Browser()).endpoints(issuer);
    expect(found.authorization.toString(), 'https://login.firm.example/authorize');
    expect(found.token.toString(), 'https://login.firm.example/token');
    final unlisted = await auth(Browser(), provider: Provider(methods: null)).endpoints(issuer);
    expect(unlisted.token.toString(), 'https://login.firm.example/token');
  });

  test('an issuer that does not answer, uses plain http, or cannot do S256 PKCE is refused', () async {
    await expectLater(auth(Browser(), provider: Provider(status: 500)).endpoints(issuer), throwsA(isA<MycaApiException>()));
    await expectLater(auth(Browser(), provider: Provider(endpoint: 'http://login.firm.example/authorize')).endpoints(issuer), throwsA(isA<MycaApiException>()));
    await expectLater(auth(Browser(), provider: Provider(tokenEndpoint: 'http://login.firm.example/token')).endpoints(issuer), throwsA(isA<MycaApiException>()));
    await expectLater(auth(Browser(), provider: Provider(methods: ['plain'])).endpoints(issuer), throwsA(isA<MycaApiException>()));
  });

  test('the authorization URL asks for a code with an S256 challenge, a fresh state and a nonce', () {
    final a = auth(Browser());
    final request = a.request(Uri.parse('https://login.firm.example/authorize?tenant=t1'));
    final q = request.url.queryParameters;
    expect(q['tenant'], 't1');
    expect(q['response_type'], 'code');
    expect(q['scope'], 'openid email profile');
    expect(q.containsKey('response_mode'), isFalse);
    expect(q['client_id'], 'myca-mobile');
    expect(q['redirect_uri'], 'com.mldynamic.myca://oidc');
    expect(q['state'], request.state);
    expect(q['nonce'], request.nonce);
    expect(q['code_challenge_method'], 'S256');
    expect(q['code_challenge'], OidcAuth.challengeOf(request.verifier));
    expect(q.values, isNot(contains(request.verifier)));
    expect(request.verifier.length, inInclusiveRange(43, 128));
    expect(RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(request.verifier), isTrue);
    expect(request.state.length, greaterThanOrEqualTo(32));
    expect(request.state, isNot(request.nonce));
    final again = a.request(request.url);
    expect(again.state, isNot(request.state));
    expect(again.verifier, isNot(request.verifier));
  });

  test('the S256 challenge matches the RFC 7636 example', () {
    expect(OidcAuth.challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  test('only a redirect to the app with the matching state yields the code', () {
    final provider = Provider();
    final request = auth(Browser(), provider: provider).request(Uri.parse('https://login.firm.example/authorize'));
    final opened = request.url;
    expect(OidcAuth.codeFrom(provider.redirectFor(opened), request), 'code-1');
    expect(OidcAuth.codeFrom(provider.redirectFor(opened, state: 'other'), request), isNull);
    expect(OidcAuth.codeFrom(Uri.parse('com.mldynamic.myca://oidc?state=${request.state}'), request), isNull);
    expect(OidcAuth.codeFrom(Uri.parse('https://example.com/oidc?code=x&state=${request.state}'), request), isNull);
    expect(OidcAuth.codeFrom(Uri.parse('com.mldynamic.myca://share'), request), isNull);
  });

  test('the sign-in opens the browser, swaps the code with the verifier and returns the id token', () async {
    final provider = Provider();
    final browser = Browser(reply: provider.redirectFor);
    final token = await auth(browser, provider: provider).idToken(issuer);
    expect(browser.opened.single.host, 'login.firm.example');
    expect(OidcAuth.nonceOf(token), browser.opened.single.queryParameters['nonce']);
    final exchange = provider.exchanges.single;
    expect(exchange['code'], 'code-1');
    expect(OidcAuth.challengeOf(exchange['code_verifier']!), browser.opened.single.queryParameters['code_challenge']);
  });

  test('a token whose nonce does not match, or a failed exchange, is refused', () async {
    final provider = Provider();
    final browser = Browser(reply: (opened) => provider.redirectFor(opened, nonce: 'other'));
    await expectLater(auth(browser, provider: provider).idToken(issuer), throwsA(isA<MycaApiException>()));
    final failing = Provider(tokenStatus: 500);
    await expectLater(auth(Browser(reply: failing.redirectFor), provider: failing).idToken(issuer), throwsA(isA<MycaApiException>()));
  });

  test('a redirect for a different request is ignored and the sign-in times out', () async {
    final provider = Provider();
    final browser = Browser(reply: (opened) => provider.redirectFor(opened, state: 'stale'));
    await expectLater(auth(browser, provider: provider, timeout: const Duration(milliseconds: 20)).idToken(issuer), throwsA(isA<MycaApiException>()));
    expect(provider.exchanges, isEmpty);
  });

  test('a browser that will not open fails at once', () async {
    final browser = Browser(answer: false);
    await expectLater(auth(browser).idToken(issuer), throwsA(isA<MycaApiException>()));
  });

  testWidgets('when the firm has an identity provider the sign-in screen offers it by host and signs in with the id token', (tester) async {
    final cloud = FakeCloud()
      ..phoneOn = false
      ..googleOn = false
      ..oidcOn = true;
    final provider = Provider();
    final browser = Browser(reply: provider.redirectFor);
    cloud.oidcToken = idTokenWithNonce('pending');
    await tester.pumpWidget(MycaApp(state: hosted(cloud, auth(browser, provider: provider))));
    await tester.pumpAndSettle();
    expect(find.text('Sign in with your firm\'s account (login.firm.example)'), findsOneWidget);
    expect(find.text('Continue with Google'), findsNothing);
    expect(find.text('Use the account your firm gave you. No new password to remember.'), findsOneWidget);

    browser.links.stream.listen((_) => cloud.oidcToken = idTokenWithNonce(browser.opened.last.queryParameters['nonce']!));
    await tester.tap(find.text('Sign in with your firm\'s account (login.firm.example)'));
    await tester.pumpAndSettle();
    expect(browser.opened.single.queryParameters['client_id'], 'myca-mobile');
    expect(cloud.requests, contains('POST /v1/auth/oidc'));
    expect(cloud.deviceLabels, ['Android']);
    expect(find.text('Tell us about the business'), findsOneWidget);
  });

  testWidgets('when no link comes back the screen says so and stays signed out', (tester) async {
    final cloud = FakeCloud()..oidcOn = true;
    final browser = Browser();
    await tester.pumpWidget(MycaApp(state: hosted(cloud, auth(browser, timeout: const Duration(seconds: 1)))));
    await tester.pumpAndSettle();
    expect(find.text('Or use your mobile number'), findsOneWidget);
    await tester.tap(find.text('Sign in with your firm\'s account (login.firm.example)'));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(find.text('Could not finish the sign-in.'), findsOneWidget);
    expect(cloud.requests, isNot(contains('POST /v1/auth/oidc')));
    expect(find.widgetWithText(TextField, 'Mobile number'), findsOneWidget);
  });

  testWidgets('without the OIDC client id built in, the firm button is not shown even when the API offers it', (tester) async {
    final cloud = FakeCloud()..oidcOn = true;
    await tester.pumpWidget(
      MycaApp(
        state: AppState(
          cloud: CloudSession(baseUrl: 'https://api.example.test', tokens: MemoryTokenStore(), client: cloud.client),
          store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
          pickTextFile: (_) async => null,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('firm\'s account'), findsNothing);
    expect(find.widgetWithText(TextField, 'Mobile number'), findsOneWidget);
  });
}
