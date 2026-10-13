import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

Future<void> openTaxesTds(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
  await tester.tap(find.text('3 things need you'));
  await tester.pumpAndSettle();
  await tester.scrollUntilVisible(
    find.text('TDS'),
    200,
    scrollable: find.byType(Scrollable).first,
  );
}

Future<void> openBill(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
  await tapRow(tester, 'Purchases');
  await tester.tap(find.text('Fabric Co'));
  await tester.pumpAndSettle();
  await tester.tap(find.widgetWithText(ActionChip, 'Bill'));
  await tester.pumpAndSettle();
}

void main() {
  test('the TDS summary reads plainly, and a refusal is no summary', () {
    final summary = TdsSummary.fromTool({
      'ok': true,
      'data': {
        'deductor': true,
        'due': 6000,
        'months': [
          {'month': '2026-10', 'deducted': 6000, 'depositBy': '2026-11-07'},
        ],
      },
    })!;
    expect(summary.due, 6000);
    expect(summary.months.single.depositBy, '2026-11-07');
    expect(TdsSummary.fromTool({'ok': false, 'error': 'X'}), isNull);
  });

  testWidgets(
    'a business that does not deduct TDS can add its TAN from Taxes, previewed first',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openTaxesTds(tester, api);
      final setup = find.text('Deduct TDS on bills');
      await tester.ensureVisible(setup);
      await tester.tap(setup);
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'TAN'),
        'muma 12345 b',
      );
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(api.proposals.last.tool, 'set_tds_deductor');
      expect(api.proposals.last.args, {'tan': 'MUMA12345B'});
      expect(api.tdsDeductor, isFalse, reason: 'nothing before posting');
      await tester.tap(find.text('Post it'));
      await tester.pumpAndSettle();
      expect(api.tdsDeductor, isTrue);
    },
  );

  testWidgets(
    'a deductor sees what is still to deposit and records a challan',
    (tester) async {
      final api = FakeMycaApi(signedIn: true)..tdsDeductor = true;
      await openTaxesTds(tester, api);
      expect(find.text('₹6,000.00 deducted in October 2026'), findsOneWidget);
      expect(find.text('Deposit by 7 November 2026'), findsOneWidget);
      final due = find.text('₹6,000.00 still to deposit');
      await tester.ensureVisible(due);
      await tester.tap(due);
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Challan reference'),
        '0510308 05112026 12345',
      );
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(api.proposals.last.tool, 'record_tds_deposit');
      expect(api.proposals.last.args, {
        'challan': '0510308 05112026 12345',
        'date': '2026-10-05',
      });
      await tester.tap(find.text('Post it'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      final left = find.text('Nothing left to deposit');
      await tester.ensureVisible(left);
      expect(left, findsOneWidget);
    },
  );

  testWidgets('a bill offers no TDS to a business that does not deduct it', (
    tester,
  ) async {
    await openBill(tester, FakeMycaApi(signedIn: true));
    expect(find.text('TDS to deduct'), findsNothing);
  });

  testWidgets(
    'a deductor\'s bill asks for the PAN before previewing, then sends the TDS terms',
    (tester) async {
      final api = FakeMycaApi(signedIn: true)..tdsDeductor = true;
      await openBill(tester, api);
      await tester.tap(find.text('No TDS'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Professional fees (194J)').last);
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Amount before GST'),
        '60000',
      );
      await tester.enterText(find.widgetWithText(TextField, 'GST'), '18');
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(find.textContaining("Enter the payee's PAN"), findsOneWidget);
      expect(api.proposals, isEmpty);
      await tester.enterText(
        find.widgetWithText(TextField, "Payee's PAN"),
        'aaafr1234k',
      );
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(api.proposals.single.tool, 'create_purchase');
      expect(api.proposals.single.args['tdsSection'], '194J');
      expect(api.proposals.single.args['tdsCategory'], 'professional');
      expect(api.proposals.single.args['payeePan'], 'AAAFR1234K');
    },
  );
}
