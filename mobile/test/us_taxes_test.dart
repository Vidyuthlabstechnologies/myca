import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  tearDown(() => moneyCountry = 'IN');

  testWidgets('a US owner opens federal and owner taxes from Home: estimated dates, Schedule C, 941, W-2 and the 1099 file', (tester) async {
    final api = FakeMycaApi(signedIn: true)..country = 'US';
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
    expect(find.text('FEDERAL AND OWNER TAXES'), findsOneWidget);
    await tester.tap(find.text('FEDERAL AND OWNER TAXES'));
    await tester.pumpAndSettle();

    expect(find.text('Instalment 1: 15 April 2026'), findsOneWidget);
    expect(find.text('Paid, confirmation EFTPS1'), findsOneWidget);
    expect(find.textContaining('income from 1 April to 31 May · date has passed'), findsOneWidget);
    expect(find.text('Net profit before items outside the books'), findsOneWidget);
    expect(find.text('-\$1,404.75'), findsOneWidget);
    expect(find.text('Form 941 for 2026-Q3'), findsOneWidget);
    expect(find.textContaining('Wages \$15,000.00 · total taxes \$3,495.00 · due 31 October 2026'), findsOneWidget);
    expect(find.text('W-2 for 1 employee'), findsOneWidget);
    expect(find.textContaining('\$2,500.00 · W-9 missing'), findsOneWidget);
    final save = find.text('Save the 1099-NEC data file');
    await tester.scrollUntilVisible(save, 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(saved.keys.single, '1099NEC_EIN_2026.csv');
    expect(find.textContaining('Saved 1099NEC_EIN_2026.csv'), findsOneWidget);
    expect(find.textContaining('₹'), findsNothing);
  });
}
