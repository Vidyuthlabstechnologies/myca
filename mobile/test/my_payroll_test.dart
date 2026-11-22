import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/my/my_staff.dart';
import 'package:myca/screens/my/my_home_screen.dart';
import 'package:myca/screens/my/my_payroll_screen.dart';

import 'my_support.dart';

const _payroll = <String, Object?>{
  'ok': true,
  'data': {
    'month': '2026-10',
    'employees': [
      {
        'name': 'Aminah binti Yusof',
        'wages': 5500,
        'bonus': 0,
        'epf': {'employee': 605, 'employer': 660, 'basis': 'band'},
        'socso': {'employee': 27.25, 'employer': 95.35},
        'eis': {'employee': 10.9, 'employer': 10.9},
        'pcb': {'amount': 110, 'normal': 110, 'onBonus': 0, 'zakatOffset': 0, 'category': 3, 'children': 3, 'method': 'computerised'},
        'netPay': 4746.85,
        'employerCost': 6266.25,
        'notes': ['PCB assumes the same pay and PCB every month since January; give yearToDate for an exact figure.'],
      },
      {
        'name': 'Tan Mei Ling',
        'wages': 2000,
        'bonus': 0,
        'epf': {'employee': 220, 'employer': 260, 'basis': 'band'},
        'socso': {'employee': 9.75, 'employer': 34.15},
        'eis': {'employee': 3.9, 'employer': 3.9},
        'pcb': {'amount': 0, 'normal': 0, 'onBonus': 0, 'zakatOffset': 0, 'category': 1, 'children': 0, 'method': 'computerised'},
        'netPay': 1766.35,
        'employerCost': 2298.05,
        'notes': <String>[],
      },
    ],
    'totals': {'wages': 7500, 'pcb': 110, 'epf': 1745, 'socso': 166.5, 'eis': 29.6, 'employerCost': 8564.3},
    'dueBy': '2026-11-15',
    'rulesUsed': [
      {'id': 'my.payroll.epf', 'effectiveFrom': '2024-01-01', 'unreviewed': true},
    ],
  },
};

const _cp39Content = 'H90123456789012345678202610000001100000001000000000000000\r\nD00531367080Aminah binti Yusof                                                      880402105566              0001100000000000          \r\n';

const _cp39 = <String, Object?>{
  'ok': true,
  'data': {
    'month': '2026-10',
    'fileName': '901234567810_2026.txt',
    'content': _cp39Content,
    'records': 1,
    'totals': {'pcb': 110, 'pcbRecords': 1, 'cp38': 0, 'cp38Records': 0},
    'leftOut': ['Tan Mei Ling'],
    'dueBy': '2026-11-15',
  },
};

Map<String, Object?>? _server(String name, Map<String, Object?> args) => switch (name) {
  'my_payroll' => _payroll,
  'my_cp39_file' => '${args['employerNo']}'.isEmpty ? {'ok': false, 'error': 'EMPLOYER_NUMBER_REQUIRED'} : _cp39,
  _ => null,
};

Future<void> _twoEmployees(WidgetTester tester) async {
  await typeKey(tester, 'myPayroll.0.name', 'Aminah binti Yusof');
  await typeKey(tester, 'myPayroll.0.wages', '5,500');
  await pickOption(tester, 'myPayroll.0.category', '3: married and spouse working, or single parent');
  await typeKey(tester, 'myPayroll.0.children', '3');
  await tapKey(tester, 'myPayroll.add');
  await typeKey(tester, 'myPayroll.1.name', 'Tan Mei Ling');
  await typeKey(tester, 'myPayroll.1.wages', '2000');
}

