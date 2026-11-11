import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'country.dart';
import 'l10n/myca_localizations.dart';
import 'theme.dart';

const scriptFonts = {
  'ar': 'packages/myca_fonts_arabic/Noto Sans Arabic',
  'hi': 'packages/myca_fonts_devanagari/Noto Sans Devanagari',
};

class MycaDesign {
  MycaDesign(this.country);

  factory MycaDesign.forFlavor(String? flavor, {String? fallbackCode}) =>
      MycaDesign(MycaCountry.forFlavor(flavor) ?? MycaCountry.of(fallbackCode));

  final MycaCountry country;

  List<String> get fontFallback => [
    for (final language in country.facts.languages) ?scriptFonts[language],
  ];

  ThemeData get light => mycaTheme(country, fontFallback: fontFallback);

  ThemeData get dark => mycaTheme(country, brightness: Brightness.dark, fontFallback: fontFallback);

  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates = [
    MycaLocalizations.delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
  ];

  List<Locale> get supportedLocales {
    final known = MycaLocalizations.supportedLocales.map((locale) => locale.languageCode).toSet();
    final locales = [for (final locale in country.locales) if (known.contains(locale.languageCode)) locale];
    return locales.isEmpty ? [const Locale('en')] : locales;
  }

  Locale resolveLocale(List<Locale>? device, Iterable<Locale> supported) {
    for (final wanted in device ?? const <Locale>[]) {
      for (final locale in supported) {
        if (locale.languageCode == wanted.languageCode) return locale;
      }
    }
    return supported.first;
  }
}
