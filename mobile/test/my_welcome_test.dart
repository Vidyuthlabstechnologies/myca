import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_config.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';

import 'my_support.dart';

void main() {
  tearDown(() => moneyCountry = 'IN');

  test('the my flavor is the Malaysia edition and money and dates read the Malaysian way', () {
    expect(editionFor('my', defined: ''), 'MY');
    expect(editionFor('india', defined: ''), 'IN');
    expect(editionFor('us', defined: ''), 'US');
    expect(ringgit(1234.5), 'RM1,234.50');
    expect(ringgit(-80), '-RM80.00');
    expect(ringgit(19999999998), 'RM19,999,999,998.00');
    expect(dayMonthYear('2026-11-30'), '30/11/2026');
    expect(isoFromDayMonthYear('30/11/2026'), '2026-11-30');
    expect(isoFromDayMonthYear('31/02/2026'), isNull);
    expect(isoFromDayMonthYear('2026-11-30'), isNull);
  });

  testWidgets('the welcome says what MyCA does and leads into the app', (tester) async {
    final state = myState(MyTestApi(), welcomed: false);
    await tester.pumpWidget(MycaApp(state: state));
    await settle(tester);
    expect(find.textContaining('kept simple'), findsOneWidget);
    expect(find.byKey(const Key('my.trySandbox')), findsOneWidget);
    await tapKey(tester, 'my.getStarted');
    expect(find.text('Teratai Digital Sdn Bhd'), findsOneWidget);
  });

  testWidgets('the sandbox opens on Malaysian sample books and can be left', (tester) async {
    await tester.pumpWidget(MycaApp(state: myState(MyTestApi(), welcomed: false)));
    await settle(tester);
    await tapKey(tester, 'my.trySandbox');
    expect(find.text('Sandbox with sample books: nothing is sent to LHDN'), findsWidgets);
    expect(find.text('INV-2026-0141'), findsOneWidget);
    await tapKey(tester, 'myHome.menu');
    await tester.tap(find.byKey(const Key('myHome.leaveSandbox')));
    await settle(tester);
    expect(find.byKey(const Key('my.getStarted')), findsOneWidget);
  });

  testWidgets('the welcome reads in Malay', (tester) async {
    await tester.pumpWidget(MycaApp(state: myState(MyTestApi(), welcomed: false, language: 'ms')));
    await settle(tester);
    expect(find.text('Mula'), findsOneWidget);
    expect(find.text('Cuba dengan buku contoh dahulu'), findsOneWidget);
  });
}
