// Dark mode for the UK and UAE apps (English and Arabic right to left), on a
// small phone and with large text. The India, US and Malaysia apps have their
// own dark runs (mobile_pass_test, us_dark_test, my_layout_test).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/theme.dart';

import 'uae_cloud_walks.dart';
import 'uae_fake_api.dart';
import 'uae_walks.dart';
import 'uk_fake_api.dart';
import 'uk_screens_test.dart' show pumpUkScreen, ukScreens;

void dark(WidgetTester tester) {
  tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
  addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
}

void main() {
  tearDown(() {
    moneyCountry = 'IN';
    Palette.brightness = Brightness.light;
  });

  for (final walk in {...uaeWalks, ...uaeEntryWalks, ...uaeTouchedWalks}.entries) {
    for (final language in ['en', 'ar']) {
      for (final (label, size, scale) in [('360x640', const Size(360, 640), 1.0), ('320x568', const Size(320, 568), 1.3)]) {
        testWidgets('UAE ${walk.key} $language at $label, ${scale}x text, dark', (tester) async {
          await uaeView(tester, size: size, language: language, textScale: scale);
          dark(tester);
          final api = await openUaeApp(tester);
          await walk.value(tester, api);
          expect(tester.takeException(), isNull);
          expect(Theme.of(tester.element(find.byType(Scaffold).last)).brightness, Brightness.dark);
        });
      }
    }
  }

  for (final walk in uaeCloudWalks.entries) {
    for (final language in ['en', 'ar']) {
      testWidgets('UAE ${walk.key} $language at 360x640, dark', (tester) async {
        await uaeView(tester, size: const Size(360, 640), language: language);
        dark(tester);
        await walk.value(tester);
        expect(tester.takeException(), isNull);
      });
    }
  }

  for (final screen in ukScreens.keys) {
    for (final (label, size, scale) in [('360x640', const Size(360, 640), 1.0), ('320x568', const Size(320, 568), 2.0)]) {
      testWidgets('UK $screen at $label, ${scale}x text, dark', (tester) async {
        await setUkView(tester, size, textScale: scale);
        dark(tester);
        Palette.brightness = Brightness.dark;
        final api = GbFakeApi()..connected = true;
        await pumpUkScreen(tester, screen, api);
        await scrollToEnd(tester);
        expect(tester.takeException(), isNull);
        expect(Theme.of(tester.element(find.byType(Scaffold).last)).brightness, Brightness.dark);
      });
    }
  }

  for (final language in ['en', 'ar']) {
    testWidgets('UAE home in $language keeps text readable in dark mode', (tester) async {
      await uaeView(tester, language: language);
      dark(tester);
      await openUaeApp(tester);
      await expectLater(tester, meetsGuideline(textContrastGuideline));
    });
  }

  testWidgets('UK hub keeps text readable in dark mode', (tester) async {
    await setUkView(tester, const Size(390, 844));
    dark(tester);
    Palette.brightness = Brightness.dark;
    await pumpUkScreen(tester, ukScreens.keys.first, GbFakeApi()..connected = true);
    await expectLater(tester, meetsGuideline(textContrastGuideline));
  });
}
