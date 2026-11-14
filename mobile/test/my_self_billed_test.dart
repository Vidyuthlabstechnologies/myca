import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/my/my_tools.dart';
import 'package:myca/screens/my/my_einvoice_detail_screen.dart';
import 'package:myca/screens/my/my_einvoice_list_screen.dart';
import 'package:myca/screens/my/my_self_billed_screen.dart';

import 'my_support.dart';

Future<void> fillForeignPurchase(WidgetTester tester, {String number = 'SB-2026-0007', String country = 'CHN', String phone = '+8675512345678'}) async {
  await typeKey(tester, 'mySelf.number', number);
  await typeKey(tester, 'mySelf.name', 'Shenzhen Brightway Electronics Co Ltd');
  await typeKey(tester, 'mySelf.country', country);
  await typeKey(tester, 'mySelf.line', '88 Keyuan Road, Nanshan');
  await typeKey(tester, 'mySelf.city', 'Shenzhen');
  await typeKey(tester, 'mySelf.phone', phone);
  await pickOption(tester, 'mySelf.currency', 'USD');
  await typeKey(tester, 'mySelf.rate', '4.42');
  await typeKey(tester, 'mySelf.line0.description', 'Cloud hosting, October');
  await typeKey(tester, 'mySelf.line0.price', '1200');
}

Future<void> fillLocalAgent(WidgetTester tester, {String number = 'SB-2026-0008', String tin = 'C10987654321'}) async {
  await typeKey(tester, 'mySelf.number', number);
  await tapKey(tester, 'mySelf.kind.business');
  await typeKey(tester, 'mySelf.name', 'Ejen Jualan Harmoni Enterprise');
  await typeKey(tester, 'mySelf.tin', tin);
  await typeKey(tester, 'mySelf.id', '201901000005');
  await typeKey(tester, 'mySelf.line', '5 Jalan Bunga Raya');
  await typeKey(tester, 'mySelf.postcode', '10200');
  await typeKey(tester, 'mySelf.city', 'George Town');
  await pickOption(tester, 'mySelf.state', 'Pulau Pinang');
  await typeKey(tester, 'mySelf.phone', '+60124567890');
  await typeKey(tester, 'mySelf.line0.description', 'Sales commission, October');
  await typeKey(tester, 'mySelf.line0.price', '850');
}

Future<void> sendAndConfirm(WidgetTester tester) async {
  await tapKey(tester, 'mySelf.send');
  await tester.tap(find.byKey(const Key('mySelf.confirm')));
  await settle(tester);
}

