import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_services.dart';
import 'package:myca/billing/store_billing.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/us/us_plus_screen.dart';
import 'package:myca/screens/us/us_sign_screen.dart';
import 'package:myca/screens/us/us_state_sheet_screen.dart';
import 'package:myca/us/us_plus.dart';
import 'package:myca/us/us_return.dart';
import 'package:myca/widgets.dart';

import 'us_return_test.dart' show FakeFees, FeeStore, UsFakeApi, scrollTap, usState;

class FakePlus implements UsPlusService {
  FakePlus({this.subscribed = false, this.expertReview = false, this.onPlay = false});

  final bool onPlay;
  final played = <String>[];

  @override
  String get accountId => 'biz-1';

  @override
  Future<UsPlusStatus> recordPlay(String productId, String purchaseToken) async {
    played.add('$productId:$purchaseToken');
    subscribed = true;
    return status();
  }

  bool subscribed;
  bool renews = true;
  bool paidAtStripe = false;
  final bool expertReview;
  final joined = <String>[];

  @override
  Future<UsPlusStatus> status() async => UsPlusStatus(
        enforced: true,
        active: subscribed,
        subscribed: subscribed,
        renews: subscribed && renews,
        until: '2027-11-11T00:00:00.000Z',
        priceUsd: 79,
        buyable: true,
        checkout: onPlay ? 'play' : 'card',
        productId: onPlay ? 'myca_us_plus_yearly' : '',
        manageUrl: onPlay && subscribed ? 'https://play.google.com/store/account/subscriptions?sku=myca_us_plus_yearly&package=com.mldynamic.myca.us' : '',
      );

  @override
  Future<UsOffers> offers() async => UsOffers(expertReview: expertReview, waitlist: defaultWaitlist);

  @override
  Future<(String, String)> startCheckout() async => ('https://checkout.stripe.com/c/pay/cs_plus', 'cs_plus');

  @override
  Future<UsPlusStatus> confirm(String sessionId) async {
    if (!paidAtStripe) throw const MycaApiException('The card payment has not gone through yet.');
    subscribed = true;
    return status();
  }

  @override
  Future<UsPlusStatus> cancel() async {
    renews = false;
    return status();
  }

  @override
  Future<void> joinWaitlist(String product) async => joined.add(product);
}

