import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/main.dart';
import 'package:myca/registers.dart';

import 'fake_api.dart';

Future<void> openExpenses(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Expenses'));
  await tester.pumpAndSettle();
}

void main() {
  test(
    'expenses group into one thread per head, newest first, with honest subtitles',
    () {
      final expenses = [
        Expense.fromJson({
          'id': 'EXP-0001',
          'date': '2026-09-01',
          'head': '5110',
          'headName': 'Rent',
          'description': 'Shop rent',
          'amount': 12000,
        }),
        Expense.fromJson({
          'id': 'EXP-0002',
          'date': '2026-10-02',
          'head': '5100',
          'headName': 'Other expenses',
          'description': 'Gifts',
          'amount': 5000,
        }),
        Expense.fromJson({
          'id': 'EXP-0003',
          'date': '2026-10-03',
          'head': '5110',
          'headName': 'Rent',
          'description': 'Godown rent',
          'amount': 8000,
        }),
      ];
      final threads = headThreadsOf(expenses);
      expect(threads.map((t) => t.name), ['Rent', 'Other expenses']);
      expect(threads.first.total, 20000);
      expect(
        headSubtitle(threads.first),
        '2 entries · ₹20,000.00 · last 3 October 2026',
      );
      expect(expensesSubtitle(expenses), '2 heads · Rent: ₹8,000.00');
      expect(expensesSubtitle(const []), 'No expenses yet');
      expect(
        headThread(expenses, '5190', 'Office and stationery').expenses,
        isEmpty,
      );
      expect(expenses[1].title, 'Gifts');
      expect(
        Expense.fromJson({'headName': 'Rent', 'payee': 'Mr Shah'}).title,
        'Mr Shah',
      );
    },
  );

  testWidgets(
    'the Expenses register lists heads as chats and opens one with its entries',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await tester.pumpWidget(MycaApp(state: testState(api)));
      await tester.pumpAndSettle();
      expect(find.text('2 heads · Other expenses: ₹5,000.00'), findsOneWidget);
      await tester.tap(find.text('Expenses'));
      await tester.pumpAndSettle();
      expect(find.text('Other expenses'), findsOneWidget);
      expect(find.text('Rent'), findsOneWidget);
      expect(
        find.text('1 entry · ₹12,000.00 · last 1 September 2026'),
        findsOneWidget,
      );

      await tester.tap(find.text('Other expenses'));
      await tester.pumpAndSettle();
      expect(find.text('Diwali gifts'), findsOneWidget);
      expect(find.text('₹5,000.00'), findsWidgets);
      expect(find.text('Cash'), findsOneWidget);
      expect(find.text('Tap to move it to the right head'), findsOneWidget);
    },
  );

  testWidgets(
    'moving an entry to another head is previewed, then posted on confirm',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openExpenses(tester, api);
      await tester.tap(find.text('Other expenses'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Diwali gifts'));
      await tester.pumpAndSettle();
      expect(api.queries, contains('expense_heads'));
      expect(find.text('Move Diwali gifts to'), findsOneWidget);
      await tester.tap(find.text('Advertising and marketing'));
      await tester.pumpAndSettle();
      expect(api.proposals.last.tool, 'set_expense_head');
      expect(api.proposals.last.args, {'id': 'EXP-0002', 'head': '5200'});
      expect(
        find.text('Move EXP-0002 to Advertising and marketing.'),
        findsOneWidget,
      );
      expect(find.text('Post it'), findsOneWidget);
      await tester.tap(find.text('Post it'));
      await tester.pumpAndSettle();
      expect(api.confirmed, isNotEmpty);
      expect(find.text('Moved EXP-0002.'), findsOneWidget);
    },
  );

  testWidgets(
    'a new expense is tagged by the engine; the owner can change the head before posting',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openExpenses(tester, api);
      await tester.tap(find.widgetWithText(ActionChip, 'Expense'));
      await tester.pumpAndSettle();
      expect(find.text('Head: automatic'), findsOneWidget);
      await tester.enterText(
        find.widgetWithText(TextField, 'What was it for'),
        'Diwali gifts',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Paid to (optional)'),
        'Gift Gallery',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Amount paid, with GST'),
        '2500',
      );
      await tester.tap(find.text('From cash'));
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(api.proposals.last.tool, 'post_expense');
      expect(api.proposals.last.args, {
        'narration': 'Diwali gifts',
        'amount': 2500,
        'gstRate': 0,
        'mode': 'cash',
        'date': '2026-10-05',
        'payee': 'Gift Gallery',
      });
      expect(
        find.text('Other expenses: Diwali gifts ₹2500 paid from cash.'),
        findsOneWidget,
      );
      expect(find.text('Under Other expenses · change'), findsOneWidget);

      await tester.tap(find.text('Under Other expenses · change'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Advertising and marketing'));
      await tester.pumpAndSettle();
      expect(api.discards, 1);
      expect(api.proposals.last.args['head'], '5200');
      expect(
        find.text(
          'Advertising and marketing: Diwali gifts ₹2500 paid from cash.',
        ),
        findsOneWidget,
      );
      expect(
        find.text('Under Advertising and marketing · change'),
        findsOneWidget,
      );
      await tester.tap(find.text('Post it'));
      await tester.pumpAndSettle();
      expect(find.text('Posted EXP-0003.'), findsOneWidget);
      expect(api.expenses.last['head'], '5200');
    },
  );

  testWidgets(
    'an empty GST field means no GST, and a blank description is refused before anything is sent',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openExpenses(tester, api);
      await tester.tap(find.widgetWithText(ActionChip, 'Expense'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Amount paid, with GST'),
        '100',
      );
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(find.text('Say what the expense was for.'), findsOneWidget);
      expect(api.proposals, isEmpty);
      await tester.enterText(
        find.widgetWithText(TextField, 'What was it for'),
        'Tea',
      );
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(api.proposals.single.args['gstRate'], 0);
      expect(api.proposals.single.args['mode'], 'bank');
    },
  );
}
