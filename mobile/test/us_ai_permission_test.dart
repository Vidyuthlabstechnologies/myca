import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/ask_screen.dart';
import 'package:myca/us/us_ai_permission.dart';

import 'us_plus_test.dart' show openOver;
import 'us_return_test.dart' show UsFakeApi, usState;

class CountingUsApi extends UsFakeApi {
  final said = <String>[];

  @override
  Future<ChatReply> chat(String message, {String lang = 'en'}) async {
    said.add(message);
    return super.chat(message, lang: lang);
  }
}

void main() {
  testWidgets('the US assistant asks before anything goes to Anthropic, and sends nothing on no', (tester) async {
    usAiPermissionStore = MemoryUsAiPermissionStore();
    final api = CountingUsApi();
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await openOver(tester, const AskScreen());
    expect(find.textContaining('chartered accountant'), findsNothing);
    expect(find.textContaining('GST'), findsNothing);
    expect(find.textContaining('not a CPA'), findsOneWidget);
    expect(find.text('Dhanda kaisa chal raha hai?'), findsNothing);

    await tester.tap(find.text('What is my refund so far?'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usAi.dialog')), findsOneWidget);
    expect(find.textContaining('Anthropic'), findsWidgets);
    expect(find.textContaining('A photo is sent as taken'), findsOneWidget);
    await tester.tap(find.byKey(const Key('usAi.no')));
    await tester.pumpAndSettle();
    expect(api.said, isEmpty);
    expect(find.textContaining('Nothing was sent'), findsOneWidget);

    await tester.tap(find.text('What is my refund so far?'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usAi.yes')));
    await tester.pumpAndSettle();
    expect(api.said, ['What is my refund so far?']);

    await tester.enterText(find.byType(TextField), 'When is my return due?');
    await tester.testTextInput.receiveAction(TextInputAction.send);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usAi.dialog')), findsNothing, reason: 'asked once, remembered');
    expect(api.said.last, 'When is my return due?');
  });
}