Future<void> openOver(WidgetTester tester, Widget screen) async {
  tester.state<NavigatorState>(find.byType(Navigator).first).push(MaterialPageRoute<void>(builder: (_) => screen));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the hub shows the \$39 price line before About you, and the state sheet only for states with income tax', (tester) async {
    final api = UsFakeApi()..taxpayer = {'filingStatus': 'single', 'address': {'state': 'TX'}};
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    expect(find.text('\$39 to file. Federal only. No state, refund or upgrade fees.'), findsOneWidget);
    final priceY = tester.getTopLeft(find.byKey(const Key('usHub.priceLine'))).dy;
    expect(priceY, lessThan(tester.getTopLeft(find.byKey(const Key('usHub.step.profile'))).dy), reason: 'the price comes before the first question');
    expect(find.byKey(const Key('usHub.state')), findsNothing, reason: 'Texas has no income tax, so nothing more is said');
    expect(find.textContaining('free'), findsNothing, reason: 'the hub never says free');
    await tester.pumpWidget(const SizedBox());
    final california = UsFakeApi()..taxpayer = {'filingStatus': 'single', 'address': {'state': 'CA'}};
    await tester.pumpWidget(MycaApp(state: usState(california)));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('usHub.state')));
    expect(find.byKey(const Key('usHub.state')), findsOneWidget);
    expect(find.text(stateReturnNote), findsOneWidget);
  });

  testWidgets('a return with a form MyCA cannot file is named before payment and cannot reach Sign', (tester) async {
    final api = UsFakeApi()
      ..taxpayer = {'filingStatus': 'single'}
      ..unsupported = [
        {'form': 'Form 2441', 'reason': 'Child and dependent care expenses', 'required': true},
        {'form': 'Form 2210', 'reason': 'Underpayment penalty', 'required': false},
      ];
    api.forms.add({'id': 'F1', 'kind': 'W-2', 'payer': 'Acme', 'amounts': {'wages': 52000}});
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usUnsupported.notice')), findsOneWidget);
    expect(find.textContaining('needs Form 2441'), findsOneWidget);
    expect(find.textContaining('2210'), findsNothing, reason: 'a form the IRS can work out itself does not block filing');
    await scrollTap(tester, find.byKey(const Key('usHub.step.review')));
    final sign = tester.widget<FilledButton>(find.byKey(const Key('usReview.sign')));
    expect(sign.onPressed, isNull);
    await openOver(tester, UsSignScreen(taxYear: currentTaxYear(DateTime.now()), fees: FakeFees(card: true)));
    expect(find.byKey(const Key('usFee.payCard')), findsNothing, reason: 'no payment for a return MyCA cannot file');
  });

  testWidgets('the \$39 is paid by card in the browser, then confirmed before the file button appears', (tester) async {
    final api = UsFakeApi()..taxpayer = {'filingStatus': 'single'};
    api.forms.add({'id': 'F1', 'kind': 'W-2', 'payer': 'Acme', 'amounts': {'wages': 52000}});
    api.efile = 'signed';
    final fees = FakeFees(card: true);
    final opened = <Uri>[];
    await tester.pumpWidget(MycaApp(state: usState(api, opened: opened)));
    await tester.pumpAndSettle();
    await openOver(tester, UsSignScreen(taxYear: currentTaxYear(DateTime.now()), fees: fees));
    expect(find.byKey(const Key('usFee.pay')), findsNothing, reason: 'no Google Play button when card checkout is on');
    await tester.tap(find.byKey(const Key('usFee.payCard')));
    await tester.pumpAndSettle();
    expect(opened.single.toString(), 'https://checkout.stripe.com/c/pay/cs_test_1');
    await tester.tap(find.byKey(const Key('usFee.paidCard')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usFee.note')), findsOneWidget, reason: 'not paid yet, so it says so');
    expect(find.byKey(const Key('usSign.prepare')), findsNothing);
    fees.cardPaid = true;
    await tester.tap(find.byKey(const Key('usFee.paidCard')));
    await tester.pumpAndSettle();
    expect(fees.confirmed, ['cs_test_1', 'cs_test_1']);
    expect(find.byKey(const Key('usSign.prepare')), findsOneWidget);
  });

  testWidgets('MyCA Plus: tools are locked until the \$79 a year is paid, and renewal cancels in one tap', (tester) async {
    final api = UsFakeApi();
    final plus = FakePlus();
    final opened = <Uri>[];
    await tester.pumpWidget(MycaApp(state: usState(api, opened: opened)));
    await tester.pumpAndSettle();
    await openOver(tester, UsPlusScreen(taxYear: 2025, plus: plus));
    expect(find.text('Get MyCA Plus, \$79 a year'), findsOneWidget);
    expect(tester.widget<RowCard>(find.byKey(const Key('usPlus.letter'))).onTap, isNull);
    await tester.tap(find.byKey(const Key('usPlus.subscribe')));
    await tester.pumpAndSettle();
    expect(opened.single.host, 'checkout.stripe.com');
    plus.paidAtStripe = true;
    await tester.tap(find.byKey(const Key('usPlus.paid')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('usPlus.on')), findsOneWidget);
    expect(tester.widget<RowCard>(find.byKey(const Key('usPlus.letter'))).onTap, isNotNull);
    await tester.tap(find.byKey(const Key('usPlus.cancel')));
    await tester.pumpAndSettle();
    expect(find.textContaining('It will not renew'), findsOneWidget);
    await scrollTap(tester, find.byKey(const Key('usWaitlist.done_for_you')));
    expect(plus.joined, ['done_for_you']);
    expect(find.byKey(const Key('usWaitlist.joined.done_for_you')), findsOneWidget);
    expect(find.textContaining('\$199'), findsNothing, reason: 'waitlist products show no price');
    expect(find.textContaining('\$99'), findsNothing);
  });

  testWidgets('Plus tools: withholding is checked against a new W-4, and estimates become reminders', (tester) async {
    final api = UsFakeApi();
    api.tools['read_irs_letter'] = {
      'ok': true,
      'data': {
        'notice': 'CP2000',
        'plainEnglish': 'The IRS thinks you left out \$1,200 of interest.',
        'deadline': '2027-03-01',
        'amountIrsSays': 264,
        'matchesReturn': false,
        'differences': [
          {'kind': '1099-INT', 'payer': 'Ally Bank', 'amountIrsHas': 1200, 'amountInMyca': 0},
        ],
        'draftReply': 'I agree with the proposed change.',
      },
    };
    api.tools['us_withholding_check'] = {'ok': true, 'data': {'projectedTax': 9000, 'projectedWithholding': 7800, 'gap': 1200, 'extraPerPaycheck': 100}};
    api.tools['us_estimated_payments'] = {
      'ok': true,
      'data': {
        'quarters': [
          {'installment': 1, 'due': '2026-04-15', 'amount': 500, 'past': true},
          {'installment': 2, 'due': '2026-06-15', 'amount': 500, 'past': false},
          {'installment': 3, 'due': '2026-09-15', 'amount': 500, 'past': false},
        ],
      },
    };
    final shared = <String>[];
    await tester.pumpWidget(MycaApp(state: usState(api, sharedText: shared, pickAny: () async => null)));
    await tester.pumpAndSettle();
    await openOver(tester, const UsWithholdingScreen(taxYear: 2026));
    await tester.enterText(find.byKey(const Key('usWithholding.pay')), '3000');
    await tester.enterText(find.byKey(const Key('usWithholding.periods')), '12');
    await scrollTap(tester, find.byKey(const Key('usWithholding.check')));
    final call = api.queries.lastWhere((q) => q.name == 'us_withholding_check');
    expect(call.args['payPerPeriod'], 3000);
    expect(call.args['periodsLeft'], 12);
    expect(find.textContaining('owe about \$1,200'), findsOneWidget);
    expect(find.byKey(const Key('usWithholding.extra')), findsOneWidget);
    Navigator.of(tester.element(find.byType(UsWithholdingScreen))).pop();
    await tester.pumpAndSettle();
    await openOver(tester, const UsEstimatesScreen(taxYear: 2026));
    await tester.enterText(find.byKey(const Key('usEstimates.income')), '20000');
    await tester.tap(find.byKey(const Key('usEstimates.work')));
    await tester.pumpAndSettle();
    expect(find.textContaining('\$500.00'), findsNWidgets(2), reason: 'a past quarter is left out');
    await scrollTap(tester, find.byKey(const Key('usEstimates.remind')));
    final reminders = api.proposals.where((p) => p.tool == 'add_reminder').toList();
    expect(reminders.map((p) => p.args['due']), ['2026-06-08', '2026-09-08']);
    expect(api.confirmed.where((t) => t == 'add_reminder').length, 2);
    expect(find.byKey(const Key('usEstimates.reminded')), findsOneWidget);
  });

  testWidgets('the IRS letter reader shows what the letter means, how it differs from the return, and a reply to share', (tester) async {
    final api = UsFakeApi();
    api.tools['read_irs_letter'] = {
      'ok': true,
      'data': {'notice': 'CP2000', 'plainEnglish': 'The IRS thinks you left out interest.', 'deadline': '2027-03-01', 'amountIrsSays': 264, 'matchesReturn': false, 'differences': [{'kind': '1099-INT', 'payer': 'Ally Bank', 'amountIrsHas': 1200, 'amountInMyca': 0}], 'draftReply': 'I agree with the proposed change.'},
    };
    final shared = <String>[];
    await tester.pumpWidget(MycaApp(state: usState(api, sharedText: shared, pickAny: () async => PickedFile(name: 'cp2000.pdf', mime: 'application/pdf', bytes: Uint8List.fromList(const [37, 80, 68, 70])))));
    await tester.pumpAndSettle();
    await openOver(tester, const UsLetterScreen(taxYear: 2025));
    await tester.tap(find.byKey(const Key('usLetter.pick')));
    await tester.pumpAndSettle();
    expect(api.queries.last.name, 'read_irs_letter');
    expect(api.queries.last.args['documentId'], 'sha-cp2000.pdf');
    expect(find.text('CP2000'), findsOneWidget);
    expect(find.textContaining('does not match'), findsOneWidget);
    expect(find.textContaining('Ally Bank'), findsOneWidget);
    await scrollTap(tester, find.text('Share the reply'));
    expect(shared, ['I agree with the proposed change.']);
  });

  test('the state carry-over sheet takes the federal lines and W-2 state boxes', () {
    final sheet = buildStateSheet(
      state: 'CA',
      taxYear: 2025,
      status: UsReturnStatus.fromJson({'filingStatus': 'single'}, fallbackYear: 2025),
      review: UsReview.fromJson({
        'lines': [
          {'form': '1040', 'line': '11', 'label': 'Adjusted gross income', 'amount': 61000},
          {'form': '1040', 'line': '15', 'label': 'Taxable income', 'amount': 45250},
        ],
      }),
      forms: [UsTaxForm.fromJson({'kind': 'W-2', 'payer': 'Acme', 'amounts': {'state': 'CA', 'stateWages': 61000, 'stateWithheld': 2100}})],
    );
    expect(sheet.stateName, 'California');
    expect(sheet.federal.map((r) => r.$1), ['11', '15']);
    expect(sheet.asText(), contains('Form 1040 line 11, Adjusted gross income: \$61,000.00'));
    expect(sheet.asText(), contains('W-2 from Acme (CA): state wages \$61,000.00, state tax withheld \$2,100.00'));
    expect(stateHasIncomeTax('TX'), isFalse);
    expect(stateHasIncomeTax('NY'), isTrue);
    expect(stateHasIncomeTax(''), isFalse);
  });

  testWidgets('inside the app, MyCA Plus is a Google Play subscription, recorded with the server and cancelled in Play', (tester) async {
    final api = UsFakeApi();
    final plus = FakePlus(onPlay: true);
    final store = FeeStore();
    final opened = <Uri>[];
    await tester.pumpWidget(MycaApp(state: usState(api, opened: opened)));
    await tester.pumpAndSettle();
    await openOver(tester, UsPlusScreen(taxYear: 2025, plus: plus, store: store));
    expect(find.byKey(const Key('usPlus.subscribe')), findsNothing, reason: 'no card checkout for Plus inside the app');
    await tester.tap(find.byKey(const Key('usPlus.subscribePlay')));
    await tester.pumpAndSettle();
    expect(store.bought, ['sub:myca_us_plus_yearly:biz-1']);
    store.controller.add([const StorePurchase(productId: 'myca_us_1040', token: 'not-plus', state: StorePurchaseState.purchased)]);
    await tester.pumpAndSettle();
    expect(plus.played, isEmpty, reason: 'a filing fee purchase is left to the Sign screen');
    store.controller.add([const StorePurchase(productId: 'myca_us_plus_yearly', token: 'plus-1', state: StorePurchaseState.purchased, needsFinish: true)]);
    await tester.pumpAndSettle();
    expect(plus.played, ['myca_us_plus_yearly:plus-1']);
    expect(store.finished, ['plus-1']);
    expect(find.byKey(const Key('usPlus.on')), findsOneWidget);
    await tester.tap(find.byKey(const Key('usPlus.manage')));
    await tester.pumpAndSettle();
    expect(opened.single.host, 'play.google.com');
  });
}
