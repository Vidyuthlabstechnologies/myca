import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_config.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';
import 'package:myca/uk/uk_common.dart';
import 'package:myca/uk/uk_connect_screen.dart';
import 'package:myca/uk/uk_estimate_screen.dart';
import 'package:myca/uk/uk_history_screen.dart';
import 'package:myca/uk/uk_hub_screen.dart';
import 'package:myca/uk/uk_mtd_screen.dart';
import 'package:myca/uk/uk_plan_screen.dart';
import 'package:myca/uk/uk_taxpayer_screen.dart';
import 'package:myca/uk/uk_vat_screen.dart';

import 'cloud_test.dart' show signedIn, sessionOn;
import 'fake_api.dart';
import 'fake_cloud.dart';
import 'uk_fake_api.dart';

typedef UkWalk = Future<void> Function(WidgetTester tester, GbFakeApi api);

Map<String, Object?> sentReturn({String taxYear = '2026-27', String closes = '2029-01-31', String type = 'final-declaration', String declaredBy = 'taxpayer'}) => {
  'taxYear': taxYear,
  'calculationId': 'c-0',
  'type': type,
  'totalDue': 9731.8,
  'declaredBy': declaredBy,
  'declarationText': hmrcTaxpayerWords,
  'environment': 'test',
  'correlationId': 'corr-0',
  'at': '2026-11-01T10:00:00.000Z',
  'amendmentWindowCloses': closes,
};

final Map<String, void Function(GbFakeApi api)> ukSetups = {
  'MTD with a return sent': (api) => api.returns.add(sentReturn()),
  'MTD with the amendment window closed': (api) => api.returns.add(sentReturn(closes: '2026-01-31')),
  'amendment preview': (api) => api.returns.add(sentReturn()),
  'final declaration blocked by HMRC errors': (api) => api..calculationHasErrors = true..calculationWarns = true,
  'history with submissions': (api) => api..vatSent = true..returns.add(sentReturn(type: 'confirm-amendment', declaredBy: 'agent'))..itsaSent.add({'kind': 'self-employment', 'businessId': 'XAIS12345678901', 'taxYear': '2026-27'}),
  'estimate with bad amounts': (api) => api.estimateProblems = [
    {'field': 'income.dividends', 'why': 'Give an amount in pounds, like 1250.50.'},
    {'field': 'gains.shares', 'why': 'Amounts cannot be negative here. Enter costs as expenses, not as negative income.'},
  ],
  'VAT return with bad amounts': (api) => api.vatProblems = [
    {'field': 'sales[0].net', 'why': 'Give an amount in pounds, like 1250.50.'},
  ],
  'landlord quarter with problems': (api) => api.quarterProblems = [
    {'field': 'transactions[0].amount', 'why': 'Amounts cannot be negative here. Enter costs as expenses, not as negative income.'},
    {'field': 'transactions', 'why': '1 transactions have a category MyCA cannot map to an HMRC box; pick a box for each.'},
  ],
};

Future<void> pumpUkScreen(WidgetTester tester, String name, GbFakeApi api) async {
  ukSetups[name]?.call(api);
  await pumpUk(tester, api, ukScreens[name]!.$1());
  await ukScreens[name]!.$2(tester, api);
}

const openObligation = VatObligation(periodKey: '26A2', start: '2026-07-01', end: '2026-09-30', due: '2026-11-07', status: 'open');

final quarterOne = <String, dynamic>{'quarter': 1, 'from': '2026-04-06', 'to': '2026-07-05', 'cumulativeFrom': '2026-04-06', 'dueBy': '2026-08-07'};

final businesses = <Map<String, dynamic>>[
  {'typeOfBusiness': 'self-employment', 'businessId': 'XAIS12345678901', 'tradingName': 'Sole trade'},
  {'typeOfBusiness': 'uk-property', 'businessId': 'XPIS12345678901'},
];

Future<void> fillEstimate(WidgetTester tester) async {
  await typeIn(tester, find.widgetWithText(TextField, 'Self-employed turnover'), '60000');
  await typeIn(tester, find.widgetWithText(TextField, 'Self-employed allowable expenses'), '10,000');
  await tapIt(tester, find.text('Work out my tax'));
}

Future<void> enterVatByHand(WidgetTester tester) async {
  final toggle = find.byKey(const Key('uk.vat.fromBooks'));
  if (toggle.evaluate().isNotEmpty && tester.widget<SwitchListTile>(toggle).value) await tapIt(tester, toggle);
}

Future<void> prepareVat(WidgetTester tester) async {
  await enterVatByHand(tester);
  await typeIn(tester, find.byKey(const Key('uk.vat.sales.0.net')), '10000');
  await typeIn(tester, find.byKey(const Key('uk.vat.purchases.0.net')), '2000');
  await tapIt(tester, find.text('Check the return'));
}

Future<void> tickDeclaration(WidgetTester tester) => tapIt(tester, find.descendant(of: find.byKey(const Key('uk.final.declare')), matching: find.byType(Checkbox)));

Future<void> finalCalculation(WidgetTester tester) async {
  await tapIt(tester, find.text('Ask HMRC for the final calculation'));
}

