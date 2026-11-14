import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';
import 'package:myca/theme.dart';
import 'package:myca/widgets.dart';

import 'devices.dart';
import 'fake_api.dart';
import 'screen_walks.dart';

void main() {
  setUp(() => Palette.brightness = Brightness.light);

  Color panelColor(WidgetTester tester) {
    final box = tester.widget<Container>(find.descendant(of: find.byType(Panel).first, matching: find.byType(Container)).first);
    return (box.decoration! as BoxDecoration).color!;
  }

  testWidgets('the app follows the phone into dark mode and back', (tester) async {
    useDevice(tester, mediumPhone, brightness: Brightness.dark);
    await open(tester);
    final page = find.byType(Scaffold).first;
    expect(Theme.of(tester.element(page)).brightness, Brightness.dark);
    expect(Theme.of(tester.element(page)).scaffoldBackgroundColor, PaletteSet.dark.canvas);
    expect(panelColor(tester), PaletteSet.dark.surface);
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.light;
    await tester.pumpAndSettle();
    expect(Theme.of(tester.element(page)).brightness, Brightness.light);
    expect(panelColor(tester), PaletteSet.light.surface);
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    await tester.pumpAndSettle();
    expect(panelColor(tester), PaletteSet.dark.surface);
  });

  testWidgets('a hosted app also starts in dark mode', (tester) async {
    useDevice(tester, mediumPhone, brightness: Brightness.dark);
    await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true))));
    await tester.pumpAndSettle();
    expect(Palette.brightness, Brightness.dark);
  });

  for (final entry in screens.entries) {
    testWidgets('${entry.key}: in dark mode text has enough contrast and nothing overflows', (tester) async {
      useDevice(tester, mediumPhone, brightness: Brightness.dark);
      await open(tester);
      await entry.value(tester);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final handle = tester.ensureSemantics();
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      handle.dispose();
    });
  }

}
