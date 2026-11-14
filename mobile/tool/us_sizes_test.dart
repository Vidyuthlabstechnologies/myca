import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:myca_design/myca_design.dart' show Bahi;

import '../test/us_walk.dart';
import 'fonts.dart';

void main() {
  Bahi.live = false;
  setUpAll(loadFonts);
  final only = Platform.environment['US_SIZES'] ?? '';
  final scales = (Platform.environment['US_SCALES'] ?? '1.0,2.0').split(',').map(double.parse);
  final guidelines = Platform.environment['US_GUIDELINES'] == '1';

  for (final device in usDevices) {
    if (only.isNotEmpty && !only.split(',').contains(device.size)) continue;
    for (final scale in scales) {
      testWidgets('every US screen fits a ${device.name} (${device.size}) at ${scale}x text', (tester) async {
        final folder = '../build/us_sizes/${device.size}@${scale}x';
        final problems = await walkUs(tester, device, scale, folder: folder, capture: autoUpdateGoldenFiles, guidelines: guidelines);
        if (problems.isNotEmpty) {
          File('build/us_sizes/${device.size}@${scale}x.problems.txt')
            ..createSync(recursive: true)
            ..writeAsStringSync(problems.join('\n'));
        }
        expect(problems, isEmpty, reason: problems.join('\n'));
      });
    }
  }
}
