import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../marks.dart';
import '../proposal_flow.dart';
import '../registers.dart';
import '../theme.dart';
import '../widgets.dart';
import 'review_screen.dart';

Future<SalesTaxOverview?> loadSalesTax(MycaApi api) async {
  try {
    return SalesTaxOverview.fromTool(await api.query('sales_tax_overview'));
  } on MycaApiException {
    return null;
  }
}

String salesTaxPeriodWords(SalesTaxPeriod period) {
  final filed = period.filed;
  if (filed != null) return '${period.period}: filed on ${longDate(filed.filedOn)}, confirmation ${filed.confirmation}';
  final due = period.dueDate.isEmpty ? 'due date not in the rules yet' : 'due ${longDate(period.dueDate)}';
  if (period.empty) return '${period.period}: no sales, $due';
  return '${period.period}: collected ${rupees(period.taxCollected)}, to pay ${rupees(period.toPay)}, $due${period.approved ? ', approved' : ''}';
}

enum _Composer { none, state, payment, filing }

class SalesTaxScreen extends StatefulWidget {
  const SalesTaxScreen({super.key});

  @override
  State<SalesTaxScreen> createState() => _SalesTaxScreenState();
}

class _SalesTaxScreenState extends State<SalesTaxScreen> with ProposalFlow {
  Future<SalesTaxOverview?>? _overview;
  Future<RulesStatus?>? _rules;
  final _stateCode = TextEditingController();
  final _permit = TextEditingController();
  final _dueDay = TextEditingController();
  final _amount = TextEditingController();
  final _reference = TextEditingController();
  final _confirmation = TextEditingController();
  String _frequency = 'quarterly';
  String? _selected;
  _Composer _composer = _Composer.none;
  String _error = '';
  String _notice = '';
  DateTime? _date;

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _overview ??= loadSalesTax(api);
    _rules ??= _loadRules();
  }

  Future<RulesStatus?> _loadRules() async {
    try {
      return RulesStatus.fromTool(await api.query('rules_status'));
    } on MycaApiException {
      return null;
    }
  }

  @override
  void dispose() {
    _stateCode.dispose();
    _permit.dispose();
    _dueDay.dispose();
    _amount.dispose();
    _reference.dispose();
    _confirmation.dispose();
    super.dispose();
  }

  @override
  Future<void> onPosted() async {
    HapticFeedback.mediumImpact();
    final confirmation = entries.isEmpty ? 'Posted.' : entries.last.text;
    setState(() {
      entries.clear();
      _composer = _Composer.none;
      _notice = confirmation;
      _overview = loadSalesTax(api);
    });
  }

  void _openComposer(_Composer composer) => setState(() {
    _composer = composer;
    _error = '';
    _amount.clear();
    _reference.clear();
    _confirmation.clear();
    _date = null;
  });

  Future<void> _pickDate() async {
    final today = AppScope.of(context).now();
    final picked = await showDatePicker(context: context, initialDate: _date ?? today, firstDate: DateTime(today.year - 2), lastDate: today);
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _review(SalesTaxStateRow row) async {
    final period = row.lastPeriod;
    if (period == null) return;
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ReviewScreen(
          period: period.period,
          tool: 'sales_tax_review',
          answerTool: 'sales_tax_review_answer',
          title: 'Review the ${row.state} sales tax return',
          extraArgs: {'state': row.state},
        ),
      ),
    );
    if (!mounted) return;
    setState(() { _overview = loadSalesTax(api); });
  }

  Future<void> _submit(SalesTaxStateRow? row) async {
    final today = isoDate(_date ?? AppScope.of(context).now());
    if (_composer == _Composer.state) {
      final code = _stateCode.text.trim().toUpperCase();
      if (!RegExp(r'^[A-Z]{2}$').hasMatch(code)) {
        return setState(() => _error = 'Enter the two-letter state code, for example TX.');
      }
      setState(() => _error = '');
      return propose('Collect sales tax in $code, $_frequency', 'set_sales_tax_nexus', {
        'state': code,
        'frequency': _frequency,
        if (_permit.text.trim().isNotEmpty) 'permitNo': _permit.text.trim(),
        if (_dueDay.text.trim().isNotEmpty) 'dueDay': _dueDay.text.trim().toLowerCase(),
      });
    }
    final period = row?.lastPeriod;
    if (row == null || period == null) return;
    if (_composer == _Composer.payment) {
      final amountText = _amount.text.trim();
      final amount = amountText.isEmpty ? null : parseAmount(amountText);
      if (amountText.isNotEmpty && amount == null) {
        return setState(() => _error = 'Enter the amount, or leave it blank to pay everything due.');
      }
      setState(() => _error = '');
      return propose('Paid sales tax to ${row.state} for ${period.period}', 'record_sales_tax_payment', {
        'state': row.state,
        'period': period.period,
        'date': today,
        'amount': ?amount,
        if (_reference.text.trim().isNotEmpty) 'reference': _reference.text.trim(),
      });
    }
    final confirmation = _confirmation.text.trim().toUpperCase();
    if (confirmation.length < 3) {
      return setState(() => _error = 'Enter the confirmation number the state gave you.');
    }
    setState(() => _error = '');
    await propose('Filed the ${row.state} sales tax return for ${period.period}', 'record_sales_tax_filing', {
      'state': row.state,
      'period': period.period,
      'confirmation': confirmation,
      'filedOn': today,
    });
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final today = AppScope.of(context).now();
    return Scaffold(
      appBar: AppBar(title: const Text('Sales tax')),
      body: FutureBuilder<SalesTaxOverview?>(
        future: _overview,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final overview = snap.data;
          if (overview == null) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Could not load.'),
                  const SizedBox(height: 16),
                  FilledButton(onPressed: () => setState(() { _overview = loadSalesTax(api); }), child: const Text('Try again')),
                ],
              ),
            );
          }
          final rows = overview.states;
          final selected = rows.where((r) => r.state == _selected).firstOrNull ?? rows.firstOrNull;
          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  children: [
                    Text(
                      rows.isEmpty
                          ? 'Say which states you collect sales tax in. MyCA drafts each return from your invoices and never guesses a rate or a due date; filing stays with you or your CPA.'
                          : 'Returns are drafted from your invoices by state and period. Review the figures, record what you paid and the confirmation number when you file.',
                      style: text.bodyMedium,
                    ),
                    if (_notice.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Text(_notice, style: text.bodyMedium?.copyWith(color: Palette.ink)),
                    ],
                    const SizedBox(height: 16),
                    if (rows.isNotEmpty) ...[
                      const SectionLabel('States'),
                      Panel(
                        children: [
                          for (final row in rows)
                            RowCard(
                              leading: TintTile(tint: row.overdue ? Tint.urgent : Tint.taxes, mark: row.overdue ? Mark.urgent : Mark.taxes),
                              title: '${row.state} · ${row.frequency}',
                              subtitle: row.lastPeriod == null ? 'No period has ended yet' : salesTaxPeriodWords(row.lastPeriod!),
                              trailing: selected?.state == row.state ? const Icon(Icons.check, size: 18) : const Chevron(),
                              onTap: () => setState(() {
                                _selected = row.state;
                                _composer = _Composer.none;
                              }),
                            ),
                        ],
                      ),
                      if (selected != null && selected.lastPeriod != null) ...[
                        const SizedBox(height: 16),
                        SectionLabel('${selected.state} ${selected.lastPeriod!.period}'),
                        if (selected.notes.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: Text(selected.notes.join(' '), style: text.bodySmall?.copyWith(color: Palette.muted)),
                          ),
                        if (_composer == _Composer.none && pending == null) ...[
                          FilledButton(
                            onPressed: busy || selected.lastPeriod!.empty ? null : () => _review(selected),
                            child: Text('Review the ${selected.lastPeriod!.period} return'),
                          ),
                          const SizedBox(height: 8),
                          OutlinedButton(
                            onPressed: busy || selected.lastPeriod!.toPay <= 0 ? null : () => _openComposer(_Composer.payment),
                            child: const Text('Record a payment'),
                          ),
                          const SizedBox(height: 8),
                          OutlinedButton(
                            onPressed: busy || selected.lastPeriod!.filed != null ? null : () => _openComposer(_Composer.filing),
                            child: const Text('Record the filing'),
                          ),
                        ],
                      ],
                    ],
                    if (_composer == _Composer.payment && pending == null) ...[
                      TextField(
                        controller: _amount,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: const InputDecoration(labelText: 'Amount (blank for everything due)', prefixText: '\$ '),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _reference,
                        textCapitalization: TextCapitalization.characters,
                        decoration: const InputDecoration(labelText: 'Reference (optional)'),
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text('Paid on', style: text.bodyMedium),
                          ActionChip(label: Text(longDate(isoDate(_date ?? today))), onPressed: _pickDate),
                        ],
                      ),
                    ],
                    if (_composer == _Composer.filing && pending == null) ...[
                      TextField(
                        controller: _confirmation,
                        textCapitalization: TextCapitalization.characters,
                        decoration: const InputDecoration(labelText: 'Confirmation number', helperText: 'As the state portal showed it when you filed.'),
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text('Filed on', style: text.bodyMedium),
                          ActionChip(label: Text(longDate(isoDate(_date ?? today))), onPressed: _pickDate),
                        ],
                      ),
                    ],
                    if (_composer == _Composer.state && pending == null) ...[
                      TextField(
                        controller: _stateCode,
                        textCapitalization: TextCapitalization.characters,
                        maxLength: 2,
                        decoration: const InputDecoration(labelText: 'State code', helperText: 'Two letters, for example TX.', counterText: ''),
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        children: [
                          for (final frequency in const ['monthly', 'quarterly', 'annual'])
                            ChoiceChip(
                              label: Text(frequency),
                              selected: _frequency == frequency,
                              onSelected: (_) => setState(() => _frequency = frequency),
                            ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _permit,
                        textCapitalization: TextCapitalization.characters,
                        decoration: const InputDecoration(labelText: 'Permit number (optional)'),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _dueDay,
                        decoration: const InputDecoration(
                          labelText: 'Return due day (optional)',
                          helperText: 'The day of the month after the period, from the state\'s notice: 20, or "last". Used only when MyCA holds no rule for the state.',
                        ),
                      ),
                    ],
                    if (_composer != _Composer.none && pending == null) ...[
                      if (_error.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Text(_error, style: TextStyle(color: Palette.danger)),
                      ],
                      const SizedBox(height: 14),
                      FilledButton(onPressed: busy ? null : () => _submit(selected), child: const Text('Preview')),
                      const SizedBox(height: 8),
                      TextButton(onPressed: () => setState(() => _composer = _Composer.none), child: const Text('Cancel')),
                    ],
                    if (_composer == _Composer.none && pending == null) ...[
                      const SizedBox(height: 24),
                      OutlinedButton.icon(
                        onPressed: busy ? null : () => _openComposer(_Composer.state),
                        icon: const Icon(Icons.add, size: 18),
                        label: const Text('Add a state'),
                      ),
                    ],
                    for (final entry in entries) entry.toBubble(),
                    if (_rules != null) RulesStatusNote(status: _rules!),
                  ],
                ),
              ),
              if (pending != null) ProposalBar(busy: busy, onPost: postPending, onDiscard: discardPending),
            ],
          );
        },
      ),
    );
  }
}
