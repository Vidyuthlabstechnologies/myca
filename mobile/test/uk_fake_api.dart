import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_state.dart';
import 'package:myca/uk/hmrc_device.dart';
import 'package:myca_design/myca_design.dart' show MycaDesign;

import 'fake_api.dart';

const fakeDevice = <String, Object?>{
  'deviceId': '3f2b8c1a-1d2e-4f5a-9b6c-7d8e9f0a1b2c',
  'timezone': 'UTC+00:00',
  'screens': [
    {'width': 1080, 'height': 2340, 'scalingFactor': 2.75, 'colourDepth': 24},
  ],
  'windowWidth': 393,
  'windowHeight': 851,
  'osFamily': 'Android',
  'osVersion': '15',
  'localIps': ['10.0.0.12'],
  'localIpsTimestamp': '2026-11-14T10:00:00.000Z',
  'appVersion': '1.0.0+1',
};

final estimateData = <String, Object?>{
  'taxYear': '2026-27',
  'residence': 'england',
  'income': {'employment': 0, 'selfEmploymentProfit': 50000, 'total': 50000, 'adjustedNetIncome': 50000},
  'allowances': {'personalAllowance': 12570, 'bandExtension': 0},
  'incomeTaxBands': [
    {'income': 'non-savings', 'band': 'basic', 'ratePercent': 20, 'amount': 37430, 'tax': 7486},
  ],
  'reductions': const [],
  'incomeTax': 7486,
  'highIncomeChildBenefitCharge': 0,
  'class4': {'rows': const [], 'total': 2245.8},
  'class2Voluntary': 0,
  'studentLoan': {'income': 50000, 'rows': const [], 'deductedThroughPaye': 0, 'due': 0},
  'capitalGains': {'rows': const [], 'tax': 0, 'annualExemptUsed': 0, 'lossesCarriedForward': 0},
  'totalLiability': 9731.8,
  'deductedAtSource': 0,
  'paymentsOnAccountMade': 0,
  'balancingPayment': 9731.8,
  'refundDue': false,
  'nextYear': {
    'paymentOnAccountEach': 4865.9,
    'dueDates': ['2028-01-31', '2028-07-31'],
    'why': '',
  },
  'dueBy': '2028-01-31',
  'firstPaymentDue': 14597.7,
  'notes': ['Profits are over the small profits threshold, so Class 2 is treated as paid and the year counts for State Pension.'],
  'unreviewed': true,
};

class GbFakeApi implements MycaApi {
  final proposals = <Proposal>[];
  final confirmed = <String>[];
  final queries = <QueryCall>[];
  final _pending = <String, Proposal>{};
  int _token = 0;
  bool connected = false;
  bool discarded = false;
  bool vatSent = false;
  bool lastSync = false;
  Map<String, Object?> estimate = estimateData;
  bool vatReady = true;
  final calculations = <Map<String, Object?>>[];

  @override
  Future<Snapshot> snapshot() async => Snapshot.fromJson({
    'company': {'name': 'Test Trader', 'gstin': '', 'country': 'GB'},
    'invoices': const [],
    'purchases': const [],
    'expenses': const [],
    'users': const [
      {'userId': 'USR-ADMIN', 'name': 'Alex', 'role': 'admin', 'locked': false},
    ],
    'activeUser': const {'userId': 'USR-ADMIN', 'name': 'Alex', 'role': 'admin', 'locked': false},
  });

  @override
  Future<SignInResult> signIn(String userId, String pin) async => const SignInResult(ok: true, error: '');

  @override
  Future<void> signOut() async {}

  @override
  Future<ChatReply> chat(String message) async => ChatReply.fromJson({'reply': 'ok'});

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async {
    proposals.add(Proposal(name, args));
    if ((name == 'submit_gb_vat_return' || name == 'submit_gb_final_declaration') && args['declaration'] != true) {
      return ChatReply.fromJson({'reply': 'I did not send anything, because:\n· The business must declare that the return is true and complete.', 'blocked': true});
    }
    final token = 'tok${_token++}';
    _pending[token] = Proposal(name, args);
    final summary = switch (name) {
      'submit_gb_vat_return' => 'Send the VAT return for period ${ukBody(args)['periodKey']}: pay £1,600.00.',
      'submit_gb_final_declaration' => 'Send the ${args['taxYear']} final declaration to HMRC: Income Tax and NICs due £9,731.80.',
      'submit_gb_itsa_update' => 'Send the cumulative self-employment update for ${args['taxYear']}.',
      _ => 'Do $name.',
    };
    return ChatReply.fromJson({
      'reply': summary,
      'awaitingConfirmation': true,
      'preview': {'token': token, 'summary': summary, 'effects': ['HMRC records it straight away and it cannot be changed.']},
    });
  }

