import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_config.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';
import 'package:myca/billing/store_billing.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/us/us_sign_screen.dart';
import 'package:myca/us/tin.dart';
import 'package:myca/us/us_filing_fee.dart';
import 'package:myca/us/us_return.dart';

import 'cloud_test.dart' show signedIn, sessionOn;
import 'fake_api.dart';
import 'fake_cloud.dart';

class FeeStore implements StoreBilling {
  final controller = StreamController<List<StorePurchase>>.broadcast();
  final bought = <String>[];
  final finished = <String>[];

  @override
  Stream<List<StorePurchase>> get purchases => controller.stream;
  @override
  Future<bool> available() async => true;
  @override
  Future<Map<String, StoreProduct>> products(Set<String> ids) async => {for (final id in ids) id: StoreProduct(id: id, price: '\$39.00')};
  @override
  Future<bool> buy(String productId, String accountId) async => false;
  @override
  Future<bool> buyOnce(String productId, String accountId) async {
    bought.add('$productId:$accountId');
    return true;
  }
  @override
  Future<void> restore(String accountId) async {}
  @override
  Future<void> finish(StorePurchase purchase) async => finished.add(purchase.token);
}

class FakeFees implements UsFilingFees {
  bool paid = false;
  final recorded = <String>[];

  @override
  String get accountId => 'biz-1';
  @override
  Future<UsFilingFee> status(int taxYear) async => UsFilingFee(taxYear: taxYear, enforced: true, paid: paid, priceUsd: 39, productId: 'myca_us_1040');
  @override
  Future<UsFilingFee> record(int taxYear, String productId, String purchaseToken) async {
    recorded.add('$taxYear:$productId:$purchaseToken');
    paid = true;
    return status(taxYear);
  }
}

class UsFakeApi implements MycaApi {
  final proposals = <Proposal>[];
  final confirmed = <String>[];
  final queries = <QueryCall>[];
  final uploads = <String, String>{};
  bool discarded = false;
  Map<String, Object?> taxpayer = {};
  final forms = <Map<String, Object?>>[];
  final answers = <String, Object?>{};
  List<Map<String, Object?>> checks = [];
  String efile = 'not_filed';
  String mode = 'sandbox';
  List<Map<String, Object?>> rejections = [];
  num refund = 1234.5;
  num owed = 0;
  Map<String, Object?> readResult = {};
  Map<String, Object?> signed = {};
  int _token = 0;
  final _pending = <String, Proposal>{};

  @override
  Future<Snapshot> snapshot() async => Snapshot.fromJson({
    'company': {'name': 'Jordan Rivera', 'gstin': '', 'country': 'US', 'entityType': 'household'},
    'invoices': const [],
    'purchases': const [],
    'expenses': const [],
    'users': const [
      {'userId': 'USR-ADMIN', 'name': 'Jordan', 'role': 'admin', 'locked': false},
    ],
    'activeUser': const {'userId': 'USR-ADMIN', 'name': 'Jordan', 'role': 'admin', 'locked': false},
  });

  @override
  Future<SignInResult> signIn(String userId, String pin) async => const SignInResult(ok: true, error: '');

  @override
  Future<void> signOut() async {}

  @override
  Future<ChatReply> chat(String message) async => ChatReply.fromJson({'reply': 'ok'});

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async {
    proposals.add(Proposal(name, args));
    if (name == 'file_us_return' && efile != 'signed') return ChatReply.fromJson({'reply': 'Sign the return first.', 'blocked': true});
    final token = 'tok-${_token++}';
    _pending[token] = Proposal(name, args);
    final summary = name == 'file_us_return' ? 'Send your 2025 Form 1040 to the IRS test system.' : 'Save $name.';
    return ChatReply.fromJson({
      'reply': summary,
      'awaitingConfirmation': true,
      'preview': {'token': token, 'summary': summary, 'effects': ['Nothing changes until you confirm.']},
    });
  }

