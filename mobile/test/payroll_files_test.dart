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
    await tester.tap(find.text('Save Annexure II'));
    await tester.pumpAndSettle();
    expect(api.queries.contains('salary_annexure'), isTrue);
    expect(saved.keys, contains('24Q_AnnexureII_MUMA12345B_2026-27.csv'));
    expect(find.textContaining('Saved 24Q_AnnexureII_MUMA12345B_2026-27.csv with 1 employee'), findsOneWidget);
    await tester.tap(find.text('Save Form 16 drafts'));
    await tester.pumpAndSettle();
    expect(saved.keys, contains('Form16_MUMA12345B_2026-27.csv'));
    expect(find.textContaining('Saved Form16_MUMA12345B_2026-27.csv with 1 employee'), findsOneWidget);
  });
}