  static Map<String, Object?> ukBody(Map<String, Object?> args) => (args['body'] as Map?)?.cast<String, Object?>() ?? const {};

  Map<String, Object?> _ok(Map<String, Object?> data, {bool mock = false}) => {'ok': true, if (mock) 'mock': true, 'data': data};

  @override
  Future<ChatReply> confirm(String token) async {
    final p = _pending.remove(token);
    if (p == null) return ChatReply.fromJson({'reply': 'That preview expired.', 'posted': false});
    confirmed.add(p.tool);
    final Map<String, Object?> result = switch (p.tool) {
      'connect_gb_hmrc' => _ok({'authorizeUrl': 'https://test-api.service.hmrc.gov.uk/oauth/authorize?state=st-1', 'state': 'st-1', 'environment': 'test'}),
      'finish_gb_hmrc_connection' => p.args['state'] == 'st-1' ? _ok({'status': 'connected', 'environment': 'test'}) : {'ok': false, 'error': 'HMRC_STATE_MISMATCH'},
      'sync_gb_hmrc' => _ok({'taxYear': p.args['taxYear'], 'pulled': ['vat-obligations', 'itsa-businesses'], 'problems': const []}),
      'disconnect_gb_hmrc' => _ok({'status': 'not-connected', 'hint': 'MyCA has deleted its HMRC tokens.'}),
      'set_gb_taxpayer' => _ok({'saved': true, 'name': p.args['name'] ?? '', 'utr': '••••••7890', 'nino': '•••••456C', 'vrn': '•••••9973', 'residence': p.args['residence'] ?? 'england', 'studentLoans': p.args['studentLoans'] ?? const []}),
      'submit_gb_vat_return' => _ok({'vrn': '999999973', 'periodKey': ukBody(p.args)['periodKey'], 'processingDate': '2026-11-14T10:05:00.000Z', 'formBundleNumber': '256660290587', 'paymentIndicator': 'DD', 'chargeRefNumber': 'XM002610011594', 'netVatDue': 1600, 'environment': 'test', 'correlationId': 'corr-1'}),
      'submit_gb_itsa_update' => _ok({'kind': p.args['kind'], 'businessId': p.args['businessId'], 'taxYear': p.args['taxYear'], 'periodEnd': '2026-07-05', 'environment': 'test', 'correlationId': 'corr-2', 'hint': 'Updates are cumulative: the next one replaces this from the start of the tax year.'}),
      'trigger_gb_itsa_calculation' => _ok({'calculationId': 'c-${calculations.length + 1}', 'taxYear': p.args['taxYear'], 'calculationType': p.args['calculationType'] ?? 'in-year', 'incomeTax': 7486, 'nics': 2245.8, 'totalIncomeTaxAndNicsDue': 9731.8, 'totalTaxableIncome': 37430}),
      'submit_gb_final_declaration' => _ok({'taxYear': p.args['taxYear'], 'calculationId': p.args['calculationId'], 'type': 'intent-to-finalise', 'totalDue': 9731.8, 'environment': 'test', 'correlationId': 'corr-3', 'at': '2026-11-14T10:10:00.000Z'}),
      _ => _ok(const {}),
    };
    if (p.tool == 'finish_gb_hmrc_connection' && result['ok'] == true) connected = true;
    if (p.tool == 'disconnect_gb_hmrc') connected = false;
    if (p.tool == 'sync_gb_hmrc') lastSync = true;
    if (p.tool == 'submit_gb_vat_return') vatSent = true;
    if (p.tool == 'trigger_gb_itsa_calculation') calculations.add(ukDataOf(result));
    final ok = result['ok'] != false;
    return ChatReply.fromJson({
      'reply': ok ? 'Done.' : 'That code is from a different sign-in.',
      'posted': ok,
      'tools': [
        {'name': p.tool, 'result': result},
      ],
    });
  }

  static Map<String, Object?> ukDataOf(Map<String, Object?> result) => (result['data'] as Map).cast<String, Object?>();

  @override
  Future<ChatReply> discard() async {
    discarded = true;
    _pending.clear();
    return ChatReply.fromJson({'reply': 'Not sent.'});
  }

