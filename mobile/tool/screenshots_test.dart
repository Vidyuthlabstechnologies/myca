import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';
import 'package:myca_design/myca_design.dart' show Bahi;

import '../test/fake_api.dart';

Future<void> loadFonts() async {
  final flutterRoot = Platform.environment['FLUTTER_ROOT']!;
  final dir = '$flutterRoot/bin/cache/artifacts/material_fonts';
  Future<ByteData> bytes(String name) async {
    final file = Directory(dir).listSync().whereType<File>().firstWhere((f) => f.uri.pathSegments.last.toLowerCase() == name.toLowerCase());
    return ByteData.view((await file.readAsBytes()).buffer);
  }
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
  Bahi.live = false;
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
    await tester.enterText(find.byType(TextField).last, 'Kir');
    await shot(tester, '07_who_did_you_sell_to');
    await tester.enterText(find.byType(TextField).last, 'guj');
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
    await tapRow(tester, 'Sales');
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
    final review = find.text('Review the October 2026 return');
    await tester.scrollUntilVisible(review, 200, scrollable: find.byType(Scrollable).last);
    await tester.ensureVisible(review);
    await tester.pumpAndSettle();
    await tester.tap(review);
    await shot(tester, '20_review_sales');
    for (var step = 0; step < 2; step++) {
      await tester.scrollUntilVisible(find.text('Yes, correct'), 200, scrollable: find.byType(Scrollable).last);
      await tester.ensureVisible(find.text('Yes, correct'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Yes, correct'));
      await tester.pumpAndSettle();
    }
    await tester.scrollUntilVisible(find.text('Approve'), 200, scrollable: find.byType(Scrollable).last);
    await shot(tester, '21_review_approve');
  });

  testWidgets('expense screens', (tester) async {
    await phone(tester);
    await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true))));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Expenses');
    await shot(tester, '15_expenses');
    await tester.tap(find.text('Other expenses'));
    await shot(tester, '16_expense_head');
    await tester.tap(find.widgetWithText(ActionChip, 'Expense'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'What was it for'), 'Diwali gifts');
    await tester.enterText(find.widgetWithText(TextField, 'Amount paid, with GST'), '2500');
    await tester.tap(find.text('Preview'));
    await shot(tester, '17_expense_preview');
  });

  testWidgets('quote', (tester) async {
    await phone(tester);
    await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true))));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Sales');
    await tester.tap(find.text('Gujarat Weaves'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Quote QT-0001'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Make invoice'), 200, scrollable: find.byType(Scrollable).last);
    await shot(tester, '25_quote');
  });

  testWidgets('cash', (tester) async {
    await phone(tester);
    await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true)..hasBalance = true)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Cash');
    await shot(tester, '24_cash');
  });

  testWidgets('books check', (tester) async {
    await phone(tester);
    await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true))));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Books check');
    await shot(tester, '23_books_check');
  });

  testWidgets('credit against GSTR-2B', (tester) async {
    await phone(tester);
    await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true)..has2b = true)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('3 things need you'));
    await tester.pumpAndSettle();
    final card = find.text('INPUT CREDIT AGAINST GSTR-2B, OCTOBER 2026');
    await tester.scrollUntilVisible(card, 200, scrollable: find.byType(Scrollable).last);
    await tester.drag(find.byType(Scrollable).last, const Offset(0, -260));
    await shot(tester, '22_credit_at_risk');
  });

  testWidgets('invoice screen', (tester) async {
    await phone(tester);
    await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true))));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Sales');
    await tester.tap(find.text('Gujarat Weaves'));
    await shot(tester, '13_customer_chat');
    await tester.tap(find.text('Invoice INV-0002'));
    await shot(tester, '14_invoice');
    final list = find.byType(Scrollable).last;
    await tester.scrollUntilVisible(find.text('Print or save as PDF'), 200, scrollable: list);
    await tester.drag(list, const Offset(0, -900));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Credit note'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Amount, with GST (optional)'), '23600');
    await tester.enterText(find.widgetWithText(TextField, 'Reason'), 'Design work not done');
    await shot(tester, '18_credit_note_sheet');
    await tester.tap(find.text('Preview'));
    await shot(tester, '19_credit_note_preview');
  });
  testWidgets('tour with Bahi', (tester) async {
    await phone(tester);
    await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true), onboarded: false)));
    await shot(tester, '30_welcome_with_bahi');
    await tester.tap(find.text('Take a 2-minute tour first'));
    await tester.pump(const Duration(seconds: 4));
    await shot(tester, '31_tour_hello');
    await tester.tap(find.text('Show me around'));
    await tester.pump(const Duration(seconds: 4));
    await tester.tap(find.text('Next').last);
    await tester.pump(const Duration(seconds: 4));
    await shot(tester, '32_tour_log_a_sale');
    await tester.tap(find.text('Show me'));
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Amount before GST'), '8000');
    await tester.tap(find.widgetWithText(ActionChip, '18%'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Preview'));
    await tester.pump(const Duration(seconds: 4));
    await shot(tester, '33_tour_preview');
    await tester.tap(find.text('Post it'));
    await tester.pump(const Duration(seconds: 4));
    await shot(tester, '34_tour_posted');
    await tester.tap(find.text('Next').last);
    await tester.pump(const Duration(seconds: 4));
    await shot(tester, '35_tour_taxes');
    for (var step = 0; step < 2; step++) {
      await tester.tap(find.text('Next').last);
      await tester.pump(const Duration(seconds: 4));
    }
    await shot(tester, '36_tour_books_check');
    for (var step = 0; step < 2; step++) {
      await tester.tap(find.text('Next').last);
      await tester.pump(const Duration(seconds: 4));
    }
    await shot(tester, '37_tour_done');
    await tester.tap(find.text('Start my books'));
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpAndSettle();
  });
}
