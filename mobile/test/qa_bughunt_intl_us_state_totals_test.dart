import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';

import 'us_return_test.dart' show usState;
import 'us_state_book.dart';
import 'us_walk.dart' show filledApi;

void main() {
  setUp(() => moneyCountry = 'US');
  tearDown(() => moneyCountry = 'IN');

  testWidgets('the state totals on the hub show the tax due in one state alongside the refund from another', (tester) async {
    final api = filledApi();
    StateBook().attach(api);
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.byKey(const Key('usHub.stateTotals')), 200, scrollable: find.byType(Scrollable).first);
    final totals = tester.widget<Text>(find.byKey(const Key('usHub.stateTotals'))).data!;
    expect(totals, contains('\$1,690.00'));
    expect(totals, contains('\$210.00'));
  });
}
