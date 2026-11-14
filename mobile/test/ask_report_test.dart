import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/screens/ask_screen.dart';

import 'fake_api.dart';

Widget _ask(AppState state) => AppScope(state: state, child: const MaterialApp(home: AskScreen(first: 'Who owes me?')));

void main() {
  testWidgets('an assistant answer can be reported for review, and my own message cannot', (tester) async {
    final sent = <Map<String, Object?>>[];
    final state = AppState(
      api: FakeMycaApi(signedIn: true),
      store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
      pickTextFile: (_) async => null,
      sendAnswerReport: (report) async => sent.add(report),
    );
    await tester.pumpWidget(_ask(state));
    await tester.pumpAndSettle();
    expect(find.text('Report this answer'), findsOneWidget);
    await tester.tap(find.text('Report this answer'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Wrong or misleading'));
    await tester.pumpAndSettle();
    expect(sent, hasLength(1));
    expect(sent.single['type'], 'AiAnswerReport');
    expect(sent.single['kind'], 'flutter');
    expect('${sent.single['message']}', startsWith('Wrong or misleading | in | Customers owe you'));
    expect(find.text('Thank you. The answer was reported for review.'), findsOneWidget);
  });

  testWidgets('a report that cannot be sent says so', (tester) async {
    final state = AppState(api: FakeMycaApi(signedIn: true), store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true), pickTextFile: (_) async => null);
    await tester.pumpWidget(_ask(state));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Report this answer'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Something else'));
    await tester.pumpAndSettle();
    expect(find.text('Could not send the report. Try again when you are online.'), findsOneWidget);
  });
}
