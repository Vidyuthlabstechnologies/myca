import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/india/india_strings.dart';
import 'package:myca/india/lang/hi.dart';
import 'package:myca/india/lang/hi_account.dart';
import 'package:myca/india/lang/hi_core.dart';
import 'package:myca/india/lang/hi_entries.dart';
import 'package:myca/india/lang/hi_money.dart';
import 'package:myca/india/lang/hi_people.dart';
import 'package:myca/india/lang/hi_shared.dart';
import 'package:myca/india/lang/hi_taxes.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';
import 'india_keys.dart';

void main() {
  final keys = indiaKeys();

  test('every India line goes through inText, inFormat or inCount with plain text, and Hindi has every one of them', () {
    expect(keys.badCalls, isEmpty);
    expect(keys.used, isNotEmpty);
    expect(keys.used.difference(hindi.keys.toSet()), isEmpty, reason: 'add these lines to a file in lib/india/lang/hi_*.dart');
    expect(keys.shared, isNotEmpty);
    expect(hindi.keys.toSet().difference(keys.used).difference(keys.shared), isEmpty, reason: 'these Hindi lines are not used anywhere');
  });

  test('the Hindi area files never give one English line two different Hindi lines', () {
    final seen = <String, String>{};
    for (final part in [hiCore, hiShared, hiTaxes, hiPeople, hiEntries, hiMoney, hiAccount]) {
      for (final entry in part.entries) {
        expect(seen[entry.key] ?? entry.value, entry.value, reason: entry.key);
        seen[entry.key] = entry.value;
      }
    }
  });

  for (final language in indiaLanguages.where((language) => language.code != 'en')) {
    test('${language.englishName} lines are in ${language.englishName} script and keep every {part}', () {
      for (final entry in language.table.entries) {
        expect(language.script!.hasMatch(entry.value) || !RegExp(r'[A-Za-z]{3}').hasMatch(entry.key), isTrue, reason: '${entry.key} => ${entry.value}');
        expect(placeholders(entry.value), placeholders(entry.key), reason: '${entry.key} => ${entry.value}');
      }
    });
    if (language.code != 'hi') {
      test('${language.englishName} is either not started or covers every Hindi line', () {
        if (language.table.isEmpty) return;
        expect(hindi.keys.toSet().difference(language.table.keys.toSet()), isEmpty, reason: '${language.englishName} is missing these lines');
        expect(language.table.keys.toSet().difference(hindi.keys.toSet()), isEmpty, reason: '${language.englishName} has lines Hindi does not');
      });
    }
  }

  test('inFormat puts each part where the language wants it', () {
    expect(inFill('{name} को {amount} दिए', {'amount': '₹500', 'name': 'Ravi'}), 'Ravi को ₹500 दिए');
    expect(inFill('Paid {amount}', {'name': 'x'}), 'Paid {amount}');
  });

  test('the phone language is used when MyCA has it, otherwise English', () {
    final supported = [for (final language in indiaOfferedLanguages) language.locale];
    expect(indiaResolveLocale(const Locale('hi', 'IN'), supported), const Locale('hi', 'IN'));
    expect(indiaResolveLocale(const Locale('fr', 'FR'), supported), const Locale('en', 'US'));
    expect(indiaResolveLocale(null, supported), const Locale('en', 'US'));
    expect(indiaChosenLocale('hi'), const Locale('hi', 'IN'));
    expect(indiaChosenLocale(''), isNull);
    expect(indiaChosenLocale('xx'), isNull);
  });

  testWidgets('on an English phone the owner can switch the app to Hindi and back', (tester) async {
    final state = testState(FakeMycaApi(signedIn: true));
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('in.language')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('in.language.hi')));
    await tester.pumpAndSettle();
    expect(state.language, 'hi');
    expect(find.byTooltip('नई एंट्री'), findsOneWidget);
    await tester.tap(find.byKey(const Key('in.language')));
    await tester.pumpAndSettle();
    expect(find.text('भाषा · Language'), findsOneWidget);
    await tester.tap(find.byKey(const Key('in.language.phone')));
    await tester.pumpAndSettle();
    expect(find.byTooltip('New entry'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('on a Hindi phone the India home and the new entry sheet are in Hindi', (tester) async {
    tester.platformDispatcher.localesTestValue = const [Locale('hi', 'IN')];
    addTearDown(tester.platformDispatcher.clearLocalesTestValue);
    await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true))));
    await tester.pumpAndSettle();
    expect(find.text('3 काम आपका इंतज़ार कर रहे हैं'), findsOneWidget);
    expect(find.text('समय निकल गया'), findsOneWidget);
    await tester.dragUntilVisible(find.text('बिक्री'), find.byType(Scrollable).first, const Offset(0, -200));
    expect(find.text('आपके बही-खाते'), findsOneWidget);
    expect(find.text('YOUR BOOKS'), findsNothing);
    await tester.tap(find.byTooltip('नई एंट्री'));
    await tester.pumpAndSettle();
    expect(find.text('क्या हुआ?'), findsOneWidget);
    expect(find.text('मैंने कुछ बेचा'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('an English phone keeps English', (tester) async {
    await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true))));
    await tester.pumpAndSettle();
    expect(find.byTooltip('New entry'), findsOneWidget);
    await tester.dragUntilVisible(find.text('Sales'), find.byType(Scrollable).first, const Offset(0, -200));
    expect(find.text('YOUR BOOKS'), findsOneWidget);
    expect(find.text('आपके बही-खाते'), findsNothing);
  });

  for (final row in const {'नकदी': 'अभी बैंक और नकदी', 'बैंक': 'स्टेटमेंट लाएँ', 'दोहराई जाने वाली एंट्री': 'दोहराने वाला खर्च जोड़ें', 'रिपोर्ट': 'ऑडिट ट्रेल', 'रिमाइंडर': 'रिमाइंडर'}.entries) {
    testWidgets('on a Hindi phone ${row.key} opens in Hindi without overflowing', (tester) async {
      tester.platformDispatcher.localesTestValue = const [Locale('hi', 'IN')];
      addTearDown(tester.platformDispatcher.clearLocalesTestValue);
      await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true))));
      await tester.pumpAndSettle();
      await tester.dragUntilVisible(find.text(row.key), find.byType(Scrollable).first, const Offset(0, -200));
      await tester.ensureVisible(find.text(row.key));
      await tester.pumpAndSettle();
      await tester.tap(find.text(row.key));
      await tester.pumpAndSettle();
      expect(find.textContaining(row.value), findsWidgets);
      expect(tester.takeException(), isNull);
    });
  }
}
