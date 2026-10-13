import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  tearDown(() => moneyCountry = 'IN');

  testWidgets('a US payroll month shows Social Security, Medicare and withholding lines in dollars, with no PF or ESI files', (tester) async {
    final api = FakeMycaApi(signedIn: true)
      ..country = 'US'
      ..payrollApproved = true;
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Employees');
    await tester.tap(find.text('Payroll for October 2026'));
    await tester.pumpAndSettle();

    expect(find.text('1 employee · gross \$5,000.00 · net to pay \$4,217.50'), findsOneWidget);
    expect(find.text('Gross wages'), findsOneWidget);
    expect(find.text('Social Security (employees)'), findsOneWidget);
    expect(find.text('Federal income tax withheld'), findsOneWidget);
    expect(find.text('Federal unemployment (FUTA)'), findsOneWidget);
    expect(find.text('Provident fund (employees)'), findsNothing);
    expect(find.text('Save PF file'), findsNothing);
    expect(find.textContaining('a US CPA has not reviewed yet'), findsOneWidget);
    expect(find.textContaining('₹'), findsNothing);
  });

  testWidgets('adding a US employee asks for the work state and withholding, not PAN, PF or ESI', (tester) async {
    final api = FakeMycaApi(signedIn: true)..country = 'US';
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Employees');
    await tester.tap(find.text('Add employee'));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(TextField, 'Work state'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'PAN (optional)'), findsNothing);
    expect(find.text('In provident fund'), findsNothing);
    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Ana Lopez');
    await tester.enterText(find.widgetWithText(TextField, 'Basic'), '5000');
    await tester.enterText(find.widgetWithText(TextField, 'Work state'), 'tx');
    await tester.enterText(find.widgetWithText(TextField, 'Federal withholding a month (optional)'), '400');
    await tester.ensureVisible(find.text('Preview'));
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.single.tool, 'add_employee');
    final args = api.proposals.single.args;
    expect(args['workState'], 'TX');
    expect(args['federalWithholding'], 400);
    expect(args.containsKey('pfMember'), isFalse);
    expect(args.containsKey('pan'), isFalse);
  });
}
