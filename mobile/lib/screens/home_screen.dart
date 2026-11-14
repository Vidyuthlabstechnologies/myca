import 'dart:async';

import 'package:flutter/material.dart';

import '../api/models.dart';
import '../notifications.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../attention.dart';
import '../brand.dart';
import '../format.dart';
import '../marks.dart';
import '../registers.dart';
import '../theme.dart';
import '../widgets.dart';
import 'ask_screen.dart';
import 'bank_screen.dart';
import 'books_check_screen.dart';
import 'marketplace_screen.dart';
import 'recurring_screen.dart';
import 'reports_screen.dart';
import 'statements_screen.dart';
import 'employees_screen.dart';
import 'ca_screen.dart';
import 'cash_screen.dart';
import 'reminders_screen.dart';
import 'expenses_screen.dart';
import 'business_sheet.dart';
import 'new_entry_sheet.dart';
import 'party_picker.dart';
import 'pay_bills_screen.dart';
import 'register_screen.dart';
import 'sales_tax_screen.dart';
import 'us_taxes_screen.dart';
import 'taxes_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.snapshot});

  final Snapshot snapshot;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Future<Today>? _today;
  Future<SalesTaxOverview?>? _salesTax;
  Future<Map<String, dynamic>>? _week;
  Future<Map<String, dynamic>>? _close;
  Future<SupplierDues>? _dues;

  bool get _us => widget.snapshot.company.country == 'US';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _today ??= _loadToday();
    _week ??= _loadWeek();
    _close ??= _loadClose();
    _dues ??= _loadDues();
    if (_us) _salesTax ??= loadSalesTax(AppScope.of(context).api);
  }

  Future<SupplierDues> _loadDues() async {
    if (_us) return SupplierDues.fromTool(null);
    final state = AppScope.of(context);
    try {
      return SupplierDues.fromTool(await state.api.query('supplier_dues'));
    } on MycaApiException {
      return SupplierDues.fromTool(null);
    }
  }

  Future<Map<String, dynamic>> _loadClose() async {
    final state = AppScope.of(context);
    try {
      return toolData(await state.api.query('daily_close'));
    } on MycaApiException {
      return const <String, dynamic>{};
    }
  }

  Future<Map<String, dynamic>> _loadWeek() async {
    final state = AppScope.of(context);
    try {
      final data = toolData(await state.api.query('week_ahead'));
      final items = [for (final row in (data['items'] as List? ?? const [])) DueItem.fromJson(row)].whereType<DueItem>().toList();
      unawaited(state.notifications.plan(items));
      return data;
    } on MycaApiException {
      return const <String, dynamic>{};
    }
  }

  @override
  void didUpdateWidget(HomeScreen old) {
    super.didUpdateWidget(old);
    if (old.snapshot != widget.snapshot) {
      _today = _loadToday();
      _week = _loadWeek();
      _close = _loadClose();
      _dues = _loadDues();
      if (_us) _salesTax = loadSalesTax(AppScope.of(context).api);
    }
  }

  Future<Today> _loadToday() => loadToday(AppScope.of(context).api);

  void _openCheckOnce() {
    final state = AppScope.of(context);
    if (!state.showBooksCheck) return;
    state.showBooksCheck = false;
    final books = widget.snapshot;
    if (books.invoices.isEmpty &&
        books.purchases.isEmpty &&
        books.expenses.isEmpty) {
      return;
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _open(const BooksCheckScreen());
    });
  }

  void _open(Widget screen) => Navigator.of(
    context,
  ).push(MaterialPageRoute<void>(builder: (_) => screen));

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final snapshot = widget.snapshot;
    _openCheckOnce();
    final text = Theme.of(context).textTheme;
    final company = snapshot.company;
    final empty = snapshot.invoices.isEmpty && snapshot.purchases.isEmpty;
    return Scaffold(
      appBar: AppBar(
        title: const Wordmark(size: 18),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 9),
            child: Tooltip(
              message: 'Your business',
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: () => showBusinessSheet(context, snapshot),
                child: SizedBox(
                  width: 48,
                  height: 48,
                  child: Center(
                    child: TintTile(
                      tint: Tint.ask,
                      letter: company.name.trim().isEmpty
                          ? '?'
                          : company.name.trim()[0].toUpperCase(),
                      size: 34,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        tooltip: 'New entry',
        onPressed: () => showNewEntrySheet(context),
        icon: const Icon(Icons.add, size: 20),
        label: const Text('New entry'),
      ),
      body: RefreshIndicator(
        onRefresh: state.refresh,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(2, 0, 2, 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(greetingFor(state.now()), style: text.bodyMedium),
                  const SizedBox(height: 2),
                  Text(
                    company.name,
                    style: text.headlineMedium,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (widget.snapshot.sharedAsOf.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      'Shared by the owner as of ${sharedOn(widget.snapshot.sharedAsOf)}. Entries after that are not shown, and changes are made by the owner.',
                      style: text.bodyMedium?.copyWith(color: Palette.warn),
                    ),
                  ],
                ],
              ),
            ),
            if (state.recoveryNote.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: _RecoveryNote(words: state.recoveryNote, onDismiss: state.dismissRecoveryNote),
              ),
            _AskBar(onSubmit: (text) => _open(AskScreen(first: text))),
            const SizedBox(height: 18),
            if (company.country == 'IN')
              FutureBuilder<Today>(
                future: _today,
                builder: (context, today) => _TodayPanel(
                  today: today.data,
                  failed: today.hasError,
                  onTap: () => _open(const TaxesScreen()),
                ),
              )
            else
              FutureBuilder<SalesTaxOverview?>(
                future: _salesTax,
                builder: (context, snap) => _SalesTaxPanel(
                  overview: snap.data,
                  loading: snap.connectionState != ConnectionState.done,
                  onTap: () async {
                    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const SalesTaxScreen()));
                    if (!mounted) return;
                    setState(() { _salesTax = loadSalesTax(AppScope.of(context).api); });
                  },
                ),
              ),
            if (company.country != 'IN')
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: _UsTaxesPanel(onTap: () => _open(const UsTaxesScreen())),
              ),
            FutureBuilder<Map<String, dynamic>>(
              future: _close,
              builder: (context, snap) {
                final data = snap.data ?? const <String, dynamic>{};
                final checklist = [for (final row in (data['checklist'] as List? ?? const [])) if (row is Map) Map<String, dynamic>.from(row)];
                if (checklist.isEmpty) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: _ClosePanel(data: data, checklist: checklist),
                );
              },
            ),
            FutureBuilder<SupplierDues>(
              future: _dues,
              builder: (context, snap) {
                final dues = snap.data;
                if (_us || dues == null || dues.msme.count == 0) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: _MsmePanel(dues: dues, onTap: () => _open(const PayBillsScreen())),
                );
              },
            ),
            FutureBuilder<Map<String, dynamic>>(
              future: _week,
              builder: (context, snap) {
                final items = [for (final row in (snap.data?['items'] as List? ?? const [])) if (row is Map) Map<String, dynamic>.from(row)];
                if (items.isEmpty) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: _WeekPanel(items: items),
                );
              },
            ),
            FutureBuilder<Today>(
              future: _today,
              builder: (context, today) {
                final due = (today.data?.reminders ?? const <Reminder>[])
                    .where((r) => r.isDue)
                    .toList();
                if (due.isEmpty) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: _DuePanel(
                    reminders: due,
                    onTap: (reminder) async {
                      if (await confirmReminderDone(context, reminder) &&
                          mounted) {
                        final next = _loadToday();
                        setState(() {
                          _today = next;
                        });
                      }
                    },
                  ),
                );
              },
            ),
            FutureBuilder<Today>(
              future: _today,
              builder: (context, today) {
                final summary = today.data?.summary;
                if (summary == null) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: _SummaryPanel(
                    summary: summary,
                    onSales: () =>
                        _open(const RegisterScreen(kind: RegisterKind.sales)),
                    onPurchases: () => _open(
                      const RegisterScreen(kind: RegisterKind.purchases),
                    ),
                    onExpenses: () => _open(const ExpensesScreen()),
                    onPayroll: () => _open(const EmployeesScreen()),
                  ),
                );
              },
            ),
            const SizedBox(height: 26),
            if (empty) ...[
              _FirstSaleCard(
                onTap: () => startEntry(context, RegisterKind.sales),
              ),
              const SizedBox(height: 26),
            ],
            const SectionLabel('Your books'),
            Panel(
              children: [
                RowCard(
                  leading: const TintTile(tint: Tint.sales, mark: Mark.sales),
                  title: 'Sales',
                  subtitle: registerSubtitle(
                    snapshot.invoices,
                    RegisterKind.sales,
                  ),
                  trailing: const Chevron(),
                  onTap: () =>
                      _open(const RegisterScreen(kind: RegisterKind.sales)),
                ),
                RowCard(
                  leading: const TintTile(
                    tint: Tint.purchases,
                    mark: Mark.purchases,
                  ),
                  title: 'Purchases',
                  subtitle: registerSubtitle(
                    snapshot.purchases,
                    RegisterKind.purchases,
                  ),
                  trailing: const Chevron(),
                  onTap: () =>
                      _open(const RegisterScreen(kind: RegisterKind.purchases)),
                ),
                RowCard(
                  leading: const TintTile(
                    tint: Tint.expense,
                    mark: Mark.expense,
                  ),
                  title: 'Expenses',
                  subtitle: expensesSubtitle(snapshot.expenses),
                  trailing: const Chevron(),
                  onTap: () => _open(const ExpensesScreen()),
                ),
                if (snapshot.activeUser?.role != 'staff' &&
                    snapshot.activeUser?.role != 'accountant')
                  RowCard(
                    leading: const TintTile(tint: Tint.ask, mark: Mark.employee),
                    title: 'Employees',
                    subtitle: 'Who works for you and what they are paid',
                    trailing: const Chevron(),
                    onTap: () => _open(const EmployeesScreen()),
                  ),
              ],
            ),
            const SizedBox(height: 26),
            const SectionLabel('Money and follow-up'),
            Panel(
              children: [
                RowCard(
                  leading: const TintTile(tint: Tint.sales, mark: Mark.bringIn),
                  title: 'Cash',
                  subtitle:
                      'Bank and cash, the next 30 days, and can I afford it',
                  trailing: const Chevron(),
                  onTap: () => _open(const CashScreen()),
                ),
                RowCard(
                  leading: const TintTile(tint: Tint.sales, mark: Mark.otherApp),
                  title: 'Marketplace',
                  subtitle: 'Payouts, TCS and TDS, margins by SKU, stock, GST registrations',
                  trailing: const Chevron(),
                  onTap: () => _open(const MarketplaceScreen()),
                ),
                RowCard(
                  leading: const TintTile(tint: Tint.ask, mark: Mark.switchBooks),
                  title: 'Bank',
                  subtitle: 'Your statement next to your books, matched and not matched',
                  trailing: const Chevron(),
                  onTap: () => _open(const BankScreen()),
                ),
                RowCard(
                  leading: const TintTile(tint: Tint.ask, mark: Mark.comingUp),
                  title: 'Repeating entries',
                  subtitle: 'Invoices, bills and expenses posted on their dates',
                  trailing: const Chevron(),
                  onTap: () => _open(const RecurringScreen()),
                ),
                RowCard(
                  leading: const TintTile(tint: Tint.taxes, mark: Mark.sales),
                  title: 'Reports',
                  subtitle: 'Saved reports run by name, compared with the period before',
                  trailing: const Chevron(),
                  onTap: () => _open(const ReportsScreen()),
                ),
                RowCard(
                  leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
                  title: 'Statements',
                  subtitle: 'Profit and loss, balance sheet, cash flow, customer statements',
                  trailing: const Chevron(),
                  onTap: () => _open(const StatementsScreen()),
                ),
                RowCard(
                  leading: const TintTile(tint: Tint.ask, mark: Mark.people),
                  title: 'Your CA',
                  subtitle: 'Questions you asked and their answers',
                  trailing: const Chevron(),
                  onTap: () => _open(const CaScreen()),
                ),
                RowCard(
                  leading: const TintTile(tint: Tint.ask, mark: Mark.comingUp),
                  title: 'Reminders',
                  subtitle: 'Anything you asked to be reminded of',
                  trailing: const Chevron(),
                  onTap: () => _open(const RemindersScreen()),
                ),
                RowCard(
                  leading: const TintTile(tint: Tint.taxes, mark: Mark.confirm),
                  title: 'Books check',
                  subtitle: 'What needs you, worked out from your books',
                  trailing: const Chevron(),
                  onTap: () => _open(const BooksCheckScreen()),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _RecoveryNote extends StatelessWidget {
  const _RecoveryNote({required this.words, required this.onDismiss});

  final String words;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      key: const ValueKey('home.recovery'),
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 14, 8, 6),
      decoration: BoxDecoration(
        color: Palette.warnSoft,
        borderRadius: BorderRadius.circular(radiusCard),
        border: Border.all(color: Palette.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(words, style: text.bodyLarge),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(onPressed: onDismiss, child: const Text('Got it')),
          ),
        ],
      ),
    );
  }
}

