import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

Future<void> signIn(WidgetTester tester, String pin) async {
  await tester.enterText(find.byType(TextField), pin);
  await tester.tap(find.text('Sign in'));
  await tester.pumpAndSettle();
}

Future<void> openHome(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
}

Future<void> startSaleFor(WidgetTester tester, String name) async {
  await tester.tap(find.byTooltip('New entry'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('I sold something'));
  await tester.pumpAndSettle();
  expect(find.text('Who did you sell to?'), findsOneWidget);
  await tester.enterText(find.byType(TextField).last, name);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('first run: welcome, sign in, migrate from Tally, then home', (
    tester,
  ) async {
    final api = FakeMycaApi();
    final asked = <List<String>>[];
    final state = testState(
      api,
      onboarded: false,
      pick: (extensions) async {
        asked.add(extensions);
        return const PickedText(name: 'daybook.csv', content: 'Date,Voucher\n');
      },
    );
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Get started'));
    await tester.pumpAndSettle();

    await signIn(tester, '0000');
    expect(find.text('Wrong PIN. Try again.'), findsOneWidget);
    await signIn(tester, '4321');

    expect(find.text('Where are your books today?'), findsOneWidget);
    await tester.tap(find.text('Tally'));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.widgetWithText(TextField, 'Business name'),
      'Kiran Traders',
    );
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(api.companyUpdates.single, {
      'name': 'Kiran Traders',
      'gstin': '27AABCU9603R1ZN',
    });
    expect(api.companyName, 'Kiran Traders');

    expect(find.text('Skip for now'), findsOneWidget);
    await tester.tap(find.text('Tally Day Book (CSV)'));
    await tester.pumpAndSettle();
    expect(asked.single, ['csv']);
    expect(api.proposals.single.tool, 'import_tally');
    expect(api.uploads, {'sha-of-daybook.csv': 'Date,Voucher\n'});
    expect(api.proposals.single.args, {'documentSha256': 'sha-of-daybook.csv'});
    expect(
      find.text('Tally import: 12 vouchers ready, 1 skipped.'),
      findsOneWidget,
    );

    await tester.tap(find.text('Bring it in'));
    await tester.pumpAndSettle();
    expect(api.confirmed.single, FakeMycaApi.token);
    expect(api.sent, isEmpty);
    await tester.tap(find.text('Open my books'));
    await tester.pumpAndSettle();
    expect(find.text('Your books check'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('YOUR BOOKS'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('YOUR BOOKS'), findsOneWidget);
    expect(find.text('Kiran Traders'), findsOneWidget);
    expect((state.store as MemoryOnboardingStore).isMigrated, isTrue);
  });

  testWidgets(
    'starting fresh has nothing to import and is nudged to the first sale',
    (tester) async {
      final api = FakeMycaApi(signedIn: true, emptyBooks: true);
      await tester.pumpWidget(MycaApp(state: testState(api, onboarded: false)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Get started'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('Starting fresh'), 200);
      await tester.tap(find.text('Starting fresh'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(api.companyUpdates, isEmpty);
      expect(find.text('You are all set'), findsOneWidget);
      await tester.tap(find.text('Open my books'));
      await tester.pumpAndSettle();
      expect(api.proposals, isEmpty);

      await tester.tap(find.text('Log your first sale'));
      await tester.pumpAndSettle();
      expect(find.text('Who did you sell to?'), findsOneWidget);
    },
  );

  testWidgets('a returning owner sees what needs them and can open taxes', (
    tester,
  ) async {
    await openHome(tester, FakeMycaApi(signedIn: true));
    expect(find.text('Get started'), findsNothing);
    expect(find.text('Log your first sale'), findsNothing);
    expect(find.text('Good evening'), findsOneWidget);
    expect(find.text('3 things need you'), findsOneWidget);
    expect(find.text('Overdue'), findsOneWidget);
    expect(find.text('TAX ON SALES, OCTOBER 2026'), findsOneWidget);
    expect(find.text('₹3,600.00'), findsOneWidget);
    expect(find.text('Credit on purchases ₹0.00'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('2 customers · Gujarat Weaves: ₹3,77,600.00'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(
      find.text('2 customers · Gujarat Weaves: ₹3,77,600.00'),
      findsOneWidget,
    );

    await tester.tap(find.text('3 things need you'));
    await tester.pumpAndSettle();
    expect(find.text('NEEDS YOU (3)'), findsOneWidget);

    await tester.tap(find.text('INV-0003 cannot be reported in GSTR-1'));
    await tester.pumpAndSettle();
    expect(find.text('The buyer GSTIN fails validation.'), findsOneWidget);
    expect(find.text('AT RISK'), findsOneWidget);
    await tester.tap(find.text('Got it'));
    await tester.pumpAndSettle();
    expect(find.text('AT RISK'), findsNothing);
  });

  testWidgets(
    'taxes show one month at a time, and the GSTR-1 file for that month can be saved',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      final saved = <String, String>{};
      final state = AppState(
        api: api,
        store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
        pickTextFile: (_) async => null,
        saveTextFile: (name, content) async {
          saved[name] = content;
          return true;
        },
        now: () => DateTime(2026, 10, 5, 22, 30),
      );
      await tester.pumpWidget(MycaApp(state: state));
      await tester.pumpAndSettle();
      await tester.tap(find.text('3 things need you'));
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(find.text('GST FOR OCTOBER 2026'), 200);
      expect(find.text('Tax on 1 sale of ₹20,000.00'), findsOneWidget);
      await tester.scrollUntilVisible(find.textContaining('is left out'), 200);
      expect(
        find.text('IGST ₹0.00 · CGST ₹1,800.00 · SGST ₹1,800.00'),
        findsOneWidget,
      );
      expect(
        find.text('INV-0009 is left out: the buyer GSTIN is not valid.'),
        findsOneWidget,
      );
      expect(find.textContaining('worked out in the return'), findsOneWidget);

      await tester.scrollUntilVisible(
        find.widgetWithText(ChoiceChip, 'August 2026'),
        -200,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(ChoiceChip, 'August 2026'));
      await tester.pumpAndSettle();
      expect(api.periodsAsked.last, '2026-08');
      await tester.scrollUntilVisible(find.text('GST FOR AUGUST 2026'), 200);
      expect(find.text('₹14,000.00'), findsWidgets);
      expect(
        find.text('IGST ₹0.00 · CGST ₹1,000.00 · SGST ₹1,000.00'),
        findsOneWidget,
      );
      await tester.scrollUntilVisible(
        find.text(
          '2 to registered buyers · 0 large to unregistered · 0 summary rows',
        ),
        200,
      );
      expect(find.textContaining('is left out'), findsNothing);

      await tester.ensureVisible(find.text('Save file for the GST portal'));
      await tester.tap(find.text('Save file for the GST portal'));
      await tester.pumpAndSettle();
      expect(saved.keys.single, 'GSTR1_27AABCU9603R1ZN_082026.json');
      expect(saved.values.single, contains('"fp": "082026"'));
      expect(
        find.textContaining('Saved GSTR1_27AABCU9603R1ZN_082026.json'),
        findsOneWidget,
      );
      expect(find.textContaining('does not upload or file'), findsOneWidget);
    },
  );

  testWidgets('a sale to a new customer: pick, enter, preview, then Post it', (
    tester,
  ) async {
    final api = FakeMycaApi(signedIn: true);
    await openHome(tester, api);
    await startSaleFor(tester, 'Kiran');
    await tester.tap(find.text('Add “Kiran”'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, 'GSTIN (optional)'), findsOneWidget);
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();

    expect(find.text('New sale'), findsOneWidget);
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(find.text('Enter the amount before GST.'), findsOneWidget);
    expect(api.proposals, isEmpty);

    await tester.enterText(
      find.widgetWithText(TextField, 'Amount before GST'),
      '8,000',
    );
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Enter the GST rate'), findsOneWidget);
    expect(api.proposals, isEmpty);

    await tester.ensureVisible(find.widgetWithText(ActionChip, '18%'));
    await tester.tap(find.widgetWithText(ActionChip, '18%'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Preview'));
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.single.tool, 'create_invoice');
    expect(api.proposals.single.args, {
      'partyName': 'Kiran',
      'partyGstin': '',
      'lines': [
        {'description': 'Supply', 'qty': 1, 'rate': 8000, 'gstRate': 18},
      ],
    });
    expect(find.text('NOT POSTED YET'), findsOneWidget);
    expect(api.invoices.length, 2);

    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(api.invoices.length, 3);
    expect(
      find.text('Posted INV-0003 to Kiran for ₹9,440.00.'),
      findsOneWidget,
    );
    expect(find.text('Post it'), findsNothing);
    expect(find.widgetWithText(ActionChip, 'Another sale'), findsOneWidget);
    expect(find.widgetWithText(ActionChip, 'Payment received'), findsOneWidget);
  });

  testWidgets('picking an existing customer skips the new-customer step', (
    tester,
  ) async {
    final api = FakeMycaApi(signedIn: true);
    await openHome(tester, api);
    await startSaleFor(tester, 'guj');
    expect(find.textContaining('Add “'), findsOneWidget);
    expect(find.text('Retail Mart'), findsNothing);
    await tester.tap(find.text('Gujarat Weaves'));
    await tester.pumpAndSettle();
    expect(find.text('New sale'), findsOneWidget);
    expect(find.text('24AAACG1234F1Z5'), findsOneWidget);
    expect(find.text('Used before'), findsOneWidget);
    expect(find.widgetWithText(ActionChip, '5%'), findsOneWidget);
  });

  testWidgets(
    'payment received proposes a receipt dated today against the unpaid invoice',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openHome(tester, api);
      await tapRow(tester, 'Sales');
      await tester.tap(find.text('Gujarat Weaves'));
      await tester.pumpAndSettle();
      expect(find.text('Unpaid'), findsOneWidget);

      await tester.tap(find.widgetWithText(ActionChip, 'Payment received'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Amount received'),
        '1000',
      );
      await tester.tap(find.text('Cash'));
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(api.proposals.single.tool, 'record_receipt');
      expect(api.proposals.single.args, {
        'invoiceId': 'INV-0002',
        'amount': 1000,
        'mode': 'cash',
        'date': '2026-10-05',
      });

      await tester.tap(find.text('Discard'));
      await tester.pumpAndSettle();
      expect(api.discards, 1);
      expect(api.sent, isEmpty);
      expect(find.text('Post it'), findsNothing);
    },
  );

  testWidgets(
    'a paid-up customer is not offered Payment received, and a blocked sale says why',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openHome(tester, api);
      await tapRow(tester, 'Sales');
      await tester.tap(find.text('Retail Mart'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(ActionChip, 'Payment received'), findsNothing);
      expect(find.text('Received by bank against INV-0001'), findsOneWidget);
      expect(find.text('Paid'), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();

      await tester.tap(find.text('New customer'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Name'),
        'Blocked Party',
      );
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Amount before GST'),
        '100',
      );
      await tester.enterText(find.widgetWithText(TextField, 'GST'), '17');
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(find.textContaining('GST rate is not valid'), findsOneWidget);
      expect(find.text('Post it'), findsNothing);
    },
  );

  testWidgets('the business menu brings in more books and signs out', (
    tester,
  ) async {
    final api = FakeMycaApi(signedIn: true);
    final state = testState(
      api,
      pick: (_) async =>
          const PickedText(name: 'bank.csv', content: 'Date,Narration\n'),
    );
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    expect(find.text('GSTIN 27AABCU9603R1ZN'), findsOneWidget);
    expect(find.text('Signed in as Firm Admin'), findsOneWidget);
    await tester.tap(find.text('Bring in more books'));
    await tester.pumpAndSettle();

    expect(find.text('Where is it coming from?'), findsOneWidget);
    expect(find.text('Starting fresh'), findsNothing);
    await tester.tap(find.text('Zoho Books'));
    await tester.pumpAndSettle();
    expect(find.text('Business name'), findsNothing);
    await tester.tap(find.text('Bank statement (CSV)'));
    await tester.pumpAndSettle();
    expect(api.proposals.single.tool, 'import_bank');
    expect(api.uploads, {'sha-of-bank.csv': 'Date,Narration\n'});
    expect(api.proposals.single.args, {
      'documentSha256': 'sha-of-bank.csv',
      'type': 'csv',
    });
    await tester.tap(find.text('Bring it in'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(find.text('Your books check'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('YOUR BOOKS'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('YOUR BOOKS'), findsOneWidget);

    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();
    expect(api.signedIn, isFalse);
    expect(find.text('Welcome back'), findsOneWidget);
  });

  testWidgets('a question typed on Home is answered in Ask, without offering to post', (
    tester,
  ) async {
    final api = FakeMycaApi(signedIn: true);
    await openHome(tester, api);
    await tester.pumpAndSettle();
    final bar = find.widgetWithText(TextField, 'Tell or ask MyCA anything');
    expect(bar, findsOneWidget, reason: 'chat is the first thing on Home');
    await tester.enterText(bar, 'who owes me?');
    await tester.tap(find.byTooltip('Send'));
    await tester.pumpAndSettle();
    expect(api.sent.single, 'who owes me?');
    expect(find.textContaining('Customers owe you ₹3,77,600.00'), findsOneWidget);
    expect(find.text('Post it'), findsNothing);
  });

  testWidgets('Ask offers owner questions to start with, not accounting terms', (
    tester,
  ) async {
    final api = FakeMycaApi(signedIn: true);
    await openHome(tester, api);
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Send'));
    await tester.pumpAndSettle();
    expect(api.sent, isEmpty, reason: 'an empty bar sends nothing');
  });
}
