import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

Future<void> openCustomer(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
  await tapRow(tester, 'Sales');
  await tester.tap(find.text('Gujarat Weaves'));
  await tester.pumpAndSettle();
}

Future<void> openQuote(WidgetTester tester, FakeMycaApi api) async {
  await openCustomer(tester, api);
  await tester.tap(find.text('Quote QT-0001'));
  await tester.pumpAndSettle();
}

Future<void> tapChip(WidgetTester tester, String label) async {
  final chip = find.widgetWithText(ActionChip, label);
  await tester.scrollUntilVisible(
    chip,
    200,
    scrollable: find.byType(Scrollable).last,
  );
  await tester.tap(chip);
  await tester.pumpAndSettle();
}

void main() {
  test('a quote reads as expired only once open past its validity', () {
    final quote = Quote.fromJson({
      'status': 'open',
      'validUntil': '2026-10-20',
    });
    expect(quote.stateOn('2026-10-20'), 'open');
    expect(quote.stateOn('2026-10-21'), 'expired');
    expect(
      Quote.fromJson({
        'status': 'accepted',
        'validUntil': '2026-01-01',
      }).stateOn('2026-10-21'),
      'accepted',
    );
  });

  testWidgets('the customer chat shows the quote with its state and validity', (
    tester,
  ) async {
    final api = FakeMycaApi(signedIn: true);
    await openCustomer(tester, api);
    expect(find.text('Quote QT-0001'), findsOneWidget);
    expect(find.text('Open'), findsOneWidget);
    expect(find.text('Valid until 20 October 2026'), findsOneWidget);
    final quoteTop = tester.getTopLeft(find.text('Quote QT-0001')).dy;
    final invoiceTop = tester.getTopLeft(find.text('Invoice INV-0002')).dy;
    expect(
      invoiceTop,
      lessThan(quoteTop),
      reason: 'August invoice comes before a September quote',
    );
  });

  testWidgets(
    'a quote is made from the customer chat and posts nothing to the books',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openCustomer(tester, api);
      await tester.tap(find.widgetWithText(ActionChip, 'Quote, order or challan'));
      await tester.pumpAndSettle();
      expect(find.text('New quote'), findsOneWidget);
      await tester.enterText(
        find.widgetWithText(TextField, 'Amount before GST'),
        '50000',
      );
      await tester.enterText(find.widgetWithText(TextField, 'GST'), '18');
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(api.proposals.last.tool, 'create_quote');
      expect(api.proposals.last.args['partyName'], 'Gujarat Weaves');
      expect(api.proposals.last.args['lines'], [
        {'description': 'Supply', 'qty': 1, 'rate': 50000, 'gstRate': 18},
      ]);
      expect(
        find.text(
          'Quote to Gujarat Weaves: total ₹59,000.00. Valid until 2026-11-04.',
        ),
        findsOneWidget,
      );
      await tester.tap(find.text('Post it'));
      await tester.pumpAndSettle();
      expect(find.text('Quote QT-0002'), findsOneWidget);
      expect(api.invoices.length, 2, reason: 'a quote is not an invoice');
    },
  );

  testWidgets(
    'the quote screen shows validity and offers Make invoice, Accepted and Declined, not invoice actions',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openQuote(tester, api);
      expect(find.text('Quote QT-0001'), findsWidgets);
      expect(find.text('QUOTATION'), findsOneWidget);
      expect(find.text('VALID UNTIL'), findsOneWidget);
      expect(find.text('20 October 2026'), findsOneWidget);
      expect(api.queries, contains('quote_document'));
      await tester.scrollUntilVisible(
        find.widgetWithText(ActionChip, 'Make invoice'),
        200,
        scrollable: find.byType(Scrollable).last,
      );
      expect(find.widgetWithText(ActionChip, 'Accepted'), findsOneWidget);
      expect(find.widgetWithText(ActionChip, 'Declined'), findsOneWidget);
      expect(find.widgetWithText(ActionChip, 'Credit note'), findsNothing);
      expect(find.widgetWithText(ActionChip, 'Remind me'), findsNothing);
      expect(find.widgetWithText(ActionChip, 'Ask my CA'), findsNothing);
    },
  );

  testWidgets(
    'accepting then making the invoice goes through previews and links the two',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openQuote(tester, api);
      await tapChip(tester, 'Accepted');
      expect(api.proposals.last.tool, 'mark_quote');
      expect(api.proposals.last.args, {'id': 'QT-0001', 'outcome': 'accepted'});
      await tester.tap(find.text('Post it'));
      await tester.pumpAndSettle();
      expect(find.text('Accepted by the customer'), findsOneWidget);

      await tapChip(tester, 'Make invoice');
      expect(api.proposals.last.tool, 'convert_quote');
      expect(api.proposals.last.args, {'id': 'QT-0001', 'date': '2026-10-05'});
      expect(
        find.text(
          'From quote QT-0001: Invoice to Gujarat Weaves, total ₹59,000.00.',
        ),
        findsOneWidget,
      );
      await tester.tap(find.text('Post it'));
      await tester.pumpAndSettle();
      expect(find.text('Invoiced as INV-0003'), findsOneWidget);
      expect(find.widgetWithText(ActionChip, 'Make invoice'), findsNothing);
    },
  );
}
