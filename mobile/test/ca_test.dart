import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/ca_screen.dart';

import 'fake_api.dart';

Future<void> openHome(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
}

void main() {
  test(
    'questions are read from the tool result and worded by status',
    () async {
      final api = FakeMycaApi(signedIn: true);
      final requests = caRequestsFrom(await api.query('list_ca_requests'));
      expect(requests.single.title, 'Invoice INV-0002 to Gujarat Weaves');
      expect(requests.single.messages.length, 2);
      expect(caStatusWords(requests.single), 'Answered');
      expect(
        caStatusWords(CaRequest.fromJson({'status': 'open'})),
        'Waiting for your CA',
      );
      expect(caRequestsFrom({'ok': false}), isEmpty);
    },
  );

  testWidgets(
    'Your CA lists questions; a thread shows the attached facts and the answer, and the owner can reply and close',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openHome(tester, api);
      await tapRow(tester, 'Your CA');
      expect(find.text('Invoice INV-0002 to Gujarat Weaves'), findsOneWidget);
      expect(find.text('Answered · 4 October 2026'), findsOneWidget);
      await tester.tap(find.text('Invoice INV-0002 to Gujarat Weaves'));
      await tester.pumpAndSettle();
      expect(find.text('Total ₹3,77,600.00'), findsOneWidget);
      expect(find.text('Is IGST right here?'), findsOneWidget);
      expect(find.text('Yes, the goods went to Gujarat.'), findsOneWidget);
      expect(find.text('REPLY · 4 OCTOBER 2026'), findsOneWidget);

      await tester.enterText(find.widgetWithText(TextField, 'Reply'), 'Thanks');
      await tester.tap(find.text('Send'));
      await tester.pumpAndSettle();
      expect(api.proposals.last.tool, 'reply_ca');
      expect(api.proposals.last.args, {'id': 'ASK-0001', 'text': 'Thanks'});
      expect(find.text('Thanks'), findsOneWidget);
      expect(find.text('WAITING FOR YOUR CA'), findsOneWidget);

      await tester.tap(find.text('Close'));
      await tester.pumpAndSettle();
      expect(api.proposals.last.tool, 'close_ca');
      expect(find.text('CLOSED'), findsOneWidget);
      expect(find.widgetWithText(TextField, 'Reply'), findsNothing);
    },
  );

  testWidgets('copying a question puts the engine text on the clipboard', (
    tester,
  ) async {
    final api = FakeMycaApi(signedIn: true);
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'Clipboard.setData') {
          copied = (call.arguments as Map)['text'] as String;
        }
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );
    await openHome(tester, api);
    await tapRow(tester, 'Your CA');
    await tester.tap(find.text('Invoice INV-0002 to Gujarat Weaves'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Copy to send'));
    await tester.pumpAndSettle();
    expect(copied, startsWith('Invoice INV-0002 to Gujarat Weaves\n- Total'));
    expect(find.textContaining('Paste it into WhatsApp'), findsOneWidget);
  });

  testWidgets(
    '"Ask my CA" on an invoice previews what is attached, and sends only on Send',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openHome(tester, api);
      await tapRow(tester, 'Sales');
      await tester.tap(find.text('Gujarat Weaves'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Invoice INV-0002'));
      await tester.pumpAndSettle();
      final ask = find.widgetWithText(ActionChip, 'Ask my CA');
      await tester.scrollUntilVisible(
        ask,
        200,
        scrollable: find.byType(Scrollable).last,
      );
      await tester.tap(ask);
      await tester.pumpAndSettle();
      expect(
        find.text(
          'About invoice INV-0002 to Gujarat Weaves. MyCA attaches the details.',
        ),
        findsOneWidget,
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Your question'),
        'Should the design line be 18%?',
      );
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect(api.proposals.last.tool, 'ask_ca');
      expect(api.proposals.last.args, {
        'subject': {'kind': 'invoice', 'id': 'INV-0002'},
        'note': 'Should the design line be 18%?',
      });
      expect(find.text('Send to your CA?'), findsOneWidget);
      expect(api.caRequests.length, 1);
      await tester.tap(find.text('Send'));
      await tester.pumpAndSettle();
      expect(api.caRequests.length, 2);
      expect(
        find.textContaining('Sent to your CA in MyCA (ASK-0002)'),
        findsOneWidget,
      );
    },
  );

  testWidgets('cancelling the ask discards it', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openHome(tester, api);
    await tester.tap(find.text('3 things need you'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('INV-0003 cannot be reported in GSTR-1'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask my CA'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Your question'),
      'What do I fix?',
    );
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect((api.proposals.last.args['subject'] as Map)['kind'], 'exception');
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(api.discards, 1);
    expect(api.caRequests.length, 1);
  });
}
