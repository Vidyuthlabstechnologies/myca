import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../marks.dart';
import '../theme.dart';
import '../widgets.dart';

class UsTaxes {
  const UsTaxes({required this.estimated, required this.scheduleC, required this.payroll, required this.contractors});

  final Map<String, dynamic> estimated;
  final Map<String, dynamic> scheduleC;
  final Map<String, dynamic> payroll;
  final Map<String, dynamic> contractors;
}

Future<UsTaxes> loadUsTaxes(MycaApi api) async {
  Future<Map<String, dynamic>> one(String tool) async {
    try {
      return toolData(await api.query(tool));
    } on MycaApiException {
      return const <String, dynamic>{};
    }
  }
  final results = await Future.wait([one('estimated_tax_dates'), one('schedule_c_summary'), one('us_payroll_filings'), one('contractor_payments')]);
  return UsTaxes(estimated: results[0], scheduleC: results[1], payroll: results[2], contractors: results[3]);
}

num _n(Object? value) => value is num ? value : 0;

String _t(Object? value) => value == null ? '' : '$value';

List<Map<String, dynamic>> _rows(Object? value) => [for (final row in (value as List? ?? const [])) if (row is Map) Map<String, dynamic>.from(row)];

class UsTaxesScreen extends StatefulWidget {
  const UsTaxesScreen({super.key});

  @override
  State<UsTaxesScreen> createState() => _UsTaxesScreenState();
}

