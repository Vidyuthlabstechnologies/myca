import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/offline/offline_billing.dart';
import 'package:myca/offline/offline_files.dart';
import 'package:myca/offline/offline_models.dart';
import 'package:myca/screens/counter_sale_screen.dart';
import 'package:myca/screens/offline_bills_screen.dart';

import 'counter_sale_test.dart' show FakePrinter;
import 'fake_api.dart' show MemoryOnboardingStore;
import 'offline_support.dart';

Future<(AppState, OfflineServer, OfflineBilling)> offlineApp() async {
  final server = OfflineServer();
  final books = OfflineBilling(MemoryOfflineFiles(), now: () => DateTime(2026, 11, 21, 10, 30));
  final state = AppState(
    api: server,
    store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
    pickTextFile: (_) async => null,
    now: () => DateTime(2026, 11, 21, 10, 30),
    offline: books,
    offlineTimers: false,
  );
  await state.api.snapshot();
  await books.prepare(state.api);
  return (state, server, books);
}

void main() {
  testWidgets('with no connection a counter bill is made, paid, printed and later synced', (tester) async {
    final (state, server, books) = await offlineApp();
    server.reachable = false;
    final printer = FakePrinter();
    final codes = ['8901063010031', '8901063010031'];
    await tester.pumpWidget(AppScope(state: state, child: MaterialApp(home: CounterSaleScreen(scan: (_) async => codes.removeAt(0), printer: printer))));
    await tester.tap(find.byKey(const Key('counter-scan')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('counter-scan')));
    await tester.pumpAndSettle();
    expect(find.text('Parle-G 250g'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('counter-pay-upi')));
    await tester.tap(find.byKey(const Key('counter-pay-upi')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('counter-make')));
    await tester.tap(find.byKey(const Key('counter-make')));
    await tester.pumpAndSettle();
    expect(find.text('Bill INV-MA2627-0001 to Walk-in customer: ₹50.00 + CGST ₹4.50 + SGST ₹4.50 = ₹59.00.'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('counter-post')));
    await tester.tap(find.byKey(const Key('counter-post')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Saved INV-MA2627-0001 on this phone'), findsOneWidget);
    expect(find.textContaining('Paid by UPI.'), findsOneWidget);
    expect(books.bills.single.payment, {'amount': 59.0, 'mode': 'upi'});
    expect(books.receipts, isEmpty);

    await tester.ensureVisible(find.byKey(const Key('counter-print')));
    await tester.tap(find.byKey(const Key('counter-print')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('POS-58'));
    await tester.pumpAndSettle();
    final printed = String.fromCharCodes(printer.sent.single.where((b) => b >= 0x20 && b < 0x7f));
    expect(printed, contains('INV-MA2627-0001'));
    expect(printed, contains('Sharma Kirana'));
    expect(printed, contains('TAX INVOICE'));

    await tester.tap(find.byKey(const Key('counter-offline-bills')));
    await tester.pumpAndSettle();
    expect(find.byType(OfflineBillsScreen), findsOneWidget);
    expect(find.text('No connection. You can keep billing; bills are saved on this phone.'), findsWidgets);
    expect(find.byKey(const Key('offline-bill-INV-MA2627-0001')), findsOneWidget);

    server.reachable = true;
    await books.sync(state.api);
    await tester.pumpAndSettle();
    expect(books.bills.single.status, EntryStatus.synced);
    expect(server.posted.keys, ['INV-MA2627-0001']);
    expect(find.text('In your books'), findsOneWidget);
  });

  testWidgets('a conflict is shown with the fix and resolved from the phone', (tester) async {
    final (state, server, books) = await offlineApp();
    {
      final bill = await books.saveSale({
        'partyName': 'Walk-in customer',
        'lines': [
          {'description': 'Parle-G 250g', 'qty': 2, 'rate': 25, 'gstRate': 18},
        ],
      });
      server.conflictFor[bill.id] = {'status': 'conflict', 'error': 'FIGURES_DIFFER', 'engine': {'taxable': 50, 'cgst': 4.5, 'sgst': 4.5, 'igst': 0, 'total': 59.01}};
      await books.sync(state.api);
    }
    await tester.pumpWidget(AppScope(state: state, child: MaterialApp(home: OfflineBillsScreen(printer: FakePrinter()))));
    await tester.pumpAndSettle();
    expect(find.text('Needs you'), findsOneWidget);
    await tester.tap(find.byKey(const Key('offline-bill-INV-MA2627-0001')));
    await tester.pumpAndSettle();
    expect(find.textContaining('different GST figures'), findsWidgets);
    await tester.tap(find.byKey(const Key('offline-accept-engine')));
    await tester.pumpAndSettle();
    expect(books.bills.single.status, EntryStatus.synced);
    expect(books.bills.single.reprintNeeded, isTrue);
  });
}
