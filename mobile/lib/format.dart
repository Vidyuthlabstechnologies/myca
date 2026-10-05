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

String dueLabel(int daysUntil) {
  if (daysUntil < 0) return '${-daysUntil} days overdue';
  if (daysUntil == 0) return 'Due today';
  if (daysUntil == 1) return 'Due tomorrow';
  return 'Due in $daysUntil days';
}
