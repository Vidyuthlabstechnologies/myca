import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/uae/uae_edition.dart';

void main() {
  test('a UAE mobile typed in Arabic-Indic digits reads as the same number, and only prefixes the server accepts pass', () {
    expect(uaeMobileNumber('٠٥٠ ١٢٣ ٤٥٦٧'), '+971501234567');
    expect(uaeMobileNumber('۰۵۸۷۶۵۴۳۲۱'), '+971587654321');
    expect(uaeMobileNumber('+971 50 123 4567'), '+971501234567');
    expect(uaeMobileNumber('051 123 4567'), isNull);
    expect(uaeMobileNumber('04 123 4567'), isNull);
  });

  test('the digits formatter keeps Arabic-Indic digits typed into phone and code fields instead of dropping them', () {
    const formatter = UaeWesternDigitsFormatter();
    final typed = formatter.formatEditUpdate(TextEditingValue.empty, const TextEditingValue(text: '١٢٣٤٥٦', selection: TextSelection.collapsed(offset: 6)));
    expect(typed.text, '123456');
    expect(typed.selection.baseOffset, 6);
    final kept = FilteringTextInputFormatter.digitsOnly.formatEditUpdate(TextEditingValue.empty, typed);
    expect(kept.text, '123456');
  });
}
