import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  testWidgets('a file can be attached to a question for the CA; it is uploaded and sent with the question', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    final picked = PickedFile(name: 'agreement.txt', mime: 'text/plain', bytes: Uint8List.fromList(utf8.encode('Rate agreed')));
    final state = AppState(
      api: api,
      store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
      pickTextFile: (_) async => null,
      pickAnyFile: () async => picked,
      now: () => DateTime(2026, 10, 5, 10),
    );
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Sales');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Gujarat Weaves'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Invoice INV-0002'));
    await tester.pumpAndSettle();
    final ask = find.widgetWithText(ActionChip, 'Ask my CA');
    await tester.scrollUntilVisible(ask, 200, scrollable: find.byType(Scrollable).last);
    await tester.tap(ask);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Your question'), 'See the agreement');
    await tester.tap(find.text('Attach a file'));
    await tester.pumpAndSettle();
    expect(api.uploads['sha-of-agreement.txt'], 'Rate agreed');
    expect(find.widgetWithText(InputChip, 'agreement.txt'), findsOneWidget);
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'ask_ca');
    expect(api.proposals.last.args['documents'], [
      {'sha256': 'sha-of-agreement.txt', 'name': 'agreement.txt'},
    ]);
    expect(find.textContaining('with 1 file(s) attached'), findsOneWidget);
  });

  testWidgets("a supplier's chat marks a bill whose credit is at risk, with the reason", (tester) async {
    final api = FakeMycaApi(signedIn: true)..has2b = true;
    api.purchases.add({
      'id': 'BILL-0002',
      'date': '2026-10-08',
      'partyName': 'Gujarat Mills',
      'partyGstin': '24AAACF7856R1ZY',
      'total': 23600,
      'status': 'posted',
      'receipts': const <Object?>[],
      'gstRates': const <Object?>[],
    });
    final state = AppState(api: api, store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true), pickTextFile: (_) async => null, now: () => DateTime(2026, 10, 20, 10));
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Purchases');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Gujarat Mills'));
    await tester.pumpAndSettle();
    expect(api.queries.where((q) => q == 'credit_at_risk').length, greaterThanOrEqualTo(1));
    expect(find.textContaining('Credit at risk: The supplier reported it, but 2B marks the credit as not available.'), findsOneWidget);
  });
}
