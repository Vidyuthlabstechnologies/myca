import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_services.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/quicko_screen.dart';

import 'connectors_test.dart' show hostedOwner;
import 'fake_cloud.dart';

Future<void> openChecks(WidgetTester tester) async {
  tester.state<NavigatorState>(find.byType(Navigator).first).push(MaterialPageRoute<void>(builder: (_) => const QuickoScreen()));
  await tester.pumpAndSettle();
}

Future<void> tapText(WidgetTester tester, String label) async {
  final target = find.text(label);
  await tester.scrollUntilVisible(target, 200, scrollable: find.byType(Scrollable).last);
  await tester.tap(target);
  await tester.pumpAndSettle();
}

Future<void> enter(WidgetTester tester, String key, String value) async {
  final target = find.byKey(ValueKey('quicko.$key'));
  await tester.scrollUntilVisible(target, 200, scrollable: find.byType(Scrollable).last);
  await tester.enterText(target, value);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('an owner reads a Form 16 PDF and sees the figures as printed', (tester) async {
    final cloud = FakeCloud();
    final pdf = PickedFile(name: 'form16.pdf', mime: 'application/pdf', bytes: Uint8List.fromList('%PDF-1.4'.codeUnits));
    await tester.pumpWidget(MycaApp(state: await hostedOwner(cloud, pickAnyFile: () async => pdf)));
    await tester.pumpAndSettle();
    await openChecks(tester);

    await tapText(tester, 'Read Form 16');
    expect(cloud.uploads.values.single, startsWith('data:application/pdf;base64,'));
    expect(cloud.quickoCalls.single['tool'], 'read_form16');
    expect(find.text('Form 16, 2026-27'), findsOneWidget);
    expect(find.textContaining('Acme Pvt Ltd · TAN BLRA12345B'), findsOneWidget);
    expect(find.textContaining('Total taxable income: ₹17,25,000'), findsOneWidget);
    expect(find.textContaining('Gross total income'), findsNothing);
    expect(find.textContaining('Test service'), findsOneWidget);
  });

  testWidgets('a 206AB check waits for consent, and a bank account check shows the name at the bank', (tester) async {
    final cloud = FakeCloud();
    await tester.pumpWidget(MycaApp(state: await hostedOwner(cloud)));
    await tester.pumpAndSettle();
    await openChecks(tester);

    await enter(tester, 'pan', 'abcde1234f');
    await tapText(tester, 'Check section 206AB');
    expect(find.text('Tick the box once the person has agreed to this check.'), findsOneWidget);
    expect(cloud.quickoCalls, isEmpty);

    await tapText(tester, 'The person agreed to this check');
    await tapText(tester, 'Check section 206AB');
    expect(cloud.quickoCalls.single['pan'], 'ABCDE1234F');
    expect(find.textContaining('No: the normal TDS rate applies'), findsOneWidget);

    await enter(tester, 'ifsc', 'SBIN000');
    await enter(tester, 'account', '123456789012');
    await tapText(tester, 'Verify account');
    expect(find.textContaining('IFSC is not valid'), findsOneWidget);

    await enter(tester, 'ifsc', 'SBIN0001234');
    await tapText(tester, 'Verify account');
    expect(find.text('Account ending 9012'), findsOneWidget);
    expect(find.textContaining('Name at bank: KIRAN TRADERS'), findsOneWidget);
  });

  testWidgets('the income tax portal sign-in clears the password and can be signed out', (tester) async {
    final cloud = FakeCloud();
    await tester.pumpWidget(MycaApp(state: await hostedOwner(cloud)));
    await tester.pumpAndSettle();
    await openChecks(tester);

    await enter(tester, 'itdPan', 'ABCDE1234F');
    await enter(tester, 'itdPassword', 'wrong');
    await tapText(tester, 'Sign in');
    expect(find.text('The income tax portal did not accept that PAN and password.'), findsOneWidget);

    await enter(tester, 'itdPassword', 'right-password');
    await tapText(tester, 'Sign in');
    expect(find.textContaining('Signed in as ABCDE1234F'), findsOneWidget);
    expect(find.text('right-password'), findsNothing);

    await tapText(tester, 'Sign out of the income tax portal');
    expect(find.text('Sign in'), findsOneWidget);
    expect(cloud.quickoSessions, isEmpty);
  });
}
