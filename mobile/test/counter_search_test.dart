import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/app_state.dart';
import 'package:myca/offline/offline_billing.dart';
import 'package:myca/offline/offline_files.dart';
import 'package:myca/offline/offline_first_api.dart';
import 'package:myca/pos/escpos.dart';
import 'package:myca/pos/printer.dart';
import 'package:myca/screens/counter_items.dart';
import 'package:myca/screens/counter_sale_screen.dart';

import 'fake_api.dart';
import 'offline_support.dart';

Map<String, Object?> _item(String sku, String name, num price, {num gst = 5, String unit = 'KGS', String barcode = ''}) => {'sku': sku, 'name': name, 'barcode': barcode, 'hsn': '', 'gstRate': gst, 'price': price, 'unit': unit, 'tracked': true, 'onHand': 20, 'lowStock': false};

class ShopApi extends FakeMycaApi {
  final shelf = [
    _item('SAKHAR', 'साखर', 45),
    _item('SUGAR', 'Sugar loose', 44),
    _item('ATTA', 'Atta 5 kg', 260, unit: 'PAC'),
  ];
  final searches = <String>[];
  final gates = <String, Completer<void>>{};
  final saved = <Map<String, Object?>>[];

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    if (name == 'search_items') {
      final query = '${args['query'] ?? ''}'.toLowerCase();
      searches.add(query);
      final gate = gates[query];
      if (gate != null) await gate.future;
      final hits = query.isEmpty ? shelf.take(2).toList() : shelf.where((item) => '${item['name']}'.toLowerCase().contains(query)).toList();
      return {'ok': true, 'data': {'query': query, 'favourites': query.isEmpty, 'items': hits, 'more': false}};
    }
    return super.query(name, args);
  }

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async {
    proposals.add(Proposal(name, args));
    if (name == 'set_sku_cost') saved.add(args);
    return ChatReply.fromJson({
      'reply': 'Check $name',
      'posted': false,
      'awaitingConfirmation': true,
      'preview': {'token': 'tok-$name', 'summary': 'Bill', 'effects': <String>[], 'figures': {}},
    });
  }

  @override
  Future<ChatReply> confirm(String token) async => ChatReply.fromJson({'reply': 'Saved.', 'posted': true, 'confirmed': true});
}

class _NoPrinter implements ReceiptPrinter {
  @override
  Future<List<PrinterChoice>> paired() async => const [];

  @override
  Future<String?> print(PrinterChoice printer, List<int> bytes) async => null;

  @override
  Future<PrinterChoice?> remembered() async => null;

  @override
  Future<void> remember(PrinterChoice printer) async {}

  @override
  Future<PaperWidth> paper() async => PaperWidth.mm58;

  @override
  Future<void> setPaper(PaperWidth paper) async {}
}

Future<ShopApi> open(WidgetTester tester) async {
  final api = ShopApi();
  await tester.pumpWidget(MaterialApp(home: AppScope(state: testState(api), child: CounterSaleScreen(scan: (_) async => null, printer: _NoPrinter()))));
  await tester.pumpAndSettle();
  return api;
}

Future<void> type(WidgetTester tester, String text) async {
  await tester.enterText(find.byKey(const Key('counter-code')), text);
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pumpAndSettle();
}

