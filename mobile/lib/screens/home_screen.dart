import 'package:flutter/material.dart';

import '../api/models.dart';
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
import 'expenses_screen.dart';
import 'business_sheet.dart';
import 'new_entry_sheet.dart';
import 'party_picker.dart';
import 'register_screen.dart';
import 'taxes_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.snapshot});

  final Snapshot snapshot;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Future<Today>? _today;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _today ??= _loadToday();
  }

  @override
  void didUpdateWidget(HomeScreen old) {
    super.didUpdateWidget(old);
    if (old.snapshot != widget.snapshot) _today = _loadToday();
  }

  Future<Today> _loadToday() => loadToday(AppScope.of(context).api);

  void _open(Widget screen) => Navigator.of(
    context,
  ).push(MaterialPageRoute<void>(builder: (_) => screen));

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final snapshot = widget.snapshot;
    final text = Theme.of(context).textTheme;
    final company = snapshot.company;
    final empty = snapshot.invoices.isEmpty && snapshot.purchases.isEmpty;
    return Scaffold(
      appBar: AppBar(
        title: const Wordmark(size: 18),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Tooltip(
              message: 'Your business',
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: () => showBusinessSheet(context, snapshot),
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
                ],
              ),
            ),
            FutureBuilder<Today>(
              future: _today,
              builder: (context, today) => _TodayPanel(
                today: today.data,
                failed: today.hasError,
                onTap: () => _open(const TaxesScreen()),
              ),
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
                RowCard(
                  leading: const TintTile(tint: Tint.ask, mark: Mark.ask),
                  title: 'Ask MyCA',
                  subtitle: 'Type anything about your books',
                  trailing: const Chevron(),
                  onTap: () => _open(const AskScreen()),
                ),
              ],
            ),
          ],
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
        side: const BorderSide(color: Palette.line),
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
                        Row(
                          children: [
                            Text('TAXES AND FILINGS', style: text.labelSmall),
                            if (open.isNotEmpty) ...[
                              const SizedBox(width: 12),
                              StatusTag(
                                text: urgent ? 'Overdue' : 'Due soon',
                                color: urgent ? Palette.danger : Palette.warn,
                              ),
                            ],
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
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          gst.salesCount == 1
                              ? '1 sale'
                              : '${gst.salesCount} sales',
                          style: text.bodySmall?.copyWith(
                            fontFeatures: moneyFigures,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Credit on purchases ${rupees(gst.inputCredit.total)}',
                          style: text.bodySmall?.copyWith(
                            fontFeatures: moneyFigures,
                          ),
                        ),
                      ],
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
              const Icon(Icons.arrow_forward, color: Palette.accent, size: 20),
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
  });

  final BusinessSummary summary;
  final VoidCallback onSales;
  final VoidCallback onPurchases;
  final VoidCallback onExpenses;

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
            ],
          ),
          const SizedBox(height: 14),
          const Divider(),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(child: Text('Owed to you', style: text.titleMedium)),
              Text(
                rupees(summary.owedToYou),
                style: text.titleMedium?.copyWith(fontFeatures: moneyFigures),
              ),
            ],
          ),
          Text(
            summary.openInvoices == 0
                ? 'No invoice is waiting for payment.'
                : owed.map((c) => '${c.name} ${rupees(c.due)}').join(' · '),
            style: text.bodySmall?.copyWith(fontFeatures: moneyFigures),
          ),
        ],
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
