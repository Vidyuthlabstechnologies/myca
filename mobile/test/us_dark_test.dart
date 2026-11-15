import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';
import 'package:myca/theme.dart';
import 'package:myca/us/us_text_scaler.dart';
import 'package:myca/widgets.dart';
import 'package:myca_design/myca_design.dart' show Bahi, MycaPalette, MycaSurfaceColors;

import 'fake_api.dart';
import 'us_return_test.dart' show usState;
import 'us_walk.dart';
import '../tool/fonts.dart';

double _luminance(Color c) {
  double channel(double v) => v <= 0.04045 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

double contrast(Color a, Color b) {
  final la = _luminance(a);
  final lb = _luminance(b);
  return (la > lb ? la + 0.05 : lb + 0.05) / (la > lb ? lb + 0.05 : la + 0.05);
}

void main() {
  Bahi.live = false;
  setUpAll(loadFonts);

  test('the US dark theme meets WCAG AA for every text colour on every surface', () {
    final theme = usAppTheme(brightness: Brightness.dark);
    expect(theme.brightness, Brightness.dark);
    final p = theme.extension<MycaPalette>()!;
    for (final bg in [p.canvas, p.surface, p.sunken, p.accentSoft, p.warnSoft, p.dangerSoft]) {
      for (final fg in [p.ink, p.muted, p.accent, p.warn, p.danger]) {
        expect(contrast(fg, bg), greaterThanOrEqualTo(4.5), reason: '$fg on $bg');
      }
    }
    expect(contrast(usDarkHint, p.surface), greaterThanOrEqualTo(4.5));
    expect(contrast(usDarkHint, p.canvas), greaterThanOrEqualTo(4.5));
    expect(contrast(p.onInk, p.ink), greaterThanOrEqualTo(4.5));
    expect(theme.inputDecorationTheme.hintStyle?.color, usDarkHint);
    expect(p.surface, MycaSurfaceColors.dark.surface);
  });

  test('large text grows body copy fully but caps headings so words stay whole', () {
    const scaler = UsTextScaler(TextScaler.linear(2));
    expect(scaler.scale(14), 28);
    expect(scaler.scale(17), 34);
    expect(scaler.scale(21), 32);
    expect(scaler.scale(34), closeTo(39.1, 0.01));
    expect(const UsTextScaler(TextScaler.linear(1)).scale(34), 34);
    expect(const UsTextScaler(TextScaler.linear(0.85)).scale(34), closeTo(28.9, 0.01));
    expect(UsTextScaler.wrap(scaler), same(scaler));
    expect(scaler.textScaleFactor, 2);
    expect(wholeWords('Ready to e-file'), 'Ready to e‑file');
  });

  testWidgets('MyCA US follows the phone into dark mode and back', (tester) async {
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
    await tester.pumpWidget(MycaApp(state: usState(filledApi())));
    await tester.pumpAndSettle();
    final context = tester.element(find.text('Your 2025 federal return'));
    expect(Theme.of(context).brightness, Brightness.dark);
    expect(paletteOf(context).surface, MycaSurfaceColors.dark.surface);
    final panel = tester.widget<Material>(find.descendant(of: find.byType(RowCard).first, matching: find.byType(Material)).first);
    expect(panel.color, MycaSurfaceColors.dark.surface);
    expect(MediaQuery.textScalerOf(context), isA<UsTextScaler>());

    tester.platformDispatcher.platformBrightnessTestValue = Brightness.light;
    await tester.pumpAndSettle();
    expect(Theme.of(tester.element(find.text('Your 2025 federal return'))).brightness, Brightness.light);
  });

  testWidgets('MyCA India follows the phone into dark mode with its own palette', (tester) async {
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
    await tester.pumpWidget(MycaApp(state: AppState(api: FakeMycaApi(signedIn: true), store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true), pickTextFile: (_) async => null)));
    await tester.pumpAndSettle();
    final context = tester.element(find.byType(Scaffold).first);
    expect(Theme.of(context).brightness, Brightness.dark);
    expect(Theme.of(context).scaffoldBackgroundColor, PaletteSet.dark.canvas);
    expect(paletteOf(context).canvas, PaletteSet.dark.canvas);
    expect(paletteOf(context).accent, PaletteSet.dark.accent);
    expect(MediaQuery.textScalerOf(context), isNot(isA<UsTextScaler>()));
  });

  for (final (device, scale) in [(usDevices[0], 2.0), (usDevices[6], 1.0)]) {
    testWidgets('every US screen lays out in dark mode on a ${device.name} at ${scale}x text with whole-word headings', (tester) async {
      final problems = await walkUs(tester, device, scale, dark: true);
      expect(problems, isEmpty, reason: problems.join('\n'));
    });
  }
}
