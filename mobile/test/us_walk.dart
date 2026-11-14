import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/us/us_consent_screen.dart';
import 'package:myca/screens/us/us_form_editor_screen.dart';
import 'package:myca/screens/us/us_forms_screen.dart';
import 'package:myca/screens/us/us_interview_screen.dart';
import 'package:myca/screens/us/us_plus_screen.dart';
import 'package:myca/screens/us/us_profile_screen.dart';
import 'package:myca/screens/us/us_review_screen.dart';
import 'package:myca/screens/us/us_sign_screen.dart';
import 'package:myca/screens/us/us_state_sheet_screen.dart';
import 'package:myca/us/us_consents.dart';
import 'package:myca/us/us_filing_fee.dart';
import 'package:myca/us/us_return.dart';

import 'cloud_test.dart' show signedIn, sessionOn;
import 'fake_api.dart' show MemoryOnboardingStore;
import 'fake_cloud.dart';
import 'us_plus_test.dart' show FakePlus;
import 'us_return_test.dart' show FeeStore, UsFakeApi, usState;

class UsDevice {
  const UsDevice(this.name, this.width, this.height, {this.ios = false, this.top = 24, this.bottom = 0});

  final String name;
  final double width;
  final double height;
  final bool ios;
  final double top;
  final double bottom;

  String get size => '${width.toInt()}x${height.toInt()}';
}

const usDevices = [
  UsDevice('iPhone SE 1st gen', 320, 568, ios: true, top: 20),
  UsDevice('Small Android', 360, 640),
  UsDevice('iPhone SE 2/3', 375, 667, ios: true, top: 20),
  UsDevice('iPhone 14/15', 390, 844, ios: true, top: 47, bottom: 34),
  UsDevice('iPhone 15/16 Pro', 393, 852, ios: true, top: 59, bottom: 34),
  UsDevice('Pixel', 412, 915, top: 32, bottom: 16),
  UsDevice('Pro Max', 430, 932, ios: true, top: 59, bottom: 34),
  UsDevice('iPad portrait', 768, 1024, ios: true, top: 24, bottom: 20),
];

const offline = 'Cannot reach MyCA. Check your connection and try again.';

class WalkApi extends UsFakeApi {
  final failing = <String>{};
  MycaApiException? proposeFails;

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async {
    final fails = proposeFails;
    if (fails != null) throw fails;
    return super.propose(name, args);
  }
  List<Map<String, Object?>> questions = [];

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    if (failing.contains(name)) throw const MycaApiException(offline);
    if (name == 'us_interview' && questions.isNotEmpty) return {'ok': true, 'data': {'questions': questions}};
    return super.query(name, args);
  }
}

class WalkFees implements UsFilingFees {
  WalkFees(this.fee);

  UsFilingFee fee;

  @override
  String get accountId => 'biz-1';
  @override
  Future<UsFilingFee> status(int taxYear) async => fee;
  @override
  Future<UsFilingFee> record(int taxYear, String productId, String purchaseToken) async => fee;
  @override
  Future<UsCardCheckout> startCard(int taxYear) async => const UsCardCheckout(url: 'https://checkout.stripe.com/c/pay/cs_test_1', sessionId: 'cs_test_1');
  @override
  Future<UsFilingFee> confirmCard(int taxYear, String sessionId) async => throw const MycaApiException('The card payment has not gone through yet. If you just paid, wait a minute and tap again.');
}

const walkYear = 2025;

