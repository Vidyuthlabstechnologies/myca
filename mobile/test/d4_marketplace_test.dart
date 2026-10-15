import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  testWidgets('the Marketplace screen shows payouts, credits, margins, stock and registrations from the engines, and adding a registration is previewed', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Marketplace');
    expect(api.queries, containsAll(['registrations', 'settlement_status', 'marketplace_credits', 'sku_margins', 'stock_position']));
    expect(find.text('Amazon: expected ₹1,84,000.00, paid ₹1,82,500.00'), findsOneWidget);
    expect(find.textContaining('short ₹1,500.00'), findsNWidgets(2));
    expect(find.text('STL-0002 Amazon 12345678902: ₹92,000.00'), findsOneWidget);
    expect(find.text('GST TCS: ₹920.00 deducted, ₹900.00 confirmed'), findsOneWidget);
    expect(find.text('Margin ₹15,680.00 on net sales ₹42,500.00'), findsOneWidget);
    expect(find.text('SKU-B on amazon: -₹1,020.00 (-22.67%)'), findsOneWidget);
    expect(find.text('SKU-B at amazon: -1'), findsOneWidget);
    expect(find.text('Principal · 27AABCU9603R1ZN'), findsOneWidget);

    final add = find.widgetWithText(ActionChip, 'Add a registration');
    await tester.scrollUntilVisible(add, 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(add);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'GSTIN'), '29aabcu9603r1zj');
    await tester.enterText(find.widgetWithText(TextField, 'Name (optional)'), 'Amazon BLR');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'set_registration');
    expect(api.proposals.last.args, {'gstin': '29AABCU9603R1ZJ', 'kind': 'apob', 'label': 'Amazon BLR'});
    expect(find.text('Post it'), findsOneWidget);
  });

  testWidgets('a stock transfer between two registrations is proposed with both GSTINs, and Taxes shows a registration chip that scopes the GST figures', (tester) async {
    final api = FakeMycaApi(signedIn: true)..severalRegistrations = true;
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Marketplace');
    final stock = find.widgetWithText(ActionChip, 'Stock in or transfer');
    await tester.scrollUntilVisible(stock, 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(stock);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Transfer'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'SKU'), 'sku-a');
    await tester.enterText(find.widgetWithText(TextField, 'Quantity'), '40');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'record_stock_transfer');
    expect(api.proposals.last.args, {'sku': 'SKU-A', 'qty': 40, 'fromGstin': '27AABCU9603R1ZN', 'toGstin': '29AABCU9603R1ZJ'});

    await tester.pageBack();
    await tester.pumpAndSettle();
    final today = find.text('3 things need you');
    await tester.scrollUntilVisible(today, -200, scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(today);
    await tester.pumpAndSettle();
    await tester.tap(today, warnIfMissed: false);
    await tester.pumpAndSettle();
    final chip = find.text('Amazon BLR');
    await tester.scrollUntilVisible(chip, 200, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(chip, findsOneWidget);
    await tester.tap(chip);
    await tester.pumpAndSettle();
    expect(api.queryArgs.any((q) => q.name == 'gst_period_summary' && q.args['gstin'] == '29AABCU9603R1ZJ'), isTrue);
  });
}
