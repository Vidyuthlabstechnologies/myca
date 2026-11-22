import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/app_state.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/us/us_sign_screen.dart';
import 'package:myca/screens/us/us_state_questions_screen.dart';
import 'package:myca/screens/us/us_state_residency_screen.dart';
import 'package:myca/screens/us/us_state_return_screen.dart';
import 'package:myca/us/us_filing_fee.dart';
import 'package:myca/us/us_state.dart';

import 'us_return_test.dart' show UsFakeApi, scrollTap, usState;
import 'us_state_book.dart';
import 'us_walk.dart' show WalkFees, filledApi;

Future<void> show(WidgetTester tester, UsFakeApi api, Widget screen) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pumpWidget(AppScope(state: usState(api), child: MaterialApp(home: screen)));
  await tester.pumpAndSettle();
}

Future<void> tapKey(WidgetTester tester, String key) async {
  final finder = find.byKey(Key(key));
  await tester.scrollUntilVisible(finder, 200, scrollable: find.byType(Scrollable).first);
  await scrollTap(tester, finder);
}

UsFakeApi withBook(StateBook book, {UsFakeApi? api}) {
  final out = api ?? filledApi();
  book.attach(out);
  return out;
}

void main() {
  setUp(() => moneyCountry = 'US');
  tearDown(() => moneyCountry = 'IN');

  test('residency entries keep their answers and income but never the assumed flag', () {
    final saved = UsResidency.fromJson({'state': 'ny', 'residency': 'full-year', 'assumed': true, 'answers': {'nycResident': 'no'}, 'estimatedPayments': 400});
    expect(saved.toArgs(), {'state': 'NY', 'residency': 'full-year', 'answers': {'nycResident': 'no'}, 'estimatedPayments': 400});
    final moved = saved.moved(residency: 'part-year', from: '2025-01-01', to: '2025-06-30');
    expect(moved.toArgs()['from'], '2025-01-01');
    expect(moved.withAnswers({}).toArgs().containsKey('answers'), isFalse);
    expect(stateOptionLabel('part-year'), 'Yes, part of the year');
    expect(stateOptionLabel('not-required'), 'Not required');
    expect(UsStateCoverage.unknown.message('TX'), contains('no state income tax'));
    expect(UsStateCoverage.fromJson({'built': [{'state': 'NY'}], 'notBuilt': [], 'noIncomeTax': ['TX']}).message('OR'), contains('doesn\'t prepare'));
  });

  testWidgets('the hub lists each state return under the federal steps without changing their count', (tester) async {
    final book = StateBook();
    final api = withBook(book);
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usHub.progressCount')), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('usHub.progressCount'))).data, endsWith('of 5 steps done'));
    await tester.scrollUntilVisible(find.byKey(const Key('usHub.stateReturn.NJ')), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('STATE RETURNS'), findsOneWidget);
    expect(find.text('New York · IT-201'), findsOneWidget);
    expect(find.text('Refund \$1,690.00'), findsOneWidget);
    expect(find.text('You owe \$210.00'), findsOneWidget);
    expect(find.textContaining('New York all year'), findsOneWidget);
    expect(find.byKey(const Key('usHub.stateTotals')), findsOneWidget);
    await scrollTap(tester, find.byKey(const Key('usHub.stateReturn.NY')));
    expect(find.text('Your 2025 New York return'), findsOneWidget);
  });

  testWidgets('a state with no income tax shows the coverage message on the hub', (tester) async {
    final api = filledApi()..taxpayer = {...filledApi().taxpayer, 'address': {'state': 'TX'}};
    StateBook()
      ..fails = true
      ..attach(api);
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('usHub.stateCoverage')), 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('Texas has no state income tax, so there is no Texas return to file.'), findsOneWidget);
    expect(find.byKey(const Key('usHub.stateResidency')), findsNothing);
  });

  testWidgets('residency starts from the address and W-2 states, and a move saves both part-year periods', (tester) async {
    final book = StateBook(assumed: true, residency: [{'state': 'CA', 'residency': 'full-year'}]);
    final api = withBook(book);
    api.forms.add({'id': 'F9', 'kind': 'W-2', 'payer': 'Hudson Clinic', 'amounts': {'wages': 24000, 'state': 'NY', 'stateWages': 24000, 'stateWithheld': 900}});
    await show(tester, api, const UsStateResidencyScreen(taxYear: 2025));
    expect(find.text('California'), findsOneWidget);
    expect(find.text('From your home address'), findsOneWidget);
    expect(tester.widget<CheckboxListTile>(find.byKey(const Key('usResidency.worked.NY'))).value, isTrue, reason: 'a W-2 state the filer did not live in is a nonresident state');
    expect(find.text('Wages on your W-2 (box 15)'), findsOneWidget);
    await tapKey(tester, 'usResidency.save');
    expect(find.text('Choose yes or no.'), findsOneWidget, reason: 'the move question needs an answer');
    expect(book.saves, isEmpty);

    await tapKey(tester, 'usResidency.movedYes');
    await scrollTap(tester, find.byKey(const Key('usResidency.lived0.state.0')));
    await tester.tap(find.text('Arizona').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.descendant(of: find.byKey(const Key('usResidency.lived0.to')), matching: find.byType(TextField)), '06/30/2025');
    await tester.enterText(find.descendant(of: find.byKey(const Key('usResidency.lived1.from')), matching: find.byType(TextField)), '07/01/2025');
    await tapKey(tester, 'usResidency.save');
    expect(book.saves.single, [
      {'state': 'AZ', 'residency': 'part-year', 'from': '2025-01-01', 'to': '2025-06-30'},
      {'state': 'CA', 'residency': 'part-year', 'from': '2025-07-01', 'to': '2025-12-31'},
      {'state': 'NY', 'residency': 'nonresident'},
    ]);
    expect(api.proposals.last.args['taxYear'], '2025');
  });

  testWidgets('a saved residency comes back, and unticking a state or adding one is saved with its answers kept', (tester) async {
    final book = StateBook(residency: [
      {'state': 'NY', 'residency': 'full-year', 'answers': {'nycResident': 'full-year'}},
      {'state': 'NJ', 'residency': 'nonresident'},
    ]);
    final api = withBook(book);
    await show(tester, api, const UsStateResidencyScreen(taxYear: 2025));
    expect(find.text('New York'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byKey(const Key('usResidency.movedNo'))), isNotNull);
    await tapKey(tester, 'usResidency.worked.NJ');
    await scrollTap(tester, find.byKey(const Key('usResidency.addWorked')));
    await tester.tap(find.text('Connecticut').last);
    await tester.pumpAndSettle();
    expect(find.text('Added by you'), findsNWidgets(2));
    await tapKey(tester, 'usResidency.save');
    expect(book.saves.single, [
      {'state': 'NY', 'residency': 'full-year', 'answers': {'nycResident': 'full-year'}},
      {'state': 'CT', 'residency': 'nonresident'},
    ]);
  });

  testWidgets('a residency the server refuses says why and stays open', (tester) async {
    final refusing = _Refusing(withBook(StateBook()));
    await show(tester, refusing, const UsStateResidencyScreen(taxYear: 2025));
    await tapKey(tester, 'usResidency.save');
    expect(find.text('NY: listed twice.'), findsOneWidget);
    expect(find.byType(UsStateResidencyScreen), findsOneWidget);
  });

  testWidgets('state questions handle every kind the server sends and save into that state only', (tester) async {
    final book = StateBook();
    final api = withBook(book);
    await show(tester, api, const UsStateQuestionsScreen(taxYear: 2025, state: 'NY'));
    expect(find.text('New York · question 1 of 6'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usStateQuestions.next')));
    await tester.pumpAndSettle();
    expect(find.text('Choose an answer.'), findsOneWidget);
    await tester.tap(find.text('Yes, part of the year'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usStateQuestions.next')));
    await tester.pumpAndSettle();
    expect(book.saves.last.first, {'state': 'NY', 'residency': 'full-year', 'answers': {'nycResident': 'part-year'}});
    expect(book.saves.last.last, {'state': 'NJ', 'residency': 'nonresident'});

    await tester.enterText(find.byKey(const Key('usStateQuestions.count')), '7');
    await tester.tap(find.byKey(const Key('usStateQuestions.next')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usStateQuestions.no')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usStateQuestions.next')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('usStateQuestions.amount')), '2,500');
    await tester.tap(find.byKey(const Key('usStateQuestions.next')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usStateQuestions.skip')));
    await tester.pumpAndSettle();
    final savesBefore = book.saves.length;
    expect(find.byKey(const Key('usStateQuestions.pick.county')), findsOneWidget, reason: 'a long list of choices is a dropdown');
    await tester.tap(find.byKey(const Key('usStateQuestions.pick.county')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Kings').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usStateQuestions.next')));
    await tester.pumpAndSettle();
    expect(book.saves.length, savesBefore + 1, reason: 'skipping an unanswered question saves nothing');
    expect(book.saves.last.first['answers'], {'nycResident': 'part-year', 'nycMonths': 7, 'yonkersNonresidentWages': false, 'ny529Contributions': 2500, 'county': 'Kings'});
    expect(find.byKey(const Key('usStateQuestions.finished')), findsOneWidget);
    await tester.tap(find.byKey(const Key('usStateQuestions.see')));
    await tester.pumpAndSettle();
    expect(find.byType(UsStateReturnScreen), findsOneWidget);
  });

  testWidgets('a text question and going back keep the answer', (tester) async {
    final book = StateBook(questions: {'NY': [nyQuestions[4], nyQuestions[2]]});
    final api = withBook(book);
    await show(tester, api, const UsStateQuestionsScreen(taxYear: 2025, state: 'NY'));
    await tester.enterText(find.byKey(const Key('usStateQuestions.text')), 'Brooklyn');
    await tester.tap(find.byKey(const Key('usStateQuestions.next')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usStateQuestions.back')));
    await tester.pumpAndSettle();
    expect(find.text('Brooklyn'), findsOneWidget);
    expect(book.saves.last.first['answers'], {'schoolDistrict': 'Brooklyn'});
  });

  testWidgets('the state summary shows the refund, the state\'s own credit labels, the other-state credit and what is left out', (tester) async {
    final api = withBook(StateBook());
    await show(tester, api, const UsStateReturnScreen(taxYear: 2025, state: 'NY'));
    expect(find.text('Form IT-201 · Resident all year'), findsOneWidget);
    expect(find.text('Estimated New York refund'), findsOneWidget);
    expect(find.text('\$1,690.00'), findsWidgets);
    expect(find.text('Answer New York questions (6 left)'), findsOneWidget);
    for (final label in ['Resident credit for tax paid to another state', 'New York City resident tax', 'Empire State child credit', 'Total New York tax', 'New York tax withheld (W-2 box 17)']) {
      await tester.scrollUntilVisible(find.text(label), 200, scrollable: find.byType(Scrollable).first);
      expect(find.text(label), findsOneWidget, reason: label);
    }
    expect(find.text('New York State household credit'), findsNothing, reason: 'a credit of zero is not listed');
    await tester.scrollUntilVisible(find.byKey(const Key('usStateReturn.otherStateCredit')), 200, scrollable: find.byType(Scrollable).first);
    expect(find.textContaining('\$1,310.00 credit for tax you paid to another state'), findsOneWidget);
    expect(find.byKey(const Key('usStateReturn.check.NY_MUNICIPAL_INTEREST')), findsOneWidget);
    expect(find.byKey(const Key('usStateReturn.note.NY_IT112R')), findsOneWidget);
    await tapKey(tester, 'usStateReturn.notCovered');
    expect(find.text('Yonkers nonresident earnings tax (Form Y-203)'), findsOneWidget);
    expect(find.byKey(const Key('usStateReturn.provisional')), findsNothing);
    expect(find.byKey(const Key('usStateReturn.unreviewed')), findsOneWidget);
  });

  testWidgets('a provisional figure says the state has not published and the return cannot be filed', (tester) async {
    final api = withBook(StateBook(returns: {'NY': nyReturn(provisional: true)}));
    await show(tester, api, const UsStateReturnScreen(taxYear: 2026, state: 'NY'));
    expect(find.text('New York hasn\'t published its 2026 figures yet, so this return can\'t be filed. MyCA updates it as soon as New York does.'), findsOneWidget);
  });

  testWidgets('an error-level check marks the state return not ready to file', (tester) async {
    final blocked = {...njReturn(), 'checks': [{'level': 'error', 'code': 'STATE_RULE_MISSING', 'message': 'MyCA has no New Jersey figures for 2025.', 'fix': 'This return cannot be filed until those figures are added.'}]};
    final api = withBook(StateBook(returns: {'NY': nyReturn(), 'NJ': blocked}));
    await show(tester, api, const UsStateReturnScreen(taxYear: 2025, state: 'NJ'));
    expect(find.byKey(const Key('usStateReturn.notReady')), findsOneWidget);
    expect(find.byKey(const Key('usStateReturn.check.STATE_RULE_MISSING')), findsOneWidget);
    expect(UsStateReturn.fromJson(blocked).readyToFile, isFalse);
    expect(UsStateReturn.fromJson(nyReturn(provisional: true)).readyToFile, isFalse);
    expect(UsStateReturn.fromJson(nyReturn()).readyToFile, isTrue);
    expect(UsStateReturn.fromJson(blocked).headline('2025'), 'Not ready to file: something to fix');
  });

  testWidgets('reciprocity, no income tax and states MyCA does not prepare each get plain words', (tester) async {
    final book = StateBook(residency: [
      {'state': 'NJ', 'residency': 'full-year'},
      {'state': 'PA', 'residency': 'nonresident'},
      {'state': 'TX', 'residency': 'nonresident'},
      {'state': 'ZZ', 'residency': 'nonresident'},
    ]);
    final api = withBook(book);
    await show(tester, api, const UsStateReturnScreen(taxYear: 2025, state: 'PA'));
    expect(find.byKey(const Key('usStateReturn.status.reciprocal')), findsOneWidget);
    expect(find.text('File to get your withholding back'), findsOneWidget);
    expect(find.textContaining('reciprocal agreement'), findsOneWidget);
    await show(tester, api, const UsStateReturnScreen(taxYear: 2025, state: 'TX'));
    expect(find.text('No state income tax'), findsOneWidget);
    await show(tester, api, const UsStateReturnScreen(taxYear: 2025, state: 'ZZ'));
    expect(find.text('Not prepared in MyCA yet'), findsOneWidget);
    await show(tester, api, const UsStateReturnScreen(taxYear: 2025, state: 'OR'));
    expect(find.byKey(const Key('usStateReturn.coverage')), findsOneWidget);
  });

  testWidgets('the sign screen says the state return goes to the e-file partner with the federal return', (tester) async {
    final api = withBook(StateBook())..route = 'partner';
    await show(tester, api, UsSignScreen(taxYear: 2025, fees: WalkFees(const UsFilingFee(taxYear: 2025, enforced: true, paid: true, priceUsd: 99))));
    expect(find.byKey(const Key('usSign.partnerIntro')), findsOneWidget);
    expect(find.text('Your New York return (IT-201) goes to our e-file partner with your federal return.'), findsOneWidget);
    expect(find.text('Your New Jersey return (NJ-1040NR) goes to our e-file partner with your federal return.'), findsOneWidget);

    final provisional = withBook(StateBook(returns: {'NY': nyReturn(provisional: true)}, residency: [{'state': 'NY', 'residency': 'full-year'}]))..route = 'partner';
    await show(tester, provisional, UsSignScreen(taxYear: 2026, fees: WalkFees(const UsFilingFee(taxYear: 2026, enforced: true, paid: true, priceUsd: 99))));
    expect(find.textContaining('New York hasn\'t published its 2026 figures yet'), findsOneWidget);

    final direct = withBook(StateBook());
    await show(tester, direct, UsSignScreen(taxYear: 2025, fees: WalkFees(const UsFilingFee(taxYear: 2025, enforced: true, paid: true, priceUsd: 99))));
    expect(find.byKey(const Key('usSign.states')), findsNothing, reason: 'the state package rides with the partner route only');
  });
}

class _Refusing extends UsFakeApi {
  _Refusing(UsFakeApi from) {
    taxpayer = from.taxpayer;
    forms.addAll(from.forms);
    stateTools = from.stateTools;
  }

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async {
    if (name != 'set_us_state_residency') return super.propose(name, args);
    return ChatReply.fromJson({
      'reply': 'I did not post anything, because:\n· NY: listed twice.',
      'blocked': true,
      'preview': {'blockers': ['NY: listed twice.'], 'summary': 'The state residency cannot be saved yet.'},
    });
  }
}
