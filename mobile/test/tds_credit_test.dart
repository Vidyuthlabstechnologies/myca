import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';
import 'package:myca/theme.dart';
import 'package:myca/widgets.dart';

import 'fake_api.dart';

const _statement = 'Name of Deductor,TAN of Deductor,Section,Transaction Date,Amount Paid,Tax Deducted\nDelta Projects,MUMD12345B,194J,2026-08-10,100000,2000\n';

class _Saved {
  final files = <String, Uint8List>{};

  AppState state(FakeMycaApi api, {PickTextFile? pick}) => AppState(
    api: api,
    store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
    pickTextFile: pick ?? (_) async => null,
    saveBytesFile: (name, bytes, mime) async {
      files[name] = bytes;
      return true;
    },
    now: () => DateTime(2026, 10, 5, 22, 30),
  );
}

Future<void> openCheck(WidgetTester tester, AppState state) async {
  await tester.pumpWidget(MycaApp(state: state));
  await tester.pumpAndSettle();
  await tester.tap(find.text('3 things need you'));
  await tester.pumpAndSettle();
  final row = find.text('Form 26AS check');
  await tester.scrollUntilVisible(row, 200, scrollable: find.byType(Scrollable).first);
  await tester.ensureVisible(row);
  await tester.pumpAndSettle();
  await tester.tap(row);
  await tester.pumpAndSettle();
}

Future<void> openCustomer(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
  await tapRow(tester, 'Sales');
  await tester.tap(find.text('Gujarat Weaves'));
  await tester.pumpAndSettle();
}

Color _colorOf(WidgetTester tester, String text) => tester.widget<Text>(find.text(text)).style!.color!;

