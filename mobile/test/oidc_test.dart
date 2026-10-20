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

http.Client discovery({String endpoint = 'https://login.firm.example/authorize', int status = 200}) => MockClient((request) async {
  if (request.url.toString() == '$issuer/.well-known/openid-configuration') {
    return http.Response(jsonEncode({'issuer': issuer, 'authorization_endpoint': endpoint}), status, headers: {'content-type': 'application/json'});
  }
  return http.Response('', 404);
});

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

Uri redirectFor(Uri opened, {String? state, String? nonce, String? token}) {
  final q = opened.queryParameters;
  final idToken = token ?? idTokenWithNonce(nonce ?? q['nonce']!);
  return Uri.parse('com.mldynamic.myca://oidc#id_token=$idToken&state=${state ?? q['state']}');
}

OidcAuth auth(Browser browser, {http.Client? client, Duration timeout = const Duration(minutes: 2)}) => OidcAuth(
  clientId: 'myca-mobile',
  open: browser.open,
  links: browser.links.stream,
  client: client ?? discovery(),
  random: Random(7),
  timeout: timeout,
);

AppState hosted(FakeCloud cloud, OidcAuth oidc) => AppState(
  cloud: CloudSession(baseUrl: 'https://api.example.test', tokens: MemoryTokenStore(), client: cloud.client),
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => null,
  now: () => DateTime(2026, 10, 7, 10),
  oidc: oidc,
);

void main() {
  test('discovery reads the authorization endpoint from the issuer\'s well-known document', () async {
    expect(OidcAuth.discoveryUrl('https://login.firm.example/'), 'https://login.firm.example/.well-known/openid-configuration');
    final endpoint = await auth(Browser()).authorizationEndpoint(issuer);
    expect(endpoint.toString(), 'https://login.firm.example/authorize');
  });

  test('an issuer that does not answer, or answers with a plain-http endpoint, is refused', () async {
    await expectLater(auth(Browser(), client: discovery(status: 500)).authorizationEndpoint(issuer), throwsA(isA<MycaApiException>()));
    await expectLater(auth(Browser(), client: discovery(endpoint: 'http://login.firm.example/authorize')).authorizationEndpoint(issuer), throwsA(isA<MycaApiException>()));
  });

  test('the authorization URL carries the implicit id_token request with a fresh state and nonce', () {
    final a = auth(Browser());
    final request = a.request(Uri.parse('https://login.firm.example/authorize?tenant=t1'));
    final q = request.url.queryParameters;
    expect(q['tenant'], 't1');
    expect(q['response_type'], 'id_token');
    expect(q['scope'], 'openid email profile');
    expect(q['response_mode'], 'fragment');
    expect(q['client_id'], 'myca-mobile');
    expect(q['redirect_uri'], 'com.mldynamic.myca://oidc');
    expect(q['state'], request.state);
    expect(q['nonce'], request.nonce);
    expect(request.state.length, greaterThanOrEqualTo(32));
    expect(request.state, isNot(request.nonce));
    expect(a.request(request.url).state, isNot(request.state));
  });

  test('only a redirect with the matching state and nonce yields the id token', () {
    final request = auth(Browser()).request(Uri.parse('https://login.firm.example/authorize'));
    final opened = request.url;
    expect(OidcAuth.idTokenFrom(redirectFor(opened), request), idTokenWithNonce(request.nonce));
    expect(OidcAuth.idTokenFrom(redirectFor(opened, state: 'other'), request), isNull);
    expect(OidcAuth.idTokenFrom(redirectFor(opened, nonce: 'other'), request), isNull);
    expect(OidcAuth.idTokenFrom(redirectFor(opened, token: 'not-a-jwt'), request), isNull);
    expect(OidcAuth.idTokenFrom(Uri.parse('https://example.com/#id_token=x&state=${request.state}'), request), isNull);
    expect(OidcAuth.idTokenFrom(Uri.parse('com.mldynamic.myca://share'), request), isNull);
  });

  test('the sign-in opens the browser and resolves with the token from the redirect', () async {
    final browser = Browser(reply: (opened) => redirectFor(opened));
    final token = await auth(browser).idToken(issuer);
    expect(browser.opened.single.host, 'login.firm.example');
    expect(OidcAuth.nonceOf(token), browser.opened.single.queryParameters['nonce']);
  });

  test('a redirect for a different request is ignored and the sign-in times out', () async {
    final browser = Browser(reply: (opened) => redirectFor(opened, state: 'stale'));
    await expectLater(auth(browser, timeout: const Duration(milliseconds: 20)).idToken(issuer), throwsA(isA<MycaApiException>()));
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
    final browser = Browser(reply: (opened) => redirectFor(opened));
    cloud.oidcToken = '';
    await tester.pumpWidget(MycaApp(state: hosted(cloud, auth(browser))));
    await tester.pumpAndSettle();
    expect(find.text('Sign in with your firm\'s account (login.firm.example)'), findsOneWidget);
    expect(find.text('Continue with Google'), findsNothing);
    expect(find.text('Use the account your firm gave you. No new password to remember.'), findsOneWidget);

    browser.links.stream.listen((link) => cloud.oidcToken = OidcAuth.fragmentOf(link)['id_token'] ?? '');
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