class _UsTaxesPanel extends StatelessWidget {
  const _UsTaxesPanel({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Material(
      color: Palette.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusCard), side: BorderSide(color: Palette.line)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 14, 16),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('FEDERAL AND OWNER TAXES', style: text.labelSmall),
                    const SizedBox(height: 6),
                    Text('Estimated tax dates, Schedule C, Form 941, W-2 and 1099', style: text.titleMedium),
                  ],
                ),
              ),
              const Chevron(),
            ],
          ),
        ),
      ),
    );
  }
}

class _SalesTaxPanel extends StatelessWidget {
  const _SalesTaxPanel({required this.overview, required this.loading, required this.onTap});

  final SalesTaxOverview? overview;
  final bool loading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final data = overview;
    final first = data?.states.firstOrNull;
    final headline = loading
        ? 'Checking your sales tax…'
        : data == null
        ? 'Could not check your sales tax'
        : !data.hasNexus
        ? 'Set up sales tax'
        : data.overdue > 0
        ? (data.overdue == 1 ? '1 sales tax return is overdue' : '${data.overdue} sales tax returns are overdue')
        : 'Sales tax is on track';
    final detail = loading
        ? ''
        : data == null
        ? 'Pull down to try again.'
        : !data.hasNexus
        ? 'Say which states you collect sales tax in.'
        : first?.lastPeriod == null
        ? '${first?.state}: no period has ended yet.'
        : '${first!.state} ${salesTaxPeriodWords(first.lastPeriod!)}';
    return Material(
      color: Palette.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusCard), side: BorderSide(color: Palette.line)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 14, 16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('SALES TAX', style: text.labelSmall),
                    const SizedBox(height: 6),
                    Text(headline, style: text.titleLarge),
                    if (detail.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(detail, style: text.bodyMedium?.copyWith(color: Palette.muted)),
                    ],
                  ],
                ),
              ),
              const Chevron(),
            ],
          ),
        ),
      ),
    );
  }
}

