import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

Future<void> openTaxes(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
  await tester.tap(find.text('3 things need you'));
  await tester.pumpAndSettle();
}

void main() {
  test('the payment model reads the set-off, the late charges and the notes', () {
    final gst = PeriodGst.fromJson({
      'period': '2026-08',
      'periods': ['2026-08'],
      'salesCount': 2,
      'purchaseCount': 1,
      'taxableSales': 150000,
      'outputTax': {'igst': 9000, 'cgst': 2500, 'sgst': 2500, 'total': 14000},
      'inputCredit': {'igst': 0, 'cgst': 1000, 'sgst': 1000, 'total': 2000},
      'gstr1': {'fp': '082026', 'b2b': 2, 'b2cl': 0, 'b2cs': 0, 'held': [], 'warnings': [], 'caveat': ''},
      'payment': {
        'period': '2026-08',
        'output': {'igst': 9000, 'cgst': 2500, 'sgst': 2500, 'total': 14000},
        'credit': {'igst': 0, 'cgst': 1000, 'sgst': 1000, 'total': 2000},
        'broughtForward': {'igst': 100, 'cgst': 0, 'sgst': 0, 'total': 100},
        'broughtForwardKnown': true,
        'creditUsed': 2100,
        'cash': {'igst': 8900, 'cgst': 1500, 'sgst': 1500, 'total': 11900},
        'toPay': 11900,
        'carried': {'igst': 0, 'cgst': 0, 'sgst': 0, 'total': 0},
        'dueDate': '2026-09-20',
        'filed': {'arn': 'AA2708261234567', 'filedOn': '2026-09-18'},
        'late': {'payOn': '2026-10-12', 'days': 22, 'interest': 129.1, 'lateFee': 1100, 'total': 13129.1},
        'unreviewed': true,
        'notes': ['one', 'two'],
      },
    });
    final pay = gst.payment!;
    expect(pay.toPay, 11900);
    expect(pay.cash.igst, 8900);
    expect(pay.broughtForwardKnown, isTrue);
    expect(pay.filedArn, 'AA2708261234567');
    expect(pay.late!.days, 22);
    expect(pay.notes, ['one', 'two']);
    expect(PeriodGst.fromJson({'period': '2026-08', 'gstr1': {}}).payment, isNull);
  });

  testWidgets('Taxes shows the cash to pay after set-off, the due date, and the late charges for an overdue month', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openTaxes(tester, api);
    await tester.scrollUntilVisible(find.text('To pay in cash'), 200);
    expect(find.text('To pay in cash'), findsOneWidget);
    expect(find.text('Credit used ₹0.00'), findsOneWidget);
    expect(find.text('Due by 20 November 2026.'), findsOneWidget);
    expect(find.textContaining('head by head'), findsOneWidget);
    await tester.scrollUntilVisible(find.widgetWithText(ChoiceChip, 'August 2026'), -200);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ChoiceChip, 'August 2026'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('To pay in cash'), 200);
    expect(find.text('IGST ₹9,000.00 · CGST ₹1,500.00 · SGST ₹1,500.00'), findsOneWidget);
    expect(find.text('Credit used ₹2,000.00'), findsOneWidget);
    expect(
      find.text('If paid today, 22 days late: interest ₹130.19 and late fee ₹1,100.00, ₹13,230.19 in all.'),
      findsOneWidget,
    );
    expect(find.textContaining('has not reviewed yet'), findsOneWidget);
  });
}
