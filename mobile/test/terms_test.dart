import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

Future<void> openCustomer(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
  await tapRow(tester, 'Sales');
  await tester.tap(find.text('Gujarat Weaves'));
  await tester.pumpAndSettle();
}

void main() {
  test('terms and due dates read plainly', () {
    expect(termsLabel(null), '');
    expect(termsLabel(0), 'Due on receipt');
    expect(termsLabel(45), 'Net 45');
    final today = DateTime(2026, 10, 5, 22, 30);
    expect(dueWords('2026-09-11', today, open: true), 'Overdue by 24 days');
    expect(dueWords('2026-10-04', today, open: true), 'Overdue by 1 day');
    expect(dueWords('2026-10-05', today, open: true), 'Due today');
    expect(dueWords('2026-10-20', today, open: true), 'Due 20 October 2026');
    expect(
      dueWords('2026-09-11', today, open: false),
      '',
      reason: 'a paid invoice is never overdue',
    );
    expect(dueWords('', today, open: true), '');
  });

  test(
    'the snapshot finds a customer\'s terms by GSTIN first, then by name',
    () {
      final snapshot = Snapshot.fromJson({
        'customerTerms': {'gstin:24AAACG1234F1Z5': 30, 'name:kiran stores': 0},
      });
      expect(snapshot.termsFor('Anything', '24aaacg1234f1z5'), 30);
      expect(snapshot.termsFor('Kiran  Stores', ''), 0);
      expect(snapshot.termsFor('Nobody', ''), isNull);
    },
  );

  testWidgets(
    'the customer chat shows how late an invoice is and the customer\'s terms',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openCustomer(tester, api);
      expect(find.text('Overdue by 24 days'), findsOneWidget);
      expect(find.widgetWithText(ActionChip, 'Terms: Net 30'), findsOneWidget);
    },
  );

  testWidgets('changing terms is previewed and posted, and the chip follows', (
    tester,
  ) async {
    final api = FakeMycaApi(signedIn: true);
    await openCustomer(tester, api);
    await tester.tap(find.widgetWithText(ActionChip, 'Terms: Net 30'));
    await tester.pumpAndSettle();
    expect(
      find.text('How long does Gujarat Weaves have to pay?'),
      findsOneWidget,
    );
    await tester.tap(find.text('Net 45'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'set_payment_terms');
    expect(api.proposals.last.args, {
      'partyName': 'Gujarat Weaves',
      'partyGstin': '24AAACG1234F1Z5',
      'days': 45,
    });
    expect(find.text('Gujarat Weaves: Net 45.'), findsOneWidget);
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ActionChip, 'Terms: Net 45'), findsOneWidget);
  });

  testWidgets(
    'the invoice screen shows when payment is due and that it is overdue',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openCustomer(tester, api);
      await tester.tap(find.text('Invoice INV-0002'));
      await tester.pumpAndSettle();
      expect(find.text('PAYMENT DUE'), findsOneWidget);
      expect(find.text('11 September 2026 (Net 30)'), findsOneWidget);
      expect(find.text('Overdue by 24 days'), findsOneWidget);
    },
  );
}
