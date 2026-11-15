import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../api/myca_api.dart';

const appleSignInFailed = 'Apple sign-in did not finish. Check your connection and try again.';

class AppleCredential {
  const AppleCredential({required this.idToken, required this.rawNonce, this.givenName = '', this.familyName = ''});

  final String idToken;
  final String rawNonce;
  final String givenName;
  final String familyName;
}

abstract class AppleAuth {
  Future<AppleCredential?> credential();
}

String appleNonceHash(String rawNonce) => sha256.convert(utf8.encode(rawNonce)).toString();

String appleRawNonce([Random? random]) {
  final source = random ?? Random.secure();
  return base64UrlEncode(List<int>.generate(32, (_) => source.nextInt(256))).replaceAll('=', '');
}

bool appleSignInOffered({required TargetPlatform platform, required String edition, bool webFlowConfigured = false}) {
  if (edition != 'US') return false;
  if (platform == TargetPlatform.iOS) return true;
  return platform == TargetPlatform.android && webFlowConfigured;
}

class DeviceAppleAuth implements AppleAuth {
  DeviceAppleAuth({Random? random}) : _random = random ?? Random.secure();

  final Random _random;

  @override
  Future<AppleCredential?> credential() async {
    final rawNonce = appleRawNonce(_random);
    try {
      final found = await SignInWithApple.getAppleIDCredential(
        scopes: const [AppleIDAuthorizationScopes.email, AppleIDAuthorizationScopes.fullName],
        nonce: appleNonceHash(rawNonce),
      );
      final idToken = found.identityToken ?? '';
      if (idToken.isEmpty) throw const MycaApiException(appleSignInFailed);
      return AppleCredential(idToken: idToken, rawNonce: rawNonce, givenName: found.givenName ?? '', familyName: found.familyName ?? '');
    } on SignInWithAppleAuthorizationException catch (err) {
      if (err.code == AuthorizationErrorCode.canceled) return null;
      throw const MycaApiException(appleSignInFailed);
    } on SignInWithAppleException {
      throw const MycaApiException(appleSignInFailed);
    }
  }
}