void main() {
  tearDown(() => moneyCountry = 'IN');

  test('the 26AS check reads the engine shape, and a refusal is no check', () {
    final check = TdsCreditCheck.fromTool({
      'ok': true,
      'data': {
        'fy': '2026-27',
        'source': '26AS imported 2026-10-02',
        'rows': [
          {'section': '194J', 'tan': 'MUMD12345B', 'deductor': 'Delta Projects', 'customer': 'Delta Projects', 'quarter': 'Q2 2026-27', 'in26as': 2000, 'inBooks': 1500, 'gap': -500, 'status': 'more in 26AS'},
          'not a row',
        ],
        'totals': {'in26as': 2000, 'inBooks': 1500, 'gap': -500, 'notInBooks': 0, 'notIn26as': 0},
        'bySection': const <Object?>[],
        'note': 'AIS is not read yet.',
      },
    })!;
    expect(check.fy, '2026-27');
    expect(check.source, '26AS imported 2026-10-02');
    expect([check.in26as, check.inBooks, check.gap], [2000, 1500, -500]);
    expect(check.note, 'AIS is not read yet.');
    expect(check.rows, hasLength(2));
    expect(check.rows.first.who, 'Delta Projects');
    expect([check.rows.first.section, check.rows.first.tan, check.rows.first.quarter, check.rows.first.status], ['194J', 'MUMD12345B', 'Q2 2026-27', 'more in 26AS']);
    expect(check.rows.last.status, '');
    expect(TdsCreditCheck.fromTool({'ok': false, 'error': 'UNKNOWN_TOOL'}), isNull);
    expect(TdsCreditCheck.fromTool(null)!.rows, isEmpty);
  });

  test('a TDS receipt is told apart from cash by its mode, and keeps its section and TAN', () {
    final doc = Invoice.fromJson({
      'id': 'INV-0002',
      'partyName': 'Gujarat Weaves',
      'total': 377600,
      'status': 'partial',
      'receipts': [
        {'amount': 7552, 'date': '2026-10-05', 'mode': 'tds', 'section': '194J', 'tan': 'MUMD12345B'},
        {'amount': 1000, 'date': '2026-10-05', 'mode': 'bank'},
      ],
    });
    expect(doc.receipts.first.tds, isTrue);
    expect([doc.receipts.first.section, doc.receipts.first.tan], ['194J', 'MUMD12345B']);
    expect(doc.receipts.last.tds, isFalse);
    expect(doc.receipts.last.section, '');
  });

  testWidgets('Taxes opens the Form 26AS check, which shows the three totals, the source and every row with its status', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openCheck(tester, testState(api));
    expect(api.queries, contains('tds_credit_check'));
    expect(find.text('Form 26AS check'), findsOneWidget);
    expect(find.text('FINANCIAL YEAR 2026-27'), findsOneWidget);
    expect(find.text('In 26AS'), findsOneWidget);
    expect(find.text('₹4,300.00'), findsOneWidget);
    expect(find.text('In your books'), findsOneWidget);
    expect(find.text('₹3,520.00'), findsOneWidget);
    expect(find.text('Gap'), findsOneWidget);
    expect(find.text('-₹780.00'), findsOneWidget);
    expect(find.text('26AS imported 2026-10-02'), findsOneWidget);

    for (var i = 0; i < 4; i++) {
      expect(find.byKey(ValueKey('tds26.$i')), findsOneWidget);
    }
    expect(find.byKey(const ValueKey('tds26.4')), findsNothing);
    expect(find.text('Delta Projects · Q2 2026-27'), findsOneWidget);
    expect(find.text('26AS ₹2,000.00 · books ₹2,000.00 · Section 194J · TAN MUMD12345B'), findsOneWidget);
    expect(find.text('Northwind Traders · Q2 2026-27'), findsOneWidget);
    expect(find.text('amazon · Q3 2026-27'), findsOneWidget);
    expect(find.text('26AS ₹800.00 · books ₹920.00 · Section 194O'), findsOneWidget);
    expect(find.text('Kappa Retail · Q3 2026-27'), findsOneWidget);

    expect(find.descendant(of: find.byKey(const ValueKey('tds26.0')), matching: find.byType(StatusTag)), findsOneWidget);
    expect(_colorOf(tester, 'matched'), Palette.accent);
    expect(_colorOf(tester, 'not in books'), Palette.danger);
    expect(_colorOf(tester, 'short in 26AS'), Palette.danger);
    expect(_colorOf(tester, 'not in 26AS'), Palette.warn);
    expect(find.textContaining('AIS is not read yet.'), findsOneWidget);
    expect(find.text('Import Form 26AS from the income-tax portal (CSV or text) to compare it with your books.'), findsNothing);
  });

  testWidgets('with nothing imported the screen says how to start, and still offers the import and the Excel file', (tester) async {
    final api = FakeMycaApi(signedIn: true)..tdsCreditRows.clear();
    await openCheck(tester, testState(api));
    expect(find.text('Import Form 26AS from the income-tax portal (CSV or text) to compare it with your books.'), findsOneWidget);
    expect(find.text('no 26AS imported yet'), findsOneWidget);
    expect(find.byKey(const ValueKey('tds26.0')), findsNothing);
    expect(find.text('₹0.00'), findsNWidgets(3));
    expect(find.widgetWithText(ActionChip, 'Import 26AS'), findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, 'Save as Excel'), findsOneWidget);
  });

  testWidgets('a refused check renders nothing but a way to try again', (tester) async {
    final api = _RefusingApi();
    await openCheck(tester, testState(api));
    expect(find.text('The Form 26AS check could not be read.'), findsOneWidget);
    expect(find.byType(StatusTag), findsNothing);
    expect(find.textContaining('₹'), findsNothing);
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('Save as Excel asks for the tds_credit_check report and saves the file it gets back', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    final saved = _Saved();
    await openCheck(tester, saved.state(api));
    await tester.scrollUntilVisible(find.text('Save as Excel'), 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Save as Excel'));
    await tester.pumpAndSettle();
    expect(api.queryArgs.where((q) => q.name == 'export_xlsx').single.args, {'report': 'tds_credit_check'});
    expect(saved.files.keys.toList(), ['myca-tds-credit-check-2026-10-05.xlsx']);
    expect(find.text('Saved myca-tds-credit-check-2026-10-05.xlsx. Open it in Excel or send it to your CA.'), findsOneWidget);
  });

  testWidgets('Import 26AS uploads the picked file, proposes import_26as_credits, and the check reloads once it is posted', (tester) async {
    final api = FakeMycaApi(signedIn: true)..tdsCreditRows.clear();
    final saved = _Saved();
    await openCheck(tester, saved.state(api, pick: (_) async => const PickedText(name: 'form26as.txt', content: _statement)));
    await tester.tap(find.widgetWithText(ActionChip, 'Import 26AS'));
    await tester.pumpAndSettle();
    expect(api.uploads['sha-of-form26as.txt'], _statement);
    expect(api.proposals.single.tool, 'import_26as_credits');
    expect(api.proposals.single.args, {'documentSha256': 'sha-of-form26as.txt'});
    expect(find.text('Import Form 26AS: form26as.txt'), findsOneWidget);
    expect(find.text('Post it'), findsOneWidget);
    expect(find.byKey(const ValueKey('tds26.0')), findsNothing);

    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(api.confirmed, isNotEmpty);
    expect(api.queries.where((q) => q == 'tds_credit_check'), hasLength(2));
    expect(find.byKey(const ValueKey('tds26.0')), findsOneWidget);
    expect(find.text('not in books'), findsOneWidget);
  });

  testWidgets('Import 26AS with no file picked proposes nothing', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openCheck(tester, testState(api));
    await tester.tap(find.widgetWithText(ActionChip, 'Import 26AS'));
    await tester.pumpAndSettle();
    expect(api.proposals, isEmpty);
    expect(api.uploads, isEmpty);
  });

  for (final deducts in [false, true]) {
    testWidgets('the Form 26AS check is the last row of the TDS panel when the business ${deducts ? 'deducts TDS' : 'does not deduct TDS'}', (tester) async {
      final api = FakeMycaApi(signedIn: true)..tdsDeductor = deducts;
      await tester.pumpWidget(MycaApp(state: testState(api)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('3 things need you'));
      await tester.pumpAndSettle();
      final row = find.text('Form 26AS check');
      await tester.scrollUntilVisible(row, 200, scrollable: find.byType(Scrollable).first);
      await tester.ensureVisible(row);
      await tester.pumpAndSettle();
      expect(find.text('TDS your customers deducted, compared with 26AS'), findsOneWidget);
      final panel = find.ancestor(of: row, matching: find.byType(Panel));
      final cards = tester.widgetList<RowCard>(find.descendant(of: panel, matching: find.byType(RowCard))).toList();
      expect(cards.last.title, 'Form 26AS check');
      expect(cards.last.subtitle, 'TDS your customers deducted, compared with 26AS');
      expect(cards.last.trailing, isA<Chevron>());
      expect(cards.map((card) => card.title), contains(deducts ? '₹6,000.00 still to deposit' : 'Deduct TDS on bills'));
      expect(cards.where((card) => card.title == 'Form 26AS check'), hasLength(1));
    });
  }

  testWidgets('TDS withheld on a sales invoice: the sheet starts at 2% under 194C, and the proposal carries the invoice, amount, section, date and TAN', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openCustomer(tester, api);
    await tester.tap(find.widgetWithText(ActionChip, 'TDS withheld'));
    await tester.pumpAndSettle();
    expect(find.text('TDS withheld by Gujarat Weaves'), findsOneWidget);
    expect(tester.widget<TextField>(find.widgetWithText(TextField, 'TDS withheld')).controller!.text, '7552');
    expect(tester.widget<ChoiceChip>(find.byKey(const ValueKey('tds.section.194C'))).selected, isTrue);
    expect(find.text('5 October 2026'), findsOneWidget);
    for (final section in ['194A', '194C', '194H', '194I', '194J', '194Q', '194O', '192', '194D', '194G', '194LA', '206AB']) {
      expect(find.byKey(ValueKey('tds.section.$section')), findsOneWidget);
    }

    await tester.enterText(find.widgetWithText(TextField, 'TDS withheld'), '3776');
    await tester.tap(find.byKey(const ValueKey('tds.section.194J')));
    await tester.pumpAndSettle();
    expect(tester.widget<ChoiceChip>(find.byKey(const ValueKey('tds.section.194J'))).selected, isTrue);
    expect(tester.widget<ChoiceChip>(find.byKey(const ValueKey('tds.section.194C'))).selected, isFalse);
    await tester.enterText(find.widgetWithText(TextField, 'Customer\'s TAN (optional)'), 'mumd 12345 b');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();

    expect(api.proposals.single.tool, 'record_tds_withheld');
    expect(api.proposals.single.args, {'invoiceId': 'INV-0002', 'amount': 3776, 'date': '2026-10-05', 'section': '194J', 'tan': 'MUMD12345B'});
    expect(find.text('TDS withheld ₹3,776.00 against INV-0002 (section 194J)'), findsOneWidget);
    expect(find.text('TDS of ₹3,776.00 withheld by Gujarat Weaves on INV-0002 (section 194J)'), findsOneWidget);
    expect(find.text('Post it'), findsOneWidget);
    expect(api.invoices[1]['status'], 'posted', reason: 'nothing changes before it is posted');
  });

  testWidgets('posting TDS withheld settles the invoice by that amount and the customer thread shows a TDS line, not a cash receipt', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openCustomer(tester, api);
    await tester.tap(find.widgetWithText(ActionChip, 'TDS withheld'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('tds.section.194J')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.single.args, {'invoiceId': 'INV-0002', 'amount': 7552, 'date': '2026-10-05', 'section': '194J'});

    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(api.confirmed, isNotEmpty);
    expect(api.invoices[1]['status'], 'partial');
    expect((api.invoices[1]['receipts'] as List).single, {'amount': 7552, 'date': '2026-10-05', 'mode': 'tds', 'section': '194J'});
    expect(find.text('TDS withheld (194J) against INV-0002'), findsOneWidget);
    expect(find.text('₹7,552.00'), findsOneWidget);
    expect(find.textContaining('Received by tds'), findsNothing);
    expect(find.text('Recorded TDS of ₹7,552.00 withheld on INV-0002; ₹3,70,048.00 still owed.'), findsOneWidget);
    expect(find.text('Unpaid'), findsOneWidget);
    expect(find.widgetWithText(ActionChip, 'TDS withheld'), findsOneWidget);
  });

  testWidgets('a TAN that is not a TAN, or no amount, is told plainly and nothing is proposed', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openCustomer(tester, api);
    await tester.tap(find.widgetWithText(ActionChip, 'TDS withheld'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Customer\'s TAN (optional)'), 'ABC123');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(find.text('A TAN looks like MUMA12345B.'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Customer\'s TAN (optional)'), '');
    await tester.enterText(find.widgetWithText(TextField, 'TDS withheld'), '');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(find.text('Enter how much TDS the customer withheld.'), findsOneWidget);
    expect(api.proposals, isEmpty);
  });

  testWidgets('TDS withheld is offered for customers who owe something, not for suppliers, paid-up customers or US books', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Sales');
    await tester.tap(find.text('Retail Mart'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ActionChip, 'Payment received'), findsNothing);
    expect(find.widgetWithText(ActionChip, 'TDS withheld'), findsNothing);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Gujarat Weaves'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ActionChip, 'TDS withheld'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tapRow(tester, 'Purchases');
    await tester.tap(find.text('Fabric Co'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ActionChip, 'Paid'), findsOneWidget);
    expect(find.widgetWithText(ActionChip, 'TDS withheld'), findsNothing);
  });

  testWidgets('US books never offer TDS withheld', (tester) async {
    final api = FakeMycaApi(signedIn: true)..country = 'US';
    await openCustomer(tester, api);
    expect(find.widgetWithText(ActionChip, 'Payment received'), findsOneWidget);
    expect(find.widgetWithText(ActionChip, 'TDS withheld'), findsNothing);
  });
}

class _RefusingApi extends FakeMycaApi {
  _RefusingApi() : super(signedIn: true);

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    if (name == 'tds_credit_check') return {'ok': false, 'error': 'UNKNOWN_TOOL'};
    return super.query(name, args);
  }
}
