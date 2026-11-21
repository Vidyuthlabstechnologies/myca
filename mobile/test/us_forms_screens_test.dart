import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/us/us_amended_screen.dart';
import 'package:myca/screens/us/us_fields.dart';
import 'package:myca/screens/us/us_form_editor_screen.dart';
import 'package:myca/screens/us/us_interview_screen.dart';
import 'package:myca/screens/us/us_prior_year_screen.dart';
import 'package:myca/us/us_amended.dart';
import 'package:myca/us/us_return.dart';

import 'fake_api.dart' show Proposal, QueryCall;
import 'us_return_test.dart' show UsFakeApi, scrollTap, usState;

const rentalKind = UsFormKind('Rental property', 'Rental Property or Royalty (Schedule E)', 'One rental property or royalty source: rents, royalties, expenses, depreciation and passive loss details.', [
  UsFieldSpec('payer', 'Property address (street, city, state, ZIP) or royalty source', box: '1a', type: 'text', required: true),
  UsFieldSpec('propertyType', 'Type: 1 single family, 2 multi-family, 3 vacation/short-term, 4 commercial, 5 land, 6 royalties, 7 self-rental, 8 other', box: '1b', type: 'code'),
  UsFieldSpec('fairRentalDays', 'Days rented at a fair rental price', box: '2', type: 'days'),
  UsFieldSpec('personalUseDays', 'Days of personal use', box: '2', type: 'days'),
  UsFieldSpec('rents', 'Rents received (including any on a 1099-MISC)', box: '3'),
  UsFieldSpec('mortgageInterest', 'Mortgage interest paid to banks', box: '12'),
  UsFieldSpec('costBasis', 'Cost or other basis of the property, land included'),
  UsFieldSpec('placedInService', 'Date placed in service', type: 'date'),
  UsFieldSpec('recoveryClass', 'Building class: residential (27.5 years) or nonresidential (39 years)', type: 'code'),
  UsFieldSpec('activeParticipation', 'You actively participated (own 10% or more and make the management decisions)', type: 'yesno'),
]);

Map<String, Object?> startedAmendment({String explanation = '', List<Map<String, Object?>> checks = const []}) => {
      'started': true,
      'taxYear': '2025',
      'form': 'Form 1040-X (Rev. December 2025)',
      'source': 'myca',
      'lines': {
        '1': {'A': 52000, 'B': 900, 'C': 52900},
        '2': {'A': 15000, 'B': 0, 'C': 15000},
        '11': {'A': 4000, 'B': 198, 'C': 4198},
      },
      'lineText': {'1': 'Adjusted gross income', '2': 'Itemized deductions or standard deduction', '11': 'Total tax'},
      'refund': 0,
      'owed': 198,
      'appliedToNextYear': 0,
      'partI': null,
      'partII': explanation,
      'deadline': {'refundClaimBy': '2029-04-15'},
      'efile': {'allowedByIrs': true, 'reason': 'The IRS takes Form 1040-X electronically for 2025; MyCA does not transmit it yet, so print it or file it through a tax professional.'},
      'checks': checks,
      'corrected1040': {'errors': 0},
    };

