import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets.dart';

enum StatementKind { profitAndLoss, balanceSheet, cashFlow, customer }

const statementTitles = {
  StatementKind.profitAndLoss: 'Profit and loss',
  StatementKind.balanceSheet: 'Balance sheet',
  StatementKind.cashFlow: 'Cash flow',
  StatementKind.customer: 'Customer statement',
};

const _tools = {
  StatementKind.profitAndLoss: 'profit_and_loss',
  StatementKind.balanceSheet: 'balance_sheet',
  StatementKind.cashFlow: 'cash_flow_statement',
  StatementKind.customer: 'customer_statement',
};

enum StatementPeriod { thisYear, lastYear, thisMonth, lastMonth }

const periodLabels = {
  StatementPeriod.thisYear: 'This year',
  StatementPeriod.lastYear: 'Last year',
  StatementPeriod.thisMonth: 'This month',
  StatementPeriod.lastMonth: 'Last month',
};

typedef DateSpan = ({String from, String to});

DateSpan statementSpan(StatementPeriod period, DateTime today, {int yearStartMonth = 4}) {
  DateTime yearStart(DateTime day) {
    final year = day.month >= yearStartMonth ? day.year : day.year - 1;
    return DateTime(year, yearStartMonth, 1);
  }

  switch (period) {
    case StatementPeriod.thisYear:
      return (from: isoDate(yearStart(today)), to: isoDate(today));
    case StatementPeriod.lastYear:
      final start = yearStart(today);
      final lastStart = DateTime(start.year - 1, start.month, 1);
      return (from: isoDate(lastStart), to: isoDate(start.subtract(const Duration(days: 1))));
    case StatementPeriod.thisMonth:
      return (from: isoDate(DateTime(today.year, today.month, 1)), to: isoDate(today));
    case StatementPeriod.lastMonth:
      final first = DateTime(today.year, today.month, 1);
      final lastEnd = first.subtract(const Duration(days: 1));
      return (from: isoDate(DateTime(lastEnd.year, lastEnd.month, 1)), to: isoDate(lastEnd));
  }
}

class StatementLine {
  const StatementLine(this.label, this.amount, {this.detail = ''});

  final String label;
  final num amount;
  final String detail;
}

class StatementSection {
  const StatementSection(this.title, this.lines, {this.total, this.totalLabel = 'Total'});

  final String title;
  final List<StatementLine> lines;
  final num? total;
  final String totalLabel;
}

class StatementView {
  const StatementView({required this.headline, required this.sections, required this.fileName, required this.csv, this.warning = ''});

  final String headline;
  final List<StatementSection> sections;
  final String fileName;
  final String csv;
  final String warning;

  static List<Map<String, dynamic>> _rows(Object? value) => [
    for (final row in (value as List? ?? const [])) Map<String, dynamic>.from(row as Map),
  ];

  static List<StatementLine> _accounts(Object? value) => [
    for (final row in _rows(value)) StatementLine(row['account'] as String? ?? '', row['amount'] as num? ?? 0),
  ];

  static StatementView? fromTool(StatementKind kind, Object? json) {
    final data = toolData(json);
    if (data.isEmpty) return null;
    final fileName = data['fileName'] as String? ?? 'statement.csv';
    final csv = data['csv'] as String? ?? '';
    final headline = data['text'] as String? ?? '';
    switch (kind) {
      case StatementKind.profitAndLoss:
        final net = data['netProfit'] as num? ?? 0;
        return StatementView(
          headline: headline,
          fileName: fileName,
          csv: csv,
          sections: [
            StatementSection('Income', _accounts(data['income']), total: data['totalIncome'] as num?),
            StatementSection('Expenses', _accounts(data['expenses']), total: data['totalExpenses'] as num?),
            StatementSection('Result', [StatementLine(net >= 0 ? 'Net profit' : 'Net loss', net)]),
          ],
          warning: (data['undatedEntries'] as num? ?? 0) > 0 ? 'Some entries have no date and are left out of this period.' : '',
        );
      case StatementKind.balanceSheet:
        return StatementView(
          headline: headline,
          fileName: fileName,
          csv: csv,
          sections: [
            StatementSection('Assets', _accounts(data['assets']), total: data['totalAssets'] as num?),
            StatementSection('Liabilities', _accounts(data['liabilities']), total: data['totalLiabilities'] as num?),
            StatementSection('Equity', _accounts(data['equity']), total: data['totalEquity'] as num?),
          ],
          warning: data['balanced'] == false ? 'It does not balance. Ask your CA to look at the books.' : '',
        );
      case StatementKind.cashFlow:
        List<StatementLine> flows(Object? section) => [
          for (final line in _rows((section as Map?)?['lines']))
            StatementLine(line['label'] as String? ?? '', line['net'] as num? ?? 0, detail: 'In ${rupees(line['in'] as num? ?? 0)} · out ${rupees(line['out'] as num? ?? 0)}'),
        ];
        num net(Object? section) => (section as Map?)?['net'] as num? ?? 0;
        return StatementView(
          headline: headline,
          fileName: fileName,
          csv: csv,
          sections: [
            StatementSection('At the start', [StatementLine('Cash and bank', data['opening'] as num? ?? 0)]),
            StatementSection('From running the business', flows(data['operating']), total: net(data['operating'])),
            if (flows(data['investing']).isNotEmpty) StatementSection('Assets and deposits', flows(data['investing']), total: net(data['investing'])),
            if (flows(data['financing']).isNotEmpty) StatementSection('Owner', flows(data['financing']), total: net(data['financing'])),
            StatementSection('At the end', [StatementLine('Cash and bank', data['closing'] as num? ?? 0)]),
          ],
          warning: data['ties'] == false ? 'The movements do not add up to the closing balance. Ask your CA to look.' : '',
        );
      case StatementKind.customer:
        return StatementView(
          headline: headline,
          fileName: fileName,
          csv: csv,
          sections: [
            StatementSection('Opening', [StatementLine('Balance at the start', data['opening'] as num? ?? 0)]),
            StatementSection('Entries', [
              for (final row in _rows(data['rows']))
                StatementLine(
                  '${row['entry']}${(row['reference'] as String? ?? '').isEmpty ? '' : ' ${row['reference']}'}',
                  row['balance'] as num? ?? 0,
                  detail: '${longDate(row['date'] as String? ?? '')} · ${(row['charged'] as num? ?? 0) > 0 ? 'charged ${rupees(row['charged'] as num)}' : 'paid ${rupees(row['paid'] as num? ?? 0)}'}',
                ),
            ]),
            StatementSection('Closing', [StatementLine('Balance at the end', data['closing'] as num? ?? 0)]),
          ],
        );
    }
  }
}

