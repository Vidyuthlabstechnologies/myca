import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

Future<void> openCheck(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
  await tapRow(tester, 'Books check');
}

void main() {
  test(
    'a books check is read from the tool result, and a refusal reads as nothing',
    () async {
      final api = FakeMycaApi(signedIn: true);
      final check = BooksCheck.fromTool(await api.query('books_check'))!;
      expect(check.headline, '1 thing needs you now');
      expect(check.findings.map((f) => f.severity), ['act', 'check', 'ok']);
      expect(check.findings.last.action, '');
      expect(BooksCheck.fromTool({'ok': false, 'error': 'X'}), isNull);
    },
  );

  testWidgets(
    'the check lists what needs you first, with plain reasons, and changes nothing',
    (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openCheck(tester, api);
      expect(api.queries, contains('books_check'));
      expect(find.text('Your books check'), findsOneWidget);
      expect(find.text('AS OF 5 OCTOBER 2026'), findsOneWidget);
      expect(find.text('1 thing needs you now'), findsOneWidget);
      expect(
        find.textContaining('Nothing has been changed or filed'),
        findsOneWidget,
      );
      final held = tester.getTopLeft(
        find.text('1 sale cannot go in the GST return as it stands'),
      );
      final ties = tester.getTopLeft(find.text('Your books tie'));
      expect(held.dy, lessThan(ties.dy));
      expect(api.proposals, isEmpty);
    },
  );

  testWidgets('a finding opens the screen where it is fixed', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openCheck(tester, api);
    await tester.tap(
      find.text('1 sale cannot go in the GST return as it stands'),
    );
    await tester.pumpAndSettle();
    expect(find.text('Taxes and filings'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Customers owe you ₹3,77,600.00'));
    await tester.pumpAndSettle();
    expect(find.text('Gujarat Weaves'), findsOneWidget);
  });
}
