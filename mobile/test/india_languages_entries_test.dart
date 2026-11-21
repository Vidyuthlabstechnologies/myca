import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/bill_capture_screen.dart';
import 'package:myca/screens/invoice_screen.dart';

import 'fake_api.dart';

Future<void> openOnHindiPhone(WidgetTester tester, Widget screen) async {
  tester.platformDispatcher.localesTestValue = const [Locale('hi', 'IN')];
  addTearDown(tester.platformDispatcher.clearLocalesTestValue);
  await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true))));
  await tester.pumpAndSettle();
  Navigator.of(tester.element(find.byType(Scaffold).first)).push(MaterialPageRoute<void>(builder: (_) => screen));
  await tester.pumpAndSettle();
}

void main() {
  test('the missing-details note reads in Hindi with every part in place', () {
    expect(missingNote(const ['SELLER_GSTIN', 'HSN'], 'hi'), 'इस इनवॉइस में आपका GSTIN और हर आइटम पर HSN या SAC कोड नहीं है। भेजने से पहले अपने CA से पूछ लें कि खरीदार को इसकी ज़रूरत है या नहीं।');
    expect(missingNote(const ['HSN']), contains('does not carry an HSN or SAC code on every item.'));
  });

  testWidgets('on a Hindi phone an invoice opens in Hindi without overflowing', (tester) async {
    await openOnHindiPhone(tester, const InvoiceScreen(invoiceId: 'INV-0002'));
    expect(find.text('इनवॉइस INV-0002'), findsOneWidget);
    expect(find.text('बिल किसे'), findsOneWidget);
    expect(find.text('कुल'), findsOneWidget);
    expect(find.text('Total'), findsNothing);
    final list = find.byType(Scrollable).last;
    await tester.scrollUntilVisible(find.text('प्रिंट करें या PDF सेव करें'), 200, scrollable: list);
    expect(find.textContaining('को भेजें'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('on a Hindi phone reading a bill is in Hindi', (tester) async {
    await openOnHindiPhone(tester, const BillCaptureScreen());
    expect(find.text('बिल पढ़ें'), findsOneWidget);
    expect(find.text('बिल चुनें'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
