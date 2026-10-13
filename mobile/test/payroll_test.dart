import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  test('the payroll model reads rows, totals and the state of the month', () {
    final run = PayrollRun.fromTool({
      'ok': true,
      'data': {
        'period': '2026-10',
        'month': 'October 2026',
        'status': 'approved',
        'employees': 1,
        'rows': [
          {'employeeId': 'EMP-0001', 'name': 'Ravi', 'daysWorked': 16, 'daysInMonth': 31, 'gross': 9290.32, 'deductions': 100, 'net': 9190.32, 'notes': ['x']},
        ],
        'totals': {'gross': 9290.32, 'pfEmployee': 0, 'esiEmployee': 0, 'pt': 0, 'tds': 0, 'deductions': 100, 'net': 9190.32, 'employerContributions': 500, 'employerCost': 9790.32},
        'notes': [],
        'draftHash': 'd' * 64,
        'approvedOn': '2026-10-05',
        'paidOn': '',
      },
    })!;
    expect(run.status, 'approved');
    expect(run.rows.single.daysWorked, 16);
    expect(run.totals.employerCost, 9790.32);
    expect(PayrollRun.fromTool({'ok': false, 'error': 'SALARIES_PRIVATE'}), isNull);
  });

  testWidgets('the owner opens this month\'s payroll from Employees, approves it after a preview, then records the salaries as paid', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Employees');
    await tester.tap(find.text('Payroll for October 2026'));
    await tester.pumpAndSettle();
    expect(api.queries.contains('payroll_run'), isTrue);
    expect(find.text('1 employee · gross ₹30,000.00 · net to pay ₹28,000.00'), findsOneWidget);
    expect(find.text('A draft. Nothing is posted until you approve it.'), findsOneWidget);
    expect(find.textContaining('has not reviewed yet'), findsOneWidget);
    await tester.tap(find.text('Approve payroll'));
    await tester.pumpAndSettle();
    expect(api.proposals.single.tool, 'approve_payroll');
    expect(api.proposals.single.args['period'], '2026-10');
    expect(find.textContaining('net to pay ₹28,000.00.'), findsOneWidget);
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(api.payrollApproved, isTrue);
    expect(find.textContaining('Approved on 5 October 2026. Salaries not yet recorded as paid.'), findsOneWidget);
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Payroll for October 2026'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Salaries paid'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'record_salary_payment');
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(api.payrollPaid, isTrue);
    expect(find.textContaining('Paid on 5 October 2026.'), findsOneWidget);
  });
}
