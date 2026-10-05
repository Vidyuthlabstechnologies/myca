import 'dart:io';

import 'package:myca/api/http_myca_api.dart';
import 'package:myca/api/models.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_config.dart';
import 'package:myca/attention.dart';
import 'package:myca/format.dart';
import 'package:myca/registers.dart';

var _failures = 0;

void check(String what, bool ok, [String detail = '']) {
  if (!ok) _failures += 1;
  stdout.writeln('${ok ? 'ok  ' : 'FAIL'} $what${detail.isEmpty ? '' : ' | $detail'}');
}

Future<void> previewThenDiscard(MycaApi api, String what, String tool, Map<String, Object?> args) async {
  final reply = await api.propose(tool, args);
  check('$what previews', reply.preview != null, reply.preview?.summary ?? reply.reply);
  await api.discard();
}

Future<void> main() async {
  final api = HttpMycaApi(AppConfig.fromEnvironment);
  final before = await api.snapshot();
  stdout.writeln('company: ${before.company.name} (${before.company.gstin})');
  stdout.writeln('sales: ${registerSubtitle(before.invoices, RegisterKind.sales)}');
  stdout.writeln('purchases: ${registerSubtitle(before.purchases, RegisterKind.purchases)}');

  final today = await loadToday(api);
  check('GST for the period loads', today.gst != null, today.gst == null ? '' : '${monthLabel(today.gst!.period)}: tax on sales ${rupees(today.gst!.outputTax.total)}');
  final file = toolData(await api.query('export_gstr1_json', {'fp': today.gst!.gstr1.fp}));
  check('the GSTR-1 file for that period can be fetched', file['fp'] == today.gst!.gstr1.fp && file['hash'] is String);
  check('deadlines load', today.deadlines.isNotEmpty, '${today.deadlines.length}');
  stdout.writeln('needs you: ${needsYou(today).map((e) => e.title).join(' / ')}');

  final sale = documentArgs(partyName: 'Live Check Kiran', partyGstin: '', description: '', amount: 8000, gstRate: 18);
  await previewThenDiscard(api, 'sale without GSTIN', 'create_invoice', sale);
  await previewThenDiscard(
    api,
    'purchase bill',
    'create_purchase',
    documentArgs(partyName: 'Live Check Supplier', partyGstin: '27AABCT1332L1ZE', description: 'Cloth', amount: 4000, gstRate: 5),
  );
  await previewThenDiscard(api, 'expense', 'post_expense', {'narration': 'Shop rent', 'amount': 15000, 'gstRate': 18});

  final unpaid = partiesOf(before.invoices).expand((p) => p.unpaid).toList();
  if (unpaid.isNotEmpty) {
    await previewThenDiscard(api, 'receipt', 'record_receipt', {'invoiceId': unpaid.first.id, 'amount': 1000, 'mode': 'cash'});
  }

  await previewThenDiscard(
    api,
    'bank statement import',
    'import_bank',
    {'documentSha256': await api.upload('bank.csv', 'Date,Narration,Withdrawal,Deposit,Balance\n01-08-2026,UPI test,100,,900\n'), 'type': 'csv'},
  );

  final noRate = await api.propose('create_invoice', {
    'partyName': 'Live Check Kiran',
    'partyGstin': '',
    'lines': [
      {'description': 'Supply', 'qty': 1, 'rate': 8000},
    ],
  });
  check('sale with no GST rate is not previewed', noRate.preview == null, noRate.reply.split('\n').first);

  final blockedQuery = ToolOutcome.fromJson(await api.query('seed_demo'));
  check('query refuses a tool that is not read-only', !blockedQuery.ok && blockedQuery.error == 'NOT_QUERYABLE');

  final refused = await api.propose('seed_demo', const {});
  check('non-previewed tool is refused', refused.blocked && refused.preview == null);

  final afterDiscards = await api.snapshot();
  check('nothing posted by previews', afterDiscards.invoices.length == before.invoices.length && afterDiscards.purchases.length == before.purchases.length);

  final held = await api.propose('create_invoice', sale);
  final ChatPreview? preview = held.preview;
  if (preview != null) {
    final posted = await api.confirm(preview.token);
    final replay = await api.confirm(preview.token);
    check('a repeated confirm replays instead of posting twice', replay.posted && replay.reply == posted.reply);
    check('confirmed sale posts', posted.posted, posted.reply);
    final after = await api.snapshot();
    final party = partyNamed(after.invoices, 'Live Check Kiran', '');
    check('posted sale appears under the customer', party.documents.length == 1, party.documents.isEmpty ? '' : lastEntryLine(party.latest!, RegisterKind.sales));
  }
  exit(_failures == 0 ? 0 : 1);
}
