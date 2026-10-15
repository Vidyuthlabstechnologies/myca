import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  testWidgets('Home shows the daily close with only the checks that need the owner, and the bank and receivable line', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    expect(api.queries, contains('daily_close'));
    expect(find.text('BOOKS TODAY · 2 NEED YOU'), findsOneWidget);
    expect(find.text('Bank statement current'), findsOneWidget);
    expect(find.text('last balance 2026-09-28, 7 days ago'), findsOneWidget);
    expect(find.text('Settlements matched to the bank'), findsOneWidget);
    expect(find.text('Sales posted'), findsNothing);
    expect(find.text('Bank ₹1,84,000.00 · customers owe ₹2,77,600.00'), findsOneWidget);
  });
}
