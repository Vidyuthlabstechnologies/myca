import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  testWidgets(
    'a customer is reminded from their thread: the draft shows the score and tone, sending is previewed, and the phone shares exactly what was approved',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      final shared = <String>[];
      final state = AppState(
        api: api,
        store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
        pickTextFile: (_) async => null,
        shareText: (text) async {
          shared.add(text);
          return true;
        },
        now: () => DateTime(2026, 10, 5, 22, 30),
      );
      await tester.pumpWidget(MycaApp(state: state));
      await tester.pumpAndSettle();
      await tapRow(tester, 'Sales');
      await tester.tap(find.text('Gujarat Weaves'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Remind customer'));
      await tester.pumpAndSettle();

      expect(api.queries, contains('collection_drafts'));
      expect(find.textContaining('₹5,900.00 overdue across 1 invoice, oldest 40 days late.'), findsOneWidget);
      expect(find.textContaining('so this draft is neutral'), findsOneWidget);
      final box = find.widgetWithText(TextField, 'Message');
      expect(tester.widget<TextField>(box).controller!.text, startsWith('Hello Gujarat Weaves,'));
      await tester.enterText(box, 'Hi, INV-0001 of ₹5,900 is 40 days overdue. Please pay this week. Thanks, Asha');
      await tester.tap(find.text('Send from my phone'));
      await tester.pumpAndSettle();

      expect(api.proposals.last.tool, 'record_collection_reminder');
      expect(api.proposals.last.args, {
        'customer': 'Gujarat Weaves',
        'message': 'Hi, INV-0001 of ₹5,900 is 40 days overdue. Please pay this week. Thanks, Asha',
        'channel': 'whatsapp',
      });
      expect(shared, isEmpty, reason: 'nothing leaves the phone before yes');
      await tester.tap(find.text('Yes, send it'));
      await tester.pumpAndSettle();
      expect(shared, ['Hi, INV-0001 of ₹5,900 is 40 days overdue. Please pay this week. Thanks, Asha']);
      expect(api.collectionReminders.single['customer'], 'Gujarat Weaves');
      expect(find.textContaining('Your phone offered the message'), findsOneWidget);
    },
  );
}
