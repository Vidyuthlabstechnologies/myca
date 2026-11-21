import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/us/us_prior_year_screen.dart';

import 'us_return_test.dart' show UsFakeApi, scrollTap, usState;

class PriorYearApi extends UsFakeApi {
  Map<String, Object?>? sent;
  bool nothing = false;

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async {
    if (name != 'import_us_prior_year') return super.propose(name, args);
    sent = args;
    if (nothing) return ChatReply.fromJson({'reply': 'There is no 2024 return in MyCA. Give the figures from last year\'s Form 1040.', 'blocked': true});
    return ChatReply.fromJson({
      'reply': 'Bring 2024 into the 2025 return.',
      'awaitingConfirmation': true,
      'preview': {'token': 'prior-1', 'summary': 'Bring 2024 into the 2025 return.', 'effects': <String>[]},
    });
  }

  @override
  Future<ChatReply> confirm(String token) async {
    if (token != 'prior-1') return super.confirm(token);
    return ChatReply.fromJson({
      'reply': 'Brought 2024 into your 2025 return.',
      'posted': true,
      'confirmed': true,
      'tools': [
        {
          'name': 'import_us_prior_year',
          'result': {
            'ok': true,
            'data': {
              'profileCopied': false,
              'notes': ['You itemized in 2024: a state tax refund received in 2025 can be taxable.'],
              'expectedForms': [
                {'kind': 'W-2', 'payer': 'St. Mary Hospital', 'owner': 'taxpayer'},
              ],
            },
          },
        },
      ],
    });
  }
}

void main() {
  test('only the amounts typed are sent, as numbers, with the year as text', () {
    expect(priorYearArgs(2025, {'agi': '85,000', 'totalTax': '9100.40', 'overpaymentApplied': ''}), {
      'taxYear': '2025',
      'figures': {'agi': 85000, 'totalTax': 9100.4},
    });
    expect(priorYearArgs(2026, const {}), {'taxYear': '2026'});
  });

  testWidgets('the hub offers Start from last year, and typed figures come back with the forms to expect', (tester) async {
    final api = PriorYearApi();
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await scrollTap(tester, find.byKey(const Key('usHub.priorYear')));
    expect(find.text('Start from last year'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('usPrior.agi')), '85.000.1');
    await tester.ensureVisible(find.byKey(const Key('usPrior.bring')));
    await tester.tap(find.byKey(const Key('usPrior.bring')));
    await tester.pumpAndSettle();
    expect(find.text('Adjusted gross income is an amount, for example 85000.'), findsOneWidget);
    expect(api.sent, isNull);

    await tester.enterText(find.byKey(const Key('usPrior.agi')), '85000');
    await tester.enterText(find.byKey(const Key('usPrior.totalTax')), '9100');
    await tester.ensureVisible(find.byKey(const Key('usPrior.bring')));
    await tester.tap(find.byKey(const Key('usPrior.bring')));
    await tester.pumpAndSettle();
    expect(api.sent, {
      'taxYear': '2025',
      'figures': {'agi': 85000, 'totalTax': 9100},
    });
    expect(find.byKey(const Key('usPrior.done')), findsOneWidget);
    expect(find.text('St. Mary Hospital'), findsOneWidget);
    expect(find.textContaining('You itemized in 2024'), findsOneWidget);
  });

  testWidgets('when there is nothing to bring in, the screen says what to type', (tester) async {
    final api = PriorYearApi()..nothing = true;
    await tester.pumpWidget(MaterialApp(home: AppScope(state: usState(api), child: const UsPriorYearScreen(taxYear: 2025))));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('usPrior.bring')));
    await tester.tap(find.byKey(const Key('usPrior.bring')));
    await tester.pumpAndSettle();
    expect(find.textContaining('There is no 2024 return in MyCA'), findsOneWidget);
  });
}
