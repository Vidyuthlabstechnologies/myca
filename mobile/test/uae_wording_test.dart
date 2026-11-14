import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';
import 'package:myca/uae/uae_emirates.dart';
import 'package:myca/uae/uae_strings.dart';

import 'fake_api.dart';
import 'uae_fake_api.dart';
import 'uae_walks.dart';

final _india = RegExp(r'GST|HSN|₹|\bTDS\b|\bIFSC\b|\bUPI\b|GSTR|\bIGST\b|\bCGST\b|\bSGST\b|MSME|Udyam|place of supply', caseSensitive: false);

Set<String> _visibleText(WidgetTester tester) => {
  for (final element in find.byWidgetPredicate((w) => w is Text || w is RichText || w is EditableText).evaluate())
    switch (element.widget) {
      Text(:final data, :final textSpan) => data ?? textSpan?.toPlainText() ?? '',
      RichText(:final text) => text.toPlainText(),
      EditableText(:final controller) => controller.text,
      _ => '',
    },
};

Future<Set<String>> _everyText(WidgetTester tester) async {
  final seen = <String>{..._visibleText(tester)};
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
      seen.addAll(_visibleText(tester));
    }
    position.jumpTo(0);
    await tester.pump();
  }
  return seen;
}

final Map<String, UaeWalk> _screens = {
  'home': (t, api) async {},
  'new entry sheet': (t, api) async {
    await t.tap(find.byTooltip('New entry'));
    await t.pumpAndSettle();
  },
  'customer picker': (t, api) async {
    await openNewEntry(t, 'I sold something');
  },
  'supplier picker': (t, api) async {
    await openNewEntry(t, 'I bought something');
  },
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
  'sales register': (t, api) async => uaeHomeRow(t, 'Sales'),
  'purchases register': (t, api) async => uaeHomeRow(t, 'Purchases'),
  'new customer sheet': (t, api) async {
    await uaeHomeRow(t, 'Sales');
    await t.tap(find.byType(FloatingActionButton));
    await t.pumpAndSettle();
  },
  'customer': (t, api) async {
    await uaeHomeRow(t, 'Sales');
    await t.tap(find.text('Desert Rose Interiors').last);
    await t.pumpAndSettle();
  },
  'customer payment': (t, api) async {
    await uaeHomeRow(t, 'Sales');
    await t.tap(find.text('Desert Rose Interiors').last);
    await t.pumpAndSettle();
    await t.tap(find.widgetWithText(ActionChip, 'Payment received'));
    await t.pumpAndSettle();
  },
  'supplier': (t, api) async {
    await uaeHomeRow(t, 'Purchases');
    await t.tap(find.text('Emirates Office Supplies').last);
    await t.pumpAndSettle();
  },
  'invoice': (t, api) async => openUaeInvoice(t),
  'credit note sheet': (t, api) async {
    await openUaeInvoice(t);
    await uaeTap(t, 'uae.invoice.credit');
  },
  'expense': (t, api) async => openNewEntry(t, 'I paid an expense'),
  'expenses': (t, api) async => uaeHomeRow(t, 'Expenses'),
  'expense head': (t, api) async {
    await uaeHomeRow(t, 'Expenses');
    await t.tap(find.text('Rent').last);
    await t.pumpAndSettle();
  },
  'cash': (t, api) async => uaeHomeRow(t, 'Cash'),
  'bank': (t, api) async => uaeHomeRow(t, 'Bank'),
  'repeating entries': (t, api) async {
    await uaeHomeRow(t, 'Repeating entries');
    await uaeTap(t, 'recurring.add');
  },
  'reports': (t, api) async => uaeHomeRow(t, 'Reports'),
  'statements': (t, api) async => uaeHomeRow(t, 'Statements'),
  'accountant': (t, api) async => uaeHomeRow(t, UaeStrings(t.platformDispatcher.locales.first.languageCode == 'ar').yourAccountant),
  'reminders': (t, api) async => uaeHomeRow(t, 'Reminders'),
  'books check': (t, api) async => uaeHomeRow(t, 'Books check'),
  'ask': (t, api) async => openNewEntry(t, 'Just ask'),
  'business sheet': (t, api) async {
    await t.tap(find.byTooltip('Your business'));
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

void main() {
  tearDown(() {
    moneyCountry = 'IN';
    uaeProfile.value = null;
  });

  for (final language in ['en', 'ar']) {
    for (final screen in _screens.entries) {
      testWidgets('$language: ${screen.key} in the UAE edition shows no India wording', (tester) async {
        await uaeView(tester, language: language);
        final api = await openUaeApp(tester);
        await screen.value(tester, api);
        expect(tester.takeException(), isNull);
        final shown = await _everyText(tester);
        final india = shown.where(_india.hasMatch).toList();
        expect(india, isEmpty, reason: '${screen.key} shows: ${india.join(' | ')}');
      });
    }
  }

  for (final language in ['en', 'ar']) {
    testWidgets('$language: the UAE welcome speaks of VAT and corporate tax and offers no India sample tour', (tester) async {
      await uaeView(tester, language: language);
      final s = UaeStrings(language == 'ar');
      await tester.pumpWidget(MycaApp(
        state: AppState(
          api: UaeFakeApi(),
          store: MemoryOnboardingStore(isWelcomed: false, isMigrated: true),
          pickTextFile: (_) async => null,
          now: () => DateTime(2026, 11, 14, 10, 30),
          edition: 'AE',
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text(s.welcomeLine), findsOneWidget);
      expect(find.text(s.welcomeTaxes), findsOneWidget);
      expect(find.text('Take a 2-minute tour first'), findsNothing);
      final india = (await _everyText(tester)).where(_india.hasMatch).toList();
      expect(india, isEmpty, reason: india.join(' | '));
    });
  }
}