  Map<String, Object?> status() => {
    'status': connected ? 'connected' : 'not-connected',
    'environment': connected ? 'test' : '',
    'serviceEnvironment': 'test',
    'scopes': const [],
    'connectedAt': connected ? '2026-11-14T09:00:00.000Z' : null,
    'accessTokenValid': connected,
    'lastSync': lastSync ? '2026-11-14T09:30:00.000Z' : null,
    'vatObligations': [
      {'periodKey': '26A2', 'start': '2026-07-01', 'end': '2026-09-30', 'due': '2026-11-07', 'status': vatSent ? 'fulfilled' : 'open'},
      {'periodKey': '26A1', 'start': '2026-04-01', 'end': '2026-06-30', 'due': '2026-08-07', 'status': 'fulfilled'},
    ],
    'itsaBusinesses': [
      {'typeOfBusiness': 'self-employment', 'businessId': 'XAIS12345678901', 'tradingName': 'Sole trade'},
      {'typeOfBusiness': 'uk-property', 'businessId': 'XPIS12345678901'},
    ],
    'itsaObligations': [
      {'typeOfBusiness': 'self-employment', 'businessId': 'XAIS12345678901', 'from': '2026-04-06', 'to': '2026-07-05', 'due': '2026-08-07', 'status': 'fulfilled'},
    ],
    'calculations': calculations,
    'fraudHeaderCheck': null,
    'missingSettings': const [],
  };

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    queries.add(QueryCall(name, args));
    switch (name) {
      case 'gb_hmrc_status':
        return _ok(status());
      case 'gb_tax_calendar':
        return _ok({
          'taxYear': args['taxYear'],
          'events': [
            {'date': '2026-08-07', 'what': 'MTD Income Tax update 1 (2026-04-06 to 2026-07-05)', 'kind': 'mtd-update', 'past': true},
            {'date': '2026-11-07', 'what': 'VAT return and payment for the period to 2026-09-30', 'kind': 'vat', 'past': true},
            {'date': '2027-01-31', 'what': 'First payment on account for 2026-27', 'kind': 'payment', 'past': false},
            {'date': '2027-02-07', 'what': 'MTD Income Tax update 3 (2026-04-06 to 2027-01-05)', 'kind': 'mtd-update', 'past': false},
            {'date': '2027-05-07', 'what': 'MTD Income Tax update 4 (2026-04-06 to 2027-04-05)', 'kind': 'mtd-update', 'past': false},
            {'date': '2028-01-31', 'what': 'Online tax return (or MTD final declaration) and balancing payment for 2026-27', 'kind': 'return', 'past': false},
          ],
          'next': {'date': '2027-01-31', 'what': 'First payment on account for 2026-27', 'kind': 'payment', 'past': false},
        });
      case 'validate_gb_identifier':
        final value = '${args['value']}'.replaceAll(' ', '').toUpperCase();
        final valid = switch (args['kind']) {
          'utr' => value == '2234567890',
          'nino' => RegExp(r'^[A-Z]{2}\d{6}[A-D]$').hasMatch(value) && !value.startsWith('QQ'),
          'vrn' => value == '999999973' || value == 'GB999999973',
          _ => false,
        };
        final what = switch (args['kind']) { 'utr' => 'UTR', 'nino' => 'National Insurance number', _ => 'VAT registration number' };
        return _ok({'kind': args['kind'], 'what': what, 'value': value, 'valid': valid, if (!valid) 'why': 'That is not a valid $what.'});
      case 'gb_tax_estimate':
        return _ok(estimate);
      case 'gb_vat_return_check':
        final body = {'periodKey': '${args['periodKey']}', 'vatDueSales': 2000, 'vatDueAcquisitions': 0, 'totalVatDue': 2000, 'vatReclaimedCurrPeriod': 400, 'netVatDue': 1600, 'totalValueSalesExVAT': 10000, 'totalValuePurchasesExVAT': 2000, 'totalValueGoodsSuppliedExVAT': 0, 'totalAcquisitionsExVAT': 0, 'finalised': false};
        return _ok({
          'scheme': 'standard',
          'body': body,
          'boxes': {'1': 2000, '2': 0, '3': 2000, '4': 400, '5': 1600, '6': 10000, '7': 2000, '8': 0, '9': 0},
          'direction': 'pay',
          'flatRate': null,
          'dueBy': '2026-11-07',
          'problems': vatReady ? const [] : [
            {'field': 'periodKey', 'why': 'The period key is the four characters HMRC gives with the obligation.'},
          ],
          'ready': vatReady,
          'notes': const [],
          'unreviewed': true,
        });
      case 'gb_mtd_periods':
        return _ok({
          'taxYear': args['taxYear'],
          'calendarQuarters': false,
          'periods': [
            {'quarter': 1, 'from': '2026-04-06', 'to': '2026-07-05', 'cumulativeFrom': '2026-04-06', 'dueBy': '2026-08-07'},
            {'quarter': 2, 'from': '2026-07-06', 'to': '2026-10-05', 'cumulativeFrom': '2026-04-06', 'dueBy': '2026-11-07'},
            {'quarter': 3, 'from': '2026-10-06', 'to': '2027-01-05', 'cumulativeFrom': '2026-04-06', 'dueBy': '2027-02-07'},
            {'quarter': 4, 'from': '2027-01-06', 'to': '2027-04-05', 'cumulativeFrom': '2026-04-06', 'dueBy': '2027-05-07'},
          ],
          'finalDeclarationBy': '2028-01-31',
        });
      case 'gb_mtd_mandate':
        return _ok({'qualifyingIncome': 55000, 'mustJoinFrom': '2026-04-06', 'why': 'Qualifying income of £55,000.00 is over the £50,000 threshold, so Making Tax Digital for Income Tax applies from 2026-04-06.', 'unreviewed': true});
      case 'gb_itsa_quarter_check':
        return _ok({
          'taxYear': args['taxYear'],
          'body': {'periodDates': {'periodStartDate': args['periodStartDate'], 'periodEndDate': args['periodEndDate']}, 'periodIncome': {'turnover': 12000}, 'periodExpenses': {'consolidatedExpenses': 400}},
          'consolidated': true,
          'totals': {'income': 12000, 'expenses': 400, 'disallowable': 0, 'profit': 11600},
          'problems': const [],
          'ready': true,
        });
    }
    return {'ok': false, 'error': 'UNKNOWN_TOOL'};
  }

  @override
  Future<String> upload(String name, String content) async => 'sha-$name';

  @override
  Future<ToolOutcome> updateCompany({required String name, String gstin = ''}) async => const ToolOutcome(ok: true, error: '');

  List<Proposal> proposed(String tool) => [for (final p in proposals) if (p.tool == tool) p];
}

