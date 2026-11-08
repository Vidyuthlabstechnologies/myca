import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/audit_trail_screen.dart';
import 'package:myca/screens/ims_screen.dart';
import 'package:myca/theme.dart';
import 'package:myca/widgets.dart' show RowCard, StatusTag;

import 'accessibility_test.dart' show phone;
import 'audit_trail_test.dart' show openTrail;
import 'batch4_fix_app_test.dart' show Answer, over, refused, says, scriptedSession, typeSecondStep, usedAlready, wrong;
import 'fake_api.dart';
import 'fake_cloud.dart';
import 'ims_test.dart' show inSheet, openIms, openRow;
import 'security_test.dart' show hosted, openSecurity, ownerWithBusiness, phoneCodeSignIn;

const _boxMart = '2026-10|27AAACB2222B1Z5|BM12|B2B';
const _gujarat = '2026-10|24AAACF7856R1ZY|GM77|B2B';
const _retail = '2026-10|27AAACH7409R1Z1|RS1|B2B';

const locked = 'Too many wrong codes. Wait 15 minutes, or sign in again with your authenticator code, then try again.';

FakeMycaApi sharingAKey() {
  final api = FakeMycaApi(signedIn: true)..has2b = true;
  final first = api.imsRows.first;
  api.imsRows.insertAll(1, [
    {
      ...first,
      'invoiceDate': '2026-10-17',
      'taxableValue': 4000,
      'igst': 200,
      'totalValue': 4200,
      'credit': 200,
      'billId': '',
      'match': 'not in books',
      'why': 'No purchase bill with this number from this supplier.',
    },
    {
      ...first,
      'invoiceDate': '2026-10-18',
      'taxableValue': 2000,
      'igst': 100,
      'totalValue': 2100,
      'credit': 100,
    },
  ]);
  return api;
}

Map<String, Object?> auditEvent(int i) {
  final number = i.toString().padLeft(4, '0');
  return {
    'eventId': 'AUD-${i.toString().padLeft(6, '0')}',
    'at': '2026-10-05T10:${(i % 60).toString().padLeft(2, '0')}:00.000Z',
    'actorId': 'USR-OWNER',
    'actorName': 'Asha',
    'action': 'chat.confirm',
    'kind': 'change',
    'summary': 'Posted Create invoice (INV-$number)',
    'ids': ['INV-$number'],
    'transfers': ['$i'],
    'beforeHash': 'a$i',
    'afterHash': 'b$i',
    'chained': true,
  };
}

class _BigTrail extends FakeMycaApi {
  _BigTrail(int count)
      : all = [for (var i = 1; i <= count; i++) auditEvent(i)],
        super(signedIn: true);

  final List<Map<String, Object?>> all;

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    final answer = await super.query(name, args);
    if (name != 'audit_trail') return answer;
    final limit = (args['limit'] as num?)?.toInt() ?? 200;
    final events = all.length > limit ? all.sublist(all.length - limit) : all;
    return {
      'ok': true,
      'data': {
        'from': '2026-10-01',
        'to': '2026-10-31',
        'label': 'October 2026',
        'view': args['view'] ?? 'changes',
        'events': events,
        'count': events.length,
        'total': all.length,
        'more': events.length < all.length,
        'chain': auditChain,
        'ledger': {'ok': true, 'last': 1234},
        'note': '',
      },
    };
  }
}

Finder rowsOn(Type screen) => find.descendant(of: find.byType(screen), matching: find.byType(RowCard, skipOffstage: false), skipOffstage: false);

Finder allRows() => rowsOn(ImsScreen);

int builtRows() => rowsOn(AuditTrailScreen).evaluate().length;

Finder builtRow(String key) => find.byKey(ValueKey('ims.$key'), skipOffstage: false);

Finder builtTag(String key) => find.byKey(ValueKey('ims.status.$key'), skipOffstage: false);

String tagWords(WidgetTester tester, String key) => tester.widget<StatusTag>(builtTag(key)).text;

Future<void> pickChip(WidgetTester tester, String label) async {
  final chip = find.widgetWithText(ChoiceChip, label);
  await tester.scrollUntilVisible(chip, -200, scrollable: find.byType(Scrollable).last);
  await tester.pumpAndSettle();
  await tester.tap(chip);
  await tester.pumpAndSettle();
}

Map<String, Object?> receipt(num amount, String mode, {String section = ''}) => {
  'amount': amount,
  'date': '2026-10-01',
  'mode': mode,
  if (section.isNotEmpty) 'section': section,
};

