import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

Future<void> openSupplier(
  WidgetTester tester,
  FakeMycaApi api,
  List<String> shared,
  String supplier,
) async {
  api.has2b = true;
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
  await tester.tap(find.text('3 things need you'));
  await tester.pumpAndSettle();
  final row = find.text(supplier);
  await tester.scrollUntilVisible(
    row,
    200,
    scrollable: find.byType(Scrollable).last,
  );
  await tester.ensureVisible(row);
  await tester.pumpAndSettle();
  await tester.tap(row);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'a supplier is reminded from their sheet: the draft is editable, sending is previewed, and the phone shares exactly what was approved',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      final shared = <String>[];
      await openSupplier(tester, api, shared, 'Gujarat Mills');
      await tester.tap(find.text('Remind supplier'));
      await tester.pumpAndSettle();

      expect(api.queries, contains('supplier_reminder_draft'));
      expect(
        find.textContaining('1 bill for October 2026 · ₹3,600.00'),
        findsOneWidget,
      );
      final box = find.widgetWithText(TextField, 'Message');
      expect(
        tester.widget<TextField>(box).controller!.text,
        startsWith('Hello Gujarat Mills,'),
      );
      await tester.enterText(
        box,
        'Hi Ravi, please correct GM/77 for October. Thanks, Asha',
      );
      await tester.tap(find.text('Send from my phone'));
      await tester.pumpAndSettle();

      expect(api.proposals.last.tool, 'record_supplier_reminder');
      expect(api.proposals.last.args, {
        'supplier': '24AAACF7856R1ZY',
        'period': '2026-10',
        'message': 'Hi Ravi, please correct GM/77 for October. Thanks, Asha',
        'channel': 'other',
      });
      expect(shared, isEmpty, reason: 'nothing leaves the phone before yes');

      await tester.tap(find.text('Yes, send it'));
      await tester.pumpAndSettle();
      expect(shared, [
        'Hi Ravi, please correct GM/77 for October. Thanks, Asha',
      ]);
      expect(
        find.text(
          'Your phone offered the message to WhatsApp, email or another app.',
        ),
        findsOneWidget,
      );
      expect(find.text('Copy message'), findsOneWidget);
    },
  );

  testWidgets(
    'a supplier whose only gap is the owner\'s missing bill number gets no reminder button',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openSupplier(tester, api, <String>[], 'Box Mart');
      expect(find.text('Remind supplier'), findsNothing);
      expect(find.text('Got it'), findsOneWidget);
    },
  );
}
