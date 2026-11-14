import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/lock/app_lock.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/home_screen.dart';
import 'package:myca/registers.dart';
import 'package:myca/screens/ask_screen.dart';
import 'package:myca/screens/audit_trail_screen.dart';
import 'package:myca/screens/bank_screen.dart';
import 'package:myca/screens/books_check_screen.dart';
import 'package:myca/screens/businesses_screen.dart';
import 'package:myca/screens/ca_screen.dart';
import 'package:myca/screens/cash_screen.dart';
import 'package:myca/screens/connections_screen.dart';
import 'package:myca/screens/connectors_screen.dart';
import 'package:myca/screens/employees_screen.dart';
import 'package:myca/screens/expense_screen.dart';
import 'package:myca/screens/expenses_screen.dart';
import 'package:myca/screens/gst_payment_screen.dart';
import 'package:myca/screens/gst_portal_screen.dart';
import 'package:myca/screens/ims_screen.dart';
import 'package:myca/screens/invite_screen.dart';
import 'package:myca/screens/invoice_screen.dart';
import 'package:myca/screens/marketplace_screen.dart';
import 'package:myca/screens/party_screen.dart';
import 'package:myca/screens/pay_bills_screen.dart';
import 'package:myca/screens/payroll_screen.dart';
import 'package:myca/screens/people_screen.dart';
import 'package:myca/screens/plan_screen.dart';
import 'package:myca/screens/quicko_screen.dart';
import 'package:myca/screens/recurring_screen.dart';
import 'package:myca/screens/register_screen.dart';
import 'package:myca/screens/remind_customer_screen.dart';
import 'package:myca/screens/remind_supplier_screen.dart';
import 'package:myca/screens/reminders_screen.dart';
import 'package:myca/screens/reports_screen.dart';
import 'package:myca/screens/review_screen.dart';
import 'package:myca/screens/security_screen.dart';
import 'package:myca/screens/statements_screen.dart';
import 'package:myca/screens/taxes_screen.dart';
import 'package:myca/screens/tds_credit_screen.dart';
import 'package:myca/screens/two_step_setup_screen.dart';
import 'package:myca/screens/year_close_screen.dart';

import 'cloud_test.dart' show hostedState, sessionOn, signedIn;
import 'fake_api.dart';
import 'fake_cloud.dart';
import 'lock_test.dart' show FakeLock;

typedef Open = Future<void> Function(WidgetTester tester);

class Viewport {
  const Viewport(this.name, this.width, this.height, [this.textScale = 1.0, this.keyboard = 0]);

  final String name;
  final double width;
  final double height;
  final double textScale;
  final double keyboard;
}

const small = Viewport('320x568', 320, 568);
const largest = Viewport('360x640 at 2.0x text', 360, 640, 2.0);
const others = [
  Viewport('360x640', 360, 640),
  Viewport('393x873', 393, 873),
  Viewport('412x915', 412, 915),
  Viewport('600x960', 600, 960),
  Viewport('800x1280', 800, 1280),
  Viewport('360x640 at 1.3x text', 360, 640, 1.3),
  Viewport('640x360 landscape', 640, 360),
  Viewport('360x640 with the keyboard up', 360, 640, 1.0, 290),
];

Future<void> pumpApp(WidgetTester tester, AppState state) async {
  await tester.pumpWidget(MycaApp(state: state));
  await tester.pumpAndSettle();
}

Future<void> push(WidgetTester tester, Widget screen) async {
  tester.state<NavigatorState>(find.byType(Navigator).first).push(MaterialPageRoute<void>(builder: (_) => screen));
  await tester.pumpAndSettle();
}

Open local(Widget screen, {void Function(FakeMycaApi api)? setup}) => (tester) async {
  final api = FakeMycaApi(signedIn: true);
  setup?.call(api);
  await pumpApp(tester, testState(api));
  await push(tester, screen);
};

Future<AppState> hostedOwner({bool business = true, String environment = 'production', String providerMode = 'live', String userName = 'Asha', bool consented = true, FakeLock? lock}) async {
  final cloud = FakeCloud()
    ..userName = userName
    ..noticeAccepted = consented
    ..serverEnvironment = environment
    ..providerMode = providerMode;
  final session = await signedIn(cloud);
  if (business) await session.createBusiness(name: 'Asha Traders', state: '29');
  return AppState(cloud: session, store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true), pickTextFile: (_) async => null, lock: lock ?? const NoAppLock(), now: () => DateTime(2026, 10, 6, 10));
}

