import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/us/us_prior_year_screen.dart';
import 'package:myca/screens/us/us_state_questions_screen.dart';
import 'package:myca/screens/us/us_state_residency_screen.dart';
import 'package:myca/screens/us/us_state_return_screen.dart';

import 'package:myca/screens/us/us_amended_screen.dart';
import 'package:myca/screens/us/us_form_editor_screen.dart';

import 'us_forms_screens_test.dart' show AmendApi, rentalKind, show;
import 'us_return_test.dart' show UsFakeApi, scrollTap, usState;
import 'us_state_book.dart';

const fixturePath = '../platform/test/fixtures/us-app-tool-calls.json';
const documentSha = 'f1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2';

class ContractApi extends UsFakeApi {
  @override
  Future<String> upload(String name, String content) async {
    uploads[documentSha] = content;
    return documentSha;
  }

  @override
  Future<ChatReply> confirm(String token) async {
    final reply = await super.confirm(token);
    for (final f in forms) {
      if ('${f['id']}'.startsWith('F')) f['id'] = 'usf-2025-${forms.indexOf(f) + 10}';
    }
    return reply;
  }
}

class ContractAmendApi extends AmendApi {
  @override
  Future<String> upload(String name, String content) async {
    uploads[documentSha] = content;
    return documentSha;
  }
}

final calls = <String, Map<String, Object?>>{};

Object? normalized(Object? value) {
  if (value is Map) {
    return {
      for (final entry in value.entries)
        '${entry.key}': switch ('${entry.key}') {
          'at' => '2026-03-02T10:00:00.000Z',
          'deviceId' => 'a' * 40,
          _ => normalized(entry.value),
        },
    };
  }
  if (value is List) return [for (final v in value) normalized(v)];
  return value;
}

void record(UsFakeApi api) {
  void keep(String tool, Map<String, Object?> args) {
    if (!(tool.contains('us_') || tool.contains('irs_'))) return;
    final shaped = {'tool': tool, 'args': normalized(args)};
    calls[jsonEncode(shaped)] = shaped;
  }

  for (final p in api.proposals) {
    keep(p.tool, p.args);
  }
  for (final q in api.queries) {
    keep(q.name, q.args);
  }
}

Future<void> open(WidgetTester tester, String key) => scrollTap(tester, find.byKey(Key(key)));

Future<void> type(WidgetTester tester, String key, String text) async {
  final field = find.byKey(Key(key));
  for (var i = 0; i < 12 && field.evaluate().isEmpty; i++) {
    await tester.drag(find.byType(Scrollable).first, Offset(0, i < 6 ? -150 : 150));
    await tester.pumpAndSettle();
  }
  await tester.ensureVisible(field);
  await tester.pumpAndSettle();
  await tester.enterText(field, text);
}

