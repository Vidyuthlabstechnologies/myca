import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';
import 'fake_cloud.dart';

const hostedLists = <String, Object?>{
  'expenses': [
    {
      'id': 'EXP-0001',
      'date': '2026-10-03',
      'head': '5110',
      'headName': 'Rent',
      'description': 'Shop rent for October',
      'payee': 'Mehta Estates',
      'supplierGstin': '',
      'mode': 'bank',
      'amount': 12000,
      'gstRate': 0,
      'taxable': 12000,
      'cgst': 0,
      'sgst': 0,
      'igst': 0,
      'inputCredit': false,
      'tag': {'source': 'chosen', 'why': 'You chose Rent.'},
      'transferIds': ['100004'],
    },
    {
      'id': 'EXP-0002',
      'date': '2026-10-04',
      'head': '5190',
      'headName': 'Office and stationery',
      'description': 'Printer cartridges',
      'payee': 'Ink House',
      'supplierGstin': '29ABCDE1234F1Z5',
      'mode': 'bank',
      'amount': 1180,
      'gstRate': 18,
      'taxable': 1000,
      'cgst': 90,
      'sgst': 90,
      'igst': 0,
      'inputCredit': true,
      'tag': {'source': 'chosen', 'why': 'You chose Office and stationery.'},
      'transferIds': ['100005', '100006', '100007'],
    },
  ],
  'creditNotes': [
    {
      'id': 'CN-0001',
      'date': '2026-10-06',
      'invoiceId': 'INV-0001',
      'invoiceDate': '2026-10-01',
      'partyName': 'Kiran Stores',
      'country': 'IN',
      'salesTax': 0,
      'partyGstin': '',
      'partyState': '29',
      'placeOfSupply': '29',
      'partyAccountId': '90001',
      'reason': 'Two chairs came back',
      'cancels': false,
      'lines': [
        {
          'description': 'Supply',
          'hsn': '',
          'qty': 0.13,
          'rate': 8000,
          'gstRate': 18,
          'taxable': 1000,
          'cgst': 90,
          'sgst': 90,
          'igst': 0,
          'amount': 1180,
        },
      ],
      'taxable': 1000,
      'cgst': 90,
      'sgst': 90,
      'igst': 0,
      'total': 1180,
      'transferIds': ['100008', '100009', '100010'],
    },
  ],
  'quotes': [
    {
      'id': 'QT-0001',
      'kind': 'quote',
      'date': '2026-10-05',
      'validUntil': '2026-11-04',
      'partyName': 'Kiran Stores',
      'partyGstin': '',
      'placeOfSupply': '29',
      'lines': [
        {
          'description': 'Chairs',
          'hsn': '',
          'qty': 10,
          'rate': 1500,
          'gstRate': 18,
          'taxable': 15000,
          'cgst': 1350,
          'sgst': 1350,
          'igst': 0,
          'amount': 17700,
        },
      ],
      'taxable': 15000,
      'cgst': 1350,
      'sgst': 1350,
      'igst': 0,
      'total': 17700,
      'status': 'open',
      'invoiceId': '',
    },
    {
      'id': 'DC-0001',
      'kind': 'challan',
      'reason': 'job-work',
      'date': '2026-10-07',
      'validUntil': '2026-11-06',
      'partyName': 'Rao Fabrication',
      'partyGstin': '',
      'placeOfSupply': '29',
      'lines': [
        {
          'description': 'Cutting jig',
          'hsn': '',
          'qty': 1,
          'rate': 5000,
          'gstRate': 18,
          'taxable': 5000,
          'cgst': 450,
          'sgst': 450,
          'igst': 0,
          'amount': 5900,
        },
      ],
      'taxable': 5000,
      'cgst': 450,
      'sgst': 450,
      'igst': 0,
      'total': 5900,
      'status': 'open',
      'invoiceId': '',
    },
  ],
  'customerTerms': {
    'name:kiran stores': 30,
    'gstin:24AAACG1234F1Z5': 45,
    'name:counter sales': 0,
  },
};

const hostedInvoice = <String, Object?>{
  'id': 'INV-0001',
  'date': '2026-10-01',
  'partyName': 'Kiran Stores',
  'partyGstin': '',
  'total': 9440,
  'status': 'posted',
};