class _TodayPanel extends StatelessWidget {
  const _TodayPanel({
    required this.today,
    required this.failed,
    required this.onTap,
  });

  final Today? today;
  final bool failed;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final data = today;
    final open = data == null ? const <ExceptionItem>[] : needsYou(data);
    final urgent = open.any(isUrgent);
    final gst = data?.gst;
    final headline = failed
        ? 'Could not check your taxes'
        : data == null
        ? 'Checking your books…'
        : open.isEmpty
        ? 'You are all caught up'
        : open.length == 1
        ? '1 thing needs you'
        : '${open.length} things need you';
    final detail = failed
        ? 'Pull down to try again.'
        : open.isNotEmpty
        ? open.first.title
        : data == null
        ? ''
        : 'No returns overdue and nothing waiting on you.';
    return Material(
      color: Palette.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radiusCard),
        side: BorderSide(color: Palette.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 16, 14, 16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Wrap(
                          spacing: 12,
                          runSpacing: 4,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Text('TAXES AND FILINGS', style: text.labelSmall),
                            if (open.isNotEmpty)
                              StatusTag(
                                text: urgent ? 'Overdue' : 'Due soon',
                                color: urgent ? Palette.danger : Palette.warn,
                              ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(headline, style: text.headlineSmall),
                        if (detail.isNotEmpty) ...[
                          const SizedBox(height: 3),
                          Text(detail, style: text.bodyMedium),
                        ],
                      ],
                    ),
                  ),
                  const Padding(
                    padding: EdgeInsets.only(top: 2),
                    child: Chevron(),
                  ),
                ],
              ),
            ),
            if (gst != null) ...[
              const Divider(),
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 14, 18, 16),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'TAX ON SALES, ${monthLabel(gst.period).toUpperCase()}',
                            style: text.labelSmall,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            rupees(gst.outputTax.total),
                            style: text.headlineMedium?.copyWith(
                              fontFeatures: moneyFigures,
                              fontWeight: FontWeight.w400,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Flexible(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            gst.salesCount == 1
                                ? '1 sale'
                                : '${gst.salesCount} sales',
                            textAlign: TextAlign.end,
                            style: text.bodySmall?.copyWith(
                              fontFeatures: moneyFigures,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Credit on purchases ${rupees(gst.inputCredit.total)}',
                            textAlign: TextAlign.end,
                            style: text.bodySmall?.copyWith(
                              fontFeatures: moneyFigures,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _FirstSaleCard extends StatelessWidget {
  const _FirstSaleCard({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Material(
      color: Palette.accentSoft,
      borderRadius: BorderRadius.circular(radiusCard),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 14, 16),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Log your first sale',
                      style: text.titleLarge?.copyWith(color: Palette.accent),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      'Name the customer, enter the amount, confirm.',
                      style: text.bodyMedium?.copyWith(color: Palette.accent),
                    ),
                  ],
                ),
              ),
              Icon(Icons.arrow_forward, color: Palette.accent, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

class _SummaryPanel extends StatelessWidget {
  const _SummaryPanel({
    required this.summary,
    required this.onSales,
    required this.onPurchases,
    required this.onExpenses,
    this.onPayroll,
  });

  final BusinessSummary summary;
  final VoidCallback onSales;
  final VoidCallback onPurchases;
  final VoidCallback onExpenses;
  final VoidCallback? onPayroll;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final owed = summary.customers;
    return Container(
      decoration: BoxDecoration(
        color: Palette.surface,
        borderRadius: BorderRadius.circular(radiusCard),
        border: Border.all(color: Palette.line),
      ),
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            monthLabel(summary.period).toUpperCase(),
            style: text.labelSmall,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _Figure(
                label: 'Sold',
                amount: summary.current.salesNet,
                before: summary.previous.salesNet,
                onTap: onSales,
              ),
              _Figure(
                label: 'Bought',
                amount: summary.current.purchases,
                before: summary.previous.purchases,
                onTap: onPurchases,
              ),
              _Figure(
                label: 'Spent',
                amount: summary.current.expenses,
                before: summary.previous.expenses,
                onTap: onExpenses,
              ),
              if (summary.current.payrollStatus == 'approved' ||
                  summary.previous.payrollStatus == 'approved')
                _Figure(
                  label: 'Paid staff',
                  amount: summary.current.payrollGross,
                  before: summary.previous.payrollGross,
                  onTap: onPayroll ?? () {},
                ),
            ],
          ),
          const SizedBox(height: 14),
          const Divider(),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(flex: 3, child: Text('Owed to you', style: text.titleMedium)),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerRight,
                  child: Text(
                    rupees(summary.owedToYou),
                    style: text.titleMedium?.copyWith(fontFeatures: moneyFigures),
                  ),
                ),
              ),
            ],
          ),
          Text(
            summary.openInvoices == 0
                ? 'No invoice is waiting for payment.'
                : owed.map((c) => '${c.name} ${rupees(c.due)}').join(' · '),
            style: text.bodySmall?.copyWith(fontFeatures: moneyFigures),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                flex: 3,
                child: Text('You owe suppliers', style: text.titleMedium),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerRight,
                  child: Text(
                    rupees(summary.owedBySuppliers),
                    style: text.titleMedium?.copyWith(fontFeatures: moneyFigures),
                  ),
                ),
              ),
            ],
          ),
          Text(
            summary.unpaidBills == 0
                ? 'No bill is waiting to be paid.'
                : summary.suppliers
                      .map((s) => '${s.name} ${rupees(s.due)}')
                      .join(' · '),
            style: text.bodySmall?.copyWith(fontFeatures: moneyFigures),
          ),
        ],
      ),
    );
  }
}

