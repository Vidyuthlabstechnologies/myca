// Mobile UI pass, November 2026: every India screen that the earlier size
// checks did not reach (counter sale, offline bills, stock alerts, loyalty,
// online store, privacy rights, filing), plus every pushed India screen in
// Hindi and in dark mode, on the phones and tablets people actually use.
// A screen fails if anything overflows or throws while it is scrolled
// through, or if a rupee amount breaks across two lines.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_state.dart';
import 'package:myca/offline/offline_billing.dart';
import 'package:myca/offline/offline_files.dart';
import 'package:myca/registers.dart';
import 'package:myca/screens/audit_trail_screen.dart';
import 'package:myca/screens/bank_screen.dart';
import 'package:myca/screens/books_check_screen.dart';
import 'package:myca/screens/ca_screen.dart';
import 'package:myca/screens/cash_screen.dart';
import 'package:myca/screens/counter_sale_screen.dart';
import 'package:myca/screens/employees_screen.dart';
import 'package:myca/screens/expense_screen.dart';
import 'package:myca/screens/expenses_screen.dart';
import 'package:myca/screens/gst_payment_screen.dart';
import 'package:myca/screens/ims_screen.dart';
import 'package:myca/screens/invoice_screen.dart';
import 'package:myca/screens/loyalty_screen.dart';
import 'package:myca/screens/marketplace_screen.dart';
import 'package:myca/screens/offline_bills_screen.dart';
import 'package:myca/screens/online_store_screen.dart';
import 'package:myca/screens/party_screen.dart';
import 'package:myca/screens/pay_bills_screen.dart';
import 'package:myca/screens/payroll_screen.dart';
import 'package:myca/screens/people_screen.dart';
import 'package:myca/screens/plan_screen.dart';
import 'package:myca/screens/privacy_rights_screen.dart';
import 'package:myca/screens/recurring_screen.dart';
import 'package:myca/screens/register_screen.dart';
import 'package:myca/screens/reminders_screen.dart';
import 'package:myca/screens/reports_screen.dart';
import 'package:myca/screens/review_screen.dart';
import 'package:myca/screens/security_screen.dart';
import 'package:myca/screens/statements_screen.dart';
import 'package:myca/screens/stock_alerts_screen.dart';
import 'package:myca/screens/taxes_screen.dart';
import 'package:myca/screens/tds_credit_screen.dart';
import 'package:myca/screens/year_close_screen.dart';

import 'counter_sale_test.dart' show CounterApi, FakePrinter;
import 'device_matrix_test.dart' show brokenAmounts;
import 'devices.dart';
import 'fake_api.dart';
import 'loyalty_test.dart' show LoyaltyApi;
import 'offline_support.dart';
import 'online_store_test.dart' show StoreApi;
import 'qa_screens_sizes_test.dart' show Open, hosted, local, push, pumpApp, scrollThrough;
import 'stock_alerts_test.dart' show StockApi;

Open withApi(FakeMycaApi api, Widget screen) => (tester) async {
  api.signedIn = true;
  await pumpApp(tester, testState(api));
  await push(tester, screen);
};

Open offline({bool bills = true}) => (tester) async {
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
  await tester.runAsync(() async {
    await state.api.snapshot();
    await books.prepare(state.api);
    if (bills) {
      server.reachable = false;
      for (final customer in ['Walk-in customer', 'Gupta Traders']) {
        await books.saveSale({
          'partyName': customer,
          'lines': [
            {'description': 'Parle-G 250g', 'qty': 2, 'rate': 25, 'gstRate': 18},
            {'description': 'Tata Salt 1kg', 'qty': 1, 'rate': 28, 'gstRate': 0},
          ],
        });
      }
    }
  });
  await pumpApp(tester, state);
  await push(tester, OfflineBillsScreen(printer: FakePrinter()));
};

Open counterWithLines() => (tester) async {
  final api = CounterApi()..signedIn = true;
  final codes = ['8901063010031', '8901063010031'];
  await pumpApp(tester, testState(api));
  await push(tester, CounterSaleScreen(scan: (_) async => codes.isEmpty ? null : codes.removeAt(0), printer: FakePrinter()));
  for (var i = 0; i < 2; i++) {
    final scan = find.byKey(const Key('counter-scan'));
    await tester.ensureVisible(scan);
    await tester.pumpAndSettle();
    await tester.tap(scan);
    await tester.pumpAndSettle();
  }
};

