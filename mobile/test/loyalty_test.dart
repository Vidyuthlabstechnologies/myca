import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/app_state.dart';
import 'package:myca/india/loyalty_points.dart';
import 'package:myca/main.dart';
import 'package:myca/pos/escpos.dart';
import 'package:myca/pos/printer.dart';
import 'package:myca/pos/receipt.dart';
import 'package:myca/screens/counter_sale_screen.dart';
import 'package:myca/screens/loyalty_screen.dart';

import 'fake_api.dart';

const _settings = {
  'enabled': true,
  'configured': true,
  'earnPoints': 1,
  'earnPerRupees': 100,
  'earnOn': 'taxable',
  'pointValue': 1,
  'minRedeemPoints': 10,
  'maxRedeemPercent': 50,
  'expiryMonths': 12,
};

const _asha = {
  'partyName': 'Asha Verma',
  'balance': 120,
  'value': 120,
  'earned': 120,
  'redeemed': 0,
  'expired': 0,
  'expiringSoon': [
    {'points': 20, 'on': '2026-11-01'},
  ],
  'whatsapp': 'Namaste Asha Verma, you have 120 loyalty points worth ₹120.00 at Sharma Kirana.',
};

class LoyaltyApi extends FakeMycaApi {
  LoyaltyApi() : super(signedIn: true);

  Map<String, Object?> settings = Map.of(_settings);

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    if (name == 'loyalty_balance') {
      queries.add(name);
      queryArgs.add(QueryCall(name, args));
      final who = '${args['partyName'] ?? ''}';
      if (who.isEmpty) {
        return {
          'ok': true,
          'data': {'asOf': '2026-10-05', 'settings': settings, 'customers': [_asha], 'count': 1, 'outstandingPoints': 120, 'liability': 120, 'expiringSoonPoints': 20, 'expiringSoonDays': 30},
        };
      }
      if (who == 'Asha Verma' || who == 'Gujarat Weaves') {
        return {
          'ok': true,
          'data': {'asOf': '2026-10-05', 'settings': settings, 'customer': {..._asha, 'partyName': who}},
        };
      }
      return {'ok': false, 'error': 'CUSTOMER_NOT_FOUND'};
    }
    return super.query(name, args);
  }

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async {
    if (!name.startsWith('loyalty_') && name != 'create_invoice') return super.propose(name, args);
    proposals.add(Proposal(name, args));
    return ChatReply.fromJson({
      'reply': 'Check $name',
      'posted': false,
      'awaitingConfirmation': true,
      'preview': {'token': 'tok-$name', 'summary': 'Preview of $name', 'effects': ['Nothing posts yet.'], 'figures': {}},
    });
  }

  @override
  Future<ChatReply> confirm(String token) async {
    confirmed.add(token);
    return ChatReply.fromJson({'reply': 'Done $token.', 'posted': true, 'confirmed': true});
  }
}