class _AskBar extends StatefulWidget {
  const _AskBar({required this.onSubmit});

  final ValueChanged<String> onSubmit;

  @override
  State<_AskBar> createState() => _AskBarState();
}

class _AskBarState extends State<_AskBar> {
  final _text = TextEditingController();

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  void _send() {
    final message = _text.text.trim();
    if (message.isEmpty) return;
    _text.clear();
    FocusScope.of(context).unfocus();
    widget.onSubmit(message);
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _text,
      textInputAction: TextInputAction.send,
      onSubmitted: (_) => _send(),
      decoration: InputDecoration(
        hintText: 'Tell or ask MyCA anything',
        prefixIcon: Padding(
          padding: EdgeInsets.all(12),
          child: MarkIcon(mark: Mark.ask, size: 20, color: Palette.muted),
        ),
        suffixIcon: IconButton(
          tooltip: 'Send',
          icon: const Icon(Icons.arrow_upward, size: 20),
          onPressed: _send,
        ),
      ),
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure({
    required this.label,
    required this.amount,
    required this.before,
    required this.onTap,
  });

  final String label;
  final num amount;
  final num before;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(radiusControl),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: text.bodySmall),
              const SizedBox(height: 2),
              Text(
                compactRupees(amount),
                style: text.titleLarge?.copyWith(fontFeatures: moneyFigures),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              Text(
                'last ${compactRupees(before)}',
                style: text.bodySmall?.copyWith(fontFeatures: moneyFigures),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ClosePanel extends StatelessWidget {
  const _ClosePanel({required this.data, required this.checklist});

  final Map<String, dynamic> data;
  final List<Map<String, dynamic>> checklist;

  @override
  Widget build(BuildContext context) {
    final closed = data['status'] == 'closed';
    final needs = [for (final item in (data['needsYou'] as List? ?? const [])) '$item'];
    final cash = data['cash'] is Map ? Map<String, dynamic>.from(data['cash'] as Map) : const <String, dynamic>{};
    final rows = closed ? checklist.take(3).toList() : checklist.where((row) => row['ok'] != true).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionLabel(closed ? 'Books today · closed' : 'Books today · ${needs.length} ${needs.length == 1 ? 'needs' : 'need'} you'),
        Panel(
          children: [
            for (final row in rows)
              RowCard(
                leading: TintTile(tint: row['ok'] == true ? Tint.ask : Tint.urgent, mark: row['ok'] == true ? Mark.comingUp : Mark.urgent),
                title: '${row['item']}',
                subtitle: '${row['detail'] ?? ''}',
              ),
            RowCard(
              leading: const TintTile(tint: Tint.taxes, mark: Mark.sales),
              title: 'Bank ${rupees(cash['bank'] as num? ?? 0)} · customers owe ${rupees(data['receivable'] as num? ?? 0)}',
              subtitle: cash['source'] == 'recorded' ? 'As recorded; give today\'s bank balance for the real figure' : 'From the balance on ${cash['readingOn'] ?? ''} plus what was recorded since',
            ),
          ],
        ),
      ],
    );
  }
}

class _MsmePanel extends StatelessWidget {
  const _MsmePanel({required this.dues, required this.onTap});

