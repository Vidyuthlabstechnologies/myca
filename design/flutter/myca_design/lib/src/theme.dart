import 'package:flutter/material.dart';

import 'country.dart';
import 'tokens.g.dart';

const mycaFontPackage = 'myca_design';
const mycaFontFamily = 'packages/$mycaFontPackage/${MycaFonts.brand}';
const moneyFigures = [FontFeature.tabularFigures()];

@immutable
class MycaPalette extends ThemeExtension<MycaPalette> {
  const MycaPalette({
    required this.canvas,
    required this.surface,
    required this.sunken,
    required this.ink,
    required this.onInk,
    required this.muted,
    required this.faint,
    required this.line,
    required this.accent,
    required this.accentSoft,
    required this.highlight,
    required this.warn,
    required this.warnSoft,
    required this.danger,
    required this.dangerSoft,
    required this.bahi,
  });

  factory MycaPalette.of(MycaCountry country, Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final s = dark ? MycaSurfaceColors.dark : MycaSurfaceColors.light;
    return MycaPalette(
      canvas: s.canvas,
      surface: s.surface,
      sunken: s.sunken,
      ink: s.ink,
      onInk: s.onInk,
      muted: s.muted,
      faint: s.faint,
      line: s.line,
      accent: dark ? country.look.accentDark : country.look.accent,
      accentSoft: dark ? country.look.accentSoftDark : country.look.accentSoft,
      highlight: country.look.highlight,
      warn: s.warn,
      warnSoft: s.warnSoft,
      danger: s.danger,
      dangerSoft: s.dangerSoft,
      bahi: MycaColors.bahiRed,
    );
  }

  final Color canvas;
  final Color surface;
  final Color sunken;
  final Color ink;
  final Color onInk;
  final Color muted;
  final Color faint;
  final Color line;
  final Color accent;
  final Color accentSoft;
  final Color highlight;
  final Color warn;
  final Color warnSoft;
  final Color danger;
  final Color dangerSoft;
  final Color bahi;

  @override
  MycaPalette copyWith({Color? accent, Color? accentSoft, Color? highlight}) => MycaPalette(
    canvas: canvas,
    surface: surface,
    sunken: sunken,
    ink: ink,
    onInk: onInk,
    muted: muted,
    faint: faint,
    line: line,
    accent: accent ?? this.accent,
    accentSoft: accentSoft ?? this.accentSoft,
    highlight: highlight ?? this.highlight,
    warn: warn,
    warnSoft: warnSoft,
    danger: danger,
    dangerSoft: dangerSoft,
    bahi: bahi,
  );

  @override
  MycaPalette lerp(MycaPalette? other, double t) {
    if (other == null) return this;
    Color mix(Color a, Color b) => Color.lerp(a, b, t)!;
    return MycaPalette(
      canvas: mix(canvas, other.canvas),
      surface: mix(surface, other.surface),
      sunken: mix(sunken, other.sunken),
      ink: mix(ink, other.ink),
      onInk: mix(onInk, other.onInk),
      muted: mix(muted, other.muted),
      faint: mix(faint, other.faint),
      line: mix(line, other.line),
      accent: mix(accent, other.accent),
      accentSoft: mix(accentSoft, other.accentSoft),
      highlight: mix(highlight, other.highlight),
      warn: mix(warn, other.warn),
      warnSoft: mix(warnSoft, other.warnSoft),
      danger: mix(danger, other.danger),
      dangerSoft: mix(dangerSoft, other.dangerSoft),
      bahi: mix(bahi, other.bahi),
    );
  }
}

@immutable
class MycaCountryTheme extends ThemeExtension<MycaCountryTheme> {
  const MycaCountryTheme(this.country);

  final MycaCountry country;

  @override
  MycaCountryTheme copyWith({MycaCountry? country}) => MycaCountryTheme(country ?? this.country);

  @override
  MycaCountryTheme lerp(MycaCountryTheme? other, double t) => t < 0.5 ? this : (other ?? this);
}

extension MycaThemeContext on BuildContext {
  MycaPalette get myca => Theme.of(this).extension<MycaPalette>() ?? MycaPalette.of(MycaCountry.of(null), Theme.of(this).brightness);

  MycaCountry get mycaCountry => Theme.of(this).extension<MycaCountryTheme>()?.country ?? MycaCountry.of(null);
}

TextStyle? _step(TextStyle? base, MycaTypeStep step, {Color? color}) => base?.copyWith(
  fontSize: step.size,
  fontWeight: step.weight,
  letterSpacing: step.tracking,
  height: step.leading,
  color: color,
);

