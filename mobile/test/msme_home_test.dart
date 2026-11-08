import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

class _NoDues extends FakeMycaApi {
  _NoDues({this.throws = false}) : super(signedIn: true);

  final bool throws;

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) {
    if (name != 'supplier_dues') return super.query(name, args);
    if (throws) throw const MycaApiException('MyCA is out of reach.');
    return Future.value({'ok': false, 'error': 'UNKNOWN_TOOL'});
  }
}

Future<void> openHome(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
}

final card = find.byKey(const ValueKey('home.msme'));

void main() {
  test('supplier dues read the MSME position and every bill, and an empty answer is an empty position', () {
    final dues = SupplierDues.fromTool({'ok': true, 'data': FakeMycaApi().supplierDues});
    expect(dues.msme.count, 2);
    expect(dues.msme.overdue, 1);
    expect(dues.msme.overdueOutstanding, 42000);
    expect(dues.msme.outstanding, 53800);
    expect(dues.bills.map((bill) => bill.billId), ['BILL-0001', 'BILL-0002']);
    expect(dues.bills.first.overdue, isTrue);
    expect(dues.bills.first.daysLeft, -45);
    expect(dues.bills.last.payBy, '2026-10-16');
    final empty = SupplierDues.fromTool({'ok': false, 'error': 'UNKNOWN_TOOL'});
    expect(empty.msme.count, 0);
    expect(empty.bills, isEmpty);
    expect(SupplierDues.fromTool(null).msme.overdue, 0);
  });

  testWidgets('home counts the MSME bills past their limit, says what that costs, and opens who to pay', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openHome(tester, api);
    expect(api.queries, contains('supplier_dues'));
    await tester.scrollUntilVisible(card, 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('MSME SUPPLIERS'), findsOneWidget);
    expect(find.text('1 bill past the MSMED limit'), findsOneWidget);
    expect(find.text('₹42,000.00 not deductible until paid · 2 MSME bills open'), findsOneWidget);
    await tester.tap(card);
    await tester.pumpAndSettle();
    expect(find.text('Who to pay'), findsOneWidget);
    expect(api.queries, contains('payment_run'));
  });

  testWidgets('several bills past the limit are counted together', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    api.supplierDues['msme'] = {'count': 3, 'outstanding': 70000, 'overdue': 2, 'overdueOutstanding': 58000, 'rule': ''};
    await openHome(tester, api);
    await tester.scrollUntilVisible(card, 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('2 bills past the MSMED limit'), findsOneWidget);
    expect(find.text('₹58,000.00 not deductible until paid · 3 MSME bills open'), findsOneWidget);
  });

  testWidgets('with nothing past the limit the card names the next bill to pay', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    api.supplierDues['bills'] = [
      {'billId': 'BILL-0002', 'supplier': 'Micro Dyes', 'gstin': '24AAACM1234D1Z2', 'date': '2026-10-01', 'total': 11800, 'outstanding': 11800, 'payBy': '2026-10-16', 'daysLeft': 11, 'overdue': false, 'msme': true},
    ];
    api.supplierDues['msme'] = {'count': 1, 'outstanding': 11800, 'overdue': 0, 'overdueOutstanding': 0, 'rule': ''};
    await openHome(tester, api);
    await tester.scrollUntilVisible(card, 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('1 MSME bill to pay inside the limit'), findsOneWidget);
    expect(find.text('Next: Micro Dyes by 16 October 2026 · ₹11,800.00 open'), findsOneWidget);
    expect(find.textContaining('past the MSMED limit'), findsNothing);
  });

  testWidgets('several bills inside the limit are counted and the earliest is named', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    api.supplierDues['bills'] = [
      {'billId': 'BILL-0002', 'supplier': 'Micro Dyes', 'gstin': '24AAACM1234D1Z2', 'date': '2026-10-01', 'total': 11800, 'outstanding': 11800, 'payBy': '2026-10-16', 'daysLeft': 11, 'overdue': false, 'msme': true},
      {'billId': 'BILL-0003', 'supplier': 'Tiny Threads', 'gstin': '', 'date': '2026-10-03', 'total': 5000, 'outstanding': 5000, 'payBy': '2026-10-18', 'daysLeft': 13, 'overdue': false, 'msme': true},
    ];
    api.supplierDues['msme'] = {'count': 2, 'outstanding': 16800, 'overdue': 0, 'overdueOutstanding': 0, 'rule': ''};
    await openHome(tester, api);
    await tester.scrollUntilVisible(card, 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('2 MSME bills to pay inside the limit'), findsOneWidget);
    expect(find.text('Next: Micro Dyes by 16 October 2026 · ₹16,800.00 open'), findsOneWidget);
  });

  testWidgets('with no MSME supplier on the books the card is not there', (tester) async {
    final api = FakeMycaApi(signedIn: true)..supplierDues.clear();
    await openHome(tester, api);
    expect(api.queries, contains('supplier_dues'));
    expect(card, findsNothing);
    expect(find.text('MSME SUPPLIERS'), findsNothing);
    expect(find.text('Sales'), findsOneWidget);
  });

  testWidgets('a failed or refused dues query leaves home as it was', (tester) async {
    for (final throws in [false, true]) {
      await tester.pumpWidget(MycaApp(key: UniqueKey(), state: testState(_NoDues(throws: throws))));
      await tester.pumpAndSettle();
      expect(card, findsNothing, reason: throws ? 'thrown' : 'refused');
      expect(find.text('MSME SUPPLIERS'), findsNothing);
      expect(find.text('Sales'), findsOneWidget);
    }
  });

  testWidgets('a US business has no MSME card', (tester) async {
    final api = FakeMycaApi(signedIn: true)..country = 'US';
    await openHome(tester, api);
    expect(card, findsNothing);
    expect(find.textContaining('MSMED'), findsNothing);
  });
}
