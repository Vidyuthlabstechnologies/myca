import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  testWidgets('the filing pack for the month is saved as one file from Taxes', (tester) async {
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
    final button = find.text('Save the filing pack for your CA');
    await tester.scrollUntilVisible(button, 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(api.queries.contains('filing_pack'), isFalse, reason: 'the pack is assembled from read-only queries the phone may make');
    for (final tool in ['gst_period_summary', 'export_gstr1_json', 'gst_payable', 'export_trial_balance']) {
      expect(api.queries.contains(tool), isTrue, reason: tool);
    }
    expect(saved.keys.single, startsWith('filing_pack_'));
    expect(saved.values.single, contains('"trialBalance"'));
    expect(saved.values.single, contains('"gstr1"'));
    expect(find.textContaining('GSTR-1, GSTR-3B, the amount to pay and the trial balance in one file'), findsOneWidget);
  });
}