ThemeData mycaTheme(
  MycaCountry country, {
  Brightness brightness = Brightness.light,
  List<String> fontFallback = const [],
}) {
  final p = MycaPalette.of(country, brightness);
  final scheme = ColorScheme.fromSeed(seedColor: p.accent, brightness: brightness).copyWith(
    primary: p.ink,
    onPrimary: p.onInk,
    secondary: p.accent,
    onSecondary: brightness == Brightness.dark ? p.onInk : Colors.white,
    secondaryContainer: p.accentSoft,
    onSecondaryContainer: p.accent,
    tertiary: p.highlight,
    surface: p.surface,
    onSurface: p.ink,
    onSurfaceVariant: p.muted,
    outline: p.line,
    outlineVariant: p.line,
    error: p.danger,
    errorContainer: p.dangerSoft,
    surfaceContainerHighest: p.sunken,
  );
  final base = ThemeData(
    colorScheme: scheme,
    brightness: brightness,
    useMaterial3: true,
    fontFamily: mycaFontFamily,
    fontFamilyFallback: fontFallback,
  );
  final text = base.textTheme.apply(bodyColor: p.ink, displayColor: p.ink);
  final control = RoundedRectangleBorder(borderRadius: BorderRadius.circular(MycaRadius.control));
  OutlineInputBorder field(Color color, [double width = 1]) => OutlineInputBorder(
    borderRadius: BorderRadius.circular(MycaRadius.control),
    borderSide: BorderSide(color: color, width: width),
  );
  final buttonText = text.labelLarge?.copyWith(fontSize: 15, fontWeight: FontWeight.w600);
  return base.copyWith(
    scaffoldBackgroundColor: p.canvas,
    extensions: [p, MycaCountryTheme(country)],
    splashFactory: InkSparkle.splashFactory,
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {TargetPlatform.android: FadeForwardsPageTransitionsBuilder()},
    ),
    textTheme: text.copyWith(
      displaySmall: _step(text.displaySmall, MycaType.display),
      headlineMedium: _step(text.headlineMedium, MycaType.headline),
      headlineSmall: _step(text.headlineSmall, MycaType.heading),
      titleLarge: _step(text.titleLarge, MycaType.title),
      titleMedium: _step(text.titleMedium, MycaType.subtitle),
      bodyLarge: _step(text.bodyLarge, MycaType.body),
      bodyMedium: _step(text.bodyMedium, MycaType.small, color: p.muted),
      bodySmall: _step(text.bodySmall, MycaType.caption, color: p.muted),
      labelLarge: text.labelLarge?.copyWith(fontWeight: FontWeight.w600),
      labelSmall: _step(text.labelSmall, MycaType.overline, color: p.muted),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: p.canvas,
      surfaceTintColor: Colors.transparent,
      foregroundColor: p.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: _step(text.titleLarge, MycaType.title)?.copyWith(fontSize: 18),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: p.ink,
        foregroundColor: p.onInk,
        minimumSize: const Size(0, MycaSize.control),
        shape: control,
        textStyle: buttonText,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: p.ink,
        minimumSize: const Size(0, MycaSize.control),
        shape: control,
        side: BorderSide(color: p.line),
        textStyle: buttonText,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: p.ink),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: p.ink,
      foregroundColor: p.onInk,
      elevation: 0,
      highlightElevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(MycaRadius.card)),
      extendedTextStyle: buttonText,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: p.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: field(p.line),
      enabledBorder: field(p.line),
      focusedBorder: field(p.ink, 1.4),
      errorBorder: field(p.danger),
      focusedErrorBorder: field(p.danger, 1.4),
      labelStyle: text.bodyLarge?.copyWith(color: p.muted),
      hintStyle: text.bodyLarge?.copyWith(color: p.faint),
      prefixStyle: text.bodyLarge?.copyWith(color: p.ink),
      suffixStyle: text.bodyLarge?.copyWith(color: p.ink),
      helperStyle: _step(text.bodySmall, MycaType.caption, color: p.muted),
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: p.surface,
      side: BorderSide(color: p.line),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(MycaRadius.chip)),
      labelStyle: text.labelLarge?.copyWith(color: p.ink, fontWeight: FontWeight.w500, fontSize: 14),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: p.surface,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: p.line,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(MycaRadius.sheet)),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      elevation: 0,
      backgroundColor: p.ink,
      contentTextStyle: text.bodyMedium?.copyWith(color: p.onInk),
      shape: control,
    ),
    listTileTheme: ListTileThemeData(iconColor: p.ink),
    dividerTheme: DividerThemeData(color: p.line, thickness: 1, space: 1),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: p.ink, strokeWidth: 2),
  );
}