void main() {
  setUp(() => moneyCountry = 'MY');
  tearDown(() => moneyCountry = 'IN');

  testWidgets('payroll for two employees shows each net pay, the totals, the due date and that it is not yet reviewed', (tester) async {
    final api = MyTestApi()..answer = _server;
    await tester.pumpWidget(myApp(myState(api), const MyPayrollScreen()));
    await settle(tester);
    await _twoEmployees(tester);
    await tapKey(tester, 'myPayroll.workOut');
    final sent = api.args['my_payroll']!;
    expect(sent['month'], '2026-10');
    expect(sent['employees'], [
      {'name': 'Aminah binti Yusof', 'wages': 5500, 'pcbCategory': 3, 'children': 3},
      {'name': 'Tan Mei Ling', 'wages': 2000, 'pcbCategory': 1, 'children': 0},
    ]);
    await reveal(tester, find.byKey(const Key('myPayroll.slip.0')));
    expect(find.text('RM4,746.85'), findsOneWidget);
    expect(find.text('-RM605.00'), findsOneWidget);
    expect(find.text('-RM110.00'), findsOneWidget);
    expect(find.text('EPF RM660.00, SOCSO RM95.35, EIS RM10.90'), findsOneWidget);
    await reveal(tester, find.byKey(const Key('myPayroll.totals')));
    expect(find.text('RM1,745.00'), findsOneWidget);
    expect(find.text('RM8,564.30'), findsOneWidget);
    await reveal(tester, find.byKey(const Key('myPayroll.dueBy')));
    expect(find.textContaining('Pay all four by'), findsOneWidget);
    await reveal(tester, find.text('Not yet reviewed by a Malaysian tax agent.'));
    expect(find.text('Not yet reviewed by a Malaysian tax agent.'), findsOneWidget);
  });

  testWidgets('the CP39 file is saved with LHDN\'s file name and says who was left out', (tester) async {
    final api = MyTestApi()..answer = _server;
    final saved = <String, String>{};
    await tester.pumpWidget(myApp(myState(api, save: (name, content) async {
      saved[name] = content;
      return true;
    }), const MyPayrollScreen()));
    await settle(tester);
    await _twoEmployees(tester);
    await tapKey(tester, 'myPayroll.0.cp39');
    await typeKey(tester, 'myPayroll.0.taxNumber', 'IG 531367080');
    await typeKey(tester, 'myPayroll.0.ic', '880402-10-5566');
    await tapKey(tester, 'myPayroll.workOut');
    await tapKey(tester, 'myPayroll.cp39');
    expect(find.text('Enter the employer\'s E number, up to 10 digits.'), findsOneWidget);
    expect(saved, isEmpty);
    await typeKey(tester, 'myPayroll.employerNo', 'E 9012345678');
    await tapKey(tester, 'myPayroll.cp39');
    expect(saved['901234567810_2026.txt'], _cp39Content);
    final sent = api.args['my_cp39_file']!;
    expect(sent['month'], '2026-10');
    expect(sent['employees'], [
      {'name': 'Aminah binti Yusof', 'taxNumber': 'IG 531367080', 'newIc': '880402-10-5566', 'pcb': 110},
      {'name': 'Tan Mei Ling', 'taxNumber': '', 'pcb': 0},
    ]);
    await reveal(tester, find.byKey(const Key('myPayroll.cp39Result')));
    expect(find.text('Saved 901234567810_2026.txt: 1 employee, PCB RM110.00.'), findsOneWidget);
    expect(find.text('Left out, with no PCB this month: Tan Mei Ling.'), findsOneWidget);
  });

  testWidgets('a file that was not saved says so, and missing CP39 details name the employee', (tester) async {
    final api = MyTestApi()..answer = _server;
    await tester.pumpWidget(myApp(myState(api, save: (_, _) async => false), const MyPayrollScreen()));
    await settle(tester);
    await _twoEmployees(tester);
    await tapKey(tester, 'myPayroll.workOut');
    await typeKey(tester, 'myPayroll.employerNo', '9012345678');
    await tapKey(tester, 'myPayroll.cp39');
    await reveal(tester, find.byKey(const Key('myPayroll.cp39Result')));
    expect(find.textContaining('was not saved'), findsOneWidget);
    api.answer = (name, args) => name == 'my_cp39_file'
        ? {
            'ok': false,
            'error': 'BAD_INPUT',
            'problems': [
              {'field': 'employees[0].taxNumber', 'why': 'the tax identification number is mandatory in the CP39 file'},
            ],
          }
        : _server(name, args);
    await tapKey(tester, 'myPayroll.cp39');
    await reveal(tester, find.textContaining('Employee 1: Income tax number (TIN)', findRichText: true));
    expect(find.text('Some employee details need fixing.'), findsOneWidget);
    expect(find.byKey(const Key('myPayroll.cp39Result')), findsNothing);
  });

  testWidgets('wages that are not an amount are caught before asking MyCA, and changing a figure clears the old result', (tester) async {
    final api = MyTestApi()..answer = _server;
    await tester.pumpWidget(myApp(myState(api), const MyPayrollScreen()));
    await settle(tester);
    await tapKey(tester, 'myPayroll.workOut');
    expect(find.text('Enter an amount of zero or more.'), findsOneWidget);
    expect(api.calls, isNot(contains('my_payroll')));
    await typeKey(tester, 'myPayroll.0.wages', '5500');
    await typeKey(tester, 'myPayroll.0.children', 'two');
    await tapKey(tester, 'myPayroll.workOut');
    expect(find.text('A whole number, zero or more.'), findsOneWidget);
    await typeKey(tester, 'myPayroll.0.children', '2');
    await tapKey(tester, 'myPayroll.workOut');
    expect(find.byKey(const Key('myPayroll.totals')), findsOneWidget);
    await typeKey(tester, 'myPayroll.0.wages', '6000');
    await settle(tester);
    expect(find.byKey(const Key('myPayroll.totals')), findsNothing);
  });

  testWidgets('payroll that cannot reach MyCA can be tried again, and the sandbox says it needs a sign-in', (tester) async {
    final api = MyTestApi()
      ..answer = _server
      ..failNext['my_payroll'] = 1;
    await tester.pumpWidget(myApp(myState(api), const MyPayrollScreen()));
    await settle(tester);
    await typeKey(tester, 'myPayroll.0.wages', '5500');
    await tapKey(tester, 'myPayroll.workOut');
    expect(find.textContaining('Cannot reach MyCA'), findsOneWidget);
    await tester.tap(find.text('Try again'));
    await settle(tester);
    expect(find.byKey(const Key('myPayroll.totals')), findsOneWidget);
    api.answer = null;
    await typeKey(tester, 'myPayroll.0.wages', '5600');
    await tapKey(tester, 'myPayroll.workOut');
    expect(find.textContaining('does not run in the sandbox'), findsOneWidget);
  });

  testWidgets('employees from the last payroll come back with their CP39 details, without the bonus', (tester) async {
    final api = MyTestApi()..answer = _server;
    final staff = MemoryMyStaffStore();
    await tester.pumpWidget(myApp(myState(api, staff: staff), const MyPayrollScreen(business: 'Kedai Maju')));
    await settle(tester);
    expect(find.byKey(const Key('myPayroll.remembered')), findsNothing);
    await _twoEmployees(tester);
    await typeKey(tester, 'myPayroll.0.bonus', '1000');
    await tapKey(tester, 'myPayroll.0.cp39');
    await typeKey(tester, 'myPayroll.0.taxNumber', 'IG 531367080');
    await tapKey(tester, 'myPayroll.workOut');
    await typeKey(tester, 'myPayroll.employerNo', '9012345678');
    await tapKey(tester, 'myPayroll.cp39');
    expect(staff.saved['Kedai Maju']!.staff.length, 2);
    expect(staff.saved['Kedai Maju']!.employerNo, '9012345678');
    await tester.pumpWidget(myApp(myState(api, staff: staff), const MyPayrollScreen(key: Key('again'), business: 'Kedai Maju')));
    await settle(tester);
    expect(find.byKey(const Key('myPayroll.remembered')), findsOneWidget);
    expect(find.text('Aminah binti Yusof'), findsOneWidget);
    expect(find.text('Tan Mei Ling'), findsOneWidget);
    await tapKey(tester, 'myPayroll.workOut');
    expect(api.args['my_payroll']!['employees'], [
      {'name': 'Aminah binti Yusof', 'wages': 5500, 'pcbCategory': 3, 'children': 3},
      {'name': 'Tan Mei Ling', 'wages': 2000, 'pcbCategory': 1, 'children': 0},
    ]);
    await tapKey(tester, 'myPayroll.cp39');
    expect((api.args['my_cp39_file']!['employees'] as List).first, {'name': 'Aminah binti Yusof', 'taxNumber': 'IG 531367080', 'pcb': 110});
    expect(api.args['my_cp39_file']!['employerNo'], '9012345678');
    await tester.pumpWidget(myApp(myState(api, staff: staff), const MyPayrollScreen(key: Key('other'), business: 'Another Sdn Bhd')));
    await settle(tester);
    expect(find.text('Aminah binti Yusof'), findsNothing);
  });

  testWidgets('the home screen opens payroll, and it reads in Malay', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), MyHomeScreen(snapshot: await api.snapshot()), language: 'ms'));
    await settle(tester);
    await tapKey(tester, 'myHome.payroll');
    expect(find.text('Gaji'), findsWidgets);
    expect(find.text('Kira gaji'), findsOneWidget);
    expect(find.textContaining('e-PCB Plus'), findsOneWidget);
  });
}
