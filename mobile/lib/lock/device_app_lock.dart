import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';

import 'app_lock.dart';

class DeviceAppLock implements AppLock {
  DeviceAppLock();

  final _auth = LocalAuthentication();

  @override
  Future<bool> available() async {
    try {
      return await _auth.isDeviceSupported();
    } on PlatformException {
      return false;
    }
  }

  @override
  Future<bool> unlock(String reason) async {
    try {
      return await _auth.authenticate(localizedReason: reason, persistAcrossBackgrounding: true);
    } on PlatformException {
      return false;
    } on Exception {
      return false;
    }
  }
}
