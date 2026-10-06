import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';
import 'package:myca/registers.dart';

import 'fake_api.dart';

AppState stateWith(FakeMycaApi api) => AppState(
  api: api,
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => const PickedText(
    name: 'GSTR2B_102026.csv',
    content: 'SECTION,SUPPLIER GSTIN\nB2B,24AAACF7856R1ZY',
  ),
  now: () => DateTime(2026, 10, 5, 22, 30),
);

Future<void> openTaxes(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: stateWith(api)));
  await tester.pumpAndSettle();
  await tester.tap(find.text('3 things need you'));
  await tester.pumpAndSettle();
}

Future<void> scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(
    finder,
    200,
    scrollable: find.byType(Scrollable).last,
  );
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
}

void main() {
  test('a supplier bill number is sent only when given', () {
    final withNumber = documentArgs(
      partyName: 'Fabric Co',
      partyGstin: '',
      description: 'Cloth',
      amount: 100,
      gstRate: 5,
      supplierInvoiceNo: ' F-101 ',
    );
    expect(withNumber['supplierInvoiceNo'], 'F-101');
    final without = documentArgs(
      partyName: 'Fabric Co',
      partyGstin: '',
      description: 'Cloth',
      amount: 100,
      gstRate: 5,
    );
    expect(without.containsKey('supplierInvoiceNo'), isFalse);
  });

  test(
    'the credit check is read from the tool result, and a refusal reads as nothing',
    () async {
      final api = FakeMycaApi(signedIn: true)..has2b = true;
      final check = CreditCheck.fromTool(
        await api.query('credit_at_risk', {'period': '2026-10'}),
      )!;
      expect(check.hasStatement, isTrue);
      expect(check.creditAtRisk, 3900);
      expect(check.bySupplier.first.supplier, 'Gujarat Mills');
      expect(check.risks.last.reason, 'NO_SUPPLIER_NUMBER');
      expect(check.notBooked, 1);
      expect(CreditCheck.fromTool({'ok': false, 'error': 'X'}), isNull);
    },
  );

  testWidgets(
    'without a 2B the card says what to do; adding one is previewed, confirmed, and the risks appear',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openTaxes(tester, api);
      await scrollTo(tester, find.text('Add GSTR-2B for October 2026'));
      expect(
        find.text('INPUT CREDIT AGAINST GSTR-2B, OCTOBER 2026'),
        findsOneWidget,
      );
      expect(find.text('₹4,400.00'), findsOneWidget);
      expect(
        find.textContaining('Add the GSTR-2B for this month'),
        findsOneWidget,
      );

      await tester.tap(find.text('Add GSTR-2B for October 2026'));
      await tester.pumpAndSettle();
      expect(api.uploads.values.single, startsWith('SECTION,SUPPLIER GSTIN'));
      expect(api.proposals.single.tool, 'import_gstr2b');
      expect(api.proposals.single.args, {
        'documentSha256': 'sha-of-GSTR2B_102026.csv',
        'period': '2026-10',
        'fileName': 'GSTR2B_102026.csv',
      });
      expect(find.text('Add this GSTR-2B?'), findsOneWidget);
      expect(
        find.text(
          'GSTR-2B for 2026-10: 4 entries from 4 suppliers.\n\nThe books change only after you confirm.',
        ),
        findsOneWidget,
      );
      await tester.tap(find.text('Add'));
      await tester.pumpAndSettle();
      expect(api.confirmed, isNotEmpty);

      await scrollTo(tester, find.text('Replace GSTR-2B'));
      expect(
        find.text('Added. Your bills are checked against it below.'),
        findsOneWidget,
      );
      expect(
        find.text('Using GSTR2B_102026.csv, added 5 October 2026.'),
        findsOneWidget,
      );
      expect(find.text('Gujarat Mills'), findsOneWidget);
      expect(
        find.descendant(
          of: find
              .ancestor(
                of: find.text('Gujarat Mills'),
                matching: find.byType(Row),
              )
              .first,
          matching: find.text('₹3,600.00'),
        ),
        findsOneWidget,
      );
      expect(find.text('1 bill in 2B is not in your books.'), findsOneWidget);

      await tester.tap(find.text('Gujarat Mills'));
      await tester.pumpAndSettle();
      expect(find.text('Bill GM/77'), findsOneWidget);
      expect(
        find.text(
          'The supplier reported it, but 2B marks the credit as not available.',
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets('cancelling the 2B preview discards it and adds nothing', (
    tester,
  ) async {
    final api = FakeMycaApi(signedIn: true);
    await openTaxes(tester, api);
    await scrollTo(tester, find.text('Add GSTR-2B for October 2026'));
    await tester.tap(find.text('Add GSTR-2B for October 2026'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(api.discards, 1);
    expect(api.confirmed, isEmpty);
    expect(api.has2b, isFalse);
    await scrollTo(tester, find.text('Not added.'));
    expect(find.text('Not added.'), findsOneWidget);
  });

  testWidgets('a purchase asks for the supplier bill number and sends it', (
    tester,
  ) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: stateWith(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Purchases');
    await tester.tap(find.text('Fabric Co'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ActionChip, 'Bill'));
    await tester.pumpAndSettle();
    expect(
      find.widgetWithText(TextField, "Supplier's bill number"),
      findsOneWidget,
    );
    await tester.enterText(
      find.widgetWithText(TextField, "Supplier's bill number"),
      'F-101',
    );
    await tester.enterText(
      find.widgetWithText(TextField, 'Amount before GST'),
      '4000',
    );
    await tester.enterText(find.widgetWithText(TextField, 'GST'), '5');
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.single.tool, 'create_purchase');
    expect(api.proposals.single.args['supplierInvoiceNo'], 'F-101');
  });
}
