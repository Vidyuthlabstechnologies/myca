import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/registers.dart';
import 'package:myca/screens/uae/uae_invoice_screen.dart';
import 'package:myca/uae/uae_strings.dart';

import 'uae_fake_api.dart';

typedef UaeWalk = Future<void> Function(WidgetTester tester, UaeFakeApi api);

void uaeMockClipboard(WidgetTester tester) {
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async => null);
  addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
}

Future<void> uaeTapFound(WidgetTester tester, Finder target) async {
  if (target.evaluate().isEmpty) await tester.scrollUntilVisible(target, 200, scrollable: uaeList, maxScrolls: 100);
  await tester.ensureVisible(target.first);
  await tester.pumpAndSettle();
  await tester.tap(target.first);
  await tester.pumpAndSettle();
}

UaeStrings uaeWords(WidgetTester tester) => UaeStrings(tester.platformDispatcher.locales.first.languageCode == 'ar');

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

Set<String> uaeVisibleText(WidgetTester tester) => {
  for (final element in find.byWidgetPredicate((w) => w is Text || w is RichText || w is EditableText).evaluate())
    switch (element.widget) {
      Text(:final data, :final textSpan) => data ?? textSpan?.toPlainText() ?? '',
      RichText(:final text) => text.toPlainText(),
      EditableText(:final controller) => controller.text,
      _ => '',
    },
};

Future<Set<String>> uaeEveryText(WidgetTester tester) async {
  final seen = <String>{...uaeVisibleText(tester)};
  final lists = find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down);
  for (var at = 0; at < lists.evaluate().length; at++) {
    final state = tester.state<ScrollableState>(lists.at(at));
    final position = state.position;
    if (!position.hasContentDimensions || position.maxScrollExtent <= 0) continue;
    position.jumpTo(0);
    await tester.pump();
    for (var step = 0; step < 60 && position.pixels < position.maxScrollExtent; step++) {
      position.jumpTo((position.pixels + position.viewportDimension * 0.8).clamp(0, position.maxScrollExtent));
      await tester.pump();
      seen.addAll(uaeVisibleText(tester));
    }
    position.jumpTo(0);
    await tester.pump();
  }
  return seen;
}

