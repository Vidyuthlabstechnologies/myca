import 'package:flutter/widgets.dart';

import 'tokens.g.dart';

const rtlLanguages = {'ar', 'fa', 'he', 'ur'};

class MycaCountry {
  const MycaCountry._(this.facts, this.look);

  final MycaCountryFacts facts;
  final MycaCountryLook look;

  static const fallbackCode = 'IN';

  static MycaCountry of(String? code) {
    final key = (code ?? '').trim().toUpperCase();
    final facts = mycaCountryFacts[key] ?? mycaCountryFacts[fallbackCode]!;
    return MycaCountry._(facts, mycaCountryLooks[facts.code] ?? mycaCountryLooks[fallbackCode]!);
  }

  static MycaCountry? forFlavor(String? flavor) {
    final wanted = (flavor ?? '').trim().toLowerCase();
    for (final facts in mycaCountryFacts.values) {
      if (facts.flavor == wanted) return of(facts.code);
    }
    return null;
  }

  static List<MycaCountry> get all => [for (final code in mycaCountryFacts.keys) of(code)];

  String get code => facts.code;

  Locale get defaultLocale => locales.first;

  List<Locale> get locales => [for (final language in facts.languages) Locale(language, code)];

  String localeTagFor(Locale? locale) {
    final language = locale?.languageCode;
    if (language == null || !facts.languages.contains(language)) return facts.locale.replaceAll('-', '_');
    return '${language}_$code';
  }

  Locale resolve(Locale? device) {
    final language = device?.languageCode;
    if (language != null && facts.languages.contains(language)) return Locale(language, code);
    return defaultLocale;
  }

  static TextDirection directionOf(Locale locale) =>
      rtlLanguages.contains(locale.languageCode) ? TextDirection.rtl : TextDirection.ltr;

  String yearLabel(int startYear) {
    final label = facts.yearLabel[0].toUpperCase() + facts.yearLabel.substring(1);
    final spans = facts.yearStartMonth != 1 || facts.yearStartDay != 1;
    if (!spans) return '$label $startYear';
    return '$label $startYear-${((startYear + 1) % 100).toString().padLeft(2, '0')}';
  }

  int taxYearStarting(DateTime day) {
    final start = DateTime(day.year, facts.yearStartMonth, facts.yearStartDay);
    return day.isBefore(start) ? day.year - 1 : day.year;
  }
}
