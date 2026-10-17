import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  testWidgets(
    'who to pay ranks the bills, lets the owner untick one, previews the batch and posts it on yes',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await tester.pumpWidget(MycaApp(state: testState(api)));
      await tester.pumpAndSettle();
      await tapRow(tester, 'Cash');
      await tester.tap(find.text('Who to pay'));
      await tester.pumpAndSettle();

      expect(api.queries, contains('payment_run'));
      expect(find.text('Big Mills · ₹8,400.00'), findsOneWidget);
      expect(find.textContaining('MSMED pay-by date in 1 days'), findsOneWidget);
      expect(
        find.textContaining('5 days to the 180-day credit limit'),
        findsOneWidget,
      );
      expect(find.textContaining('1 bill (₹2,100.00) can wait.'), findsOneWidget);
      expect(find.text('Pay ₹14,700.00 from the bank'), findsOneWidget);

      await tester.tap(find.text('Old Trader · ₹6,300.00'));
      await tester.pumpAndSettle();
      expect(find.text('Pay ₹8,400.00 from the bank'), findsOneWidget);
      await tester.tap(find.text('Pay ₹8,400.00 from the bank'));
      await tester.pumpAndSettle();

      expect(api.proposals.last.tool, 'record_payment_run');
      expect(api.proposals.last.args, {
        'billIds': ['BILL-0001'],
        'mode': 'bank',
      });
      expect(
        find.textContaining('Bank and cash ₹2,00,000.00 before, ₹1,91,600.00 after'),
        findsOneWidget,
      );
      expect(api.paymentRuns, isEmpty);
      await tester.tap(find.text('Yes, pay them'));
      await tester.pumpAndSettle();
      expect(api.paymentRuns.single['billIds'], ['BILL-0001']);
      expect(
        find.textContaining('MyCA has posted the payments'),
        findsOneWidget,
      );
    },
  );
}
