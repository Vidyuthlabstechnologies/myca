import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/sales_tax_screen.dart';

import 'fake_api.dart';

void main() {
  tearDown(() => moneyCountry = 'IN');

  test('the overview reads each state with its latest period, and the words say what is due', () async {
    final api = FakeMycaApi(signedIn: true)
      ..country = 'US'
      ..salesTaxStates.add({'state': 'TX', 'frequency': 'quarterly'});
    moneyCountry = 'US';
    final overview = SalesTaxOverview.fromTool(await api.query('sales_tax_overview'))!;
    expect(overview.hasNexus, isTrue);
    final tx = overview.states.single;
    expect(tx.state, 'TX');
    expect(tx.lastPeriod!.toPay, 53.75);
    expect(salesTaxPeriodWords(tx.lastPeriod!), '2026-Q3: collected \$53.75, to pay \$53.75, due October 20, 2026');
    api.salesTaxFiled = true;
    final filed = SalesTaxOverview.fromTool(await api.query('sales_tax_overview'))!.states.single.lastPeriod!;
    expect(salesTaxPeriodWords(filed), '2026-Q3: filed on October 5, 2026, confirmation TX778899');
    expect(SalesTaxOverview.fromTool(await (FakeMycaApi(signedIn: true)..country = 'US').query('sales_tax_overview'))!.hasNexus, isFalse);
  });

  testWidgets('a US owner sets up a state from Home, then reviews, pays and records the filing without MyCA filing anything', (tester) async {
    final api = FakeMycaApi(signedIn: true)..country = 'US';
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();

    expect(find.text('SALES TAX'), findsOneWidget);
    expect(find.text('Set up sales tax'), findsOneWidget);
    expect(find.text('TAXES AND FILINGS'), findsNothing);
    await tester.tap(find.text('Set up sales tax'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Add a state'));
    await tester.tap(find.text('Add a state'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'State code'), 'tx');
    await tester.ensureVisible(find.text('Preview'));
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'set_sales_tax_nexus');
    expect(api.proposals.last.args, {'state': 'TX', 'frequency': 'quarterly'});
    await tester.ensureVisible(find.text('Post it'));
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(find.text('TX · quarterly'), findsOneWidget);
    expect(find.textContaining('to pay \$53.75, due October 20, 2026'), findsOneWidget);

    await tester.tap(find.text('TX · quarterly'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Review the 2026-Q3 return'));
    await tester.tap(find.text('Review the 2026-Q3 return'));
    await tester.pumpAndSettle();
    expect(api.queries, contains('sales_tax_review'));
    expect(find.text('Sales in TX for 2026-Q3'), findsOneWidget);
    await tester.tap(find.text('Yes, correct'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'sales_tax_review_answer');
    expect(api.proposals.last.args['state'], 'TX');
    expect(api.proposals.last.args['draftHash'], 'd' * 64);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Record a payment'));
    await tester.tap(find.text('Record a payment'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Reference (optional)'), 'txpay1');
    await tester.ensureVisible(find.text('Preview'));
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'record_sales_tax_payment');
    expect(api.proposals.last.args, {'state': 'TX', 'period': '2026-Q3', 'date': '2026-10-05', 'reference': 'txpay1'});
    await tester.ensureVisible(find.text('Post it'));
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(find.textContaining('to pay \$0.00'), findsOneWidget);

    await tester.ensureVisible(find.text('Record the filing'));
    await tester.tap(find.text('Record the filing'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Preview'));
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(find.text('Enter the confirmation number the state gave you.'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Confirmation number'), 'tx778899');
    await tester.ensureVisible(find.text('Preview'));
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'record_sales_tax_filing');
    expect(api.proposals.last.args, {'state': 'TX', 'period': '2026-Q3', 'confirmation': 'TX778899', 'filedOn': '2026-10-05'});
    await tester.ensureVisible(find.text('Post it'));
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(find.textContaining('filed on October 5, 2026, confirmation TX778899'), findsOneWidget);
    expect(find.textContaining('GST'), findsNothing);
  });
}
