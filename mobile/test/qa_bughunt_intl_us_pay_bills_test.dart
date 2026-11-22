import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/cash_screen.dart';

import 'fake_api.dart';

void main() {
  tearDown(() => moneyCountry = 'IN');

  testWidgets('US cash does not offer the Indian MSMED payment run, which never lists US bills', (tester) async {
    final state = AppState(api: FakeMycaApi(signedIn: true)..country = 'US', store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true), pickTextFile: (_) async => null, now: () => DateTime(2026, 10, 5, 22, 30), edition: 'US');
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    tester.state<NavigatorState>(find.byType(Navigator).first).push(MaterialPageRoute<void>(builder: (_) => const CashScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Who to pay'), findsNothing);
  });
}
