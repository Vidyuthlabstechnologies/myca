import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';

import 'cloud_test.dart' show signedIn;
import 'fake_api.dart';
import 'fake_cloud.dart';

void main() {
  testWidgets('an owner connects a POS from Connections, sees the key once, and turns it off', (tester) async {
    final cloud = FakeCloud()..userName = 'Asha';
    final session = await signedIn(cloud);
    await session.createBusiness(name: 'Asha Traders', state: '29');
    final state = AppState(cloud: session, store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true), pickTextFile: (_) async => null);
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Connections'));
    await tester.pumpAndSettle();
    expect(find.text('Nothing is connected yet.'), findsOneWidget);
    await tester.tap(find.text('Connect something'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create key'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Name the system'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Counter till');
    await tester.tap(find.text('Create key'));
    await tester.pumpAndSettle();
    expect(find.text('mk_testsecret1'), findsOneWidget);
    expect(cloud.inboundKeys.single['source'], 'pos');
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(find.text('Counter till'), findsOneWidget);
    expect(find.text('Today: 0 sales, ₹0.00'), findsOneWidget);
    await tester.tap(find.text('Turn off'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Turn off'));
    await tester.pumpAndSettle();
    expect(cloud.disabledKeys, ['key-1']);
    expect(find.text('Off'), findsOneWidget);
  });

  testWidgets('a documents connection shows its forwarding address and copies it on tap', (tester) async {
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    final cloud = FakeCloud()..userName = 'Asha';
    final session = await signedIn(cloud);
    await session.createBusiness(name: 'Asha Traders', state: '29');
    final state = AppState(cloud: session, store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true), pickTextFile: (_) async => null);
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Connections'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Connect something'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Mail inbox');
    await tester.tap(find.widgetWithText(ChoiceChip, 'Documents in'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create key'));
    await tester.pumpAndSettle();
    expect(find.text('tok1abcdefg@inbox.example.test'), findsOneWidget);
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(find.text('Forward bills to tok1abcdefg@inbox.example.test'), findsOneWidget);
    await tester.tap(find.text('Mail inbox'));
    await tester.pumpAndSettle();
    expect(copied, 'tok1abcdefg@inbox.example.test');
    expect(find.text('Copied tok1abcdefg@inbox.example.test'), findsOneWidget);
  });

  testWidgets('an approved month offers the payout file and names who has no bank account', (tester) async {
    final api = FakeMycaApi(signedIn: true)..payrollApproved = true;
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
    await tapRow(tester, 'Employees');
    await tester.tap(find.text('Payroll for October 2026'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save payout file'));
    await tester.pumpAndSettle();
    expect(api.queries.contains('payroll_payout_file'), isTrue);
    expect(saved.keys.single, 'salary-payout-2026-10.csv');
    expect(find.textContaining('No bank account for Ravi Kumar'), findsOneWidget);
  });

  testWidgets("an employee's bank account is recorded through a preview", (tester) async {
    final api = FakeMycaApi(signedIn: true);
    final state = AppState(api: api, store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true), pickTextFile: (_) async => null);
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Employees');
    await tester.tap(find.text('Ravi Kumar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bank account for salary'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, '12345678901');
    await tester.enterText(find.byType(TextField).last, 'hdfc0001234');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();
    expect(find.textContaining('account ending 8901'), findsWidgets);
    await tester.tap(find.text('Confirm'));
    await tester.pumpAndSettle();
    expect(api.bankDetails.single, {'id': 'EMP-0001', 'bankAccount': '12345678901', 'ifsc': 'HDFC0001234'});
  });
}
