import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/us/us_form_editor_screen.dart';
import 'package:myca/screens/us/us_interview_screen.dart';
import 'package:myca/screens/us/us_review_screen.dart';
import 'package:myca/us/us_return.dart';

import 'us_return_test.dart' show UsFakeApi, scrollTap, usState;

class PolishApi extends UsFakeApi {
  Map<String, Object?>? priorYear;
  List<Map<String, Object?>>? questions;
  bool computed = true;
  bool profileDone = false;

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    final answer = await super.query(name, args);
    if (name == 'us_return_status' && answer is Map) {
      final data = Map<String, Object?>.from(answer['data'] as Map);
      if (priorYear != null) data['priorYear'] = priorYear;
      return {'ok': true, 'data': data};
    }
    if (name == 'us_interview' && questions != null) return {'ok': true, 'data': {'questions': questions}};
    if (name == 'us_return_review' && !computed) {
      return {
        'ok': true,
        'data': {
          'computed': false,
          'lines': const [],
          'refund': 0,
          'owed': 0,
          'checks': [
            {'level': 'error', 'message': 'Choose your filing status.', 'fix': '', 'step': 'profile'},
          ],
        },
      };
    }
    return answer;
  }
}

Widget editorHost(UsFakeApi api, Widget screen) => AppScope(
      state: usState(api),
      child: MaterialApp(
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: TextButton(
                key: const Key('host.open'),
                onPressed: () => Navigator.of(context).push(MaterialPageRoute<bool>(builder: (_) => screen)),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );

void main() {
  setUp(() => moneyCountry = 'US');
  tearDown(() => moneyCountry = 'IN');

  testWidgets('the hub says how many steps are done and opens the next one', (tester) async {
    final api = PolishApi();
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    expect(find.text('0 of 5 steps done'), findsOneWidget);
    expect(find.text('Start with step 1: About you'), findsOneWidget);
    await scrollTap(tester, find.byKey(const Key('usHub.continue')));
    expect(find.text('About you'), findsWidgets);
    expect(find.byKey(const Key('usProfile.save')), findsOneWidget);
    api.taxpayer = {'filingStatus': 'single'};
    api.forms.add({'id': 'F1', 'kind': 'W-2', 'payer': 'Acme', 'amounts': {'wages': 52000}});
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('2 of 5 steps done'), findsOneWidget);
    expect(find.text('Next, step 3 of 5: A few questions'), findsOneWidget);
    await scrollTap(tester, find.byKey(const Key('usHub.continue')));
    expect(find.byKey(const Key('usInterview.question')), findsOneWidget);
  });

  testWidgets('every field type the server sends gets the right input, and unknown boxes are kept', (tester) async {
    final api = UsFakeApi();
    const kind = UsFormKind('1099-B', '1099-B', 'Sales of shares', [
      UsFieldSpec('payer', 'Payer name', type: 'text', required: true),
      UsFieldSpec('payerTin', 'Payer TIN', type: 'ein'),
      UsFieldSpec('dateSold', 'Date sold', box: '1c', type: 'date'),
      UsFieldSpec('proceeds', 'Proceeds', box: '1d', required: true),
      UsFieldSpec('basisReportedToIrs', 'Basis reported to IRS', box: '12', type: 'yesno'),
      UsFieldSpec('box12', 'Box 12 codes', box: '12', type: 'code'),
      UsFieldSpec('distributionCode', 'Distribution code', box: '7', type: 'code'),
      UsFieldSpec('marketplacePercent', 'Share of the premium', box: '33', type: 'percent'),
    ]);
    final screen = UsFormEditorScreen(
      taxYear: 2025,
      kind: kind,
      id: 'F9',
      fields: const {
        'payer': 'Big Broker',
        'payerTin': '98-7654321',
        'dateSold': '2025-06-30',
        'proceeds': 1000,
        'basisReportedToIrs': true,
        'box12': [
          {'code': 'D', 'amount': 5000},
        ],
        'marketplacePercent': 40,
        'transactions': [
          {'proceeds': 1000},
        ],
      },
    );
    await tester.pumpWidget(editorHost(api, screen));
    await tester.tap(find.byKey(const Key('host.open')));
    await tester.pumpAndSettle();

    expect(find.text('06/30/2025'), findsOneWidget);
    expect(find.text('98-7654321'), findsOneWidget);
    expect(tester.widget<CheckboxListTile>(find.byKey(const Key('usForm.basisReportedToIrs'))).value, isTrue);
    expect(find.byKey(const Key('usForm.box12.0.code')), findsOneWidget);
    expect(find.text('40'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('usForm.distributionCode')), '7');
    await scrollTap(tester, find.byKey(const Key('usForm.box12.add')));
    await tester.enterText(find.byKey(const Key('usForm.box12.1.code')), 'w');
    await tester.enterText(find.byKey(const Key('usForm.box12.1.amount')), '1200');
    await scrollTap(tester, find.byKey(const Key('usForm.save')));

    final fields = api.proposals.single.args['fields'] as Map;
    expect(fields['dateSold'], '2025-06-30');
    expect(fields['basisReportedToIrs'], true);
    expect(fields['box12'], [
      {'code': 'D', 'amount': 5000},
      {'code': 'W', 'amount': 1200},
    ]);
    expect(fields['distributionCode'], '7');
    expect(fields['marketplacePercent'], 40);
    expect(fields['transactions'], [
      {'proceeds': 1000},
    ]);
    expect(fields['payerTin'], '98-7654321');
  });

  testWidgets('a bad date or a code without an amount says what to type', (tester) async {
    final api = UsFakeApi();
    const kind = UsFormKind('W-2', 'W-2', 'Wages', [
      UsFieldSpec('payer', 'Employer name', type: 'text', required: true),
      UsFieldSpec('dateAcquired', 'Date acquired', box: '1b', type: 'date'),
      UsFieldSpec('box12', 'Box 12 codes', box: '12', type: 'code'),
    ]);
    await tester.pumpWidget(editorHost(api, const UsFormEditorScreen(taxYear: 2025, kind: kind)));
    await tester.tap(find.byKey(const Key('host.open')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('usForm.payer')), 'Acme');
    await tester.enterText(find.byKey(const Key('usForm.dateAcquired')), '13/45/2025');
    await scrollTap(tester, find.byKey(const Key('usForm.box12.add')));
    await tester.enterText(find.byKey(const Key('usForm.box12.0.code')), 'DD');
    await scrollTap(tester, find.byKey(const Key('usForm.save')));
    expect(find.text('Enter the date as MM/DD/YYYY, or Various.'), findsOneWidget);
    expect(find.text('Each line needs the letter code, like D or DD, and its amount.'), findsOneWidget);
    expect(api.proposals, isEmpty);
    await tester.enterText(find.byKey(const Key('usForm.dateAcquired')), 'various');
    await tester.enterText(find.byKey(const Key('usForm.box12.0.amount')), '300');
    await scrollTap(tester, find.byKey(const Key('usForm.save')));
    final fields = api.proposals.single.args['fields'] as Map;
    expect(fields['dateAcquired'], 'VARIOUS');
    expect(fields['box12'], [
      {'code': 'DD', 'amount': 300},
    ]);
  });

  testWidgets('leaving a form with typed boxes asks first; Keep editing keeps them', (tester) async {
    final api = UsFakeApi();
    await tester.pumpWidget(editorHost(api, UsFormEditorScreen(taxYear: 2025, kind: formKindOf('1099-INT')!)));
    await tester.tap(find.byKey(const Key('host.open')));
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('host.open')), findsOneWidget, reason: 'nothing typed, so back just goes back');

    await tester.tap(find.byKey(const Key('host.open')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('usForm.interest')), '42');
    await tester.pump();
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Leave without saving?'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usLeave.stay')));
    await tester.pumpAndSettle();
    expect(find.text('42'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usLeave.leave')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('host.open')), findsOneWidget);
  });

  testWidgets('editing a saved form keeps the payer name and EIN the server lists beside the boxes', (tester) async {
    final api = UsFakeApi();
    api.forms.add({'id': 'F1', 'kind': '1099-INT', 'payer': 'First Bank', 'payerTin': '45-6789012', 'amounts': {'interest': 42}});
    api.taxpayer = {'filingStatus': 'single'};
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await scrollTap(tester, find.byKey(const Key('usHub.step.forms')));
    await scrollTap(tester, find.byKey(const Key('usForms.form.F1')));
    expect(find.text('First Bank'), findsOneWidget);
    expect(find.text('45-6789012'), findsOneWidget);
    await scrollTap(tester, find.byKey(const Key('usForm.save')));
    expect(api.proposals.single.args['payer'], 'First Bank');
  });

  testWidgets('a form kind the app does not know can still be opened and saved', (tester) async {
    final api = UsFakeApi();
    api.forms.add({'id': 'F1', 'kind': '1099-K', 'payer': 'Pay Co', 'amounts': {'grossAmount': 900, 'transactions': 3, 'note': 'x'}});
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await scrollTap(tester, find.byKey(const Key('usHub.step.forms')));
    await scrollTap(tester, find.byKey(const Key('usForms.form.F1')));
    expect(find.text('Edit 1099-K'), findsOneWidget);
    expect(find.text('Gross amount'), findsOneWidget);
    await scrollTap(tester, find.byKey(const Key('usForm.save')));
    final fields = api.proposals.single.args['fields'] as Map;
    expect(fields['grossAmount'], 900);
    expect(api.proposals.single.args['payer'], 'Pay Co');
  });

  testWidgets('questions: an unknown kind is a text answer, None answers zero, Back keeps what was typed', (tester) async {
    final api = PolishApi()
      ..questions = [
        {'id': 'care', 'text': 'Child care you paid', 'kind': 'amount'},
        {'id': 'provider', 'text': 'Who looked after them?', 'kind': 'provider_lookup'},
        {'id': 'plan', 'text': 'Which plan?', 'kind': 'dropdown', 'options': ['bronze', 'silver']},
      ];
    await tester.pumpWidget(AppScope(state: usState(api), child: const MaterialApp(home: UsInterviewScreen(taxYear: 2025))));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usInterview.next')));
    await tester.pumpAndSettle();
    expect(find.text('Enter an amount, or tap None if you had none.'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usInterview.none')));
    await tester.pumpAndSettle();
    expect(api.proposals.last.args['answer'], 0);

    expect(find.byKey(const Key('usInterview.text')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('usInterview.text')), 'Grandma');
    await tester.tap(find.byKey(const Key('usInterview.back')));
    await tester.pumpAndSettle();
    expect(find.text('Child care you paid'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usInterview.none')));
    await tester.pumpAndSettle();
    expect(find.text('Grandma'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usInterview.next')));
    await tester.pumpAndSettle();
    expect(api.proposals.last.args['answer'], 'Grandma');

    expect(find.byKey(const Key('usInterview.option.silver')), findsOneWidget);
    await tester.tap(find.byKey(const Key('usInterview.option.silver')));
    await tester.tap(find.byKey(const Key('usInterview.next')));
    await tester.pumpAndSettle();
    expect(api.proposals.last.args['answer'], 'silver');
    expect(find.text('That is everything'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usInterview.review')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usReview.result')), findsOneWidget);
  });

  testWidgets('a return that cannot be worked out yet says so instead of showing \$0', (tester) async {
    final api = PolishApi()..computed = false;
    await tester.pumpWidget(MaterialApp(home: AppScope(state: usState(api), child: const UsReviewScreen(taxYear: 2025))));
    await tester.pumpAndSettle();
    expect(find.text('Not worked out yet'), findsOneWidget);
    expect(find.text('\$0.00'), findsNothing);
    expect(find.text('Fix this'), findsOneWidget);
  });

  testWidgets('signing fills in last year\'s AGI brought in from the prior year, for both spouses after a joint year', (tester) async {
    final api = PolishApi()
      ..taxpayer = {'filingStatus': 'mfj'}
      ..priorYear = {'agi': 81250, 'joint': true};
    api.forms.add({'id': 'F1', 'kind': 'W-2', 'payer': 'Acme', 'amounts': {'wages': 52000}});
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await scrollTap(tester, find.byKey(const Key('usHub.step.sign')));
    expect(tester.widget<TextField>(find.descendant(of: find.byKey(const Key('usSign.agi')), matching: find.byType(TextField))).controller!.text, '81250');
    expect(tester.widget<TextField>(find.descendant(of: find.byKey(const Key('usSign.spouseAgi')), matching: find.byType(TextField))).controller!.text, '81250');
    expect(find.text('From your 2024 return in MyCA. Check it against line 11.'), findsNWidgets(2));

    await tester.enterText(find.byKey(const Key('usSign.pin')), '24680');
    await tester.enterText(find.byKey(const Key('usSign.spousePin')), '13579');
    await tester.enterText(find.byKey(const Key('usSign.routing')), '021000021');
    await tester.enterText(find.byKey(const Key('usSign.account')), '000123456789');
    await scrollTap(tester, find.byKey(const Key('usSign.consent')));
    await scrollTap(tester, find.byKey(const Key('usSign.sign')));
    expect(api.proposals.single.args['priorYear'], {
      'taxpayer': {'agi': 81250},
      'spouse': {'agi': 81250},
    });
  });

  testWidgets('a prior year typed in from another app fills only the filer\'s AGI on a joint return', (tester) async {
    final api = PolishApi()
      ..taxpayer = {'filingStatus': 'mfj'}
      ..priorYear = {'agi': 60000, 'joint': false};
    api.forms.add({'id': 'F1', 'kind': 'W-2', 'payer': 'Acme', 'amounts': {'wages': 52000}});
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await scrollTap(tester, find.byKey(const Key('usHub.step.sign')));
    expect(tester.widget<TextField>(find.descendant(of: find.byKey(const Key('usSign.agi')), matching: find.byType(TextField))).controller!.text, '60000');
    expect(tester.widget<TextField>(find.descendant(of: find.byKey(const Key('usSign.spouseAgi')), matching: find.byType(TextField))).controller!.text, '');
    expect(find.text('If you filed jointly last year, it is the same number.'), findsOneWidget);
  });
}
