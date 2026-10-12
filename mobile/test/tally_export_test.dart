import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  testWidgets('Taxes offers a Tally file for the month and saves what the engine returns', (tester) async {
    final api = FakeMycaApi(signedIn: true);
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
    final button = find.text('Save a Tally file');
    await tester.scrollUntilVisible(button, 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(api.queries.contains('export_tally'), isTrue);
    expect(saved.keys.single, 'tally_27AAACN1234F1Z5_2026-10.xml');
    expect(saved.values.single, '<ENVELOPE></ENVELOPE>');
    expect(find.textContaining('Saved tally_27AAACN1234F1Z5_2026-10.xml with 4 vouchers. Import it in Tally'), findsOneWidget);
  });
}
