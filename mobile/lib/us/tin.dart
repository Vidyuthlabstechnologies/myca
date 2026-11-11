import 'package:flutter/services.dart';

const _knownInvalid = {
  '078051120',
  '219099999',
  '123456789',
  '111111111',
  '222222222',
  '333333333',
  '444444444',
  '555555555',
  '777777777',
  '888888888',
};

const _itinGroups = [(50, 65), (70, 88), (90, 92), (94, 99)];

String tinDigits(String value) => value.replaceAll(RegExp(r'[\s-]'), '');

String? tinKind(String value) {
  final digits = tinDigits(value);
  if (!RegExp(r'^\d{9}$').hasMatch(digits)) return null;
  final area = int.parse(digits.substring(0, 3));
  final group = int.parse(digits.substring(3, 5));
  final serial = int.parse(digits.substring(5));
  if (digits.startsWith('9')) {
    return _itinGroups.any((g) => group >= g.$1 && group <= g.$2) ? 'itin' : null;
  }
  if (area == 0 || area == 666 || group == 0 || serial == 0 || _knownInvalid.contains(digits)) return null;
  return 'ssn';
}

String? tinProblem(String value, {bool required = true}) {
  final digits = tinDigits(value);
  if (digits.isEmpty) return required ? 'Enter the Social Security number.' : null;
  if (!RegExp(r'^\d{9}$').hasMatch(digits)) return 'A Social Security number has nine digits.';
  if (tinKind(digits) == null) return 'That is not a number the Social Security Administration or the IRS issues. Check it against the card or the ITIN letter.';
  return null;
}

String maskTin(String valueOrLast4) {
  final text = valueOrLast4.trim();
  if (RegExp(r'^\*{3}-\*{2}-\d{4}$').hasMatch(text)) return text;
  if (RegExp(r'^\d{4}$').hasMatch(text)) return '***-**-$text';
  final digits = tinDigits(text);
  return RegExp(r'^\d{9}$').hasMatch(digits) ? '***-**-${digits.substring(5)}' : '';
}

String formatTinTyping(String raw) {
  final digits = raw.replaceAll(RegExp(r'\D'), '');
  final cut = digits.length > 9 ? digits.substring(0, 9) : digits;
  if (cut.length <= 3) return cut;
  if (cut.length <= 5) return '${cut.substring(0, 3)}-${cut.substring(3)}';
  return '${cut.substring(0, 3)}-${cut.substring(3, 5)}-${cut.substring(5)}';
}

class TinInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final text = formatTinTyping(newValue.text);
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }
}

String? routingProblem(String value) {
  final digits = value.replaceAll(RegExp(r'\D'), '');
  if (digits.length != 9) return 'A routing number has nine digits.';
  final prefix = int.parse(digits.substring(0, 2));
  final prefixOk = prefix <= 12 || (prefix >= 21 && prefix <= 32) || (prefix >= 61 && prefix <= 72) || prefix == 80;
  if (!prefixOk) return 'That routing number does not belong to a US bank. Look for it on a check or in your bank app.';
  final d = digits.split('').map(int.parse).toList();
  final sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 == 0 ? null : 'That routing number does not add up. Look for it on a check or in your bank app.';
}

String? accountProblem(String value) {
  final digits = value.replaceAll(RegExp(r'\D'), '');
  if (digits.length < 4 || digits.length > 17) return 'An account number has 4 to 17 digits.';
  return null;
}

String maskAccount(String value) {
  final digits = value.replaceAll(RegExp(r'\D'), '');
  return digits.length >= 4 ? '••••${digits.substring(digits.length - 4)}' : '';
}

String? zipProblem(String value) =>
    RegExp(r'^\d{5}(-\d{4})?$').hasMatch(value.trim()) ? null : 'Enter a five-digit ZIP code, or ZIP+4.';

String? pinProblem(String value) =>
    RegExp(r'^\d{5}$').hasMatch(value) && value != '00000' ? null : 'Choose any five digits except 00000.';

String? ipPinProblem(String value) {
  if (value.isEmpty) return null;
  return RegExp(r'^\d{6}$').hasMatch(value) ? null : 'An Identity Protection PIN has six digits.';
}
