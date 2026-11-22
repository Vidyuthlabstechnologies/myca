import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';

import 'batch5_test.dart' show stateFor;
import 'fake_api.dart';

Future<void> _tap(WidgetTester tester, String label) async {
  final button = find.text(label);
  await tester.scrollUntilVisible(button, 200, scrollable: find.byType(Scrollable).first);
  await tester.ensureVisible(button);
  await tester.pumpAndSettle();
  await tester.tap(button);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a QRMP business saving the quarterly GSTR-1 and the IFF without picking a month asks for the month on screen', (tester) async {
    final api = FakeMycaApi(signedIn: true)..quarterlyGst = true;
    await tester.pumpWidget(MycaApp(state: stateFor(api, <String, String>{})));
    await tester.pumpAndSettle();
    await tester.tap(find.text('3 things need you'));
    await tester.pumpAndSettle();
    final shown = api.queryArgs.lastWhere((call) => call.name == 'gst_period_summary').args['period'];

    await _tap(tester, 'Save the quarterly GSTR-1');
    final quarter = api.queryArgs.lastWhere((call) => call.name == 'export_gstr1_quarter').args['quarter'];
    expect(quarter, matches(RegExp(r'^Q[1-4] \d{4}-\d{2}$')));

    await _tap(tester, 'Save the IFF for this month');
    final period = api.queryArgs.lastWhere((call) => call.name == 'export_iff').args['period'];
    expect(period, matches(RegExp(r'^\d{4}-\d{2}$')));
    if (shown is String && shown.isNotEmpty) expect(period, shown);
  });
}
