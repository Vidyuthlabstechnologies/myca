import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  testWidgets('the GST payment is recorded from Taxes with its CPIN, and the GSTR-9 draft is saved as one file', (tester) async {
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
    final record = find.text('Record the GST payment');
    await tester.scrollUntilVisible(record, 200, scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(record);
    await tester.pumpAndSettle();
    await tester.tap(record);
    await tester.pumpAndSettle();
    expect(find.textContaining('₹3,600.00 is to pay in cash after set-off'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'CPIN (optional)'), '123');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(find.textContaining('fourteen-digit challan number from the GST portal'), findsOneWidget);
    expect(api.proposals, isEmpty);
    await tester.enterText(find.widgetWithText(TextField, 'CPIN (optional)'), '26100012345678');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.single.tool, 'record_gst_payment');
    expect(api.proposals.single.args, {'period': '2026-10', 'date': '2026-10-05', 'mode': 'bank', 'cpin': '26100012345678'});
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Recorded the GST payment for 2026-10'), findsOneWidget);
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();

    final gstr9 = find.text('Save the GSTR-9 draft');
    await tester.scrollUntilVisible(gstr9, 200, scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(gstr9);
    await tester.pumpAndSettle();
    await tester.tap(gstr9);
    await tester.pumpAndSettle();
    expect(api.queries.contains('gstr9_draft'), isTrue);
    expect(saved.keys.single, 'GSTR9_draft_27AABCU9603R1ZN_2026-27.json');
    expect(find.textContaining('the annual return tables from the months so far'), findsOneWidget);

    await tester.scrollUntilVisible(record, 200, scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(record);
    await tester.pumpAndSettle();
    await tester.tap(record);
    await tester.pumpAndSettle();
    expect(find.textContaining('is already recorded'), findsOneWidget);
  });
}