  final SupplierDues dues;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final position = dues.msme;
    final count = position.count;
    final overdue = position.overdue;
    final bills = count == 1 ? 'bill' : 'bills';
    final next = dues.bills.where((bill) => bill.msme).firstOrNull;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionLabel('MSME suppliers'),
        Panel(
          children: [
            RowCard(
              key: const ValueKey('home.msme'),
              leading: overdue > 0
                  ? const TintTile(tint: Tint.urgent, mark: Mark.urgent)
                  : const TintTile(tint: Tint.taxes, mark: Mark.comingUp),
              title: overdue > 0
                  ? '$overdue ${overdue == 1 ? 'bill' : 'bills'} past the MSMED limit'
                  : '$count MSME $bills to pay inside the limit',
              subtitle: overdue > 0
                  ? '${rupees(position.overdueOutstanding)} not deductible until paid · $count MSME $bills open'
                  : (next == null
                        ? '${rupees(position.outstanding)} open'
                        : 'Next: ${next.supplier} by ${longDate(next.payBy)} · ${rupees(position.outstanding)} open'),
              trailing: const Chevron(),
              onTap: onTap,
            ),
          ],
        ),
      ],
    );
  }
}

class _WeekPanel extends StatelessWidget {
  const _WeekPanel({required this.items});