Open hosted(Widget screen) => (tester) async {
  await pumpApp(tester, await hostedOwner());
  await push(tester, screen);
};

Future<void> tapText(WidgetTester tester, String text) async {
  if (find.text(text).evaluate().isEmpty) {
    await tester.scrollUntilVisible(find.text(text), 200, scrollable: find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down).last);
  }
  final target = find.text(text).first;
  await tester.ensureVisible(target);
  await tester.pumpAndSettle();
  await tester.tap(target);
  await tester.pumpAndSettle();
}

Open then(Open first, List<String> taps) => (tester) async {
  await first(tester);
  for (final label in taps) {
    await tapText(tester, label);
  }
};

Open thenTooltip(Open first, String tooltip) => (tester) async {
  await first(tester);
  await tester.tap(find.byTooltip(tooltip).first);
  await tester.pumpAndSettle();
};

const gujarat = PartyScreen(kind: RegisterKind.sales, partyName: 'Gujarat Weaves', partyGstin: '24AABCG1234F1Z5');
const fabric = PartyScreen(kind: RegisterKind.purchases, partyName: 'Fabric Co', partyGstin: '');

final Map<String, Open> screens = {
  'welcome': (t) async => pumpApp(t, testState(FakeMycaApi(signedIn: true), onboarded: false)),
  'sign in with pin': (t) async => pumpApp(t, testState(FakeMycaApi())),
  'where are your books': (t) async {
    final api = FakeMycaApi(signedIn: true);
    await pumpApp(t, AppState(api: api, store: MemoryOnboardingStore(isWelcomed: true), pickTextFile: (_) async => null, now: () => DateTime(2026, 10, 5, 22, 30)));
  },
  'phone sign in': (t) async {
    final cloud = FakeCloud();
    await pumpApp(t, hostedState(sessionOn(cloud)));
  },
  'privacy notice': (t) async => pumpApp(t, await hostedOwner(consented: false, business: false)),
  'your name': (t) async => pumpApp(t, await hostedOwner(userName: '', business: false)),
  'locked': (t) async => pumpApp(t, await hostedOwner(lock: FakeLock(answers: [false]))),
  'where are your books, tally': (t) async {
    final api = FakeMycaApi(signedIn: true);
    await pumpApp(t, AppState(api: api, store: MemoryOnboardingStore(isWelcomed: true), pickTextFile: (_) async => null, now: () => DateTime(2026, 10, 5, 22, 30)));
    await tapText(t, 'Tally');
  },
  'business setup': (t) async => pumpApp(t, await hostedOwner(business: false)),
  'home': (t) async => pumpApp(t, testState(FakeMycaApi(signedIn: true))),
  'home, first day': (t) async => pumpApp(t, testState(FakeMycaApi(signedIn: true, emptyBooks: true))),
  'home, hosted with sandbox banner': (t) async => pumpApp(t, await hostedOwner(providerMode: 'test')),
  'business menu, hosted': (t) async {
    await pumpApp(t, await hostedOwner());
    await t.tap(find.byTooltip('Your business'));
    await t.pumpAndSettle();
  },
  'new entry sheet': (t) async {
    await pumpApp(t, testState(FakeMycaApi(signedIn: true)));
    await t.tap(find.byTooltip('New entry'));
    await t.pumpAndSettle();
  },
  'who did you sell to': (t) async {
    await pumpApp(t, testState(FakeMycaApi(signedIn: true)));
    await t.tap(find.byTooltip('New entry'));
    await t.pumpAndSettle();
    await tapText(t, 'I sold something');
  },
  'sales register': local(const RegisterScreen(kind: RegisterKind.sales)),
  'purchases register': local(const RegisterScreen(kind: RegisterKind.purchases)),
  'customer thread': local(gujarat),
  'customer thread with sale form': (t) async {
    await local(gujarat)(t);
    await tapText(t, 'Sale');
  },
  'supplier thread': local(fabric),
  'customer thread, payment received': then(local(gujarat), ['Payment received']),
  'customer thread, quote': then(local(gujarat), ['Quote, order or challan']),
  'customer thread, tds withheld': then(local(gujarat), ['TDS withheld']),
  'supplier thread, new bill': then(local(fabric), ['Bill']),
  'supplier thread, paid': then(local(fabric), ['Paid']),
  'supplier thread, debit note': then(local(fabric), ['Debit note']),
  'supplier thread, terms': then(local(fabric), ['Supplier terms']),
  'invoice, credit note': then(local(const InvoiceScreen(invoiceId: 'INV-0002')), ['Credit note']),
  'invoice, debit note': then(local(const InvoiceScreen(invoiceId: 'INV-0002')), ['Debit note']),
  'invoice, cancel': then(local(const InvoiceScreen(invoiceId: 'INV-0002')), ['Cancel invoice']),
  'employees, add': then(local(const EmployeesScreen()), ['Add employee']),
  'employee': then(local(const EmployeesScreen()), ['Ravi Kumar']),
  'cash, tell balance': then(local(const CashScreen()), ['Tell MyCA your balance today']),
  'bank, record a transfer': then(local(const BankScreen()), ['Record a transfer']),
  'bank, line': then(local(const BankScreen()), ['NEFT CR GUJARAT WEAVES INV0002']),
  'marketplace, stock in or transfer': then(local(const MarketplaceScreen()), ['Stock in or transfer']),
  'marketplace, set a cost': then(local(const MarketplaceScreen()), ['Set a cost']),
  'marketplace, add a registration': then(local(const MarketplaceScreen()), ['Add a registration']),
  'reports, save a report': thenTooltip(local(const ReportsScreen()), 'Save a report'),
  'reports, run one': then(local(const ReportsScreen()), ['Sales by customer']),
  'statements, balance sheet': then(local(const StatementsScreen()), ['Balance sheet']),
  'statements, customer': then(local(const StatementsScreen()), ['Customer statement']),
  'repeating entries, add': then(local(const RecurringScreen()), ['Add a repeating expense']),
  'your ca, thread': then(local(const CaScreen()), ['Invoice INV-0002 to Gujarat Weaves']),
  'reminders, add': then(local(const RemindersScreen()), ['Reminder']),
  'taxes, form 26as': then(local(const TaxesScreen()), ['Form 26AS check']),
  'year close, preview': then(local(const YearCloseScreen()), ['Preview the closing']),
  'invoice': local(const InvoiceScreen(invoiceId: 'INV-0002')),
  'taxes': local(const TaxesScreen()),
  'review the return': local(const ReviewScreen(period: '2026-10')),
  'ims': local(const ImsScreen(period: '2026-10'), setup: (api) => api.has2b = true),
  'gst payment': local(const GstPaymentScreen(period: '2026-10', toPay: 125000)),
  'tds credit': local(const TdsCreditScreen()),
  'expenses': local(const ExpensesScreen()),
  'expense head': then(local(const ExpensesScreen()), ['Rent']),
  'expense form': local(const ExpenseScreen()),
  'employees': local(const EmployeesScreen()),
  'payroll': local(const PayrollScreen(period: '2026-10')),
  'cash': local(const CashScreen()),
  'who to pay': local(const PayBillsScreen()),
  'bank': local(const BankScreen()),
  'bank, no statement': local(const BankScreen(), setup: (api) => api.bankLines.clear()),
  'marketplace': local(const MarketplaceScreen()),
  'repeating entries': local(const RecurringScreen()),
  'reports': local(const ReportsScreen()),
  'statements': local(const StatementsScreen()),
  'audit trail': local(const AuditTrailScreen()),
  'your ca': local(const CaScreen()),
  'reminders': local(const RemindersScreen()),
  'books check': local(const BooksCheckScreen()),
  'remind customer': local(const RemindCustomerScreen(customer: 'Gujarat Weaves')),
  'remind supplier': local(const RemindSupplierScreen(supplier: 'Fabric Co', period: '2026-10')),
  'year close': local(const YearCloseScreen()),
  'ask': local(const AskScreen(first: 'How much GST do I owe?')),
  'people': hosted(const PeopleScreen()),
  'plan and billing': hosted(const PlanScreen()),
  'invite': hosted(const InviteScreen()),
  'security': hosted(const SecurityScreen()),
  'two-step setup': hosted(const TwoStepSetupScreen()),
  'connections': hosted(const ConnectionsScreen()),
  'connectors': hosted(const ConnectorsScreen()),
  'your businesses': hosted(const BusinessesScreen()),
  'quicko': hosted(const QuickoScreen()),
  'gst portal': hosted(const GstPortalScreen(period: '2026-10')),
};

