String rupees(num amount) {
  final negative = amount < 0;
  final fixed = amount.abs().toStringAsFixed(2);
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

String monthLabel(String period) {
  final parts = period.split('-');
  final month = parts.length == 2 ? int.tryParse(parts[1]) : null;
  if (month == null || month < 1 || month > 12) return period;
  return '${_months[month - 1]} ${parts[0]}';
}

String longDate(String iso) {
  final parts = iso.split('-');
  final month = parts.length == 3 ? int.tryParse(parts[1]) : null;
  final day = parts.length == 3 ? int.tryParse(parts[2]) : null;
  if (month == null || day == null || month < 1 || month > 12) return iso;
  return '$day ${_months[month - 1]} ${parts[0]}';
}

String plainNumber(num value) => value == value.roundToDouble()
    ? value.round().toString()
    : value.toString();

String dueLabel(int daysUntil) {
  if (daysUntil < 0) return '${-daysUntil} days overdue';
  if (daysUntil == 0) return 'Due today';
  if (daysUntil == 1) return 'Due tomorrow';
  return 'Due in $daysUntil days';
}

String _scaled(double value) =>
    value.toStringAsFixed(2).replaceFirst(RegExp(r'\.?0+$'), '');

String compactRupees(num amount) {
  final abs = amount.abs().toDouble();
  final sign = amount < 0 ? '-' : '';
  if (abs == 0) return '₹0';
  if (abs >= 1e7) return '$sign₹${_scaled(abs / 1e7)} cr';
  if (abs >= 1e5) return '$sign₹${_scaled(abs / 1e5)} L';
  if (abs >= 1000) {
    final whole = rupees(abs.round());
    return '$sign${whole.substring(0, whole.length - 3)}';
  }
  return rupees(amount);
}