  final List<Map<String, dynamic>> items;

  static String _title(Map<String, dynamic> item) {
    final title = '${item['title']}';
    final amount = item['amount'];
    if (item['kind'] == 'receivable') {
      return '${title.split(' owes ').first} owes ${rupees(amount as num? ?? 0)} on ${item['invoiceId'] ?? ''}';
    }
    if (item['kind'] != 'payable' || amount is! num) return title;
    final supplier = RegExp(r'^Pay (.+) \S+ on \S+?(?: \(MSME\))?$').firstMatch(title)?.group(1);
    if (supplier == null) return title;
    return 'Pay $supplier ${rupees(amount)} on ${item['billId'] ?? ''}${item['msme'] == true ? ' (MSME)' : ''}';
  }

  @override
  Widget build(BuildContext context) {
    final overdue = items.where((item) => item['overdue'] == true).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionLabel(overdue > 0 ? 'This week · $overdue overdue' : 'This week'),
        Panel(
          children: [
            for (final item in items.take(6))
              RowCard(
                leading: TintTile(tint: item['overdue'] == true ? Tint.urgent : Tint.taxes, mark: item['overdue'] == true ? Mark.urgent : Mark.comingUp),
                title: _title(item),
                subtitle: '${item['detail'] ?? ''}',
              ),
          ],
        ),
      ],
    );
  }
}

class _DuePanel extends StatelessWidget {
  const _DuePanel({required this.reminders, required this.onTap});

  final List<Reminder> reminders;
  final void Function(Reminder) onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionLabel('Due today'),
        Panel(
          children: [
            for (final reminder in reminders)
              RowCard(
                leading: TintTile(
                  tint: reminder.state == 'overdue' ? Tint.urgent : Tint.taxes,
                  mark: Mark.dueSoon,
                ),
                title: reminder.text,
                subtitle: [
                  reminderWhen(reminder),
                  if (reminder.aboutLabel.isNotEmpty) reminder.aboutLabel,
                ].join(' · '),
                onTap: () => onTap(reminder),
              ),
          ],
        ),
      ],
    );
  }
}
