import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/theme.dart';
import 'package:myca_design/myca_design.dart' show Bahi;

import '../test/devices.dart';
import '../test/screen_walks.dart';
import 'fonts.dart';

String slug(String name) => name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '-').replaceAll(RegExp(r'^-|-$'), '');

void main() {
  Bahi.live = false;
  setUpAll(loadFonts);
  setUp(() => Palette.brightness = Brightness.light);

  final variants = [
    for (final device in devices) (device, 1.0, Brightness.light, slug(device.name)),
    (mediumPhone, 1.0, Brightness.dark, 'dark-${slug(mediumPhone.name)}'),
    (mediumPhone, 2.0, Brightness.light, 'text-2x-${slug(mediumPhone.name)}'),
    (compactPhone, 2.0, Brightness.light, 'text-2x-${slug(compactPhone.name)}'),
  ];
  for (final (device, scale, brightness, folder) in variants) {
    group(folder, () {
      for (final entry in screens.entries) {
        testWidgets(entry.key, (tester) async {
          useDevice(tester, device, textScale: scale, brightness: brightness);
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = device.logical;
          await open(tester);
          await entry.value(tester);
          await tester.pumpAndSettle();
          await expectLater(find.byType(MaterialApp), matchesGoldenFile('gallery/$folder/${slug(entry.key)}.png'));
        });
      }
    });
  }
}