class AmendApi extends UsFakeApi {
  bool started = false;
  bool accepted = true;
  String explanation = '';
  Map<String, Object?>? startArgs;
  Map<String, Object?>? setArgs;
  Map<String, Object?>? priorArgs;

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    if (name == 'us_amended_return') {
      queries.add(QueryCall(name, args));
      if (!started) return {'ok': true, 'data': {'taxYear': '2025', 'started': false, 'acceptedInMyca': accepted}};
      return {
        'ok': true,
        'data': startedAmendment(
          explanation: explanation,
          checks: [
            if (explanation.isEmpty) {'level': 'error', 'code': 'AMENDED_EXPLANATION_REQUIRED', 'message': 'Part II of Form 1040-X must say why you are amending each change.', 'fix': 'Write the explanation of changes.', 'step': 'amend'},
            {'level': 'warning', 'code': 'AMENDED_TAX_DUE', 'message': 'The amended return shows \$198 more to pay.', 'fix': '', 'step': 'amend'},
          ],
        ),
      };
    }
    return super.query(name, args);
  }

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async {
    if (name == 'start_us_amended_return') startArgs = args;
    if (name == 'set_us_amended_return') setArgs = args;
    if (name == 'import_us_prior_year') {
      proposals.add(Proposal(name, args));
      priorArgs = args;
      return ChatReply.fromJson({
        'reply': 'Bring 2024 into the 2025 return from last year\'s Form 1040 PDF.',
        'awaitingConfirmation': true,
        'preview': {
          'token': 'pdf-1',
          'summary': 'Bring 2024 into the 2025 return from last year\'s Form 1040 PDF.',
          'effects': ['A 2024 Form 1040 PDF for Jordan Rivera, SSN 6780. Check each figure against the PDF before you confirm.', 'Last year\'s AGI: \$85,000 (read from the PDF: form field line 11; high confidence)'],
        },
      });
    }
    return super.propose(name, args);
  }

  @override
  Future<ChatReply> confirm(String token) async {
    if (token == 'pdf-1') {
      confirmed.add('import_us_prior_year');
      return ChatReply.fromJson({
        'reply': 'Brought 2024 into your 2025 return.',
        'posted': true,
        'tools': [
          {
            'name': 'import_us_prior_year',
            'result': {
              'ok': true,
              'data': {
                'profileCopied': false,
                'source': 'pdf',
                'notes': const [],
                'expectedForms': const [],
                'pdf': {
                  'taxYear': '2024',
                  'filerName': 'Jordan Rivera',
                  'ssnLast4': '6780',
                  'found': {
                    'agi': {'value': 85000, 'where': 'form field line 11', 'confidence': 0.95},
                  },
                  'warnings': ['The name on the PDF (J Rivera) does not match the name on this return.'],
                },
              },
            },
          },
        ],
      });
    }
    final reply = await super.confirm(token);
    final last = confirmed.isEmpty ? '' : confirmed.last;
    if (last == 'start_us_amended_return') started = true;
    if (last == 'set_us_amended_return' && setArgs?['explanation'] is String) explanation = setArgs!['explanation'] as String;
    return reply;
  }
}

