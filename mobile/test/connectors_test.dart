import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/plaid_link.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/connectors_screen.dart';

import 'fake_api.dart';
import 'fake_cloud.dart';

class FakePlaidLink implements PlaidLinkOpener {
  FakePlaidLink({this.publicToken});

  final String? publicToken;
  final opened = <String>[];

  @override
  Future<String?> open(String linkToken) async {
    opened.add(linkToken);
    return publicToken;
  }
}

Future<AppState> hostedOwner(FakeCloud cloud, {String country = 'IN', PlaidLinkOpener? plaid, List<Uri>? openedLinks}) async {
  cloud.userName = 'Asha';
  final tokens = MemoryTokenStore();
  final first = CloudSession(baseUrl: 'https://api.example.test', tokens: tokens, client: cloud.client);
  await first.requestCode('9876543210');
  await first.verifyCode(FakeCloud.code);
  await first.createBusiness(name: country == 'US' ? 'Asha LLC' : 'Asha Traders', state: '29');
  cloud.company = {...cloud.company, 'country': country};
  return AppState(
    cloud: CloudSession(baseUrl: 'https://api.example.test', tokens: tokens, client: cloud.client),
    store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
    pickTextFile: (_) async => null,
    plaidLink: plaid ?? const NoPlaidLink(),
    openLink: (url) async {
      openedLinks?.add(url);
      return openedLinks != null;
    },
  );
}