void main() {
  setUp(() => moneyCountry = 'MY');
  tearDown(() => moneyCountry = 'IN');

  testWidgets('a self-billed e-invoice for a foreign supplier is checked, confirmed, sent and validated with EI00000000030', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MySelfBilledScreen()));
    await settle(tester);
    expect(find.byKey(const Key('mySelf.intro')), findsOneWidget);
    expect(find.textContaining('foreign supplier TIN EI00000000030'), findsOneWidget);
    await fillForeignPurchase(tester);
    await tapKey(tester, 'mySelf.check');
    expect(find.byKey(const Key('mySelf.ready')), findsOneWidget);
    expect(find.text('USD 1200.00'), findsWidgets);
    final checked = api.args['my_einvoice_check']!;
    expect(checked['type'], 'self-billed-invoice');
    expect((checked['supplier'] as Map)['tin'], 'EI00000000030');
    expect(((checked['supplier'] as Map)['address'] as Map)['country'], 'CHN');
    expect((checked['buyer'] as Map)['tin'], 'C25845632020');
    await tapKey(tester, 'mySelf.send');
    expect(find.text('Send this self-billed e-invoice to LHDN?'), findsOneWidget);
    expect(find.text('You issue it as the buyer, on behalf of Shenzhen Brightway Electronics Co Ltd.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('mySelf.confirm')));
    await settle(tester);
    final sent = api.args['propose:issue_my_self_billed_einvoice']!;
    expect(sent.containsKey('buyer'), isFalse);
    expect(sent['exchangeRate'], 4.42);
    expect(sent['currency'], 'USD');
    expect((sent['supplier'] as Map)['msic'], '00000');
    expect(api.calls.where((call) => call == 'propose:issue_my_self_billed_einvoice'), hasLength(1));
    expect(find.text('e-Invoice SB-2026-0007'), findsOneWidget);
    expect(find.text('Self-billed invoice'), findsOneWidget);
    expect(find.text('Supplier: Shenzhen Brightway Electronics Co Ltd'), findsOneWidget);
    expect(find.text('Valid'), findsOneWidget);
    expect(find.byKey(const Key('myDetail.qr')), findsOneWidget);
    final row = api.books.malaysia.einvoices.first;
    expect(row['kind'], 'self-billed');
    expect(row['supplierTin'], 'EI00000000030');
  });

  testWidgets('a validated self-billed e-invoice offers self-billed credit, debit and refund notes naming it', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MySelfBilledScreen()));
    await settle(tester);
    await fillForeignPurchase(tester);
    await sendAndConfirm(tester);
    final uuid = api.books.malaysia.einvoices.first['uuid'];
    await reveal(tester, find.text('ADJUST THIS E-INVOICE'));
    await tapKey(tester, 'myDetail.debitNote');
    expect(find.text('Self-billed debit note'), findsWidgets);
    expect(tester.widget<TextField>(find.byKey(const Key('mySelf.original'))).controller!.text, uuid);
    expect(tester.widget<TextField>(find.byKey(const Key('mySelf.name'))).controller!.text, 'Shenzhen Brightway Electronics Co Ltd');
    await typeKey(tester, 'mySelf.number', 'SBDN-2026-0001');
    await typeKey(tester, 'mySelf.country', 'CHN');
    await typeKey(tester, 'mySelf.city', 'Shenzhen');
    await typeKey(tester, 'mySelf.phone', '+8675512345678');
    await typeKey(tester, 'mySelf.rate', '4.42');
    await typeKey(tester, 'mySelf.line0.description', 'Extra storage, October');
    await typeKey(tester, 'mySelf.line0.price', '90');
    await sendAndConfirm(tester);
    final sent = api.args['propose:issue_my_self_billed_einvoice']!;
    expect(sent['type'], 'self-billed-debit-note');
    expect((sent['original'] as Map)['uuid'], uuid);
    expect((sent['original'] as Map)['number'], 'SB-2026-0007');
    expect(find.text('Self-billed debit note'), findsOneWidget);
    expect(find.byKey(const Key('myDetail.creditNote')), findsNothing);
  });

  testWidgets('missing and badly shaped supplier details are caught before anything is checked or sent', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MySelfBilledScreen()));
    await settle(tester);
    await tapKey(tester, 'mySelf.check');
    expect(find.text('Enter the invoice number.'), findsOneWidget);
    expect(find.text('Enter the supplier name.'), findsOneWidget);
    expect(find.textContaining('Give the supplier\'s country, not Malaysia'), findsOneWidget);
    expect(find.textContaining('LHDN needs it on a self-billed e-invoice'), findsOneWidget);
    expect(find.text('Describe what was sold.'), findsOneWidget);
    await fillForeignPurchase(tester, country: 'MYS', phone: '12ab');
    await tapKey(tester, 'mySelf.check');
    expect(find.textContaining('Give the supplier\'s country, not Malaysia'), findsOneWidget);
    expect(find.text('Digits only, with an optional +, 8 to 15 long.'), findsOneWidget);
    await typeKey(tester, 'mySelf.rate', '0');
    await tapKey(tester, 'mySelf.check');
    expect(find.text('Enter the exchange rate, more than zero.'), findsOneWidget);
    await tapKey(tester, 'mySelf.kind.individual');
    await typeKey(tester, 'mySelf.tin', '12345');
    await typeKey(tester, 'mySelf.id', '1234');
    await tapKey(tester, 'mySelf.check');
    expect(find.textContaining('That is not an LHDN TIN'), findsOneWidget);
    expect(find.text('A MyKad number has 12 digits.'), findsOneWidget);
    expect(find.text('Choose the state.'), findsOneWidget);
    expect(api.calls, isNot(contains('my_einvoice_check')));
  });

  testWidgets('a note without the original UUID is refused on the phone', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MySelfBilledScreen(type: 'self-billed-refund-note')));
    await settle(tester);
    await fillForeignPurchase(tester);
    await tapKey(tester, 'mySelf.check');
    expect(find.text('The UUID has 26 letters and digits, as shown on the original e-invoice.'), findsOneWidget);
    expect(api.calls, isNot(contains('my_einvoice_check')));
  });

  testWidgets('a local agent with a TIN LHDN cannot match comes back invalid with what LHDN said', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MySelfBilledScreen()));
    await settle(tester);
    await fillLocalAgent(tester, tin: 'C10987650000');
    await sendAndConfirm(tester);
    final sent = api.args['propose:issue_my_self_billed_einvoice']!;
    expect((sent['supplier'] as Map)['idType'], 'BRN');
    expect(((sent['supplier'] as Map)['address'] as Map)['state'], '07');
    expect(find.text('Invalid'), findsOneWidget);
    expect(find.textContaining('CF321'), findsOneWidget);
    expect(find.byKey(const Key('myDetail.creditNote')), findsNothing);
  });

  testWidgets('LHDN rejecting the submission and a number already used are shown in plain words', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MySelfBilledScreen()));
    await settle(tester);
    await fillLocalAgent(tester, number: 'SB-REJECT-01');
    await sendAndConfirm(tester);
    expect(find.text('Rejected'), findsOneWidget);
    expect(find.textContaining('DS302'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(myApp(myState(api), const MySelfBilledScreen()));
    await settle(tester);
    await fillLocalAgent(tester, number: 'SB-2026-0010');
    await sendAndConfirm(tester);
    expect(find.text('Valid'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(myApp(myState(api), const MySelfBilledScreen()));
    await settle(tester);
    await fillLocalAgent(tester, number: 'SB-2026-0010');
    await sendAndConfirm(tester);
    expect(find.text('This invoice number was already sent to LHDN. Use a new number.'), findsOneWidget);
    expect(find.byKey(const Key('mySelf.send')), findsOneWidget);
  });

  testWidgets('a network failure after confirming keeps the preview and the retry sends it once', (tester) async {
    final api = MyTestApi()..failNext['confirm'] = 1;
    await tester.pumpWidget(myApp(myState(api), const MySelfBilledScreen()));
    await settle(tester);
    await fillForeignPurchase(tester);
    await sendAndConfirm(tester);
    expect(find.textContaining('Cannot reach MyCA'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
    await tapKey(tester, 'mySelf.send');
    expect(find.text('e-Invoice SB-2026-0007'), findsOneWidget);
    expect(api.calls.where((call) => call == 'propose:issue_my_self_billed_einvoice'), hasLength(1));
    expect(api.books.malaysia.einvoices.where((row) => row['number'] == 'SB-2026-0007'), hasLength(1));
  });

  testWidgets('without saved business details the form asks for them and sends nothing', (tester) async {
    final api = MyTestApi();
    api.books.malaysia.hasProfile = false;
    await tester.pumpWidget(myApp(myState(api), const MySelfBilledScreen()));
    await settle(tester);
    expect(find.byKey(const Key('mySelf.profileMissing')), findsOneWidget);
    await fillForeignPurchase(tester);
    await tapKey(tester, 'mySelf.check');
    expect(find.byKey(const Key('mySelf.error')), findsOneWidget);
    expect(api.calls, isNot(contains('my_einvoice_check')));
    await tapKey(tester, 'mySelf.send');
    expect(api.calls, isNot(contains('propose:issue_my_self_billed_einvoice')));
  });

  testWidgets('the new e-invoice choice opens the self-billed form, with nothing marked as coming soon', (tester) async {
    await tester.pumpWidget(myApp(myState(MyTestApi()), const MyEinvoiceListScreen()));
    await settle(tester);
    await tester.tap(find.byKey(const Key('myList.new')));
    await settle(tester);
    expect(find.textContaining('soon'), findsNothing);
    expect(find.textContaining('who does not issue e-invoices'), findsOneWidget);
    await tester.tap(find.byKey(const Key('myNew.selfBilled')));
    await settle(tester);
    expect(find.byKey(const Key('mySelf.intro')), findsOneWidget);
  });

  testWidgets('a self-billed e-invoice in the list names the supplier', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MySelfBilledScreen()));
    await settle(tester);
    await fillLocalAgent(tester);
    await sendAndConfirm(tester);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(myApp(myState(api), const MyEinvoiceListScreen()));
    await settle(tester);
    expect(find.text('Ejen Jualan Harmoni Enterprise'), findsOneWidget);
    final record = MyEinvoice.fromJson(api.books.malaysia.einvoices.first);
    expect(record.selfBilled, isTrue);
    expect(record.counterparty, 'Ejen Jualan Harmoni Enterprise');
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(myApp(myState(api), MyEinvoiceDetailScreen(record: record)));
    await settle(tester);
    expect(find.text('Supplier: Ejen Jualan Harmoni Enterprise'), findsOneWidget);
  });

  testWidgets('the self-billed form reads in Malay', (tester) async {
    await tester.pumpWidget(myApp(myState(MyTestApi()), const MySelfBilledScreen(), language: 'ms'));
    await settle(tester);
    expect(find.text('Invois bil kendiri'), findsWidgets);
    expect(find.text('Pembekal asing'), findsOneWidget);
    expect(find.textContaining('perniagaan anda ialah pembeli'), findsOneWidget);
    await tapKey(tester, 'mySelf.check');
    expect(find.text('Masukkan nama pembekal.'), findsOneWidget);
  });
}
