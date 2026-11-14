import 'package:flutter/widgets.dart';
import 'package:myca_design/myca_design.dart';

final uaeCountry = MycaCountry.of('AE');

final uaeDesign = MycaDesign.forFlavor('uae');

Locale uaeResolveLocale(Locale? device, Iterable<Locale> supported) => uaeCountry.resolve(device);

class UaeFormat {
  UaeFormat(Locale? locale) : _format = MycaFormat(uaeCountry, locale), _arabic = locale?.languageCode == 'ar';

  factory UaeFormat.of(BuildContext context) => UaeFormat(Localizations.maybeLocaleOf(context));

  final MycaFormat _format;
  final bool _arabic;

  String money(num amount) => _format.money(amount);

  static const _monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  static const _monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  String monthName(int month, {bool short = false}) {
    if (_arabic) return _monthsAr[month - 1];
    final name = _monthsEn[month - 1];
    return short ? name.substring(0, 3) : name;
  }

  String date(String iso, {bool short = true}) {
    final day = DateTime.tryParse(iso);
    if (day == null || !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(iso)) return iso;
    return '${day.day} ${monthName(day.month, short: short)} ${day.year}';
  }

  String quarter(UaeQuarter q) {
    final first = monthName(q.firstMonth, short: true);
    final last = monthName(q.firstMonth + 2, short: true);
    return _arabic ? '$first - $last ${q.year}' : '$first–$last ${q.year}';
  }
}

class UaeQuarter {
  const UaeQuarter(this.year, this.index);

  factory UaeQuarter.containing(DateTime day) => UaeQuarter(day.year, (day.month - 1) ~/ 3 + 1);

  final int year;
  final int index;

  int get firstMonth => (index - 1) * 3 + 1;

  UaeQuarter get previous => index == 1 ? UaeQuarter(year - 1, 4) : UaeQuarter(year, index - 1);

  UaeQuarter get next => index == 4 ? UaeQuarter(year + 1, 1) : UaeQuarter(year, index + 1);

  String get period => '${_ym(year, firstMonth)}/${_ym(year, firstMonth + 2)}';

  String get start => '${_ym(year, firstMonth)}-01';

  String get end {
    final last = DateTime(year, firstMonth + 3, 0);
    return '${_ym(year, firstMonth + 2)}-${last.day.toString().padLeft(2, '0')}';
  }

  @override
  bool operator ==(Object other) => other is UaeQuarter && other.year == year && other.index == index;

  @override
  int get hashCode => Object.hash(year, index);

  static String _ym(int year, int month) => '$year-${month.toString().padLeft(2, '0')}';
}

num uaeNum(Object? value) => value is num ? value : (value is String ? num.tryParse(value) ?? 0 : 0);

String uaeText(Object? value) => value == null ? '' : '$value';

Map<String, dynamic> uaeMap(Object? value) => value is Map ? Map<String, dynamic>.from(value) : const <String, dynamic>{};

List<Map<String, dynamic>> uaeRows(Object? value) => [for (final row in (value as List? ?? const [])) if (row is Map) Map<String, dynamic>.from(row)];

num? parseDirhams(String typed) {
  final clean = typed.replaceAll(',', '').replaceAll('٬', '').replaceAll('٫', '.').trim();
  if (clean.isEmpty) return 0;
  final western = clean.split('').map((c) {
    final code = c.codeUnitAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String.fromCharCode(code - 0x0660 + 48);
    if (code >= 0x06F0 && code <= 0x06F9) return String.fromCharCode(code - 0x06F0 + 48);
    return c;
  }).join();
  if (!RegExp(r'^-?\d+(\.\d{1,2})?$').hasMatch(western)) return null;
  return num.parse(western);
}
