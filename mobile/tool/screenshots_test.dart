import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';

import '../test/fake_api.dart';

Future<void> loadFonts() async {
  final flutterRoot = Platform.environment['FLUTTER_ROOT']!;
  final dir = '$flutterRoot/bin/cache/artifacts/material_fonts';
  Future<ByteData> bytes(String name) async => ByteData.view((await File('$dir/$name').readAsBytes()).buffer);
  final roboto = FontLoader('Roboto');
  for (final file in ['roboto-regular.ttf', 'roboto-medium.ttf', 'roboto-bold.ttf', 'roboto-black.ttf']) {
    roboto.addFont(bytes(file));
  }
  await roboto.load();
  final inter = FontLoader('Inter');
  for (final file in ['Inter-Regular.ttf', 'Inter-Medium.ttf', 'Inter-SemiBold.ttf']) {
    inter.addFont(File('assets/fonts/$file').readAsBytes().then((data) => ByteData.view(data.buffer)));
  }
  await inter.load();
  final icons = FontLoader('MaterialIcons')..addFont(bytes('materialicons-regular.otf'));
  await icons.load();
}

Future<void> shot(WidgetTester tester, String name) async {
  await tester.pumpAndSettle();
  await expectLater(find.byType(MaterialApp), matchesGoldenFile('screens/$name.png'));
}

void main() {
  setUpAll(loadFonts);

  Future<void> phone(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2280);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);
  }

  testWidgets('onboarding screens', (tester) async {
    await phone(tester);
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: testState(api, onboarded: false)));
    await shot(tester, '01_welcome');
    await tester.tap(find.text('Get started'));
    await shot(tester, '02_where_are_your_books');
    await tester.tap(find.text('Tally'));
    await shot(tester, '03_business');
    await tester.tap(find.text('Continue'));
    await shot(tester, '04_bring_books_across');
  });

  testWidgets('daily screens', (tester) async {
    await phone(tester);
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await shot(tester, '05_home');
    await tester.tap(find.byTooltip('Your business'));
    await shot(tester, '05b_business');
    await tester.tapAt(const Offset(20, 20));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('New entry'));
    await shot(tester, '06_new_entry');
    await tester.tap(find.text('I sold something'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Kir');
    await shot(tester, '07_who_did_you_sell_to');
    await tester.enterText(find.byType(TextField), 'guj');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Gujarat Weaves'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Amount before GST'), '8000');
    await tester.tap(find.widgetWithText(ActionChip, '18%'));
    await shot(tester, '09_new_sale');
    await tester.tap(find.text('Preview'));
    await shot(tester, '10_not_posted_yet');
    await tester.tap(find.text('Post it'));
    await shot(tester, '11_posted');
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sales'));
    await shot(tester, '08_sales');
  });

  testWidgets('empty books', (tester) async {
    await phone(tester);
    await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true, emptyBooks: true))));
    await shot(tester, '05c_home_first_day');
  });

  testWidgets('taxes screen', (tester) async {
    await phone(tester);
    await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('3 things need you'));
    await shot(tester, '12_taxes');
  });
}
