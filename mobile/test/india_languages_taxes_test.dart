import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  testWidgets('on a Hindi phone Taxes and Record a filing open in Hindi without overflowing', (tester) async {
    tester.platformDispatcher.localesTestValue = const [Locale('hi', 'IN')];
    addTearDown(tester.platformDispatcher.clearLocalesTestValue);
    await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('3 काम आपका इंतज़ार कर रहे हैं'));
    await tester.pumpAndSettle();
    expect(find.text('टैक्स और रिटर्न'), findsWidgets);
    expect(find.text('Taxes and filings'), findsNothing);
    expect(find.textContaining('आपका काम ('), findsOneWidget);
    expect(find.text('खरीद पर क्रेडिट'), findsOneWidget);
    expect(tester.takeException(), isNull);

    final record = find.text('फ़ाइल किया रिटर्न दर्ज करें');
    await tester.scrollUntilVisible(record, 200, scrollable: find.byType(Scrollable).first);
    expect(find.text('Form 26AS की जाँच'), findsOneWidget);
    await tester.tap(record);
    await tester.pumpAndSettle();
    expect(find.text('रसीद नंबर (ARN)'), findsOneWidget);
    expect(find.text('पहले देखें'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