FakeMycaApi gujaratOwing({required num total, List<Map<String, Object?>> receipts = const []}) {
  final api = FakeMycaApi(signedIn: true);
  api.invoices[1]
    ..['total'] = total
    ..['status'] = receipts.isEmpty ? 'posted' : 'partial'
    ..['receipts'] = receipts;
  return api;
}

Future<void> openGujarat(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(key: UniqueKey(), state: testState(api)));
  await tester.pumpAndSettle();
  await tapRow(tester, 'Sales');
  await tester.tap(find.text('Gujarat Weaves'));
  await tester.pumpAndSettle();
}

Future<void> openPaymentReceived(WidgetTester tester, FakeMycaApi api) async {
  await openGujarat(tester, api);
  await tester.tap(find.widgetWithText(ActionChip, 'Payment received'));
  await tester.pumpAndSettle();
}

String amountIn(WidgetTester tester, String label) => tester.widget<TextField>(find.widgetWithText(TextField, label)).controller!.text;

Future<void> narrowPhone(WidgetTester tester, double textScale) async {
  tester.view.physicalSize = const Size(1080, 2400);
  tester.view.devicePixelRatio = 3;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
}

Future<void> askForCode(WidgetTester tester, String row, String action, String code) async {
  await tester.tap(find.text(row));
  await tester.pumpAndSettle();
  await tester.enterText(find.widgetWithText(TextField, 'Code'), code);
  await tester.pump();
  await tester.tap(find.widgetWithText(FilledButton, action));
  await tester.pumpAndSettle();
}

Future<CloudSession> signedInScripted(Map<String, List<Answer>> answers) async {
  final session = scriptedSession(FakeCloud(), answers);
  await session.requestCode('9876543210');
  await session.verifyCode(FakeCloud.code);
  return session;
}

Answer used(int left) => (400, {'ok': false, 'error': 'CODE_USED', 'attemptsRemaining': left});

bool panelLike(Widget widget) {
  final decoration = widget is DecoratedBox ? widget.decoration : (widget is DecoratedSliver ? widget.decoration : null);
  return decoration is BoxDecoration && decoration.color == Palette.surface && decoration.border != null && decoration.borderRadius == BorderRadius.circular(radiusCard);
}