final Map<String, (Widget Function(), UkWalk)> ukScreens = {
  'hub, connected': (() => const UkHubScreen(), (t, api) async {}),
  'taxpayer details with problems': (
    () => const UkTaxpayerScreen(),
    (t, api) async {
      await typeIn(t, find.byKey(const Key('uk.taxpayer.nino')), 'QQ123456C');
      await tapIt(t, find.byKey(const Key('uk.taxpayer.scheme')));
      await t.tap(find.text('Flat Rate Scheme').last);
      await t.pumpAndSettle();
      await tapIt(t, find.byKey(const Key('uk.taxpayer.plan.postgraduate')));
      await tapIt(t, find.text('Save details'));
    },
  ),
  'estimate with result': (() => const UkEstimateScreen(taxYear: '2026-27'), (t, api) async => fillEstimate(t)),
  'VAT periods': (() => const UkVatScreen(taxYear: '2026-27'), (t, api) async {}),
  'VAT nine boxes': (
    () => const UkVatReturnScreen(obligation: openObligation),
    (t, api) async {
      await prepareVat(t);
      await tapIt(t, find.byKey(const Key('uk.vat.declare')));
    },
  ),
  'VAT preview': (
    () => const UkVatReturnScreen(obligation: openObligation),
    (t, api) async {
      await prepareVat(t);
      await tapIt(t, find.byKey(const Key('uk.vat.declare')));
      await tapIt(t, find.byKey(const Key('uk.vat.submit')));
    },
  ),
  'VAT receipt': (
    () => const UkVatReturnScreen(obligation: openObligation),
    (t, api) async {
      await prepareVat(t);
      await tapIt(t, find.byKey(const Key('uk.vat.declare')));
      await tapIt(t, find.byKey(const Key('uk.vat.submit')));
      await tapIt(t, find.byKey(const Key('uk.preview.send')));
    },
  ),
  'VAT return with problems': (
    () => const UkVatReturnScreen(),
    (t, api) async {
      api.vatReady = false;
      await typeIn(t, find.byKey(const Key('uk.vat.periodKey')), '26a2');
      await prepareVat(t);
    },
  ),
  'MTD quarters, calculation and mandate': (
    () => const UkMtdScreen(taxYear: '2026-27'),
    (t, api) async {
      await tapIt(t, find.text('Ask HMRC for a calculation'));
      await typeIn(t, find.descendant(of: find.byKey(const Key('uk.mtd.turnover')), matching: find.byType(TextField)), '45000');
      await typeIn(t, find.descendant(of: find.byKey(const Key('uk.mtd.property')), matching: find.byType(TextField)), '10000');
      await tapIt(t, find.text('Check'));
    },
  ),
  'quarterly update review': (
    () => UkQuarterScreen(taxYear: '2026-27', period: quarterOne, businesses: businesses),
    (t, api) async {
      await typeIn(t, find.descendant(of: find.byKey(const Key('uk.quarter.turnover')), matching: find.byType(TextField)), '12000');
      await tapIt(t, find.text('Check the update'));
    },
  ),
  'final declaration preview': (
    () => const UkFinalDeclarationScreen(taxYear: '2026-27'),
    (t, api) async {
      await finalCalculation(t);
      await tickDeclaration(t);
      await tapIt(t, find.byKey(const Key('uk.final.submit')));
    },
  ),
  'final declaration with the full calculation': (
    () => const UkFinalDeclarationScreen(taxYear: '2026-27'),
    (t, api) async => finalCalculation(t),
  ),
  'final declaration blocked by HMRC errors': (
    () => const UkFinalDeclarationScreen(taxYear: '2026-27'),
    (t, api) async => finalCalculation(t),
  ),
  'agent declaration preview': (
    () => const UkFinalDeclarationScreen(taxYear: '2026-27'),
    (t, api) async {
      await finalCalculation(t);
      await tapIt(t, find.byKey(const Key('uk.final.who.agent')));
      await tickDeclaration(t);
      await tapIt(t, find.byKey(const Key('uk.final.submit')));
    },
  ),
  'final declaration refused by HMRC': (
    () => const UkFinalDeclarationScreen(taxYear: '2026-27'),
    (t, api) async {
      api.refuseCalculation = 'TAX_YEAR_NOT_ENDED';
      await finalCalculation(t);
    },
  ),
  'MTD with a return sent': (() => const UkMtdScreen(taxYear: '2026-27'), (t, api) async {}),
  'MTD with the amendment window closed': (() => const UkMtdScreen(taxYear: '2026-27'), (t, api) async {}),
  'amendment preview': (
    () => const UkFinalDeclarationScreen(taxYear: '2026-27', amend: true),
    (t, api) async {
      await tapIt(t, find.text('Ask HMRC for the amendment calculation'));
      await tickDeclaration(t);
      await tapIt(t, find.byKey(const Key('uk.final.submit')));
    },
  ),
  'amended return receipt': (
    () => const UkFinalDeclarationScreen(taxYear: '2026-27', amend: true),
    (t, api) async {
      api.returns.add(sentReturn());
      await tapIt(t, find.text('Ask HMRC for the amendment calculation'));
      await tickDeclaration(t);
      await tapIt(t, find.byKey(const Key('uk.final.submit')));
      await tapIt(t, find.byKey(const Key('uk.preview.send')));
    },
  ),
  'history with submissions': (() => const UkHistoryScreen(), (t, api) async {}),
  'history, nothing sent': (() => const UkHistoryScreen(), (t, api) async {}),
  'plans': (() => const UkPlanScreen(), (t, api) async {}),
  'VAT return from the books': (() => const UkVatReturnScreen(obligation: openObligation), (t, api) async => tapIt(t, find.text('Check the return'))),
  'estimate with bad amounts': (() => const UkEstimateScreen(taxYear: '2026-27'), (t, api) async => fillEstimate(t)),
  'VAT return with bad amounts': (() => const UkVatReturnScreen(obligation: openObligation), (t, api) async => prepareVat(t)),
  'landlord quarter with problems': (
    () => UkQuarterScreen(taxYear: '2026-27', period: quarterOne, businesses: businesses),
    (t, api) async {
      await tapIt(t, find.byKey(const Key('uk.quarter.kind')));
      await t.tap(find.text('UK property').last);
      await t.pumpAndSettle();
      await typeIn(t, find.descendant(of: find.byKey(const Key('uk.quarter.periodAmount')), matching: find.byType(TextField)), '3000');
      await typeIn(t, find.descendant(of: find.byKey(const Key('uk.quarter.residentialFinancialCost')), matching: find.byType(TextField)), '900');
      await tapIt(t, find.text('Check the update'));
    },
  ),
  'connect with the sign-in link': (
    () => const UkConnectScreen(taxYear: '2026-27'),
    (t, api) async {
      await tapIt(t, find.text(api.connected ? 'Connect again' : 'Start connecting'));
    },
  ),
};

