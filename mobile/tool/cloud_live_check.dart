import 'dart:io';

import 'package:myca/api/models.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/attention.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/format.dart';
import 'package:myca/registers.dart';

const cloudUrl = String.fromEnvironment('MYCA_CLOUD_URL', defaultValue: 'http://127.0.0.1:8080');
const otpLog = String.fromEnvironment('MYCA_DEV_OTP_LOG');

var _failures = 0;

void check(String what, bool ok, [String detail = '']) {
  if (!ok) _failures += 1;
  stdout.writeln('${ok ? 'ok  ' : 'FAIL'} $what${detail.isEmpty ? '' : ' | $detail'}');
}

Future<String> latestCode() async {
  await Future<void>.delayed(const Duration(milliseconds: 300));
  final lines = File(otpLog).readAsLinesSync().where((line) => line.contains('[dev otp]')).toList();
  return RegExp(r'-> (\d{6})').firstMatch(lines.last)!.group(1)!;
}

Future<CloudSession> signIn(String phone, TokenStore tokens, {bool agree = true}) async {
  final session = CloudSession(baseUrl: cloudUrl, tokens: tokens);
  await session.requestCode(phone);
  await session.verifyCode(await latestCode());
  if (agree && session.needsConsent) await session.acceptNotice(await session.privacyNotice());
  return session;
}

Future<ChatReply> post(MycaApi api, String tool, Map<String, Object?> args) async {
  final held = await api.propose(tool, args);
  if (held.preview == null) return held;
  return api.confirm(held.preview!.token);
}

Future<bool> refused(Future<Object?> Function() call) async {
  try {
    await call();
    return false;
  } on MycaApiException {
    return true;
  }
}