Future<void> scrollThrough(WidgetTester tester) async {
  final scrollables = find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down);
  final states = [for (final e in scrollables.evaluate()) (e as StatefulElement).state as ScrollableState];
  for (final state in states) {
    for (var i = 0; i < 40 && state.mounted; i++) {
      final position = state.position;
      if (!position.hasContentDimensions || position.pixels >= position.maxScrollExtent) break;
      position.jumpTo((position.pixels + 300).clamp(0, position.maxScrollExtent));
      await tester.pump();
    }
  }
  await tester.pumpAndSettle();
}

Future<void> check(WidgetTester tester, Viewport port, Open open) async {
  tester.view.physicalSize = Size(port.width, port.height);
  tester.view.devicePixelRatio = 1;
  if (port.keyboard > 0) tester.view.viewInsets = FakeViewPadding(bottom: port.keyboard);
  tester.platformDispatcher.textScaleFactorTestValue = port.textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  await open(tester);
  await scrollThrough(tester);
  final error = const bool.fromEnvironment("QA_RAW") ? null : tester.takeException();
  expect(error, isNull, reason: 'layout error at ${port.name}: $error');
}

final Map<String, Widget> backTo = {
  'sales register': const RegisterScreen(kind: RegisterKind.sales),
  'customer thread': gujarat,
  'supplier thread': fabric,
  'invoice': const InvoiceScreen(invoiceId: 'INV-0002'),
  'taxes': const TaxesScreen(),
  'review the return': const ReviewScreen(period: '2026-10'),
  'expenses': const ExpensesScreen(),
  'employees': const EmployeesScreen(),
  'cash': const CashScreen(),
  'bank': const BankScreen(),
  'marketplace': const MarketplaceScreen(),
  'reports': const ReportsScreen(),
  'statements': const StatementsScreen(),
  'books check': const BooksCheckScreen(),
  'ask': const AskScreen(first: 'How much GST do I owe?'),
};