WalkApi filledApi({String status = 'mfj'}) {
  final api = WalkApi()
    ..taxpayer = {
      'filingStatus': status,
      'taxpayer': {'firstName': 'Jordan', 'lastName': 'Rivera-Montgomery', 'ssnLast4': '6780', 'dateOfBirth': '1990-07-04', 'occupation': 'Registered nurse'},
      if (status == 'mfj') 'spouse': {'firstName': 'Samantha', 'lastName': 'Rivera-Montgomery', 'ssnLast4': '4320', 'dateOfBirth': '1991-01-02', 'occupation': 'Teacher'},
      'dependents': [
        {'id': 'D1', 'firstName': 'Alexandra', 'lastName': 'Rivera-Montgomery', 'ssnLast4': '1111', 'dateOfBirth': '2016-05-09', 'relationship': 'daughter', 'months': 12},
      ],
      'address': {'line1': '1234 Market Street', 'line2': 'Apt 5B', 'city': 'San Francisco', 'state': 'CA', 'zip': '94105'},
    };
  api.forms.addAll([
    {'id': 'F1', 'kind': 'W-2', 'payer': 'Acme Healthcare Corporation of Northern California', 'amounts': {'wages': 152000, 'federalWithheld': 21100.55, 'state': 'CA', 'stateWages': 152000, 'stateWithheld': 8800}},
    {'id': 'F2', 'kind': '1099-INT', 'payer': 'First Bank', 'owner': 'spouse', 'amounts': {'interest': 42.17}},
    {'id': 'F3', 'kind': '1099-NEC', 'payer': 'Rideshare Partners LLC', 'amounts': {'nonemployeeCompensation': 8400}},
  ]);
  api.answers['student'] = false;
  api.answers['hsa'] = 1200;
  api.reviewLines = [
    {'form': 'Form 1040', 'line': '1a', 'label': 'Total amount from Form(s) W-2, box 1', 'amount': 152000, 'source': 'W-2 from Acme Healthcare Corporation of Northern California'},
    {'form': 'Form 1040', 'line': '2b', 'label': 'Taxable interest', 'amount': 42.17, 'source': '1099-INT from First Bank'},
    {'form': 'Form 1040', 'line': '11', 'label': 'Adjusted gross income', 'amount': 159242.17, 'source': 'Worked out by MyCA'},
    {'form': 'Form 1040', 'line': '12', 'label': 'Standard deduction', 'amount': 30000, 'source': 'Married filing jointly'},
    {'form': 'Form 1040', 'line': '15', 'label': 'Taxable income', 'amount': 129242.17, 'source': ''},
    {'form': 'Form 1040', 'line': '24', 'label': 'Total tax', 'amount': 19866.38, 'source': ''},
    {'form': 'Form 1040', 'line': '25a', 'label': 'Federal income tax withheld from Form(s) W-2', 'amount': 21100.55, 'source': 'W-2 box 2'},
    {'form': 'Schedule C', 'line': '1', 'label': 'Gross receipts or sales', 'amount': 8400, 'source': '1099-NEC from Rideshare Partners LLC'},
    {'form': 'Schedule SE', 'line': '12', 'label': 'Self-employment tax', 'amount': 1186.92, 'source': ''},
  ];
  api.refund = 12345.67;
  return api;
}

Future<void> configure(WidgetTester tester, UsDevice device, double scale, {double pixelRatio = 2}) async {
  tester.view.physicalSize = Size(device.width * pixelRatio, device.height * pixelRatio);
  tester.view.devicePixelRatio = pixelRatio;
  tester.view.padding = FakeViewPadding(top: device.top * pixelRatio, bottom: device.bottom * pixelRatio);
  tester.view.viewPadding = FakeViewPadding(top: device.top * pixelRatio, bottom: device.bottom * pixelRatio);
  tester.platformDispatcher.textScaleFactorTestValue = scale;
  debugDefaultTargetPlatformOverride = device.ios ? TargetPlatform.iOS : TargetPlatform.android;
}

void unconfigure(WidgetTester tester) {
  debugDefaultTargetPlatformOverride = null;
  tester.platformDispatcher.clearTextScaleFactorTestValue();
  tester.view.reset();
}

class UsWalk {
  UsWalk(this.tester, {required this.folder, this.capture = false, this.guidelines = false});

  final WidgetTester tester;
  final String folder;
  final bool capture;
  final bool guidelines;
  final problems = <String>[];
  final shots = <String>[];
  String current = '';

  Future<void> snap(String name) async {
    current = name;
    await tester.pumpAndSettle();
    await _check(name);
    if (capture) await _capture(name);
    final scroll = await _scrollEnd();
    if (scroll != null) {
      current = '$name (scrolled)';
      await _check('${name}_end');
      if (capture) await _capture('${name}_end');
      scroll.position.jumpTo(0);
      await tester.pumpAndSettle();
    }
  }