/// Screens added to the India app after the 53-screen review (PR #301).
final Map<String, Open> newScreens = {
  'counter sale, empty': withApi(CounterApi(), CounterSaleScreen(printer: FakePrinter())),
  'counter sale with scanned lines': counterWithLines(),
  'offline bills, two waiting': offline(),
  'offline bills, none': offline(bills: false),
  'stock alerts': withApi(StockApi(), const StockAlertsScreen()),
  'loyalty points': withApi(LoyaltyApi(), const LoyaltyScreen()),
  'online store, settings': withApi(StoreApi(), const OnlineStoreScreen()),
  'online store, orders': withApi(StoreApi(), const OnlineStoreScreen(initialTab: 1)),
  'online store, off': withApi(StoreApi(live: false), const OnlineStoreScreen()),
  'privacy rights': hosted(const PrivacyRightsScreen()),
};

const gujarat = PartyScreen(kind: RegisterKind.sales, partyName: 'Gujarat Weaves', partyGstin: '24AABCG1234F1Z5');

/// Every pushed India screen, reachable without tapping English labels, so the
/// same walk works in Hindi.
final Map<String, Open> pushed = {
  ...newScreens,
  'sales register': local(const RegisterScreen(kind: RegisterKind.sales)),
  'purchases register': local(const RegisterScreen(kind: RegisterKind.purchases)),
  'customer thread': local(gujarat),
  'supplier thread': local(const PartyScreen(kind: RegisterKind.purchases, partyName: 'Fabric Co', partyGstin: '')),
  'invoice': local(const InvoiceScreen(invoiceId: 'INV-0002')),
  'taxes': local(const TaxesScreen()),
  'review the return': local(const ReviewScreen(period: '2026-10')),
  'ims': local(const ImsScreen(period: '2026-10'), setup: (api) => api.has2b = true),
  'gst payment': local(const GstPaymentScreen(period: '2026-10', toPay: 125000)),
  'tds credit': local(const TdsCreditScreen()),
  'expenses': local(const ExpensesScreen()),
  'expense form': local(const ExpenseScreen()),
  'employees': local(const EmployeesScreen()),
  'payroll': local(const PayrollScreen(period: '2026-10')),
  'cash': local(const CashScreen()),
  'who to pay': local(const PayBillsScreen()),
  'bank': local(const BankScreen()),
  'marketplace': local(const MarketplaceScreen()),
  'repeating entries': local(const RecurringScreen()),
  'reports': local(const ReportsScreen()),
  'statements': local(const StatementsScreen()),
  'audit trail': local(const AuditTrailScreen()),
  'your ca': local(const CaScreen()),
  'reminders': local(const RemindersScreen()),
  'books check': local(const BooksCheckScreen()),
  'year close': local(const YearCloseScreen()),
  'home': (t) async => pumpApp(t, testState(FakeMycaApi(signedIn: true))),
  'home, first day': (t) async => pumpApp(t, testState(FakeMycaApi(signedIn: true, emptyBooks: true))),
  'new entry sheet': (t) async {
    await pumpApp(t, testState(FakeMycaApi(signedIn: true)));
    await t.tap(find.byType(FloatingActionButton).first);
    await t.pumpAndSettle();
  },
  'people': hosted(const PeopleScreen()),
  'plan and billing': hosted(const PlanScreen()),
  'security': hosted(const SecurityScreen()),
};

class Run {
  const Run(this.device, {this.textScale = 1.0, this.dark = false, this.hindi = false});

  final Device device;
  final double textScale;
  final bool dark;
  final bool hindi;

  String get name => [
        device.name,
        if (textScale != 1.0) 'at ${textScale}x text',
        if (dark) 'dark',
        if (hindi) 'Hindi',
      ].join(', ');
}

Future<void> fits(WidgetTester tester, Run run, Open open) async {
  useDevice(tester, run.device, textScale: run.textScale, brightness: run.dark ? Brightness.dark : Brightness.light);
  if (run.hindi) {
    tester.platformDispatcher.localesTestValue = const [Locale('hi', 'IN')];
    addTearDown(tester.platformDispatcher.clearLocalesTestValue);
  }
  await open(tester);
  if (run.hindi) {
    final devanagari = RegExp('[\u0900-\u097F]');
    expect(find.byWidgetPredicate((w) => w is Text && devanagari.hasMatch(w.data ?? w.textSpan?.toPlainText() ?? '')), findsWidgets, reason: 'the screen should be in Hindi');
  }
  final first = tester.takeException();
  expect(first, isNull, reason: 'on open: $first');
  expect(brokenAmounts(tester), isEmpty, reason: 'an amount breaks across lines');
  await scrollThrough(tester);
  final error = tester.takeException();
  expect(error, isNull, reason: '$error');
  expect(brokenAmounts(tester), isEmpty, reason: 'an amount breaks across lines');
}

const newScreenRuns = [
  Run(compactPhone),
  Run(compactPhone, textScale: 2.0),
  Run(smallPhone, textScale: 1.3),
  Run(largePhone),
  Run(foldCover, textScale: 2.0),
  Run(foldOpen),
  Run(tablet),
  Run(tabletLandscape),
  Run(phoneLandscape, textScale: 1.3),
];

