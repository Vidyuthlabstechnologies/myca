import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';

final env = Platform.environment;
final baseUrl = env['MYCA_SMOKE_URL'] ?? '';
final phone = env['MYCA_SMOKE_PHONE'] ?? '';
final code = env['MYCA_SMOKE_CODE'] ?? '';
final skip = baseUrl.isEmpty || phone.isEmpty || code.isEmpty ? 'Set MYCA_SMOKE_URL, MYCA_SMOKE_PHONE and MYCA_SMOKE_CODE to run the hosted smoke.' : null;

Future<ChatReply> _posted(MycaApi api, String tool, Map<String, Object?> args) async {
  final held = await api.propose(tool, args);
  expect(held.preview, isNotNull, reason: '$tool: ${held.reply}');
  final done = await api.confirm(held.preview!.token);
  expect(done.posted, isTrue, reason: '$tool: ${done.reply}');
  return done;
}

void main() {
  test(
    'the app saves and deletes a report, pays a counter bill by UPI and records an employee bank account through the hosted API',
    () async {
      final session = CloudSession(baseUrl: baseUrl, tokens: MemoryTokenStore());
      await session.requestCode(phone);
      await session.verifyCode(code);
      await session.checkConsent();
      if (session.needsConsent) await session.acceptNotice(await session.privacyNotice(), adult: true);
      final karnataka = (await session.states()).firstWhere((state) => state.name == 'Karnataka');
      await session.createBusiness(name: 'Contract ${DateTime.now().toUtc().millisecondsSinceEpoch}', state: karnataka.code);
      final api = session.api;
      try {
        await _posted(api, 'save_report', {'name': 'Owed by customer', 'metric': 'owed', 'groupBy': 'customer', 'period': 'this-month', 'compare': true});
        final listed = await api.query('list_reports');
        expect('$listed', contains('Owed by customer'));
        await _posted(api, 'delete_report', {'name': 'Owed by customer'});
        expect('${await api.query('list_reports')}', isNot(contains('Owed by customer')));

        final sale = await _posted(api, 'create_invoice', {
          'partyName': 'Walk-in customer',
          'lines': [
            {'description': 'Soap', 'sku': 'SOAP', 'qty': 1, 'rate': 100, 'gstRate': 18},
          ],
        });
        final invoice = sale.tools.firstWhere((tool) => tool['name'] == 'create_invoice')['result']['invoice'] as Map;
        await _posted(api, 'record_receipt', {'invoiceId': '${invoice['id']}', 'amount': invoice['total'], 'mode': 'upi', 'date': '${invoice['date']}'});
        final snapshot = await api.snapshot();
        expect(snapshot.invoices.single.status, 'paid');

        final hired = await _posted(api, 'add_employee', {
          'name': 'Ravi Kumar',
          'joinedOn': '2026-04-01',
          'components': [
            {'name': 'Basic', 'amount': 30000},
          ],
        });
        final employee = hired.tools.single['result']['employee'] as Map;
        await _posted(api, 'set_employee_bank', {'id': '${employee['id']}', 'bankAccount': '12345678901', 'ifsc': 'HDFC0001234'});
      } finally {
        await session.deleteBusiness();
        await session.signOut();
      }
    },
    skip: skip,
    timeout: const Timeout(Duration(minutes: 2)),
  );
}
