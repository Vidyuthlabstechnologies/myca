import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/online_store_screen.dart';

import 'fake_api.dart';

class StoreApi extends FakeMycaApi {
  StoreApi({this.live = true});

  final bool live;
  String? held;
  final orderActions = <Map<String, Object?>>[];
  String orderStatus = 'new';

  Map<String, Object?> get view => {
        'settings': {'enabled': live, 'storeName': 'Sharma Kirana', 'whatsapp': '9876543210', 'description': '', 'city': 'Pune', 'showPrices': true, 'showStock': false, 'showGstin': false, 'slug': ''},
        'link': {'slug': live ? 'sharma-kirana' : '', 'live': live, 'path': live ? '/s/sharma-kirana' : '', if (live) 'url': 'https://api.myca.test/s/sharma-kirana'},
        'items': [
          {'sku': 'TEA', 'name': 'Assam tea', 'price': 100, 'gstRate': 5, 'priceWithGst': 105, 'published': true},
          {'sku': 'SOAP', 'name': 'Neem soap', 'price': 40, 'gstRate': 18, 'priceWithGst': 47.2, 'published': false},
        ],
      };

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    queries.add(name);
    if (name == 'catalogue_view') return {'ok': true, 'data': view};
    if (name == 'store_orders') {
      return {
        'ok': true,
        'data': {
          'orders': [
            {'id': 'ORD-0001', 'buyerName': 'Meena', 'buyerPhone': '9820012345', 'status': orderStatus, 'quoteId': orderStatus == 'accepted' ? 'QT-0007' : '', 'note': 'After 6 pm', 'lines': [{'sku': 'TEA', 'name': 'Assam tea', 'qty': 2, 'price': 105, 'amount': 210}]},
          ],
        },
      };
    }
    return super.query(name, args);
  }

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async {
    proposals.add(Proposal(name, args));
    held = name;
    if (name == 'store_order_action') orderActions.add(args);
    return ChatReply.fromJson({
      'reply': 'Check $name',
      'posted': false,
      'awaitingConfirmation': true,
      'preview': {'token': 'tok-$name', 'summary': name == 'store_order_action' ? 'Accept ORD-0001 from Meena: quote of ₹210.00' : 'Online store on: Sharma Kirana', 'effects': ['Nothing posts to your books.'], 'figures': {}},
    });
  }

  @override
  Future<ChatReply> confirm(String token) async {
    confirmed.add(token);
    if (token == 'tok-store_order_action') orderStatus = 'accepted';
    return ChatReply.fromJson({'reply': 'Done.', 'posted': true, 'confirmed': true});
  }
}

Future<void> pumpStore(WidgetTester tester, StoreApi api, {List<String>? shared, int tab = 0}) async {
  await tester.pumpWidget(MaterialApp(
    home: AppScope(
      state: AppState(
        api: api,
        store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
        pickTextFile: (_) async => null,
        now: () => DateTime(2026, 11, 21, 10),
        shareText: (text) async {
          shared?.add(text);
          return true;
        },
      ),
      child: OnlineStoreScreen(initialTab: tab),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  test('the share text carries the store name and the link', () {
    expect(storeShareText('Sharma Kirana', 'https://x.test/s/sharma'), 'Order from Sharma Kirana online: https://x.test/s/sharma');
    expect(storeLinkOf({'link': {'path': '/s/a-b-c'}}), '/s/a-b-c');
    expect(storeLinkOf({'link': {'path': '/s/a-b-c', 'url': 'https://x.test/s/a-b-c'}}), 'https://x.test/s/a-b-c');
    expect(storeLinkOf(const {}), '');
  });

  testWidgets('switch the store on with a link name, then share the link on WhatsApp', (tester) async {
    final api = StoreApi();
    final shared = <String>[];
    await pumpStore(tester, api, shared: shared);
    expect(find.text('https://api.myca.test/s/sharma-kirana'), findsOneWidget);
    expect(find.text('Online store'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('store-slug')), 'Sharma-Pune');
    await tester.ensureVisible(find.byKey(const Key('store-save')));
    await tester.tap(find.byKey(const Key('store-save')));
    await tester.pumpAndSettle();
    final saved = api.proposals.last;
    expect(saved.tool, 'catalogue_settings');
    expect(saved.args['enabled'], true);
    expect(saved.args['slug'], 'sharma-pune');
    expect(saved.args['whatsapp'], '9876543210');
    expect(find.byKey(const Key('store-preview')), findsOneWidget);
    await tester.tap(find.byKey(const Key('store-confirm')));
    await tester.pumpAndSettle();
    expect(api.confirmed, ['tok-catalogue_settings']);

    await tester.ensureVisible(find.byKey(const Key('store-share')));
    await tester.tap(find.byKey(const Key('store-share')));
    await tester.pumpAndSettle();
    expect(shared.single, 'Order from Sharma Kirana online: https://api.myca.test/s/sharma-kirana');
  });

  testWidgets('pick items to publish and only the changed ones are sent', (tester) async {
    final api = StoreApi();
    await pumpStore(tester, api);
    expect(find.text('₹105.00 incl. GST'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('store-item-SOAP')));
    await tester.tap(find.byKey(const Key('store-item-SOAP')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('store-save-items')));
    await tester.tap(find.byKey(const Key('store-save-items')));
    await tester.pumpAndSettle();
    final sent = api.proposals.last;
    expect(sent.tool, 'catalogue_items');
    expect(sent.args['items'], [
      {'sku': 'SOAP', 'published': true},
    ]);
  });

  testWidgets('an order in the inbox becomes a quote', (tester) async {
    final api = StoreApi();
    await pumpStore(tester, api, tab: 1);
    expect(find.text('Orders (1)'), findsOneWidget);
    expect(find.textContaining('Meena'), findsOneWidget);
    expect(find.text('2 x Assam tea = ₹210.00'), findsOneWidget);
    await tester.tap(find.byKey(const Key('store-accept-ORD-0001')));
    await tester.pumpAndSettle();
    expect(api.orderActions.single, {'id': 'ORD-0001', 'action': 'accept'});
    expect(find.textContaining('quote of ₹210.00'), findsOneWidget);
    await tester.tap(find.byKey(const Key('store-confirm')));
    await tester.pumpAndSettle();
    expect(api.confirmed, ['tok-store_order_action']);
    expect(find.textContaining('QT-0007'), findsOneWidget);
    expect(find.byKey(const Key('store-accept-ORD-0001')), findsNothing);
    expect(find.byKey(const Key('store-fulfil-ORD-0001')), findsOneWidget);
  });

  testWidgets('on a Hindi phone the home row opens the store screen in Hindi', (tester) async {
    tester.platformDispatcher.localesTestValue = const [Locale('hi', 'IN')];
    addTearDown(tester.platformDispatcher.clearLocalesTestValue);
    final api = StoreApi(live: false)..signedIn = true;
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tester.dragUntilVisible(find.text('ऑनलाइन दुकान'), find.byType(Scrollable).first, const Offset(0, -200));
    await tester.ensureVisible(find.text('ऑनलाइन दुकान'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('ऑनलाइन दुकान'));
    await tester.pumpAndSettle();
    expect(find.text('दुकान चालू है'), findsOneWidget);
    expect(find.byKey(const Key('store-share')), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
