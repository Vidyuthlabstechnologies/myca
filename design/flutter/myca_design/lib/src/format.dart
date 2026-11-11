import 'package:flutter/widgets.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';

import 'country.dart';

enum MycaDateStyle { long, medium, short, month }

class MycaFormat {
  MycaFormat(this.country, [Locale? locale]) : tag = country.localeTagFor(locale);

  static const _dateFallback = {'en_AE': 'en_GB', 'ar_AE': 'ar', 'zh_MY': 'zh', 'ms_MY': 'ms', 'hi_IN': 'hi', 'es_US': 'es', 'fr_CA': 'fr_CA'};

  final MycaCountry country;
  final String tag;

  static Future<void> ensureInitialized() => initializeDateFormatting();

  late final NumberFormat _money = NumberFormat.currency(
    locale: tag,
    name: country.facts.currency,
    symbol: country.facts.symbol,
    decimalDigits: 2,
  );

  late final NumberFormat _whole = NumberFormat.decimalPattern(tag);

  String money(num amount) => _tidy(_money.format(amount));

  String moneyMinor(int minorUnits) => money(minorUnits / 100);

  String moneyCompact(num amount) {
    final compact = NumberFormat.compactSimpleCurrency(locale: tag, name: country.facts.currency);
    return _tidy(compact.format(amount)).replaceFirst(compact.currencySymbol, country.facts.symbol);
  }

  String number(num value) => _whole.format(value);

  String date(DateTime day, {MycaDateStyle style = MycaDateStyle.medium}) {
    final locale = _dateTag;
    final format = switch (style) {
      MycaDateStyle.long => DateFormat.yMMMMd(locale),
      MycaDateStyle.medium => DateFormat.yMMMd(locale),
      MycaDateStyle.short => DateFormat(_shortPattern(locale), locale),
      MycaDateStyle.month => DateFormat.yMMMM(locale),
    };
    return format.format(day);
  }

  String isoDate(String iso, {MycaDateStyle style = MycaDateStyle.medium}) {
    final day = DateTime.tryParse(iso);
    if (day == null || !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(iso)) return iso;
    return date(day, style: style);
  }

  String get _dateTag => DateFormat.localeExists(tag) ? tag : (_dateFallback[tag] ?? Intl.shortLocale(tag));

  String _shortPattern(String locale) {
    final pattern = DateFormat.yMd(locale).pattern ?? 'dd/MM/y';
    return pattern.replaceAll(RegExp(r'(?<![dM])d(?!d)'), 'dd').replaceAll(RegExp(r'(?<!M)M(?!M)'), 'MM');
  }

  int get firstDayOfWeek => DateFormat.yMd(_dateTag).dateSymbols.FIRSTDAYOFWEEK + 1;

  String _tidy(String text) {
    final symbol = country.facts.symbol;
    final letters = RegExp(r'^[A-Za-z]+$').hasMatch(symbol);
    if (!letters) return text.replaceAll('$symbol ', symbol).replaceAll('$symbol ', symbol);
    return text.replaceAllMapped(RegExp('${RegExp.escape(symbol)}(?=[0-9])'), (_) => '$symbol ');
  }
}
