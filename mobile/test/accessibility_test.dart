import 'package:flutter_test/flutter_test.dart';

import 'screen_walks.dart';

void main() {
  for (final entry in screens.entries) {
    testWidgets('${entry.key}: every tap target is big enough and labelled, and text has enough contrast', (tester) async {
      await phone(tester);
      await open(tester);
      await entry.value(tester);
      final handle = tester.ensureSemantics();
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      handle.dispose();
    });

    testWidgets('${entry.key}: at the largest type size nothing overflows', (tester) async {
      await phone(tester, textScale: 2.0);
      await open(tester);
      await entry.value(tester);
      final error = tester.takeException();
      expect(error, isNull, reason: 'overflow or layout error at text scale 2.0: $error');
    });
  }
}
