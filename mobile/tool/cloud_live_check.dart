import 'dart:io';

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

Future<CloudSession> signIn(String phone, TokenStore tokens) async {
  final session = CloudSession(baseUrl: cloudUrl, tokens: tokens);
  await session.requestCode(phone);
  await session.verifyCode(await latestCode());
  return session;
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
  final asha = await signIn('987$suffix', tokens);
  check('signed in by phone and code', asha.signedIn && !asha.ready);

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