  Future<void> _capture(String name) async {
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('$folder/$name.png'));
    shots.add(name);
  }

  Future<void> _check(String name) async {
    if (!guidelines) return;
    for (final (label, guideline) in [('tap target', androidTapTargetGuideline), ('label', labeledTapTargetGuideline), ('contrast', textContrastGuideline)]) {
      final result = await guideline.evaluate(tester);
      if (!result.passed) problems.add('$name $label: ${(result.reason ?? '').trim().split('\n').take(6).join(' | ')}');
    }
  }

  Future<ScrollableState?> _scrollEnd() async {
    final scrollables = tester
        .stateList<ScrollableState>(find.byType(Scrollable))
        .where((s) => s.position.axis == Axis.vertical && (ModalRoute.of(s.context)?.isCurrent ?? true) && s.position.maxScrollExtent > 0)
        .toList();
    if (scrollables.isEmpty) return null;
    final scroll = scrollables.first;
    for (var i = 0; i < 30 && scroll.position.pixels < scroll.position.maxScrollExtent; i++) {
      scroll.position.jumpTo(scroll.position.maxScrollExtent);
      await tester.pump();
    }
    await tester.pumpAndSettle();
    return scroll;
  }

  NavigatorState get _nav => tester.state<NavigatorState>(find.byType(Navigator).first);

  Future<void> open(Widget screen, String name) async {
    _nav.push(MaterialPageRoute<void>(builder: (_) => screen));
    await snap(name);
  }

  Future<void> popAll() async {
    _nav.popUntil((route) => route.isFirst);
    await tester.pumpAndSettle();
  }

  Future<void> app(AppState state) async {
    current = 'next app start after $current';
    await tester.pumpWidget(MycaApp(key: UniqueKey(), state: state));
    await tester.pumpAndSettle();
  }

  Future<void> tapKey(String key) async {
    final finder = find.byKey(Key(key));
    if (finder.evaluate().isEmpty) {
      final scroll = tester
          .stateList<ScrollableState>(find.byType(Scrollable))
          .firstWhere((s) => s.position.axis == Axis.vertical && (ModalRoute.of(s.context)?.isCurrent ?? true));
      for (var i = 0; i < 60 && finder.evaluate().isEmpty; i++) {
        scroll.position.jumpTo((scroll.position.pixels + 200).clamp(0, scroll.position.maxScrollExtent));
        await tester.pump();
      }
    }
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  Future<void> run() async {
    moneyCountry = 'US';

    await app(AppState(api: WalkApi(), store: MemoryOnboardingStore(), pickTextFile: (_) async => null, edition: 'US'));
    await snap('01_welcome');

    final cloud = FakeCloud();
    await app(AppState(cloud: sessionOn(cloud, MemoryTokenStore()), store: MemoryOnboardingStore(isWelcomed: true), pickTextFile: (_) async => null, edition: 'US', now: () => DateTime(2026, 3, 2, 10)));
    await snap('02_sign_in');

    final noticeCloud = FakeCloud()..noticeAccepted = false;
    final noticeTokens = MemoryTokenStore();
    await signedIn(noticeCloud, noticeTokens);
    await app(AppState(cloud: sessionOn(noticeCloud, noticeTokens), store: MemoryOnboardingStore(isWelcomed: true), pickTextFile: (_) async => null, edition: 'US', now: () => DateTime(2026, 3, 2, 10)));
    await snap('03_privacy_notice');

    final setupCloud = FakeCloud();
    final setupTokens = MemoryTokenStore();
    final session = await signedIn(setupCloud, setupTokens);
    await session.setName('Jordan');
    await app(AppState(cloud: sessionOn(setupCloud, setupTokens), store: MemoryOnboardingStore(isWelcomed: true), pickTextFile: (_) async => null, edition: 'US', now: () => DateTime(2026, 3, 2, 10)));
    await snap('04_setup');
    await tapKey('usSetup.business');
    await tapKey('usSetup.continue');
    await snap('05_setup_business_error');

    final empty = WalkApi();
    await app(usState(empty));
    await snap('06_hub_new');
    await open(const UsFormsScreen(taxYear: walkYear), '07_documents_empty');
    await popAll();
    await open(const UsProfileScreen(taxYear: walkYear), '08_about_you_empty');
    await tapKey('usProfile.save');
    await snap('09_about_you_errors');
    await popAll();

    final api = filledApi();
    await app(usState(api));
    await snap('10_hub');
    await tester.tap(find.byTooltip('Your account'));
    await snap('11_account_menu');
    _nav.pop();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usHub.year')));
    await snap('12_year_menu');
    _nav.pop();
    await tester.pumpAndSettle();
    await open(const UsProfileScreen(taxYear: walkYear), '13_about_you');
    await popAll();
    await open(const UsFormsScreen(taxYear: walkYear, joint: true), '14_documents');
    await tapKey('usForms.type');
    await snap('15_form_picker');
    await tester.tap(find.byKey(const Key('usForms.kind.W-2')));
    await snap('16_form_w2');
    await tapKey('usForm.save');
    await snap('17_form_w2_errors');
    await popAll();
    await open(UsFormEditorScreen(taxYear: walkYear, kind: builtInFormKinds.firstWhere((k) => k.kind == '1099-B'), joint: true, readNote: 'Read from Robinhood 1099 Consolidated 2025.pdf. Check each box against the form before you save.'), '18_form_1099b_read');
    await popAll();

    api.questions = [
      {'id': 'student', 'text': 'Does an exception to the 10% early distribution tax apply to your 1099-R with code 1?', 'help': 'For example a first home (IRA, up to \$10,000), higher education costs, disability or certain medical costs. An exception is claimed on Form 5329.', 'kind': 'yesno'},
      {'id': 'hsa', 'text': 'How much did you put in a health savings account (HSA) yourself, not through payroll?', 'kind': 'amount'},
      {'id': 'kids', 'text': 'How many children under 13 did you pay child care for?', 'kind': 'count'},
      {'id': 'move', 'text': 'Which of these describes your health coverage in 2025?', 'kind': 'choice', 'options': [{'value': 'employer', 'label': 'Through my or my spouse\'s employer all year'}, {'value': 'marketplace', 'label': 'From the Health Insurance Marketplace (healthcare.gov or a state exchange)'}, {'value': 'none', 'label': 'No coverage for part of the year'}]},
    ];
    await open(const UsInterviewScreen(taxYear: walkYear), '19_question_yes_no');
    await tapKey('usInterview.next');
    await snap('20_question_needs_answer');
    await tapKey('usInterview.no');
    await tapKey('usInterview.next');
    await snap('21_question_amount');
    await popAll();
    api.answers
      ..['student'] = false
      ..['hsa'] = 0
      ..['kids'] = 1;
    api.questions = [
      for (final q in api.questions) {...q, 'answer': api.answers[q['id']]},
    ];
    await open(const UsInterviewScreen(taxYear: walkYear), '22_question_choice');
    await popAll();
    api.questions = [
      for (final q in api.questions) {...q, 'answer': q['id'] == 'move' ? 'employer' : api.answers[q['id']]},
    ];
    await open(const UsInterviewScreen(taxYear: walkYear), '23_questions_done');
    await popAll();

    await open(const UsReviewScreen(taxYear: walkYear), '24_review');
    await popAll();
    await open(UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: false, paid: true, priceUsd: 129))), '25_sign_refund');
    await tapKey('usSign.sign');
    await snap('26_sign_errors');
    await popAll();
    await open(const UsStateSheetScreen(taxYear: walkYear, state: 'CA'), '27_state_sheet');
    await popAll();

    api.efile = 'signed';
    final store = FeeStore(price: '\$99.00');
    await open(UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: true, paid: false, priceUsd: 99, listPriceUsd: 129, productId: 'myca_us_1040', priceLine: '\$99 to file your federal return, launch price for this season (usually \$129). One price, no upgrade fees.')), store: store), '28_fee_play_launch');
    await popAll();
    await open(UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: true, paid: false, priceUsd: 129, checkout: 'card'))), '29_fee_card');
    await tapKey('usFee.payCard');
    await tapKey('usFee.paidCard');
    await snap('30_fee_card_not_yet');
    await popAll();
    await open(UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: true, paid: false, priceUsd: 129, filingOpen: false))), '31_filing_not_open');
    await popAll();
    await open(UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: true, paid: true, priceUsd: 99, listPriceUsd: 129))), '32_signed_ready');
    await tapKey('usSign.prepare');
    await snap('33_send_preview');
    await popAll();

    final owed = filledApi()
      ..owed = 4812.33
      ..refund = 0
      ..checks = [
        {'code': 'W2_STATE', 'message': 'Your W-2 from Acme Healthcare Corporation of Northern California has state wages but no state.', 'fix': 'Open the W-2 and pick the state in box 15.', 'step': 'forms', 'level': 'warning'},
      ];
    await app(usState(owed));
    await snap('34_hub_owed');
    await open(const UsReviewScreen(taxYear: walkYear), '35_review_owed');
    await popAll();
    await open(UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: false, paid: true, priceUsd: 129))), '36_sign_owed_joint');
    await popAll();
    owed.checks = [
      {'code': 'DEP_SSN', 'message': 'Alexandra needs a Social Security number to be claimed.', 'fix': 'Add it under About you.', 'step': 'profile', 'level': 'error'},
    ];
    await open(UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: false, paid: true, priceUsd: 129))), '37_sign_blocked');
    await popAll();

    final unsupported = filledApi()
      ..unsupported = [
        {'form': 'Schedule E', 'reason': 'Rental property income is not supported yet.'},
        {'form': 'Form 8938', 'reason': 'Foreign financial assets are not supported yet.'},
      ];
    await app(usState(unsupported));
    await snap('38_hub_unsupported');
    await open(const UsReviewScreen(taxYear: walkYear), '39_review_unsupported');
    await popAll();
    await open(UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: false, paid: true, priceUsd: 129))), '40_sign_unsupported');
    await popAll();

    final rejected = filledApi()
      ..efile = 'rejected'
      ..rejections = [
        {'code': 'IND-031-04', 'message': 'Last year\'s AGI or PIN does not match IRS records.', 'fix': 'Check line 11 of your 2024 Form 1040. If you filed late or not at all, use 0.', 'step': 'sign'},
        {'code': 'R0000-504-02', 'message': 'A dependent\'s Social Security number does not match the name on file.', 'fix': 'Check Alexandra\'s card and fix the number or spelling.', 'step': 'profile'},
      ];
    await app(usState(rejected));
    await snap('41_hub_rejected');
    await popAll();

    final partner = filledApi()..route = 'partner';
    await app(usState(partner));
    await open(UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: true, paid: true, priceUsd: 99, listPriceUsd: 129))), '42_partner_ready');
    await popAll();
    partner
      ..efile = 'in_progress'
      ..rejections = [
        {'code': 'IND-181-01', 'message': 'The Identity Protection PIN is missing.', 'fix': 'Enter the six-digit IP PIN the IRS mailed you.', 'step': ''},
      ];
    await open(UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: true, paid: true, priceUsd: 99))), '43_partner_in_progress');
    await popAll();
    partner
      ..efile = 'accepted'
      ..rejections = [];
    await app(usState(partner));
    await snap('44_hub_accepted');
    await open(UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: true, paid: true, priceUsd: 99))), '45_filed');
    await popAll();

    final down = WalkApi()..failing.addAll(['us_return_status', 'us_return_review', 'list_us_tax_forms', 'us_interview', 'us_taxpayer']);
    await app(usState(down));
    await snap('46_hub_offline');
    await open(const UsFormsScreen(taxYear: walkYear), '47_documents_offline');
    await popAll();
    await open(const UsInterviewScreen(taxYear: walkYear), '48_questions_offline');
    await popAll();
    await open(const UsReviewScreen(taxYear: walkYear), '49_review_offline');
    await popAll();
    await open(const UsProfileScreen(taxYear: walkYear), '50_about_you_offline');
    await popAll();
    await open(UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: true, paid: false, priceUsd: 129))), '51_sign_offline');
    await popAll();
    await open(const UsStateSheetScreen(taxYear: walkYear, state: 'NY'), '52_state_offline');
    await popAll();

    await app(usState(filledApi()));
    await open(UsPlusScreen(taxYear: walkYear, plus: FakePlus()), '53_plus_offer');
    await popAll();
    await open(UsPlusScreen(taxYear: walkYear, plus: FakePlus(subscribed: true)), '54_plus_on');
    await popAll();
    await open(UsPlusScreen(taxYear: walkYear, plus: FakePlus(onPlay: true)), '55_plus_play_unavailable');
    await popAll();
    await open(const UsLetterScreen(taxYear: walkYear), '56_plus_letter');
    await popAll();
    await open(const UsWithholdingScreen(taxYear: walkYear + 1), '57_plus_withholding');
    await popAll();
    await open(const UsEstimatesScreen(taxYear: walkYear + 1), '58_plus_estimates');
    await popAll();

    await app(usState(partner..efile = 'not_filed'));
    await open(UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: true, paid: true, priceUsd: 99)), consents: FakeConsents()), '59_partner_prefill_choice');
    await popAll();
    await open(UsConsentScreen(consents: FakeConsents(), document: usPartnerTinsConsent), '60_consent_sign');
    await popAll();
    await open(UsConsentScreen(consents: FakeConsents()..ready = false, document: usPartnerTinsConsent), '61_consent_not_ready');
    await popAll();
    await open(UsConsentScreen(consents: FakeConsents()..signedAt = '2026-03-02T10:00:00.000Z', document: usPartnerTinsConsent), '62_consent_signed');
    await popAll();

    moneyCountry = 'IN';
  }
}

