import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  testWidgets('Reports lists the saved reports and running one shows the total, the comparison and the rows with their earlier figure', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Reports');
    expect(api.queries, contains('list_reports'));
    expect(find.text('Sales by customer'), findsOneWidget);
    expect(find.text('sales by customer, this month, compared'), findsOneWidget);
    expect(find.text('Expenses this quarter'), findsOneWidget);

    await tester.tap(find.text('Sales by customer'));
    await tester.pumpAndSettle();
    expect(api.queryArgs.any((q) => q.name == 'run_report' && q.args['name'] == 'Sales by customer'), isTrue);
    expect(find.text('₹5,88,000.00'), findsOneWidget);
    expect(find.text('October 2026 · up 12% on 2026-09, ₹5,25,000.00'), findsOneWidget);
    expect(find.text('Retail Mart: ₹5,25,000.00'), findsOneWidget);
    expect(find.text('was ₹5,00,000.00'), findsOneWidget);
    expect(find.text('Gujarat Weaves: ₹63,000.00'), findsOneWidget);
    expect(find.text('was ₹25,000.00'), findsOneWidget);

    await tester.tap(find.text('Expenses this quarter'));
    await tester.pumpAndSettle();
    expect(find.text('October 2026'), findsOneWidget);
    expect(find.textContaining('was ₹'), findsNothing);
  });

  testWidgets('a new report is saved through a preview and a saved one is deleted through a preview', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Reports');

    await tester.tap(find.byTooltip('Save a report'));
    await tester.pumpAndSettle();
    expect(find.text('Save a report'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Owed by customer');
    await tester.tap(find.text('sales'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('owed').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Compare with the period before'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'save_report');
    expect(api.proposals.last.args, {'name': 'Owed by customer', 'metric': 'owed', 'groupBy': 'customer', 'period': 'this-month', 'compare': true});
    expect(find.text('Save the report Owed by customer: owed by customer for this-month, compared with the period before.'), findsOneWidget);
    await tester.tap(find.text('Yes'));
    await tester.pumpAndSettle();
    expect(api.savedReports.map((r) => r['name']), contains('Owed by customer'));
    expect(find.text('Owed by customer'), findsOneWidget);

    await tester.tap(find.byTooltip('Delete Expenses this quarter'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'delete_report');
    expect(api.proposals.last.args, {'name': 'Expenses this quarter'});
    await tester.tap(find.text('Yes'));
    await tester.pumpAndSettle();
    expect(api.savedReports.map((r) => r['name']), isNot(contains('Expenses this quarter')));
    expect(find.text('Expenses this quarter'), findsNothing);
  });

  testWidgets('with nothing saved the screen says how to start', (tester) async {
    final api = FakeMycaApi(signedIn: true)..savedReports.clear();
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Reports');
    expect(find.textContaining('No saved reports yet'), findsOneWidget);
  });
}
