import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'uae_fake_api.dart';

typedef UaeWalk = Future<void> Function(WidgetTester tester, UaeFakeApi api);

Future<void> uaeReveal(WidgetTester tester, Finder target) async {
  if (target.evaluate().isEmpty) {
    tester.state<ScrollableState>(uaeList).position.jumpTo(0);
    await tester.pumpAndSettle();
  }
  await tester.scrollUntilVisible(target, 150, scrollable: uaeList, maxScrolls: 200);
  await tester.pumpAndSettle();
}

Future<void> uaeType(WidgetTester tester, String key, String value) async {
  final field = find.byKey(ValueKey(key));
  await uaeReveal(tester, field);
  await tester.pumpAndSettle();
  await tester.enterText(field, value);
  await tester.pump();
}

Future<void> uaeTap(WidgetTester tester, String key) async {
  final target = find.byKey(ValueKey(key));
  await uaeReveal(tester, target);
  await tester.pumpAndSettle();
  await tester.tap(target);
  await tester.pumpAndSettle();
}

Future<void> uaeScrollTo(WidgetTester tester, String key) async {
  final target = find.byKey(ValueKey(key));
  await uaeReveal(tester, target);
  await tester.pumpAndSettle();
}

Future<void> fillVatQuarter(WidgetTester tester) async {
  await uaeTap(tester, 'uae.vat.edit');
  await uaeType(tester, 'uae.vat.sales.DXB', '200000');
  await uaeType(tester, 'uae.vat.sales.AUH', '50000.50');
  await uaeType(tester, 'uae.vat.zero', '30000');
  await uaeType(tester, 'uae.vat.exempt', '1000');
  await uaeType(tester, 'uae.vat.expenses', '80000');
  await uaeType(tester, 'uae.vat.reverse', '10000');
  await uaeTap(tester, 'uae.vat.work');
}

Future<void> fillCt(WidgetTester tester) async {
  await uaeType(tester, 'uae.ct.revenue', '5000000');
  await uaeType(tester, 'uae.ct.profit', '900000');
  await uaeType(tester, 'uae.ct.exempt', '25000');
  await uaeType(tester, 'uae.ct.nonDeductible', '25000');
  await uaeType(tester, 'uae.ct.losses', '100000');
  await uaeTap(tester, 'uae.ct.work');
}

Future<void> fillProfile(WidgetTester tester) async {
  await uaeType(tester, 'uae.profile.name', 'Al Noor Trading LLC');
  await uaeType(tester, 'uae.profile.nameAr', 'النور للتجارة ذ.م.م');
  await uaeType(tester, 'uae.profile.trn', '100123456700003');
  await uaeTap(tester, 'uae.profile.checkTrn');
}

Future<void> fillEinvoice(WidgetTester tester) async {
  await uaeType(tester, 'uae.einvoice.number', 'INV-2026-0042');
  await uaeType(tester, 'uae.einvoice.buyer', 'Gulf Star General Trading LLC');
  await uaeType(tester, 'uae.einvoice.buyerTrn', '100987654300003');
  await uaeType(tester, 'uae.einvoice.buyerAddress', 'Office 1204, Bay Square');
  await uaeType(tester, 'uae.einvoice.buyerCity', 'Dubai');
  await uaeType(tester, 'uae.einvoice.item', 'Consulting, October');
  await uaeType(tester, 'uae.einvoice.price', '12000');
}

final Map<String, UaeWalk> uaeWalks = {
  'home': (t, api) async {},
  'taxes': (t, api) async => openUaeTaxes(t),
  'vat_return': (t, api) async {
    await openUaeScreen(t, 'vat');
    await fillVatQuarter(t);
    await uaeScrollTo(t, 'uae.vat.due');
  },
  'vat_return_boxes': (t, api) async {
    await openUaeScreen(t, 'vat');
    await fillVatQuarter(t);
    await uaeScrollTo(t, 'uae.vat.14');
  },
  'ct_estimate': (t, api) async {
    await openUaeScreen(t, 'ct');
    await fillCt(t);
    await uaeScrollTo(t, 'uae.ct.due');
  },
  'profile': (t, api) async {
    await openUaeScreen(t, 'profile');
    await fillProfile(t);
  },
  'einvoice': (t, api) async {
    api.savedProfile = {'name': 'Al Noor Trading LLC'};
    await openUaeScreen(t, 'einvoice');
    await fillEinvoice(t);
    await uaeTap(t, 'uae.einvoice.check');
    await uaeScrollTo(t, 'uae.einvoice.total');
  },
  'einvoice_problems': (t, api) async {
    await openUaeScreen(t, 'einvoice');
    await uaeTap(t, 'uae.einvoice.check');
    await uaeScrollTo(t, 'uae.einvoice.problems');
  },
};