Future<void> show(WidgetTester tester, UsFakeApi api, Widget screen, {PickAnyFile? pickAny}) async {
  tester.view.physicalSize = const Size(800, 4000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(AppScope(state: usState(api, pickAny: pickAny), child: const MaterialApp(home: SizedBox())));
  tester.state<NavigatorState>(find.byType(Navigator)).push(MaterialPageRoute<void>(builder: (_) => screen));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => moneyCountry = 'US');
  tearDown(() => moneyCountry = 'IN');

  test('an amended return reads columns A, B and C and the lines that changed', () {
    final a = UsAmended.fromJson(startedAmendment());
    expect(a.started, isTrue);
    expect(a.changed.map((l) => l.line), ['1', '11']);
    expect(a.line('11')!.corrected, 4198);
    expect(a.owed, 198);
    expect(a.claimBy, '2029-04-15');
    expect(UsAmended.fromJson({'taxYear': '2025', 'started': false, 'acceptedInMyca': true}).acceptedInMyca, isTrue);
    expect(amendedOriginalArgs({'agi': 52000}, filingStatus: 'single', children: 1), {
      'original': {'agi': 52000},
      'originalFilingStatus': 'single',
      'originalDependents': {'children': 1, 'other': 0},
    });
  });

  test('a negative prior-year AGI is typed with a minus sign and sent as a negative number', () {
    expect(parseSignedDollars('-12,500'), -12500);
    expect(parseSignedDollars('4200.5'), 4200.5);
    expect(parseSignedDollars('-'), isNull);
    expect(parseDollars('-12500'), isNull);
    expect(priorYearArgs(2025, {'agi': '-4,200', 'totalTax': '-5'}), {
      'taxYear': '2025',
      'figures': {'agi': -4200},
    });
    expect(UsQuestion.fromJson({'id': 'priorYearAgi', 'kind': 'amount', 'negative': true}).negative, isTrue);
  });

  test('interview choices read as words, not codes', () {
    expect(optionLabel('careStudentOrDisabled', 'spouse'), 'My spouse');
    expect(optionLabel('careStudentOrDisabledMonths', '1'), '1 month');
    expect(optionLabel('careStudentOrDisabledMonths', '7'), '7 months');
    expect(optionLabel('itemize', 'auto'), 'Whichever saves more');
    expect(optionLabel('somethingElse', 'x'), 'x');
  });

  testWidgets('the hub offers an amended return only once the return is filed', (tester) async {
    final api = AmendApi()..taxpayer = {'filingStatus': 'single'};
    api.forms.add({'id': 'usf-2025-1', 'kind': 'W-2', 'payer': 'Acme', 'amounts': {'wages': 52000}});
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usHub.amend')), findsNothing);

    api.efile = 'accepted';
    await tester.pumpWidget(MycaApp(key: UniqueKey(), state: usState(api)));
    await tester.pumpAndSettle();
    await scrollTap(tester, find.byKey(const Key('usHub.amend')));
    expect(find.byKey(const Key('usAmend.title')), findsOneWidget);
    expect(find.byKey(const Key('usAmend.fromMyca')), findsOneWidget);
  });

  testWidgets('starting from the accepted return shows what changed, the amount owed and asks for the explanation', (tester) async {
    final api = AmendApi()..taxpayer = {'filingStatus': 'single'};
    await show(tester, api, const UsAmendedScreen(taxYear: 2025));
    await scrollTap(tester, find.byKey(const Key('usAmend.start')));
    expect(api.startArgs, {'taxYear': '2025'});
    expect(find.text('You owe the IRS more'), findsOneWidget);
    expect(find.text(dollars(198)), findsOneWidget);
    expect(find.byKey(const Key('usAmend.line.1')), findsOneWidget);
    expect(find.byKey(const Key('usAmend.line.2')), findsNothing);
    expect(find.byKey(const Key('usAmend.check.AMENDED_EXPLANATION_REQUIRED')), findsOneWidget);
    expect(find.textContaining('MyCA does not transmit it yet'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('usAmend.explanation')), 'Added a 1099-NEC from Client that came after I filed.');
    await scrollTap(tester, find.byKey(const Key('usAmend.save')));
    expect(api.setArgs, {'taxYear': '2025', 'explanation': 'Added a 1099-NEC from Client that came after I filed.'});
    expect(find.byKey(const Key('usAmend.check.AMENDED_EXPLANATION_REQUIRED')), findsNothing);
    expect(find.text('Ready to file.'), findsOneWidget);
  });

  testWidgets('a return filed elsewhere needs its original figures first', (tester) async {
    final api = AmendApi()..accepted = false;
    await show(tester, api, const UsAmendedScreen(taxYear: 2025));
    await scrollTap(tester, find.byKey(const Key('usAmend.start')));
    expect(api.startArgs, isNull);
    expect(find.text('Copy this from the return you filed.'), findsWidgets);

    await tester.enterText(find.byKey(const Key('usAmend.original.agi')), '52000');
    await tester.enterText(find.byKey(const Key('usAmend.original.deduction')), '15000');
    await tester.enterText(find.byKey(const Key('usAmend.original.tax')), '4000');
    await tester.enterText(find.byKey(const Key('usAmend.original.children')), '1');
    await tester.enterText(find.byKey(const Key('usAmend.filedOn')), '04/01/2026');
    await scrollTap(tester, find.byKey(const Key('usAmend.original.status')));
    await tester.tap(find.text('Single').last);
    await tester.pumpAndSettle();
    await scrollTap(tester, find.byKey(const Key('usAmend.start')));
    expect(api.startArgs, {
      'taxYear': '2025',
      'original': {'agi': 52000, 'deduction': 15000, 'tax': 4000},
      'originalFilingStatus': 'single',
      'originalDependents': {'children': 1, 'other': 0},
      'originalFiledOn': '2026-04-01',
    });
  });

  testWidgets('a rental property is entered with words for its type and class, and days as numbers', (tester) async {
    final api = AmendApi();
    await show(tester, api, const UsFormEditorScreen(taxYear: 2025, kind: rentalKind));
    expect(find.text('Tick it if this applies.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('usForm.payer')), '12 Oak St, Austin, TX 78701');
    await scrollTap(tester, find.byKey(const Key('usForm.propertyType')));
    await tester.tap(find.text('Single family residence').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('usForm.fairRentalDays')), '400');
    await tester.enterText(find.byKey(const Key('usForm.rents')), '18000');
    await tester.enterText(find.byKey(const Key('usForm.placedInService')), 'Various');
    await scrollTap(tester, find.byKey(const Key('usForm.save')));
    expect(find.text('Enter a whole number of days, up to 366.'), findsOneWidget);
    expect(find.text('Enter the date as MM/DD/YYYY.'), findsOneWidget);
    expect(api.proposals, isEmpty);

    await tester.enterText(find.byKey(const Key('usForm.fairRentalDays')), '300');
    await tester.enterText(find.byKey(const Key('usForm.placedInService')), '06/01/2019');
    await scrollTap(tester, find.byKey(const Key('usForm.recoveryClass')));
    await tester.tap(find.text('Residential rental (27.5 years)').last);
    await tester.pumpAndSettle();
    await scrollTap(tester, find.byKey(const Key('usForm.activeParticipation')));
    await scrollTap(tester, find.byKey(const Key('usForm.save')));
    final sent = api.proposals.single;
    expect(sent.tool, 'add_us_tax_form');
    expect(sent.args['kind'], 'Rental property');
    expect(sent.args['fields'], {
      'payer': '12 Oak St, Austin, TX 78701',
      'propertyType': '1',
      'fairRentalDays': 300,
      'rents': 18000,
      'placedInService': '2019-06-01',
      'recoveryClass': 'residential',
      'activeParticipation': true,
    });
  });

  testWidgets('last year\'s Form 1040 PDF is read, checked by the filer, then brought in', (tester) async {
    final api = AmendApi();
    await show(tester, api, const UsPriorYearScreen(taxYear: 2025), pickAny: () async => PickedFile(name: 'TurboTax 2024 Return.pdf', mime: 'application/pdf', bytes: Uint8List.fromList('%PDF-1.4'.codeUnits)));
    await scrollTap(tester, find.byKey(const Key('usPrior.pdf')));
    expect(api.uploads, hasLength(1));
    expect(api.priorArgs, {'taxYear': '2025', 'documentSha256': 'sha-TurboTax 2024 Return.pdf'});
    expect(find.textContaining('Check each figure against the PDF'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usPrior.confirmPdf')));
    await tester.pumpAndSettle();
    expect(api.confirmed, ['import_us_prior_year']);
    expect(find.byKey(const Key('usPrior.done')), findsOneWidget);
    expect(find.text('Read from your 2024 Form 1040 PDF'), findsOneWidget);
    expect(find.textContaining('Adjusted gross income: ${dollars(85000)}'), findsOneWidget);
    expect(find.textContaining('Check: The name on the PDF'), findsOneWidget);
  });

  testWidgets('a photo instead of the PDF is turned back before upload', (tester) async {
    final api = AmendApi();
    await show(tester, api, const UsPriorYearScreen(taxYear: 2025), pickAny: () async => PickedFile(name: '1040.jpg', mime: 'image/jpeg', bytes: Uint8List.fromList(const [1, 2, 3])));
    await scrollTap(tester, find.byKey(const Key('usPrior.pdf')));
    expect(api.uploads, isEmpty);
    expect(find.textContaining('Pick the PDF of your 2024 Form 1040'), findsOneWidget);
  });

  testWidgets('child care and education questions flow through the interview with readable choices', (tester) async {
    final questions = [
      {'id': 'careStudentOrDisabled', 'text': 'Was either of you a full-time student or unable to care for yourself during the year?', 'help': '', 'kind': 'choice', 'options': ['none', 'taxpayer', 'spouse']},
      {'id': 'careStudentOrDisabledMonths', 'text': 'For how many months was that spouse a full-time student?', 'help': '', 'kind': 'choice', 'options': [for (var m = 1; m <= 12; m++) '$m']},
      {'id': 'aotcFullTimeStudent', 'text': 'Were you a full-time student for at least part of 5 calendar months this year?', 'help': 'Form 8863 line 7.', 'kind': 'yesno'},
    ];
    final interview = _InterviewApi(questions);
    await show(tester, interview, const UsInterviewScreen(taxYear: 2025));
    expect(find.text('My spouse'), findsOneWidget);
    await tester.tap(find.text('My spouse'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usInterview.next')));
    await tester.pumpAndSettle();
    expect(find.text('3 months'), findsOneWidget);
    await tester.tap(find.text('3 months'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usInterview.next')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usInterview.yes')));
    await tester.tap(find.byKey(const Key('usInterview.next')));
    await tester.pumpAndSettle();
    expect(interview.answers, {'careStudentOrDisabled': 'spouse', 'careStudentOrDisabledMonths': '3', 'aotcFullTimeStudent': true});
    expect(find.byKey(const Key('usInterview.finished')), findsOneWidget);
  });
}

class _InterviewApi extends UsFakeApi {
  _InterviewApi(this.questions);

  final List<Map<String, Object?>> questions;

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    if (name == 'us_interview') {
      queries.add(QueryCall(name, args));
      return {
        'ok': true,
        'data': {
          'questions': [for (final q in questions) {...q, 'answer': answers[q['id']]}],
        },
      };
    }
    return super.query(name, args);
  }
}
