import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/india/india_strings.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  test('every India text shown through inText has a Hindi line, and every Hindi line is used by inText or the shared screen wording', () {
    final used = <String>{};
    final call = RegExp(r"inText\(\s*\w+,\s*'((?:[^'\\]|\\.)*)'\s*\)");
    for (final entity in Directory('lib').listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      final source = entity.readAsStringSync();
      expect(RegExp(r'inText\(').allMatches(source).length - (entity.path.endsWith('india_strings.dart') ? 1 : 0), call.allMatches(source).length, reason: '${entity.path}: give inText one plain text');
      used.addAll(call.allMatches(source).map((hit) => hit.group(1)!.replaceAll(r"\'", "'")));
    }
    expect(used, isNotEmpty);
    expect(used.difference(indiaHindiText.keys.toSet()), isEmpty);
    final shared = RegExp(r"_\(\s*'((?:[^'\\]|\\.)*)'").allMatches(File('lib/uae/uae_strings.dart').readAsStringSync()).map((hit) => hit.group(1)!.replaceAll(r"\'", "'")).toSet();
    expect(shared, isNotEmpty);
    expect(indiaHindiText.keys.toSet().difference(used).difference(shared), isEmpty);
    for (final entry in indiaHindiText.entries) {
      expect(RegExp(r'[ऀ-ॿ]').hasMatch(entry.value), isTrue, reason: entry.key);
    }
  });

  test('only a Hindi phone gets Hindi', () {
    expect(indiaResolveLocale(const Locale('hi', 'IN'), indiaLocales), const Locale('hi', 'IN'));
    expect(indiaResolveLocale(const Locale('ta', 'IN'), indiaLocales), const Locale('en', 'US'));
    expect(indiaResolveLocale(null, indiaLocales), const Locale('en', 'US'));
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
}