class StatementsScreen extends StatefulWidget {
  const StatementsScreen({super.key, this.initial = StatementKind.profitAndLoss, this.customer = ''});

  final StatementKind initial;
  final String customer;

  @override
  State<StatementsScreen> createState() => _StatementsScreenState();
}

class _StatementsScreenState extends State<StatementsScreen> {
  late StatementKind _kind = widget.initial;
  StatementPeriod _period = StatementPeriod.thisYear;
  late final TextEditingController _customer = TextEditingController(text: widget.customer);
  Future<StatementView?>? _view;
  String _error = '';
  String _note = '';

  MycaApi get api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_view == null && (_kind != StatementKind.customer || _customer.text.trim().isNotEmpty)) _view = _load();
  }

  @override
  void dispose() {
    _customer.dispose();
    super.dispose();
  }

  Future<StatementView?> _load() async {
    _error = '';
    _note = '';
    final span = statementSpan(_period, DateTime.now(), yearStartMonth: moneyCountry == 'US' || moneyCountry == 'AE' ? 1 : 4);
    final args = <String, Object?>{
      if (_kind == StatementKind.balanceSheet) 'asOf': span.to else ...{'from': span.from, 'to': span.to},
      if (_kind == StatementKind.customer) 'party': _customer.text.trim(),
    };
    try {
      final json = await api.query(_tools[_kind]!, args);
      final view = StatementView.fromTool(_kind, json);
      if (view == null && json is Map) _error = (json['hint'] as String?) ?? 'This statement could not be prepared.';
      return view;
    } on MycaApiException catch (err) {
      _error = err.message;
      return null;
    }
  }

  void _reload() {
    final next = _load();
    setState(() {
      _view = next;
    });
  }

  Future<void> _save(StatementView view) async {
    final saved = await AppScope.of(context).saveTextFile(view.fileName, view.csv);
    if (!mounted) return;
    setState(() => _note = saved ? 'Saved ${view.fileName}. Send it to your CA or the customer.' : 'Not saved.');
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Statements')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final kind in StatementKind.values)
                ChoiceChip(
                  label: Text(statementTitles[kind]!),
                  selected: _kind == kind,
                  onSelected: (_) {
                    _kind = kind;
                    if (kind == StatementKind.customer && _customer.text.trim().isEmpty) {
                      setState(() {
                        _view = null;
                      });
                    } else {
                      _reload();
                    }
                  },
                ),
            ],
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<StatementPeriod>(
            initialValue: _period,
            decoration: InputDecoration(labelText: _kind == StatementKind.balanceSheet ? 'As at the end of' : 'Period'),
            items: [for (final p in StatementPeriod.values) DropdownMenuItem(value: p, child: Text(periodLabels[p]!))],
            onChanged: (p) {
              if (p == null) return;
              _period = p;
              _reload();
            },
          ),
          if (_kind == StatementKind.customer) ...[
            const SizedBox(height: 12),
            TextField(
              controller: _customer,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.search,
              decoration: const InputDecoration(labelText: 'Customer'),
              onSubmitted: (_) => _reload(),
            ),
          ],
          const SizedBox(height: 16),
          if (_view == null)
            const EmptyNote(text: 'Type the customer\'s name to see their statement.')
          else
            FutureBuilder<StatementView?>(
              future: _view,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
                }
                final view = snap.data;
                if (view == null) return EmptyNote(text: _error.isEmpty ? 'This statement could not be prepared.' : _error);
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(view.headline, style: text.bodyLarge),
                    if (view.warning.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(view.warning, style: text.bodyMedium?.copyWith(color: Palette.warn)),
                    ],
                    for (final section in view.sections) ...[
                      const SizedBox(height: 16),
                      SectionLabel(section.title),
                      Panel(
                        children: [
                          if (section.lines.isEmpty) const ListTile(title: Text('Nothing in this period')),
                          for (final line in section.lines)
                            ListTile(
                              title: Text(line.label),
                              subtitle: line.detail.isEmpty ? null : Text(line.detail),
                              trailing: Text(rupees(line.amount), style: text.titleSmall),
                            ),
                          if (section.total != null)
                            ListTile(
                              title: Text(section.totalLabel, style: text.titleSmall),
                              trailing: Text(rupees(section.total!), style: text.titleSmall),
                            ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 16),
                    OutlinedButton.icon(onPressed: () => _save(view), icon: const Icon(Icons.download_outlined), label: const Text('Save as CSV')),
                    if (_note.isNotEmpty) ...[const SizedBox(height: 8), Text(_note, style: text.bodyMedium)],
                  ],
                );
              },
            ),
        ],
      ),
    );
  }
}
