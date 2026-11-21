import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  testWidgets('on an English phone the welcome screen can be switched to Hindi before signing in', (tester) async {
    final state = testState(FakeMycaApi(), onboarded: false);
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    expect(find.text('Get started'), findsOneWidget);
    expect(find.text('Your books,\nkept as easily\nas a conversation.'), findsOneWidget);

    await tester.tap(find.byKey(const Key('in.language')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('in.language.hi')));
    await tester.pumpAndSettle();

    expect(state.language, 'hi');
    expect(find.text('आपका हिसाब-किताब,\nबातचीत जितना\nआसान।'), findsOneWidget);
    expect(find.text('शुरू करें'), findsOneWidget);
    expect(find.text('बिक्री वैसे ही दर्ज करें जैसे मैसेज भेजते हैं'), findsOneWidget);
    expect(find.text('Get started'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('the business sheet has a Language row showing the language in use', (tester) async {
    final state = testState(FakeMycaApi(signedIn: true));
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();

    final row = find.byKey(const Key('business.language'));
    expect(row, findsOneWidget);
    expect(find.descendant(of: row, matching: find.text('Language')), findsOneWidget);
    expect(find.descendant(of: row, matching: find.text('English')), findsOneWidget);

    await tester.tap(row);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('in.language.hi')));
    await tester.pumpAndSettle();
    expect(state.language, 'hi');

    await tester.tap(find.byTooltip('आपका कारोबार'));
    await tester.pumpAndSettle();
    expect(find.descendant(of: find.byKey(const Key('business.language')), matching: find.text('हिन्दी')), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('business.language')), matching: find.text('भाषा')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