  @override
  Future<ChatReply> confirm(String token) async {
    final p = _pending.remove(token);
    if (p == null) return ChatReply.fromJson({'reply': 'That preview expired.', 'blocked': true});
    confirmed.add(p.tool);
    final args = p.args;
    switch (p.tool) {
      case 'set_us_taxpayer':
        Map<String, Object?> masked(Object? person) {
          final p = Map<String, Object?>.from(person as Map);
          final ssn = '${p.remove('ssn') ?? ''}';
          if (ssn.isNotEmpty) p['ssnLast4'] = ssn.substring(5);
          return p;
        }
        taxpayer = {...args, 'taxpayer': masked(args['taxpayer']), if (args['spouse'] != null) 'spouse': masked(args['spouse'])};
      case 'add_us_tax_form':
        forms.removeWhere((f) => f['id'] == args['id']);
        forms.add({'id': args['id'] ?? 'F${forms.length + 1}', 'kind': args['kind'], 'payer': args['payer'], 'owner': args['owner'], 'amounts': args['fields'], 'source': 'manual'});
      case 'remove_us_tax_form':
        forms.removeWhere((f) => f['id'] == args['id']);
      case 'answer_us_interview':
        answers['${args['id']}'] = args['answer'];
      case 'sign_us_return':
        signed = args;
        efile = 'signed';
      case 'file_us_return':
        efile = 'submitted';
    }
    return ChatReply.fromJson({'reply': p.tool == 'sign_us_return' ? 'Signed with PIN. Refund to account ending 6789.' : 'Saved.', 'posted': true});
  }

  @override
  Future<ChatReply> discard() async {
    discarded = true;
    _pending.clear();
    return ChatReply.fromJson({'reply': 'Discarded.'});
  }

  Map<String, Object?> _ok(Map<String, Object?> data) => {'ok': true, 'data': data};

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    queries.add(QueryCall(name, args));
    switch (name) {
      case 'us_return_status':
        return _ok({
          'taxYear': args['taxYear'],
          'filingStatus': taxpayer['filingStatus'] ?? '',
          'steps': [
            {'id': 'profile', 'label': 'About you', 'done': taxpayer.isNotEmpty},
            {'id': 'forms', 'label': 'Tax documents', 'done': forms.isNotEmpty},
            {'id': 'interview', 'label': 'Questions', 'done': answers.length >= 2},
            {'id': 'review', 'label': 'Review', 'done': false},
            {'id': 'sign', 'label': 'Sign', 'done': efile != 'not_filed'},
          ],
          'refund': forms.isEmpty ? 0 : refund,
          'owed': forms.isEmpty ? 0 : owed,
          'readyToSign': checks.isEmpty,
        });
      case 'us_taxpayer':
        return _ok(taxpayer);
      case 'list_us_tax_forms':
        return _ok({'forms': forms});
      case 'us_form_kinds':
        return {'ok': false, 'error': 'UNKNOWN_TOOL'};
      case 'read_us_tax_document':
        return _ok(readResult);
      case 'us_interview':
        return _ok({
          'questions': [
            {'id': 'student', 'text': 'Were you a student in 2025?', 'help': 'Full-time for at least five months.', 'kind': 'yesno', 'answer': answers['student']},
            {'id': 'hsa', 'text': 'How much did you put in a health savings account?', 'kind': 'amount', 'answer': answers['hsa']},
          ],
        });
      case 'us_return_review':
        return _ok({
          'lines': [
            {'form': 'Form 1040', 'line': '1a', 'label': 'Wages', 'amount': 52000, 'source': 'W-2 from Acme Corp'},
            {'form': 'Form 1040', 'line': '25a', 'label': 'Federal tax withheld', 'amount': 6100, 'source': 'W-2 box 2'},
          ],
          'refund': refund,
          'owed': owed,
          'checks': checks,
        });
      case 'us_efile_status':
        return _ok({'status': efile, 'mode': mode, 'submissionId': efile == 'submitted' ? '00000020253150000001' : '', 'rejections': rejections});
      case 'us_return_pdf':
        return _ok({'base64': 'JVBERi0xLjQK'});
    }
    return {'ok': false, 'error': 'UNKNOWN_TOOL'};
  }

  @override
  Future<String> upload(String name, String content) async {
    uploads['sha-$name'] = content;
    return 'sha-$name';
  }

  @override
  Future<ToolOutcome> updateCompany({required String name, String gstin = ''}) async => const ToolOutcome(ok: true, error: '');
}

