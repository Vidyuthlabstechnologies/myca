import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';

import 'uk_fake_api.dart';
import 'uk_screens_test.dart' show ukScreens;

void main() {
  for (final screen in ukScreens.entries) {
    testWidgets('${screen.key}: every tap target is big enough and labelled, and text has enough contrast', (tester) async {
      await setUkView(tester, const Size(393, 851));
      final api = GbFakeApi()..connected = true;
      await pumpUk(tester, api, screen.value.$1());
      await screen.value.$2(tester, api);
      final handle = tester.ensureSemantics();
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      handle.dispose();
    });
  }

  testWidgets('the UK home: every tap target is big enough and labelled', (tester) async {
    await setUkView(tester, const Size(393, 851));
    useFakeDevice();
    await tester.pumpWidget(MycaApp(state: gbState(GbFakeApi()..connected = true)));
    await tester.pumpAndSettle();
    final handle = tester.ensureSemantics();
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    handle.dispose();
  });
}
