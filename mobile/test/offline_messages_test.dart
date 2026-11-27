import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/format.dart';
import 'package:myca/offline/gstin.dart';
import 'package:myca/offline/offline_billing.dart';
import 'package:myca/offline/offline_files.dart';
import 'package:myca/offline/offline_first_api.dart';
import 'package:myca/screens/offline_bills_screen.dart';

import 'offline_support.dart';

Map<String, Object?> sale({List<Map<String, Object?>>? lines}) => {
  'partyName': 'Walk-in customer',
  'lines': lines ?? [
    {'description': 'Parle-G 250g', 'qty': 2, 'rate': 25, 'gstRate': 18},
  ],
};

Future<(OfflineBilling, OfflineServer)> ready({OfflineServer? server}) async {
  final api = server ?? OfflineServer();
  final books = OfflineBilling(MemoryOfflineFiles(), now: () => DateTime(2026, 11, 21, 10, 30));
  await books.open('biz-1');
  await books.prepare(api, deviceName: 'Counter phone');
  return (books, api);
}

void main() {
  tearDown(() => formatLanguage = 'en');

  test('English is unchanged', () async {
    final (books, _) = await ready();
    expect(books.draftSale(sale(lines: const [])).problem, 'Add at least one item to the bill.');
    expect(gstinProblem('ABC'), 'A GSTIN has 15 characters; this one has 3.');
    expect(offlineProblemWords('NUMBER_TAKEN', ''), 'Another bill in your books already has this number.');
  });

  test('a bill that cannot be made explains why in Hindi and in Marathi', () async {
    final (books, _) = await ready();
    formatLanguage = 'hi';
    expect(books.draftSale(sale(lines: const [])).problem, 'बिल में कम से कम एक आइटम जोड़ें।');
    formatLanguage = 'mr';
    expect(books.draftSale(sale(lines: const [])).problem, 'बिलात किमान एक आयटम जोडा.');
    final (locked, _) = await ready(server: OfflineServer(lockThrough: '2026-11-30'));
    expect(locked.draftSale(sale()).problem, contains('लॉक'));
    formatLanguage = 'hi';
    final (composition, _) = await ready(server: OfflineServer(composition: true));
    expect(composition.draftSale(sale()).problem, contains('कंपोज़िशन'));
    expect(composition.draftSale(sale()).problem, contains('लाइन 1'));
  });

  test('a GSTIN problem names the numbers and says it in each language', () {
    formatLanguage = 'hi';
    expect(gstinProblem('ABC'), 'GSTIN में 15 अक्षर होते हैं; इसमें 3 हैं।');
    formatLanguage = 'mr';
    expect(gstinProblem('ABC'), 'GSTIN मध्ये 15 अक्षरे असतात; यात 3 आहेत.');
    expect(gstinProblem('00ABCDE1234F1Z5'), 'GSTIN 00 ने सुरू होतो, जो GST राज्य कोड नाही.');
  });

  test('the sync problem a customer sees is in their language, with the code kept for the unknown ones', () {
    formatLanguage = 'hi';
    expect(offlineProblemWords('PERIOD_LOCKED', ''), 'इस तारीख के लिए आपके खाते लॉक हैं।');
    expect(offlineProblemWords('SOMETHING_NEW', ''), 'MyCA ने यह एंट्री नहीं ली (SOMETHING_NEW)।');
    expect(offlineProblemWords('OVERPAYMENT', 'Only ₹10 is due.'), 'यह इनवॉइस पर बाकी रकम से ज़्यादा है। Only ₹10 is due.', reason: 'a server hint is shown as sent');
    formatLanguage = 'mr';
    expect(offlineProblemWords('NUMBER_TAKEN', ''), 'तुमच्या वह्यांमधील दुसऱ्या बिलाचा हाच नंबर आधीच आहे.');
  });

  test('with no connection, the preview, the saved message and the discard are in Hindi, with the figures intact', () async {
    final server = OfflineServer();
    final (books, _) = await ready(server: server);
    final api = OfflineFirstApi(server, books, business: () => 'biz-1', now: () => DateTime(2026, 11, 21, 10, 30));
    await api.snapshot();
    server.reachable = false;
    formatLanguage = 'hi';
    final preview = await api.propose('create_invoice', sale());
    expect(preview.preview!.summary, 'बिल INV-MA2627-0001, Walk-in customer के नाम: ₹50.00 + CGST ₹4.50 + SGST ₹4.50 = ₹59.00।');
    expect(preview.preview!.effects.single, contains('ऑनलाइन होते ही आपके बही-खाते में पहुँच जाएगा'));
    final posted = await api.confirm(preview.preview!.token);
    expect(posted.reply, 'INV-MA2627-0001 इस फ़ोन में सेव हुआ: ₹59.00। ऑनलाइन होते ही आपके बही-खाते में पहुँच जाएगा।');
    final again = await api.propose('create_invoice', sale());
    expect((await api.discard()).reply, 'रद्द किया। कुछ सेव नहीं हुआ।');
    expect(again.preview, isNotNull);
  });

  test('a receipt preview carries the invoice and a translated payment mode', () async {
    final server = OfflineServer();
    final (books, _) = await ready(server: server);
    final api = OfflineFirstApi(server, books, business: () => 'biz-1', now: () => DateTime(2026, 11, 21, 10, 30));
    await api.snapshot();
    server.reachable = false;
    formatLanguage = 'mr';
    final preview = await api.propose('record_receipt', {'invoiceId': 'INV-0040', 'amount': 500, 'mode': 'cash'});
    expect(preview.preview!.summary, 'INV-0040 साठी रोख ने ₹500.00 मिळाले.');
    expect(preview.preview!.effects.single, contains('पावती'));
  });

  test('what is saved with the bill and sent to the server stays in English whatever the language', () async {
    final (books, _) = await ready();
    formatLanguage = 'hi';
    final bill = await books.saveSale(sale());
    await books.voidBill(bill.ref, '');
    expect(books.bills.single.voided?['reason'], 'Cancelled at the counter');
  });

  test('the number and the amounts in a message are never lost to translation', () async {
    formatLanguage = 'hi';
    final (books, _) = await ready();
    final line = books.draftSale(sale(lines: [{'description': 'x', 'qty': 1, 'rate': 10}])).problem!;
    expect(line, contains('1'));
    formatLanguage = 'mr';
    expect(books.draftSale(sale(lines: [{'description': 'x', 'qty': 1, 'rate': 10}])).problem, 'ओळ 1 साठी GST दर हवा.');
    expect(() => throw const MycaApiException('x'), throwsA(isA<MycaApiException>()));
  });
}
