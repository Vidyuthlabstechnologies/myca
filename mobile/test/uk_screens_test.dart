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
import 'package:myca/uk/uk_hub_screen.dart';
import 'package:myca/uk/uk_mtd_screen.dart';
import 'package:myca/uk/uk_taxpayer_screen.dart';
import 'package:myca/uk/uk_vat_screen.dart';

import 'cloud_test.dart' show signedIn, sessionOn;
import 'fake_api.dart';
import 'fake_cloud.dart';
import 'uk_fake_api.dart';

typedef UkWalk = Future<void> Function(WidgetTester tester, GbFakeApi api);

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

Future<void> prepareVat(WidgetTester tester) async {
  await typeIn(tester, find.byKey(const Key('uk.vat.sales.0.net')), '10000');
  await typeIn(tester, find.byKey(const Key('uk.vat.purchases.0.net')), '2000');
  await tapIt(tester, find.text('Check the return'));
}

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
      await tapIt(t, find.byKey(const Key('uk.final.declare')));
      await tapIt(t, find.byKey(const Key('uk.final.submit')));
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
            await pumpUk(tester, api, screen.value.$1());
            await screen.value.$2(tester, api);
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
    await tapIt(tester, find.byKey(const Key('uk.final.declare')));
    await tapIt(tester, submit);
    final sent = api.proposed('submit_gb_final_declaration').single;
    expect(sent.args, {'taxYear': '2026-27', 'calculationId': 'c-1', 'declaration': true, 'device': fakeDevice});
    await tapIt(tester, find.byKey(const Key('uk.preview.send')));
    expect(find.byKey(const Key('uk.final.receipt')), findsOneWidget);
    expect(api.confirmed.last, 'submit_gb_final_declaration');
  });

  testWidgets('no UK screen claims HMRC approval', (tester) async {
    for (final screen in ukScreens.entries) {
      final api = GbFakeApi()..connected = true;
      await tester.pumpWidget(const SizedBox());
      await pumpUk(tester, api, screen.value.$1());
      await screen.value.$2(tester, api);
      await scrollToEnd(tester);
      for (final banned in ['approved', 'accredited', 'recognised', 'recognized']) {
        expect(find.textContaining(RegExp('HMRC[- ]$banned', caseSensitive: false)), findsNothing, reason: screen.key);
      }
    }
  });
}
