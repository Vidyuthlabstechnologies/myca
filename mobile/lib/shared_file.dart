import 'package:flutter/services.dart';

import 'app_services.dart';

typedef TakeSharedFile = Future<PickedFile?> Function();

const sharedFileChannel = MethodChannel('in.myca/share');

class SharedFileTooLarge implements Exception {
  const SharedFileTooLarge();
}

const sharedFileLimitBytes = 8 * 1024 * 1024;

Future<PickedFile?> noSharedFile() async => null;

Future<PickedFile?> takeSharedFileFromDevice() async {
  try {
    final taken = await sharedFileChannel.invokeMethod<Map<Object?, Object?>>('take');
    if (taken == null) return null;
    if (taken['tooLarge'] == true) throw const SharedFileTooLarge();
    final bytes = taken['bytes'];
    if (bytes is! Uint8List || bytes.isEmpty) return null;
    final name = '${taken['name'] ?? 'shared'}';
    return PickedFile(name: name, mime: '${taken['mime'] ?? mimeOfName(name)}', bytes: bytes);
  } on MissingPluginException {
    return null;
  } on PlatformException {
    return null;
  }
}
