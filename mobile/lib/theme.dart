import 'package:flutter/material.dart';

class Palette {
  static const canvas = Color(0xFFFAFAF7);
  static const surface = Color(0xFFFFFFFF);
  static const sunken = Color(0xFFF2F1EC);
  static const ink = Color(0xFF15181B);
  static const muted = Color(0xFF6C7075);
  static const faint = Color(0xFF9A9DA1);
  static const line = Color(0xFFE6E4DE);
  static const accent = Color(0xFF1B5E3F);
  static const accentSoft = Color(0xFFEAF2ED);
  static const warn = Color(0xFF94570A);
  static const warnSoft = Color(0xFFFAF1E0);
  static const danger = Color(0xFFB3261E);
  static const dangerSoft = Color(0xFFFAEAE8);
}

class Tint {
  const Tint(this.stroke);

  final Color stroke;

  static const sales = Tint(Palette.ink);
  static const purchases = Tint(Palette.ink);
  static const taxes = Tint(Palette.warn);
  static const ask = Tint(Palette.ink);
  static const expense = Tint(Palette.ink);
  static const urgent = Tint(Palette.danger);
}

const moneyFigures = [FontFeature.tabularFigures()];

const brandFont = 'Inter';

const radiusCard = 14.0;
const radiusControl = 10.0;

ThemeData mycaTheme() {
  final scheme =
      ColorScheme.fromSeed(
        seedColor: Palette.accent,
        brightness: Brightness.light,
      ).copyWith(
        primary: Palette.ink,
        onPrimary: Colors.white,
        secondary: Palette.accent,
        onSecondary: Colors.white,
        surface: Palette.surface,
        onSurface: Palette.ink,
        onSurfaceVariant: Palette.muted,
        outline: Palette.line,
        outlineVariant: Palette.line,
        error: Palette.danger,
        surfaceContainerHighest: Palette.sunken,
      );
  final base = ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    fontFamily: brandFont,
  );
  final text = base.textTheme.apply(
    bodyColor: Palette.ink,
    displayColor: Palette.ink,
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
    scaffoldBackgroundColor: Palette.canvas,
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
        color: Palette.muted,
        height: 1.4,
      ),
      bodySmall: text.bodySmall?.copyWith(
        fontSize: 12.5,
        letterSpacing: 0,
        color: Palette.muted,
      ),
      labelLarge: text.labelLarge?.copyWith(fontWeight: FontWeight.w600),
      labelSmall: text.labelSmall?.copyWith(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.9,
        color: Palette.muted,
      ),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: Palette.canvas,
      surfaceTintColor: Colors.transparent,
      foregroundColor: Palette.ink,
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
        backgroundColor: Palette.ink,
        foregroundColor: Colors.white,
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
        foregroundColor: Palette.ink,
        minimumSize: const Size(0, 50),
        shape: control,
        side: const BorderSide(color: Palette.line),
        textStyle: text.labelLarge?.copyWith(
          fontSize: 15,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: Palette.ink),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: Palette.ink,
      foregroundColor: Colors.white,
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
      fillColor: Palette.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: field(Palette.line),
      enabledBorder: field(Palette.line),
      focusedBorder: field(Palette.ink, 1.4),
      labelStyle: text.bodyLarge?.copyWith(color: Palette.muted),
      hintStyle: text.bodyLarge?.copyWith(color: Palette.faint),
      prefixStyle: text.bodyLarge?.copyWith(color: Palette.ink),
      suffixStyle: text.bodyLarge?.copyWith(color: Palette.ink),
      helperStyle: text.bodySmall,
    ),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: Palette.surface,
      side: const BorderSide(color: Palette.line),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      labelStyle: text.labelLarge?.copyWith(
        color: Palette.ink,
        fontWeight: FontWeight.w500,
        fontSize: 14,
      ),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: Palette.surface,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: Palette.line,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      elevation: 0,
      backgroundColor: Palette.ink,
      contentTextStyle: text.bodyMedium?.copyWith(color: Colors.white),
      shape: control,
    ),
    listTileTheme: const ListTileThemeData(iconColor: Palette.ink),
    dividerTheme: const DividerThemeData(
      color: Palette.line,
      thickness: 1,
      space: 1,
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: Palette.ink,
      strokeWidth: 2,
    ),
  );
}