const everyScreenRuns = [
  Run(smallPhone, hindi: true),
  Run(compactPhone, textScale: 1.3, hindi: true),
  Run(mediumPhone, dark: true, textScale: 2.0),
  Run(foldCover, dark: true, hindi: true),
];

void main() {
  downMain();
  for (final run in newScreenRuns) {
    group(run.name, () {
      for (final entry in newScreens.entries) {
        testWidgets('${entry.key} fits', (tester) => fits(tester, run, entry.value));
      }
    });
  }
  for (final run in everyScreenRuns) {
    group(run.name, () {
      for (final entry in pushed.entries) {
        testWidgets('${entry.key} fits', (tester) => fits(tester, run, entry.value));
      }
    });
  }

  testWidgets('the counter sale buttons are big enough to tap with a thumb', (tester) async {
    useDevice(tester, compactPhone);
    await counterWithLines()(tester);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
  });

  testWidgets('offline bills and stock alerts meet the tap target and label guidelines', (tester) async {
    useDevice(tester, smallPhone);
    await offline()(tester);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await tester.pumpWidget(const SizedBox());
    await withApi(StockApi(), const StockAlertsScreen())(tester);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  });

  testWidgets('loyalty points and the online store meet the tap target and label guidelines', (tester) async {
    useDevice(tester, smallPhone);
    await withApi(LoyaltyApi(), const LoyaltyScreen())(tester);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await tester.pumpWidget(const SizedBox());
    await withApi(StoreApi(), const OnlineStoreScreen())(tester);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  });

  testWidgets('dark mode keeps body text readable on the new India screens', (tester) async {
    useDevice(tester, mediumPhone, brightness: Brightness.dark);
    for (final open in [withApi(LoyaltyApi(), const LoyaltyScreen()), withApi(StockApi(), const StockAlertsScreen()), withApi(StoreApi(), const OnlineStoreScreen())]) {
      await open(tester);
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      await tester.pumpWidget(const SizedBox());
    }
  });
}

/// Answers the home snapshot, then fails every screen's own data call the way
/// a dropped connection does.
class DownApi extends FakeMycaApi {
  DownApi({this.reply}) : super(signedIn: true);

  final Object? reply;

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    if (reply != null) return reply;
    throw const MycaApiException('Cannot reach MyCA. Check your connection and try again.', code: 'UNREACHABLE');
  }
}

final Map<String, Widget> downScreens = {
  'stock alerts': const StockAlertsScreen(),
  'loyalty points': const LoyaltyScreen(),
  'online store': const OnlineStoreScreen(),
  'online store orders': const OnlineStoreScreen(initialTab: 1),
  'taxes': const TaxesScreen(),
  'review the return': const ReviewScreen(period: '2026-10'),
  'ims': const ImsScreen(period: '2026-10'),
  'gst payment': const GstPaymentScreen(period: '2026-10', toPay: 125000),
  'tds credit': const TdsCreditScreen(),
  'payroll': const PayrollScreen(period: '2026-10'),
  'who to pay': const PayBillsScreen(),
  'bank': const BankScreen(),
  'marketplace': const MarketplaceScreen(),
  'reports': const ReportsScreen(),
  'statements': const StatementsScreen(),
  'audit trail': const AuditTrailScreen(),
  'books check': const BooksCheckScreen(),
  'year close': const YearCloseScreen(),
  'cash': const CashScreen(),
  'employees': const EmployeesScreen(),
  'your ca': const CaScreen(),
  'invoice': const InvoiceScreen(invoiceId: 'INV-0002'),
};

/// Form screens that fetch nothing until the owner acts.
const loadsNothingOnOpen = {'gst payment', 'year close'};

void downMain() {
  for (final entry in downScreens.entries) {
    for (final (label, api) in [('cannot reach MyCA', () => DownApi()), ('server says no', () => DownApi(reply: const {'ok': false, 'error': 'INTERNAL'}))]) {
      testWidgets('${entry.key} when $label: says so and does not spin forever', (tester) async {
        useDevice(tester, smallPhone);
        await pumpApp(tester, testState(api()));
        await push(tester, entry.value);
        expect(tester.takeException(), isNull);
        expect(find.byType(CircularProgressIndicator), findsNothing, reason: 'still loading after the call failed');
        expect(find.byType(LinearProgressIndicator).hitTestable(), findsNothing, reason: 'still loading after the call failed');
        if (!loadsNothingOnOpen.contains(entry.key)) {
          final failed = RegExp('could not|cannot reach|not be', caseSensitive: false);
          expect(find.byWidgetPredicate((w) => w is Text && failed.hasMatch(w.data ?? '')).hitTestable(), findsWidgets, reason: 'the owner is not told the screen failed to load');
        }
      });
    }
  }
}