Future<List<String>> walkUs(WidgetTester tester, UsDevice device, double scale, {String folder = '', bool capture = false, bool guidelines = false}) async {
  await configure(tester, device, scale);
  final walk = UsWalk(tester, folder: folder, capture: capture, guidelines: guidelines);
  final original = FlutterError.onError;
  FlutterError.onError = (details) {
    final first = details.exceptionAsString().split('\n').where((l) => l.trim().isNotEmpty).take(2).join(' ');
    if (Platform.environment["US_DEBUG"] == "1") stderr.writeln(details.toString());
    final where = RegExp(r'error-causing widget was:\s*\n\s*(.+)').firstMatch(details.toString())?.group(1) ?? '';
    walk.problems.add('${device.size} @${scale}x ${walk.current}: $first ${where.replaceAll(RegExp(r'file:///.*?/mobile/'), '')}');
  };
  try {
    await walk.run();
  } finally {
    FlutterError.onError = original;
    moneyCountry = 'IN';
    unconfigure(tester);
  }
  return walk.problems;
}

class FakeConsents implements UsConsents {
  bool ready = true;
  String signedAt = '';
  int lists = 0;
  MycaApiException? nextError;
  final signed = <String>[];
  final revoked = <String>[];

  UsConsentForm get form => UsConsentForm(
        document: usPartnerTinsConsent,
        version: 'v2',
        title: 'Consent to disclose your Social Security numbers to our e-file partner',
        text: 'Federal law requires this consent form be provided to you. You can choose a date after which this consent ends.',
        ready: ready,
        signedAt: signedAt,
        validUntil: signedAt.isEmpty ? '' : '2027-03-02T00:00:00.000Z',
      );

  @override
  Future<List<UsConsentForm>> list() async {
    lists += 1;
    return [form];
  }

  @override
  Future<void> sign(UsConsentForm form, {required String signedName, required String validUntil}) async {
    final error = nextError;
    nextError = null;
    if (error != null) throw error;
    signed.add('${form.document}:${form.version}:$signedName:$validUntil');
    signedAt = '2026-03-02T10:00:00.000Z';
  }

  @override
  Future<void> revoke(String document) async {
    revoked.add(document);
    signedAt = '';
  }
}
