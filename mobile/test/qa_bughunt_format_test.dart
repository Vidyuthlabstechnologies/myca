import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';

void main() {
  test('a figure that rounds to zero paise is shown as ₹0.00, never -₹0.00', () {
    expect(rupees(-0.004), '₹0.00');
    expect(rupees(0.1 + 0.2 - 0.30000000000000016), '₹0.00');
    expect(rupees(-0.005), '-₹0.01');
    expect(rupees(-1234.5), '-₹1,234.50');
  });

  test('a compact figure that rounds up to the next unit moves to that unit', () {
    expect(compactRupees(9999999.99), '₹1 cr');
    expect(compactRupees(-9999999.99), '-₹1 cr');
    expect(compactRupees(99999.6), '₹1 L');
    expect(compactRupees(99999.4), '₹99,999');
    expect(compactRupees(999.996), '₹1,000');
    expect(compactRupees(9999999), '₹1 cr');
    expect(compactRupees(9994999), '₹99.95 L');
  });
}
