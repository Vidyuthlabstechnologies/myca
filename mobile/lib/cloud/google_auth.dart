import 'package:google_sign_in/google_sign_in.dart';

import '../api/myca_api.dart';

abstract class GoogleAuth {
  Future<String?> idToken();
  Future<void> signOut();
}

class GoogleFailure {
  const GoogleFailure(this.code, this.message);

  final String code;
  final String message;
}

const String _setupMessage = 'Google sign-in is not set up for this version of the app. Use your phone number for now and tell MyCA support.';

final RegExp _setupHint = RegExp(
  r'no credential|\[16\]|28444|developer console|sha-?1|client id|not configured|misconfigured',
  caseSensitive: false,
);

GoogleFailure? googleFailureFor(GoogleSignInExceptionCode code, String? description) {
  final setup = _setupHint.hasMatch(description ?? '');
  switch (code) {
    case GoogleSignInExceptionCode.canceled:
      return setup ? const GoogleFailure('GOOGLE_SETUP', _setupMessage) : null;
    case GoogleSignInExceptionCode.interrupted:
      return const GoogleFailure('GOOGLE_INTERRUPTED', 'Google sign-in was interrupted. Try again.');
    case GoogleSignInExceptionCode.clientConfigurationError:
    case GoogleSignInExceptionCode.providerConfigurationError:
      return const GoogleFailure('GOOGLE_SETUP', _setupMessage);
    case GoogleSignInExceptionCode.uiUnavailable:
      return const GoogleFailure('GOOGLE_UI', 'Google sign-in could not open. Close other windows and try again.');
    case GoogleSignInExceptionCode.userMismatch:
      return const GoogleFailure('GOOGLE_MISMATCH', 'Choose the same Google account you used before.');
    case GoogleSignInExceptionCode.unknownError:
      return setup
          ? const GoogleFailure('GOOGLE_SETUP', _setupMessage)
          : const GoogleFailure('GOOGLE_FAILED', 'Google sign-in did not finish. Check your connection and try again.');
  }
}

class DeviceGoogleAuth implements GoogleAuth {
  DeviceGoogleAuth(this.serverClientId);

  final String serverClientId;
  Future<void>? _ready;
  bool _busy = false;

  Future<void> _init() async {
    final pending = _ready ??= GoogleSignIn.instance.initialize(
      serverClientId: serverClientId,
    );
    try {
      await pending;
    } on Object {
      _ready = null;
      rethrow;
    }
  }

  @override
  Future<String?> idToken() async {
    if (_busy) return null;
    _busy = true;
    try {
      try {
        await _init();
      } on Object {
        throw const MycaApiException(
          'Google sign-in could not start. Check your connection and try again.',
          code: 'GOOGLE_INIT',
        );
      }
      try {
        final account = await GoogleSignIn.instance.authenticate();
        final token = account.authentication.idToken;
        if (token == null || token.isEmpty) {
          throw const MycaApiException(
            'Google did not return a sign-in token. Try again or use your phone number.',
            code: 'GOOGLE_NO_TOKEN',
          );
        }
        return token;
      } on GoogleSignInException catch (err) {
        final failure = googleFailureFor(err.code, err.description);
        if (failure == null) return null;
        throw MycaApiException(failure.message, code: failure.code);
      }
    } finally {
      _busy = false;
    }
  }

  @override
  Future<void> signOut() async {
    try {
      await _init();
      await GoogleSignIn.instance.signOut();
    } on Object {
      return;
    }
  }
}