Future<void> openConnectors(WidgetTester tester) async {
  await tester.tap(find.byTooltip('Your business'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Connections to banks and apps'));
  await tester.pumpAndSettle();
}

Future<void> scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 300, scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a US owner sees Plaid, TaxJar, Gusto and Track1099 in that order, with the how-to and the machine-managed fields hidden', (tester) async {
    final cloud = FakeCloud();
    await tester.pumpWidget(MycaApp(state: await hostedOwner(cloud, country: 'US')));
    await tester.pumpAndSettle();
    await openConnectors(tester);

    expect(find.text('Connections to banks and apps'), findsOneWidget);
    final cards = tester.widgetList<ConnectorCard>(find.byType(ConnectorCard)).map((c) => c.view.channel).toList();
    expect(cards, ['plaid', 'taxjar', 'gusto', 'track1099']);
    expect(find.text('Plaid (US bank feeds)'), findsOneWidget);
    expect(find.text('Not connected'), findsNWidgets(4));
    expect(find.textContaining('Developers → Keys'), findsOneWidget);
    expect(find.byKey(const ValueKey('plaid.clientId')), findsOneWidget);
    expect(find.byKey(const ValueKey('plaid.secret')), findsOneWidget);
    expect(find.byKey(const ValueKey('plaid.environment')), findsOneWidget);
    expect(find.byKey(const ValueKey('plaid.accessToken')), findsNothing);
    expect(find.byKey(const ValueKey('plaid.itemId')), findsNothing);
    expect(find.byKey(const ValueKey('gusto.oauthState')), findsNothing);
    expect(find.byKey(const ValueKey('gusto.companyUuid')), findsNothing);
    expect(find.text('Connect my bank'), findsOneWidget);
    expect(find.text('Pull transactions'), findsOneWidget);
    await scrollTo(tester, find.text('Connect Gusto'));
    expect(find.text('Connect Gusto'), findsOneWidget);
    await scrollTo(tester, find.text('Track1099 (US 1099 e-filing)'));
    expect(find.textContaining('Team API ID'), findsWidgets);
    expect(find.text('Amazon Seller Central (SP-API)'), findsNothing);
  });

  testWidgets('an Indian owner sees Amazon, Shopify, Razorpay and Zoho with the desktop wording, and Shopify keeps its access token input', (tester) async {
    final cloud = FakeCloud();
    await tester.pumpWidget(MycaApp(state: await hostedOwner(cloud)));
    await tester.pumpAndSettle();
    await openConnectors(tester);

    final cards = tester.widgetList<ConnectorCard>(find.byType(ConnectorCard)).map((c) => c.view.channel).toList();
    expect(cards, ['amazon', 'shopify', 'razorpay', 'zoho']);
    expect(find.textContaining('Marketplace id is A21TJRUUN4KGV for India'), findsOneWidget);
    expect(find.byKey(const ValueKey('amazon.refreshToken')), findsOneWidget);
    await scrollTo(tester, find.text('Shopify Admin API'));
    expect(find.byKey(const ValueKey('shopify.accessToken')), findsOneWidget);
    expect(find.text('Pull payouts'), findsOneWidget);
    await scrollTo(tester, find.text('Zoho Books'));
    expect(find.textContaining('ZohoBooks.fullaccess.all'), findsOneWidget);
    expect(find.text('Pull now'), findsNothing);
    expect(find.text('Plaid (US bank feeds)'), findsNothing);
  });

  testWidgets('saving Razorpay posts the channel and the typed fields, then shows (saved) and Connected', (tester) async {
    final cloud = FakeCloud();
    await tester.pumpWidget(MycaApp(state: await hostedOwner(cloud)));
    await tester.pumpAndSettle();
    await openConnectors(tester);

    await scrollTo(tester, find.text('Razorpay'));
    await tester.enterText(find.byKey(const ValueKey('razorpay.keyId')), 'rzp_test_abc');
    await tester.enterText(find.byKey(const ValueKey('razorpay.keySecret')), 'shh-secret');
    final save = find.descendant(of: find.byKey(const ValueKey('razorpay')), matching: find.text('Save'));
    await scrollTo(tester, save);
    await tester.tap(save);
    await tester.pumpAndSettle();

    expect(cloud.connectorSaves, [
      {'channel': 'razorpay', 'keyId': 'rzp_test_abc', 'keySecret': 'shh-secret'},
    ]);
    final card = find.byKey(const ValueKey('razorpay'));
    expect(find.descendant(of: card, matching: find.text('(saved)')), findsOneWidget);
    expect(find.descendant(of: card, matching: find.text('Connected')), findsOneWidget);
    expect(find.descendant(of: card, matching: find.text('Saved.')), findsOneWidget);
    expect(tester.widget<TextField>(find.byKey(const ValueKey('razorpay.keySecret'))).controller!.text, '', reason: 'the secret is not kept in the field');
    expect(find.descendant(of: card, matching: find.text('Pause')), findsOneWidget);
  });

  testWidgets('saving Plaid sends the environment from the dropdown, and Connect my bank posts the public token from Plaid Link', (tester) async {
    final cloud = FakeCloud();
    final plaid = FakePlaidLink(publicToken: 'public-sandbox-xyz');
    await tester.pumpWidget(MycaApp(state: await hostedOwner(cloud, country: 'US', plaid: plaid)));
    await tester.pumpAndSettle();
    await openConnectors(tester);

    await tester.enterText(find.byKey(const ValueKey('plaid.clientId')), 'client-1');
    await tester.enterText(find.byKey(const ValueKey('plaid.secret')), 'sandbox-secret');
    final card = find.byKey(const ValueKey('plaid'));
    await tester.tap(find.descendant(of: card, matching: find.text('Save')));
    await tester.pumpAndSettle();
    expect(cloud.connectorSaves.single, {'channel': 'plaid', 'clientId': 'client-1', 'secret': 'sandbox-secret', 'environment': 'sandbox'});

    await tester.tap(find.text('Connect my bank'));
    await tester.pumpAndSettle();
    expect(plaid.opened, ['link-sandbox-token-1']);
    expect(cloud.plaidExchanges, ['public-sandbox-xyz']);
    expect(find.descendant(of: card, matching: find.textContaining('Bank linked (simulated), item item-sandbox-1')), findsOneWidget);

    await tester.tap(find.text('Pull transactions'));
    await tester.pumpAndSettle();
    expect(cloud.connectorSyncs, 1);
    expect(find.descendant(of: card, matching: find.text('bank: 12 rows pulled; see the reminder in MyCA')), findsOneWidget);
    expect(find.descendant(of: card, matching: find.text('Pulled to 2026-10-21')), findsOneWidget);
  });

  testWidgets('closing Plaid Link without a bank posts nothing and says so', (tester) async {
    final cloud = FakeCloud();
    cloud.connectorValues['plaid'] = {'clientId': 'client-1', 'secret': 's'};
    final plaid = FakePlaidLink();
    await tester.pumpWidget(MycaApp(state: await hostedOwner(cloud, country: 'US', plaid: plaid)));
    await tester.pumpAndSettle();
    await openConnectors(tester);

    await tester.tap(find.text('Connect my bank'));
    await tester.pumpAndSettle();
    expect(plaid.opened, hasLength(1));
    expect(cloud.plaidExchanges, isEmpty);
    expect(find.text('Plaid Link was closed before a bank was linked.'), findsOneWidget);
  });

  testWidgets('Connect Gusto opens the authorisation URL in the browser and tells the owner to refresh', (tester) async {
    final cloud = FakeCloud();
    final opened = <Uri>[];
    await tester.pumpWidget(MycaApp(state: await hostedOwner(cloud, country: 'US', openedLinks: opened)));
    await tester.pumpAndSettle();
    await openConnectors(tester);

    await scrollTo(tester, find.text('Connect Gusto'));
    await tester.tap(find.text('Connect Gusto'));
    await tester.pumpAndSettle();
    expect(cloud.gustoConnects, 1);
    expect(opened.single.host, 'api.gusto-demo.com');
    expect(find.textContaining('comes back to MyCA at https://api.example.test/v1/gusto/callback. Then tap Refresh.'), findsOneWidget);
  });

  testWidgets('a TaxJar lookup posts zip, city and state and shows the rate line', (tester) async {
    final cloud = FakeCloud();
    await tester.pumpWidget(MycaApp(state: await hostedOwner(cloud, country: 'US')));
    await tester.pumpAndSettle();
    await openConnectors(tester);

    await scrollTo(tester, find.text('Look up rate'));
    await tester.enterText(find.byKey(const ValueKey('taxjar.zip')), '78701');
    await tester.enterText(find.byKey(const ValueKey('taxjar.city')), 'Austin');
    await tester.enterText(find.byKey(const ValueKey('taxjar.state')), 'tx');
    await tester.tap(find.text('Look up rate'));
    await tester.pumpAndSettle();
    expect(cloud.taxjarLookups.single, {'zip': '78701', 'city': 'Austin', 'state': 'TX'});
    expect(find.text('Austin, TX: 8.25% combined (state 6.25%, county 0%, city 1%, special 1%), recorded as TX-AUSTIN.'), findsOneWidget);

    await tester.enterText(find.byKey(const ValueKey('taxjar.zip')), '787');
    await tester.tap(find.text('Look up rate'));
    await tester.pumpAndSettle();
    expect(find.text('A US zip code is five digits, optionally plus four.'), findsOneWidget);
  });

  testWidgets('when the service has no connector key the screen shows the hint', (tester) async {
    final cloud = FakeCloud()..connectorsUnavailable = true;
    await tester.pumpWidget(MycaApp(state: await hostedOwner(cloud, country: 'US')));
    await tester.pumpAndSettle();
    await openConnectors(tester);

    expect(find.text('The service has no connector key; ask the operator to set MYCA_CONNECTOR_KEY.'), findsOneWidget);
    expect(find.byType(ConnectorCard), findsNothing);
  });

  testWidgets('staff do not see the entry in the business menu', (tester) async {
    final cloud = FakeCloud();
    final state = await hostedOwner(cloud);
    cloud.role = 'staff';
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    expect(find.text('Connections to banks and apps'), findsNothing);
  });
}
