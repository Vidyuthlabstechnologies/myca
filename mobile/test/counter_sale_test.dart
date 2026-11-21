import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/app_state.dart';
import 'package:myca/pos/escpos.dart';
import 'package:myca/pos/printer.dart';
import 'package:myca/pos/receipt.dart';
import 'package:myca/screens/counter_sale_screen.dart';

import 'fake_api.dart';

const _invoice = {
  'id': 'INV-0042',
  'date': '2026-11-14',
  'partyName': 'Walk-in customer',
  'lines': [
    {'description': 'Parle-G 250g', 'qty': 2, 'rate': 25, 'gstRate': 18, 'taxable': 50},
  ],
  'taxable': 50,
  'cgst': 4.5,
  'sgst': 4.5,
  'igst': 0,
  'total': 59,
};

const _document = {
  'id': 'INV-0042',
  'date': '2026-11-14',
  'documentTitle': 'Tax invoice',
  'seller': {'name': 'Sharma Kirana', 'gstin': '27AABCU9603R1ZN', 'address': '4 Station Road', 'city': 'Pune', 'pin': '411001', 'state': {'code': '27', 'name': 'Maharashtra'}},
  'buyer': {'name': 'Walk-in customer', 'gstin': '', 'address': ''},
  'placeOfSupply': {'code': '27', 'name': 'Maharashtra'},
  'lines': [
    {'description': 'Parle-G 250g', 'hsn': '1905', 'qty': 2, 'rate': 25, 'gstRate': 18, 'taxable': 50},
  ],
  'taxable': 50,
  'cgst': 4.5,
  'sgst': 4.5,
  'igst': 0,
  'total': 59,
};

class CounterApi extends FakeMycaApi {
  final known = <String, Map<String, Object?>>{
    '8901063010031': {'found': true, 'sku': 'PARLE-G', 'name': 'Parle-G 250g', 'price': 25, 'gstRate': 18, 'hsn': '1905'},
  };
  final saved = <Map<String, Object?>>[];
  String? held;

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    if (name == 'find_item') {
      final hit = known['${args['code']}'];
      return {'ok': true, 'data': hit ?? {'found': false, 'code': args['code']}};
    }
    if (name == 'invoice_document') {
      if (args['id'] != 'INV-0042') return {'ok': false, 'error': 'INVOICE_NOT_FOUND'};
      return {'ok': true, 'data': _document};
    }
    return super.query(name, args);
  }

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async {
    proposals.add(Proposal(name, args));
    held = name;
    if (name == 'set_sku_cost') saved.add(args);
    return ChatReply.fromJson({
      'reply': 'Check $name',
      'posted': false,
      'awaitingConfirmation': true,
      'preview': {'token': 'tok-$name', 'summary': 'Bill Walk-in customer ₹59.00', 'effects': ['CGST ₹4.50, SGST ₹4.50'], 'figures': {}},
    });
  }

  @override
  Future<ChatReply> confirm(String token) async {
    confirmed.add(token);
    if (token == 'tok-create_invoice') {
      return ChatReply.fromJson({
        'reply': 'Posted INV-0042.',
        'posted': true,
        'confirmed': true,
        'tools': [
          {'name': 'create_invoice', 'result': {'ok': true, 'invoice': _invoice}},
        ],
      });
    }
    return ChatReply.fromJson({'reply': 'Saved.', 'posted': true, 'confirmed': true});
  }
}

class FakePrinter implements ReceiptPrinter {
  final sent = <List<int>>[];
  PrinterChoice? kept;
  PaperWidth width = PaperWidth.mm58;

  @override
  Future<List<PrinterChoice>> paired() async => const [PrinterChoice(name: 'POS-58', address: '00:11:22:33:44:55')];

  @override
  Future<String?> print(PrinterChoice printer, List<int> bytes) async {
    sent.add(bytes);
    return null;
  }

  @override
  Future<PrinterChoice?> remembered() async => kept;

  @override
  Future<void> remember(PrinterChoice printer) async => kept = printer;

  @override
  Future<PaperWidth> paper() async => width;

  @override
  Future<void> setPaper(PaperWidth paper) async => width = paper;
}

