import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/statements_screen.dart';

import 'fake_api.dart';

void main() {
  test('periods follow the financial year in India and the calendar year in the US', () {
    final today = DateTime(2026, 11, 6);
    expect(statementSpan(StatementPeriod.thisYear, today), (from: '2026-04-01', to: '2026-11-06'));
    expect(statementSpan(StatementPeriod.lastYear, today), (from: '2025-04-01', to: '2026-03-31'));
    expect(statementSpan(StatementPeriod.thisMonth, today), (from: '2026-11-01', to: '2026-11-06'));
    expect(statementSpan(StatementPeriod.lastMonth, today), (from: '2026-10-01', to: '2026-10-31'));
    expect(statementSpan(StatementPeriod.thisYear, DateTime(2027, 2, 10)), (from: '2026-04-01', to: '2027-02-10'));
    expect(statementSpan(StatementPeriod.thisYear, today, yearStartMonth: 1), (from: '2026-01-01', to: '2026-11-06'));
    expect(statementSpan(StatementPeriod.lastMonth, DateTime(2026, 1, 15)), (from: '2025-12-01', to: '2025-12-31'));
  });

  testWidgets('Statements opens from Home on profit and loss and switches to the balance sheet and cash flow', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    final saved = <String, String>{};
    final state = AppState(
      api: api,
      store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
      pickTextFile: (_) async => null,
      saveTextFile: (name, content) async {
        saved[name] = content;
        return true;
      },
      now: () => DateTime(2026, 10, 5, 22, 30),
    );
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Statements');
    expect(api.queries, contains('profit_and_loss'));
    expect(find.textContaining('a profit of ₹75,000.00'), findsOneWidget);
    expect(find.text('Net profit'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Save as CSV'), 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Save as CSV'));
    await tester.pumpAndSettle();
    expect(saved.keys, ['profit_and_loss_27AABCU9603R1ZN_2026-04-01_2026-10-14.csv']);
    await tester.scrollUntilVisible(find.text('Balance sheet'), -200, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Balance sheet'));
    await tester.pumpAndSettle();
    expect(find.textContaining('It balances.'), findsOneWidget);
    expect(find.text('Profit to date'), findsOneWidget);
    await tester.tap(find.text('Cash flow'));
    await tester.pumpAndSettle();
    expect(find.text('Received from customers'), findsOneWidget);
    expect(find.textContaining('In ₹1,40,000.00'), findsOneWidget);
  });

  testWidgets('a customer statement shows each entry with its running balance, and an unknown name says who exists', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MaterialApp(home: AppScope(state: testState(api), child: const StatementsScreen(initial: StatementKind.customer, customer: 'Kiran Stores'))));
    await tester.pumpAndSettle();
    expect(find.textContaining('owes you ₹6,800.00'), findsOneWidget);
    expect(find.text('Payment received INV-0001'), findsOneWidget);
    expect(find.textContaining('paid ₹5,000.00'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Nobody');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(find.textContaining('Customers include: Kiran Stores'), findsOneWidget);
  });
}
