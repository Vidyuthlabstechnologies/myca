import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';
import 'package:myca/widgets.dart';

import 'fake_api.dart';

Future<void> openBank(WidgetTester tester, AppState state) async {
  await tester.pumpWidget(MycaApp(state: state));
  await tester.pumpAndSettle();
  await tapRow(tester, 'Bank');
}

Finder status(String words) => find.descendant(of: find.byType(Panel), matching: find.text(words));

Future<void> tapChip(WidgetTester tester, String label) async {
  final chip = find.widgetWithText(ActionChip, label);
  await tester.scrollUntilVisible(chip, 200, scrollable: find.byType(Scrollable).last);
  await tester.tap(chip);
  await tester.pumpAndSettle();
}

void main() {
  test('the reconciliation, its lines, suggestions and rules read from the tool result with plain words', () {
    final recon = BankReconciliation.fromTool({
      'ok': true,
      'data': {
        'account': {'id': '1002', 'label': 'Bank', 'kind': 'bank'},
        'from': '2026-08-05',
        'to': '2026-11-04',
        'lines': [
          {
            'id': 'BL-000012',
            'date': '2026-11-03',
            'narration': 'NEFT  SHARMA TRADERS\n UTR 12',
            'refNo': 'UTR12',
            'in': 11800,
            'out': 0,
            'balance': 50000,
            'status': 'unmatched',
            'category': 'unclassified',
            'tieBreak': false,
            'match': null,
            'suggestions': [
              {'kind': 'books', 'transferId': 100123, 'docId': 'INV-0007', 'docKind': 'receipt', 'party': 'Sharma Traders', 'amount': 11800, 'date': '2026-11-03', 'why': 'Same amount'},
              {'kind': 'receipt', 'partyName': 'Sharma Traders', 'invoiceIds': ['INV-0007'], 'amount': 11800, 'why': 'Name in the narration'},
              {'kind': 'receipt', 'partyName': 'Sharma Traders', 'invoiceIds': ['INV-0007', 'INV-0008'], 'amount': 11800, 'why': 'Name in the narration'},
              {'kind': 'charge', 'head': '5180', 'why': 'Looks like a charge'},
              {'kind': 'interest', 'why': 'Looks like interest'},
              {'kind': 'transfer', 'why': 'Looks like a transfer'},
            ],
          },
          {'id': 'BL-000013', 'date': '2026-11-04', 'narration': 'SMS CHARGES', 'in': 0, 'out': 25, 'balance': 49975, 'status': 'booked', 'match': {'kind': 'charge', 'id': 'EXP-0031', 'transferIds': ['100130'], 'ruleId': 'BR-0001', 'note': ''}},
          {'id': 'BL-000014', 'date': '2026-11-04', 'narration': '', 'refNo': 'CHQ 441', 'in': 0, 'out': 500, 'balance': 49475, 'status': 'ignored', 'match': {'kind': 'ignore', 'id': '', 'transferIds': [], 'ruleId': '', 'note': 'Personal'}},
        ],
        'books': [
          {'transferId': '100140', 'date': '2026-11-02', 'docKind': 'expense', 'docId': 'EXP-0030', 'party': 'Airtel', 'in': 0, 'out': 1180},
        ],
        'totals': {'statementBalance': 49475, 'statementOn': '2026-11-04', 'booksBalance': 36495, 'difference': 12980, 'lines': {'unmatched': 1, 'matched': 0, 'booked': 1, 'ignored': 1}, 'unmatchedIn': 11800, 'unmatchedOut': 0},
        'reconciledThrough': '',
        'rules': [
          {'id': 'BR-0001', 'side': 'out', 'contains': 'sms charges', 'pattern': '', 'minAmount': null, 'maxAmount': 100, 'then': {'kind': 'charge', 'partyName': '', 'head': '5180', 'otherAccount': '', 'note': ''}, 'hits': 3, 'createdOn': '2026-10-01'},
        ],
        'accounts': [
          {'id': '1001', 'label': 'Cash', 'kind': 'cash', 'balance': 5000},
          {'id': '1002', 'label': 'Bank', 'kind': 'bank', 'balance': 36495},
        ],
      },
    })!;
    final line = recon.lines.first;
    expect(line.title, 'NEFT SHARMA TRADERS UTR 12');
    expect(line.subtitle, '3 November 2026 · in ₹11,800.00 · Not matched yet');
    expect(line.open, isTrue);
    expect(line.suggestions.map((s) => s.words).toList(), [
      'Already in the books: receipt INV-0007 on 3 November 2026',
      'Receipt INV-0007 from Sharma Traders',
      'Receipt INV-0007, INV-0008 from Sharma Traders',
      'Bank charge',
      'Interest earned',
      'Transfer to another account',
    ]);
    expect(line.suggestions[0].matchArgs, {'kind': 'books', 'transferId': '100123'});
    expect(line.suggestions[1].matchArgs, {'kind': 'receipt', 'invoiceId': 'INV-0007'});
    expect(line.suggestions[2].matchArgs, {'kind': 'receipt', 'partyName': 'Sharma Traders'});
    expect(line.suggestions[3].matchArgs, {'kind': 'charge', 'head': '5180'});
    expect(recon.lines[1].statusWords, 'Booked');
    expect(recon.lines[1].match!.words, 'Bank charge EXP-0031 by rule BR-0001');
    expect(recon.lines[2].title, 'CHQ 441');
    expect(recon.lines[2].statusWords, 'Ignored');
    expect(recon.lines[2].match!.words, 'Ignored: Personal');
    expect(recon.lines[2].linked, isTrue);
    expect(recon.books.single.title, 'Expense EXP-0030 · Airtel');
    expect(recon.books.single.subtitle, '2 November 2026 · out ₹1,180.00');
    expect(recon.totals.difference, 12980);
    expect(recon.totals.unmatchedWords, '1 not matched yet');
    expect(recon.rules.single.words, 'Money out containing “sms charges” up to ₹100.00 is a bank charge');
    expect(recon.rules.single.hitsWords, '3 lines so far');
    expect(recon.accounts.map((a) => a.label).toList(), ['Cash', 'Bank']);
    expect(
      bankAccountsFrom({
        'ok': true,
        'data': {
          'accounts': [
            {'id': '1003', 'label': 'HDFC current', 'kind': 'bank', 'maskedNumber': '1234', 'ifsc': 'HDFC0000001', 'balance': 10, 'builtIn': false},
          ],
        },
      }).single.words,
      'HDFC current ••1234',
    );
    expect(
      bankRulesFrom({
        'ok': true,
        'data': {
          'rules': [
            {'id': 'BR-0002', 'side': 'in', 'contains': 'sharma', 'then': {'kind': 'receipt', 'partyName': 'Sharma Traders'}},
          ],
        },
      }).single.args,
      {'side': 'in', 'contains': 'sharma', 'kind': 'receipt', 'partyName': 'Sharma Traders'},
    );
    expect(BankReconciliation.fromTool({'ok': false, 'error': 'NOT_QUERYABLE'}), isNull);
  });

  testWidgets('Bank opens from home with the totals, filters the lines, and matches a line to what is already in the books', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openBank(tester, testState(api));
    expect(api.queryArgs.any((q) => q.name == 'bank_reconciliation' && q.args['account'] == '1002'), isTrue);
    expect(find.text('Statement balance on 3 October 2026'), findsOneWidget);
    expect(find.text('₹5,70,375.00'), findsOneWidget);
    expect(find.text('In the books'), findsOneWidget);
    expect(find.text('₹1,90,420.00'), findsOneWidget);
    expect(find.text('Difference'), findsOneWidget);
    expect(find.text('₹3,79,955.00'), findsOneWidget);
    expect(find.text('3 not matched yet'), findsOneWidget);
    expect(find.text('NEFT CR GUJARAT WEAVES INV0002'), findsOneWidget);
    expect(find.text('1 October 2026 · in ₹3,77,600.00 · Not matched yet'), findsOneWidget);
    expect(find.text('UPI FABRIC CO BILL 0001'), findsOneWidget);
    expect(status('Matched'), findsOneWidget);
    expect(find.text('Expense EXP-0002 · Airtel'), findsOneWidget);

    await tester.tap(find.widgetWithText(ChoiceChip, 'Not matched yet'));
    await tester.pumpAndSettle();
    expect(find.text('UPI FABRIC CO BILL 0001'), findsNothing);
    expect(find.text('NEFT CR GUJARAT WEAVES INV0002'), findsOneWidget);

    await tester.tap(find.text('NEFT CR GUJARAT WEAVES INV0002'));
    await tester.pumpAndSettle();
    expect(find.text('Already in the books: receipt INV-0002 on 1 October 2026'), findsOneWidget);
    expect(find.text('Receipt INV-0002 from Gujarat Weaves'), findsOneWidget);
    expect(find.text('Remember this for Gujarat Weaves'), findsOneWidget);
    await tester.tap(find.text('Already in the books: receipt INV-0002 on 1 October 2026'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'match_bank_line');
    expect(api.proposals.last.args, {'lineId': 'BL-000001', 'kind': 'books', 'transferId': '100007'});
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(find.text('2 not matched yet'), findsOneWidget);
    await tester.tap(find.widgetWithText(ChoiceChip, 'All'));
    await tester.pumpAndSettle();
    expect(status('Matched'), findsNWidgets(2));
    expect(find.text('1 October 2026 · in ₹3,77,600.00 · Matched'), findsOneWidget);
  });

  testWidgets('a matched line can be unlinked; a booked one says to reverse the entry instead', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openBank(tester, testState(api));
    await tester.tap(find.text('UPI FABRIC CO BILL 0001'));
    await tester.pumpAndSettle();
    expect(find.text('Already in the books: BILL-0001'), findsOneWidget);
    await tester.tap(find.text('Unlink'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'unmatch_bank_line');
    expect(api.proposals.last.args, {'lineId': 'BL-000004'});
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(find.text('4 not matched yet'), findsOneWidget);
    expect(status('Matched'), findsNothing);
  });

  testWidgets('Book bank charges books the charge and the interest lines of the account', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openBank(tester, testState(api));
    await tapChip(tester, 'Book bank charges');
    expect(api.proposals.last.tool, 'book_bank_charges');
    expect(api.proposals.last.args, {'account': '1002'});
    expect(find.text('Book 2 lines as bank charges and interest.'), findsOneWidget);
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(status('Booked'), findsNWidgets(2));
    expect(find.text('1 not matched yet'), findsOneWidget);
    await tester.tap(find.text('SMS CHARGES SEP'));
    await tester.pumpAndSettle();
    expect(find.text('Bank charge EXP-0001'), findsOneWidget);
    expect(find.text('Unlink'), findsNothing);
  });

  testWidgets('rules are listed, added and removed from the rules sheet, and a new rule books the lines it matches', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openBank(tester, testState(api));
    await tapChip(tester, 'Rules');
    expect(find.text('Money out containing “sms charges” is a bank charge'), findsOneWidget);
    expect(find.text('BR-0001 · 2 lines so far'), findsOneWidget);
    await tester.tap(find.text('Add a rule'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ChoiceChip, 'Money in'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Words in the narration'), 'GUJARAT WEAVES');
    await tester.enterText(find.widgetWithText(TextField, 'Customer'), 'Gujarat Weaves');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'add_bank_rule');
    expect(api.proposals.last.args, {'side': 'in', 'contains': 'GUJARAT WEAVES', 'kind': 'receipt', 'partyName': 'Gujarat Weaves'});
    expect(find.text('Rule: Money in containing “GUJARAT WEAVES” is a receipt from Gujarat Weaves'), findsOneWidget);
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(api.bankRules.length, 2);
    expect(status('Booked'), findsOneWidget);
    expect(find.text('2 not matched yet'), findsOneWidget);

    await tapChip(tester, 'Rules');
    await tester.tap(find.widgetWithText(TextButton, 'Remove').first);
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'remove_bank_rule');
    expect(api.proposals.last.args, {'id': 'BR-0001'});
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(api.bankRules.map((r) => r['id']).toList(), ['BR-0002']);
  });

  testWidgets('a transfer between own accounts is recorded once and then shows among the books', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openBank(tester, testState(api));
    await tapChip(tester, 'Record a transfer');
    final sheet = find.byType(BottomSheet);
    await tester.tap(find.descendant(of: sheet, matching: find.widgetWithText(ChoiceChip, 'Cash')).last);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Amount'), '50000');
    await tester.enterText(find.widgetWithText(TextField, 'Reference (optional)'), 'chq 112');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'record_transfer');
    expect(api.proposals.last.args, {'fromAccount': '1002', 'toAccount': '1001', 'amount': 50000, 'date': '2026-10-05', 'reference': 'chq 112'});
    expect(find.text('Transfer ₹50,000.00 from Bank to Cash'), findsOneWidget);
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(api.bankTransfers.single['toAccount'], '1001');
    expect(find.text('Transfer CTR-0001'), findsOneWidget);
  });

  testWidgets('an account is added from its sheet', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openBank(tester, testState(api));
    await tapChip(tester, 'Add an account');
    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'HDFC current');
    await tester.enterText(find.widgetWithText(TextField, 'Last 4 digits of the account number (optional)'), '50011234');
    await tester.enterText(find.widgetWithText(TextField, 'IFSC (optional)'), 'hdfc0000001');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'set_bank_account');
    expect(api.proposals.last.args, {'label': 'HDFC current', 'kind': 'bank', 'maskedNumber': '1234', 'ifsc': 'HDFC0000001'});
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ChoiceChip, 'HDFC current'), findsOneWidget);
  });

  testWidgets('a statement is brought in on hold for the account shown', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    final asked = <List<String>>[];
    final state = testState(
      api,
      pick: (extensions) async {
        asked.add(extensions);
        return const PickedText(name: 'hdfc-nov.csv', content: 'Date,Narration,Withdrawal,Deposit,Balance\n2026-11-02,NEFT CR RETAIL MART,0,59000,629375\n');
      },
    );
    await openBank(tester, state);
    await tapChip(tester, 'Bring in a statement');
    expect(asked.single, ['csv', 'txt', 'json']);
    expect(api.uploads['sha-of-hdfc-nov.csv'], startsWith('Date,Narration'));
    expect(api.proposals.last.tool, 'import_bank');
    expect(api.proposals.last.args, {'documentSha256': 'sha-of-hdfc-nov.csv', 'type': 'csv', 'post': 'hold', 'account': '1002'});
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(find.text('NEFT CR RETAIL MART'), findsOneWidget);
    expect(find.text('4 not matched yet'), findsOneWidget);
  });

  testWidgets('Save as Excel saves the workbook the engine returns with its name and type', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    final saved = <String, Uint8List>{};
    final mimes = <String>[];
    final state = AppState(
      api: api,
      store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
      pickTextFile: (_) async => null,
      saveBytesFile: (name, bytes, mime) async {
        saved[name] = bytes;
        mimes.add(mime);
        return true;
      },
      now: () => DateTime(2026, 10, 5, 22, 30),
    );
    await openBank(tester, state);
    await tapChip(tester, 'Save as Excel');
    expect(api.queryArgs.any((q) => q.name == 'export_xlsx' && q.args['report'] == 'bank_reconciliation' && q.args['account'] == '1002'), isTrue);
    expect(saved.keys.single, 'myca-bank-reconciliation-2026-10-05.xlsx');
    expect(String.fromCharCodes(saved.values.single), 'PK\u0003\u0004test');
    expect(mimes.single, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(find.text('Saved myca-bank-reconciliation-2026-10-05.xlsx. Open it in Excel or send it to your CA.'), findsOneWidget);
  });

  testWidgets('with no statement yet the screen says what to do', (tester) async {
    final api = FakeMycaApi(signedIn: true)
      ..bankLines.clear()
      ..bankBooks.clear();
    await openBank(tester, testState(api));
    expect(find.text('Bring in a bank statement and MyCA shows it next to your books.'), findsOneWidget);
    expect(find.widgetWithText(ActionChip, 'Bring in a statement'), findsOneWidget);
  });
}
