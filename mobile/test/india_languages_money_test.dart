import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

Future<void> _openOnHindiPhone(WidgetTester tester, String row) async {
  tester.platformDispatcher.localesTestValue = const [Locale('hi', 'IN')];
  addTearDown(tester.platformDispatcher.clearLocalesTestValue);
  await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true))));
  await tester.pumpAndSettle();
  await tester.dragUntilVisible(find.text(row), find.byType(Scrollable).first, const Offset(0, -200));
  await tester.ensureVisible(find.text(row));
  await tester.pumpAndSettle();
  await tester.tap(find.text(row));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('on a Hindi phone the Marketplace screen is in Hindi, with figures and SKUs left as they are, and does not overflow', (tester) async {
    await _openOnHindiPhone(tester, 'मार्केटप्लेस');
    expect(find.text('भुगतान'), findsOneWidget);
    expect(find.text('Amazon: आना था ₹1,84,000.00, मिला ₹1,82,500.00'), findsOneWidget);
    expect(find.text('GST TCS: ₹920.00 कटा, ₹900.00 की पुष्टि हुई'), findsOneWidget);
    expect(find.text('₹42,500.00 की शुद्ध बिक्री पर ₹15,680.00 मार्जिन'), findsOneWidget);
    expect(find.text('amazon में SKU-B: -1'), findsOneWidget);
    expect(find.text('Payouts'), findsNothing);
    expect(tester.takeException(), isNull);

    final add = find.widgetWithText(ActionChip, 'रजिस्ट्रेशन जोड़ें');
    await tester.scrollUntilVisible(add, 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(add);
    await tester.pumpAndSettle();
    expect(find.text('GST रजिस्ट्रेशन जोड़ें'), findsOneWidget);
    expect(find.text('मार्केटप्लेस का गोदाम'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('on a Hindi phone the statements are in Hindi without overflowing', (tester) async {
    await _openOnHindiPhone(tester, 'वित्तीय विवरण');
    expect(find.text('लाभ-हानि'), findsOneWidget);
    expect(find.text('बैलेंस शीट'), findsOneWidget);
    expect(find.text('आमदनी'), findsWidgets);
    expect(find.text('Profit and loss'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('on a Hindi phone Your CA is in Hindi', (tester) async {
    await _openOnHindiPhone(tester, 'आपके CA');
    expect(find.textContaining('People से बुलाने के बाद'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
