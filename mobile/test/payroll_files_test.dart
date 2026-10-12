import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  testWidgets('an approved payroll month offers the PF and ESI files and says what could not be prepared', (tester) async {
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
    expect(find.text('Save PF file'), findsOneWidget);
    await tester.tap(find.text('Save PF file'));
    await tester.pumpAndSettle();
    expect(api.queries.contains('pf_ecr'), isTrue);
    expect(saved.keys.single, 'ECR_27AAACN1234F1Z5_2026-10.txt');
    expect(saved.values.single, startsWith('100200300400#~#RAVI KUMAR'));
    expect(find.textContaining('Upload it on the EPFO portal'), findsOneWidget);
    await tester.tap(find.text('Save ESI file'));
    await tester.pumpAndSettle();
    expect(api.queries.contains('esi_return'), isTrue);
    expect(find.text('No state insurance member in this month.'), findsOneWidget);
  });
}