void main() {
  test('result rows are read safely whatever the server sends', () {
    expect(parseItemHits(null), isEmpty);
    expect(parseItemHits({'ok': false}), isEmpty);
    expect(parseItemHits({'ok': true, 'data': {}}), isEmpty);
    expect(parseItemHits({'ok': true, 'data': {'items': 'no'}}), isEmpty);
    final hits = parseItemHits({
      'ok': true,
      'data': {
        'items': [
          _item('A', 'Tea', 140),
          {'sku': '  '},
          {'sku': 'B', 'name': '', 'price': null},
          'junk',
        ],
      },
    });
    expect(hits.map((hit) => hit.sku), ['A', 'B']);
    expect(hits[0].billable, isTrue);
    expect(hits[1].name, 'B');
    expect(hits[1].billable, isFalse);
  });

  test('quantities read the way a shopkeeper writes them', () {
    expect(qtyText(2), '2');
    expect(qtyText(2.0), '2');
    expect(qtyText(0.5), '0.5');
    expect(qtyText(1.25), '1.25');
    expect(qtyText(0.001), '0.001');
    expect(qtyText(100), '100');
    expect(qtyText(0.1 + 0.2), '0.3');
  });

  test('a code is something with digits and no spaces; a word is a name', () {
    expect(looksLikeItemCode('8901063010031'), isTrue);
    expect(looksLikeItemCode('TEA-250'), isTrue);
    expect(looksLikeItemCode('sugar'), isFalse);
    expect(looksLikeItemCode('साखर'), isFalse);
    expect(looksLikeItemCode('atta 5'), isFalse);
    expect(looksLikeItemCode('12'), isFalse);
  });

  test('a quick-added item gets its own code, different each time', () {
    final first = quickItemSku(DateTime.fromMillisecondsSinceEpoch(1700000000000));
    final second = quickItemSku(DateTime.fromMillisecondsSinceEpoch(1700000000001));
    expect(first, startsWith('ITM-'));
    expect(first, isNot(second));
    expect(first.length, lessThanOrEqualTo(64));
  });

  testWidgets('the items sold most are one tap away when the counter opens', (tester) async {
    final api = await open(tester);
    expect(api.searches, ['']);
    expect(find.byKey(const Key('counter-favourites')), findsOneWidget);
    await tester.tap(find.byKey(const Key('counter-fav-SUGAR')));
    await tester.pumpAndSettle();
    expect(find.text('Sugar loose'), findsOneWidget);
    await tester.tap(find.byKey(const Key('counter-fav-SUGAR')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('counter-qty-SUGAR')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('counter-qty-SUGAR')), matching: find.text('2')), findsOneWidget);
  });

  testWidgets('typing part of a name lists matches, in any script, and a tap adds the item', (tester) async {
    final api = await open(tester);
    await type(tester, 'sug');
    expect(find.byKey(const Key('counter-hit-SUGAR')), findsOneWidget);
    expect(find.byKey(const Key('counter-hit-SAKHAR')), findsNothing);
    await type(tester, 'साख');
    expect(find.byKey(const Key('counter-hit-SAKHAR')), findsOneWidget);
    await tester.tap(find.byKey(const Key('counter-hit-SAKHAR')));
    await tester.pumpAndSettle();
    expect(find.text('साखर'), findsOneWidget);
    expect(find.byKey(const Key('counter-results')), findsNothing);
    expect(tester.widget<TextField>(find.byKey(const Key('counter-code'))).controller!.text, isEmpty);
    expect(api.searches, containsAll(['sug', 'साख']));
  });

  testWidgets('a slow answer for old text never replaces the answer for the new text', (tester) async {
    final api = ShopApi();
    final slow = Completer<void>();
    api.gates['s'] = slow;
    await tester.pumpWidget(MaterialApp(home: AppScope(state: testState(api), child: CounterSaleScreen(scan: (_) async => null, printer: _NoPrinter()))));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('counter-code')), 's');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.enterText(find.byKey(const Key('counter-code')), 'atta');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('counter-hit-ATTA')), findsOneWidget);
    slow.complete();
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('counter-hit-ATTA')), findsOneWidget);
    expect(find.byKey(const Key('counter-hit-SUGAR')), findsNothing);
  });

  testWidgets('clearing the text clears the list and brings the favourites back', (tester) async {
    await open(tester);
    await type(tester, 'sug');
    expect(find.byKey(const Key('counter-results')), findsOneWidget);
    await type(tester, '');
    expect(find.byKey(const Key('counter-results')), findsNothing);
    expect(find.byKey(const Key('counter-favourites')), findsOneWidget);
  });

  testWidgets('a name nobody has offers to save it with just a name and a price', (tester) async {
    final api = await open(tester);
    await type(tester, 'jaggery');
    expect(find.byKey(const Key('counter-results')), findsNothing);
    await tester.tap(find.byKey(const Key('counter-quick-add')));
    await tester.pumpAndSettle();
    expect(find.text('New item jaggery'), findsOneWidget);
    expect(tester.widget<TextField>(find.byKey(const Key('item-name'))).controller!.text, 'jaggery');
    await tester.enterText(find.byKey(const Key('item-price')), '60');
    await tester.enterText(find.byKey(const Key('item-gst')), '0');
    await tester.ensureVisible(find.byKey(const Key('item-save')));
    await tester.tap(find.byKey(const Key('item-save')));
    await tester.pumpAndSettle();
    final saved = api.saved.single;
    expect(saved['name'], 'jaggery');
    expect(saved['price'], 60);
    expect('${saved['sku']}', startsWith('ITM-'));
    expect(saved.containsKey('barcode'), isFalse);
    expect(find.text('jaggery'), findsOneWidget);
  });

  testWidgets('Enter on a barcode still looks it up as a code', (tester) async {
    final api = await open(tester);
    await tester.enterText(find.byKey(const Key('counter-code')), '8901063010031');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    expect(api.queries, contains('find_item'));
  });

  testWidgets('tap the quantity to type 0.5 kg and change the price, and the bill carries both', (tester) async {
    final api = await open(tester);
    await tester.tap(find.byKey(const Key('counter-fav-SUGAR')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('counter-qty-SUGAR')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('line-qty')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('line-qty')), '0.5');
    await tester.enterText(find.byKey(const Key('line-price')), '40');
    await tester.tap(find.byKey(const Key('line-save')));
    await tester.pumpAndSettle();
    expect(find.descendant(of: find.byKey(const Key('counter-qty-SUGAR')), matching: find.text('0.5')), findsOneWidget);
    expect(find.textContaining('Shelf price'), findsOneWidget);
    expect(find.byKey(const Key('counter-subtotal')), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('counter-subtotal'))).data, contains('20.00'));
    await tester.ensureVisible(find.byKey(const Key('counter-make')));
    await tester.tap(find.byKey(const Key('counter-make')));
    await tester.pumpAndSettle();
    final line = (api.proposals.last.args['lines'] as List).single as Map;
    expect(line['qty'], 0.5);
    expect(line['rate'], 40);
    expect(line['unit'], 'KGS');
  });

  testWidgets('a bad quantity or price is explained and nothing changes', (tester) async {
    await open(tester);
    await tester.tap(find.byKey(const Key('counter-fav-SUGAR')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('counter-qty-SUGAR')));
    await tester.pumpAndSettle();
    for (final bad in const ['0', '-1', 'abc', '', '1.2345', '100001']) {
      await tester.enterText(find.byKey(const Key('line-qty')), bad);
      await tester.tap(find.byKey(const Key('line-save')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('line-error')), findsOneWidget, reason: 'quantity "$bad"');
    }
    await tester.enterText(find.byKey(const Key('line-qty')), '2');
    for (final bad in const ['0', 'free', '', '44.123']) {
      await tester.enterText(find.byKey(const Key('line-price')), bad);
      await tester.tap(find.byKey(const Key('line-save')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('line-error')), findsOneWidget, reason: 'price "$bad"');
    }
    expect(find.byKey(const Key('line-qty')), findsOneWidget);
  });

  group('composition dealer', () {
    Future<ShopApi> openComposition(WidgetTester tester) async {
      final api = ShopApi()..composition = true;
      final state = testState(api);
      await state.refresh();
      await tester.pumpWidget(MaterialApp(home: AppScope(state: state, child: CounterSaleScreen(scan: (_) async => null, printer: _NoPrinter()))));
      await tester.pumpAndSettle();
      return api;
    }

    testWidgets('the counter says these are bills of supply and bills every line at 0% GST whatever the item says', (tester) async {
      final api = await openComposition(tester);
      expect(find.byKey(const Key('counter-composition')), findsOneWidget);
      await tester.tap(find.byKey(const Key('counter-fav-SUGAR')));
      await tester.pumpAndSettle();
      expect(find.textContaining('GST 0%'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const Key('counter-make')));
      await tester.tap(find.byKey(const Key('counter-make')));
      await tester.pumpAndSettle();
      final line = (api.proposals.last.args['lines'] as List).single as Map;
      expect(line['gstRate'], 0);
      expect(line['rate'], 44);
    });

    testWidgets('a new item asks for no GST rate and is saved at 0%', (tester) async {
      final api = await openComposition(tester);
      await type(tester, 'jaggery');
      await tester.tap(find.byKey(const Key('counter-quick-add')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('item-gst')), findsNothing);
      await tester.enterText(find.byKey(const Key('item-price')), '60');
      await tester.ensureVisible(find.byKey(const Key('item-save')));
      await tester.tap(find.byKey(const Key('item-save')));
      await tester.pumpAndSettle();
      expect(api.saved.single['gstRate'], 0);
      expect(find.textContaining('GST 0%'), findsOneWidget);
    });

    testWidgets('a regular business sees no composition note and still sets a GST rate', (tester) async {
      await open(tester);
      expect(find.byKey(const Key('counter-composition')), findsNothing);
      await type(tester, 'jaggery');
      await tester.tap(find.byKey(const Key('counter-quick-add')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('item-gst')), findsOneWidget);
    });
  });

  group('offline name search', () {
    Future<(OfflineBilling, OfflineServer)> ready() async {
      final server = OfflineServer();
      final books = OfflineBilling(MemoryOfflineFiles(), now: () => DateTime(2026, 11, 21, 10, 30));
      await books.open('biz-1');
      await books.prepare(server, deviceName: 'Counter phone');
      return (books, server);
    }

    test('with nothing set up it finds nothing and does not fail', () async {
      final shop = OfflineBilling(MemoryOfflineFiles());
      expect(shop.searchItems('sug'), isEmpty);
      expect(shop.searchItems(''), isEmpty);
    });

    test('a name, a word inside it, a barcode and a code all find the item, best match first', () async {
      final (books, _) = await ready();
      expect(books.searchItems('parle').map((item) => item.sku), ['PARLE-G']);
      expect(books.searchItems('SALT').map((item) => item.sku), ['TATA-SALT']);
      expect(books.searchItems('8904043901015').map((item) => item.sku), ['TATA-SALT']);
      expect(books.searchItems('tata-salt').map((item) => item.sku), ['TATA-SALT']);
      expect(books.searchItems('  tata   salt ').map((item) => item.sku), ['TATA-SALT']);
      expect(books.searchItems('zzz'), isEmpty);
    });

    test('with no text it lists items up to the limit', () async {
      final (books, _) = await ready();
      expect(books.searchItems('').length, 2);
      expect(books.searchItems('', limit: 1).length, 1);
    });

    test('an item saved on the phone is found before the server has heard of it, and is not listed twice', () async {
      final (books, _) = await ready();
      await books.saveItem(sku: 'JAGGERY', name: 'Jaggery', price: 60, gstRate: 0);
      expect(books.searchItems('jagg').map((item) => item.sku), ['JAGGERY']);
      await books.saveItem(sku: 'PARLE-G', name: 'Parle-G 250g', price: 26, gstRate: 18);
      final hits = books.searchItems('parle');
      expect(hits.length, 1);
      expect(hits.single.price, 26);
    });

    test('with no connection the counter still searches by name', () async {
      final (books, server) = await ready();
      final api = OfflineFirstApi(server, books, business: () => 'biz-1', now: () => DateTime(2026, 11, 21, 10, 30));
      server.reachable = false;
      final result = await api.query('search_items', {'query': 'tata', 'limit': 5}) as Map;
      final hits = parseItemHits(result);
      expect(hits.map((hit) => hit.sku), ['TATA-SALT']);
      expect(hits.single.billable, isTrue);
      expect((result['data'] as Map)['offline'], isTrue);
    });
  });
}
