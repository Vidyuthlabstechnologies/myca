import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/reminders_screen.dart';

import 'fake_api.dart';

void main() {
  test(
    'reminders are read from the tool result and worded by when they fall',
    () async {
      final api = FakeMycaApi(signedIn: true);
      final reminders = remindersFrom(await api.query('list_reminders'));
      expect(reminders.map((r) => r.id), ['REM-0001', 'REM-0002']);
      expect(reminders.first.isDue, isTrue);
      expect(reminderWhen(reminders.first), 'Today');
      expect(reminderWhen(reminders.last), '9 October 2026');
      expect(
        reminderWhen(
          Reminder.fromJson({
            'due': '2026-10-04',
            'inDays': -1,
            'state': 'overdue',
          }),
        ),
        'Yesterday',
      );
      expect(
        Reminder.fromJson({
          'about': {
            'kind': 'invoice',
            'id': 'INV-0002',
            'name': 'Gujarat Weaves',
          },
        }).aboutLabel,
        'INV-0002, Gujarat Weaves',
      );
      expect(remindersFrom({'ok': false, 'error': 'X'}), isEmpty);
    },
  );

  testWidgets('Home shows what is due today, and marking it done removes it', (
    tester,
  ) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    expect(api.queries, contains('list_reminders'));
    expect(find.text('DUE TODAY'), findsOneWidget);
    expect(find.text('Call Rajesh about the order'), findsOneWidget);
    expect(find.text('Pay rent'), findsNothing);

    await tester.tap(find.text('Call Rajesh about the order'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mark done'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'complete_reminder');
    expect(api.proposals.last.args, {'id': 'REM-0001'});
    expect(api.confirmed, isNotEmpty);
    expect(find.text('DUE TODAY'), findsNothing);
  });

  testWidgets(
    'a reminder is added from the Reminders screen with a quick day, previewed, then set',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await tester.pumpWidget(MycaApp(state: testState(api)));
      await tester.pumpAndSettle();
      await tapRow(tester, 'Reminders');
      expect(find.text('Pay rent'), findsOneWidget);
      expect(find.text('9 October 2026'), findsOneWidget);

      await tester.tap(find.widgetWithText(ActionChip, 'Reminder'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(find.text('Say what to remind you about.'), findsOneWidget);
      await tester.enterText(
        find.widgetWithText(TextField, 'What about'),
        'Check the 2B',
      );
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(find.text('Choose a day.'), findsOneWidget);
      await tester.tap(find.text('Tomorrow'));
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(api.proposals.last.tool, 'add_reminder');
      expect(api.proposals.last.args, {
        'text': 'Check the 2B',
        'due': '2026-10-06',
      });
      expect(
        find.text('Remind you on 2026-10-06: Check the 2B.'),
        findsOneWidget,
      );
      await tester.tap(find.text('Post it'));
      await tester.pumpAndSettle();
      expect(api.reminders.last['text'], 'Check the 2B');
      expect(find.text('Check the 2B'), findsWidgets);
    },
  );

  testWidgets(
    'an unpaid invoice offers "Remind me", pre-filled and tied to the invoice',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await tester.pumpWidget(MycaApp(state: testState(api)));
      await tester.pumpAndSettle();
      await tapRow(tester, 'Sales');
      await tester.tap(find.text('Gujarat Weaves'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Invoice INV-0002'));
      await tester.pumpAndSettle();
      final remind = find.widgetWithText(ActionChip, 'Remind me');
      await tester.scrollUntilVisible(
        remind,
        200,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.tap(remind);
      await tester.pumpAndSettle();
      expect(
        find.widgetWithText(TextField, 'Follow up payment from Gujarat Weaves'),
        findsOneWidget,
      );
      await tester.tap(find.text('In a week'));
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(api.proposals.last.args, {
        'text': 'Follow up payment from Gujarat Weaves',
        'due': '2026-10-12',
        'invoiceId': 'INV-0002',
      });
    },
  );
}
