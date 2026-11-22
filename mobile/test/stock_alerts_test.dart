import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca_design/myca_design.dart';
import 'package:myca/app_state.dart';
import 'package:myca/screens/counter_sale_screen.dart';
import 'package:myca/screens/stock_alerts_screen.dart';

import 'fake_api.dart';

class StockApi extends FakeMycaApi {
  final known = <String, Map<String, Object?>>{
    'ORS': {'found': true, 'sku': 'ORS', 'name': 'ORS sachet', 'price': 20, 'gstRate': 12, 'hsn': '3004', 'unit': 'PAC', 'lowStock': true, 'onHand': 3, 'tracked': true},
  };
  Map<String, Object?> alerts = {
    'asOf': '2026-11-21',
    'days': 30,
    'expired': [
      {'sku': 'SYRUP', 'name': 'Cough syrup', 'unit': 'BTL', 'batch': 'OLD1', 'expiry': '2026-11-19', 'qty': 7, 'daysLeft': -2},
    ],
    'expiring': [
      {'sku': 'SYRUP', 'name': 'Cough syrup', 'unit': 'BTL', 'batch': 'MID2', 'expiry': '2026-12-11', 'qty': 12, 'daysLeft': 20},
    ],
    'lowStock': [
      {'sku': 'ORS', 'name': 'ORS sachet', 'unit': 'PAC', 'onHand': 3, 'reorderLevel': 10, 'onOrder': 0},
    ],
  };

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    if (name == 'find_item') return {'ok': true, 'data': known['${args['code']}'] ?? {'found': false, 'code': args['code']}};
    if (name == 'stock_alerts') return {'ok': true, 'data': alerts};
    return super.query(name, args);
  }

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async {
    proposals.add(Proposal(name, args));
    return ChatReply.fromJson({'reply': 'Check $name', 'posted': false, 'awaitingConfirmation': true, 'preview': {'token': 'tok-$name', 'summary': name, 'effects': <String>[], 'figures': {}}});
  }

  @override
  Future<ChatReply> confirm(String token) async {
    confirmed.add(token);
    return ChatReply.fromJson({'reply': 'Saved.', 'posted': true, 'confirmed': true});
  }
}

Future<void> _open(WidgetTester tester, StockApi api, Widget screen) async {
  await tester.pumpWidget(AppScope(state: testState(api), child: MaterialApp(home: screen)));
  await tester.pumpAndSettle();
}

