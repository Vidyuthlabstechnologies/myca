import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/offline/gstin.dart';
import 'package:myca/offline/invoice_math.dart';
import 'package:myca/offline/offline_billing.dart';
import 'package:myca/offline/offline_files.dart';
import 'package:myca/offline/offline_first_api.dart';
import 'package:myca/offline/offline_models.dart';

import 'offline_support.dart';

Map<String, Object?> sale({String party = 'Walk-in customer', String gstin = '', List<Map<String, Object?>>? lines}) => {
  'partyName': party,
  if (gstin.isNotEmpty) 'partyGstin': gstin,
  'lines': lines ?? [
    {'description': 'Parle-G 250g', 'qty': 2, 'rate': 25, 'gstRate': 18},
  ],
};

Future<(OfflineBilling, OfflineServer, MemoryOfflineFiles)> ready({DateTime? at, OfflineServer? server}) async {
  final files = MemoryOfflineFiles();
  final books = OfflineBilling(files, now: () => at ?? DateTime(2026, 11, 21, 10, 30));
  final api = server ?? OfflineServer();
  await books.open('biz-1');
  await books.prepare(api, deviceName: 'Counter phone');
  return (books, api, files);
}

void main() {
  group('GST maths matches the engine', () {
    test('every shared vector made by the engine gives the same figures to the paisa', () {
      final file = File('../platform/test/fixtures/offline-invoice-vectors.json');
      expect(file.existsSync(), isTrue, reason: 'run the platform vector script');
      final vectors = jsonDecode(file.readAsStringSync());
      final list = (vectors is Map ? vectors['vectors'] : vectors) as List;
      expect(list.length, greaterThan(100));
      for (final (index, raw) in list.indexed) {
        final vector = Map<String, dynamic>.from(raw as Map);
        final lines = [
          for (final line in vector['lines'] as List) BillLineInput(qty: (line as Map)['qty'] as num, rate: line['rate'] as num, gstRate: line['gstRate'] as num),
        ];
        final got = billFigures(lines, supplierState: '${vector['supplierState']}', placeOfSupply: '${vector['partyState']}');
        final expected = Map<String, dynamic>.from(vector['expected'] as Map);
        for (final key in const ['taxable', 'cgst', 'sgst', 'igst', 'total']) {
          expect(got.totals()[key], (expected[key] as num).toDouble(), reason: 'vector $index $key');
        }
        final expectedLines = expected['lines'] as List;
        for (final (n, line) in got.lines.indexed) {
          final want = Map<String, dynamic>.from(expectedLines[n] as Map);
          for (final key in const ['taxable', 'cgst', 'sgst', 'igst', 'tax', 'amount']) {
            expect(line.toJson()[key], (want[key] as num).toDouble(), reason: 'vector $index line $n $key');
          }
        }
      }
    });

    test('same state splits CGST and SGST, another state is IGST', () {
      final intra = billFigures(const [BillLineInput(qty: 3, rate: 33.33, gstRate: 18)], supplierState: '27', placeOfSupply: '27');
      expect(intra.totals(), {'taxable': 99.99, 'cgst': 9.0, 'sgst': 9.0, 'igst': 0.0, 'total': 117.99});
      final inter = billFigures(const [BillLineInput(qty: 3, rate: 33.33, gstRate: 18)], supplierState: '27', placeOfSupply: '29');
      expect(inter.totals(), {'taxable': 99.99, 'cgst': 0.0, 'sgst': 0.0, 'igst': 18.0, 'total': 117.99});
    });
  });

  group('GSTIN check', () {
    test('a good GSTIN passes and a bad check digit, state or PAN is caught', () {
      expect(gstinProblem('27AABCU9603R1ZN'), isNull);
      expect(gstinProblem(' 27aabcu9603r1zn '), isNull);
      expect(gstinProblem('27AABCU9603R1ZM'), contains('last character'));
      expect(gstinProblem('28AABCU9603R1ZN'), contains('state code'));
      expect(gstinProblem('27AAB1U9603R1ZN'), contains('PAN'));
      expect(gstinProblem('27AABCU9603R1Z'), contains('15 characters'));
      expect(gstinProblem(''), isNull);
    });
  });

  group('offline bills on the phone', () {
    test('the phone gets its own series and numbers bills one after another, kept across restarts', () async {
      final (books, api, files) = await ready();
      expect(books.ready, isTrue);
      expect(api.proposals, ['register_offline_device']);
      final first = await books.saveSale(sale());
      final second = await books.saveSale(sale(), payment: {'mode': 'upi'});
      expect(first.id, 'INV-MA2627-0001');
      expect(second.id, 'INV-MA2627-0002');
      expect(first.printed, {'taxable': 50.0, 'cgst': 4.5, 'sgst': 4.5, 'igst': 0.0, 'total': 59.0});
      expect(second.payment, {'amount': 59.0, 'mode': 'upi'});
      expect(first.ref, isNot(second.ref));

      final restarted = OfflineBilling(files, now: () => DateTime(2026, 11, 21, 11));
      await restarted.open('biz-1');
      expect(restarted.deviceId, books.deviceId);
      expect(restarted.bills.map((b) => b.id), ['INV-MA2627-0001', 'INV-MA2627-0002']);
      expect((await restarted.saveSale(sale())).id, 'INV-MA2627-0003');
    });

    test('a bill is on disk before saveSale returns', () async {
      final (books, _, files) = await ready();
      final before = files.writes;
      final bill = await books.saveSale(sale());
      expect(files.writes, before + 1);
      expect(files.files['books-biz-1.json'], contains(bill.id));
    });

    test('numbers continue after what the server already has and restart each financial year', () async {
      final server = OfflineServer()
        ..series = {
          'code': 'MB',
          'lastNumberByFy': {'2627': 41},
        };
      final (books, _, _) = await ready(server: server);
      expect((await books.saveSale(sale())).id, 'INV-MB2627-0042');
      final april = OfflineBilling(MemoryOfflineFiles(), now: () => DateTime(2027, 4, 1, 9));
      await april.open('biz-1');
      await april.prepare(server);
      expect((await april.saveSale(sale())).id, 'INV-MB2728-0001');
    });

    test('each business on the phone has its own outbox', () async {
      final (books, api, _) = await ready();
      await books.saveSale(sale());
      await books.open('biz-2');
      expect(books.bills, isEmpty);
      expect(books.kit, isNull);
      await books.open('biz-1');
      expect(books.bills.length, 1);
      expect(api.series, isNotNull);
    });

    test('what cannot be decided offline is refused with a reason', () async {
      final (books, _, _) = await ready();
      expect(books.draftSale({...sale(), 'exportSale': {'currency': 'USD'}}).problem, contains('Exports'));
      expect(books.draftSale(sale(lines: [{'description': 'Pan masala', 'qty': 1, 'rate': 100, 'gstRate': 28, 'cessRate': 60}])).problem, contains('Cess'));
      expect(books.draftSale(sale(lines: [{'description': 'Rice', 'qty': 1, 'rate': 100}])).problem, contains('GST rate'));
      expect(books.draftSale(sale(gstin: '27AABCU9603R1ZM')).problem, contains('last character'));
      expect(books.draftSale(sale(lines: [{'description': 'TV', 'qty': 1, 'rate': 60000, 'gstRate': 18}])).problem, contains('rule 46(e)'));
      expect(books.draftSale({...sale(party: 'Asha Rao', lines: [{'description': 'TV', 'qty': 1, 'rate': 60000, 'gstRate': 18}]), 'partyAddress': '12 Hill Road, Pune, Maharashtra'}).ok, isTrue);
      await expectLater(books.saveSale({...sale(), 'exportSale': {'currency': 'USD'}}), throwsA(isA<MycaApiException>()));
      expect(books.bills, isEmpty);
    });

    test('a locked month, composition and an e-invoice B2B sale are refused', () async {
      final (locked, _, _) = await ready(server: OfflineServer(lockThrough: '2026-11-30'));
      expect(locked.draftSale(sale()).problem, contains('locked'));
      final (composition, _, _) = await ready(server: OfflineServer(composition: true));
      expect(composition.draftSale(sale()).problem, contains('composition'));
      expect(composition.draftSale(sale(lines: [{'description': 'Rice', 'qty': 1, 'rate': 100, 'gstRate': 0}])).ok, isTrue);
      final (einvoice, _, _) = await ready(server: OfflineServer(einvoiceB2b: true));
      expect(einvoice.draftSale(sale(party: 'Gupta Traders', gstin: '29AAGCR4375J1ZU')).problem, contains('e-invoice'));
      expect(einvoice.draftSale(sale()).ok, isTrue);
    });

    test('a buyer from another state is charged IGST', () async {
      final (books, _, _) = await ready();
      final bill = await books.saveSale(sale(party: 'Gupta Traders', gstin: '29AAGCR4375J1ZU'));
      expect(bill.printed, {'taxable': 50.0, 'cgst': 0.0, 'sgst': 0.0, 'igst': 9.0, 'total': 59.0});
      expect(books.documentOf(bill)['placeOfSupply'], {'code': '29', 'name': 'Karnataka'});
    });

    test('items and customers are found without a connection', () async {
      final (books, _, _) = await ready();
      expect(books.findItem('8901063010031')?.sku, 'PARLE-G');
      expect(books.findItem('parle-g')?.price, 25);
      expect(books.findItem('000'), isNull);
      await books.saveItem(sku: 'maggi-70g', name: 'Maggi 70g', price: 14, gstRate: 12, barcode: '8901058000290');
      expect(books.findItem('8901058000290')?.name, 'Maggi 70g');
      expect(books.findParties('gupta').single.gstin, '29AAGCR4375J1ZU');
    });
  });

  group('sync', () {
    test('bills, receipts and items reach the books once, in order, and are marked synced', () async {
      final (books, server, _) = await ready();
      server.reachable = false;
      final bill = await books.saveSale(sale(), payment: {'mode': 'cash'});
      await books.saveReceipt({'invoiceId': 'INV-0040', 'amount': 500, 'mode': 'upi'});
      await books.saveItem(sku: 'MAGGI', name: 'Maggi', price: 14, gstRate: 12);
      expect(books.waitingCount, 3);
      final offline = await books.sync(server);
      expect(offline.reachedServer, isFalse);
      expect(books.online, isFalse);
      expect(books.waitingCount, 3);

      server.reachable = true;
      final outcome = await books.sync(server);
      expect(outcome.synced, 3);
      expect(books.waitingCount, 0);
      expect(books.online, isTrue);
      final batch = server.batches.single;
      expect(batch['deviceId'], books.deviceId);
      expect((batch['sales'] as List).single, containsPair('id', bill.id));
      expect((batch['sales'] as List).single, containsPair('payment', {'amount': 59.0, 'mode': 'cash'}));
      expect((batch['receipts'] as List).single, containsPair('invoiceId', 'INV-0040'));
      expect((batch['items'] as List).single, containsPair('sku', 'MAGGI'));
      expect(books.bills.single.status, EntryStatus.synced);
      expect(server.series!['lastNumberByFy'], {'2627': 1});
      expect(books.series!.lastNumberByFy['2627'], 1);
    });

    test('a reply lost after the server posted is sent again and comes back as already, never twice', () async {
      final (books, server, _) = await ready();
      await books.saveSale(sale());
      server.dropNextReply = true;
      final lost = await books.sync(server);
      expect(lost.reachedServer, isFalse);
      expect(books.bills.single.status, EntryStatus.waiting);
      expect(server.posted.length, 1);
      final again = await books.sync(server);
      expect(again.synced, 1);
      expect(server.posted.length, 1);
      expect(books.bills.single.status, EntryStatus.synced);
    });

    test('more than twenty entries go in several batches', () async {
      final (books, server, _) = await ready();
      for (var i = 0; i < 45; i++) {
        await books.saveSale(sale());
      }
      final outcome = await books.sync(server);
      expect(outcome.synced, 45);
      expect(server.batches.map((b) => (b['sales'] as List).length), [20, 20, 5]);
      expect(server.posted.keys.last, 'INV-MA2627-0045');
    });

    test('a receipt for a bill still in conflict waits for the bill', () async {
      final (books, server, _) = await ready();
      final bill = await books.saveSale(sale());
      server.conflictFor[bill.id] = {'status': 'conflict', 'error': 'FIGURES_DIFFER', 'engine': {'taxable': 50, 'cgst': 4.5, 'sgst': 4.5, 'igst': 0, 'total': 59.01}};
      await books.saveReceipt({'invoiceId': bill.id, 'amount': 20, 'mode': 'cash', 'date': '2026-11-22'});
      await books.sync(server);
      expect(books.bills.single.status, EntryStatus.conflict);
      expect(books.receipts.single.status, EntryStatus.waiting);
      expect(books.needsYouCount, 1);

      await books.acceptEngineFigures(bill.ref);
      expect(books.bills.single.total, 59.01);
      expect(books.bills.single.reprintNeeded, isTrue);
      await books.sync(server);
      expect(books.bills.single.status, EntryStatus.synced);
      expect(books.receipts.single.status, EntryStatus.synced);
      expect((server.batches[1]['sales'] as List).single, containsPair('acceptEngineFigures', true));
    });

    test('a payment taken the same day on an unsynced bill rides with the bill', () async {
      final (books, _, _) = await ready();
      final bill = await books.saveSale(sale());
      await books.saveReceipt({'invoiceId': bill.id, 'amount': 59, 'mode': 'card'});
      expect(books.receipts, isEmpty);
      expect(books.bills.single.payment, {'amount': 59, 'mode': 'card'});
      expect(books.receiptProblem({'invoiceId': bill.id, 'amount': 1}), contains('Only'));
    });

    test('a number already used elsewhere gets the next number on the phone', () async {
      final (books, server, _) = await ready();
      final bill = await books.saveSale(sale());
      server.posted[bill.id] = {'ref': 'someone-else'};
      await books.sync(server);
      expect(books.bills.single.status, EntryStatus.conflict);
      expect(books.bills.single.error, 'NUMBER_TAKEN');
      await books.renumber(bill.ref);
      expect(books.bills.single.id, 'INV-MA2627-0002');
      await books.sync(server);
      expect(books.bills.single.status, EntryStatus.synced);
    });

    test('a rejected bill keeps the engine\'s reason and can be tried again', () async {
      final server = OfflineServer();
      final (books, _, _) = await ready(server: server);
      await books.saveSale(sale());
      server.lockThrough = '2026-11-30';
      await books.sync(server);
      final held = books.bills.single;
      expect(held.status, EntryStatus.rejected);
      expect(held.error, 'PERIOD_LOCKED');
      expect(held.hint, 'Unlock the month first.');
      server.lockThrough = '';
      await books.retry(held.ref);
      await books.sync(server);
      expect(books.bills.single.status, EntryStatus.synced);
    });

    test('a receipt more than the server says is due comes back to be cut to what is due', () async {
      final (books, server, _) = await ready();
      server.reachable = false;
      final receipt = await books.saveReceipt({'invoiceId': 'INV-0040', 'amount': 1180, 'mode': 'cash'});
      expect(books.receiptProblem({'invoiceId': 'INV-0040', 'amount': 1}), contains('Only'));
      server
        ..reachable = true
        ..serverDue = 1000;
      await books.sync(server);
      expect(books.receipts.single.status, EntryStatus.conflict);
      expect(books.receipts.single.due, 1000);
      await books.changeReceipt(receipt.ref, 1000);
      await books.sync(server);
      expect(books.receipts.single.status, EntryStatus.synced);
      expect(books.receipts.single.amount, 1000);
    });

    test('a cancelled bill still syncs so the series has no gap', () async {
      final (books, server, _) = await ready();
      final bill = await books.saveSale(sale());
      expect(await books.voidBill(bill.ref, 'Customer changed mind'), isNull);
      await books.sync(server);
      final sent = (server.batches.single['sales'] as List).single as Map;
      expect(sent['voided'], containsPair('reason', 'Customer changed mind'));
      expect(await books.voidBill(bill.ref, 'again'), contains('credit note'));
    });
  });

  group('offline first api', () {
    test('online calls go to the server; without a connection a sale is previewed and saved on the phone', () async {
      final server = OfflineServer();
      final books = OfflineBilling(MemoryOfflineFiles(), now: () => DateTime(2026, 11, 21, 10, 30));
      final api = OfflineFirstApi(server, books, business: () => 'biz-1', now: () => DateTime(2026, 11, 21, 10, 30));
      await api.snapshot();
      await books.prepare(api);
      final online = await api.propose('create_invoice', sale());
      expect(online.preview!.token, startsWith('tok-'));
      await api.discard();

      server.reachable = false;
      final preview = await api.propose('create_invoice', sale());
      expect(preview.preview!.token, startsWith(offlineTokenPrefix));
      expect(preview.preview!.summary, 'Bill INV-MA2627-0001 to Walk-in customer: ₹50.00 + CGST ₹4.50 + SGST ₹4.50 = ₹59.00.');
      final posted = await api.confirm(preview.preview!.token);
      expect(posted.posted, isTrue);
      expect(posted.reply, contains('INV-MA2627-0001'));
      final invoice = posted.tools.single['result']['invoice'] as Map;
      expect(invoice['total'], 59.0);

      final document = await api.query('invoice_document', {'id': 'INV-MA2627-0001'});
      expect((document as Map)['data']['seller']['name'], 'Sharma Kirana');
      final item = await api.query('find_item', {'code': '8901063010031'});
      expect((item as Map)['data'], containsPair('price', 25));
      final cached = await api.snapshot();
      expect(cached.invoices.map((i) => i.id), containsAll(['INV-0040', 'INV-MA2627-0001']));

      final blocked = await api.propose('create_invoice', {...sale(), 'exportSale': {'currency': 'USD'}});
      expect(blocked.blocked, isTrue);
      expect(blocked.reply, contains('Exports'));
      await expectLater(api.chat('hello'), throwsA(isA<MycaApiException>()));
    });

    test('confirming a server preview never falls back to the phone, so a bill cannot be made twice', () async {
      final server = OfflineServer();
      final books = OfflineBilling(MemoryOfflineFiles());
      final api = OfflineFirstApi(server, books, business: () => 'biz-1');
      await books.open('biz-1');
      await books.prepare(api);
      final preview = await api.propose('create_invoice', sale());
      server.reachable = false;
      await expectLater(api.confirm(preview.preview!.token), throwsA(isA<MycaApiException>()));
      expect(books.bills, isEmpty);
    });
  });
}
