import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  test('the TDS summary carries the quarterly statements', () {
    final summary = TdsSummary.fromTool({
      'ok': true,
      'data': {
        'deductor': true,
        'quarters': [
          {'quarter': 'Q3 2026-27', 'deducted': 6000, 'deposited': 0, 'shortfall': 6000, 'dueDate': '2027-01-31', 'form': '140', 'approved': true, 'filed': {'arn': 'AA1'}},
        ],
      },
    })!;
    final quarter = summary.quarters.single;
    expect(quarter.quarter, 'Q3 2026-27');
    expect(quarter.form, '140');
    expect(quarter.approved, isTrue);
    expect(quarter.filedArn, 'AA1');
  });

  testWidgets('a deductor opens the quarterly statement from Taxes and reviews it step by step', (tester) async {
    final api = FakeMycaApi(signedIn: true)..tdsDeductor = true;
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('3 things need you'));
    await tester.pumpAndSettle();
    final row = find.text('TDS statement for Q3 2026-27');
    await tester.scrollUntilVisible(row, 200, scrollable: find.byType(Scrollable).first);
    expect(find.textContaining('due by 31 January 2027 · review it'), findsOneWidget);
    await tester.tap(row);
    await tester.pumpAndSettle();
    expect(find.text('Review the TDS statement'), findsOneWidget);
    expect(find.text('TDS deducted in Q3 2026-27'), findsOneWidget);
    expect(find.textContaining('Rao & Co (AAAFR1234K), 194J'), findsOneWidget);
    expect(api.queries.contains('tds_review'), isTrue);
  });
}
