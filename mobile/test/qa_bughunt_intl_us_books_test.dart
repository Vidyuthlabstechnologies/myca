import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/ca_screen.dart';
import 'package:myca/screens/expense_screen.dart';
import 'package:myca/screens/year_close_screen.dart';

import 'fake_api.dart';
import 'uk_fake_api.dart';

AppState usBusiness() => AppState(
  api: FakeMycaApi(signedIn: true)..country = 'US',
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => null,
  now: () => DateTime(2026, 10, 5, 22, 30),
  edition: 'US',
);

Future<void> openOver(WidgetTester tester, AppState state, Widget screen) async {
  await tester.pumpWidget(MycaApp(state: state));
  await tester.pumpAndSettle();
  tester.state<NavigatorState>(find.byType(Navigator).first).push(MaterialPageRoute<void>(builder: (_) => screen));
  await tester.pumpAndSettle();
}

void main() {
  tearDown(() => moneyCountry = 'IN');

  testWidgets('a US business home has no Indian marketplace row and calls the accountant an accountant', (tester) async {
    await tester.pumpWidget(MycaApp(state: usBusiness()));
    await tester.pumpAndSettle();
    expect(find.text('FEDERAL AND OWNER TAXES'), findsOneWidget);
    expect(find.text('Marketplace'), findsNothing);
    expect(find.textContaining('TCS and TDS'), findsNothing);
    expect(find.text('Your CA'), findsNothing);
    expect(find.text('Your accountant'), findsOneWidget);
  });

  testWidgets('the US accountant screen does not say CA', (tester) async {
    await openOver(tester, usBusiness(), const CaScreen());
    expect(find.text('Your CA'), findsNothing);
    expect(find.textContaining('my CA'), findsNothing);
    expect(find.textContaining('Your CA'), findsNothing);
    expect(find.textContaining('your CA'), findsNothing);
    expect(find.text('Your accountant'), findsOneWidget);
  });

  testWidgets('a US expense says nothing about GST or a GSTIN', (tester) async {
    await openOver(tester, usBusiness(), const ExpenseScreen());
    expect(find.textContaining('GST'), findsNothing);
    expect(find.textContaining('₹'), findsNothing);
  });

  testWidgets('closing the year outside India asks for the accountant, not the CA', (tester) async {
    await openOver(tester, usBusiness(), const YearCloseScreen());
    expect(find.textContaining('your CA'), findsNothing);
    await openOver(tester, gbState(GbFakeApi()..connected = true), const YearCloseScreen());
    expect(find.textContaining('your CA'), findsNothing);
  });
}
