import 'package:google_sign_in/google_sign_in.dart';

import '../api/myca_api.dart';

abstract class GoogleAuth {
  Future<String?> idToken();
  Future<void> signOut();
}

class DeviceGoogleAuth implements GoogleAuth {
  DeviceGoogleAuth(this.serverClientId);

  final String serverClientId;
  Future<void>? _ready;

  Future<void> _init() => _ready ??= GoogleSignIn.instance.initialize(
    serverClientId: serverClientId,
  );

  @override
  Future<String?> idToken() async {
    await _init();
    try {
      final account = await GoogleSignIn.instance.authenticate();
      return account.authentication.idToken;
    } on GoogleSignInException catch (err) {
      if (err.code == GoogleSignInExceptionCode.canceled) return null;
      throw const MycaApiException(
        'Google sign-in did not finish. Check your connection and try again.',
      );
    }
  }

  @override
  Future<void> signOut() async {
    await _init();
    await GoogleSignIn.instance.signOut();
  }
}
