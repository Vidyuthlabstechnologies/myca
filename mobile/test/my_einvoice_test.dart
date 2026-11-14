import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/my/my_tools.dart';
import 'package:myca/screens/my/my_einvoice_create_screen.dart';
import 'package:myca/screens/my/my_einvoice_detail_screen.dart';
import 'package:myca/screens/my/my_einvoice_list_screen.dart';

import 'my_support.dart';

Future<void> fillBusinessSale(WidgetTester tester, {String number = 'INV-2026-0200', String tin = 'C20880050010', String price = '500'}) async {
  await typeKey(tester, 'myCreate.number', number);
  await typeKey(tester, 'myCreate.buyerName', 'Syarikat Maju Jaya Sdn Bhd');
  await typeKey(tester, 'myCreate.buyerTin', tin);
  await typeKey(tester, 'myCreate.buyerId', '201901000005');
  await typeKey(tester, 'myCreate.buyerLine', '12 Jalan Tun Razak');
  await typeKey(tester, 'myCreate.buyerPostcode', '50400');
  await typeKey(tester, 'myCreate.buyerCity', 'Kuala Lumpur');
  await pickOption(tester, 'myCreate.buyerState', 'Wilayah Persekutuan Kuala Lumpur');
  await typeKey(tester, 'myCreate.line0.description', 'Website maintenance, October');
  await typeKey(tester, 'myCreate.line0.quantity', '2');
  await typeKey(tester, 'myCreate.line0.price', price);
  await pickOption(tester, 'myCreate.line0.taxType', 'Service tax');
  await typeKey(tester, 'myCreate.line0.rate', '8');
}