AppState usState(UsFakeApi api, {PickAnyFile? pickAny, List<(String, Uint8List)>? shared}) => AppState(
  api: api,
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => null,
  edition: 'US',
  pickAnyFile: pickAny ?? () async => null,
  pdf: PdfActions(share: (name, bytes) async {
    shared?.add((name, bytes));
    return true;
  }),
  now: () => DateTime(2026, 3, 2, 10),
);

Future<void> scrollTap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  tearDown(() => moneyCountry = 'IN');

  test('SSNs and ITINs are checked the way the SSA and IRS issue them', () {
    expect(tinKind('123-45-6780'), 'ssn');
    expect(tinKind('912-70-1234'), 'itin');
    expect(tinKind('666-12-3456'), isNull);
    expect(tinKind('123-00-4567'), isNull);
    expect(tinKind('912-49-1234'), isNull);
    expect(tinProblem(''), contains('Enter'));
    expect(tinProblem('', required: false), isNull);
    expect(tinProblem('1234'), contains('nine digits'));
    expect(tinProblem('000-12-3456'), contains('not a number'));
    expect(maskTin('123456780'), '***-**-6780');
    expect(maskTin('6780'), '***-**-6780');
    expect(maskTin('***-**-6780'), '***-**-6780');
    expect(formatTinTyping('1234567801'), '123-45-6780');
    expect(formatTinTyping('1234'), '123-4');
  });

  test('bank and address details are checked before anything is sent', () {
    expect(routingProblem('021000021'), isNull);
    expect(routingProblem('021000022'), contains('add up'));
    expect(routingProblem('991000021'), contains('US bank'));
    expect(accountProblem('12'), isNotNull);
    expect(maskAccount('000123456789'), '••••6789');
    expect(zipProblem('94107'), isNull);
    expect(zipProblem('94107-1234'), isNull);
    expect(zipProblem('9410'), isNotNull);
    expect(pinProblem('12345'), isNull);
    expect(pinProblem('00000'), isNotNull);
    expect(ipPinProblem(''), isNull);
    expect(ipPinProblem('12345'), isNotNull);
  });

  test('US dates read month first, and long dates follow the country', () {
    expect(usDate('2026-04-15'), '04/15/2026');
    expect(isoFromUsDate('4/15/2026'), '2026-04-15');
    expect(isoFromUsDate('02/30/2026'), isNull);
    expect(isoFromUsDate('2026-04-15'), isNull);
    moneyCountry = 'US';
    expect(longDate('2026-04-15'), 'April 15, 2026');
    moneyCountry = 'IN';
    expect(longDate('2026-04-15'), '15 April 2026');
  });

  test('a household is a US company with entityType household', () {
    expect(Company.fromJson({'name': 'J', 'gstin': '', 'country': 'US', 'entityType': 'household'}).household, isTrue);
    expect(Company.fromJson({'name': 'J', 'gstin': '', 'country': 'US'}).household, isFalse);
    expect(Company.fromJson({'name': 'J', 'gstin': '', 'entityType': 'household'}).household, isFalse);
  });

  test('the tax year being prepared is last year until November', () {
    expect(currentTaxYear(DateTime(2026, 3, 2)), 2025);
    expect(currentTaxYear(DateTime(2026, 11, 11)), 2026);
  });

  test('the store build decides the country: the us flavor is the US app, anything else is India', () {
    expect(editionFor('us', defined: ''), 'US');
    expect(editionFor('india', defined: ''), 'IN');
    expect(editionFor(null, defined: ''), 'IN');
    expect(editionFor(null, defined: 'US'), 'US');
    expect(AppState(api: UsFakeApi(), store: MemoryOnboardingStore(), pickTextFile: (_) async => null, edition: 'us').edition, 'US');
  });

  testWidgets('the US app opens on the US welcome and offers no switch to India', (tester) async {
    final state = AppState(api: UsFakeApi(), store: MemoryOnboardingStore(), pickTextFile: (_) async => null, edition: 'US');
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    expect(find.textContaining('Your taxes'), findsOneWidget);
    expect(find.textContaining('W-2'), findsOneWidget);
    expect(find.text('India'), findsNothing);
    await tester.tap(find.text('Get started'));
    await tester.pumpAndSettle();
    expect(state.welcomed, isTrue);
  });

  testWidgets('the India app opens on the India welcome with no US option', (tester) async {
    final state = AppState(api: UsFakeApi(), store: MemoryOnboardingStore(), pickTextFile: (_) async => null);
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    expect(find.textContaining('Your books'), findsOneWidget);
    expect(find.text('US'), findsNothing);
    expect(find.textContaining('1040'), findsNothing);
  });

  testWidgets('hosted US first run: a personal return makes a household and opens the 1040 hub', (tester) async {
    final cloud = FakeCloud();
    final tokens = MemoryTokenStore();
    final session = await signedIn(cloud, tokens);
    await session.setName('Jordan');
    final state = AppState(
      cloud: sessionOn(cloud, tokens),
      store: MemoryOnboardingStore(isWelcomed: true),
      pickTextFile: (_) async => null,
      now: () => DateTime(2026, 3, 2, 10),
      edition: 'US',
    );
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    expect(find.text('What would you like to do?'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usSetup.continue')));
    await tester.pumpAndSettle();
    expect(find.textContaining('first and last name'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('usSetup.first')), 'Jordan');
    await tester.enterText(find.byKey(const Key('usSetup.last')), 'Rivera');
    await tester.tap(find.byKey(const Key('usSetup.continue')));
    await tester.pumpAndSettle();
    expect(cloud.createdBodies.single, {'name': 'Jordan Rivera', 'country': 'US', 'kind': 'household'});
    expect(find.text('Your 2025 federal return'), findsOneWidget);
    expect(find.text('Where are your books today?'), findsNothing);
  });

  testWidgets('hosted US: a business owner gets US business books', (tester) async {
    final cloud = FakeCloud();
    final tokens = MemoryTokenStore();
    final session = await signedIn(cloud, tokens);
    await session.setName('Luna');
    final state = AppState(cloud: sessionOn(cloud, tokens), store: MemoryOnboardingStore(isWelcomed: true), pickTextFile: (_) async => null, now: () => DateTime(2026, 3, 2, 10), edition: 'US');
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    expect(find.text('Filing in India instead?'), findsNothing);
    await tester.tap(find.text('Keep books for my US business'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('usSetup.business')), 'Luna Bakery LLC');
    await tester.tap(find.byKey(const Key('usSetup.continue')));
    await tester.pumpAndSettle();
    expect(cloud.createdBodies.single, {'name': 'Luna Bakery LLC', 'country': 'US'});
  });

  testWidgets('About you: SSNs are checked, sent once as digits, then only the last four come back', (tester) async {
    final api = UsFakeApi();
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    expect(find.text('Your 2025 federal return'), findsOneWidget);
    expect(find.text('Add your tax forms to see your refund'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usHub.step.profile')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('usProfile.status.mfj')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('usProfile.you.first')), 'Jordan');
    await tester.enterText(find.byKey(const Key('usProfile.you.last')), 'Rivera');
    await tester.enterText(find.byKey(const Key('usProfile.you.ssn')), '666123456');
    await tester.enterText(find.byKey(const Key('usProfile.you.birth')), '07/04/1990');
    await tester.enterText(find.byKey(const Key('usProfile.spouse.first')), 'Sam');
    await tester.enterText(find.byKey(const Key('usProfile.spouse.last')), 'Rivera');
    await tester.enterText(find.byKey(const Key('usProfile.spouse.ssn')), '987654320');
    await tester.enterText(find.byKey(const Key('usProfile.spouse.birth')), '01/02/1991');
    await tester.enterText(find.byKey(const Key('usProfile.line1')), '1 Market St');
    await tester.enterText(find.byKey(const Key('usProfile.city')), 'San Francisco');
    await tester.enterText(find.byKey(const Key('usProfile.zip')), '94105');
    await scrollTap(tester, find.byKey(const Key('usProfile.state')));
    await tester.tap(find.text('California').last);
    await tester.pumpAndSettle();
    await scrollTap(tester, find.byKey(const Key('usProfile.save')));
    expect(find.textContaining('not a number the Social Security'), findsOneWidget);
    expect(api.proposals, isEmpty);

    await tester.enterText(find.byKey(const Key('usProfile.you.ssn')), '123456780');
    await scrollTap(tester, find.byKey(const Key('usProfile.save')));
    final args = api.proposals.single.args;
    expect(api.proposals.single.tool, 'set_us_taxpayer');
    expect(args['filingStatus'], 'mfj');
    expect((args['taxpayer'] as Map)['ssn'], '123456780');
    expect((args['taxpayer'] as Map)['dateOfBirth'], '1990-07-04');
    expect((args['spouse'] as Map)['ssn'], '987654320');
    expect((args['address'] as Map)['state'], 'CA');
    expect(api.confirmed, ['set_us_taxpayer']);

    expect(find.text('Your 2025 federal return'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usHub.step.profile')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Saved as ***-**-6780'), findsOneWidget);
    expect(find.textContaining('123456780'), findsNothing);
    await scrollTap(tester, find.byKey(const Key('usProfile.save')));
    expect(api.proposals.length, 2);
    expect((api.proposals.last.args['taxpayer'] as Map).containsKey('ssn'), isFalse, reason: 'a saved SSN is never sent back');
    expect((api.proposals.last.args['spouse'] as Map).containsKey('ssn'), isFalse);
  });

  testWidgets('Tax documents: a W-2 is typed in box by box, and a photo is read then checked before saving', (tester) async {
    final api = UsFakeApi()
      ..readResult = {
        'kind': '1099-INT',
        'fields': {'payer': 'First Bank', 'interest': 42.17},
      };
    await tester.pumpWidget(MycaApp(state: usState(api, pickAny: () async => PickedFile(name: 'int.jpg', bytes: Uint8List.fromList(const [1, 2, 3]), mime: 'image/jpeg'))));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usHub.step.forms')));
    await tester.pumpAndSettle();
    expect(find.textContaining('No forms yet'), findsOneWidget);

    await tester.tap(find.byKey(const Key('usForms.type')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usForms.kind.W-2')));
    await tester.pumpAndSettle();
    await scrollTap(tester, find.byKey(const Key('usForm.save')));
    expect(find.textContaining('box 1'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('usForm.payer')), 'Acme Corp');
    await tester.enterText(find.byKey(const Key('usForm.payerTin')), '123456789');
    await tester.enterText(find.byKey(const Key('usForm.wages')), '52,000');
    await tester.enterText(find.byKey(const Key('usForm.federalWithheld')), '6100.50');
    await scrollTap(tester, find.byKey(const Key('usForm.save')));
    final w2 = api.proposals.last;
    expect(w2.tool, 'add_us_tax_form');
    expect(w2.args['kind'], 'W-2');
    expect(w2.args['payer'], 'Acme Corp');
    expect((w2.args['fields'] as Map)['wages'], 52000);
    expect((w2.args['fields'] as Map)['federalWithheld'], 6100.5);
    expect((w2.args['fields'] as Map)['payerTin'], '12-3456789');
    expect(find.textContaining('W-2 · Acme Corp'), findsOneWidget);
    expect(find.textContaining('\$52,000.00'), findsOneWidget);

    await tester.tap(find.byKey(const Key('usForms.scan')));
    await tester.pumpAndSettle();
    expect(api.queries.where((q) => q.name == 'read_us_tax_document').single.args['documentId'], 'sha-int.jpg');
    expect(find.text('Add 1099-INT'), findsOneWidget);
    expect(find.textContaining('Check each box'), findsOneWidget);
    expect(find.text('42.17'), findsOneWidget);
    await scrollTap(tester, find.byKey(const Key('usForm.save')));
    expect(api.proposals.last.args['documentSha256'], 'sha-int.jpg');
    expect(api.forms.length, 2);

    await tester.tap(find.byKey(const Key('usForms.menu.F1')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usForms.confirmRemove')));
    await tester.pumpAndSettle();
    expect(api.forms.length, 1);
    expect(find.textContaining('Acme Corp'), findsNothing);
  });

  testWidgets('A few questions: one at a time, each answer saved before the next', (tester) async {
    final api = UsFakeApi();
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usHub.step.interview')));
    await tester.pumpAndSettle();
    expect(find.text('Were you a student in 2025?'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usInterview.next')));
    await tester.pumpAndSettle();
    expect(find.text('Choose an answer.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usInterview.yes')));
    await tester.tap(find.byKey(const Key('usInterview.next')));
    await tester.pumpAndSettle();
    expect(find.text('How much did you put in a health savings account?'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('usInterview.amount')), '1500');
    await tester.tap(find.byKey(const Key('usInterview.next')));
    await tester.pumpAndSettle();
    expect(find.text('That is everything'), findsOneWidget);
    expect(api.answers, {'student': true, 'hsa': 1500});
    expect(api.confirmed, ['answer_us_interview', 'answer_us_interview']);
  });

  testWidgets('Review: a blocking check stops signing and links to the fix; the PDF downloads', (tester) async {
    final shared = <(String, Uint8List)>[];
    final api = UsFakeApi()
      ..checks = [
        {'level': 'error', 'message': 'Your W-2 is missing box 2.', 'fix': 'Open the W-2 and add it.', 'step': 'forms'},
      ];
    await tester.pumpWidget(MycaApp(state: usState(api, shared: shared)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usHub.step.review')));
    await tester.pumpAndSettle();
    expect(find.text('\$1,234.50'), findsOneWidget);
    expect(find.text('Line 1a · Wages'), findsOneWidget);
    expect(find.text('W-2 from Acme Corp'), findsOneWidget);
    expect(find.text('Fix the items above to sign'), findsOneWidget);
    await scrollTap(tester, find.byKey(const Key('usReview.pdf')));
    expect(shared.single.$1, 'Form-1040-2025.pdf');
    await scrollTap(tester, find.text('Fix this'));
    expect(find.text('Tax documents'), findsOneWidget);
  });

  testWidgets('Sign and e-file: PIN, prior-year AGI and bank are checked, signing sends nothing, filing needs one more tap', (tester) async {
    final api = UsFakeApi()..taxpayer = {'filingStatus': 'single'};
    api.forms.add({'id': 'F1', 'kind': 'W-2', 'payer': 'Acme', 'amounts': {'wages': 52000}});
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    expect(find.text('\$1,234.50'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usHub.step.sign')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('usSign.pin')), '00000');
    await tester.enterText(find.byKey(const Key('usSign.routing')), '021000022');
    await scrollTap(tester, find.byKey(const Key('usSign.sign')));
    expect(find.text('Choose any five digits except 00000.'), findsOneWidget);
    expect(find.textContaining('does not add up'), findsOneWidget);
    expect(find.text('Tick the box to sign.'), findsOneWidget);
    expect(api.proposals, isEmpty);

    await tester.enterText(find.byKey(const Key('usSign.pin')), '24680');
    await tester.enterText(find.byKey(const Key('usSign.agi')), '48,000');
    await tester.enterText(find.byKey(const Key('usSign.routing')), '021000021');
    await tester.enterText(find.byKey(const Key('usSign.account')), '000123456789');
    await scrollTap(tester, find.byKey(const Key('usSign.consent')));
    await scrollTap(tester, find.byKey(const Key('usSign.sign')));
    expect(api.proposals.single.tool, 'sign_us_return');
    final args = api.proposals.single.args;
    expect(args['taxpayerPin'], '24680');
    expect(args['priorYear'], {'taxpayer': {'agi': 48000}});
    expect(args['consent8879'], true);
    expect(args['refund'], {'method': 'direct_deposit', 'routing': '021000021', 'account': '000123456789', 'accountType': 'checking'});
    expect(args.containsKey('spousePin'), isFalse);
    expect(api.efile, 'signed');

    expect(find.text('Signed. Ready to send.'), findsOneWidget);
    expect(find.textContaining('IRS test system'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usSign.prepare')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usSign.filingSummary')), findsOneWidget);
    expect(api.confirmed, ['sign_us_return'], reason: 'nothing is sent before the second tap');
    await tester.tap(find.byKey(const Key('usSign.send')));
    await tester.pumpAndSettle();
    expect(api.confirmed, ['sign_us_return', 'file_us_return']);
    expect(find.text('Sent to the IRS'), findsOneWidget);
    expect(find.textContaining('00000020253150000001'), findsOneWidget);
  });

  testWidgets('filing is held until that year\'s \$39 is paid on Google Play; then the file button appears', (tester) async {
    final api = UsFakeApi()..taxpayer = {'filingStatus': 'single'};
    api.forms.add({'id': 'F1', 'kind': 'W-2', 'payer': 'Acme', 'amounts': {'wages': 52000}});
    api.efile = 'signed';
    final fees = FakeFees();
    final store = FeeStore();
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    final year = currentTaxYear(DateTime.now());
    tester.state<NavigatorState>(find.byType(Navigator).first).push(MaterialPageRoute<void>(builder: (_) => UsSignScreen(taxYear: year, fees: fees, store: store)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usFee.card')), findsOneWidget);
    expect(find.textContaining('is \$39, paid once'), findsOneWidget);
    expect(find.byKey(const Key('usSign.prepare')), findsNothing, reason: 'no filing before the fee');
    await tester.tap(find.byKey(const Key('usFee.pay')));
    await tester.pumpAndSettle();
    expect(store.bought, ['myca_us_1040:biz-1']);
    store.controller.add([const StorePurchase(productId: 'myca_pro_monthly', token: 'not-mine', state: StorePurchaseState.purchased)]);
    await tester.pumpAndSettle();
    expect(fees.recorded, isEmpty, reason: 'a business plan purchase is left to Plan and billing');
    store.controller.add([const StorePurchase(productId: 'myca_us_1040', token: 'tok-1', state: StorePurchaseState.purchased, needsFinish: true)]);
    await tester.pumpAndSettle();
    expect(fees.recorded, ['$year:myca_us_1040:tok-1']);
    expect(store.finished, ['tok-1']);
    expect(find.byKey(const Key('usFee.card')), findsNothing);
    await tester.tap(find.byKey(const Key('usSign.prepare')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usSign.filingSummary')), findsOneWidget);
  });

  test('the filing fee reads from the server and is never due when billing is off', () {
    final due = UsFilingFee.fromJson({'taxYear': 2025, 'enforced': true, 'paid': false, 'priceUsd': 39, 'productId': 'myca_us_1040'}, 2025);
    expect(due.due, isTrue);
    expect(usFilingFeeLine(due), 'Filing your 2025 return with the IRS is \$39, paid once. Preparing, reviewing and downloading it stay free.');
    expect(UsFilingFee.fromJson({'enforced': false, 'paid': true}, 2025).due, isFalse);
    expect(UsFilingFee.fromJson({'enforced': true, 'paid': true}, 2025).due, isFalse);
  });

  testWidgets('Sign: someone who owes can pay from the bank on a date, and a joint return asks for both PINs', (tester) async {
    final api = UsFakeApi()
      ..taxpayer = {'filingStatus': 'mfj'}
      ..owed = 812
      ..refund = 0;
    api.forms.add({'id': 'F1', 'kind': 'W-2', 'payer': 'Acme', 'amounts': {'wages': 52000}});
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    expect(find.text('Estimated federal tax due'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usHub.step.sign')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('usSign.pin')), '24680');
    await tester.enterText(find.byKey(const Key('usSign.spousePin')), '13579');
    await scrollTap(tester, find.byKey(const Key('usSign.filedLastYear')));
    await tester.enterText(find.byKey(const Key('usSign.routing')), '021000021');
    await tester.enterText(find.byKey(const Key('usSign.account')), '000123456789');
    await tester.enterText(find.byKey(const Key('usSign.payDate')), '04/10/2026');
    await scrollTap(tester, find.byKey(const Key('usSign.consent')));
    await scrollTap(tester, find.byKey(const Key('usSign.sign')));
    expect(find.textContaining('10-digit US phone'), findsOneWidget);
    expect(api.proposals, isEmpty);
    await tester.enterText(find.byKey(const Key('usSign.phone')), '(415) 555-0123');
    await scrollTap(tester, find.byKey(const Key('usSign.sign')));
    final args = api.proposals.single.args;
    expect(args['spousePin'], '13579');
    expect(args['priorYear'], {'taxpayer': {'agi': 0}, 'spouse': {'agi': 0}});
    expect(args['payment'], {'method': 'direct_debit', 'routing': '021000021', 'account': '000123456789', 'accountType': 'checking', 'date': '2026-04-10', 'phone': '4155550123'});
    final device = args['device'] as Map;
    expect(device['deviceId'], matches(RegExp(r'^[0-9a-f]{40}$')));
    expect(device.containsKey('ipAddress'), isFalse, reason: 'the API takes the IP address from the request');
  });

  testWidgets('a rejected return says what the IRS found and opens the step that fixes it', (tester) async {
    final api = UsFakeApi()
      ..efile = 'rejected'
      ..rejections = [
        {'code': 'IND-031-04', 'message': 'Last year\'s AGI does not match IRS records.', 'fix': 'Check line 11 of last year\'s return.', 'step': 'sign'},
      ];
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    expect(find.textContaining('sent your return back'), findsOneWidget);
    expect(find.textContaining('AGI does not match'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usHub.fix.IND-031-04')));
    await tester.pumpAndSettle();
    expect(find.text('Sign and e-file'), findsWidgets);
    expect(find.byKey(const Key('usSign.pin')), findsOneWidget);
  });

  testWidgets('a US filer reads the US privacy notice, with the section 7216 promise, and accepts that version', (tester) async {
    final cloud = FakeCloud()..noticeAccepted = false;
    final tokens = MemoryTokenStore();
    await signedIn(cloud, tokens);
    final state = AppState(
      cloud: sessionOn(cloud, tokens),
      store: MemoryOnboardingStore(isWelcomed: true),
      pickTextFile: (_) async => null,
      now: () => DateTime(2026, 3, 2, 10),
      edition: 'US',
    );
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    expect(find.text('How MyCA uses your information (United States)'), findsOneWidget);
    expect(find.textContaining('7216'), findsOneWidget);
    await scrollTap(tester, find.text('I agree'));
    expect(cloud.consents, ['privacy@us-test']);
  });
}
