import 'dart:io';

import 'package:flutter/services.dart';

Future<void> loadFonts() async {
  final flutterRoot = Platform.environment['FLUTTER_ROOT']!;
  final dir = '$flutterRoot/bin/cache/artifacts/material_fonts';
  Future<ByteData> bytes(String name) async {
    final file = Directory(dir).listSync().whereType<File>().firstWhere((f) => f.uri.pathSegments.last.toLowerCase() == name.toLowerCase());
    return ByteData.view((await file.readAsBytes()).buffer);
  }
  final roboto = FontLoader('Roboto');
  for (final file in ['roboto-regular.ttf', 'roboto-medium.ttf', 'roboto-bold.ttf', 'roboto-black.ttf']) {
    roboto.addFont(bytes(file));
  }
  await roboto.load();
  final inter = FontLoader('Inter');
  for (final file in ['Inter-Regular.ttf', 'Inter-Medium.ttf', 'Inter-SemiBold.ttf']) {
    inter.addFont(File('assets/fonts/$file').readAsBytes().then((data) => ByteData.view(data.buffer)));
  }
  await inter.load();
  final icons = FontLoader('MaterialIcons')..addFont(bytes('materialicons-regular.otf'));
  await icons.load();
}
