import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:myca_design/myca_design.dart' show Bahi;

import '../test/us_walk.dart';
import 'fonts.dart';

const darkWidths = [320.0, 390.0, 430.0];

void main() {
  Bahi.live = false;
  setUpAll(loadFonts);
  final only = Platform.environment['US_SIZES'] ?? '';
  final scales = (Platform.environment['US_SCALES'] ?? '1.0,2.0').split(',').map(double.parse);
  final guidelines = Platform.environment['US_GUIDELINES'] == '1';
  final modes = (Platform.environment['US_MODES'] ?? 'light,dark').split(',');

  for (final mode in modes) {
    final dark = mode == 'dark';
    for (final device in usDevices) {
      if (only.isNotEmpty && !only.split(',').contains(device.size)) continue;
      if (dark && !darkWidths.contains(device.width)) continue;
      for (final scale in scales) {
        final tag = '${dark ? 'dark-' : ''}${device.size}@${scale}x';
        testWidgets('every US screen fits a ${device.name} (${device.size}) at ${scale}x text in $mode mode', (tester) async {
          final folder = '../build/us_sizes/$tag';
          final problems = await walkUs(tester, device, scale, folder: folder, capture: autoUpdateGoldenFiles, guidelines: guidelines, dark: dark);
          if (problems.isNotEmpty) {
            File('build/us_sizes/$tag.problems.txt')
              ..createSync(recursive: true)
              ..writeAsStringSync(problems.join('\n'));
          }
          expect(problems, isEmpty, reason: problems.join('\n'));
        });
      }
    }
  }
}
