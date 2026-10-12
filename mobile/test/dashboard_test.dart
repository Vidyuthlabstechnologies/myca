import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  test(
    'compact amounts read the Indian way: thousands with commas, then lakh and crore',
    () {
      expect(compactRupees(0), '₹0');
      expect(compactRupees(450), '₹450.00');
      expect(compactRupees(5000), '₹5,000');
      expect(compactRupees(42000), '₹42,000');
      expect(compactRupees(377600), '₹3.78 L');
      expect(compactRupees(100000), '₹1 L');
      expect(compactRupees(902600), '₹9.03 L');
      expect(compactRupees(12345678), '₹1.23 cr');
      expect(compactRupees(250000), '₹2.5 L');
      expect(compactRupees(1234567), '₹12.35 L');
      expect(compactRupees(-5000), '-₹5,000');
    },
  );

  test('a refused summary reads as no summary, so the panel stays hidden', () {
    expect(businessSummaryFrom({'ok': false, 'error': 'X'}), isNull);
  });

  testWidgets('Home shows this month against last month, and who owes money', (
    tester,
  ) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    expect(api.queries, contains('business_summary'));
    expect(find.text('OCTOBER 2026'), findsOneWidget);
    expect(find.text('Sold'), findsOneWidget);
    expect(find.text('₹20,000'), findsOneWidget);
    expect(find.text('last ₹9.03 L'), findsOneWidget);
    expect(find.text('Bought'), findsOneWidget);
    expect(find.text('Paid staff'), findsOneWidget);
    expect(find.text('last ₹30,000'), findsOneWidget);
    expect(find.text('₹42,000'), findsOneWidget);
    expect(find.text('last ₹0'), findsOneWidget);
    expect(find.text('Spent'), findsOneWidget);
    expect(find.text('₹5,000'), findsOneWidget);
    expect(find.text('Owed to you'), findsOneWidget);
    expect(find.text('₹3,77,600.00'), findsOneWidget);
    expect(find.text('Gujarat Weaves ₹3,77,600.00'), findsOneWidget);
  });

  testWidgets('each figure opens its register', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Spent'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Expenses'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sold'));
    await tester.pumpAndSettle();
    expect(find.text('Gujarat Weaves'), findsOneWidget);
  });
}