class _UsTaxesScreenState extends State<UsTaxesScreen> {
  Future<UsTaxes>? _taxes;
  Future<RulesStatus?>? _rules;
  String _note = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final api = AppScope.of(context).api;
    _taxes ??= loadUsTaxes(api);
    _rules ??= _loadRules(api);
  }

  Future<RulesStatus?> _loadRules(MycaApi api) async {
    try {
      return RulesStatus.fromTool(await api.query('rules_status'));
    } on MycaApiException {
      return null;
    }
  }

  Future<void> _save(String tool, String what) async {
    final state = AppScope.of(context);
    setState(() => _note = '');
    var note = '';
    try {
      final data = toolData(await state.api.query(tool));
      final name = _t(data['fileName']);
      final csv = _t(data['csv']);
      if (name.isEmpty || csv.isEmpty) {
        note = 'Nothing to save for $what yet.';
      } else {
        final saved = await state.saveTextFile(name, csv);
        note = saved ? 'Saved $name. Send it to your CPA or use it in the IRS portal.' : 'Not saved.';
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() => _note = note);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Federal and owner taxes')),
      body: FutureBuilder<UsTaxes>(
        future: _taxes,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final taxes = snap.data;
          if (taxes == null) {
            return Center(
              child: FilledButton(
                onPressed: () => setState(() => _taxes = loadUsTaxes(AppScope.of(context).api)),
                child: const Text('Try again'),
              ),
            );
          }
          final installments = _rows(taxes.estimated['installments']);
          final quarters = _rows(taxes.payroll['quarters']).where((q) => _n(q['months']) > 0).toList();
          final w2 = _rows(taxes.payroll['w2']);
          final contractors = _rows(taxes.contractors['contractors']);
          final needing = contractors.where((c) => c['needs1099'] == true).toList();
          final c = taxes.scheduleC;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              Text(
                'Drafts and dates from your books for your CPA. MyCA computes no income tax and files nothing; every figure that comes from a rule says whether a CPA has reviewed it.',
                style: text.bodyMedium,
              ),
              const SizedBox(height: 16),
              if (installments.isNotEmpty) ...[
                SectionLabel('Estimated tax ${_t(taxes.estimated['year'])}'),
                Panel(
                  children: [
                    for (final item in installments)
                      RowCard(
                        leading: TintTile(tint: item['past'] == true && item['paid'] == null ? Tint.urgent : Tint.taxes, mark: item['paid'] != null ? Mark.confirm : Mark.comingUp),
                        title: 'Instalment ${_t(item['installment'])}: ${longDate(_t(item['dueDate']))}',
                        subtitle: item['paid'] is Map
                            ? 'Paid, confirmation ${_t((item['paid'] as Map)['confirmation'])}'
                            : '${_t(item['covers'])}${item['past'] == true ? ' · date has passed' : ''}',
                      ),
                  ],
                ),
                const SizedBox(height: 20),
              ],
              if (c.isNotEmpty) ...[
                SectionLabel('Schedule C ${_t(c['year'])}'),
                Panel(
                  children: [
                    _Line('Gross receipts', _n(c['grossReceipts'])),
                    _Line('Cost of goods sold', _n(c['costOfGoodsSold'])),
                    _Line('Gross income', _n(c['grossIncome'])),
                    _Line('Total expenses', _n(c['totalExpenses'])),
                    _Line('Net profit before items outside the books', _n(c['netProfit']), strong: true),
                  ],
                ),
                const SizedBox(height: 20),
              ],
              SectionLabel('Payroll filings ${_t(taxes.payroll['year'])}'),
              Panel(
                children: [
                  if (quarters.isEmpty)
                    const RowCard(
                      leading: TintTile(tint: Tint.taxes, mark: Mark.taxes),
                      title: 'No approved payroll month yet',
                      subtitle: 'Form 941 figures appear here once a month is approved.',
                    ),
                  for (final q in quarters)
                    RowCard(
                      leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
                      title: 'Form 941 for ${_t(q['quarter'])}',
                      subtitle: 'Wages ${rupees(_n(q['wages']))} · total taxes ${rupees(_n(q['totalTaxes']))}${_t(q['dueDate']).isEmpty ? '' : ' · due ${longDate(_t(q['dueDate']))}'}',
                    ),
                  if (w2.isNotEmpty)
                    RowCard(
                      leading: const TintTile(tint: Tint.taxes, mark: Mark.comingUp),
                      title: 'W-2 for ${w2.length == 1 ? '1 employee' : '${w2.length} employees'}',
                      subtitle: _t(taxes.payroll['w2DueDate']).isEmpty ? 'Totals from the approved months' : 'Due ${longDate(_t(taxes.payroll['w2DueDate']))}',
                    ),
                ],
              ),
              const SizedBox(height: 20),
              SectionLabel('Contractors and 1099-NEC ${_t(taxes.contractors['year'])}'),
              Panel(
                children: [
                  for (final row in needing)
                    RowCard(
                      leading: TintTile(tint: row['w9Received'] == true ? Tint.taxes : Tint.urgent, mark: row['w9Received'] == true ? Mark.taxes : Mark.urgent),
                      title: _t(row['name']),
                      subtitle: '${rupees(_n(row['total']))}${row['w9Received'] == true ? '' : ' · W-9 missing'}',
                    ),
                  RowCard(
                    leading: const TintTile(tint: Tint.ask, mark: Mark.comingUp),
                    title: 'Save the 1099-NEC data file',
                    subtitle: needing.isEmpty ? 'No contractor is over the threshold yet' : 'For the IRS IRIS portal or your filing service',
                    trailing: const Chevron(),
                    onTap: needing.isEmpty ? null : () => _save('contractor_1099_file', 'the 1099-NEC file'),
                  ),
                ],
              ),
              if (_note.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(_note, style: text.bodyMedium),
              ],
              if (_rules != null) RulesStatusNote(status: _rules!),
            ],
          );
        },
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line(this.label, this.amount, {this.strong = false});

  final String label;
  final num amount;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      child: Row(
        children: [
          Expanded(child: Text(label, style: strong ? text.titleMedium : text.bodyMedium)),
          Text(rupees(amount), style: (strong ? text.titleMedium : text.bodyMedium)?.copyWith(fontFeatures: moneyFigures)),
        ],
      ),
    );
  }
}
