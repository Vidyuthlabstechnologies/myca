import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  testWidgets('on a Hindi phone Employees and this month\'s payroll are in Hindi without overflowing', (tester) async {
    tester.platformDispatcher.localesTestValue = const [Locale('hi', 'IN')];
    addTearDown(tester.platformDispatcher.clearLocalesTestValue);
    await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true))));
    await tester.pumpAndSettle();
    await tapRow(tester, 'कर्मचारी');
    expect(find.text('1 कर्मचारी, कटौती से पहले ₹25,000.00 महीना।'), findsOneWidget);
    expect(find.text('कर्मचारी जोड़ें'), findsOneWidget);
    await tester.tap(find.text('October 2026 की सैलरी'));
    await tester.pumpAndSettle();
    expect(find.text('1 कर्मचारी · कुल ₹30,000.00 · हाथ में देना ₹28,000.00'), findsOneWidget);
    expect(find.text('यह ड्राफ़्ट है। आपके मंज़ूर करने तक कुछ भी दर्ज नहीं होगा।'), findsOneWidget);
    expect(find.text('हाथ में देना'), findsOneWidget);
    await tester.ensureVisible(find.text('सैलरी मंज़ूर करें'));
    await tester.pumpAndSettle();
    expect(find.text('सैलरी मंज़ूर करें'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('on a Hindi phone the customer reminder screen is in Hindi but the message to the customer stays as drafted', (tester) async {
    tester.platformDispatcher.localesTestValue = const [Locale('hi', 'IN')];
    addTearDown(tester.platformDispatcher.clearLocalesTestValue);
    final state = AppState(
      api: FakeMycaApi(signedIn: true),
      store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
      pickTextFile: (_) async => null,
      now: () => DateTime(2026, 10, 5, 22, 30),
    );
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tapRow(tester, 'बिक्री');
    await tester.tap(find.text('Gujarat Weaves'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('ग्राहक को याद दिलाएँ'));
    await tester.pumpAndSettle();
    expect(find.text('ग्राहक को याद दिलाएँ'), findsOneWidget);
    expect(find.text('1 बिल पर ₹5,900.00 बकाया, सबसे पुराना 40 दिन से रुका है।'), findsOneWidget);
    expect(find.textContaining('इसलिए यह मैसेज सीधा-सादा रखा गया है।'), findsOneWidget);
    final box = find.widgetWithText(TextField, 'मैसेज');
    expect(tester.widget<TextField>(box).controller!.text, startsWith('Hello Gujarat Weaves,'));
    expect(find.text('मेरे फ़ोन से भेजें'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