Future<void> _pumpScreen(WidgetTester tester, LoyaltyApi api, Widget screen, {List<String>? shared}) async {
  final state = AppState(
    api: api,
    store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
    pickTextFile: (_) async => null,
    shareText: (text) async {
      shared?.add(text);
      return true;
    },
    now: () => DateTime(2026, 10, 5, 22, 30),
  );
  await tester.pumpWidget(MaterialApp(home: AppScope(state: state, child: screen)));
  await tester.pumpAndSettle();
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

void main() {
  test('points usable on a bill stop at the balance and at the share of the bill before GST', () {
    final rules = LoyaltyRules.fromJson(_settings);
    expect(usablePoints(balance: 120, rules: rules, billBeforeGst: 1000), 120);
    expect(usablePoints(balance: 120, rules: rules, billBeforeGst: 100), 50);
    expect(usablePoints(balance: 120, rules: LoyaltyRules.fromJson({..._settings, 'pointValue': 0.25}), billBeforeGst: 100), 120);
    expect(usablePoints(balance: 0, rules: rules, billBeforeGst: 100), 0);
  });

  test('counter sale args carry the points only for a named customer', () {
    final cart = [CartLine(sku: 'A', name: 'Rice', price: 500, gstRate: 5)];
    expect(counterSaleArgs(cart, customer: 'Asha Verma', redeemPoints: 40)['redeemPoints'], 40);
    expect(counterSaleArgs(cart, redeemPoints: 40).containsKey('redeemPoints'), isFalse);
    expect(counterSaleArgs(cart, customer: 'Asha Verma').containsKey('redeemPoints'), isFalse);
  });

  test('loyalty settings args send only the numbers given', () {
    final args = loyaltySettingsArgs(enabled: true, earnPoints: '2', earnPerRupees: '100', earnOn: 'total', pointValue: '0.25', minRedeemPoints: '', maxRedeemPercent: '20', expiryMonths: '0');
    expect(args, {'enabled': true, 'earnPoints': 2, 'earnPerRupees': 100, 'earnOn': 'total', 'pointValue': 0.25, 'maxRedeemPercent': 20, 'expiryMonths': 0});
  });

  test('the receipt prints the item before points and the points redeemed line from the engine document', () {
    final bytes = receiptBytes(invoice: {
      'id': 'INV-0007',
      'date': '2026-10-05',
      'lines': [
        {'description': 'Rice', 'qty': 1, 'rate': 400, 'gstRate': 5, 'grossTaxable': 400, 'loyaltyDiscount': 40, 'taxable': 360},
      ],
      'discounts': [
        {'label': 'Loyalty points redeemed', 'points': 40, 'amount': 40},
      ],
      'taxable': 360,
      'cgst': 9,
      'sgst': 9,
      'total': 378,
    }, businessName: 'Shop');
    final text = String.fromCharCodes(bytes.where((b) => b >= 0x20 && b < 0x7f || b == 0x0a));
    expect(text, contains('Points redeemed (40)'));
    expect(text, contains('-Rs.40.00'));
    expect(text, contains('Rs.400.00'));
  });

  testWidgets('the loyalty screen saves the settings through a preview and lists customers with the points liability', (tester) async {
    final api = LoyaltyApi()..settings = {..._settings, 'enabled': false, 'configured': false};
    final shared = <String>[];
    await _pumpScreen(tester, api, const LoyaltyScreen(), shared: shared);
    expect(find.text('Loyalty points'), findsOneWidget);
    expect(find.byKey(const Key('loyalty-liability')), findsOneWidget);
    expect(find.text('120 points held by customers, worth ₹120.00. 20 expire in the next 30 days.'), findsOneWidget);

    await tester.tap(find.byKey(const Key('loyalty-enabled')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('loyalty-point-value')), '0.5');
    await tester.ensureVisible(find.byKey(const Key('loyalty-save')));
    await tester.tap(find.byKey(const Key('loyalty-save')));
    await tester.pumpAndSettle();
    final saved = api.proposals.last;
    expect(saved.tool, 'loyalty_settings');
    expect(saved.args['enabled'], true);
    expect(saved.args['pointValue'], 0.5);
    expect(saved.args['earnOn'], 'taxable');
    expect(find.text('Preview of loyalty_settings'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('loyalty-confirm')));
    await tester.tap(find.byKey(const Key('loyalty-confirm')));
    await tester.pumpAndSettle();
    expect(api.confirmed, contains('tok-loyalty_settings'));

    await tester.ensureVisible(find.text('Asha Verma'));
    await tester.tap(find.text('Asha Verma'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('loyalty-whatsapp')), findsOneWidget);
    await tester.tap(find.byKey(const Key('loyalty-send')));
    await tester.pumpAndSettle();
    expect(shared.single, startsWith('Namaste Asha Verma, you have 120 loyalty points'));

    await tester.tap(find.byKey(const Key('loyalty-adjust')));
    await tester.pumpAndSettle();
    expect(find.text('Enter the points to add, or a minus sign to take points away.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('loyalty-adjust-points')), '50');
    await tester.enterText(find.byKey(const Key('loyalty-adjust-reason')), 'Diwali bonus');
    await tester.tap(find.byKey(const Key('loyalty-adjust')));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'loyalty_adjust');
    expect(api.proposals.last.args, {'partyName': 'Asha Verma', 'points': 50, 'reason': 'Diwali bonus'});
    await tester.tap(find.byKey(const Key('loyalty-adjust-confirm')));
    await tester.pumpAndSettle();
    expect(api.confirmed, contains('tok-loyalty_adjust'));
  });

  testWidgets('the counter sale shows the customer\'s points and sends the points to use with the bill', (tester) async {
    final api = LoyaltyApi();
    await _pumpScreen(tester, api, CounterSaleScreen(scan: (_) async => '8901', printer: _NoPrinter()));
    expect(find.byKey(const Key('counter-loyalty')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('counter-code')), 'X');
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('counter-scan')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('item-name')), 'Basmati rice 5 kg');
    await tester.enterText(find.byKey(const Key('item-price')), '400');
    await tester.enterText(find.byKey(const Key('item-gst')), '5');
    await tester.tap(find.byKey(const Key('item-save')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('counter-customer')), 'Walk-in customer');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('loyalty-card')), findsNothing);

    await tester.enterText(find.byKey(const Key('counter-customer')), 'Asha Verma');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();
    expect(find.text('Asha Verma: 120 points (₹120.00). 20 expire on 2026-11-01.'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('loyalty-use')));
    await tester.tap(find.byKey(const Key('loyalty-use')));
    await tester.pumpAndSettle();
    final field = tester.widget<TextField>(find.byKey(const Key('loyalty-redeem')));
    expect(field.controller!.text, '120');
    await tester.enterText(find.byKey(const Key('loyalty-redeem')), '40');
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.byKey(const Key('counter-make')));
    await tester.tap(find.byKey(const Key('counter-make')));
    await tester.pumpAndSettle();
    final bill = api.proposals.last;
    expect(bill.tool, 'create_invoice');
    expect(bill.args['partyName'], 'Asha Verma');
    expect(bill.args['redeemPoints'], 40);

    await tester.tap(find.byKey(const Key('counter-loyalty')));
    await tester.pumpAndSettle();
    expect(find.byType(LoyaltyScreen), findsOneWidget);
  });

  testWidgets('a sale from the customer\'s page can use their points', (tester) async {
    final api = LoyaltyApi();
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Sales');
    await tester.tap(find.text('Gujarat Weaves'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ActionChip, 'Sale').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Amount before GST'), '1000');
    await tester.enterText(find.widgetWithText(TextField, 'GST'), '5');
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('loyalty-points-line')), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('loyalty-use')));
    await tester.tap(find.byKey(const Key('loyalty-use')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('loyalty-redeem')), '30');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Preview'));
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    final sale = api.proposals.last;
    expect(sale.tool, 'create_invoice');
    expect(sale.args['redeemPoints'], 30);
  });
}
