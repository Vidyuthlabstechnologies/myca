import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';

final env = Platform.environment;
final baseUrl = env['MYCA_SMOKE_URL'] ?? '';
final phone = env['MYCA_SMOKE_PHONE'] ?? '';
final code = env['MYCA_SMOKE_CODE'] ?? '';
final skip = baseUrl.isEmpty || phone.isEmpty || code.isEmpty ? 'Set MYCA_SMOKE_URL, MYCA_SMOKE_PHONE and MYCA_SMOKE_CODE to run the hosted smoke.' : null;

void main() {
  test(
    'the app signs in with a test number, makes a business, books a sale and reads it back on Today',
    () async {
      final session = CloudSession(baseUrl: baseUrl, tokens: MemoryTokenStore());

      final info = await session.serverInfo();
      expect(info, isNotNull);
      expect(info!.environment, isNot('production'));

      final methods = await session.methods();
      expect(methods.phone, isTrue);
      await session.requestCode(phone);
      await session.verifyCode(code);
      expect(session.signedIn, isTrue);

      await session.checkConsent();
      if (session.needsConsent) await session.acceptNotice(await session.privacyNotice(), adult: true);

      final stamp = DateTime.now().toUtc().millisecondsSinceEpoch;
      final karnataka = (await session.states()).firstWhere((state) => state.name == 'Karnataka');
      await session.createBusiness(name: 'Smoke $stamp', state: karnataka.code);
      final mine = await session.businesses();
      expect(mine.map((b) => b.name), contains('Smoke $stamp'));

      final proposed = await session.api.propose('create_invoice', {
        'partyName': 'Kiran Stores',
        'partyGstin': '',
        'lines': [
          {'description': 'Smoke supply', 'qty': 1, 'rate': 8000, 'gstRate': 18},
        ],
      });
      expect(proposed.preview, isNotNull, reason: proposed.reply);
      final confirmed = await session.api.confirm(proposed.preview!.token);
      expect(confirmed.posted, isTrue, reason: confirmed.reply);

      final snapshot = await session.api.snapshot();
      expect(snapshot.invoices.where((invoice) => invoice.partyName == 'Kiran Stores'), hasLength(1));
      expect(snapshot.invoices.single.total, 9440);

      final today = await loadToday(session.api);
      expect(today.gst, isNotNull);
      expect(today.gst!.salesCount, greaterThanOrEqualTo(1));

      await session.deleteBusiness();
      await session.signOut();
    },
    skip: skip,
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