void main() {
  test('a counter line sends its SKU and unit so the engine moves stock and GSTR-1 carries the UQC', () {
    final args = counterSaleArgs([CartLine(sku: 'SUGAR', name: 'Sugar', price: 45, gstRate: 5, hsn: '1701', unit: 'KGS', qty: 2)]);
    expect(args['lines'], [
      {'description': 'Sugar', 'sku': 'SUGAR', 'hsn': '1701', 'qty': 2, 'unit': 'KGS', 'rate': 45, 'gstRate': 5},
    ]);
  });

  test('a new item with stock in sends the unit, the low-stock level and a batch with its expiry', () {
    final item = NewItem(line: CartLine(sku: 'PCM500', name: 'Paracetamol', price: 15, gstRate: 12, unit: 'TBS'), reorderLevel: 20, stockQty: 100, batch: 'B2401', expiry: '03/2027', unitCost: 11.5);
    expect(newItemArgs(item, 'PCM500'), {'sku': 'PCM500', 'name': 'Paracetamol', 'price': 15, 'gstRate': 12, 'unit': 'TBS', 'reorderLevel': 20});
    expect(stockInArgs(item), {'sku': 'PCM500', 'qty': 100, 'unitCost': 11.5, 'batch': 'B2401', 'expiry': '03/2027'});
    expect(stockInArgs(NewItem(line: item.line)), isNull);
  });

  testWidgets('the item form takes a unit, a low-stock level and opening stock with batch and expiry', (tester) async {
    final api = StockApi();
    await _open(tester, api, CounterSaleScreen(scan: (_) async => '8906000000099'));
    await tester.tap(find.byKey(const Key('counter-scan')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('item-name')), 'Paracetamol 500');
    await tester.enterText(find.byKey(const Key('item-price')), '15');
    await tester.enterText(find.byKey(const Key('item-gst')), '12');
    await tester.ensureVisible(find.byKey(const Key('item-unit')));
    await tester.tap(find.byKey(const Key('item-unit')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('TBS').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('item-reorder')), '20');
    await tester.enterText(find.byKey(const Key('item-stock')), '100');
    await tester.enterText(find.byKey(const Key('item-batch')), 'b2401');
    await tester.enterText(find.byKey(const Key('item-expiry')), '2027/03');
    await tester.ensureVisible(find.byKey(const Key('item-save')));
    await tester.tap(find.byKey(const Key('item-save')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('item-error')), findsOneWidget);
    expect(find.text('Write the expiry as on the pack, for example 03/2027.'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('item-expiry')), '03/2027');
    await tester.ensureVisible(find.byKey(const Key('item-save')));
    await tester.tap(find.byKey(const Key('item-save')));
    await tester.pumpAndSettle();
    final saved = api.proposals.firstWhere((proposal) => proposal.tool == 'set_sku_cost').args;
    expect(saved['unit'], 'TBS');
    expect(saved['reorderLevel'], 20);
    final stocked = api.proposals.firstWhere((proposal) => proposal.tool == 'record_stock').args;
    expect(stocked, {'sku': '8906000000099', 'qty': 100, 'batch': 'B2401', 'expiry': '03/2027'});
    expect(api.confirmed, containsAll(['tok-set_sku_cost', 'tok-record_stock']));
    expect(find.text('Paracetamol 500'), findsOneWidget);
    expect(find.textContaining('/ TBS'), findsOneWidget);
  });

  testWidgets('a scanned item at its low-stock level says so on the bill line', (tester) async {
    final api = StockApi();
    await _open(tester, api, CounterSaleScreen(scan: (_) async => 'ORS'));
    await tester.tap(find.byKey(const Key('counter-scan')));
    await tester.pumpAndSettle();
    expect(find.textContaining('₹20.00 / PAC + GST 12%'), findsOneWidget);
    expect(find.textContaining('Low stock: 3'), findsOneWidget);
  });

  testWidgets('the expiring soon and low stock list shows expired, expiring and low items, and opens from the counter', (tester) async {
    final api = StockApi();
    await _open(tester, api, CounterSaleScreen(scan: (_) async => null));
    await tester.tap(find.byKey(const Key('counter-alerts')));
    await tester.pumpAndSettle();
    expect(find.text('Expiring soon and low stock'), findsOneWidget);
    expect(find.text('Expired, still on hand'), findsOneWidget);
    expect(find.textContaining('Batch OLD1 · 7 BTL · Expired on 2026-11-19'), findsOneWidget);
    expect(find.text('Expiring in 30 days'), findsOneWidget);
    expect(find.textContaining('Batch MID2 · 12 BTL · Expires on 2026-12-11'), findsOneWidget);
    expect(find.text('20 days'), findsOneWidget);
    expect(find.text('ORS sachet (ORS)'), findsOneWidget);
    expect(find.textContaining('3 PAC left · alert at 10'), findsOneWidget);
  });

  testWidgets('with nothing to flag the list says so', (tester) async {
    final api = StockApi()..alerts = {'expired': [], 'expiring': [], 'lowStock': []};
    await _open(tester, api, const StockAlertsScreen());
    expect(find.byKey(const Key('alerts-empty')), findsOneWidget);
  });

  testWidgets('on a Hindi phone the list is in Hindi', (tester) async {
    tester.platformDispatcher.localesTestValue = const [Locale('hi', 'IN')];
    addTearDown(tester.platformDispatcher.clearLocalesTestValue);
    final api = StockApi();
    await tester.pumpWidget(AppScope(
      state: testState(api),
      child: MaterialApp(
        locale: const Locale('hi', 'IN'),
        supportedLocales: const [Locale('en', 'US'), Locale('hi', 'IN')],
        localizationsDelegates: MycaDesign.localizationsDelegates,
        home: const StockAlertsScreen(),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('जल्द एक्सपायर होने वाला और कम स्टॉक'), findsOneWidget);
    expect(find.text('कम स्टॉक'), findsOneWidget);
    expect(find.text('एक्सपायर हो चुका, अभी भी स्टॉक में'), findsOneWidget);
  });
}
