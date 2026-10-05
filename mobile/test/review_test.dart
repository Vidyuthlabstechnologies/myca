import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

Future<void> openReview(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
  await tester.tap(find.text('3 things need you'));
  await tester.pumpAndSettle();
  final button = find.text('Review the October 2026 return');
  await tester.scrollUntilVisible(
    button,
    200,
    scrollable: find.byType(Scrollable).last,
  );
  await tester.pumpAndSettle();
  await tester.tap(button);
  await tester.pumpAndSettle();
}

Future<void> tapVisible(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(
    finder,
    200,
    scrollable: find.byType(Scrollable).last,
  );
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  test(
    'a review is read from the tool result, and a refusal reads as nothing',
    () async {
      final api = FakeMycaApi(signedIn: true);
      final review = GstReview.fromTool(
        await api.query('gst_review', {'period': '2026-10'}),
      )!;
      expect(review.month, 'October 2026');
      expect(review.steps.map((s) => s.id), ['sales', 'credit', 'approve']);
      expect(review.next, 'sales');
      expect(review.steps.last.waitingFor, 'sales');
      expect(review.steps.first.lines.last.strong, isTrue);
      expect(review.steps[1].lines.first.amount, isNull);
      expect(GstReview.fromTool({'ok': false, 'error': 'X'}), isNull);
    },
  );

  testWidgets(
    'the owner walks the review step by step and approves; nothing is filed',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openReview(tester, api);
      expect(
        find.text('Check each part. Nothing is filed from here.'),
        findsOneWidget,
      );
      expect(find.text('Sales in October 2026'), findsOneWidget);
      expect(find.text('Tax on sales'), findsOneWidget);
      expect(find.text('₹3,600.00'), findsOneWidget);
      expect(find.text('Is this information correct?'), findsOneWidget);
      expect(find.text('Waiting for the step above'), findsNWidgets(2));

      await tapVisible(tester, find.text('Yes, correct'));
      expect(api.proposals.last.tool, 'gst_review_answer');
      expect(api.proposals.last.args, {
        'period': '2026-10',
        'step': 'sales',
        'answer': 'correct',
        'draftHash': 'a' * 64,
      });
      expect(api.confirmed, isNotEmpty);
      expect(find.text('Confirmed'), findsOneWidget);

      await tapVisible(tester, find.text('Yes, correct'));
      expect(api.proposals.last.args['step'], 'credit');
      expect(
        find.text('Approve these figures for the return?'),
        findsOneWidget,
      );
      expect(
        find.text('MyCA does not work out the amount to pay yet.'),
        findsOneWidget,
      );

      await tapVisible(tester, find.text('Approve'));
      expect(api.proposals.last.args, {
        'period': '2026-10',
        'step': 'approve',
        'answer': 'approve',
        'draftHash': 'a' * 64,
      });
      expect(
        find.text('You approved these figures on 5 October 2026.'),
        findsOneWidget,
      );
      expect(
        find.text('Approved the October 2026 figures. Nothing has been filed.'),
        findsOneWidget,
      );
      await tester.scrollUntilVisible(
        find.textContaining('save the GSTR-1 file from Taxes'),
        200,
        scrollable: find.byType(Scrollable).last,
      );
      expect(
        find.textContaining('save the GSTR-1 file from Taxes'),
        findsOneWidget,
      );
      expect(find.text('Is this information correct?'), findsNothing);
    },
  );

  testWidgets(
    '"Something is wrong" takes a note and the step stays open with it',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openReview(tester, api);
      await tapVisible(tester, find.text('Something is wrong'));
      expect(find.text('What is not right?'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'Rate looks wrong');
      await tester.tap(find.text('Mark as not right'));
      await tester.pumpAndSettle();
      expect(api.proposals.last.args, {
        'period': '2026-10',
        'step': 'sales',
        'answer': 'wrong',
        'draftHash': 'a' * 64,
        'note': 'Rate looks wrong',
      });
      expect(find.text('Marked not right: Rate looks wrong'), findsOneWidget);
      expect(find.text('Yes, correct'), findsOneWidget);
    },
  );

  testWidgets(
    '"Not yet" on the approval goes back without recording anything',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openReview(tester, api);
      await tapVisible(tester, find.text('Yes, correct'));
      await tapVisible(tester, find.text('Yes, correct'));
      final asked = api.proposals.length;
      await tapVisible(tester, find.text('Not yet'));
      expect(api.proposals.length, asked);
      expect(find.text('Review the return'), findsNothing);
    },
  );

  testWidgets(
    'if the books changed, the answer is refused and the review reloads',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openReview(tester, api);
      api.reviewHash = 'b' * 64;
      await tapVisible(tester, find.text('Yes, correct'));
      expect(api.confirmed, isEmpty);
      expect(
        find.textContaining('changed after you saw these figures'),
        findsOneWidget,
      );
      await tapVisible(tester, find.text('Yes, correct'));
      expect(api.proposals.last.args['draftHash'], 'b' * 64);
      expect(api.confirmed, isNotEmpty);
    },
  );
}
