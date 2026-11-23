import 'package:myca_design/myca_design.dart' show MycaCountry, MycaDateStyle, MycaFormat;

import 'india/india_strings.dart' show inFill, inLine;

String moneyCountry = 'IN';

String formatLanguage = 'en';

final _us = MycaFormat(MycaCountry.of('US'));
final _ae = MycaFormat(MycaCountry.of('AE'));

final _gb = MycaFormat(MycaCountry.of('GB'));

final _my = MycaFormat(MycaCountry.of('MY'));

String get moneyPrefix => switch (moneyCountry) {
  'AE' => 'AED ',
  'GB' => '£ ',
  'US' => '\$ ',
  'MY' => 'RM ',
  _ => '₹ ',
};

String get salesTaxName => switch (moneyCountry) {
  'GB' || 'AE' => 'VAT',
  'US' => 'sales tax',
  'MY' => 'SST',
  _ => 'GST',
};

String rupees(num amount) {
  if (moneyCountry == 'US') return dollars(amount);
  if (moneyCountry == 'MY') return ringgit(amount);
  if (moneyCountry == 'GB') return pounds(amount);
  if (moneyCountry == 'AE') return _ae.money(amount);
  final fixed = amount.abs().toStringAsFixed(2);
  final negative = amount < 0 && fixed.contains(RegExp('[1-9]'));
  final dot = fixed.indexOf('.');
  final whole = fixed.substring(0, dot);
  final paise = fixed.substring(dot);
  final sign = negative ? '-' : '';
  if (whole.length <= 3) return '$sign₹$whole$paise';
  final lastThree = whole.substring(whole.length - 3);
  var rest = whole.substring(0, whole.length - 3);
  final groups = <String>[];
  while (rest.length > 2) {
    groups.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) groups.insert(0, rest);
  return '$sign₹${groups.join(',')},$lastThree$paise';
}

String dollars(num amount) => _us.money(amount);

String ringgit(num amount) {
  final negative = amount < 0;
  final fixed = amount.abs().toStringAsFixed(2);
  final dot = fixed.indexOf('.');
  var whole = fixed.substring(0, dot);
  final groups = <String>[];
  while (whole.length > 3) {
    groups.insert(0, whole.substring(whole.length - 3));
    whole = whole.substring(0, whole.length - 3);
  }
  groups.insert(0, whole);
  return '${negative ? '-' : ''}RM${groups.join(',')}${fixed.substring(dot)}';
}

String currencyAmount(String currency, num amount) => currency == 'MYR' ? ringgit(amount) : ringgit(amount).replaceFirst('RM', '$currency ');

String dayMonthYear(String iso) {
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(iso.trim());
  if (match == null) return iso;
  return '${match.group(3)}/${match.group(2)}/${match.group(1)}';
}

String? isoFromDayMonthYear(String typed) {
  final match = RegExp(r'^(\d{1,2})/(\d{1,2})/(\d{4})$').firstMatch(typed.trim());
  if (match == null) return null;
  final day = int.parse(match.group(1)!);
  final month = int.parse(match.group(2)!);
  final year = int.parse(match.group(3)!);
  final date = DateTime.tryParse('${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}');
  if (date == null || date.month != month || date.day != day) return null;
  return isoDate(date);
}
String pounds(num amount) => _gb.money(amount);

