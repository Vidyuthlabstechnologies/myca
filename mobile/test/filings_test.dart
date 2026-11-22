import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/filing_screen.dart';

import 'fake_api.dart';

Future<void> openTaxes(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
  await tester.tap(find.text('3 things need you'));
  await tester.pumpAndSettle();
}

Future<void> tapRecord(WidgetTester tester) async {
  final row = find.text('Record a filing');
  await tester.scrollUntilVisible(
    row,
    200,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.tap(row);
  await tester.pumpAndSettle();
}

void main() {
  test('a deadline knows whether it was filed', () {
    expect(
      Deadline.fromJson({
        'returnType': 'GSTR-1',
        'level': 'filed',
        'filed': {'arn': 'AA2708261234567'},
      }).filed,
      isTrue,
    );
    expect(Deadline.fromJson({'returnType': 'GSTR-1'}).filed, isFalse);
  });

  testWidgets(
    'a filing is recorded from Taxes with its ARN, previewed first, and listed under Filed',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openTaxes(tester, api);
      expect(api.queries, contains('list_filings'));
      await tapRecord(tester);
      expect(find.text('Record a filing'), findsWidgets);

      await tester.enterText(
        find.widgetWithText(TextField, 'Acknowledgement number (ARN)'),
        'short',
      );
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('10 to 20 letters and digits'),
        findsOneWidget,
      );
      expect(api.proposals, isEmpty);

      await tester.enterText(
        find.widgetWithText(TextField, 'Acknowledgement number (ARN)'),
        'aa 2708 2612 3456 7',
      );
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(api.proposals.last.tool, 'record_filing');
      expect(api.proposals.last.args, {
        'returnType': 'GSTR-1',
        'period': '2026-08',
        'arn': 'AA2708261234567',
        'filedOn': '2026-10-05',
      });
      expect(api.filings, isEmpty, reason: 'nothing before posting');
      await tester.tap(find.text('Post it'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();

      final filed = find.text('GSTR-1 (monthly) for August 2026');
      await tester.scrollUntilVisible(
        filed,
        200,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        find.text(
          'Filed 5 October 2026, after the due date · ARN AA2708261234567',
        ),
        findsOneWidget,
      );
    },
  );

  testWidgets(
    'a TDS statement filing says which form was filed, 24Q or 26Q',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      const tds = Deadline(
        label: 'TDS statement',
        returnType: 'TDS_QUARTERLY',
        period: 'Q2 2026-27',
        dueDate: '2026-10-31',
        daysUntil: 5,
        level: 'due',
      );
      await tester.pumpWidget(
        MaterialApp(
          home: AppScope(
            state: testState(api),
            child: const RecordFilingScreen(returns: [tds]),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Other payments (26Q)'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextField, 'Acknowledgement number (ARN)'),
        'TDS26QQ2ACK0001',
      );
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(api.proposals.last.tool, 'record_filing');
      expect(api.proposals.last.args['form'], '26Q');
      expect(api.proposals.last.args['returnType'], 'TDS_QUARTERLY');
    },
  );
}
