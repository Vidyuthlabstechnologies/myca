import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/my/my_tools.dart';
import 'package:myca/screens/my/my_einvoice_list_screen.dart';

import 'my_support.dart';

void main() {
  tearDown(() => moneyCountry = 'IN');

  test('a foreign currency amount is grouped in thousands like ringgit, with the sign first', () {
    expect(currencyAmount('USD', 12345.6), 'USD 12,345.60');
    expect(currencyAmount('SGD', -1234567), '-SGD 1,234,567.00');
    expect(currencyAmount('MYR', 1250.5), 'RM1,250.50');
  });

  testWidgets('a US dollar e-invoice in the MyInvois list shows its total with thousands separators', (tester) async {
    const record = MyEinvoice(number: 'INV-USD-1', status: 'valid', totals: MyTotals(net: 11500, tax: 845.6, payable: 12345.6, currency: 'USD'));
    await tester.pumpWidget(myApp(myState(MyTestApi()), Scaffold(body: MyEinvoiceTile(record: record, onOpen: () {}))));
    await tester.pumpAndSettle();
    expect(find.text('USD 12,345.60'), findsOneWidget);
  });
}
