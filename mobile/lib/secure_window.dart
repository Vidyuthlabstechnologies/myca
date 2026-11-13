import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

const secureWindowChannel = MethodChannel('in.myca/secure');

class SecureWindow {
  static int _holds = 0;

  static int get holds => _holds;

  static Future<void> hold() async {
    _holds += 1;
    if (_holds == 1) await _set(true);
  }

  static Future<void> release() async {
    if (_holds == 0) return;
    _holds -= 1;
    if (_holds == 0) await _set(false);
  }

  static Future<void> _set(bool on) async {
    try {
      await secureWindowChannel.invokeMethod<void>('set', on);
    } on MissingPluginException {
      return;
    } on PlatformException {
      return;
    }
  }
}

mixin SecureWindowWhileShown<T extends StatefulWidget> on State<T> {
  @override
  void initState() {
    super.initState();
    SecureWindow.hold();
  }

  @override
  void dispose() {
    SecureWindow.release();
    super.dispose();
  }
}
