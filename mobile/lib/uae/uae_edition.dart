import 'package:flutter/widgets.dart';

import '../app_state.dart';

bool uaeEdition(BuildContext context) {
  final state = AppScope.of(context);
  return state.edition == 'AE' || state.snapshot?.company.country == 'AE';
}

bool uaeArabic(BuildContext context) => Localizations.maybeLocaleOf(context)?.languageCode == 'ar';

String uaeLang(BuildContext context) => uaeArabic(context) ? 'ar' : 'en';

Map<String, Object?> uaeLangArg(BuildContext context) => uaeArabic(context) ? const {'lang': 'ar'} : const {};

String? uaeTrnProblem(String typed, {required String Function(int) length, required String digitsOnly}) {
  final trn = typed.replaceAll(RegExp(r'[\s-]'), '');
  if (trn.isEmpty) return null;
  if (!RegExp(r'^\d+$').hasMatch(trn)) return digitsOnly;
  if (trn.length != 15) return length(trn.length);
  return null;
}

String uaeCleanTrn(String typed) => typed.replaceAll(RegExp(r'[\s-]'), '');

num? parseUaeNumber(String typed) {
  final clean = typed.replaceAll(',', '').replaceAll('٬', '').replaceAll('٫', '.').trim();
  final western = clean.split('').map((c) {
    final code = c.codeUnitAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String.fromCharCode(code - 0x0660 + 48);
    if (code >= 0x06F0 && code <= 0x06F9) return String.fromCharCode(code - 0x06F0 + 48);
    return c;
  }).join();
  if (!RegExp(r'^\d+(\.\d+)?$').hasMatch(western)) return null;
  return num.parse(western);
}

String uaeIsoDay(DateTime day) => '${day.year.toString().padLeft(4, '0')}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';

bool uaeIsoDate(String text) {
  if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(text)) return false;
  final day = DateTime.tryParse(text);
  return day != null && uaeIsoDay(day) == text;
}
