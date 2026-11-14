import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';

import 'my_support.dart';

void main() {
  tearDown(() => moneyCountry = 'IN');

  testWidgets('the Malaysia home shows e-invoices, the next SST-02 due date and the tax estimator', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(MycaApp(state: myState(api)));
    await settle(tester);
    expect(find.text('Teratai Digital Sdn Bhd'), findsOneWidget);
    expect(find.text('INV-2026-0141'), findsOneWidget);
    expect(find.text('RM13,500.00'), findsOneWidget);
    expect(find.textContaining('SST-02 for Sep 2026 – Oct 2026 is due 30/11/2026'), findsOneWidget);
    expect(find.text('56 days left'), findsOneWidget);
    expect(find.textContaining('TIN C25845632020'), findsOneWidget);
    expect(find.text('Estimate my tax'), findsOneWidget);
    expect(moneyCountry, 'MY');
    expect(find.textContaining('₹'), findsNothing);
  });

  testWidgets('a business without e-invoice details is asked to add them, and an empty book says so', (tester) async {
    final api = MyTestApi();
    api.books.malaysia.hasProfile = false;
    api.books.malaysia.einvoices.clear();
    await tester.pumpWidget(MycaApp(state: myState(api)));
    await settle(tester);
    expect(find.byKey(const Key('myHome.profileMissing')), findsOneWidget);
    expect(find.byKey(const Key('myHome.noEinvoices')), findsOneWidget);
  });

  testWidgets('a failed e-invoice list shows the offline message and tries again', (tester) async {
    final api = MyTestApi()..failNext['list_my_einvoices'] = 1;
    await tester.pumpWidget(MycaApp(state: myState(api)));
    await settle(tester);
    expect(find.textContaining('Cannot reach MyCA'), findsOneWidget);
    await tester.tap(find.text('Try again'));
    await settle(tester);
    expect(find.text('INV-2026-0141'), findsOneWidget);
  });

  testWidgets('Bahasa Melayu can be chosen and is remembered', (tester) async {
    final api = MyTestApi();
    final state = myState(api);
    await tester.pumpWidget(MycaApp(state: state));
    await settle(tester);
    await tapKey(tester, 'my.language');
    await tester.tap(find.byKey(const Key('my.language.ms')));
    await settle(tester);
    expect(find.text('e-Invois baharu'), findsOneWidget);
    expect(find.text('Anggarkan cukai saya'), findsOneWidget);
    expect((state.languages as MemoryLanguageStore).code, 'ms');
  });

  testWidgets('a phone set to Malay opens in Malay', (tester) async {
    tester.platformDispatcher.localesTestValue = const [Locale('ms', 'MY')];
    addTearDown(tester.platformDispatcher.clearLocalesTestValue);
    await tester.pumpWidget(MycaApp(state: myState(MyTestApi())));
    await settle(tester);
    expect(find.text('e-Invois baharu'), findsOneWidget);
  });
}