void main() {
  tearDown(() => moneyCountry = 'IN');

  group('every UK screen fits', () {
    for (final screen in ukScreens.entries) {
      for (final size in ukSizes.entries) {
        for (final scale in [1.0, 2.0]) {
          testWidgets('${screen.key} at ${size.key} ${size.value.width.round()}x${size.value.height.round()}, text ${scale}x', (tester) async {
            await setUkView(tester, size.value, textScale: scale);
            final api = GbFakeApi()..connected = true;
            await pumpUkScreen(tester, screen.key, api);
            await scrollToEnd(tester);
            final error = tester.takeException();
            expect(error, isNull, reason: 'layout error: $error');
          });
        }
      }
    }
  });

  test('the uk flavour and MYCA_EDITION=GB give the GB edition, and India, US and UAE are unchanged', () {
    expect(editionFor('uk', defined: ''), 'GB');
    expect(editionFor('india', defined: 'GB'), 'GB');
    expect(editionFor('us', defined: ''), 'US');
    expect(editionFor('india', defined: ''), 'IN');
    expect(editionFor(null, defined: ''), 'IN');
    expect(gbState(GbFakeApi()).edition, 'GB');
    expect(AppState(api: GbFakeApi(), store: MemoryOnboardingStore(), pickTextFile: (_) async => null, edition: 'uk').edition, 'GB');
    expect(AppState(api: GbFakeApi(), store: MemoryOnboardingStore(), pickTextFile: (_) async => null, edition: 'US').edition, 'US');
    expect(AppState(api: GbFakeApi(), store: MemoryOnboardingStore(), pickTextFile: (_) async => null, edition: 'AE').edition, 'AE');
  });

  test('pounds read the British way and tax years start on 6 April', () {
    expect(pounds(1234.5), '£1,234.50');
    expect(pounds(-514), '-£514.00');
    moneyCountry = 'GB';
    expect(rupees(9731.8), '£9,731.80');
    expect(gbDay('2026-11-14'), '14 Nov 2026');
    expect(gbTaxYearOn(DateTime(2026, 4, 5)), '2025-26');
    expect(gbTaxYearOn(DateTime(2026, 4, 6)), '2026-27');
    expect(gbTaxYearOn(DateTime(2027, 1, 1)), '2026-27');
    expect(gbTaxYearBefore('2026-27'), '2025-26');
    expect(gbDatesIn('update 3 (2026-04-06 to 2027-01-05)'), 'update 3 (6 Apr 2026 to 5 Jan 2027)');
    expect(poundsOf('£1,250.50'), 1250.5);
    expect(poundsInvalid('12.345'), isTrue);
    expect(poundsInvalid('-5'), isTrue);
    expect(poundsInvalid('-5', allowNegative: true), isFalse);
    expect(hmrcCodeFrom('https://myca.example/hmrc/callback?code=abc&state=st-9'), (code: 'abc', state: 'st-9'));
    expect(hmrcCodeFrom('  abc123 '), (code: 'abc123', state: ''));
  });

  testWidgets('the UK app shows the UK tax panel on home, hides the GST and US panels, and opens the hub', (tester) async {
    final api = GbFakeApi()..connected = true;
    useFakeDevice();
    await tester.pumpWidget(MycaApp(state: gbState(api)));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('home.uk')), findsOneWidget);
    expect(find.text('FEDERAL AND OWNER TAXES'), findsNothing);
    expect(find.byKey(const ValueKey('home.msme')), findsNothing);
    expect(api.queries.map((q) => q.name), isNot(contains('supplier_dues')));
    await tapIt(tester, find.byKey(const ValueKey('home.uk')));
    expect(find.text('UK taxes'), findsOneWidget);
    expect(find.text('31 Jan 2027'), findsOneWidget);
    expect(find.text('Connected to HMRC sandbox'), findsOneWidget);
    expect(find.textContaining('HMRC approved'), findsNothing);
    expect(find.text(builtForMtd), findsOneWidget);
  });

  testWidgets('the UK app opens on a UK welcome with no GST and no Indian tour', (tester) async {
    final state = AppState(api: GbFakeApi(), store: MemoryOnboardingStore(), pickTextFile: (_) async => null, edition: 'GB');
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    expect(find.textContaining('Making Tax Digital'), findsWidgets);
    expect(find.textContaining('GST'), findsNothing);
    expect(find.text('Take a 2-minute tour first'), findsNothing);
  });

  testWidgets('hosted UK first run makes a GB business', (tester) async {
    final cloud = FakeCloud();
    final tokens = MemoryTokenStore();
    final session = await signedIn(cloud, tokens);
    await session.setName('Alex');
    final state = AppState(cloud: sessionOn(cloud, tokens), store: MemoryOnboardingStore(isWelcomed: true), pickTextFile: (_) async => null, now: () => DateTime(2026, 11, 14, 10), edition: 'GB');
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    expect(find.text('Set up your UK tax'), findsOneWidget);
    expect(find.textContaining('GSTIN'), findsNothing);
    await tester.tap(find.byKey(const Key('ukSetup.continue')));
    await tester.pumpAndSettle();
    expect(find.text('Enter your name or your business name.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('ukSetup.name')), 'Alex Trader');
    await tester.tap(find.byKey(const Key('ukSetup.continue')));
    await tester.pumpAndSettle();
    expect(cloud.createdBodies.single, {'name': 'Alex Trader', 'country': 'GB'});
  });

  testWidgets('the India app does not show the UK panel', (tester) async {
    await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true))));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('home.uk')), findsNothing);
  });

  testWidgets('the hub shows the next deadline, the HMRC status, and syncs with the device information', (tester) async {
    final api = GbFakeApi()..connected = true;
    await pumpUk(tester, api, const UkHubScreen());
    expect(find.byKey(const Key('uk.hub.nextDate')), findsOneWidget);
    expect(find.text('First payment on account for 2026-27'), findsOneWidget);
    expect(find.text('Due in 78 days'), findsOneWidget);
    expect(api.queries.firstWhere((q) => q.name == 'gb_tax_calendar').args['taxYear'], '2026-27');
    await tapIt(tester, find.text('Sync with HMRC'));
    final sync = api.proposed('sync_gb_hmrc').single;
    expect(sync.args['taxYear'], '2026-27');
    expect(sync.args['device'], fakeDevice);
    expect(api.confirmed, ['sync_gb_hmrc']);
    expect(find.text('Synced with HMRC: vat obligations, itsa businesses.'), findsOneWidget);
  });

  testWidgets('the hub offers to connect when HMRC is not connected', (tester) async {
    final api = GbFakeApi();
    await pumpUk(tester, api, const UkHubScreen());
    expect(find.text('Not connected to HMRC'), findsOneWidget);
    await tapIt(tester, find.widgetWithText(FilledButton, 'Connect to HMRC'));
    expect(find.text('Start connecting'), findsOneWidget);
  });

  testWidgets('the estimate sends the figures entered and shows the engine\'s breakdown, payments on account and the unreviewed note', (tester) async {
    final api = GbFakeApi();
    await pumpUk(tester, api, const UkEstimateScreen(taxYear: '2026-27'));
    await typeIn(tester, find.widgetWithText(TextField, 'Tax taken off through PAYE'), '12.345');
    expect(find.text('Enter an amount in pounds, like 1250.50'), findsOneWidget);
    await tapIt(tester, find.text('Work out my tax'));
    expect(api.queries.where((q) => q.name == 'gb_tax_estimate'), isEmpty);
    await typeIn(tester, find.widgetWithText(TextField, 'Tax taken off through PAYE'), '');
    await fillEstimate(tester);
    final call = api.queries.lastWhere((q) => q.name == 'gb_tax_estimate');
    expect(call.args['taxYear'], '2026-27');
    expect(call.args['income'], {'selfEmployment': {'turnover': 60000.0, 'expenses': 10000.0}});
    expect(find.text('£9,731.80 to pay by 31 Jan 2028'), findsOneWidget);
    expect(find.text('£7,486.00'), findsWidgets);
    expect(find.text('£2,245.80'), findsOneWidget);
    expect(find.text('£4,865.90 on 31 Jan 2028 and 31 Jul 2028, towards next year\'s bill.'), findsOneWidget);
    expect(find.textContaining('With the first payment on account, £14,597.70'), findsOneWidget);
    expect(find.text(unreviewedWords), findsOneWidget);
    expect(find.text('Basic rate at 20%'), findsOneWidget);
  });

  testWidgets('a refund estimate says how much comes back, and no note shows when the rules are reviewed', (tester) async {
    final api = GbFakeApi()..estimate = {...estimateData, 'balancingPayment': -514, 'refundDue': true, 'unreviewed': false, 'nextYear': {'paymentOnAccountEach': 0, 'dueDates': const [], 'why': 'The tax not deducted at source is under £1,000, so no payments on account are due for next year.'}};
    await pumpUk(tester, api, const UkEstimateScreen(taxYear: '2026-27'));
    await fillEstimate(tester);
    expect(find.text('About £514.00 back from HMRC'), findsOneWidget);
    expect(find.textContaining('under £1,000'), findsOneWidget);
    expect(find.text(unreviewedWords), findsNothing);
  });

  testWidgets('the VAT return cannot be sent until the declaration is ticked, then goes through the preview with the device information', (tester) async {
    final api = GbFakeApi()..connected = true;
    await pumpUk(tester, api, const UkVatReturnScreen(obligation: openObligation));
    await prepareVat(tester);
    final check = api.queries.lastWhere((q) => q.name == 'gb_vat_return_check');
    expect(check.args['periodKey'], '26A2');
    expect(check.args['from'], '2026-07-01');
    expect(check.args['to'], '2026-09-30');
    expect(check.args['sales'], [{'net': 10000.0, 'rate': 'standard'}]);
    expect(check.args['purchases'], [{'net': 2000.0, 'rate': 'standard'}]);
    expect(find.text('£1,600.00 to pay'), findsOneWidget);
    expect(find.text('Box 6. Total sales, excluding VAT'), findsOneWidget);
    expect(find.text('£10,000'), findsOneWidget);
    final submit = find.byKey(const Key('uk.vat.submit'));
    await tester.ensureVisible(submit);
    expect(tester.widget<FilledButton>(find.descendant(of: submit, matching: find.byType(FilledButton))).onPressed, isNull);
    await tester.tap(submit, warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(api.proposed('submit_gb_vat_return'), isEmpty);
    expect(find.text('Tick the declaration to send the return.'), findsOneWidget);
    await tapIt(tester, find.byKey(const Key('uk.vat.declare')));
    expect(tester.widget<FilledButton>(find.descendant(of: submit, matching: find.byType(FilledButton))).onPressed, isNotNull);
    await tapIt(tester, submit);
    final sent = api.proposed('submit_gb_vat_return').single;
    expect(sent.args['declaration'], isTrue);
    expect(sent.args['device'], fakeDevice);
    expect((sent.args['body'] as Map)['periodKey'], '26A2');
    expect(api.confirmed, isEmpty);
    expect(find.text('Send the VAT return for period 26A2: pay £1,600.00.'), findsOneWidget);
    await tapIt(tester, find.byKey(const Key('uk.preview.send')));
    expect(api.confirmed, ['submit_gb_vat_return']);
    expect(find.byKey(const Key('uk.vat.receipt')), findsOneWidget);
    expect(find.text('256660290587'), findsOneWidget);
    expect(find.text('XM002610011594'), findsOneWidget);
    expect(find.text('By Direct Debit'), findsOneWidget);
  });

  testWidgets('a VAT return for an HMRC period is built from the books unless the owner enters totals', (tester) async {
    final api = GbFakeApi();
    await pumpUk(tester, api, const UkVatReturnScreen(obligation: openObligation));
    expect(tester.widget<SwitchListTile>(find.byKey(const Key('uk.vat.fromBooks'))).value, isTrue);
    expect(find.byKey(const Key('uk.vat.sales.0.net')), findsNothing);
    await tapIt(tester, find.text('Check the return'));
    final call = api.queries.lastWhere((q) => q.name == 'gb_vat_return_check');
    expect(call.args['fromBooks'], isTrue);
    expect(call.args.containsKey('sales'), isFalse);
    expect(call.args['from'], openObligation.start);
    expect(find.byKey(const Key('uk.vat.review')), findsOneWidget);
    await enterVatByHand(tester);
    expect(find.byKey(const Key('uk.vat.review')), findsNothing);
    expect(find.byKey(const Key('uk.vat.sales.0.net')), findsOneWidget);
  });

  testWidgets('the UK plans screen shows UK prices and never rupees or GST', (tester) async {
    final api = GbFakeApi();
    await pumpUk(tester, api, const UkPlanScreen());
    for (final plan in ukPlans) {
      await tester.scrollUntilVisible(find.byKey(Key('uk.plan.${plan.id}')), 200, scrollable: find.byType(Scrollable).first);
      expect(find.text(plan.price), findsOneWidget);
    }
    expect(find.textContaining('₹'), findsNothing);
    expect(find.textContaining('GST'), findsNothing);
    expect(find.text(ukPlansNotOpen), findsOneWidget);
  });

  testWidgets('changing an amount after checking clears the declaration and needs a new check', (tester) async {
    final api = GbFakeApi();
    await pumpUk(tester, api, const UkVatReturnScreen(obligation: openObligation));
    await prepareVat(tester);
    await tapIt(tester, find.byKey(const Key('uk.vat.declare')));
    await typeIn(tester, find.byKey(const Key('uk.vat.sales.0.net')), '11000');
    expect(find.byKey(const Key('uk.vat.review')), findsNothing);
    expect(find.byKey(const Key('uk.vat.submit')), findsNothing);
  });

  testWidgets('cancelling the VAT preview discards it and sends nothing', (tester) async {
    final api = GbFakeApi();
    await pumpUk(tester, api, const UkVatReturnScreen(obligation: openObligation));
    await prepareVat(tester);
    await tapIt(tester, find.byKey(const Key('uk.vat.declare')));
    await tapIt(tester, find.byKey(const Key('uk.vat.submit')));
    await tapIt(tester, find.byKey(const Key('uk.preview.cancel')));
    expect(api.discarded, isTrue);
    expect(api.confirmed, isEmpty);
  });

  testWidgets('a return HMRC would refuse lists the problems and offers no send button', (tester) async {
    final api = GbFakeApi()..vatReady = false;
    await pumpUk(tester, api, const UkVatReturnScreen());
    await tapIt(tester, find.text('Check the return'));
    expect(find.text('Enter the period key HMRC gave for this return.'), findsOneWidget);
    await typeIn(tester, find.byKey(const Key('uk.vat.periodKey')), '26a2');
    await prepareVat(tester);
    expect(api.queries.lastWhere((q) => q.name == 'gb_vat_return_check').args['periodKey'], '26A2');
    expect(find.text('Fix these before sending'), findsOneWidget);
    expect(find.byKey(const Key('uk.vat.submit')), findsNothing);
  });

  testWidgets('the VAT list shows open periods first and sent ones as sent', (tester) async {
    final api = GbFakeApi()..connected = true;
    await pumpUk(tester, api, const UkVatScreen(taxYear: '2026-27'));
    expect(find.text('1 Jul 2026 to 30 Sep 2026'), findsOneWidget);
    expect(find.text('Due 7 Nov 2026'), findsOneWidget);
    expect(find.text('Sent to HMRC'), findsOneWidget);
    await tapIt(tester, find.byKey(const Key('uk.vat.obligation.26A2')));
    expect(find.text('Prepare VAT return'), findsOneWidget);
  });

  testWidgets('connecting opens the HMRC link, sends the code with its state, and shows the connection', (tester) async {
    final api = GbFakeApi();
    final opened = <Uri>[];
    await pumpUk(tester, api, const UkConnectScreen(taxYear: '2026-27'), opened: opened);
    expect(find.text('Not connected to HMRC'), findsOneWidget);
    await tapIt(tester, find.text('Finish connecting'));
    expect(find.text('Paste the code from HMRC first.'), findsOneWidget);
    await tapIt(tester, find.text('Start connecting'));
    expect(api.confirmed, ['connect_gb_hmrc']);
    expect(opened.single.toString(), 'https://test-api.service.hmrc.gov.uk/oauth/authorize?state=st-1');
    expect(find.byKey(const Key('uk.connect.url')), findsOneWidget);
    await typeIn(tester, find.byKey(const Key('uk.connect.code')), 'abc123');
    await tapIt(tester, find.text('Finish connecting'));
    final finish = api.proposed('finish_gb_hmrc_connection').single;
    expect(finish.args, {'code': 'abc123', 'state': 'st-1'});
    expect(find.text('Connected to HMRC sandbox'), findsWidgets);
    expect(find.text('Sync now'), findsOneWidget);
  });

  testWidgets('a pasted address from another sign-in is refused, and a deep link finishes the connection', (tester) async {
    final api = GbFakeApi();
    final links = StreamController<Uri>();
    addTearDown(links.close);
    await pumpUk(tester, api, UkConnectScreen(taxYear: '2026-27', links: links.stream));
    await tapIt(tester, find.text('Start connecting'));
    await typeIn(tester, find.byKey(const Key('uk.connect.code')), 'https://myca.example/hmrc/callback?code=zz&state=other');
    await tapIt(tester, find.text('Finish connecting'));
    expect(find.text('That code is from a different sign-in. Start connecting again.'), findsOneWidget);
    links.add(Uri.parse('com.mldynamic.myca.uk://hmrc?code=deep1&state=st-1'));
    await tester.pumpAndSettle();
    expect(api.proposed('finish_gb_hmrc_connection').last.args, {'code': 'deep1', 'state': 'st-1'});
    expect(api.connected, isTrue);
  });

  testWidgets('taxpayer numbers are checked by the engine, a bad one blocks saving, and only changed fields are sent', (tester) async {
    final api = GbFakeApi();
    await pumpUk(tester, api, const UkTaxpayerScreen());
    await typeIn(tester, find.byKey(const Key('uk.taxpayer.nino')), 'QQ123456C');
    await typeIn(tester, find.byKey(const Key('uk.taxpayer.utr')), '2234567890');
    expect(find.text('That is not a valid National Insurance number.'), findsOneWidget);
    await tapIt(tester, find.text('Save details'));
    expect(api.proposed('set_gb_taxpayer'), isEmpty);
    expect(find.text('Some numbers need a look.'), findsOneWidget);
    await typeIn(tester, find.byKey(const Key('uk.taxpayer.nino')), 'AA123456C');
    await tapIt(tester, find.byKey(const Key('uk.taxpayer.residence')));
    await tester.tap(find.text('Scotland').last);
    await tester.pumpAndSettle();
    await tapIt(tester, find.byKey(const Key('uk.taxpayer.plan.plan4')));
    await tapIt(tester, find.text('Save details'));
    final saved = api.proposed('set_gb_taxpayer').single;
    expect(saved.args, {'utr': '2234567890', 'nino': 'AA123456C', 'residence': 'scotland', 'studentLoans': ['plan4']});
    expect(find.byKey(const Key('uk.taxpayer.saved')), findsOneWidget);
    expect(find.text('Lives in Scotland'), findsOneWidget);
    expect(api.queries.where((q) => q.name == 'validate_gb_identifier').map((q) => q.args['kind']).toSet(), {'nino', 'utr'});
  });

  testWidgets('a quarterly update is prepared from cumulative totals and sent for the HMRC business with the device information', (tester) async {
    final api = GbFakeApi()..connected = true;
    await pumpUk(tester, api, UkQuarterScreen(taxYear: '2026-27', period: quarterOne, businesses: businesses));
    await typeIn(tester, find.descendant(of: find.byKey(const Key('uk.quarter.turnover')), matching: find.byType(TextField)), '12000');
    await typeIn(tester, find.descendant(of: find.byKey(const Key('uk.quarter.adminCosts')), matching: find.byType(TextField)), '400');
    await tapIt(tester, find.text('Check the update'));
    final check = api.queries.lastWhere((q) => q.name == 'gb_itsa_quarter_check');
    expect(check.args['periodStartDate'], '2026-04-06');
    expect(check.args['periodEndDate'], '2026-07-05');
    expect(check.args['transactions'], [{'field': 'turnover', 'amount': 12000.0}, {'field': 'adminCosts', 'amount': 400.0}]);
    expect(find.text('£11,600.00'), findsOneWidget);
    await tapIt(tester, find.byKey(const Key('uk.quarter.submit')));
    final sent = api.proposed('submit_gb_itsa_update').single;
    expect(sent.args['businessId'], 'XAIS12345678901');
    expect(sent.args['kind'], 'self-employment');
    expect(sent.args['device'], fakeDevice);
    await tapIt(tester, find.byKey(const Key('uk.preview.send')));
    expect(find.byKey(const Key('uk.mtd.receipt')), findsOneWidget);
  });

  testWidgets('the MTD screen lists the quarters, marks the sent one, checks the mandate and asks for a calculation', (tester) async {
    final api = GbFakeApi()..connected = true;
    await pumpUk(tester, api, const UkMtdScreen(taxYear: '2026-27'));
    expect(find.text('Quarter 1: to 5 Jul 2026'), findsOneWidget);
    expect(find.text('Sent to HMRC'), findsOneWidget);
    expect(find.text('Due 7 Feb 2027'), findsOneWidget);
    await tapIt(tester, find.text('Ask HMRC for a calculation'));
    final calc = api.proposed('trigger_gb_itsa_calculation').single;
    expect(calc.args, {'taxYear': '2026-27', 'calculationType': 'in-year', 'device': fakeDevice});
    expect(find.text('£9,731.80'), findsOneWidget);
    await typeIn(tester, find.descendant(of: find.byKey(const Key('uk.mtd.turnover')), matching: find.byType(TextField)), '45000');
    await tapIt(tester, find.text('Check'));
    expect(api.queries.lastWhere((q) => q.name == 'gb_mtd_mandate').args, {'selfEmploymentTurnover': 45000.0, 'propertyIncome': 0});
    expect(find.text('Required from 6 Apr 2026'), findsOneWidget);
  });

  testWidgets('the final declaration needs HMRC\'s final calculation and the statutory declaration before it is sent', (tester) async {
    final api = GbFakeApi()..connected = true;
    await pumpUk(tester, api, const UkFinalDeclarationScreen(taxYear: '2026-27'));
    expect(find.text(finalDeclarationWords), findsOneWidget);
    final submit = find.byKey(const Key('uk.final.submit'));
    expect(tester.widget<FilledButton>(find.descendant(of: submit, matching: find.byType(FilledButton))).onPressed, isNull);
    await finalCalculation(tester);
    expect(api.proposed('trigger_gb_itsa_calculation').single.args['calculationType'], 'intent-to-finalise');
    expect(tester.widget<FilledButton>(find.descendant(of: submit, matching: find.byType(FilledButton))).onPressed, isNull);
    await tickDeclaration(tester);
    await tapIt(tester, submit);
    final sent = api.proposed('submit_gb_final_declaration').single;
    expect(sent.args, {'taxYear': '2026-27', 'calculationId': 'c-1', 'declaration': true, 'declaredBy': 'taxpayer', 'device': fakeDevice});
    await tapIt(tester, find.byKey(const Key('uk.preview.send')));
    expect(find.byKey(const Key('uk.final.receipt')), findsOneWidget);
    expect(api.confirmed.last, 'submit_gb_final_declaration');
  });

  Finder submitButton() => find.descendant(of: find.byKey(const Key('uk.final.submit')), matching: find.byType(FilledButton));

  bool ticked(WidgetTester tester) => tester.widget<CheckboxListTile>(find.byKey(const Key('uk.final.declare'))).value == true;

  test('the declaration constants are HMRC\'s exact words', () {
    expect(declarationPreamble, 'Before you can submit the information displayed here in response to your notice to file from HM Revenue & Customs, you must read and agree to the following statement.');
    expect(finalDeclarationWords, 'I declare that the information and tax return I have submitted are (taken together) correct and complete to the best of my knowledge. I understand that I may have to pay financial penalties and face prosecution if I give false information.');
    expect(agentDeclarationWords, 'I confirm that my client has received a copy of all the information being filed and approved the information as being correct and complete to the best of their knowledge and belief. My client understands that they may have to pay financial penalties and face prosecution if they give false information.');
    expect(finalDeclarationWords, hmrcTaxpayerWords);
    expect(agentDeclarationWords, hmrcAgentWords);
    expect(declarationPreamble, hmrcPreamble);
  });

  testWidgets('the final declaration shows HMRC\'s preamble and statement, from the engine when it sends them', (tester) async {
    final api = GbFakeApi()..connected = true;
    await pumpUk(tester, api, const UkFinalDeclarationScreen(taxYear: '2026-27'));
    expect(find.text(hmrcPreamble), findsOneWidget);
    expect(find.text(hmrcTaxpayerWords), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('uk.final.statement'))).data, hmrcTaxpayerWords);
    expect(find.text('I\'m the taxpayer'), findsOneWidget);
    expect(find.text('I\'m the agent sending this for my client'), findsOneWidget);
    expect(api.queries.map((q) => q.name), contains('gb_hmrc_status'));
  });

  testWidgets('without words from the engine the screen falls back to the same HMRC words', (tester) async {
    final api = GbFakeApi()
      ..connected = true
      ..sendDeclarationWords = false;
    await pumpUk(tester, api, const UkFinalDeclarationScreen(taxYear: '2026-27'));
    expect(find.text(declarationPreamble), findsOneWidget);
    expect(find.text(finalDeclarationWords), findsOneWidget);
    await tapIt(tester, find.byKey(const Key('uk.final.who.agent')));
    expect(find.text(agentDeclarationWords), findsOneWidget);
  });

  testWidgets('switching to the agent swaps the words, clears the tick, and sends declaredBy agent', (tester) async {
    final api = GbFakeApi()..connected = true;
    await pumpUk(tester, api, const UkFinalDeclarationScreen(taxYear: '2026-27'));
    await finalCalculation(tester);
    await tickDeclaration(tester);
    expect(ticked(tester), isTrue);
    expect(tester.widget<FilledButton>(submitButton()).onPressed, isNotNull);
    await tapIt(tester, find.byKey(const Key('uk.final.who.agent')));
    expect(ticked(tester), isFalse);
    expect(tester.widget<FilledButton>(submitButton()).onPressed, isNull);
    expect(find.text(hmrcAgentWords), findsOneWidget);
    expect(find.text(hmrcTaxpayerWords), findsNothing);
    await tickDeclaration(tester);
    await tapIt(tester, find.byKey(const Key('uk.final.who.taxpayer')));
    expect(ticked(tester), isFalse);
    await tapIt(tester, find.byKey(const Key('uk.final.who.agent')));
    await tickDeclaration(tester);
    await tapIt(tester, find.byKey(const Key('uk.final.submit')));
    final sent = api.proposed('submit_gb_final_declaration').single;
    expect(sent.args['declaredBy'], 'agent');
    expect(sent.args['declaration'], isTrue);
    expect(find.text('Declaration: $hmrcAgentWords'), findsOneWidget);
    await tapIt(tester, find.byKey(const Key('uk.preview.send')));
    expect(find.text('HMRC has your final declaration'), findsOneWidget);
    expect(find.text('Declared by the agent for their client.'), findsOneWidget);
    expect(find.text('You can amend it until 31 Jan 2029.'), findsOneWidget);
  });

  testWidgets('the final calculation is shown in full like an SA302, skipping lines HMRC left out', (tester) async {
    final api = GbFakeApi()..connected = true;
    await pumpUk(tester, api, const UkFinalDeclarationScreen(taxYear: '2026-27'));
    await finalCalculation(tester);
    expect(find.byKey(const Key('uk.calc.breakdown')), findsOneWidget);
    for (final label in ['INCOME', 'ALLOWANCES', 'INCOME TAX', 'NATIONAL INSURANCE', 'OTHER', 'Self-employment profit', 'UK property profit', 'Employment income', 'Total income', 'Personal Allowance', 'Total allowances and deductions', 'Taxable income', 'Income Tax charged', 'Income Tax due', 'Class 2 National Insurance', 'Class 4 National Insurance', 'Total National Insurance', 'Student Loan repayment', 'Total due']) {
      expect(find.text(label), findsOneWidget, reason: label);
    }
    expect(find.text('Pay, pensions and profit: Basic rate at 20% on £37,430.00'), findsOneWidget);
    for (final skipped in ['Foreign property profit', 'Tax reliefs', 'Capital Gains Tax', 'Tax already taken off']) {
      expect(find.text(skipped), findsNothing, reason: skipped);
    }
    expect(find.text('£42,000.00'), findsOneWidget);
    expect(find.text('£8,000.00'), findsOneWidget);
    expect(find.text('£12,570.00'), findsNWidgets(2));
    expect(find.text('£1,745.80'), findsNWidgets(2));
    expect(find.text('£500.00'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('uk.calc.total')), matching: find.text('£9,731.80')), findsOneWidget);
    expect(find.byKey(const Key('uk.calc.messages')), findsNothing);
  });

  testWidgets('HMRC errors on the calculation are shown and keep the declaration and the send button off', (tester) async {
    final api = GbFakeApi()
      ..connected = true
      ..calculationHasErrors = true
      ..calculationWarns = true;
    await pumpUk(tester, api, const UkFinalDeclarationScreen(taxYear: '2026-27'));
    await finalCalculation(tester);
    expect(find.text('MESSAGES FROM HMRC'), findsOneWidget);
    expect(find.text('A final declaration cannot be made while quarterly updates are missing. (C55001)'), findsOneWidget);
    expect(find.text('Your property income allowance claim has been capped. (C22201)'), findsOneWidget);
    expect(find.textContaining('HMRC listed errors on this calculation'), findsOneWidget);
    expect(tester.widget<CheckboxListTile>(find.byKey(const Key('uk.final.declare'))).onChanged, isNull);
    await tester.tap(find.byKey(const Key('uk.final.declare')), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(ticked(tester), isFalse);
    expect(tester.widget<FilledButton>(submitButton()).onPressed, isNull);
    expect(api.proposed('submit_gb_final_declaration'), isEmpty);
    api.calculationHasErrors = false;
    await tapIt(tester, find.text('Ask again'));
    expect(find.byKey(const Key('uk.calc.messages')), findsOneWidget);
    expect(find.textContaining('(C55001)'), findsNothing);
    await tickDeclaration(tester);
    expect(tester.widget<FilledButton>(submitButton()).onPressed, isNotNull);
  });

  testWidgets('a sent return shows on the MTD screen with Amend this return, and the amendment goes through the same declaration', (tester) async {
    final api = GbFakeApi()..connected = true;
    api.returns.add(sentReturn());
    await pumpUk(tester, api, const UkMtdScreen(taxYear: '2026-27'));
    expect(find.text('Your 2026-27 return is with HMRC'), findsOneWidget);
    expect(find.text('You can amend it until 31 Jan 2029.'), findsOneWidget);
    expect(find.text('Start the final declaration'), findsNothing);
    await tapIt(tester, find.text('Amend this return'));
    expect(find.text('Amend 2026-27 return'), findsOneWidget);
    await tapIt(tester, find.text('Ask HMRC for the amendment calculation'));
    final calc = api.proposed('trigger_gb_itsa_calculation').single;
    expect(calc.args['calculationType'], 'intent-to-amend');
    expect(calc.args['device'], fakeDevice);
    expect(find.text('Calculation for an amendment'), findsOneWidget);
    expect(find.byKey(const Key('uk.calc.breakdown')), findsOneWidget);
    expect(find.text(hmrcPreamble), findsOneWidget);
    expect(find.text(hmrcTaxpayerWords), findsOneWidget);
    await tickDeclaration(tester);
    await tapIt(tester, find.byKey(const Key('uk.final.submit')));
    final sent = api.proposed('submit_gb_final_declaration').single;
    expect(sent.args, {'taxYear': '2026-27', 'calculationId': 'c-1', 'declaration': true, 'declaredBy': 'taxpayer', 'device': fakeDevice});
    expect(find.text('Confirm the amendment to the 2026-27 tax return to HMRC: Income Tax and NICs due £9,731.80.'), findsOneWidget);
    expect(api.confirmed, ['trigger_gb_itsa_calculation']);
    await tapIt(tester, find.byKey(const Key('uk.preview.send')));
    expect(find.text('HMRC has your amended return'), findsOneWidget);
    expect(api.returns.single['type'], 'confirm-amendment');
    await tapIt(tester, find.text('Done'));
    expect(find.text('Your amended 2026-27 return is with HMRC'), findsOneWidget);
  });

  testWidgets('after the amendment window closes the return shows as sent with no amend button', (tester) async {
    final api = GbFakeApi()..connected = true;
    api.returns.add(sentReturn(closes: '2026-01-31'));
    await pumpUk(tester, api, const UkMtdScreen(taxYear: '2026-27'));
    expect(find.text('Your 2026-27 return is with HMRC'), findsOneWidget);
    expect(find.text('Amend this return'), findsNothing);
    expect(find.textContaining('Amendments for 2026-27 closed on 31 Jan 2026'), findsOneWidget);
  });

  testWidgets('the engine\'s refusals read as plain words with readable dates', (tester) async {
    final cases = <String, (bool, String)>{
      'TAX_YEAR_NOT_ENDED': (false, 'The final declaration for 2026-27 can be made from 6 Apr 2027.'),
      'AMENDMENT_WINDOW_CLOSED': (true, 'Amendments for 2026-27 had to reach HMRC by 31 Jan 2026. Ask HMRC about an overpayment relief claim instead.'),
      'NO_RETURN_TO_AMEND': (true, 'There is no return to amend yet. Send the final declaration for this tax year first.'),
      'FINAL_DECLARATION_ALREADY_SENT': (false, 'The return for this tax year is already with HMRC. To change it, amend the return instead.'),
    };
    for (final c in cases.entries) {
      final api = GbFakeApi()
        ..connected = true
        ..refuseCalculation = c.key;
      await tester.pumpWidget(const SizedBox());
      await pumpUk(tester, api, UkFinalDeclarationScreen(taxYear: '2026-27', amend: c.value.$1));
      await tapIt(tester, find.text(c.value.$1 ? 'Ask HMRC for the amendment calculation' : 'Ask HMRC for the final calculation'));
      expect(find.text(c.value.$2), findsOneWidget, reason: c.key);
      expect(find.byKey(const Key('uk.calc.breakdown')), findsNothing);
    }
    expect(ukErrorWords({'ok': false, 'error': 'CALCULATION_HAS_ERRORS', 'hint': 'x'}), 'HMRC listed errors on this calculation. Fix the updates it names, then ask for a new calculation.');
    expect(ukErrorWords({'ok': false, 'error': 'BAD_DECLARER'}), 'Say who is declaring: the taxpayer or their agent.');
  });

  testWidgets('a final declaration for a year with a return already sent is refused without the code', (tester) async {
    final api = GbFakeApi()..connected = true;
    api.returns.add(sentReturn());
    await pumpUk(tester, api, const UkFinalDeclarationScreen(taxYear: '2026-27'));
    await finalCalculation(tester);
    expect(find.text('The return for this tax year is already with HMRC. To change it, amend the return instead.'), findsOneWidget);
    expect(find.textContaining('FINAL_DECLARATION'), findsNothing);
  });

  testWidgets('bad amounts the engine refuses are shown next to the estimate fields', (tester) async {
    final api = GbFakeApi();
    ukSetups['estimate with bad amounts']!(api);
    await pumpUk(tester, api, const UkEstimateScreen(taxYear: '2026-27'));
    await fillEstimate(tester);
    expect(find.text('Some amounts need a look. HMRC needs pounds and pence, like 1250.50.'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('uk.estimate.dividends')), matching: find.text('Give an amount in pounds, like 1250.50.')), findsOneWidget);
    expect(find.text('Amounts cannot be negative here. Enter costs as expenses, not as negative income.'), findsOneWidget);
    expect(find.byKey(const Key('uk.estimate.result')), findsNothing);
    await typeIn(tester, find.widgetWithText(TextField, 'Dividends'), '10');
    expect(find.descendant(of: find.byKey(const Key('uk.estimate.dividends')), matching: find.text('Give an amount in pounds, like 1250.50.')), findsNothing);
  });

  testWidgets('bad VAT amounts are shown on the line the engine names', (tester) async {
    final api = GbFakeApi();
    ukSetups['VAT return with bad amounts']!(api);
    await pumpUk(tester, api, const UkVatReturnScreen(obligation: openObligation));
    await enterVatByHand(tester);
    await typeIn(tester, find.byKey(const Key('uk.vat.sales.0.net')), '10000');
    await typeIn(tester, find.byKey(const Key('uk.vat.purchases.0.net')), '2000');
    await tapIt(tester, find.text('Add a sales line'));
    await typeIn(tester, find.byKey(const Key('uk.vat.sales.1.net')), '-200');
    await tapIt(tester, find.text('Check the return'));
    final check = api.queries.lastWhere((q) => q.name == 'gb_vat_return_check');
    expect(check.args['sales'], [{'net': 10000.0, 'rate': 'standard'}, {'net': -200.0, 'rate': 'standard'}]);
    expect(find.text('Some amounts need a look. HMRC needs pounds and pence, like 1250.50.'), findsOneWidget);
    expect(find.descendant(of: find.byKey(const Key('uk.vat.sales.0.net')), matching: find.text('Give an amount in pounds, like 1250.50.')), findsOneWidget);
    expect(find.byKey(const Key('uk.vat.review')), findsNothing);
  });

  testWidgets('a landlord quarter is sent as transactions and the engine\'s problems hold it back', (tester) async {
    final api = GbFakeApi()..connected = true;
    ukSetups['landlord quarter with problems']!(api);
    await pumpUk(tester, api, UkQuarterScreen(taxYear: '2026-27', period: quarterOne, businesses: businesses));
    await ukScreens['landlord quarter with problems']!.$2(tester, api);
    final check = api.queries.lastWhere((q) => q.name == 'gb_itsa_quarter_check');
    expect(check.args['kind'], 'uk-property');
    expect(check.args['transactions'], [{'field': 'periodAmount', 'amount': 3000.0}, {'field': 'residentialFinancialCost', 'amount': 900.0}]);
    expect(check.args.containsKey('income'), isFalse);
    expect(find.descendant(of: find.byKey(const Key('uk.quarter.periodAmount')), matching: find.text('Amounts cannot be negative here. Enter costs as expenses, not as negative income.')), findsOneWidget);
    expect(find.text('1 transactions have a category MyCA cannot map to an HMRC box; pick a box for each.'), findsOneWidget);
    expect(find.byKey(const Key('uk.quarter.submit')), findsNothing);
    expect(find.text('£11,600.00'), findsOneWidget);
  });

  testWidgets('the hub opens the list of everything sent to HMRC, which can be filtered', (tester) async {
    final api = GbFakeApi()..connected = true;
    ukSetups['history with submissions']!(api);
    await pumpUk(tester, api, const UkHubScreen());
    await tapIt(tester, find.byKey(const Key('uk.hub.history')));
    expect(find.text('Sent to HMRC'), findsWidgets);
    expect(api.queries.last.name, 'gb_hmrc_history');
    expect(api.queries.last.args, isEmpty);
    expect(find.text('3 submissions'), findsOneWidget);
    expect(find.text('Amended return 2026-27'), findsOneWidget);
    expect(find.text('Quarterly update 2026-27 to 5 Jul 2026'), findsOneWidget);
    expect(find.text('VAT return 26A2'), findsOneWidget);
    expect(find.textContaining('reference 256660290587'), findsOneWidget);
    expect(find.textContaining('by the agent'), findsOneWidget);
    await tapIt(tester, find.byKey(const Key('uk.history.kind')));
    await tester.tap(find.text('VAT returns').last);
    await tester.pumpAndSettle();
    expect(api.queries.last.args, {'kind': 'vat'});
    expect(find.text('1 submission'), findsOneWidget);
    expect(find.text('Amended return 2026-27'), findsNothing);
  });

  testWidgets('the history says when nothing has been sent', (tester) async {
    await pumpUk(tester, GbFakeApi(), const UkHistoryScreen());
    expect(find.byKey(const Key('uk.history.empty')), findsOneWidget);
    expect(find.text('Nothing sent to HMRC yet.'), findsOneWidget);
  });

  testWidgets('no UK screen claims HMRC approval', (tester) async {
    for (final screen in ukScreens.entries) {
      final api = GbFakeApi()..connected = true;
      await tester.pumpWidget(const SizedBox());
      await pumpUkScreen(tester, screen.key, api);
      await scrollToEnd(tester);
      for (final banned in ['approved', 'accredited', 'recognised', 'recognized']) {
        expect(find.textContaining(RegExp('HMRC[- ]$banned', caseSensitive: false)), findsNothing, reason: screen.key);
      }
    }
  });
}
