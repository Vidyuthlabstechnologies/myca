import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca_design/myca_design.dart' show Bahi;

import '../test/uae_fake_api.dart';
import '../test/uae_walks.dart';

Future<void> loadUaeFonts() async {
  final flutterRoot = Platform.environment['FLUTTER_ROOT']!;
  final material = '$flutterRoot/bin/cache/artifacts/material_fonts';
  Future<ByteData> read(String path) async => ByteData.view((await File(path).readAsBytes()).buffer);
  Future<void> family(String name, List<String> paths) async {
    final loader = FontLoader(name);
    for (final path in paths) {
      loader.addFont(read(path));
    }
    await loader.load();
  }
  final materialFiles = Directory(material).listSync().whereType<File>().toList();
  String pick(String name) => materialFiles.firstWhere((f) => f.uri.pathSegments.last.toLowerCase() == name).path;
  await family('Roboto', [pick('roboto-regular.ttf'), pick('roboto-medium.ttf'), pick('roboto-bold.ttf')]);
  await family('MaterialIcons', [pick('materialicons-regular.otf')]);
  const inter = ['Inter-Regular.ttf', 'Inter-Medium.ttf', 'Inter-SemiBold.ttf'];
  await family('Inter', [for (final f in inter) 'assets/fonts/$f']);
  await family('packages/myca_design/Inter', [for (final f in inter) '../design/flutter/myca_design/assets/fonts/$f']);
  const arabic = ['NotoSansArabic-Regular.ttf', 'NotoSansArabic-Medium.ttf', 'NotoSansArabic-SemiBold.ttf'];
  await family('packages/myca_fonts_arabic/Noto Sans Arabic', [for (final f in arabic) '../design/flutter/myca_fonts_arabic/fonts/$f']);
}

void main() {
  Bahi.live = false;
  setUpAll(loadUaeFonts);
  tearDown(() => moneyCountry = 'IN');

  const shots = [('390x844', Size(390, 844)), ('800x1280', Size(800, 1280))];
  for (final walk in uaeWalks.entries) {
    for (final language in ['en', 'ar']) {
      for (final (label, size) in shots) {
        testWidgets('uae ${walk.key} $language $label', (tester) async {
          await uaeView(tester, size: size, language: language);
          tester.view.devicePixelRatio = 2;
          tester.view.physicalSize = size * 2;
          final api = await openUaeApp(tester);
          await walk.value(tester, api);
          await tester.pumpAndSettle();
          await expectLater(find.byType(MaterialApp), matchesGoldenFile('uae_screens/${walk.key}_${language}_$label.png'));
        });
      }
    }
  }
}
