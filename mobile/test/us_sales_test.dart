import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';
import 'package:myca/registers.dart';

import 'fake_api.dart';

void main() {
  tearDown(() => moneyCountry = 'IN');

  test('a US invoice document carries sales tax by jurisdiction instead of GST heads', () async {
    final api = FakeMycaApi(signedIn: true)..country = 'US';
    final doc = InvoiceDocument.fromTool(await api.query('invoice_document', {'id': 'INV-0002'}))!;
    expect(doc.isUs, isTrue);
    expect(doc.title, 'Invoice');
    expect(doc.subtotalLabel, 'Subtotal');
    expect(doc.taxHeads, [('Sales tax (TX-AUSTIN 8.25%)', 41.25)]);
    expect(doc.lines.first.taxRate, 8.25);
    expect(doc.lines.last.taxRate, 0);
    expect(doc.missing, isEmpty);
    expect(SalesTaxRate.listFromTool(await api.query('list_sales_tax_rates')).single.code, 'TX-AUSTIN');
  });

  test('the form sends a jurisdiction or an exemption, never a GST rate, and a bill carries the tax paid', () {
    expect(
      usSaleArgs(partyName: 'Cafe Luna', description: '', amount: 500, taxJurisdiction: 'tx-austin', taxExempt: false, exemptionReason: ''),
      {
        'partyName': 'Cafe Luna',
        'partyGstin': '',
        'lines': [
          {'description': 'Supply', 'qty': 1, 'rate': 500},
        ],
        'taxJurisdiction': 'TX-AUSTIN',
      },
    );
    expect(
      usSaleArgs(partyName: 'Church', description: 'Cookies', amount: 200, taxJurisdiction: '', taxExempt: true, exemptionReason: 'Resale certificate'),
      {
        'partyName': 'Church',
        'partyGstin': '',
        'lines': [
          {'description': 'Cookies', 'qty': 1, 'rate': 200},
        ],
        'taxExempt': true,
        'exemptionReason': 'Resale certificate',
      },
    );
    expect(
      usBillArgs(partyName: 'Flour Mill Co', description: 'Flour', amount: 300, salesTaxPaid: 24.75, supplierInvoiceNo: 'FM-77'),
      {
        'partyName': 'Flour Mill Co',
        'partyGstin': '',
        'supplierInvoiceNo': 'FM-77',
        'lines': [
          {'description': 'Flour', 'qty': 1, 'rate': 300},
        ],
        'salesTaxPaid': 24.75,
      },
    );
  });

  testWidgets('a US sale asks for the sales tax jurisdiction, offers the recorded ones, and refuses to guess', (tester) async {
    final api = FakeMycaApi(signedIn: true)..country = 'US';
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Sales');
    await tester.tap(find.text('Gujarat Weaves'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ActionChip, 'Sale'));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(TextField, 'Amount before sales tax'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Amount before GST'), findsNothing);
    expect(find.widgetWithText(ActionChip, 'Quote, order or challan'), findsNothing);
    await tester.enterText(find.widgetWithText(TextField, 'Amount before sales tax'), '500');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Say which sales tax applies'), findsOneWidget);
    expect(api.proposals, isEmpty);

    await tester.ensureVisible(find.widgetWithText(ActionChip, 'TX-AUSTIN 8.25%'));
    await tester.tap(find.widgetWithText(ActionChip, 'TX-AUSTIN 8.25%'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Preview'));
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.single.tool, 'create_invoice');
    expect(api.proposals.single.args, {
      'partyName': 'Gujarat Weaves',
      'partyGstin': '',
      'lines': [
        {'description': 'Supply', 'qty': 1, 'rate': 500},
      ],
      'taxJurisdiction': 'TX-AUSTIN',
    });
  });

  testWidgets('a US invoice reads in dollars with a sales tax line and no GST', (tester) async {
    final api = FakeMycaApi(signedIn: true)..country = 'US';
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Sales');
    await tester.tap(find.text('Gujarat Weaves'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Invoice INV-0002'));
    await tester.pumpAndSettle();

    expect(find.text('INVOICE'), findsOneWidget);
    expect(find.text('Maple Street Bakery'), findsOneWidget);
    expect(find.textContaining('GSTIN'), findsNothing);
    expect(find.text('1 × \$500.00 · tax 8.25%'), findsOneWidget);
    expect(find.text('1 × \$40.00 · not taxed'), findsOneWidget);
    final list = find.byType(Scrollable).last;
    await tester.scrollUntilVisible(find.text('Subtotal'), 200, scrollable: list);
    await tester.pumpAndSettle();
    expect(find.text('Sales tax (TX-AUSTIN 8.25%)'), findsOneWidget);
    expect(find.text('\$41.25'), findsOneWidget);
    expect(find.text('\$581.25'), findsWidgets);
    expect(find.textContaining('GST'), findsNothing);
  });
}
