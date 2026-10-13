import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

Future<void> openInvoice(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
  await tapRow(tester, 'Sales');
  await tester.tap(find.text('Gujarat Weaves'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Invoice INV-0002'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a debit note needs an amount and a reason, is previewed, and shows on the invoice once posted', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openInvoice(tester, api);
    final list = find.byType(Scrollable).last;
    await tester.scrollUntilVisible(find.text('Debit note'), 200, scrollable: list);
    await tester.tap(find.text('Debit note'));
    await tester.pumpAndSettle();
    expect(find.text('Debit note against INV-0002'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Reason'), 'Price revised');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(find.text('Enter the amount to add, with GST.'), findsOneWidget);
    expect(api.proposals, isEmpty);

    await tester.enterText(find.widgetWithText(TextField, 'Amount to add, with GST'), '1180');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.single.tool, 'create_debit_note');
    expect(api.proposals.single.args, {'invoiceId': 'INV-0002', 'date': '2026-10-05', 'reason': 'Price revised', 'amount': 1180});
    expect(find.textContaining('Debit note of ₹1180 against INV-0002'), findsOneWidget);

    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(api.confirmed, isNotEmpty);
    expect(find.text('Added by debit note'), findsOneWidget);
    expect(find.textContaining('Debit note DN-0001 on 5 October 2026: Price revised'), findsOneWidget);
  });
}