http.Client hostedAnswering(FakeCloud cloud, Map<String, Object?> lists) {
  return MockClient((request) async {
    final forwarded = http.Request(request.method, request.url)
      ..headers.addAll(request.headers)
      ..bodyBytes = request.bodyBytes;
    final response = await http.Response.fromStream(
      await cloud.client.send(forwarded),
    );
    if (request.method != 'GET' || !request.url.path.endsWith('/snapshot')) {
      return response;
    }
    final body = (jsonDecode(response.body) as Map).cast<String, Object?>();
    return http.Response(
      jsonEncode({...body, ...lists}),
      response.statusCode,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
  });
}

Future<CloudSession> hostedSession(http.Client client) async {
  final session = CloudSession(
    baseUrl: 'https://api.example.test',
    tokens: MemoryTokenStore(),
    client: client,
  );
  await session.requestCode('9876543210');
  await session.verifyCode(FakeCloud.code);
  await session.createBusiness(name: 'Asha Traders', state: '29');
  return session;
}

void main() {
  test(
    'the hosted snapshot reaches the app with its expenses, credit notes, quotes and customer terms',
    () async {
      final cloud = FakeCloud()..invoices.add(hostedInvoice);
      final session = await hostedSession(hostedAnswering(cloud, hostedLists));
      final snapshot = await session.api.snapshot();

      expect(snapshot.expenses.map((e) => e.id), ['EXP-0001', 'EXP-0002']);
      expect(snapshot.expenses.first.title, 'Shop rent for October');
      expect(snapshot.expenses.first.headName, 'Rent');
      expect(snapshot.expenses.first.amount, 12000);
      expect(snapshot.expenses.last.gstRate, 18);
      expect(snapshot.expenses.last.inputCredit, isTrue);
      expect(snapshot.expenses.last.tagWhy, 'You chose Office and stationery.');

      expect(snapshot.creditNotes.single.invoiceId, 'INV-0001');
      expect(snapshot.creditNotes.single.total, 1180);
      expect(snapshot.invoices.single.owed, 9440);
      expect(snapshot.invoices.single.owedAfter(snapshot.creditNotes), 8260);

      expect(snapshot.quotes.map((q) => q.id), ['QT-0001', 'DC-0001']);
      expect(snapshot.quotes.map((q) => q.label), [
        'Quote',
        'Delivery challan',
      ]);
      expect(snapshot.quotes.last.reason, 'job-work');
      expect(snapshot.quotes.first.stateOn('2026-10-06'), 'open');
      expect(snapshot.quotes.first.stateOn('2026-11-05'), 'expired');

      expect(snapshot.termsFor('Kiran  Stores', ''), 30);
      expect(snapshot.termsFor('Anyone', '24aaacg1234f1z5'), 45);
      expect(snapshot.termsFor('Counter Sales', ''), 0);
      expect(snapshot.termsFor('Nobody', ''), isNull);
    },
  );

  test(
    'a hosted snapshot from a server that does not send the four lists still opens, empty',
    () async {
      final cloud = FakeCloud()..invoices.add(hostedInvoice);
      final session = await hostedSession(cloud.client);
      final snapshot = await session.api.snapshot();
      expect(snapshot.invoices.single.id, 'INV-0001');
      expect(snapshot.expenses, isEmpty);
      expect(snapshot.creditNotes, isEmpty);
      expect(snapshot.quotes, isEmpty);
      expect(snapshot.customerTerms, isEmpty);
      expect(snapshot.termsFor('Kiran Stores', ''), isNull);
    },
  );

  testWidgets(
    'hosted: Home and the Expenses register list the expenses instead of saying there are none',
    (tester) async {
      final cloud = FakeCloud()
        ..userName = 'Asha'
        ..invoices.add(hostedInvoice);
      final state = AppState(
        cloud: await hostedSession(hostedAnswering(cloud, hostedLists)),
        store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
        pickTextFile: (_) async => null,
        now: () => DateTime(2026, 10, 6, 10),
      );
      await tester.pumpWidget(MycaApp(state: state));
      await tester.pumpAndSettle();
      expect(find.text('No expenses yet'), findsNothing);
      expect(
        find.text('2 heads · Office and stationery: ₹1,180.00'),
        findsOneWidget,
      );

      await tapRow(tester, 'Expenses');
      expect(find.textContaining('No expenses yet'), findsNothing);
      expect(find.text('Office and stationery'), findsOneWidget);
      expect(find.text('Rent'), findsOneWidget);
      expect(
        find.text('1 entry · ₹12,000.00 · last 3 October 2026'),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'hosted: the customer chat shows the quote, the credit note and the customer\'s terms',
    (tester) async {
      final cloud = FakeCloud()
        ..userName = 'Asha'
        ..invoices.add(hostedInvoice);
      final state = AppState(
        cloud: await hostedSession(hostedAnswering(cloud, hostedLists)),
        store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
        pickTextFile: (_) async => null,
        now: () => DateTime(2026, 10, 6, 10),
      );
      await tester.pumpWidget(MycaApp(state: state));
      await tester.pumpAndSettle();
      await tapRow(tester, 'Sales');
      await tester.tap(find.text('Kiran Stores'));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(ActionChip, 'Terms: Net 30'), findsOneWidget);
      expect(find.text('Quote QT-0001'), findsOneWidget);
      expect(
        find.text('Credit note CN-0001 against INV-0001: Two chairs came back'),
        findsOneWidget,
      );
      expect(find.text('−₹1,180.00'), findsOneWidget);
    },
  );
}
