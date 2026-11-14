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

Future<void> uaeHomeRow(WidgetTester tester, String title) async {
  final row = find.text(title);
  await tester.scrollUntilVisible(row, 200, scrollable: uaeList, maxScrolls: 100);
  await tester.pumpAndSettle();
  await tester.tap(row.last);
  await tester.pumpAndSettle();
}

Future<void> openNewEntry(WidgetTester tester, String row) async {
  await tester.tap(find.byTooltip('New entry'));
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text(row));
  await tester.pumpAndSettle();
  await tester.tap(find.text(row));
  await tester.pumpAndSettle();
}

Future<void> openFromRegister(WidgetTester tester, String register, String party, String chip) async {
  await uaeHomeRow(tester, register);
  await tester.ensureVisible(find.text(party).last);
  await tester.pumpAndSettle();
  await tester.tap(find.text(party).last);
  await tester.pumpAndSettle();
  await tester.tap(find.widgetWithText(ActionChip, chip));
  await tester.pumpAndSettle();
}

Future<void> openUaeSale(WidgetTester tester, {String party = 'Gulf Star General Trading LLC', bool viaRegister = false}) async {
  if (viaRegister) return openFromRegister(tester, 'Sales', party, 'Sale');
  await openNewEntry(tester, 'I sold something');
  await tester.enterText(find.byType(TextField).last, party.split(' ').first);
  await tester.pumpAndSettle();
  await tester.tap(find.text(party).last);
  await tester.pumpAndSettle();
}

Future<void> openUaeBill(WidgetTester tester, {String party = 'Emirates Office Supplies', bool viaRegister = false}) async {
  if (viaRegister) return openFromRegister(tester, 'Purchases', party, 'Bill');
  await openNewEntry(tester, 'I bought something');
  await tester.enterText(find.byType(TextField).last, party.split(' ').first);
  await tester.pumpAndSettle();
  await tester.tap(find.text(party).last);
  await tester.pumpAndSettle();
}

Future<void> pickFromMenu(WidgetTester tester, String key, String item) async {
  await uaeTap(tester, key);
  await tester.tap(find.text(item).last);
  await tester.pumpAndSettle();
}

Future<void> fillUaeSale(WidgetTester tester) async {
  await uaeType(tester, 'uae.sale.line.0.description', 'Consulting, November');
  await uaeType(tester, 'uae.sale.line.0.qty', '2');
  await uaeType(tester, 'uae.sale.line.0.rate', '5000');
  await uaeTap(tester, 'uae.sale.addLine');
  await uaeType(tester, 'uae.sale.line.1.description', 'Export freight');
  await uaeType(tester, 'uae.sale.line.1.rate', '1000');
}

Future<void> fillUaeBill(WidgetTester tester) async {
  await uaeType(tester, 'uae.bill.billNo', 'EOS-7781');
  await uaeType(tester, 'uae.bill.line.0.description', 'Toner');
  await uaeType(tester, 'uae.bill.line.0.rate', '4000');
  await uaeTap(tester, 'uae.bill.addLine');
  await uaeType(tester, 'uae.bill.line.1.description', 'Cloud software licence');
  await uaeType(tester, 'uae.bill.line.1.rate', '2000');
}

Future<void> openUaeInvoice(WidgetTester tester, {String party = 'Desert Rose Interiors', String id = 'INV-0002'}) async {
  await uaeHomeRow(tester, 'Sales');
  await tester.ensureVisible(find.text(party).last);
  await tester.pumpAndSettle();
  await tester.tap(find.text(party).last);
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text('Invoice $id').last);
  await tester.pumpAndSettle();
  await tester.tap(find.text('Invoice $id').last);
  await tester.pumpAndSettle();
}

const uaeSavedProfile = <String, Object?>{'name': 'Al Noor Trading LLC', 'emirate': 'DXB', 'trn': '100123456700003'};

final Map<String, UaeWalk> uaeEntryWalks = {
  'new_sale': (t, api) async {
    api.savedProfile = uaeSavedProfile;
    await openUaeSale(t, viaRegister: true);
    await fillUaeSale(t);
    await uaeScrollTo(t, 'uae.sale.total');
  },
  'new_sale_preview': (t, api) async {
    api.savedProfile = uaeSavedProfile;
    await openUaeSale(t, viaRegister: true);
    await fillUaeSale(t);
    await uaeTap(t, 'uae.sale.preview');
    await uaeScrollTo(t, 'uae.sale.held');
  },
  'new_sale_problems': (t, api) async {
    await openUaeSale(t, viaRegister: true);
    await uaeType(t, 'uae.sale.line.0.description', 'Consulting');
    await uaeType(t, 'uae.sale.line.0.rate', '0');
    await uaeTap(t, 'uae.sale.preview');
    await uaeScrollTo(t, 'uae.sale.problems');
  },
  'new_bill': (t, api) async {
    await openUaeBill(t, viaRegister: true);
    await fillUaeBill(t);
    await uaeScrollTo(t, 'uae.bill.total');
  },
  'new_bill_posted': (t, api) async {
    await openUaeBill(t, viaRegister: true);
    await fillUaeBill(t);
    await uaeTap(t, 'uae.bill.preview');
    await t.tap(find.byType(FilledButton).last);
    await t.pumpAndSettle();
    await uaeScrollTo(t, 'uae.bill.done');
  },
  'invoice': (t, api) async {
    await openUaeInvoice(t);
    await uaeScrollTo(t, 'uae.invoice.credit');
  },
  'credit_note_sheet': (t, api) async {
    await openUaeInvoice(t);
    await uaeTap(t, 'uae.invoice.credit');
    await t.enterText(find.byKey(const ValueKey('uae.credit.reason')), 'Two site visits not made');
    await t.pumpAndSettle();
  },
};