void main() {
  setUp(() => moneyCountry = 'MY');
  tearDown(() => moneyCountry = 'IN');

  testWidgets('a business e-invoice is checked, confirmed, sent to LHDN, validated and shared with its QR code', (tester) async {
    final api = MyTestApi();
    final shared = <String>[];
    final state = myState(api, share: (text) async {
      shared.add(text);
      return true;
    });
    await tester.pumpWidget(myApp(state, const MyEinvoiceCreateScreen()));
    await settle(tester);
    await fillBusinessSale(tester);
    await tapKey(tester, 'myCreate.check');
    expect(find.text('Ready to send'), findsOneWidget);
    expect(find.text('RM1,000.00'), findsOneWidget);
    expect(find.text('RM80.00'), findsOneWidget);
    expect(find.text('RM1,080.00'), findsOneWidget);
    await tapKey(tester, 'myCreate.send');
    expect(find.text('Send this e-invoice to LHDN?'), findsOneWidget);
    await tester.tap(find.byKey(const Key('myCreate.confirm')));
    await settle(tester);
    expect(api.calls.where((call) => call == 'propose:issue_my_einvoice'), hasLength(1));
    expect(find.text('e-Invoice INV-2026-0200'), findsOneWidget);
    expect(find.text('Valid'), findsOneWidget);
    expect(find.byKey(const Key('myDetail.qr')), findsOneWidget);
    expect(find.textContaining('You can cancel it for another 72 h 0 min'), findsOneWidget);
    await tapKey(tester, 'myDetail.share');
    expect(shared.single, startsWith('https://preprod.myinvois.hasil.gov.my/'));
    final sent = api.args['propose:issue_my_einvoice']!;
    expect((sent['buyer'] as Map)['tin'], 'C20880050010');
    expect(((sent['lines'] as List).single as Map)['taxRateBasisPoints'], 800);
    expect(((sent['lines'] as List).single as Map)['taxType'], '02');
  });

  testWidgets('an empty e-invoice and a bad buyer TIN are caught before anything is sent', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MyEinvoiceCreateScreen()));
    await settle(tester);
    await tapKey(tester, 'myCreate.check');
    expect(find.text('Enter the invoice number.'), findsOneWidget);
    expect(find.text('Enter the buyer name.'), findsOneWidget);
    expect(find.text('Describe what was sold.'), findsOneWidget);
    expect(find.text('Choose the state.'), findsOneWidget);
    expect(api.calls, isNot(contains('my_einvoice_check')));
    await fillBusinessSale(tester, tin: '12345');
    await tapKey(tester, 'myCreate.check');
    expect(find.textContaining('That is not an LHDN TIN'), findsOneWidget);
    expect(api.calls, isNot(contains('my_einvoice_check')));
  });

  testWidgets('LHDN rule problems from the check are listed with plain field names', (tester) async {
    final api = MyTestApi();
    api.books.malaysia.hasProfile = false;
    await tester.pumpWidget(myApp(myState(api), const MyEinvoiceCreateScreen()));
    await settle(tester);
    await fillBusinessSale(tester);
    await tapKey(tester, 'myCreate.send');
    expect(find.byKey(const Key('myCreate.problems')), findsOneWidget);
    expect(find.text('1 thing to fix before LHDN will accept it'), findsOneWidget);
    expect(find.textContaining('Your business: '), findsOneWidget);
    expect(api.calls, isNot(contains('propose:issue_my_einvoice')));
  });

  testWidgets('a network failure while sending keeps the preview and the retry sends it once', (tester) async {
    final api = MyTestApi()..failNext['confirm'] = 1;
    await tester.pumpWidget(myApp(myState(api), const MyEinvoiceCreateScreen()));
    await settle(tester);
    await fillBusinessSale(tester, number: 'INV-2026-0201');
    await tapKey(tester, 'myCreate.send');
    await tester.tap(find.byKey(const Key('myCreate.confirm')));
    await settle(tester);
    expect(find.textContaining('Cannot reach MyCA'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
    await tapKey(tester, 'myCreate.send');
    expect(api.calls.where((call) => call == 'propose:issue_my_einvoice'), hasLength(1));
    expect(api.confirms, 2);
    expect(find.text('e-Invoice INV-2026-0201'), findsOneWidget);
    expect(api.books.malaysia.einvoices.where((row) => row['number'] == 'INV-2026-0201'), hasLength(1));
  });

  testWidgets('tapping send twice opens one confirmation and sends one e-invoice', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MyEinvoiceCreateScreen()));
    await settle(tester);
    await fillBusinessSale(tester, number: 'INV-2026-0202');
    await tester.ensureVisible(find.byKey(const Key('myCreate.send')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('myCreate.send')));
    await tester.tap(find.byKey(const Key('myCreate.send')), warnIfMissed: false);
    await settle(tester);
    expect(find.byKey(const Key('myCreate.confirm')), findsOneWidget);
    await tester.tap(find.byKey(const Key('myCreate.confirm')));
    await settle(tester);
    expect(api.calls.where((call) => call == 'my_einvoice_check'), hasLength(1));
    expect(api.calls.where((call) => call == 'propose:issue_my_einvoice'), hasLength(1));
  });

  testWidgets('an invoice number already sent is refused with a plain message', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MyEinvoiceCreateScreen()));
    await settle(tester);
    await fillBusinessSale(tester, number: 'INV-2026-0141');
    await tapKey(tester, 'myCreate.send');
    await tester.tap(find.byKey(const Key('myCreate.confirm')));
    await settle(tester);
    expect(find.text('This invoice number was already sent to LHDN. Use a new number.'), findsOneWidget);
  });

  testWidgets('LHDN rejecting the submission shows what LHDN said', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MyEinvoiceCreateScreen()));
    await settle(tester);
    await fillBusinessSale(tester, number: 'REJECT-1');
    await tapKey(tester, 'myCreate.send');
    await tester.tap(find.byKey(const Key('myCreate.confirm')));
    await settle(tester);
    expect(find.text('Rejected'), findsOneWidget);
    expect(find.byKey(const Key('myDetail.errors')), findsOneWidget);
    expect(find.textContaining('DS302'), findsOneWidget);
    expect(find.byKey(const Key('myDetail.cancel')), findsNothing);
  });

  testWidgets('an e-invoice LHDN marks invalid lists its validation errors', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MyEinvoiceCreateScreen()));
    await settle(tester);
    await fillBusinessSale(tester, number: 'INV-2026-0203', tin: 'C12340000000');
    await tapKey(tester, 'myCreate.send');
    await tester.tap(find.byKey(const Key('myCreate.confirm')));
    await settle(tester);
    expect(find.text('Invalid'), findsOneWidget);
    expect(find.textContaining('CF321'), findsOneWidget);
    expect(find.byKey(const Key('myDetail.qr')), findsNothing);
  });

  testWidgets('a sale to the general public points to the monthly consolidated e-invoice', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MyEinvoiceCreateScreen()));
    await settle(tester);
    await tapKey(tester, 'myCreate.buyerKind.public');
    expect(find.textContaining('EI00000000010'), findsOneWidget);
    expect(find.byKey(const Key('myCreate.consolidated')), findsNothing);
    await tapKey(tester, 'myCreate.useConsolidated');
    expect(find.text('Monthly consolidated e-invoice'), findsOneWidget);
  });

  testWidgets('a foreign currency e-invoice needs the exchange rate and shows totals in that currency', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MyEinvoiceCreateScreen()));
    await settle(tester);
    await typeKey(tester, 'myCreate.number', 'EXP-0001');
    await tapKey(tester, 'myCreate.buyerKind.foreign');
    await typeKey(tester, 'myCreate.buyerName', 'Lion City Trading Pte Ltd');
    await typeKey(tester, 'myCreate.buyerCountry', 'SGP');
    await typeKey(tester, 'myCreate.buyerCity', 'Singapore');
    await pickOption(tester, 'myCreate.currency', 'USD');
    await typeKey(tester, 'myCreate.line0.description', 'Consulting');
    await typeKey(tester, 'myCreate.line0.price', '100');
    await tapKey(tester, 'myCreate.check');
    expect(find.text('Enter the exchange rate, more than zero.'), findsOneWidget);
    await typeKey(tester, 'myCreate.rate', '4.4');
    await tapKey(tester, 'myCreate.check');
    expect(find.text('USD 100.00'), findsNWidgets(2));
    final checked = api.args['my_einvoice_check']!;
    expect(checked['exchangeRate'], 4.4);
    expect((checked['buyer'] as Map)['tin'], 'EI00000000020');
    expect(((checked['buyer'] as Map)['address'] as Map)['country'], 'SGP');
  });

  testWidgets('a very large amount and a long buyer name are handled without breaking the layout', (tester) async {
    final api = MyTestApi();
    tester.view.physicalSize = const Size(320, 568);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(myApp(myState(api), const MyEinvoiceCreateScreen()));
    await settle(tester);
    await fillBusinessSale(tester, price: '9999999999');
    await typeKey(tester, 'myCreate.buyerName', 'Syarikat Perdagangan Antarabangsa Dan Perkhidmatan Logistik Bersepadu Malaysia Timur Sdn Bhd');
    await tapKey(tester, 'myCreate.check');
    expect(find.text('RM19,999,999,998.00'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await typeKey(tester, 'myCreate.line0.price', '999999999999');
    await tapKey(tester, 'myCreate.check');
    expect(find.text('That amount is too large.'), findsOneWidget);
  });

  testWidgets('a validated e-invoice is cancelled within 72 hours with a reason', (tester) async {
    final api = MyTestApi();
    final record = MyEinvoice.fromJson(api.books.malaysia.einvoices.first);
    await tester.pumpWidget(myApp(myState(api), MyEinvoiceDetailScreen(record: record)));
    await settle(tester);
    expect(find.text('You can cancel it for another 38 h 45 min.'), findsOneWidget);
    await tapKey(tester, 'myDetail.cancel');
    await tester.tap(find.byKey(const Key('myReason.submit')));
    await settle(tester);
    expect(find.text('Give the reason for cancelling.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('myReason.field')), 'Wrong quantity billed');
    await tester.tap(find.byKey(const Key('myReason.submit')));
    await settle(tester);
    expect(find.text('Cancelled'), findsOneWidget);
    expect(find.text('Cancelled at LHDN.'), findsOneWidget);
    expect(api.args['propose:cancel_my_einvoice'], {'uuid': record.uuid, 'reason': 'Wrong quantity billed'});
  });

  testWidgets('after 72 hours cancelling is off and a credit note is offered for the original', (tester) async {
    final api = MyTestApi();
    final record = MyEinvoice.fromJson(api.books.malaysia.einvoices.firstWhere((row) => row['number'] == 'INV-2026-0137'));
    await tester.pumpWidget(myApp(myState(api), MyEinvoiceDetailScreen(record: record)));
    await settle(tester);
    expect(find.byKey(const Key('myDetail.cancel')), findsNothing);
    expect(find.textContaining('72-hour cancel window has closed'), findsOneWidget);
    await tapKey(tester, 'myDetail.creditNote');
    expect(find.text('Credit note'), findsWidgets);
    final uuid = tester.widget<TextField>(find.byKey(const Key('myCreate.original'))).controller!.text;
    expect(uuid, record.uuid);
  });

  testWidgets('a received e-invoice can be rejected with a reason', (tester) async {
    final api = MyTestApi();
    final record = MyEinvoice.fromJson(api.books.malaysia.einvoices.firstWhere((row) => row['direction'] == 'received'));
    await tester.pumpWidget(myApp(myState(api), MyEinvoiceDetailScreen(record: record)));
    await settle(tester);
    expect(find.text('Supplier: Tenaga Pejabat Supplies Sdn Bhd'), findsOneWidget);
    await tapKey(tester, 'myDetail.cancel');
    await tester.enterText(find.byKey(const Key('myReason.field')), 'Goods not delivered');
    await tester.tap(find.byKey(const Key('myReason.submit')));
    await settle(tester);
    expect(find.text('Rejection asked'), findsOneWidget);
    expect(find.textContaining('stays valid until the supplier cancels it'), findsWidgets);
    expect(find.text('Reason given: Goods not delivered'), findsOneWidget);
    expect(api.args['propose:reject_my_einvoice'], {'uuid': record.uuid, 'reason': 'Goods not delivered'});
    expect(api.books.malaysia.einvoices.firstWhere((row) => row['direction'] == 'received')['status'], 'rejection requested');
  });

  testWidgets('a failed status check says so and can be tried again', (tester) async {
    final api = MyTestApi()..failNext['my_einvoice_status'] = 1;
    final record = MyEinvoice.fromJson(api.books.malaysia.einvoices.first);
    await tester.pumpWidget(myApp(myState(api), MyEinvoiceDetailScreen(record: record)));
    await settle(tester);
    await tapKey(tester, 'myDetail.refresh');
    expect(find.textContaining('Cannot reach MyCA'), findsOneWidget);
    await tapKey(tester, 'myDetail.refresh');
    expect(find.textContaining('Cannot reach MyCA'), findsNothing);
  });

  testWidgets('the list splits sent and received e-invoices', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MyEinvoiceListScreen()));
    await settle(tester);
    expect(find.text('INV-2026-0141'), findsOneWidget);
    expect(find.text('SUP-88231'), findsNothing);
    await tester.tap(find.text('Received'));
    await settle(tester);
    expect(find.text('SUP-88231'), findsOneWidget);
  });

  testWidgets('an invalid e-invoice opened from the list loads what LHDN said, and a received one is rejected from the list', (tester) async {
    final api = MyTestApi();
    await tester.pumpWidget(myApp(myState(api), const MyEinvoiceListScreen()));
    await settle(tester);
    expect(api.calls, containsAll(['my_einvoices', 'my_received_einvoices']));
    expect(find.text('RM13,500.00'), findsOneWidget);
    await tapKey(tester, 'myList.INV-2026-0139');
    expect(api.calls, contains('my_einvoice_details'));
    expect(find.textContaining('CF321'), findsOneWidget);
    await tester.pageBack();
    await settle(tester);
    await tester.tap(find.byKey(const Key('myList.receivedTab')));
    await settle(tester);
    expect(find.textContaining('can be rejected once, within 72 hours'), findsOneWidget);
    await tapKey(tester, 'myList.SUP-88231');
    expect(find.textContaining('You can reject it for another'), findsOneWidget);
    await tapKey(tester, 'myDetail.cancel');
    await tester.enterText(find.byKey(const Key('myReason.field')), 'Wrong price');
    await tester.tap(find.byKey(const Key('myReason.submit')));
    await settle(tester);
    expect(find.text('Rejection asked'), findsOneWidget);
    await tester.pageBack();
    await settle(tester);
    expect(find.text('Rejection asked'), findsOneWidget);
  });

  testWidgets('a new e-invoice starts from a choice of a buyer e-invoice or the monthly consolidated one', (tester) async {
    await tester.pumpWidget(myApp(myState(MyTestApi()), const MyEinvoiceListScreen()));
    await settle(tester);
    await tester.tap(find.byKey(const Key('myList.new')));
    await settle(tester);
    expect(find.text('Self-billed e-invoice'), findsOneWidget);
    await tester.tap(find.byKey(const Key('myNew.consolidated')));
    await settle(tester);
    expect(find.text('Monthly consolidated e-invoice'), findsOneWidget);
    await tester.pageBack();
    await settle(tester);
    await tester.tap(find.byKey(const Key('myList.new')));
    await settle(tester);
    await tester.tap(find.byKey(const Key('myNew.invoice')));
    await settle(tester);
    expect(find.text('New e-invoice'), findsWidgets);
  });

  testWidgets('without the list tool on the server the list shows e-invoices sent from this phone', (tester) async {
    final api = MyTestApi()..answer = (name, _) => const {'my_einvoices', 'my_received_einvoices'}.contains(name) ? {'ok': false, 'error': 'NOT_QUERYABLE'} : null;
    await tester.pumpWidget(myApp(myState(api), const MyEinvoiceListScreen()));
    await settle(tester);
    expect(find.textContaining('Showing e-invoices sent from this phone'), findsOneWidget);
    expect(find.text('No e-invoices sent yet.'), findsOneWidget);
  });

  testWidgets('the e-invoice form reads in Malay', (tester) async {
    await tester.pumpWidget(myApp(myState(MyTestApi()), const MyEinvoiceCreateScreen(), language: 'ms'));
    await settle(tester);
    expect(find.text('e-Invois baharu'), findsOneWidget);
    expect(find.text('Semak dengan peraturan LHDN'), findsOneWidget);
    await tapKey(tester, 'myCreate.check');
    expect(find.text('Masukkan nombor invois.'), findsOneWidget);
  });
}
