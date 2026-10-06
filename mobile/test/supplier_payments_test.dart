import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

Future<void> openSupplier(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
  await tapRow(tester, 'Purchases');
  await tester.tap(find.text('Fabric Co'));
  await tester.pumpAndSettle();
}

void main() {
  test('what is owed on a bill is its total less the payments against it', () {
    final bill = Invoice.fromJson({
      'id': 'BILL-0001',
      'total': 42000,
      'status': 'partial',
      'payments': [
        {'amount': 10000, 'date': '2026-09-01', 'mode': 'bank'},
        {'amount': 2000, 'date': '2026-09-02', 'mode': 'cash'},
      ],
    });
    expect(bill.owed, 30000);
    expect(bill.partial, isTrue);
    expect(bill.open, isTrue);
    expect(Invoice.fromJson({'total': 500, 'status': 'posted'}).owed, 500);
  });

  testWidgets(
    'a bill is paid from the supplier chat: the whole balance is offered, previewed, and posted on confirm',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openSupplier(tester, api);
      expect(find.text('Unpaid'), findsOneWidget);
      await tester.tap(find.widgetWithText(ActionChip, 'Paid'));
      await tester.pumpAndSettle();
      expect(find.text('Payment made'), findsOneWidget);
      expect(find.text('BILL-0001 · ₹42,000.00 owed'), findsOneWidget);
      expect(
        tester
            .widget<TextField>(find.widgetWithText(TextField, 'Amount paid'))
            .controller!
            .text,
        '42000',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Amount paid'),
        '12000',
      );
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(api.proposals.last.tool, 'record_payment');
      expect(api.proposals.last.args, {
        'billId': 'BILL-0001',
        'amount': 12000,
        'mode': 'bank',
        'date': '2026-10-05',
      });
      expect(
        api.purchases.first['payments'],
        isNull,
        reason: 'nothing before confirming',
      );
      await tester.tap(find.text('Post it'));
      await tester.pumpAndSettle();
      expect(find.text('Part paid'), findsOneWidget);
      expect(find.text('₹30,000.00 still owed'), findsOneWidget);
      expect(find.text('Paid by bank against BILL-0001'), findsOneWidget);
    },
  );

  testWidgets(
    'home shows what you owe suppliers beside what customers owe you',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await tester.pumpWidget(MycaApp(state: testState(api)));
      await tester.pumpAndSettle();
      expect(find.text('You owe suppliers'), findsOneWidget);
      expect(find.text('Fabric Co ₹42,000.00'), findsOneWidget);
    },
  );
}
