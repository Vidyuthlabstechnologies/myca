import 'package:flutter_test/flutter_test.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:myca/cloud/google_auth.dart';

void main() {
  test('a plain cancel stays silent', () {
    expect(googleFailureFor(GoogleSignInExceptionCode.canceled, 'User cancelled'), isNull);
    expect(googleFailureFor(GoogleSignInExceptionCode.canceled, null), isNull);
  });

  test('a cancel that is really a missing client setup is reported', () {
    for (final text in ['[16] Account reauth failed', 'No credential available', 'error 28444', 'SHA-1 mismatch']) {
      expect(googleFailureFor(GoogleSignInExceptionCode.canceled, text)?.code, 'GOOGLE_SETUP', reason: text);
    }
  });

  test('configuration errors say the app is not set up', () {
    expect(googleFailureFor(GoogleSignInExceptionCode.clientConfigurationError, null)?.code, 'GOOGLE_SETUP');
    expect(googleFailureFor(GoogleSignInExceptionCode.providerConfigurationError, null)?.code, 'GOOGLE_SETUP');
  });

  test('every other code maps to its own message', () {
    expect(googleFailureFor(GoogleSignInExceptionCode.interrupted, null)?.code, 'GOOGLE_INTERRUPTED');
    expect(googleFailureFor(GoogleSignInExceptionCode.uiUnavailable, null)?.code, 'GOOGLE_UI');
    expect(googleFailureFor(GoogleSignInExceptionCode.userMismatch, null)?.code, 'GOOGLE_MISMATCH');
    expect(googleFailureFor(GoogleSignInExceptionCode.unknownError, 'boom')?.code, 'GOOGLE_FAILED');
  });

  test('no code leaves a failure without a message', () {
    for (final code in GoogleSignInExceptionCode.values) {
      final failure = googleFailureFor(code, null);
      if (failure != null) expect(failure.message, isNotEmpty);
    }
  });
}
