import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/format.dart';

void main() {
  tearDown(() => moneyCountry = 'IN');

  test('money follows the business country: lakh grouping with rupees for India, thousands with dollars for the US', () {
    expect(rupees(1234567.5), '₹12,34,567.50');
    expect(dollars(1234567.5), '\$1,234,567.50');
    expect(dollars(-42), '-\$42.00');
    expect(dollars(999.999), '\$1,000.00');
    moneyCountry = 'US';
    expect(rupees(1234567.5), '\$1,234,567.50');
    moneyCountry = 'IN';
    expect(rupees(42), '₹42.00');
  });

  test('a company without a country is Indian; a US one is read as US', () {
    expect(Company.fromJson({'name': 'A', 'gstin': ''}).country, 'IN');
    expect(Company.fromJson({'name': 'B', 'gstin': '', 'country': 'us'}).country, 'US');
  });
}
