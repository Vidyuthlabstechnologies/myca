import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

Future<void> openEmployees(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
  await tapRow(tester, 'Employees');
}

void main() {
  test('a refusal for privacy reads plainly', () {
    final list = EmployeeList.fromTool({
      'ok': false,
      'error': 'SALARIES_PRIVATE',
    });
    expect(list.error, 'Only the owner can see employees and salaries.');
    expect(list.employees, isEmpty);
  });

  testWidgets(
    'the owner adds an employee with a salary in parts, previewed first',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openEmployees(tester, api);
      expect(
        find.text('1 employee, ₹25,000.00 a month before deductions.'),
        findsOneWidget,
      );
      expect(find.textContaining('not worked out yet'), findsOneWidget);

      await tester.tap(find.text('Add employee'));
      await tester.pumpAndSettle();
      await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Meena');
      await tester.enterText(find.widgetWithText(TextField, 'Basic'), '15000');
      await tester.enterText(
        find.widgetWithText(TextField, 'HRA (optional)'),
        '6000',
      );
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(api.proposals.last.tool, 'add_employee');
      expect(api.proposals.last.args, {
        'name': 'Meena',
        'joinedOn': '2026-10-05',
        'components': [
          {'name': 'Basic', 'amount': 15000},
          {'name': 'HRA', 'amount': 6000},
        ],
        'pfMember': false,
        'esiMember': false,
      });
      expect(api.employees.length, 1, reason: 'nothing before posting');
      await tester.tap(find.text('Post it'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      expect(
        find.text('2 employees, ₹46,000.00 a month before deductions.'),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'an employee\'s salary history shows, and leaving moves them to Left',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openEmployees(tester, api);
      await tester.tap(find.text('Ravi Kumar'));
      await tester.pumpAndSettle();
      expect(find.text('₹25,000.00 a month'), findsOneWidget);
      expect(
        find.textContaining('Basic ₹15,000.00 + HRA ₹10,000.00'),
        findsOneWidget,
      );
      await tester.tap(find.text('Record leaving'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(api.proposals.last.args, {
        'id': 'EMP-0001',
        'leftOn': '2026-10-05',
      });
      await tester.tap(find.text('Post it'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      expect(find.text('LEFT'), findsOneWidget);
      expect(find.text('Left 5 October 2026'), findsOneWidget);
    },
  );
}
