import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';

final env = Platform.environment;
final baseUrl = env['MYCA_SMOKE_URL'] ?? '';
final phone = env['MYCA_SMOKE_PHONE'] ?? '';
final secondPhone = env['MYCA_SMOKE_PHONE_2'] ?? '';
final code = env['MYCA_SMOKE_CODE'] ?? '';
final skip = baseUrl.isEmpty || phone.isEmpty || code.isEmpty ? 'Set MYCA_SMOKE_URL, MYCA_SMOKE_PHONE and MYCA_SMOKE_CODE to run the hosted smoke.' : null;
final skipSecond = skip ?? (secondPhone.isEmpty ? 'Set MYCA_SMOKE_PHONE_2 to a second test number to check isolation between accounts.' : null);

Future<CloudSession> signIn(String number) async {
  final session = CloudSession(baseUrl: baseUrl, tokens: MemoryTokenStore());
  final info = await session.serverInfo();
  expect(info, isNotNull);
  expect(info!.environment, isNot('production'));
  await session.requestCode(number);
  await session.verifyCode(code);
  expect(session.signedIn, isTrue);
  await session.checkConsent();
  if (session.needsConsent) await session.acceptNotice(await session.privacyNotice(), adult: true);
  return session;
}

Future<String> makeBusiness(CloudSession session, String name) async {
  final karnataka = (await session.states()).firstWhere((state) => state.name == 'Karnataka');
  await session.createBusiness(name: name, state: karnataka.code);
  return (await session.businesses()).firstWhere((b) => b.name == name).id;
}

Future<ChatReply> proposeSale(CloudSession session, {required String party, String gstin = '', required num rate}) async {
  final proposed = await session.api.propose('create_invoice', {
    'partyName': party,
    'partyGstin': gstin,
    'lines': [
      {'description': 'Smoke supply', 'qty': 1, 'rate': rate, 'gstRate': 18},
    ],
  });
  expect(proposed.preview, isNotNull, reason: proposed.reply);
  return proposed;
}

String stamp() => '${DateTime.now().toUtc().microsecondsSinceEpoch}';

void main() {
  CloudSession? owner;
  CloudSession? stranger;
  Future<CloudSession> first() async => owner ??= await signIn(phone);
  Future<CloudSession> second() async => stranger ??= await signIn(secondPhone);

  tearDownAll(() async {
    await owner?.signOut();
    await stranger?.signOut();
  });

  test(
    'B5: an invoice in one business is not visible after switching to another business',
    () async {
      final session = await first();
      final a = await makeBusiness(session, 'Smoke A ${stamp()}');
      final proposed = await proposeSale(session, party: 'Only In A', rate: 1000);
      expect((await session.api.confirm(proposed.preview!.token)).posted, isTrue);
      expect((await session.api.snapshot()).invoices.map((i) => i.partyName), contains('Only In A'));

      final b = await makeBusiness(session, 'Smoke B ${stamp()}');
      expect(b, isNot(a));
      final inB = await session.api.snapshot();
      expect(inB.invoices, isEmpty);

      await session.deleteBusiness();
      await session.switchBusiness(a);
      await session.deleteBusiness();
    },
    skip: skip,
    timeout: const Timeout(Duration(minutes: 2)),
  );

  test(
    'B5: another account cannot read or write a business it is not a member of',
    () async {
      final session = await first();
      final a = await makeBusiness(session, 'Smoke Owner ${stamp()}');
      final proposed = await proposeSale(session, party: 'Private Buyer', rate: 1000);
      expect((await session.api.confirm(proposed.preview!.token)).posted, isTrue);

      final other = await second();
      expect((await other.businesses()).map((b) => b.id), isNot(contains(a)));
      await other.switchBusiness(a);
      await expectLater(other.api.snapshot(), throwsA(isA<MycaApiException>()));
      await expectLater(
        other.api.propose('create_invoice', {
          'partyName': 'Intruder',
          'partyGstin': '',
          'lines': [
            {'description': 'x', 'qty': 1, 'rate': 1, 'gstRate': 18},
          ],
        }),
        throwsA(isA<MycaApiException>()),
      );

      final after = await session.api.snapshot();
      expect(after.invoices.map((i) => i.partyName), isNot(contains('Intruder')));
      expect(after.invoices, hasLength(1));
      await session.deleteBusiness();
    },
    skip: skipSecond,
    timeout: const Timeout(Duration(minutes: 2)),
  );

  test(
    'I1, I3 and I5: a same-state sale splits into CGST and SGST, an other-state sale is IGST only, a wrong GSTIN is refused',
    () async {
      final session = await first();
      await makeBusiness(session, 'Smoke GST ${stamp()}');

      final local = await proposeSale(session, party: 'Local Buyer', rate: 8000);
      expect((await session.api.confirm(local.preview!.token)).posted, isTrue);
      final gujarat = await proposeSale(session, party: 'Gujarat Buyer', gstin: '24AAACG1234F1ZA', rate: 10000);
      expect((await session.api.confirm(gujarat.preview!.token)).posted, isTrue);

      final wrongDigit = await session.api.propose('create_invoice', {
        'partyName': 'Typo Buyer',
        'partyGstin': '24AAACG1234F1Z5',
        'lines': [
          {'description': 'Smoke supply', 'qty': 1, 'rate': 1000, 'gstRate': 18},
        ],
      });
      expect(wrongDigit.preview, isNull);
      expect(wrongDigit.reply, contains('check digit'));

      final snapshot = await session.api.snapshot();
      expect(snapshot.invoices.firstWhere((i) => i.partyName == 'Local Buyer').total, 9440);
      expect(snapshot.invoices.firstWhere((i) => i.partyName == 'Gujarat Buyer').total, 11800);

      final today = await loadToday(session.api);
      final tax = today.gst!.outputTax;
      expect(tax.cgst, 720);
      expect(tax.sgst, 720);
      expect(tax.igst, 1800);
      expect(tax.total, 3240);

      await session.deleteBusiness();
    },
    skip: skip,
    timeout: const Timeout(Duration(minutes: 2)),
  );

  test(
    'X3 and I10: confirming the same preview twice, even at once, posts the invoice once',
    () async {
      final session = await first();
      await makeBusiness(session, 'Smoke Once ${stamp()}');

      final proposed = await proposeSale(session, party: 'Once Only', rate: 5000);
      final token = proposed.preview!.token;
      final results = await Future.wait([
        session.api.confirm(token).then<Object>((r) => r, onError: (Object e) => e),
        session.api.confirm(token).then<Object>((r) => r, onError: (Object e) => e),
      ]);
      final posted = results.whereType<ChatReply>().where((r) => r.posted).map((r) => r.reply).toSet();
      expect(posted, hasLength(1), reason: 'a retried confirm returns the first answer, not a second invoice');

      Object again;
      try {
        again = await session.api.confirm(token);
      } on MycaApiException catch (error) {
        again = error;
      }
      if (again is ChatReply && again.posted) expect(again.reply, posted.single);

      final snapshot = await session.api.snapshot();
      expect(snapshot.invoices.where((i) => i.partyName == 'Once Only'), hasLength(1));
      expect(snapshot.invoices.single.total, 5900);

      await session.deleteBusiness();
    },
    skip: skip,
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
