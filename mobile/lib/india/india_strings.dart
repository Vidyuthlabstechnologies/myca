import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:myca_design/myca_design.dart';

import '../app_state.dart';
import 'lang/bn.dart';
import 'lang/gu.dart';
import 'lang/hi.dart';
import 'lang/kn.dart';
import 'lang/mr.dart';
import 'lang/ta.dart';
import 'lang/te.dart';

class IndiaLanguage {
  const IndiaLanguage(this.code, this.nativeName, this.englishName, this.table, {required this.reviewed, this.launch = false, this.script});

  final String code;

  final String nativeName;
  final String englishName;
  final Map<String, String> table;

  final bool reviewed;

  final bool launch;

  bool get offered => code == 'en' || (table.isNotEmpty && (reviewed || launch));

  final RegExp? script;

  Locale get locale => code == 'en' ? const Locale('en', 'US') : Locale(code, 'IN');
}

final indiaLanguages = <IndiaLanguage>[
  const IndiaLanguage('en', 'English', 'English', <String, String>{}, reviewed: true),
  IndiaLanguage('hi', 'हिन्दी', 'Hindi', hindi, reviewed: false, launch: true, script: RegExp(r'[ऀ-ॿ]')),
  IndiaLanguage('mr', 'मराठी', 'Marathi', marathi, reviewed: false, launch: true, script: RegExp(r'[ऀ-ॿ]')),
  IndiaLanguage('gu', 'ગુજરાતી', 'Gujarati', gujarati, reviewed: false, script: RegExp(r'[઀-૿]')),
  IndiaLanguage('ta', 'தமிழ்', 'Tamil', tamil, reviewed: false, script: RegExp(r'[஀-௿]')),
  IndiaLanguage('te', 'తెలుగు', 'Telugu', telugu, reviewed: false, script: RegExp(r'[ఀ-౿]')),
  IndiaLanguage('kn', 'ಕನ್ನಡ', 'Kannada', kannada, reviewed: false, script: RegExp(r'[ಀ-೿]')),
  IndiaLanguage('bn', 'বাংলা', 'Bengali', bengali, reviewed: false, script: RegExp(r'[ঀ-৿]')),
];

List<IndiaLanguage> get indiaOfferedLanguages => [for (final language in indiaLanguages) if (language.offered) language];

IndiaLanguage indiaLanguage(String code) => indiaLanguages.firstWhere((language) => language.code == code, orElse: () => indiaLanguages.first);

List<Locale> get indiaLocales => [for (final language in indiaOfferedLanguages) language.locale];

Locale indiaResolveLocale(Locale? device, Iterable<Locale> supported) {
  for (final locale in supported) {
    if (locale.languageCode == device?.languageCode) return locale;
  }
  return const Locale('en', 'US');
}

Locale? indiaChosenLocale(String choice) {
  for (final language in indiaOfferedLanguages) {
    if (language.code == choice) return language.locale;
  }
  return null;
}

const indiaLocalizationsDelegates = <LocalizationsDelegate<dynamic>>[
  _IndiaDesignDelegate(),
  GlobalMaterialLocalizations.delegate,
  GlobalWidgetsLocalizations.delegate,
  GlobalCupertinoLocalizations.delegate,
];

class _IndiaDesignDelegate extends LocalizationsDelegate<MycaLocalizations> {
  const _IndiaDesignDelegate();

  @override
  bool isSupported(Locale locale) => true;

  @override
  Future<MycaLocalizations> load(Locale locale) {
    final known = MycaLocalizations.supportedLocales.any((supported) => supported.languageCode == locale.languageCode);
    return MycaLocalizations.delegate.load(known ? locale : const Locale('en'));
  }

  @override
  bool shouldReload(_IndiaDesignDelegate old) => false;
}

String indiaLang(BuildContext context) {
  final code = Localizations.maybeLocaleOf(context)?.languageCode;
  if (code == null || code == 'en') return 'en';
  final state = AppScope.maybeOf(context);
  if (state == null || state.edition != 'IN' || (state.snapshot?.company.country ?? 'IN') != 'IN') return 'en';
  return indiaLanguage(code).code;
}

bool indiaHindi(BuildContext context) => indiaLang(context) == 'hi';

String inLine(String lang, String english) => lang == 'en' ? english : (indiaLanguage(lang).table[english] ?? english);

// For lines chosen at run time (a server message looked up by its code). Their English text is
// listed where it is written, and the language test requires each to have a Hindi and Marathi line.
String inDynamic(String lang, String english) => inLine(lang, english);

String inText(BuildContext context, String english) => inLine(indiaLang(context), english);

String inFormat(BuildContext context, String template, Map<String, Object?> parts) => inFill(inLine(indiaLang(context), template), parts);

String inFill(String line, Map<String, Object?> parts) =>
    line.replaceAllMapped(RegExp(r'\{(\w+)\}'), (hit) => parts.containsKey(hit.group(1)) ? '${parts[hit.group(1)] ?? ''}' : hit.group(0)!);

String inCount(BuildContext context, int count, String one, String many, [Map<String, Object?> parts = const {}]) =>
    inFormat(context, count == 1 ? one : many, {'n': count, ...parts});

String inThingsNeedYou(BuildContext context, int count) => inCount(context, count, '1 thing needs you', '{n} things need you');
