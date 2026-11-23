import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  tearDown(() => moneyCountry = 'IN');

  testWidgets('adding a US employee does not ask for an Indian house rent allowance, and the pay field is in dollars', (tester) async {
    final api = FakeMycaApi(signedIn: true)..country = 'US';
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Employees');
    await tester.tap(find.text('Add employee'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, 'HRA (optional)'), findsNothing);
    final basic = tester.widget<TextField>(find.widgetWithText(TextField, 'Basic'));
    expect(basic.decoration?.prefixText, '\$ ');
  });

  testWidgets('an Indian employee still has the HRA field', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Employees');
    await tester.tap(find.text('Add employee'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, 'HRA (optional)'), findsOneWidget);
  });
}