void main() {
  setUp(() => moneyCountry = 'US');
  tearDown(() => moneyCountry = 'IN');

  testWidgets('profile, forms, questions, review and signing with a refund', (tester) async {
    final api = ContractApi()..readResult = {'kind': '1099-INT', 'fields': {'payer': 'First Bank', 'interest': 42.17}};
    api.forms.add({'id': 'usf-2025-1', 'kind': 'W-2', 'payer': 'Acme', 'payerTin': '12-3456789', 'amounts': {'wages': 52000, 'federalWithheld': 6100}});
    api.forms.add({'id': 'usf-2025-2', 'kind': '1099-NEC', 'payer': 'Client', 'amounts': {'nonemployeeCompensation': 900}});
    await tester.pumpWidget(MycaApp(state: usState(api, pickAny: () async => PickedFile(name: 'int.jpg', bytes: Uint8List.fromList(const [1, 2, 3]), mime: 'image/jpeg'))));
    await tester.pumpAndSettle();

    await open(tester, 'usHub.step.profile');
    await tester.tap(find.byKey(const Key('usProfile.status.mfj')));
    await tester.pumpAndSettle();
    await type(tester, 'usProfile.you.first', 'Jordan');
    await type(tester, 'usProfile.you.last', 'Rivera');
    await type(tester, 'usProfile.you.ssn', '123456780');
    await type(tester, 'usProfile.you.birth', '07/04/1990');
    await type(tester, 'usProfile.you.occupation', 'Nurse');
    await type(tester, 'usProfile.spouse.first', 'Sam');
    await type(tester, 'usProfile.spouse.last', 'Rivera');
    await type(tester, 'usProfile.spouse.ssn', '987654320');
    await type(tester, 'usProfile.spouse.birth', '01/02/1991');
    await type(tester, 'usProfile.line1', '1 Market St');
    await type(tester, 'usProfile.city', 'San Francisco');
    await type(tester, 'usProfile.zip', '94105');
    await scrollTap(tester, find.byKey(const Key('usProfile.state')));
    await tester.tap(find.text('California').last);
    await tester.pumpAndSettle();
    await open(tester, 'usProfile.addDependent');
    await type(tester, 'usProfile.dependent0.first', 'Ava');
    await type(tester, 'usProfile.dependent0.last', 'Rivera');
    await type(tester, 'usProfile.dependent0.ssn', '123456781');
    await type(tester, 'usProfile.dependent0.birth', '05/05/2018');
    await scrollTap(tester, find.byKey(const Key('usProfile.dependent0.relationship')));
    await tester.tap(find.text('Daughter').last);
    await tester.pumpAndSettle();
    await type(tester, 'usProfile.dependent0.months', '12');
    await open(tester, 'usProfile.save');
    expect(api.confirmed, contains('set_us_taxpayer'));

    await open(tester, 'usHub.step.forms');
    await open(tester, 'usForms.form.usf-2025-1');
    await open(tester, 'usForm.save');
    await open(tester, 'usForms.scan');
    await open(tester, 'usForm.save');
    await tester.tap(find.byKey(const Key('usForms.menu.usf-2025-2')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usForms.confirmRemove')));
    await tester.pumpAndSettle();
    expect(api.confirmed.where((t) => t == 'add_us_tax_form').length, 2);
    expect(api.confirmed, contains('remove_us_tax_form'));
    await tester.pageBack();
    await tester.pumpAndSettle();

    await open(tester, 'usHub.step.interview');
    await tester.tap(find.byKey(const Key('usInterview.yes')));
    await tester.tap(find.byKey(const Key('usInterview.next')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('usInterview.amount')), '1500.25');
    await tester.tap(find.byKey(const Key('usInterview.next')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usInterview.done')));
    await tester.pumpAndSettle();

    await open(tester, 'usHub.step.review');
    await open(tester, 'usReview.pdf');
    await open(tester, 'usReview.sign');
    await tester.enterText(find.byKey(const Key('usSign.pin')), '24680');
    await tester.enterText(find.byKey(const Key('usSign.spousePin')), '13579');
    await tester.enterText(find.byKey(const Key('usSign.agi')), '48000');
    await tester.enterText(find.byKey(const Key('usSign.spouseAgi')), '48000');
    await tester.enterText(find.byKey(const Key('usSign.ipPin')), '123456');
    await tester.enterText(find.byKey(const Key('usSign.routing')), '021000021');
    await tester.enterText(find.byKey(const Key('usSign.account')), '000123456789');
    await open(tester, 'usSign.consent');
    await open(tester, 'usSign.sign');
    await open(tester, 'usSign.prepare');
    await open(tester, 'usSign.send');
    expect(api.confirmed, containsAll(['sign_us_return', 'file_us_return']));
    record(api);
  });

  testWidgets('signing when tax is owed, paid from the bank, with no return last year', (tester) async {
    final api = ContractApi()
      ..taxpayer = {'filingStatus': 'single'}
      ..owed = 812
      ..refund = 0;
    api.forms.add({'id': 'usf-2025-1', 'kind': 'W-2', 'payer': 'Acme', 'amounts': {'wages': 52000}});
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await open(tester, 'usHub.step.sign');
    await tester.enterText(find.byKey(const Key('usSign.pin')), '24680');
    await open(tester, 'usSign.filedLastYear');
    await tester.enterText(find.byKey(const Key('usSign.routing')), '021000021');
    await tester.enterText(find.byKey(const Key('usSign.account')), '000123456789');
    await tester.enterText(find.byKey(const Key('usSign.payDate')), '04/10/2026');
    await tester.enterText(find.byKey(const Key('usSign.phone')), '(415) 555-0123');
    await open(tester, 'usSign.consent');
    await open(tester, 'usSign.sign');
    expect(api.confirmed, ['sign_us_return']);
    record(api);
  });

  testWidgets('the e-file partner route and the prior-year import', (tester) async {
    final api = ContractApi()
      ..taxpayer = {'filingStatus': 'single'}
      ..route = 'partner';
    api.forms.add({'id': 'usf-2025-1', 'kind': 'W-2', 'payer': 'Acme', 'amounts': {'wages': 52000}});
    api.tools['import_us_prior_year'] = {'ok': true, 'data': {}};
    await tester.pumpWidget(MycaApp(state: usState(api, opened: <Uri>[])));
    await tester.pumpAndSettle();
    await open(tester, 'usHub.step.sign');
    await open(tester, 'usSign.partner');
    expect(api.confirmed, ['file_us_return']);
    record(api);

    final prior = ContractApi();
    await tester.pumpWidget(AppScope(state: usState(prior), child: const MaterialApp(home: UsPriorYearScreen(taxYear: 2025))));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('usPrior.agi')), '85000');
    await tester.enterText(find.byKey(const Key('usPrior.totalTax')), '9100.40');
    await open(tester, 'usPrior.bring');
    expect(prior.proposals.single.tool, 'import_us_prior_year');
    record(prior);
  });

  testWidgets('the amended return, a rental property and last year\'s PDF', (tester) async {
    final amend = AmendApi()..accepted = false;
    await show(tester, amend, const UsAmendedScreen(taxYear: 2025));
    await tester.enterText(find.byKey(const Key('usAmend.original.agi')), '-1200');
    await tester.enterText(find.byKey(const Key('usAmend.original.deduction')), '15000');
    await tester.enterText(find.byKey(const Key('usAmend.original.tax')), '0');
    await tester.enterText(find.byKey(const Key('usAmend.filedOn')), '04/01/2026');
    await scrollTap(tester, find.byKey(const Key('usAmend.original.status')));
    await tester.tap(find.text('Single').last);
    await tester.pumpAndSettle();
    await scrollTap(tester, find.byKey(const Key('usAmend.start')));
    await tester.enterText(find.byKey(const Key('usAmend.explanation')), 'Added a 1099-NEC that came after I filed.');
    await scrollTap(tester, find.byKey(const Key('usAmend.save')));
    expect(amend.confirmed, ['start_us_amended_return', 'set_us_amended_return']);
    record(amend);

    final rental = AmendApi();
    await show(tester, rental, const UsFormEditorScreen(taxYear: 2025, kind: rentalKind));
    await tester.enterText(find.byKey(const Key('usForm.payer')), '12 Oak St, Austin, TX 78701');
    await scrollTap(tester, find.byKey(const Key('usForm.propertyType')));
    await tester.tap(find.text('Single family residence').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('usForm.fairRentalDays')), '300');
    await tester.enterText(find.byKey(const Key('usForm.rents')), '18000');
    await scrollTap(tester, find.byKey(const Key('usForm.save')));
    expect(rental.confirmed, ['add_us_tax_form']);
    record(rental);

    final prior = ContractAmendApi();
    await show(tester, prior, const UsPriorYearScreen(taxYear: 2025), pickAny: () async => PickedFile(name: 'last-year.pdf', mime: 'application/pdf', bytes: Uint8List.fromList('%PDF-1.4'.codeUnits)));
    await scrollTap(tester, find.byKey(const Key('usPrior.pdf')));
    await tester.tap(find.byKey(const Key('usPrior.confirmPdf')));
    await tester.pumpAndSettle();
    record(prior);
  });

  testWidgets('state residency, a state\'s questions, its return and the filing hand-off', (tester) async {
    final api = ContractApi()
      ..taxpayer = {'filingStatus': 'single', 'address': {'state': 'NY'}}
      ..route = 'partner';
    api.forms.add({'id': 'usf-2025-1', 'kind': 'W-2', 'payer': 'Acme', 'amounts': {'wages': 52000, 'state': 'NJ', 'stateWages': 52000, 'stateWithheld': 1100}});
    final book = StateBook(assumed: true, questions: {'NY': [nyQuestions[0], nyQuestions[1], nyQuestions[2], nyQuestions[3]]})..attach(api);
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await scrollTap(tester, find.byKey(const Key('usHub.stateResidency')));
    expect(find.byType(UsStateResidencyScreen), findsOneWidget);
    await open(tester, 'usResidency.movedYes');
    await tester.enterText(find.descendant(of: find.byKey(const Key('usResidency.lived0.to')), matching: find.byType(TextField)), '03/31/2025');
    await tester.enterText(find.descendant(of: find.byKey(const Key('usResidency.lived1.from')), matching: find.byType(TextField)), '04/01/2025');
    await scrollTap(tester, find.byKey(const Key('usResidency.lived0.state.0')));
    await tester.tap(find.text('Connecticut').last);
    await tester.pumpAndSettle();
    await open(tester, 'usResidency.save');
    expect(book.saves.single.map((s) => s['residency']), ['part-year', 'part-year', 'nonresident']);
    record(api);

    final questions = ContractApi();
    final asked = StateBook(questions: {'NY': [nyQuestions[0], nyQuestions[1], nyQuestions[2], nyQuestions[3]]})..attach(questions);
    await tester.pumpWidget(AppScope(state: usState(questions), child: const MaterialApp(home: UsStateQuestionsScreen(taxYear: 2025, state: 'NY'))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Yes, all year'));
    await open(tester, 'usStateQuestions.next');
    await tester.enterText(find.byKey(const Key('usStateQuestions.count')), '12');
    await open(tester, 'usStateQuestions.next');
    await open(tester, 'usStateQuestions.no');
    await open(tester, 'usStateQuestions.next');
    await tester.enterText(find.byKey(const Key('usStateQuestions.amount')), '1200');
    await open(tester, 'usStateQuestions.next');
    expect(asked.saves.last.first['answers'], {'nycResident': 'full-year', 'nycMonths': 12, 'yonkersNonresidentWages': false, 'ny529Contributions': 1200});
    await open(tester, 'usStateQuestions.see');
    expect(find.byType(UsStateReturnScreen), findsOneWidget);
    record(questions);

    final signing = ContractApi()
      ..taxpayer = {'filingStatus': 'single'}
      ..route = 'partner';
    signing.forms.add({'id': 'usf-2025-1', 'kind': 'W-2', 'payer': 'Acme', 'amounts': {'wages': 52000}});
    StateBook().attach(signing);
    await tester.pumpWidget(const SizedBox());
    await tester.pumpWidget(MycaApp(state: usState(signing, opened: <Uri>[])));
    await tester.pumpAndSettle();
    await open(tester, 'usHub.step.sign');
    expect(find.byKey(const Key('usSign.states')), findsOneWidget);
    record(signing);
  });

  test('the recorded calls match the fixture the server suite checks against its schemas', () {
    final recorded = const JsonEncoder.withIndent('  ').convert(calls.values.toList()..sort((a, b) => jsonEncode(a).compareTo(jsonEncode(b))));
    final file = File(fixturePath);
    if (Platform.environment['UPDATE_US_TOOL_CALLS'] == '1' || !file.existsSync()) {
      file.parent.createSync(recursive: true);
      file.writeAsStringSync('$recorded\n');
    }
    expect(file.readAsStringSync().trim(), recorded, reason: 'The app now sends different US tool arguments. Run UPDATE_US_TOOL_CALLS=1 flutter test test/us_tool_contract_test.dart, then cd platform && node --test test/us-app-tool-calls.test.mjs.');
    final tools = {for (final c in calls.values) c['tool']};
    expect(tools, containsAll(['set_us_state_residency', 'us_state_returns', 'us_state_questions', 'us_state_coverage', 'us_state_filing_package', 'set_us_taxpayer', 'add_us_tax_form', 'remove_us_tax_form', 'answer_us_interview', 'sign_us_return', 'file_us_return', 'import_us_prior_year', 'us_return_status', 'us_efile_status', 'read_us_tax_document', 'start_us_amended_return', 'set_us_amended_return', 'us_amended_return']));
  });
}