final Map<String, UaeWalk> uaeScreenWalks = {
  'home': (t, api) async {},
  'new entry sheet': (t, api) async {
    await t.tap(find.byTooltip(uaeWords(t).newEntry));
    await t.pumpAndSettle();
  },
  'customer picker': (t, api) async => openNewEntry(t, uaeWords(t).iSold),
  'supplier picker': (t, api) async => openNewEntry(t, uaeWords(t).iBought),
  'new sale': (t, api) async {
    api.savedProfile = uaeSavedProfile;
    await openUaeSale(t);
    await fillUaeSale(t);
  },
  'new sale, held for confirmation': (t, api) async {
    api.savedProfile = uaeSavedProfile;
    await openUaeSale(t);
    await fillUaeSale(t);
    await uaeTap(t, 'uae.sale.preview');
  },
  'new purchase bill': (t, api) async {
    await openUaeBill(t);
    await fillUaeBill(t);
  },
  'sales register': (t, api) async => openRegister(t, RegisterKind.sales),
  'purchases register': (t, api) async => openRegister(t, RegisterKind.purchases),
  'new customer sheet': (t, api) async {
    await openRegister(t, RegisterKind.sales);
    await t.tap(find.byType(FloatingActionButton));
    await t.pumpAndSettle();
  },
  'customer': (t, api) async {
    await openRegister(t, RegisterKind.sales);
    await t.tap(find.text('Desert Rose Interiors').last);
    await t.pumpAndSettle();
  },
  'customer payment': (t, api) async {
    await openRegister(t, RegisterKind.sales);
    await t.tap(find.text('Desert Rose Interiors').last);
    await t.pumpAndSettle();
    await t.tap(find.widgetWithText(ActionChip, uaeWords(t).paymentChip(true)));
    await t.pumpAndSettle();
  },
  'payment terms': (t, api) async {
    await openRegister(t, RegisterKind.sales);
    await t.tap(find.text('Desert Rose Interiors').last);
    await t.pumpAndSettle();
    await uaeTapFound(t, find.widgetWithText(ActionChip, uaeWords(t).termsChip(null)));
  },
  'supplier': (t, api) async {
    await openRegister(t, RegisterKind.purchases);
    await t.tap(find.text('Emirates Office Supplies').last);
    await t.pumpAndSettle();
  },
  'invoice': (t, api) async => openUaeInvoice(t),
  'credit note': (t, api) async {
    seedUaeCreditNote(api, reason: uaeWords(t).ar ? 'لم تتم زيارتان للموقع' : 'Two site visits not made');
    await openUaeCreditNote(t);
  },
  'credit note sheet': (t, api) async {
    await openUaeInvoice(t);
    await uaeTap(t, 'uae.invoice.credit');
  },
  'expense': (t, api) async => openNewEntry(t, uaeWords(t).iPaidExpense),
  'expense head picker': (t, api) async {
    await openNewEntry(t, uaeWords(t).iPaidExpense);
    await uaeTapFound(t, find.widgetWithText(ActionChip, uaeWords(t).headChip(null)));
  },
  'expenses': (t, api) async => uaeHomeRow(t, uaeWords(t).expenses),
  'expense head': (t, api) async {
    await uaeHomeRow(t, uaeWords(t).expenses);
    await t.tap(find.text(uaeWords(t).accountName('Rent')).last);
    await t.pumpAndSettle();
  },
  'cash': (t, api) async => uaeHomeRow(t, uaeWords(t).cash),
  'cash balance sheet': (t, api) async {
    await uaeHomeRow(t, uaeWords(t).cash);
    final s = uaeWords(t);
    await uaeTapFound(t, find.byWidgetPredicate((w) => w is Text && (w.data == s.tellBalance || w.data == s.updateBalance)));
  },
  'bank': (t, api) async => uaeHomeRow(t, uaeWords(t).bank),
  'bank line': (t, api) async {
    await uaeHomeRow(t, uaeWords(t).bank);
    await uaeTapFound(t, find.byKey(ValueKey('bank.${api.bankLines.first['id']}')));
  },
  'bank transfer': (t, api) async {
    await uaeHomeRow(t, uaeWords(t).bank);
    await uaeTapFound(t, find.widgetWithText(ActionChip, uaeWords(t).recordTransfer));
  },
  'bank rules': (t, api) async {
    await uaeHomeRow(t, uaeWords(t).bank);
    await uaeTapFound(t, find.widgetWithText(ActionChip, uaeWords(t).rules));
    await uaeTapFound(t, find.text(uaeWords(t).addRule));
  },
  'bank account': (t, api) async {
    await uaeHomeRow(t, uaeWords(t).bank);
    await uaeTapFound(t, find.widgetWithText(ActionChip, uaeWords(t).addAccount));
  },
  'repeating entries': (t, api) async {
    await uaeHomeRow(t, uaeWords(t).repeatingEntries);
    await uaeTap(t, 'recurring.add');
  },
  'reports': (t, api) async => uaeHomeRow(t, uaeWords(t).reports),
  'report form': (t, api) async {
    await uaeHomeRow(t, uaeWords(t).reports);
    await uaeTapFound(t, find.byTooltip(uaeWords(t).saveAReport));
  },
  'audit trail': (t, api) async {
    await uaeHomeRow(t, uaeWords(t).reports);
    await uaeTapFound(t, find.byKey(const ValueKey('reports.audit')));
  },
  'statements': (t, api) async => uaeHomeRow(t, uaeWords(t).statements),
  'balance sheet': (t, api) async {
    await uaeHomeRow(t, uaeWords(t).statements);
    await uaeTapFound(t, find.widgetWithText(ChoiceChip, uaeWords(t).statementTitle('Balance sheet')));
  },
  'cash flow': (t, api) async {
    await uaeHomeRow(t, uaeWords(t).statements);
    await uaeTapFound(t, find.widgetWithText(ChoiceChip, uaeWords(t).statementTitle('Cash flow')));
  },
  'accountant': (t, api) async => uaeHomeRow(t, uaeWords(t).yourAccountant),
  'accountant question': (t, api) async {
    uaeMockClipboard(t);
    await uaeHomeRow(t, uaeWords(t).yourAccountant);
    await uaeTapFound(t, find.text('INV-0002 · Desert Rose Interiors'));
    await uaeTapFound(t, find.text(uaeWords(t).copyToSend));
  },
  'reminders': (t, api) async => uaeHomeRow(t, uaeWords(t).reminders),
  'reminder sheet': (t, api) async {
    await uaeHomeRow(t, uaeWords(t).reminders);
    await uaeTapFound(t, find.widgetWithText(ActionChip, uaeWords(t).reminder));
  },
  'books check': (t, api) async => uaeHomeRow(t, uaeWords(t).booksCheck),
  'ask': (t, api) async => openNewEntry(t, uaeWords(t).justAsk),
  'business sheet': (t, api) async {
    await t.tap(find.byTooltip(uaeWords(t).yourBusiness));
    await t.pumpAndSettle();
  },
  'taxes': (t, api) async => openUaeTaxes(t),
  'vat return from the books': (t, api) async => openUaeScreen(t, 'vat'),
  'vat return by hand': (t, api) async {
    await openUaeScreen(t, 'vat');
    await fillVatQuarter(t);
  },
  'corporate tax': (t, api) async => openUaeScreen(t, 'ct'),
  'profile': (t, api) async => openUaeScreen(t, 'profile'),
  'e-invoice': (t, api) async => openUaeScreen(t, 'einvoice'),
};

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
  await tester.ensureVisible(row.last);
  await tester.pumpAndSettle();
  await tester.tap(row.last);
  await tester.pumpAndSettle();
}

