import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  testWidgets('a debit note to a supplier is composed from the supplier chat and previewed', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    final state = AppState(api: api, store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true), pickTextFile: (_) async => null, now: () => DateTime(2026, 10, 20, 10));
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Purchases');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Fabric Co'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ActionChip, 'Debit note'));
    await tester.pumpAndSettle();
    expect(find.text('Debit note to supplier'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Reduce the bill by'), '1500');
    await tester.enterText(find.widgetWithText(TextField, 'Reason'), 'Goods returned');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'create_purchase_note');
    expect(api.proposals.last.args, {'billId': 'BILL-0001', 'amount': 1500, 'date': '2026-10-20', 'reason': 'Goods returned'});
    expect(find.textContaining('Debit note of ₹1500 against BILL-0001'), findsOneWidget);
  });
}
