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

/// One language the India app can be shown in.
///
/// Adding a language is three steps: a table file in lib/india/lang keyed by the same English lines as Hindi,
/// one entry here, and a script range in test/india_languages_test.dart. Nothing on any screen changes.
class IndiaLanguage {
  const IndiaLanguage(this.code, this.nativeName, this.englishName, this.table, {required this.reviewed, this.script});

  final String code;

  /// The name as a speaker writes it, shown in the language picker.
  final String nativeName;
  final String englishName;
  final Map<String, String> table;

  /// True only once a native speaker has read every line. Unreviewed languages are labelled in the picker.
  final bool reviewed;

  /// The Unicode block every line must use, checked by the tests.
  final RegExp? script;

  Locale get locale => code == 'en' ? const Locale('en', 'US') : Locale(code, 'IN');
}

/// In order of business-owner reach. Hindi first; English always stays available.
final indiaLanguages = <IndiaLanguage>[
  const IndiaLanguage('en', 'English', 'English', <String, String>{}, reviewed: true),
  IndiaLanguage('hi', 'हिन्दी', 'Hindi', hindi, reviewed: false, script: RegExp(r'[ऀ-ॿ]')),
  IndiaLanguage('mr', 'मराठी', 'Marathi', marathi, reviewed: false, script: RegExp(r'[ऀ-ॿ]')),
  IndiaLanguage('gu', 'ગુજરાતી', 'Gujarati', gujarati, reviewed: false, script: RegExp(r'[઀-૿]')),
  IndiaLanguage('ta', 'தமிழ்', 'Tamil', tamil, reviewed: false, script: RegExp(r'[஀-௿]')),
  IndiaLanguage('te', 'తెలుగు', 'Telugu', telugu, reviewed: false, script: RegExp(r'[ఀ-౿]')),
  IndiaLanguage('kn', 'ಕನ್ನಡ', 'Kannada', kannada, reviewed: false, script: RegExp(r'[ಀ-೿]')),
  IndiaLanguage('bn', 'বাংলা', 'Bengali', bengali, reviewed: false, script: RegExp(r'[ঀ-৿]')),
];

/// Languages offered to the owner: English, Hindi, and every other language whose table is filled in.
List<IndiaLanguage> get indiaOfferedLanguages => [for (final language in indiaLanguages) if (language.code == 'en' || language.table.isNotEmpty) language];

IndiaLanguage indiaLanguage(String code) => indiaLanguages.firstWhere((language) => language.code == code, orElse: () => indiaLanguages.first);

List<Locale> get indiaLocales => [for (final language in indiaOfferedLanguages) language.locale];

/// The phone's language when MyCA has it, otherwise English.
Locale indiaResolveLocale(Locale? device, Iterable<Locale> supported) {
  for (final locale in supported) {
    if (locale.languageCode == device?.languageCode) return locale;
  }
  return const Locale('en', 'US');
}

/// The language the owner picked inside the app, or null to follow the phone.
Locale? indiaChosenLocale(String choice) {
  for (final language in indiaOfferedLanguages) {
    if (language.code == choice) return language.locale;
  }
  return null;
}

/// Material, Cupertino and the design system for every India language. The design system has no Marathi,
/// Gujarati, Tamil, Telugu, Kannada or Bengali, so its few fixed lines fall back to English there.
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

/// The India language code in use here: 'en' outside the India edition or for an Indian company abroad.
String indiaLang(BuildContext context) {
  final code = Localizations.maybeLocaleOf(context)?.languageCode;
  if (code == null || code == 'en') return 'en';
  final state = AppScope.maybeOf(context);
  if (state == null || state.edition != 'IN' || (state.snapshot?.company.country ?? 'IN') != 'IN') return 'en';
  return indiaLanguage(code).code;
}

bool indiaHindi(BuildContext context) => indiaLang(context) == 'hi';

/// The line in [lang], or the English line when that language has no line for it yet.
String inLine(String lang, String english) => lang == 'en' ? english : (indiaLanguage(lang).table[english] ?? english);

/// A fixed line in the owner's language. Give it the English line as plain text so the tests can find it.
String inText(BuildContext context, String english) => inLine(indiaLang(context), english);

/// A line with names or amounts in it. The template names each part in braces, for example
/// `inFormat(context, 'Paid {amount} to {name}', {'amount': rupees(x), 'name': party})`, so a language
/// can put the parts in its own order.
String inFormat(BuildContext context, String template, Map<String, Object?> parts) => inFill(inLine(indiaLang(context), template), parts);

/// Fills `{name}` parts into a line. Parts the line does not name are ignored.
String inFill(String line, Map<String, Object?> parts) =>
    line.replaceAllMapped(RegExp(r'\{(\w+)\}'), (hit) => parts.containsKey(hit.group(1)) ? '${parts[hit.group(1)] ?? ''}' : hit.group(0)!);

/// One or many: picks the English template by count, then translates it.
String inCount(BuildContext context, int count, String one, String many, [Map<String, Object?> parts = const {}]) =>
    inFormat(context, count == 1 ? one : many, {'n': count, ...parts});

String inThingsNeedYou(BuildContext context, int count) => inCount(context, count, '1 thing needs you', '{n} things need you');
