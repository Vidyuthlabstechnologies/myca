import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

AppState stateFor(FakeMycaApi api, Map<String, String> saved) => AppState(
  api: api,
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => null,
  saveTextFile: (name, content) async {
    saved[name] = content;
    return true;
  },
  now: () => DateTime(2026, 10, 5, 22, 30),
);

void main() {
  tearDown(() => moneyCountry = 'IN');

  testWidgets('Home shows the week ahead with overdue items first in words and money', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: stateFor(api, {})));
    await tester.pumpAndSettle();
    expect(find.text('THIS WEEK · 1 OVERDUE'), findsOneWidget);
    expect(find.text('Gujarat Weaves owes ₹2,77,600.00 on INV-0002'), findsOneWidget);
    expect(find.text('GSTR-1 (monthly) for 2026-09'), findsOneWidget);
  });

  testWidgets('a QRMP business saves the quarterly GSTR-1 and the IFF, and the year can be closed from Taxes', (tester) async {
    final api = FakeMycaApi(signedIn: true)
      ..tdsDeductor = true
      ..quarterlyGst = true;
    final saved = <String, String>{};
    await tester.pumpWidget(MycaApp(state: stateFor(api, saved)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('3 things need you'));
    await tester.pumpAndSettle();
    final quarterly = find.text('Save the quarterly GSTR-1');
    await tester.scrollUntilVisible(quarterly, 200, scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(quarterly);
    await tester.pumpAndSettle();
    await tester.tap(quarterly);
    await tester.pumpAndSettle();
    expect(api.queries.contains('export_gstr1_quarter'), isTrue);
    expect(saved.keys, contains('GSTR1_27AABCU9603R1ZN_Q2-2026-27.json'));
    final iff = find.text('Save the IFF for this month');
    await tester.ensureVisible(iff);
    await tester.pumpAndSettle();
    await tester.tap(iff);
    await tester.pumpAndSettle();
    expect(api.queries.contains('export_iff'), isTrue);
    final close = find.text('Close the year');
    await tester.scrollUntilVisible(close, 200, scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(close);
    await tester.pumpAndSettle();
    await tester.tap(close);
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField, 'Year to close'), findsOneWidget);
    await tester.tap(find.text('Preview the closing'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'close_year');
    expect(api.proposals.last.args, {'year': '2025-26'});
    await tester.tap(find.text('Close it'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Closed 2025-26'), findsOneWidget);
    expect(find.text('Year 2025-26'), findsOneWidget);
  });

  testWidgets('a US owner records a SUTA rate from the federal taxes screen, a sales tax due day on a state, and a quote with sales tax', (tester) async {
    final api = FakeMycaApi(signedIn: true)..country = 'US';
    await tester.pumpWidget(MycaApp(state: stateFor(api, {})));
    await tester.pumpAndSettle();
    await tester.tap(find.text('FEDERAL AND OWNER TAXES'));
    await tester.pumpAndSettle();
    final add = find.text('Record your state unemployment rate');
    await tester.scrollUntilVisible(add, 200, scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(add);
    await tester.pumpAndSettle();
    await tester.tap(add);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'State'), 'tx');
    await tester.enterText(find.widgetWithText(TextField, 'Rate'), '2.7');
    await tester.enterText(find.widgetWithText(TextField, 'Wage base per employee'), '9000');
    await tester.ensureVisible(find.text('Preview'));
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'set_suta_rate');
    expect(api.proposals.last.args, {'state': 'TX', 'ratePercent': 2.7, 'wageBase': 9000.0});
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(find.text('TX: 2.7% up to \$9,000.00'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.text('Set up sales tax'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Add a state'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'State code'), 'nv');
    await tester.enterText(find.widgetWithText(TextField, 'Return due day (optional)'), 'last');
    await tester.ensureVisible(find.text('Preview'));
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'set_sales_tax_nexus');
    expect(api.proposals.last.args, {'state': 'NV', 'frequency': 'quarterly', 'dueDay': 'last'});
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tapRow(tester, 'Sales');
    await tester.tap(find.text('Gujarat Weaves'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ActionChip, 'Quote'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Amount before sales tax'), '500');
    await tester.enterText(find.widgetWithText(TextField, 'Sales tax jurisdiction'), 'tx');
    await tester.ensureVisible(find.text('Preview'));
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'create_quote');
    expect(api.proposals.last.args, {
      'partyName': 'Gujarat Weaves',
      'lines': [
        {'description': 'Supply', 'qty': 1, 'rate': 500},
      ],
      'taxJurisdiction': 'TX',
    });
  });
}