Future<void> main() async {
  final suffix = (DateTime.now().millisecondsSinceEpoch % 10000000).toString().padLeft(7, '0');
  final tokens = MemoryTokenStore();
  final asha = await signIn('987$suffix', tokens, agree: false);
  check('signed in by phone and code', asha.signedIn && !asha.ready);
  check('a new user is asked to accept the privacy notice', asha.needsConsent);
  check('nothing opens before the notice is accepted', await refused(() => asha.createBusiness(name: 'Too Early', state: '29')));
  final notice = await asha.privacyNotice();
  check('the notice loads', notice.sections.length >= 5, '${notice.version}: ${notice.title}');
  await asha.acceptNotice(notice);
  check('accepting the notice clears the gate', !asha.needsConsent);

  final states = await asha.states();
  check('state list loads', states.any((s) => s.code == '29' && s.name == 'Karnataka'), '${states.length} states');
  check('a bad GSTIN is refused', await refused(() => asha.createBusiness(name: 'Live Check', gstin: '27AABCU9603R1ZX')));
  await asha.createBusiness(name: 'Live Check Traders', state: '29');
  check('business created', asha.ready);

  final api = asha.api;
  final opening = await api.snapshot();
  check('new books are empty and named', opening.company.name == 'Live Check Traders' && opening.invoices.isEmpty);

  final today = await loadToday(api);
  check('taxes load', today.gst != null, today.gst == null ? '' : '${monthLabel(today.gst!.period)}: ${rupees(today.gst!.outputTax.total)}');
  stdout.writeln('needs you: ${needsYou(today).length}, coming up: ${comingUp(today).length}');

  final sale = documentArgs(partyName: 'Kiran Stores', partyGstin: '', description: '', amount: 8000, gstRate: 18);
  final held = await api.propose('create_invoice', sale);
  check('sale previews with engine figures', held.preview != null, held.preview?.summary ?? held.reply);
  final posted = await api.confirm(held.preview!.token);
  final replay = await api.confirm(held.preview!.token);
  check('confirmed sale posts once', posted.posted && replay.posted && replay.reply == posted.reply, posted.reply);
  final after = await api.snapshot();
  check('sale is in the books', after.invoices.length == 1 && after.invoices.single.total == 9440, lastEntryLine(after.invoices.single, RegisterKind.sales));
  final afterSale = (await loadToday(api)).gst;
  check('tax on sales for the period moved by the tax on the sale', afterSale != null && afterSale.outputTax.total - today.gst!.outputTax.total == 1440 && afterSale.salesCount == 1);

  final day = isoDate(DateTime.now());
  final invoiceId = after.invoices.single.id;
  final receipt = await post(api, 'record_receipt', {'invoiceId': invoiceId, 'amount': 4000, 'mode': 'bank', 'date': day});
  final partly = (await api.snapshot()).invoices.single;
  check('a part receipt is recorded against the invoice', receipt.posted && partly.status == 'partial' && partly.receipts.single.amount == 4000, receipt.reply);

  final unrated = await api.propose('create_invoice', {'partyName': 'Kiran Stores', 'lines': [{'description': 'Supply', 'qty': 1, 'rate': 500}]});
  check('a sale with no GST rate is not posted, and says why in plain words', unrated.preview == null && unrated.reply.startsWith('A GST rate is needed'), unrated.reply);
  if (unrated.preview != null) await api.discard();

  final bill = await post(api, 'create_purchase', documentArgs(partyName: 'Fabric Co', partyGstin: '', description: 'Grey cloth', amount: 10000, gstRate: 5, supplierInvoiceNo: 'FC-881'));
  final billed = (await api.snapshot()).purchases;
  check('a supplier bill is booked', bill.posted && billed.length == 1 && billed.single.total == 10500, bill.reply);
  final paid = await post(api, 'record_payment', {'billId': billed.single.id, 'mode': 'bank', 'date': day});
  final settled = (await api.snapshot()).purchases.single;
  check('the bill is paid in full from the bank', paid.posted && settled.paid && settled.owed == 0, paid.reply);

  final expense = await post(api, 'post_expense', {'narration': 'Office rent', 'amount': 12000, 'gstRate': 0, 'mode': 'bank', 'date': day, 'payee': 'Landlord'});
  check('an expense posts under a head', expense.posted, expense.reply.split('\n').first);

  final summary = businessSummaryFrom(await api.query('business_summary'));
  check('the dashboard shows what is owed both ways', summary != null && summary.owedToYou == 5440 && summary.owedBySuppliers == 0 && summary.current.expenses == 12000,
      summary == null ? 'no summary' : 'owed to you ${rupees(summary.owedToYou)}, you owe ${rupees(summary.owedBySuppliers)}, spent ${rupees(summary.current.expenses)}');
  final booksCheck = toolData(await api.query('books_check'));
  check('the books check runs', booksCheck.isNotEmpty);

  final noTds = await api.propose('create_purchase', {...documentArgs(partyName: 'Rao & Co', partyGstin: '', description: 'Audit fee', amount: 60000, gstRate: 18), 'tdsSection': '194J', 'tdsCategory': 'professional', 'payeePan': 'AAAFR1234K'});
  check('TDS is refused until the business is a deductor', noTds.preview == null && noTds.reply.contains('not set up to deduct TDS'));
  final deductor = await post(api, 'set_tds_deductor', {'tan': 'MUMA12345B'});
  check('the business is set up to deduct TDS', deductor.posted, deductor.reply);
  final fees = await api.propose('create_purchase', {...documentArgs(partyName: 'Rao & Co', partyGstin: '', description: 'Audit fee', amount: 60000, gstRate: 18), 'tdsSection': '194J', 'tdsCategory': 'professional', 'payeePan': 'AAAFR1234K'});
  check('a professional fee previews 10% TDS on the amount before GST', fees.preview?.figures['tds'] == 6000, fees.preview?.effects.last ?? fees.reply);
  final booked = await api.confirm(fees.preview!.token);
  check('the bill is booked net of TDS', booked.posted && booked.reply.contains('₹64,800.00 is owed'), booked.reply);
  final owed = toolData(await api.query('tds_summary'));
  check('the TDS summary shows what is still to deposit', owed['due'] == 6000, '${owed['due']}');
  final challan = await post(api, 'record_tds_deposit', {'challan': '0510308 05112026 12345', 'date': day});
  check('a TDS deposit clears what is due', challan.posted && toolData(await api.query('tds_summary'))['due'] == 0, challan.reply);

  check('an import with inline content is refused', await refused(() => api.propose('import_bank', {'content': 'x', 'type': 'csv'})));
  final statement = await api.upload('bank.csv', 'Date,Narration,Withdrawal,Deposit,Balance\n01-08-2026,UPI rent,100,,900\n02-08-2026,NEFT sale,,500,1400\n');
  final importHeld = await api.propose('import_bank', {'documentSha256': statement, 'type': 'csv'});
  check('an uploaded bank statement previews', importHeld.preview != null, importHeld.preview?.summary ?? importHeld.reply);
  final imported = await api.confirm(importHeld.preview!.token);
  check('the uploaded statement imports on confirm', imported.posted, imported.reply.split('\n').first);
  check('a non-previewed tool is refused', await refused(() => api.propose('seed_demo', const {})));

  final restarted = CloudSession(baseUrl: cloudUrl, tokens: tokens);
  await restarted.restore();
  check('a restart keeps the session', restarted.ready && (await restarted.api.snapshot()).invoices.length == 1);

  final bala = await signIn('986$suffix', MemoryTokenStore());
  check('another owner sees none of it', (await bala.businesses()).isEmpty);
  await bala.createBusiness(name: 'Other Stores', state: '27');
  final theirs = await bala.api.snapshot();
  check('their books are separate', theirs.invoices.isEmpty && theirs.company.name == 'Other Stores');

  await asha.setName('Asha');
  await asha.invite('985$suffix', 'accountant');
  final pendingForOwner = await asha.people();
  check('the owner sees the open invitation', pendingForOwner.invites.length == 1 && pendingForOwner.invites.single.role == 'accountant');
  check('an invalid number cannot be invited', await refused(() => asha.invite('12345', 'staff')));

  final ravi = await signIn('985$suffix', MemoryTokenStore());
  final raviMe = await ravi.me();
  check('the invited person sees it after signing in', raviMe.invitations.length == 1 && raviMe.invitations.single.invitedBy == 'Asha' && !ravi.ready);
  check('the uninvited owner sees no invitation', (await bala.me()).invitations.isEmpty);
  await ravi.respondToInvitation(raviMe.invitations.single.id, accept: true);
  final shared = await ravi.api.snapshot();
  check('after joining they open the same books', ravi.ready && shared.company.name == 'Live Check Traders' && shared.activeUser?.role == 'accountant');
  check('an accountant cannot invite', await refused(() => ravi.invite('984$suffix', 'staff')));

  final joined = (await asha.people()).members.firstWhere((m) => m.role == 'accountant');
  await asha.removeMember(joined.id);
  check('removal ends access at once', await refused(() => ravi.api.snapshot()));

  await asha.signOut();
  check('signing out ends the session on the server', await refused(() => restarted.api.snapshot()));
  exit(_failures == 0 ? 0 : 1);
}
