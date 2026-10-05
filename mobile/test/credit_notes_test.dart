import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/main.dart';
import 'package:myca/registers.dart';

import 'fake_api.dart';

Future<void> openInvoice(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Sales'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Gujarat Weaves'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Invoice INV-0002'));
  await tester.pumpAndSettle();
}

Future<void> scrollToActions(WidgetTester tester) async {
  final list = find.byType(Scrollable).last;
  await tester.scrollUntilVisible(find.text('Print or save as PDF'), 200, scrollable: list);
  await tester.drag(list, const Offset(0, -900));
  await tester.pumpAndSettle();
}

void main() {
  test('a cancelled or settled invoice is not open, so it is not offered for payment', () {
    final cancelled = Invoice.fromJson({'id': 'INV-0001', 'status': 'cancelled', 'partyName': 'A', 'total': 10});
    final settled = Invoice.fromJson({'id': 'INV-0002', 'status': 'settled', 'partyName': 'A', 'total': 10});
    final open = Invoice.fromJson({'id': 'INV-0003', 'status': 'posted', 'partyName': 'A', 'total': 10});
    final party = partiesOf([cancelled, settled, open]).single;
    expect(party.unpaid.map((i) => i.id), ['INV-0003']);
    expect(lastEntryLine(cancelled, RegisterKind.sales), 'Invoice INV-0001, ₹10.00, cancelled');
  });

  testWidgets('a credit note is previewed with the engine summary and posted on confirm; the chat and invoice show it', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openInvoice(tester, api);
    await scrollToActions(tester);
    await tester.tap(find.text('Credit note'));
    await tester.pumpAndSettle();
    expect(find.text('Credit note against INV-0002'), findsOneWidget);
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Say why'), findsOneWidget);
    expect(api.proposals, isEmpty);

    await tester.enterText(find.widgetWithText(TextField, 'Amount, with GST (optional)'), '23600');
    await tester.enterText(find.widgetWithText(TextField, 'Reason'), 'Design work not done');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.single.tool, 'create_credit_note');
    expect(api.proposals.single.args, {'invoiceId': 'INV-0002', 'date': '2026-10-05', 'reason': 'Design work not done', 'amount': 23600});
    expect(find.textContaining('Credit note of ₹23600 against INV-0002'), findsOneWidget);
    expect(find.text('Post it'), findsOneWidget);

    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(api.confirmed, isNotEmpty);
    expect(find.text('Credited back'), findsOneWidget);
    expect(find.text('₹23,600.00'), findsWidgets);
    expect(find.text('₹2,54,000.00'), findsOneWidget);
    expect(find.textContaining('Credit note CN-0001 on 5 October 2026: Design work not done'), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Credit note CN-0001 against INV-0002: Design work not done'), findsOneWidget);
    expect(find.text('−₹23,600.00'), findsOneWidget);
  });

  testWidgets('cancelling an invoice marks it cancelled, disables sending, and the customer chat says so', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openInvoice(tester, api);
    await scrollToActions(tester);
    await tester.tap(find.text('Cancel invoice'));
    await tester.pumpAndSettle();
    expect(find.text('Cancel INV-0002?'), findsOneWidget);
    expect(find.textContaining('has paid ₹1,00,000.00; that becomes due back'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Reason (optional)'), 'Order withdrawn');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.single.tool, 'cancel_invoice');
    expect(api.proposals.single.args, {'invoiceId': 'INV-0002', 'date': '2026-10-05', 'reason': 'Order withdrawn'});
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(find.textContaining('This invoice is cancelled by a credit note'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Print or save as PDF'), 200, scrollable: find.byType(Scrollable).last);
    expect(find.text('Credit note'), findsNothing);
    expect(find.text('Cancel invoice'), findsNothing);
    final send = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Send to Gujarat Weaves'));
    expect(send.onPressed, isNull);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Cancelled'), findsOneWidget);
    expect(find.text('Cancelled INV-0002: Order withdrawn'), findsOneWidget);
    expect(find.widgetWithText(ActionChip, 'Payment received'), findsNothing);
  });
}
