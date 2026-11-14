import 'package:flutter_test/flutter_test.dart';

import 'devices.dart';
import 'screen_walks.dart';

void main() {
  final runs = [
    for (final device in devices) (device, 1.0),
    (mediumPhone, 1.3),
    (compactPhone, 2.0),
    (foldCover, 2.0),
    (phoneLandscape, 2.0),
    (tabletLandscape, 2.0),
  ];
  for (final (device, scale) in runs) {
    group('${device.name} at ${scale}x text', () {
      for (final entry in screens.entries) {
        testWidgets('${entry.key}: nothing overflows', (tester) async {
          useDevice(tester, device, textScale: scale);
          await open(tester);
          await entry.value(tester);
          await tester.pumpAndSettle();
          final error = tester.takeException();
          expect(error, isNull, reason: '$error');
        });
      }
    });
  }
}