Future<void> openNewEntry(WidgetTester tester, String row) async {
  await tester.tap(find.byTooltip(uaeWords(tester).newEntry));
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

Future<void> openRegister(WidgetTester tester, RegisterKind kind) => uaeHomeRow(tester, kind == RegisterKind.sales ? uaeWords(tester).sales : uaeWords(tester).purchases);

Future<void> openUaeSale(WidgetTester tester, {String party = 'Gulf Star General Trading LLC', bool viaRegister = false}) async {
  final s = uaeWords(tester);
  if (viaRegister) return openFromRegister(tester, s.sales, party, s.documentChip(true, false));
  await openNewEntry(tester, s.iSold);
  await tester.enterText(find.byType(TextField).last, party.split(' ').first);
  await tester.pumpAndSettle();
  await tester.tap(find.text(party).last);
  await tester.pumpAndSettle();
}

Future<void> openUaeBill(WidgetTester tester, {String party = 'Emirates Office Supplies', bool viaRegister = false}) async {
  final s = uaeWords(tester);
  if (viaRegister) return openFromRegister(tester, s.purchases, party, s.documentChip(false, false));
  await openNewEntry(tester, s.iBought);
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
  final s = uaeWords(tester);
  await uaeHomeRow(tester, s.sales);
  await tester.ensureVisible(find.text(party).last);
  await tester.pumpAndSettle();
  await tester.tap(find.text(party).last);
  await tester.pumpAndSettle();
  await tester.ensureVisible(find.text(s.invoiceTitle(id)).last);
  await tester.pumpAndSettle();
  await tester.tap(find.text(s.invoiceTitle(id)).last);
  await tester.pumpAndSettle();
}

const uaeSavedProfile = <String, Object?>{'name': 'Al Noor Trading LLC', 'emirate': 'DXB', 'trn': '100123456700003'};

/// A profile with everything a full tax invoice needs from the seller.
const uaeFullProfile = <String, Object?>{
  'name': 'Al Noor Trading LLC',
  'nameAr': 'النور للتجارة ذ.م.م',
  'emirate': 'DXB',
  'trn': '100123456700003',
  'addressLine': 'Office 1204, Bay Square, Business Bay',
  'city': 'Dubai',
};

const uaeBuyerAddress = 'Gulf Star Tower, Floor 9, Port Saeed, Deira';

/// Adds a credit note of AED 2,100 against INV-0002, as create_ae_credit_note would.
void seedUaeCreditNote(UaeFakeApi api, {String reason = 'Two site visits not made', bool cancels = false}) {
  api.creditNotes.add({
    'id': 'CN-${(api.creditNotes.length + 1).toString().padLeft(4, '0')}',
    'date': '2026-11-02',
    'invoiceId': 'INV-0002',
    'invoiceDate': '2026-10-12',
    'partyName': 'Desert Rose Interiors',
    'country': 'AE',
    'emirate': 'DXB',
    'reason': reason,
    'cancels': cancels,
    'lines': [
      {'treatment': 'standard', 'taxable': 2000, 'vat': 100},
    ],
    'taxable': 2000,
    'vat': 100,
    'total': 2100,
  });
}

/// Adds INV-0003, a USD sale to Gulf Star at 3.6725 AED, as create_ae_invoice would.
void seedUaeForeignInvoice(UaeFakeApi api) {
  api.invoices.add({
    'id': 'INV-0003',
    'date': '2026-11-10',
    'country': 'AE',
    'partyName': 'Gulf Star General Trading LLC',
    'partyGstin': '',
    'partyTrn': '100987654300003',
    'partyAddress': uaeBuyerAddress,
    'emirate': 'DXB',
    'currency': 'USD',
    'exchangeRate': 3.6725,
    'lines': [
      {'description': 'Consulting, November', 'qty': 2, 'rate': 5000, 'treatment': 'standard', 'subtotal': 36725, 'vat': 1836.25, 'amount': 38561.25},
      {'description': 'Export freight', 'qty': 1, 'rate': 1000, 'treatment': 'zero-rated', 'subtotal': 3672.5, 'vat': 0, 'amount': 3672.5},
    ],
    'subtotal': 40397.5,
    'vat': 1836.25,
    'total': 42233.75,
    'status': 'posted',
    'receipts': <Object?>[],
  });
}

/// Makes the app read the fake books again, after a test changed them.
Future<void> uaeRefreshBooks(WidgetTester tester) async {
  await AppScope.of(tester.element(find.byType(Scaffold).first)).refresh();
  await tester.pumpAndSettle();
}

/// Opens UaeInvoiceScreen for [id] straight from wherever the app is.
Future<void> pushUaeDocument(WidgetTester tester, String id) async {
  Navigator.of(tester.element(find.byType(Scaffold).last)).push(MaterialPageRoute<void>(builder: (_) => UaeInvoiceScreen(invoiceId: id)));
  await tester.pumpAndSettle();
}

/// Opens a credit note the way a person does: sales, the customer, then the credit note in the thread.
Future<void> openUaeCreditNote(WidgetTester tester, {String party = 'Desert Rose Interiors', String id = 'CN-0001'}) async {
  await uaeRefreshBooks(tester);
  await uaeHomeRow(tester, uaeWords(tester).sales);
  await tester.ensureVisible(find.text(party).last);
  await tester.pumpAndSettle();
  await tester.tap(find.text(party).last);
  await tester.pumpAndSettle();
  final bubble = find.textContaining(id);
  if (bubble.evaluate().isEmpty) await tester.scrollUntilVisible(bubble, 200, scrollable: uaeList, maxScrolls: 100);
  await Scrollable.ensureVisible(tester.element(bubble.last), alignment: 0.3);
  await tester.pumpAndSettle();
  await tester.tap(bubble.last);
  await tester.pumpAndSettle();
}

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
  'invoice_missing_details': (t, api) async {
    await openUaeInvoice(t);
    await uaeScrollTo(t, 'uae.invoice.missingNotes');
  },
  'tax_invoice_full': (t, api) async {
    api.savedProfile = uaeFullProfile;
    api.invoices.first['partyAddress'] = uaeBuyerAddress;
    await pushUaeDocument(t, 'INV-0001');
    await uaeScrollTo(t, 'uae.invoice.buyer');
  },
  'invoice_foreign_currency': (t, api) async {
    api.savedProfile = uaeFullProfile;
    seedUaeForeignInvoice(api);
    await pushUaeDocument(t, 'INV-0003');
    await uaeScrollTo(t, 'uae.invoice.line.1');
  },
  'credit_note': (t, api) async {
    api.savedProfile = uaeFullProfile;
    seedUaeCreditNote(api, reason: 'Two site visits were not made, so they are taken off the invoice');
    await openUaeCreditNote(t);
    await uaeScrollTo(t, 'uae.credit.original');
  },
  'credit_note_totals': (t, api) async {
    seedUaeCreditNote(api);
    await openUaeCreditNote(t);
    await uaeScrollTo(t, 'uae.invoice.totals');
  },
  'credit_note_sheet': (t, api) async {
    await openUaeInvoice(t);
    await uaeTap(t, 'uae.invoice.credit');
    await t.enterText(find.byKey(const ValueKey('uae.credit.reason')), 'Two site visits not made');
    await t.pumpAndSettle();
  },
};

final Map<String, UaeWalk> uaeTouchedWalks = {
  for (final key in [
    'new entry sheet',
    'sales register',
    'customer',
    'customer payment',
    'payment terms',
    'expense head',
    'expense head picker',
    'cash',
    'cash balance sheet',
    'bank',
    'bank line',
    'reminder sheet',
    'reports',
    'statements',
    'accountant question',
    'books check',
    'ask',
    'business sheet',
  ])
    key.replaceAll(' ', '_'): uaeScreenWalks[key]!,
};
