import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

Future<void> openSupplier(WidgetTester tester, FakeMycaApi api) async {
  await tester.pumpWidget(MycaApp(state: testState(api)));
  await tester.pumpAndSettle();
  await tapRow(tester, 'Purchases');
  await tester.tap(find.text('Fabric Co'));
  await tester.pumpAndSettle();
}

Future<void> openSheet(WidgetTester tester) async {
  await tester.tap(find.widgetWithText(ActionChip, 'Supplier terms'));
  await tester.pumpAndSettle();
}

Future<void> enter(WidgetTester tester, String label, String value) async {
  final field = find.widgetWithText(TextField, label);
  await tester.ensureVisible(field);
  await tester.enterText(field, value);
  await tester.pumpAndSettle();
}

Future<void> save(WidgetTester tester) async {
  final button = find.widgetWithText(FilledButton, 'Save');
  await tester.ensureVisible(button);
  await tester.tap(button);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a supplier is marked MSME from its thread: the sheet, the engine preview, then Yes', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openSupplier(tester, api);
    await openSheet(tester);
    expect(find.text('Terms for Fabric Co'), findsOneWidget);
    expect(find.text('Udyam number'), findsNothing, reason: 'the Udyam number and category come with the switch');
    expect(find.text('Micro'), findsNothing);
    await tester.tap(find.widgetWithText(SwitchListTile, 'MSME supplier'));
    await tester.pumpAndSettle();
    expect(find.text('Udyam number'), findsOneWidget);
    expect(tester.widget<TextField>(find.widgetWithText(TextField, 'Udyam number')).decoration?.hintText, 'UDYAM-XX-00-0000000');
    await enter(tester, 'Udyam number', 'udyam-mh-12-1234567');
    await tester.tap(find.widgetWithText(ChoiceChip, 'Small'));
    await tester.pumpAndSettle();
    await enter(tester, 'Agreed days', '30');
    await save(tester);

    expect(api.proposals.single.tool, 'set_supplier_terms');
    expect(api.proposals.single.args, {
      'partyName': 'Fabric Co',
      'partyGstin': '27AABCT1332L1ZE',
      'msme': true,
      'udyam': 'UDYAM-MH-12-1234567',
      'category': 'small',
      'days': 30,
    });
    expect(find.text('Fabric Co: MSME supplier, small, Net 30'), findsOneWidget);
    expect(find.text('Mark Fabric Co as an MSME supplier (small, Udyam UDYAM-MH-12-1234567) to be paid within 30 days'), findsOneWidget);
    expect(find.text('Post it'), findsNothing);
    expect(api.supplierTermsSet, isEmpty, reason: 'nothing is saved before the yes');
    await tester.tap(find.text('Yes'));
    await tester.pumpAndSettle();
    expect(api.supplierTermsSet.single['days'], 30);
    expect(api.supplierTermsSet.single['partyName'], 'Fabric Co');
    expect(find.text('Another bill'), findsNothing, reason: 'saving terms is not a bill');
    expect(find.widgetWithText(ActionChip, 'Bill'), findsOneWidget);
    expect(find.widgetWithText(ActionChip, 'Supplier terms'), findsOneWidget);
  });

  testWidgets('terms without MSME are sent as they are, and a discarded preview saves nothing', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openSupplier(tester, api);
    await openSheet(tester);
    await enter(tester, 'Agreed days', '60');
    await save(tester);
    expect(api.proposals.single.args, {'partyName': 'Fabric Co', 'partyGstin': '27AABCT1332L1ZE', 'msme': false, 'days': 60});
    expect(find.text("Set Fabric Co's terms to 60 days"), findsOneWidget);
    await tester.tap(find.text('Discard'));
    await tester.pumpAndSettle();
    expect(api.discards, 1);
    expect(api.supplierTermsSet, isEmpty);
    expect(find.widgetWithText(ActionChip, 'Supplier terms'), findsOneWidget);
  });

  testWidgets('the sheet says what is wrong before anything is proposed', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openSupplier(tester, api);
    await openSheet(tester);
    await save(tester);
    expect(find.text('Switch on MSME supplier, or give the agreed days.'), findsOneWidget);
    await tester.tap(find.widgetWithText(SwitchListTile, 'MSME supplier'));
    await tester.pumpAndSettle();
    await enter(tester, 'Udyam number', 'UDYAM-12');
    await save(tester);
    expect(find.text('A Udyam number looks like UDYAM-XX-00-0000000.'), findsOneWidget);
    await enter(tester, 'Udyam number', '');
    await enter(tester, 'Agreed days', '60');
    await save(tester);
    expect(find.text('An MSME supplier must be paid within 45 days, so the agreed days cannot be more than 45.'), findsOneWidget);
    await enter(tester, 'Agreed days', '400');
    await save(tester);
    expect(find.text('Agreed days must be a whole number from 0 to 365.'), findsOneWidget);
    expect(api.proposals, isEmpty);
    await enter(tester, 'Agreed days', '');
    await save(tester);
    expect(api.proposals.single.args, {'partyName': 'Fabric Co', 'partyGstin': '27AABCT1332L1ZE', 'msme': true});
    expect(find.text('Mark Fabric Co as an MSME supplier (category not given, Udyam not given) to be paid within 15 days'), findsOneWidget);
  });

  testWidgets('the confirm button reads Yes only for supplier terms, and Post it for everything else', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openSupplier(tester, api);
    await openSheet(tester);
    await enter(tester, 'Agreed days', '30');
    await save(tester);
    expect(find.text('Yes'), findsOneWidget);
    await tester.tap(find.text('Discard'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ActionChip, 'Paid'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Preview'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'record_payment');
    expect(find.text('Post it'), findsOneWidget);
    expect(find.text('Yes'), findsNothing);
  });

  testWidgets('a customer thread has no supplier terms', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Sales');
    await tester.tap(find.text('Gujarat Weaves'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ActionChip, 'Terms: Net 30'), findsOneWidget);
    expect(find.widgetWithText(ActionChip, 'Supplier terms'), findsNothing);
  });

  testWidgets('a US supplier thread has no supplier terms either', (tester) async {
    final api = FakeMycaApi(signedIn: true)..country = 'US';
    await openSupplier(tester, api);
    expect(find.widgetWithText(ActionChip, 'Supplier terms'), findsNothing);
  });
}
