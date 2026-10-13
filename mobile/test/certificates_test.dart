import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  testWidgets('a deductor saves Form 16A drafts for the latest quarter from Taxes', (tester) async {
    final api = FakeMycaApi(signedIn: true)..tdsDeductor = true;
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
    await tester.tap(find.text('3 things need you'));
    await tester.pumpAndSettle();
    final row = find.text('Form 16A drafts');
    await tester.scrollUntilVisible(row, 200, scrollable: find.byType(Scrollable).first);
    expect(find.textContaining('One per deductee for Q3 2026-27'), findsOneWidget);
    await tester.tap(row);
    await tester.pumpAndSettle();
    expect(api.queries.contains('tds_certificates'), isTrue);
    expect(saved.keys.single, 'Form16A_MUMA12345B_Q3-2026-27.csv');
    expect(find.textContaining('Saved Form16A_MUMA12345B_Q3-2026-27.csv with 1 deductee'), findsOneWidget);
  });
}