AppState gbState(GbFakeApi api, {List<Uri>? opened}) => AppState(
  api: api,
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => null,
  edition: 'GB',
  openLink: (url) async {
    opened?.add(url);
    return true;
  },
  now: () => DateTime(2026, 11, 14, 10),
);

const ukSizes = <String, Size>{
  'small phone': Size(320, 568),
  'phone': Size(393, 851),
  'large phone': Size(430, 932),
  'tablet portrait': Size(800, 1280),
  'tablet landscape': Size(1280, 800),
};

final deviceReads = <int>[];

void useFakeDevice() {
  deviceReads.clear();
  hmrcDeviceReader = (context) async {
    deviceReads.add(1);
    return fakeDevice;
  };
}

Future<void> setUkView(WidgetTester tester, Size logical, {double textScale = 1.0}) async {
  const ratio = 2.75;
  tester.view.physicalSize = Size(logical.width * ratio, logical.height * ratio);
  tester.view.devicePixelRatio = ratio;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
}

Future<void> pumpUk(WidgetTester tester, GbFakeApi api, Widget screen, {List<Uri>? opened}) async {
  useFakeDevice();
  await tester.pumpWidget(
    AppScope(
      state: gbState(api, opened: opened),
      child: MaterialApp(theme: MycaDesign.forFlavor('uk').light, home: screen),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> reveal(WidgetTester tester, Finder finder) async {
  if (finder.evaluate().isEmpty) {
    final position = tester.state<ScrollableState>(find.byType(Scrollable).first).position;
    position.jumpTo(0);
    await tester.pump();
    while (finder.evaluate().isEmpty && position.pixels < position.maxScrollExtent) {
      position.jumpTo((position.pixels + 250).clamp(0, position.maxScrollExtent));
      await tester.pump();
    }
  }
  await tester.ensureVisible(finder);
}

Future<void> tapIt(WidgetTester tester, Finder finder) async {
  await reveal(tester, finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<void> typeIn(WidgetTester tester, Finder finder, String value) async {
  await reveal(tester, finder);
  await tester.pumpAndSettle();
  await tester.enterText(finder, value);
  await tester.pumpAndSettle();
}

Future<void> scrollToEnd(WidgetTester tester) async {
  final scrollable = find.byType(Scrollable).first;
  for (var i = 0; i < 60; i++) {
    final state = tester.state<ScrollableState>(scrollable);
    final position = state.position;
    if (position.pixels >= position.maxScrollExtent) break;
    position.jumpTo((position.pixels + 400).clamp(0, position.maxScrollExtent));
    await tester.pump();
  }
  await tester.pumpAndSettle();
}
