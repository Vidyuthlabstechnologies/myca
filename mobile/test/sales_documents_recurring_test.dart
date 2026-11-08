import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/invoice_screen.dart';

import 'fake_api.dart';

Future<void> openCustomer(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
  await tapRow(tester, 'Sales');
  await tester.tap(find.text('Gujarat Weaves'));
  await tester.pumpAndSettle();
}

void main() {
  test('sales documents read their kind, and only quotes and proformas expire', () {
    final order = Quote.fromJson({'id': 'SO-0001', 'kind': 'order', 'status': 'open', 'validUntil': '2026-01-01'});
    expect(order.label, 'Sales order');
    expect(order.stateOn('2026-10-21'), 'open');
    final proforma = Quote.fromJson({'id': 'PI-0001', 'kind': 'proforma', 'status': 'open', 'validUntil': '2026-01-01'});
    expect(proforma.stateOn('2026-10-21'), 'expired');
    expect(Quote.fromJson({'kind': 'nonsense'}).kind, 'quote');
    expect(salesKindOfId('DC-0004'), 'challan');
    expect(salesKindOfId('QT-0004'), 'quote');
    final challan = InvoiceDocument.fromTool({'ok': true, 'data': {'id': 'DC-0001', 'kind': 'quote', 'documentKind': 'challan', 'reason': 'job-work', 'status': 'open'}})!;
    expect(challan.title, 'Delivery challan');
    expect(challan.canInvoice, isFalse);
    expect(challan.canReturn, isTrue);
    expect(challan.canAccept, isFalse);
    final quote = InvoiceDocument.fromTool({'ok': true, 'data': {'id': 'QT-0001', 'kind': 'quote', 'status': 'open'}})!;
    expect(quote.title, 'Quotation');
    expect(quote.canAccept, isTrue);
  });

  test('repeating entries read from the list', () {
    final rows = recurringFrom({
      'ok': true,
      'data': {
        'schedules': [
          {'id': 'RP-0001', 'kind': 'invoice', 'every': 'month', 'party': 'ABC Ltd', 'amount': 29500, 'nextDate': '2026-12-01', 'status': 'active', 'count': 2, 'last': {'date': '2026-11-01', 'id': 'INV-0009'}},
        ],
      },
    });
    expect(rows.single.kindWords, 'Invoice to');
    expect(rows.single.lastId, 'INV-0009');
    expect(rows.single.active, isTrue);
  });

  testWidgets('a delivery challan for job work is made from the customer page', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openCustomer(tester, api);
    await tester.tap(find.widgetWithText(ActionChip, 'Quote, order or challan'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('kind.challan')));
    await tester.pumpAndSettle();
    expect(find.text('New delivery challan'), findsOneWidget);
    expect(find.text('Sent for job work'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Amount before GST'), '50000');
    await tester.enterText(find.widgetWithText(TextField, 'GST'), '5');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'create_quote');
    expect(api.proposals.last.args['kind'], 'challan');
    expect(api.proposals.last.args['reason'], 'job-work');
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(find.text('Delivery challan DC-0001'), findsOneWidget);
    expect(api.invoices.length, 2, reason: 'a challan is not an invoice');
  });

  testWidgets('a job-work challan offers Goods came back, not Make invoice', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    api.quotes.add({'id': 'DC-0001', 'kind': 'challan', 'reason': 'job-work', 'date': '2026-10-05', 'partyName': 'Gujarat Weaves', 'partyGstin': '', 'total': 52500, 'validUntil': '2026-11-04', 'status': 'open', 'invoiceId': ''});
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    final navigator = tester.state<NavigatorState>(find.byType(Navigator).first);
    navigator.push(MaterialPageRoute<void>(builder: (_) => const InvoiceScreen(invoiceId: 'DC-0001', quote: true)));
    await tester.pumpAndSettle();
    expect(find.text('Delivery challan DC-0001'), findsWidgets);
    await tester.scrollUntilVisible(find.widgetWithText(ActionChip, 'Goods came back'), 200, scrollable: find.byType(Scrollable).last);
    expect(find.widgetWithText(ActionChip, 'Make invoice'), findsNothing);
    expect(find.widgetWithText(ActionChip, 'Accepted'), findsNothing);
    await tester.tap(find.widgetWithText(ActionChip, 'Goods came back'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'mark_quote');
    expect(api.proposals.last.args, {'id': 'DC-0001', 'outcome': 'returned'});
  });

  testWidgets('a sale can be set to repeat every month from the customer page', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openCustomer(tester, api);
    await tester.tap(find.widgetWithText(ActionChip, 'Sale'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Amount before GST'), '25000');
    await tester.enterText(find.widgetWithText(TextField, 'GST'), '18');
    final repeat = find.byKey(const ValueKey('repeat.every'));
    await tester.scrollUntilVisible(repeat, 200, scrollable: find.byType(Scrollable).last);
    await tester.tap(repeat);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Every month').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'add_recurring');
    expect(api.proposals.last.args['kind'], 'invoice');
    expect(api.proposals.last.args['every'], 'month');
    expect(api.proposals.last.args['partyName'], 'Gujarat Weaves');
    expect(api.proposals.last.args.containsKey('supplierInvoiceNo'), isFalse);
  });

  testWidgets('the repeating entries screen lists, adds and stops', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    api.recurring.add({'id': 'RP-0001', 'kind': 'invoice', 'every': 'month', 'party': 'ABC Ltd', 'amount': 29500, 'startDate': '2026-08-01', 'endDate': '', 'nextDate': '2026-11-01', 'status': 'active', 'count': 3, 'lastError': '', 'last': {'date': '2026-10-01', 'id': 'INV-0007'}});
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Repeating entries');
    expect(find.text('Invoice to ABC Ltd'), findsOneWidget);
    expect(find.textContaining('Every month · next 1 November 2026 · 3 made'), findsOneWidget);
    await tester.tap(find.widgetWithText(TextButton, 'Stop'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'stop_recurring');
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextButton, 'Stop'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('recurring.add')));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'What it is for'), 'Broadband');
    await tester.enterText(find.widgetWithText(TextField, 'Amount paid each time'), '1180');
    await tester.enterText(find.widgetWithText(TextField, 'GST rate inside the amount (optional)'), '18');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'add_recurring');
    expect(api.proposals.last.args['kind'], 'expense');
    expect(api.proposals.last.args['amount'], 1180);
    expect(api.proposals.last.args['gstRate'], 18);
  });
}
