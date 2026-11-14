import 'package:flutter/material.dart';
import 'package:myca_design/myca_design.dart' show MycaSurfaceColors, mycaCountryLooks;

class PaletteSet {
  const PaletteSet({
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
    required this.warn,
    required this.warnSoft,
    required this.danger,
    required this.dangerSoft,
  });

  factory PaletteSet.of(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final s = dark ? MycaSurfaceColors.dark : MycaSurfaceColors.light;
    final look = mycaCountryLooks['IN']!;
    return PaletteSet(
      canvas: s.canvas,
      surface: s.surface,
      sunken: s.sunken,
      ink: s.ink,
      onInk: s.onInk,
      muted: s.muted,
      faint: s.faint,
      line: s.line,
      accent: dark ? look.accentDark : look.accent,
      accentSoft: dark ? look.accentSoftDark : look.accentSoft,
      warn: s.warn,
      warnSoft: s.warnSoft,
      danger: s.danger,
      dangerSoft: s.dangerSoft,
    );
  }

  static final light = PaletteSet.of(Brightness.light);
  static final dark = PaletteSet.of(Brightness.dark);

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
  final Color warn;
  final Color warnSoft;
  final Color danger;
  final Color dangerSoft;
}

class Palette {
  static PaletteSet current = PaletteSet.light;

  static Brightness get brightness => identical(current, PaletteSet.dark) ? Brightness.dark : Brightness.light;

  static set brightness(Brightness value) => current = value == Brightness.dark ? PaletteSet.dark : PaletteSet.light;

  static Color get canvas => current.canvas;
  static Color get surface => current.surface;
  static Color get sunken => current.sunken;
  static Color get ink => current.ink;
  static Color get onInk => current.onInk;
  static Color get muted => current.muted;
  static Color get faint => current.faint;
  static Color get line => current.line;
  static Color get accent => current.accent;
  static Color get accentSoft => current.accentSoft;
  static Color get warn => current.warn;
  static Color get warnSoft => current.warnSoft;
  static Color get danger => current.danger;
  static Color get dangerSoft => current.dangerSoft;
}

enum Tint {
  sales,
  purchases,
  taxes,
  ask,
  expense,
  urgent;

  Color get stroke => switch (this) {
    Tint.taxes => Palette.warn,
    Tint.urgent => Palette.danger,
    _ => Palette.ink,
  };
}

const moneyFigures = [FontFeature.tabularFigures()];

const brandFont = 'Inter';

const radiusCard = 14.0;
const radiusControl = 10.0;

ThemeData mycaTheme([Brightness brightness = Brightness.light]) {
  final p = PaletteSet.of(brightness);
  final scheme =
      ColorScheme.fromSeed(
        seedColor: p.accent,
        brightness: brightness,
      ).copyWith(
        primary: p.ink,
        onPrimary: p.onInk,
        secondary: p.accent,
        onSecondary: p.onInk,
        surface: p.surface,
        onSurface: p.ink,
        onSurfaceVariant: p.muted,
        outline: p.line,
        outlineVariant: p.line,
        error: p.danger,
        surfaceContainerHighest: p.sunken,
      );
  final base = ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    fontFamily: brandFont,
  );
  final text = base.textTheme.apply(
    bodyColor: p.ink,
    displayColor: p.ink,
  );
  final control = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(radiusControl),
  );
  OutlineInputBorder field(Color color, [double width = 1]) =>
      OutlineInputBorder(
        borderRadius: BorderRadius.circular(radiusControl),
        borderSide: BorderSide(color: color, width: width),
      );
  return base.copyWith(
    scaffoldBackgroundColor: p.canvas,
    splashFactory: InkSparkle.splashFactory,
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {TargetPlatform.android: FadeForwardsPageTransitionsBuilder()},
    ),
    textTheme: text.copyWith(
      displaySmall: text.displaySmall?.copyWith(
        fontSize: 34,
        fontWeight: FontWeight.w500,
        letterSpacing: -0.9,
        height: 1.12,
      ),
      headlineMedium: text.headlineMedium?.copyWith(
        fontSize: 26,
        fontWeight: FontWeight.w500,
        letterSpacing: -0.6,
        height: 1.18,
      ),
      headlineSmall: text.headlineSmall?.copyWith(
        fontSize: 21,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.35,
      ),
      titleLarge: text.titleLarge?.copyWith(
        fontSize: 17,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.2,
      ),
      titleMedium: text.titleMedium?.copyWith(
        fontSize: 15.5,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.1,
      ),
      bodyLarge: text.bodyLarge?.copyWith(
        fontSize: 15.5,
        letterSpacing: 0,
        height: 1.45,
      ),
      bodyMedium: text.bodyMedium?.copyWith(
        fontSize: 14,
        letterSpacing: 0,
        color: p.muted,
        height: 1.4,
      ),
      bodySmall: text.bodySmall?.copyWith(
        fontSize: 12.5,
        letterSpacing: 0,
        color: p.muted,
      ),
      labelLarge: text.labelLarge?.copyWith(fontWeight: FontWeight.w600),
      labelSmall: text.labelSmall?.copyWith(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.9,
        color: p.muted,
      ),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: p.canvas,
      surfaceTintColor: Colors.transparent,
      foregroundColor: p.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: text.titleLarge?.copyWith(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.2,
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: p.ink,
        foregroundColor: p.onInk,
        minimumSize: const Size(0, 50),
        shape: control,
        textStyle: text.labelLarge?.copyWith(
          fontSize: 15,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: p.ink,
        minimumSize: const Size(0, 50),
        shape: control,
        side: BorderSide(color: p.line),
        textStyle: text.labelLarge?.copyWith(
          fontSize: 15,
          fontWeight: FontWeight.w600,
        ),
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
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radiusCard),
      ),
      extendedTextStyle: text.labelLarge?.copyWith(
        fontSize: 15,
        fontWeight: FontWeight.w600,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: p.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: field(p.line),
      enabledBorder: field(p.line),
      focusedBorder: field(p.ink, 1.4),
      labelStyle: text.bodyLarge?.copyWith(color: p.muted),
      hintStyle: text.bodyLarge?.copyWith(color: p.faint),
      prefixStyle: text.bodyLarge?.copyWith(color: p.ink),
      suffixStyle: text.bodyLarge?.copyWith(color: p.ink),
      helperStyle: text.bodySmall,
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: p.surface,
      side: BorderSide(color: p.line),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      labelStyle: text.labelLarge?.copyWith(
        color: p.ink,
        fontWeight: FontWeight.w500,
        fontSize: 14,
      ),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: p.surface,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: p.line,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
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
    dividerTheme: DividerThemeData(
      color: p.line,
      thickness: 1,
      space: 1,
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: p.ink,
      strokeWidth: 2,
    ),
  );
}
