import '../format.dart';

part 'models/core.dart';
part 'models/sales.dart';
part 'models/tax.dart';
part 'models/us_sales_tax.dart';
part 'models/payroll.dart';
part 'models/suppliers.dart';
part 'models/books.dart';
part 'models/bank.dart';

Map<String, dynamic> _map(Object? value) =>
    value is Map ? value.cast<String, dynamic>() : const <String, dynamic>{};

List<Map<String, dynamic>> _maps(Object? value) =>
    value is List ? value.map(_map).toList() : const <Map<String, dynamic>>[];

num _num(Object? value) => value is num ? value : 0;

String _text(Object? value) => value == null ? '' : value.toString();

num _stillOpen(num value) => value > 0 ? (value * 100).round() / 100 : 0;

String _plainRate(num value) => value == value.roundToDouble() ? value.toInt().toString() : value.toString();

Map<String, dynamic> toolData(Object? json) {
  final map = _map(json);
  if (map['ok'] == false) return const <String, dynamic>{};
  return _map(map['data']);
}

List<String> _texts(Object? value) => value is List ? value.map(_text).toList() : const <String>[];

num? _numOrNull(Object? value) => value is num ? value : null;

String _rupeesOr(num? amount, String none) => amount == null ? none : rupees(amount);

String _capitalised(String words) => words.isEmpty ? words : '${words[0].toUpperCase()}${words.substring(1)}';
