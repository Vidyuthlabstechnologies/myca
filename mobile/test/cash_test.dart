import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

Future<void> openCash(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
  await tapRow(tester, 'Cash');
}

void main() {
  test(
    'the forecast and the answer are read from tool results; refusals read as nothing',
    () async {
      final api = FakeMycaApi(signedIn: true);
      final forecast = CashForecast.fromTool(await api.query('cash_forecast'))!;
      expect(forecast.fromReading, isFalse);
      expect(forecast.rows.map((r) => r.label), [
        'INV-0002 from Gujarat Weaves',
        'GST for 2026-09',
        'Usual expenses',
      ]);
      expect(forecast.rows.first.incoming, isTrue);
      final answer = Affordability.fromTool(
        await api.query('can_afford', {'amount': 270000, 'on': '2026-10-05'}),
      )!;
      expect(answer.headline, 'Yes, but it is tight');
      expect(answer.detail, contains('spend up to ₹2,40,000.00'));
      expect(CashForecast.fromTool({'ok': false}), isNull);
      expect(Affordability.fromTool({'ok': false}), isNull);
    },
  );

  testWidgets(
    'without a stated balance the screen says so plainly and offers to take one',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openCash(tester, api);
      expect(find.text('BANK AND CASH NOW'), findsOneWidget);
      expect(find.text('₹10,000.00'), findsOneWidget);
      expect(find.textContaining('not your bank statement'), findsOneWidget);
      expect(find.text('NEXT 30 DAYS'), findsOneWidget);
      expect(find.text('INV-0002 from Gujarat Weaves'), findsOneWidget);
      expect(find.text('+₹20,000.00'), findsOneWidget);
      expect(
        find.textContaining('Overdue and not counted: ₹7,000.00'),
        findsOneWidget,
      );

      await tester.tap(find.text('Tell MyCA your balance today'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Bank balance'),
        '295000',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Cash in hand'),
        '5000',
      );
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(api.proposals.last.tool, 'set_cash_balance');
      expect(api.proposals.last.args, {'bank': 295000, 'cash': 5000});
      expect(find.text('Use these balances?'), findsOneWidget);
      await tester.tap(find.text('Use them'));
      await tester.pumpAndSettle();
      expect(find.text('₹3,00,000.00'), findsOneWidget);
      expect(
        find.text(
          'From the balance you gave on 5 October 2026, with what was recorded since.',
        ),
        findsOneWidget,
      );
      expect(find.text('Update balance'), findsOneWidget);
    },
  );

  testWidgets(
    'can I afford it asks the engine with the chosen day and shows the answer and the safe amount',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openCash(tester, api);
      final field = find.widgetWithText(TextField, 'Amount to spend');
      await tester.scrollUntilVisible(
        field,
        200,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.enterText(field, '270000');
      await tester.tap(find.text('Next month'));
      await tester.tap(find.text('Check'));
      await tester.pumpAndSettle();
      expect(api.queries.last, 'can_afford');
      expect(find.text('Yes, but it is tight'), findsOneWidget);
      expect(
        find.textContaining(
          'To keep a month in hand, spend up to ₹2,40,000.00.',
        ),
        findsOneWidget,
      );
      expect(api.proposals, isEmpty);
    },
  );
}