void main() {
  for (final entry in screens.entries) {
    for (final port in [small, largest, ...others]) {
      testWidgets('${entry.key} fits at ${port.name}', (tester) => check(tester, port, entry.value));
    }
  }

  for (final entry in backTo.entries) {
    testWidgets('back from ${entry.key} returns home', (tester) async {
      await local(entry.value)(tester);
      expect(find.byType(HomeScreen), findsNothing);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.byType(HomeScreen), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('plans show the India prices, and MyCA Assured says it is opening soon until it is on sale', (tester) async {
    await hosted(const PlanScreen())(tester);
    await scrollThrough(tester);
    expect(find.text('₹999 a month or ₹9,999 a year'), findsOneWidget);
    expect(find.text('₹1,999 a month or ₹19,999 a year'), findsOneWidget);
    expect(find.text('₹4,999 a month or ₹49,999 a year'), findsOneWidget);
    expect(find.text('₹5,999 a month or ₹59,999 a year'), findsOneWidget);
    expect(find.text('Opening soon'), findsOneWidget);
    expect(planOpeningSoon(PlanOffer.fromJson({'id': 'assured', 'title': 'MyCA Assured', 'monthlyRupees': 4999, 'productId': 'myca_assured_monthly', 'buyable': true})), isFalse);
    expect(planOpeningSoon(PlanOffer.fromJson({'id': 'pro', 'title': 'Pro', 'monthlyRupees': 1999})), isFalse);
    expect(find.textContaining(RegExp('penalt', caseSensitive: false)), findsNothing);
  });

  testWidgets('the sandbox banner shows only when the server is not on live providers', (tester) async {
    await pumpApp(tester, await hostedOwner(providerMode: 'test'));
    expect(find.byKey(const Key('test-server-banner')), findsOneWidget);
    await tester.pumpWidget(MycaApp(key: UniqueKey(), state: await hostedOwner(providerMode: 'live')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('test-server-banner')), findsNothing);
  });

  test('amounts use Indian grouping and plan dates read as day month year', () {
    expect(rupees(100000), '₹1,00,000.00');
    expect(rupees(12345678.5), '₹1,23,45,678.50');
    expect(wholeRupees(100000), '₹1,00,000');
    expect(longDate('2026-12-05'), '5 December 2026');
    expect(entitlementLine(Entitlement.fromJson({'plan': 'pro', 'planTitle': 'Pro', 'subscription': {'status': 'active', 'plan': 'pro', 'renews': true, 'currentEnd': '2026-12-05T00:00:00.000Z'}})), 'You are on Pro, renews 5 December 2026.');
  });
}
