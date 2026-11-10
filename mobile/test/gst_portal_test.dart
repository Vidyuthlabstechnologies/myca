import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/gst_portal_screen.dart';

import 'connectors_test.dart' show hostedOwner;
import 'fake_cloud.dart';

Future<void> openPortal(WidgetTester tester, {String form = 'gstr1'}) async {
  tester.state<NavigatorState>(find.byType(Navigator).first).push(
        MaterialPageRoute<void>(builder: (_) => GstPortalScreen(period: '2026-10', gstin: '29ABCDE1234F1Z5', form: form)),
      );
  await tester.pumpAndSettle();
}

Future<void> tapText(WidgetTester tester, String label) async {
  final target = find.text(label);
  await tester.scrollUntilVisible(target, 200, scrollable: find.byType(Scrollable).last);
  await tester.tap(target);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('an owner connects the GST portal with the OTP and files GSTR-1 step by step', (tester) async {
    final cloud = FakeCloud();
    await tester.pumpWidget(MycaApp(state: await hostedOwner(cloud)));
    await tester.pumpAndSettle();
    await openPortal(tester);

    expect(find.text('File on the GST portal'), findsOneWidget);
    expect(find.textContaining('Test portal'), findsOneWidget);
    expect(find.text('Connect this GSTIN to the GST portal.'), findsOneWidget);

    await tapText(tester, 'Send OTP');
    expect(find.text('Enter the GST portal username of this GSTIN.'), findsOneWidget);

    await tester.enterText(find.byKey(const ValueKey('gstPortal.username')), 'asha_traders');
    await tapText(tester, 'Send OTP');
    expect(find.textContaining('sent an OTP'), findsOneWidget);

    await tester.enterText(find.byKey(const ValueKey('gstPortal.otp')), '111111');
    await tapText(tester, 'Connect');
    expect(find.text('The GST portal did not accept that OTP.'), findsOneWidget);

    await tester.enterText(find.byKey(const ValueKey('gstPortal.otp')), '575757');
    await tapText(tester, 'Connect');
    expect(find.textContaining('Connected as asha_traders'), findsOneWidget);

    final submit = find.widgetWithText(OutlinedButton, '3. Submit');
    expect(tester.widget<OutlinedButton>(submit).onPressed, isNull);

    await tapText(tester, '1. Save to the portal');
    await tapText(tester, '2. Check the save');
    expect(find.text('The portal accepted every invoice.'), findsOneWidget);
    await tapText(tester, '3. Submit');
    expect(find.text('PORTAL SUMMARY'), findsOneWidget);
    expect(find.textContaining('B2B: 2 records'), findsOneWidget);

    await tapText(tester, '4. Send the EVC OTP');
    await tester.enterText(find.byKey(const ValueKey('gstPortal.evc')), '424242');
    await tapText(tester, '5. File GSTR-1');
    expect(find.text('Filing cannot be undone. Check the portal summary first.'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'File'));
    await tester.pumpAndSettle();
    expect(find.text('Filed. Acknowledgement AA2711260012345.'), findsOneWidget);

    expect(cloud.gstr1Steps.map((s) => s['step']).toList(), ['save', 'check', 'submit', 'summary', 'otp', 'file']);
    expect(cloud.gstr1Steps.every((s) => s['period'] == '2026-10' && s['gstin'] == '29ABCDE1234F1Z5'), isTrue);
    expect(cloud.gstr1Steps.last['otp'], '424242');

    await tapText(tester, 'Disconnect the GST portal');
    expect(find.text('Disconnected from the GST portal.'), findsOneWidget);
    expect(cloud.gstPortalSessions, isEmpty);
  });

  testWidgets('an owner saves GSTR-3B, pays the tax from credit and cash, then files it with the EVC OTP', (tester) async {
    final cloud = FakeCloud();
    await tester.pumpWidget(MycaApp(state: await hostedOwner(cloud)));
    await tester.pumpAndSettle();
    await openPortal(tester, form: 'gstr3b');
    await tester.enterText(find.byKey(const ValueKey('gstPortal.username')), 'asha_traders');
    await tapText(tester, 'Send OTP');
    await tester.enterText(find.byKey(const ValueKey('gstPortal.otp')), '575757');
    await tapText(tester, 'Connect');
    expect(find.textContaining('GSTR-3B for'), findsOneWidget);

    final pay = find.widgetWithText(OutlinedButton, '3. Pay the tax');
    expect(tester.widget<OutlinedButton>(pay).onPressed, isNull);
    await tapText(tester, '1. Save to the portal');
    expect(find.text('Outward taxable ₹12,000.00, tax ₹740.00, credit ₹200.00.'), findsOneWidget);
    await tapText(tester, '2. Read the tax the portal works out');
    await tapText(tester, '3. Pay the tax');
    await tester.tap(find.widgetWithText(FilledButton, 'Pay'));
    await tester.pumpAndSettle();
    expect(find.textContaining('₹200.00 from credit and ₹540.00 from cash'), findsOneWidget);
    await tapText(tester, '4. Send the EVC OTP');
    await tester.enterText(find.byKey(const ValueKey('gstPortal.evc')), '424242');
    await tapText(tester, '5. File GSTR-3B');
    await tester.tap(find.widgetWithText(FilledButton, 'File'));
    await tester.pumpAndSettle();
    expect(find.text('Filed. Acknowledgement AA2711260099999.'), findsOneWidget);
    expect(cloud.gstr3bSteps.map((s) => s['step']).toList(), ['save', 'liability', 'offset', 'otp', 'file']);
    expect(cloud.gstr3bSteps.last['otp'], '424242');
  });

  testWidgets('the screen says plainly when the server has no GST portal keys', (tester) async {
    final cloud = FakeCloud()..gstPortalAvailable = false;
    await tester.pumpWidget(MycaApp(state: await hostedOwner(cloud)));
    await tester.pumpAndSettle();
    await openPortal(tester);
    expect(find.text('The GST portal keys are not set on this server yet.'), findsOneWidget);
    expect(find.text('Send OTP'), findsNothing);
  });
}