void main() {
  group('R2-1: IMS rows that share a key', () {
    testWidgets('each row gets its own key; deciding the group and switching the chips leaves no duplicate-key error and no stale row', (tester) async {
      await phone(tester);
      final api = sharingAKey();
      await openIms(tester, testState(api));
      expect(tester.takeException(), isNull);
      expect(allRows(), findsNWidgets(5));
      expect(builtRow(_boxMart), findsOneWidget);
      expect(builtRow('$_boxMart#2'), findsOneWidget);
      expect(builtRow('$_boxMart#3'), findsOneWidget);
      expect(builtTag(_boxMart), findsOneWidget);
      expect(builtTag('$_boxMart#2'), findsOneWidget);
      expect(builtTag('$_boxMart#3'), findsOneWidget);
      expect(find.text('16 October 2026 · ₹300.00 credit · amount differs', skipOffstage: false), findsOneWidget);
      expect(find.text('17 October 2026 · ₹200.00 credit · not in books', skipOffstage: false), findsOneWidget);
      expect(find.text('18 October 2026 · ₹100.00 credit · amount differs', skipOffstage: false), findsOneWidget);

      await openRow(tester, '$_boxMart#2');
      expect(inSheet(find.text('17 October 2026')), findsOneWidget);
      expect(inSheet(find.text('₹4,000.00')), findsOneWidget);
      expect(inSheet(find.text('Not found')), findsOneWidget);
      await tester.tap(inSheet(find.widgetWithText(ChoiceChip, 'Reject')));
      await tester.pumpAndSettle();
      await tester.tap(inSheet(find.text('Save')));
      await tester.pumpAndSettle();
      expect(api.proposals.single.args, {'period': '2026-10', 'keys': [_boxMart], 'decision': 'reject'});
      await tester.ensureVisible(find.text('Post it'));
      await tester.tap(find.text('Post it'));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(tagWords(tester, _boxMart), 'Rejected');
      expect(tagWords(tester, '$_boxMart#2'), 'Rejected');
      expect(tagWords(tester, '$_boxMart#3'), 'Rejected');
      expect(tagWords(tester, _gujarat), 'Suggest accept');

      await pickChip(tester, 'Not decided');
      expect(tester.takeException(), isNull);
      expect(allRows(), findsNWidgets(2));
      expect(builtRow(_boxMart), findsNothing);
      expect(builtRow('$_boxMart#2'), findsNothing);
      expect(builtRow('$_boxMart#3'), findsNothing);
      expect(builtTag('$_boxMart#2'), findsNothing);
      expect(builtRow(_gujarat), findsOneWidget);
      expect(builtRow(_retail), findsOneWidget);

      await pickChip(tester, 'Reject');
      expect(tester.takeException(), isNull);
      expect(allRows(), findsNWidgets(3));
      expect(builtRow(_boxMart), findsOneWidget);
      expect(builtRow('$_boxMart#2'), findsOneWidget);
      expect(builtRow('$_boxMart#3'), findsOneWidget);
      expect(builtRow(_gujarat), findsNothing);
    });

    testWidgets('a row keeps its key whatever the filter, so the second line is still the second line when only it is shown', (tester) async {
      await phone(tester);
      await openIms(tester, testState(sharingAKey()));
      await pickChip(tester, 'Not in books');
      expect(tester.takeException(), isNull);
      expect(allRows(), findsNWidgets(2));
      expect(builtRow('$_boxMart#2'), findsOneWidget);
      expect(builtRow(_boxMart), findsNothing);
      expect(builtRow('$_boxMart#3'), findsNothing);
      expect(builtRow(_retail), findsOneWidget);
      expect(tagWords(tester, '$_boxMart#2'), 'Suggest pending');
    });

    testWidgets('rows with distinct keys keep the plain key', (tester) async {
      await phone(tester);
      await openIms(tester, testState(FakeMycaApi(signedIn: true)..has2b = true));
      expect(builtRow(_boxMart), findsOneWidget);
      expect(builtRow(_gujarat), findsOneWidget);
      expect(builtRow(_retail), findsOneWidget);
      expect(builtRow('$_boxMart#2'), findsNothing);
      expect(builtRow('$_gujarat#2'), findsNothing);
    });

    test('a row made of several 2B lines says how many, one line or no count says nothing', () {
      final row = {'key': 'k', 'supplierName': 'A', 'invoiceNo': 'N', 'invoiceDate': '2026-10-08', 'credit': 1220, 'match': 'amount differs'};
      const plain = '8 October 2026 · ₹1,220.00 credit · amount differs';
      expect(ImsRow.fromJson({...row, 'lines': 2}).subtitle, '$plain · 2 lines');
      expect(ImsRow.fromJson({...row, 'lines': 12}).subtitle, '$plain · 12 lines');
      expect(ImsRow.fromJson({...row, 'lines': 1}).subtitle, plain);
      expect(ImsRow.fromJson({...row, 'lines': 0}).subtitle, plain);
      expect(ImsRow.fromJson({...row, 'lines': 'two'}).subtitle, plain);
      expect(ImsRow.fromJson(row).subtitle, plain);
    });

    testWidgets('the list shows the count of lines the engine sent on a row', (tester) async {
      await phone(tester);
      final api = FakeMycaApi(signedIn: true)..has2b = true;
      api.imsRows[1]['lines'] = 3;
      await openIms(tester, testState(api));
      expect(find.text('8 October 2026 · ₹3,600.00 credit · matched · 3 lines', skipOffstage: false), findsOneWidget);
      expect(find.text('16 October 2026 · ₹300.00 credit · amount differs', skipOffstage: false), findsOneWidget);
      expect(find.text('15 October 2026 · ₹180.00 credit · not in books', skipOffstage: false), findsOneWidget);
    });
  });

  group('R2-2: the audit trail builds its rows lazily', () {
    testWidgets('2,000 events build only the rows near the screen, the oldest is reached by scrolling, and Show more stays', (tester) async {
      await phone(tester);
      final api = _BigTrail(2000);
      await openTrail(tester, api);
      expect(tester.takeException(), isNull);
      expect(find.byKey(const ValueKey('audit.AUD-002000')), findsOneWidget);
      expect(builtRows(), inInclusiveRange(5, 30), reason: 'the first 200 events do not all become rows');

      final more = find.byKey(const ValueKey('audit.more'));
      await tester.scrollUntilVisible(more, 3000, scrollable: find.byType(Scrollable).first, maxScrolls: 100);
      await tester.pumpAndSettle();
      expect(builtRows(), inInclusiveRange(1, 30));
      expect(find.byKey(const ValueKey('audit.AUD-001801')), findsOneWidget);
      expect(find.byKey(const ValueKey('audit.AUD-001800')), findsNothing);

      await tester.tap(more);
      final frames = await tester.pumpAndSettle();
      expect(frames, lessThan(10), reason: 'a list of 2,000 settles in a few frames');
      expect(api.queryArgs.where((q) => q.name == 'audit_trail').last.args['limit'], 2000);
      expect(tester.takeException(), isNull);
      expect(find.byKey(const ValueKey('audit.AUD-002000')), findsOneWidget);
      expect(builtRows(), inInclusiveRange(5, 30), reason: 'all 2,000 events do not become rows at once');

      final oldest = find.byKey(const ValueKey('audit.AUD-000001'));
      await tester.scrollUntilVisible(oldest, 5000, scrollable: find.byType(Scrollable).first, maxScrolls: 100);
      await tester.pumpAndSettle();
      expect(oldest, findsOneWidget);
      expect(builtRows(), inInclusiveRange(1, 30));
      expect(find.text('Posted Create invoice (INV-0001)'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Save as Excel'), 500, scrollable: find.byType(Scrollable).first, maxScrolls: 20);
      await tester.pumpAndSettle();
      expect(find.text('Save as Excel'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('the rows keep the panel look: one border around all of them, a divider between neighbours, the status line above', (tester) async {
      await phone(tester);
      await openTrail(tester, FakeMycaApi(signedIn: true));
      expect(find.text('Log chain verified (2 events)'), findsOneWidget);
      expect(find.byType(Divider), findsOneWidget);
      expect(find.byWidgetPredicate(panelLike), findsOneWidget);
      final first = tester.getRect(find.byKey(const ValueKey('audit.AUD-000002')));
      final second = tester.getRect(find.byKey(const ValueKey('audit.AUD-000001')));
      expect(first.left, second.left);
      expect(first.width, second.width);
      expect(second.top, greaterThanOrEqualTo(first.bottom));
      expect(tester.getRect(find.byKey(const ValueKey('audit.chain'))).bottom, lessThan(first.top));
    });

    testWidgets('a long audit trail at the largest type size scrolls without a layout error', (tester) async {
      await phone(tester, textScale: 2.0);
      await openTrail(tester, _BigTrail(300));
      for (var step = 0; step < 6; step++) {
        await tester.drag(find.byType(Scrollable).first, const Offset(0, -700));
        await tester.pump();
      }
      expect(tester.takeException(), isNull);
      expect(builtRows(), inInclusiveRange(1, 20));
    });
  });

  group('R2-3: Payment received offers what is still open on a sales invoice', () {
    test('the open amount takes every receipt, TDS included, and every payment, down to the paisa', () {
      Invoice sale(Object? receipts, [Object? payments]) => Invoice.fromJson({'id': 'INV-1', 'total': 100000, 'status': 'partial', 'receipts': receipts, 'payments': payments ?? const []});
      expect(sale([{'amount': 2000, 'mode': 'tds'}]).owed, 98000);
      expect(sale([{'amount': 2000, 'mode': 'tds'}, {'amount': 30000, 'mode': 'bank'}, {'amount': 5000, 'mode': 'cash'}]).owed, 63000);
      expect(sale(const []).owed, 100000);
      expect(Invoice.fromJson({'id': 'BILL-1', 'total': 42000, 'payments': [{'amount': 12000, 'mode': 'bank'}]}).owed, 30000);
      expect(Invoice.fromJson({'id': 'INV-2', 'total': 11800.5, 'receipts': [{'amount': 1000.1, 'mode': 'bank'}]}).owed, 10800.4);
      expect(Invoice.fromJson({'id': 'INV-3', 'total': 100000, 'receipts': [{'amount': 33333.33, 'mode': 'bank'}, {'amount': 33333.33, 'mode': 'bank'}, {'amount': 33333.33, 'mode': 'bank'}]}).owed, 0.01);
      expect(Invoice.fromJson({'id': 'INV-4', 'total': 0.3, 'receipts': [{'amount': 0.1, 'mode': 'bank'}, {'amount': 0.1, 'mode': 'bank'}]}).owed, 0.1);
    });

    testWidgets('an invoice of 1,00,000 with TDS of 2,000 opens the composer with 98,000 and the list says 98,000', (tester) async {
      final api = gujaratOwing(total: 100000, receipts: [receipt(2000, 'tds', section: '194C')]);
      await openPaymentReceived(tester, api);
      expect(amountIn(tester, 'Amount received'), '98000');
      expect(find.text('INV-0002 · ₹98,000.00 owed'), findsOneWidget);
      expect(find.text('INV-0002 · ₹1,00,000.00'), findsNothing);
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(api.proposals.single.tool, 'record_receipt');
      expect(api.proposals.single.args['amount'], 98000);
    });

    testWidgets('cash, bank and TDS receipts and a credit note are all taken off', (tester) async {
      final api = gujaratOwing(total: 100000, receipts: [receipt(30000, 'bank'), receipt(2000, 'tds', section: '194J'), receipt(1000, 'cash')]);
      api.creditNotes.add({'id': 'CN-0001', 'date': '2026-10-02', 'invoiceId': 'INV-0002', 'partyName': 'Gujarat Weaves', 'reason': 'Price reduced', 'total': 5000, 'cancels': false});
      api.creditNotes.add({'id': 'CN-0002', 'date': '2026-10-03', 'invoiceId': 'INV-0001', 'partyName': 'Retail Mart', 'reason': 'Returned', 'total': 700, 'cancels': false});
      await openPaymentReceived(tester, api);
      expect(amountIn(tester, 'Amount received'), '62000');
      expect(find.text('INV-0002 · ₹62,000.00 owed'), findsOneWidget);
    });

    testWidgets('an invoice nothing has been taken off keeps its total, and choosing another invoice fills in that one\'s open amount', (tester) async {
      final api = gujaratOwing(total: 100000, receipts: [receipt(2000, 'tds')]);
      api.invoices.add({
        'id': 'INV-0003',
        'date': '2026-09-02',
        'partyName': 'Gujarat Weaves',
        'partyGstin': '24AAACG1234F1Z5',
        'total': 50000,
        'status': 'posted',
        'lines': [
          {'gstRate': 5},
        ],
        'receipts': <Object?>[],
      });
      await openPaymentReceived(tester, api);
      expect(amountIn(tester, 'Amount received'), '98000');
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      expect(find.text('INV-0003 · ₹50,000.00 owed'), findsWidgets);
      await tester.tap(find.text('INV-0003 · ₹50,000.00 owed').last);
      await tester.pumpAndSettle();
      expect(amountIn(tester, 'Amount received'), '50000');
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('INV-0002 · ₹98,000.00 owed').last);
      await tester.pumpAndSettle();
      expect(amountIn(tester, 'Amount received'), '98000');
    });

    testWidgets('after TDS withheld is posted from the app, Payment received opens with the rest, and the fake sent no owed field', (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openGujarat(tester, api);
      await tester.tap(find.widgetWithText(ActionChip, 'TDS withheld'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Post it'));
      await tester.pumpAndSettle();
      expect(api.invoices[1]['status'], 'partial');
      expect(api.invoices[1].containsKey('owed'), isFalse, reason: 'the engine sends no owed field on a sales invoice');
      expect(api.invoices[1].containsKey('payments'), isFalse);

      await tester.tap(find.widgetWithText(ActionChip, 'Payment received'));
      await tester.pumpAndSettle();
      expect(amountIn(tester, 'Amount received'), '370048');
      expect(find.text('INV-0002 · ₹3,70,048.00 owed'), findsOneWidget);
    });

    testWidgets('a bill still opens with its total less its payments', (tester) async {
      final api = FakeMycaApi(signedIn: true);
      api.purchases.first
        ..['status'] = 'partial'
        ..['payments'] = [receipt(12000, 'bank')];
      await tester.pumpWidget(MycaApp(key: UniqueKey(), state: testState(api)));
      await tester.pumpAndSettle();
      await tapRow(tester, 'Purchases');
      await tester.tap(find.text('Fabric Co'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(ActionChip, 'Paid'));
      await tester.pumpAndSettle();
      expect(amountIn(tester, 'Amount paid'), '30000');
      expect(find.text('BILL-0001 · ₹30,000.00 owed'), findsOneWidget);
    });

    final surfaces = <String, Future<void> Function(WidgetTester)>{
      '360 dp phone at 1.0x text size': (tester) => narrowPhone(tester, 1.0),
      '360 dp phone at 1.15x text size': (tester) => narrowPhone(tester, 1.15),
      '360 dp phone at 1.3x text size': (tester) => narrowPhone(tester, 1.3),
      'phone at 2.0x text size': (tester) => phone(tester, textScale: 2.0),
    };
    for (final surface in surfaces.entries) {
      testWidgets('the Against invoice list stays inside its field on a ${surface.key}, closed and open', (tester) async {
        await surface.value(tester);
        final api = gujaratOwing(total: 100000, receipts: [receipt(2000, 'tds', section: '194C')]);
        api.invoices.add({
          'id': 'INV-0003',
          'date': '2026-09-02',
          'partyName': 'Gujarat Weaves',
          'partyGstin': '24AAACG1234F1Z5',
          'total': 1234567.89,
          'status': 'posted',
          'lines': [
            {'gstRate': 5},
          ],
          'receipts': <Object?>[],
        });
        await openPaymentReceived(tester, api);
        expect(tester.takeException(), isNull);
        final list = find.byType(DropdownButtonFormField<String>);
        final label = find.descendant(of: list, matching: find.text('INV-0002 · ₹98,000.00 owed'));
        final arrow = find.descendant(of: list, matching: find.byIcon(Icons.arrow_drop_down));
        expect(label, findsOneWidget);
        expect(tester.getRect(label).right, lessThanOrEqualTo(tester.getRect(arrow).left));
        expect(tester.getRect(arrow).right, lessThanOrEqualTo(tester.getRect(list).right));
        expect(amountIn(tester, 'Amount received'), '98000');

        await tester.tap(list);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.tap(find.text('INV-0003 · ₹12,34,567.89 owed').last);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(amountIn(tester, 'Amount received'), '1234567.89');
        expect(find.descendant(of: list, matching: find.text('INV-0003 · ₹12,34,567.89 owed')), findsOneWidget);
      });

      testWidgets('the Payment received form meets the tap target, label and contrast guidelines on a ${surface.key}', (tester) async {
        await surface.value(tester);
        await openPaymentReceived(tester, gujaratOwing(total: 100000, receipts: [receipt(2000, 'tds', section: '194C')]));
        final handle = tester.ensureSemantics();
        await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
        await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
        await expectLater(tester, meetsGuideline(textContrastGuideline));
        handle.dispose();
        expect(tester.takeException(), isNull);
      });
    }

    test('the open amount is never below nothing', () {
      final overpaid = Invoice.fromJson({'id': 'INV-1', 'total': 1000, 'status': 'partial', 'receipts': [{'amount': 1200, 'mode': 'bank'}]});
      final credited = Invoice.fromJson({'id': 'INV-2', 'total': 100000, 'status': 'partial', 'receipts': [{'amount': 78000, 'mode': 'bank'}]});
      final note = CreditNote.fromJson({'id': 'CN-1', 'invoiceId': 'INV-2', 'total': 44000});
      expect(overpaid.owed, 0);
      expect(overpaid.owedAfter(const []), 0);
      expect(credited.owed, 22000);
      expect(credited.owedAfter([note]), 0);
      expect(credited.owedAfter(const []), 22000);
      expect(Invoice.fromJson({'id': 'BILL-1', 'total': 500, 'payments': [{'amount': 700, 'mode': 'bank'}]}).owed, 0);
    });

    testWidgets('receipts and credit notes that take more than the invoice show nothing owed, never a negative amount', (tester) async {
      final api = gujaratOwing(total: 100000, receipts: [receipt(78000, 'bank')]);
      api.creditNotes.add({'id': 'CN-0001', 'date': '2026-10-02', 'invoiceId': 'INV-0002', 'partyName': 'Gujarat Weaves', 'reason': 'Price reduced', 'total': 44000, 'cancels': false});
      await openPaymentReceived(tester, api);
      expect(amountIn(tester, 'Amount received'), '0');
      expect(find.text('INV-0002 · ₹0.00 owed'), findsOneWidget);
      expect(find.textContaining('-₹'), findsNothing);
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(find.text('Enter the amount received.'), findsOneWidget);
      expect(api.proposals, isEmpty);
    });

    testWidgets('the TDS withheld sheet keeps listing the invoice total, because its 2% suggestion is on the invoice', (tester) async {
      final api = gujaratOwing(total: 100000, receipts: [receipt(30000, 'bank')]);
      await openGujarat(tester, api);
      await tester.tap(find.widgetWithText(ActionChip, 'TDS withheld'));
      await tester.pumpAndSettle();
      expect(find.text('INV-0002 · ₹1,00,000.00'), findsOneWidget);
      expect(find.text('INV-0002 · ₹70,000.00 owed'), findsNothing);
      expect(amountIn(tester, 'TDS withheld'), '2000');
      final label = tester.widget<Text>(find.text('INV-0002 · ₹1,00,000.00'));
      expect(label.maxLines, 1);
      expect(label.overflow, TextOverflow.ellipsis);
    });
  });

  group('cloud skeptic 1: turning two-step off and making new recovery codes', () {
    test('the wrong codes count down on both routes, and the fifth and the wait that follows say to wait', () async {
      final session = await signedInScripted({
        '/v1/me/second-step/disable': [wrong(4), wrong(3), wrong(2), wrong(1), wrong(0), refused(429, 'TOO_MANY_ATTEMPTS')],
        '/v1/me/second-step/recovery-codes': [wrong(4), wrong(1), wrong(0), refused(429, 'TOO_MANY_ATTEMPTS')],
      });
      await expectLater(session.disableSecondStep('000000'), says('That code is not right. 4 tries left.'));
      await expectLater(session.disableSecondStep('000000'), says('That code is not right. 3 tries left.'));
      await expectLater(session.disableSecondStep('000000'), says('That code is not right. 2 tries left.'));
      await expectLater(session.disableSecondStep('000000'), says('That code is not right. 1 try left.'));
      await expectLater(session.disableSecondStep('000000'), says(locked));
      await expectLater(session.disableSecondStep('000000'), says(locked));
      await expectLater(session.newRecoveryCodes('000000'), says('That code is not right. 4 tries left.'));
      await expectLater(session.newRecoveryCodes('000000'), says('That code is not right. 1 try left.'));
      await expectLater(session.newRecoveryCodes('000000'), says(locked));
      await expectLater(session.newRecoveryCodes('000000'), says(locked));
    });

    test('a replayed code on those routes says it was used, and says to wait when no tries are left', () async {
      final session = await signedInScripted({
        '/v1/me/second-step/disable': [used(3), used(0), (400, {'ok': false, 'error': 'INVALID_CODE'}), (400, {'ok': false, 'error': 'NOT_ENABLED'})],
      });
      await expectLater(session.disableSecondStep('246810'), says(usedAlready));
      await expectLater(session.disableSecondStep('246810'), says(locked));
      await expectLater(session.disableSecondStep('000000'), says('That code is not right. Check it and try again.'));
      await expectLater(session.disableSecondStep('000000'), says('Two-step sign-in is off.'));
    });

    test('the sentences of the other routes are not changed', () async {
      final session = await signedInScripted({
        '/v1/me/second-step/confirm': [wrong(3), refused(400, 'ENROLMENT_RESTART')],
      });
      await expectLater(session.confirmSecondStep('000000'), says('That code is not right. Check it and try again.'));
      await expectLater(session.confirmSecondStep('000000'), says('Too many wrong codes. Start the setup again.'));
      expect(secondStepMessage('TOO_MANY_ATTEMPTS', null), over);
      expect(cloudMessage('TOO_MANY_ATTEMPTS'), 'Too many wrong tries. Ask for a new code.');
    });

    testWidgets('Turn off counts the wrong codes down on the Security screen and, once none are left, says to wait; the wait ending lets the right code in', (tester) async {
      final (cloud, tokens) = await ownerWithBusiness();
      cloud
        ..twoStepEnabled = true
        ..recoveryLeft = 3;
      await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens)));
      await tester.pumpAndSettle();
      await openSecurity(tester);
      for (final words in ['4 tries left.', '3 tries left.', '2 tries left.', '1 try left.']) {
        await askForCode(tester, 'Turn off', 'Turn off', '999999');
        expect(find.text('That code is not right. $words'), findsOneWidget);
        expect(find.text(locked), findsNothing);
      }
      await askForCode(tester, 'Turn off', 'Turn off', '999999');
      expect(find.text(locked), findsOneWidget);
      expect(find.textContaining('tries left'), findsNothing);
      expect(find.textContaining('try left'), findsNothing);

      await askForCode(tester, 'Turn off', 'Turn off', cloud.totpCode);
      expect(find.text(locked), findsOneWidget);
      expect(cloud.twoStepEnabled, isTrue);
      expect(find.text('Two-step sign-in is off.'), findsNothing);

      cloud.changeTries = 0;
      await askForCode(tester, 'Turn off', 'Turn off', cloud.totpCode);
      expect(cloud.twoStepEnabled, isFalse);
      expect(find.text('Two-step sign-in is off.'), findsOneWidget);
      expect(find.text(locked), findsNothing);
    });

    testWidgets('Make new counts down and says to wait in the same words, and a right code starts the count again', (tester) async {
      final (cloud, tokens) = await ownerWithBusiness();
      cloud
        ..twoStepEnabled = true
        ..recoveryLeft = 3;
      await tester.pumpWidget(MycaApp(state: hosted(cloud, tokens)));
      await tester.pumpAndSettle();
      await openSecurity(tester);
      await askForCode(tester, 'Make new', 'Make new', '999999');
      expect(find.text('That code is not right. 4 tries left.'), findsOneWidget);
      await askForCode(tester, 'Make new', 'Make new', '999999');
      expect(find.text('That code is not right. 3 tries left.'), findsOneWidget);
      await askForCode(tester, 'Make new', 'Make new', cloud.totpCode);
      expect(find.text('Save these recovery codes'), findsOneWidget);
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      expect(cloud.changeTries, 0);
      for (var wrongCodes = 0; wrongCodes < 4; wrongCodes++) {
        await askForCode(tester, 'Make new', 'Make new', '999999');
      }
      expect(find.text('That code is not right. 1 try left.'), findsOneWidget);
      await askForCode(tester, 'Make new', 'Make new', '999999');
      expect(find.text(locked), findsOneWidget);
      await askForCode(tester, 'Make new', 'Make new', cloud.totpCode);
      expect(find.text(locked), findsOneWidget);
      expect(find.text('Save these recovery codes'), findsNothing);
    });
  });

  group('cloud skeptic 2: a replayed code on the last try at sign-in', () {
    test('a used code that comes with no tries left says the attempt is over, otherwise it keeps its own sentence', () {
      expect(secondStepMessage('CODE_USED', 0), over);
      expect(secondStepMessage('CODE_USED', -1), over);
      expect(secondStepMessage('CODE_USED', 2), usedAlready);
      expect(secondStepMessage('CODE_USED', null), usedAlready);
      expect(secondStepMessage('INVALID_CODE', 0), over);
      expect(secondStepMessage('INVALID_CODE', 1), 'That code is not right. 1 try left.');
      expect(secondStepMessage('CODE_EXPIRED', 0), over);
      expect(secondStepMessage('TOO_MANY_ATTEMPTS', null), over);
    });

    test('the fifth try with a replayed code ends the attempt and so does the right code after it', () async {
      final cloud = FakeCloud()..secondStepOn = true;
      final session = scriptedSession(cloud, {
        '/v1/auth/second-step': [wrong(4), wrong(3), wrong(2), wrong(1), used(0), refused(429, 'TOO_MANY_ATTEMPTS')],
      });
      await session.requestCode('9876543210');
      await session.verifyCode(FakeCloud.code);
      expect(session.secondStepPending, isTrue);
      await expectLater(session.completeSecondStep('000000'), says('That code is not right. 4 tries left.'));
      await expectLater(session.completeSecondStep('000000'), says('That code is not right. 3 tries left.'));
      await expectLater(session.completeSecondStep('000000'), says('That code is not right. 2 tries left.'));
      await expectLater(session.completeSecondStep('000000'), says('That code is not right. 1 try left.'));
      await expectLater(session.completeSecondStep(cloud.totpCode), says(over));
      await expectLater(session.completeSecondStep(cloud.totpCode), says(over));
    });

    testWidgets('the sign-in screen says the attempt is over when the replayed code was the last try', (tester) async {
      final (cloud, _) = await ownerWithBusiness();
      cloud
        ..secondStepOn = true
        ..secondStepError = 'CODE_USED'
        ..secondStepLeft = 2;
      await tester.pumpWidget(MycaApp(state: hosted(cloud, MemoryTokenStore())));
      await tester.pumpAndSettle();
      await phoneCodeSignIn(tester);
      expect(find.text('Enter your authenticator code'), findsOneWidget);
      await typeSecondStep(tester, cloud.totpCode);
      expect(find.text(usedAlready), findsOneWidget);
      expect(find.text(over), findsNothing);
      cloud.secondStepLeft = 0;
      await typeSecondStep(tester, cloud.totpCode);
      expect(find.text(over), findsOneWidget);
      expect(find.text(usedAlready), findsNothing);
      expect(find.text('Enter your authenticator code'), findsOneWidget);
    });
  });
}
