import 'package:flutter_test/flutter_test.dart';
import 'package:myca/registers.dart';

void main() {
  test('an amount or rate that is not a finite number is refused, so it never reaches the server as NaN', () {
    for (final typed in ['NaN', 'Infinity', '1e400', '-Infinity']) {
      expect(parseAmount(typed), isNull, reason: typed);
      expect(parseRate(typed), isNull, reason: typed);
    }
    expect(parseAmount('₹1,00,000.50'), 100000.5);
    expect(parseRate('18%'), 18);
    expect(parseAmount('-5'), isNull);
    expect(parseRate('0'), 0);
  });
}