String isoDate(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

const _months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

String _month(int month) => formatLanguage == 'en'
    ? _months[month - 1]
    : switch (month) {
        1 => inLine(formatLanguage, 'January'),
        2 => inLine(formatLanguage, 'February'),
        3 => inLine(formatLanguage, 'March'),
        4 => inLine(formatLanguage, 'April'),
        5 => inLine(formatLanguage, 'May'),
        6 => inLine(formatLanguage, 'June'),
        7 => inLine(formatLanguage, 'July'),
        8 => inLine(formatLanguage, 'August'),
        9 => inLine(formatLanguage, 'September'),
        10 => inLine(formatLanguage, 'October'),
        11 => inLine(formatLanguage, 'November'),
        _ => inLine(formatLanguage, 'December'),
      };

String _shortMonth(int month) => formatLanguage == 'en'
    ? _months[month - 1].substring(0, 3)
    : switch (month) {
        1 => inLine(formatLanguage, 'Jan'),
        2 => inLine(formatLanguage, 'Feb'),
        3 => inLine(formatLanguage, 'Mar'),
        4 => inLine(formatLanguage, 'Apr'),
        5 => inLine(formatLanguage, 'May'),
        6 => inLine(formatLanguage, 'Jun'),
        7 => inLine(formatLanguage, 'Jul'),
        8 => inLine(formatLanguage, 'Aug'),
        9 => inLine(formatLanguage, 'Sep'),
        10 => inLine(formatLanguage, 'Oct'),
        11 => inLine(formatLanguage, 'Nov'),
        _ => inLine(formatLanguage, 'Dec'),
      };

String monthLabel(String period) {
  final parts = period.split('-');
  final month = parts.length == 2 ? int.tryParse(parts[1]) : null;
  if (month == null || month < 1 || month > 12) return period;
  return '${_month(month)} ${parts[0]}';
}

DateTime businessTime(DateTime at) => switch (moneyCountry) {
  'IN' => at.toUtc().add(const Duration(hours: 5, minutes: 30)),
  'AE' => at.toUtc().add(const Duration(hours: 4)),
  'MY' => at.toUtc().add(const Duration(hours: 8)),
  _ => at.toLocal(),
};

String sharedOn(String timestamp) {
  final at = DateTime.tryParse(timestamp);
  return at == null ? '' : longDate(isoDate(businessTime(at)));
}

String longDate(String iso) {
  final parts = iso.split('-');
  final month = parts.length == 3 ? int.tryParse(parts[1]) : null;
  final day = parts.length == 3 ? int.tryParse(parts[2]) : null;
  if (month == null || day == null || month < 1 || month > 12) return iso;
  if (moneyCountry == 'US') return '${_months[month - 1]} $day, ${parts[0]}';
  if (moneyCountry == 'MY') return dayMonthYear(iso);
  return '$day ${_month(month)} ${parts[0]}';
}

String usDate(String iso) => _us.isoDate(iso, style: MycaDateStyle.short);

String? isoFromUsDate(String typed) {
  final match = RegExp(r'^(\d{1,2})/(\d{1,2})/(\d{4})$').firstMatch(typed.trim());
  if (match == null) return null;
  final month = int.parse(match.group(1)!);
  final day = int.parse(match.group(2)!);
  final year = int.parse(match.group(3)!);
  final date = DateTime.tryParse('${year.toString().padLeft(4, '0')}-${month.toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}');
  if (date == null || date.month != month || date.day != day) return null;
  return isoDate(date);
}

String plainNumber(num value) => value == value.roundToDouble()
    ? value.round().toString()
    : value.toString();

String shortFileName(String name, [int limit = 120]) {
  if (name.length <= limit) return name;
  final dot = name.lastIndexOf('.');
  final extension = dot > 0 && name.length - dot <= 10 ? name.substring(dot) : '';
  var keep = limit - extension.length;
  if ((name.codeUnitAt(keep - 1) & 0xFC00) == 0xD800) keep -= 1;
  return '${name.substring(0, keep)}$extension';
}

String dueLabel(int daysUntil) {
  if (daysUntil < 0) return inFill(inLine(formatLanguage, '{n} days overdue'), {'n': -daysUntil});
  if (daysUntil == 0) return inLine(formatLanguage, 'Due today');
  if (daysUntil == 1) return inLine(formatLanguage, 'Due tomorrow');
  return inFill(inLine(formatLanguage, 'Due in {n} days'), {'n': daysUntil});
}

String _scaled(double value) =>
    value.toStringAsFixed(2).replaceFirst(RegExp(r'\.?0+$'), '');

String compactRupees(num amount) {
  final abs = amount.abs().toDouble();
  final sign = amount < 0 ? '-' : '';
  if (moneyCountry == 'AE') return _ae.moneyCompact(amount);
  if (moneyCountry == 'US') return _us.moneyCompact(amount);
  if (moneyCountry == 'GB') return _gb.moneyCompact(amount);
  if (moneyCountry == 'MY') return _my.moneyCompact(amount);
  if (abs == 0) return '₹0';
  if (abs >= 1e7 || double.parse((abs / 1e5).toStringAsFixed(2)) >= 100) return '$sign₹${_scaled(abs / 1e7)} cr';
  if (abs.round() >= 1e5) return '$sign₹${_scaled(abs / 1e5)} L';
  if (abs.round() >= 1000) {
    final whole = rupees(abs.round());
    return '$sign${whole.substring(0, whole.length - 3)}';
  }
  return rupees(amount);
}

String termsLabel(int? days) =>
    days == null ? '' : (days == 0 ? inLine(formatLanguage, 'Due on receipt') : inFill(inLine(formatLanguage, 'Net {n}'), {'n': days}));

String dueWords(String dueDate, DateTime today, {required bool open}) {
  if (dueDate.isEmpty || !open) return '';
  final parts = dueDate.split('-').map(int.parse).toList();
  final due = DateTime(parts[0], parts[1], parts[2]);
  final days = due
      .difference(DateTime(today.year, today.month, today.day))
      .inDays;
  if (days == -1) return inFill(inLine(formatLanguage, 'Overdue by {n} day'), {'n': 1});
  if (days < 0) return inFill(inLine(formatLanguage, 'Overdue by {n} days'), {'n': -days});
  if (days == 0) return inLine(formatLanguage, 'Due today');
  return inFill(inLine(formatLanguage, 'Due {date}'), {'date': longDate(dueDate)});
}

final _isoDay = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');

String readableDay(String text) {
  final match = _isoDay.firstMatch(text.trim());
  if (match == null) return text;
  final month = int.parse(match.group(2)!);
  final day = int.parse(match.group(3)!);
  if (month < 1 || month > 12 || day < 1 || day > 31) return text;
  return '$day ${_shortMonth(month)} ${match.group(1)}';
}