String _ascii(List<int> bytes) {
  final out = <int>[];
  var i = 0;
  while (i < bytes.length) {
    final b = bytes[i];
    if (b == 0x1B) {
      i += bytes[i + 1] == 0x40 ? 2 : 3;
    } else if (b == 0x1D) {
      i += bytes[i + 1] == 0x56 ? 4 : 3;
    } else {
      out.add(b);
      i += 1;
    }
  }
  return String.fromCharCodes(out);
}

void main() {
  test('receipt bytes start with ESC @, end with a cut and print the engine totals in Indian grouping', () {
    final bytes = receiptBytes(invoice: {..._invoice, 'total': 123456.5}, businessName: 'Sharma Kirana', gstin: '27AABCU9603R1ZN');
    expect(bytes.sublist(0, 2), [0x1b, 0x40]);
    expect(bytes.sublist(bytes.length - 4), [0x1d, 0x56, 66, 0]);
    final text = _ascii(bytes);
    expect(text, contains('Sharma Kirana'));
    expect(text, contains('GSTIN 27AABCU9603R1ZN'));
    expect(text, contains('Parle-G 250g'));
    expect(text, contains('CGST'));
    expect(text, contains('Rs.4.50'));
    expect(text, contains('Rs.1,23,456.50'));
    expect(text, isNot(contains('IGST')));
    for (final line in text.split('\n')) {
      expect(line.length, lessThanOrEqualTo(32));
    }
  });

  test('the receipt follows the engine document: title, seller address, HSN, place of supply and cess', () {
    final text = _ascii(receiptBytes(invoice: _document, businessName: ''));
    expect(text, contains('TAX INVOICE'));
    expect(text, contains('4 Station Road, Pune, 411001'));
    expect(text, contains('GSTIN 27AABCU9603R1ZN'));
    expect(text, contains('HSN 1905'));
    expect(text, isNot(contains('Place of supply')));
    final interState = _ascii(receiptBytes(invoice: {..._document, 'placeOfSupply': {'code': '24', 'name': 'Gujarat'}, 'cgst': 0, 'sgst': 0, 'igst': 9, 'cess': 2.5, 'total': 61.5}, businessName: ''));
    expect(interState, contains('Place of supply: Gujarat (24)'));
    expect(interState, contains('Cess'));
    expect(interState, contains('Rs.2.50'));
    final composition = _ascii(receiptBytes(invoice: {..._document, 'documentTitle': 'Bill of supply', 'compositionDeclaration': 'Composition taxable person, not eligible to collect tax on supplies', 'cgst': 0, 'sgst': 0, 'total': 50}, businessName: ''));
    expect(composition, contains('BILL OF SUPPLY'));
    expect(composition, isNot(contains('TAX INVOICE')));
    expect(composition.replaceAll('\n', ' '), contains('Composition taxable person, not eligible to collect tax on supplies'));
    expect(_ascii(receiptBytes(invoice: _invoice, businessName: 'Shop')), isNot(contains('TAX INVOICE')));
  });

  test('a bill of ₹50,000 or more needs the buyer, and the address goes on the invoice', () {
    final small = [CartLine(sku: 'A', name: 'Fan', price: 49999, gstRate: 18)];
    final large = [CartLine(sku: 'B', name: 'Fridge', price: 50000, gstRate: 18)];
    expect(billTotal(small), 58998.82);
    expect(billTaxable(small), 49999);
    expect(needsBuyerDetails(small), isFalse);
    expect(needsBuyerDetails(large), isTrue);
    expect(counterSaleArgs(large, customer: ' Meera Rao ', address: ' 12 MG Road, Pune, Maharashtra 411001 '), {
      'partyName': 'Meera Rao',
      'partyAddress': '12 MG Road, Pune, Maharashtra 411001',
      'lines': [
        {'description': 'Fridge', 'qty': 1, 'rate': 50000, 'gstRate': 18},
      ],
    });
    expect(counterSaleArgs(small).containsKey('partyAddress'), isFalse);
  });

  test('80 mm paper widens the lines to 48 columns', () {
    final text = _ascii(receiptBytes(invoice: _invoice, businessName: 'Shop', paper: PaperWidth.mm80));
    expect(text.split('\n').any((line) => line.length > 32 && line.length <= 48), isTrue);
  });

  test('counter sale args send the walk-in customer and each line with its GST rate', () {
    final args = counterSaleArgs([CartLine(sku: 'A', name: 'Soap', price: 40, gstRate: 18, hsn: '3401', qty: 3)]);
    expect(args['partyName'], 'Walk-in customer');
    expect(args['lines'], [
      {'description': 'Soap', 'hsn': '3401', 'qty': 3, 'rate': 40, 'gstRate': 18},
    ]);
  });

  testWidgets('scan a known item twice, add a new one, post the bill and print the receipt', (tester) async {
    final api = CounterApi();
    final printer = FakePrinter();
    final codes = ['8901063010031', '8901063010031', '8906000000017'];
    await tester.pumpWidget(MaterialApp(
      home: AppScope(
        state: testState(api),
        child: CounterSaleScreen(scan: (_) async => codes.removeAt(0), printer: printer),
      ),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('counter-scan')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('counter-scan')));
    await tester.pumpAndSettle();
    expect(find.text('Parle-G 250g'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);

    await tester.tap(find.byKey(const Key('counter-scan')));
    await tester.pumpAndSettle();
    expect(find.text('New item 8906000000017'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('item-name')), 'Tata Salt 1kg');
    await tester.enterText(find.byKey(const Key('item-price')), '28');
    await tester.enterText(find.byKey(const Key('item-gst')), '0');
    await tester.tap(find.byKey(const Key('item-save')));
    await tester.pumpAndSettle();
    expect(api.saved.single['sku'], '8906000000017');
    expect(api.saved.single['price'], 28);
    expect(find.text('Tata Salt 1kg'), findsOneWidget);

    await tester.ensureVisible(find.byKey(const Key('counter-make')));
    await tester.tap(find.byKey(const Key('counter-make')));
    await tester.pumpAndSettle();
    final bill = api.proposals.last;
    expect(bill.tool, 'create_invoice');
    expect((bill.args['lines'] as List).length, 2);

    await tester.ensureVisible(find.byKey(const Key('counter-post')));
    await tester.tap(find.byKey(const Key('counter-post')));
    await tester.pumpAndSettle();
    expect(api.confirmed, contains('tok-create_invoice'));
    expect(find.text('Posted INV-0042. Paid by Cash.'), findsOneWidget);
    final paid = api.proposals.last;
    expect(paid.tool, 'record_receipt');
    expect(paid.args, {'invoiceId': 'INV-0042', 'amount': 59, 'mode': 'cash', 'date': '2026-11-14'});

    await tester.ensureVisible(find.byKey(const Key('counter-print')));
    await tester.tap(find.byKey(const Key('counter-print')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('POS-58'));
    await tester.pumpAndSettle();
    expect(printer.kept?.address, '00:11:22:33:44:55');
    expect(_ascii(printer.sent.single), contains('INV-0042'));
    expect(_ascii(printer.sent.single), contains('4 Station Road'));
    expect(_ascii(printer.sent.single), contains('HSN 1905'));
    expect(find.text('Receipt sent to POS-58.'), findsOneWidget);
  });

  testWidgets('a large bill is held until the customer name and address are given', (tester) async {
    final api = CounterApi();
    api.known['TV55'] = {'found': true, 'sku': 'TV55', 'name': 'LED TV 55', 'price': 50000, 'gstRate': 18, 'hsn': '8528'};
    await tester.pumpWidget(MaterialApp(
      home: AppScope(
        state: testState(api),
        child: CounterSaleScreen(scan: (_) async => 'TV55', printer: FakePrinter()),
      ),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('counter-scan')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('counter-address')), findsOneWidget);

    await tester.ensureVisible(find.byKey(const Key('counter-make')));
    await tester.tap(find.byKey(const Key('counter-make')));
    await tester.pumpAndSettle();
    expect(find.textContaining('must carry the customer\'s name and address'), findsOneWidget);
    expect(api.proposals.where((proposal) => proposal.tool == 'create_invoice'), isEmpty);

    await tester.enterText(find.byKey(const Key('counter-customer')), 'Meera Rao');
    await tester.enterText(find.byKey(const Key('counter-address')), '12 MG Road, Pune, Maharashtra 411001');
    await tester.ensureVisible(find.byKey(const Key('counter-make')));
    await tester.tap(find.byKey(const Key('counter-make')));
    await tester.pumpAndSettle();
    final bill = api.proposals.last;
    expect(bill.tool, 'create_invoice');
    expect(bill.args['partyName'], 'Meera Rao');
    expect(bill.args['partyAddress'], '12 MG Road, Pune, Maharashtra 411001');
  });
}
