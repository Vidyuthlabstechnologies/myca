import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../uae/uae_strings.dart';
import '../registers.dart';
import '../marks.dart';
import '../proposal_flow.dart';
import '../theme.dart';
import '../widgets.dart';

class RecurringScreen extends StatefulWidget {
  const RecurringScreen({super.key});

  @override
  State<RecurringScreen> createState() => _RecurringScreenState();
}

class _RecurringScreenState extends State<RecurringScreen> with ProposalFlow {
  Future<List<RecurringEntry>>? _entries;
  final _amount = TextEditingController();
  final _what = TextEditingController();
  final _payee = TextEditingController();
  final _rate = TextEditingController();
  String _every = 'month';
  bool _adding = false;
  String _error = '';

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _entries ??= _load();
  }

  Future<List<RecurringEntry>> _load() async {
    try {
      return recurringFrom(await api.query('list_recurring'));
    } on MycaApiException {
      return const <RecurringEntry>[];
    }
  }

  @override
  Future<void> onPosted() async {
    HapticFeedback.mediumImpact();
    setState(() {
      _adding = false;
      _entries = _load();
    });
  }

  @override
  void dispose() {
    _amount.dispose();
    _what.dispose();
    _payee.dispose();
    _rate.dispose();
    super.dispose();
  }

  Future<void> _addExpense() async {
    final s = UaeStrings.of(context);
    final amount = parseAmount(_amount.text);
    if (amount == null || amount <= 0) return setState(() => _error = s.enterAmountEachTime);
    final what = _what.text.trim();
    if (what.isEmpty) return setState(() => _error = s.sayWhatItIsFor);
    final rateText = _rate.text.trim();
    final rate = rateText.isEmpty ? null : parseRate(rateText);
    if (rateText.isNotEmpty && rate == null) return setState(() => _error = inFormat(context, 'Enter the {tax} rate as a number, or leave it blank.', {'tax': salesTaxName}));
    setState(() => _error = '');
    await propose(
      s.recurringExpenseSaid(rupees(amount), what, s.repeatEvery(_every)),
      'add_recurring',
      {
        'kind': 'expense',
        'every': _every,
        'startDate': isoDate(AppScope.of(context).now()),
        'amount': amount,
        'narration': what,
        if (_payee.text.trim().isNotEmpty) 'payee': _payee.text.trim(),
        if (rate != null && rate > 0) 'gstRate': rate,
      },
    );
  }

  String _subtitle(RecurringEntry row) {
    final s = UaeStrings.of(context);
    return s.recurringSubtitle(s.repeatEvery(row.every), active: row.active, status: row.status, next: s.longDate(row.nextDate), count: row.count, lastError: row.lastError);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final s = UaeStrings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s.repeatingEntries)),
      body: FutureBuilder<List<RecurringEntry>>(
        future: _entries,
        builder: (context, snap) {
          final rows = snap.data ?? const <RecurringEntry>[];
          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  children: [
                    Text(
                      s.recurringIntro,
                      style: text.bodyMedium,
                    ),
                    const SizedBox(height: 16),
                    if (snap.connectionState != ConnectionState.done)
                      const Center(child: CircularProgressIndicator())
                    else if (rows.isEmpty)
                      Text(s.nothingRepeats, style: text.bodyMedium)
                    else
                      Panel(
                        children: [
                          for (final row in rows)
                            RowCard(
                              key: ValueKey('recurring.${row.id}'),
                              leading: TintTile(tint: row.kind == 'invoice' ? Tint.sales : Tint.purchases, mark: Mark.comingUp),
                              title: '${s.recurringKind(row.kind)} ${row.party}'.trim(),
                              subtitle: '${rupees(row.amount)} · ${_subtitle(row)}',
                              trailing: row.active
                                  ? TextButton(
                                      onPressed: busy ? null : () => propose(s.stopSaid(row.id), 'stop_recurring', {'id': row.id}),
                                      child: Text(s.stop),
                                    )
                                  : null,
                            ),
                        ],
                      ),
                    const SizedBox(height: 16),
                    if (pending == null && !_adding)
                      OutlinedButton(
                        key: const ValueKey('recurring.add'),
                        onPressed: busy ? null : () => setState(() => _adding = true),
                        child: Text(s.addRepeatingExpense),
                      ),
                    if (pending == null && _adding) ...[
                      TextField(
                        controller: _what,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: InputDecoration(labelText: s.whatItIsFor, helperText: s.whatItIsForHint),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _amount,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: InputDecoration(labelText: s.amountEachTime, prefixText: moneyPrefix, helperText: moneyCountry == 'AE' ? UaeStrings.of(context).includingVat : inFormat(context, 'Including any {tax}', {'tax': salesTaxName})),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _payee,
                        textCapitalization: TextCapitalization.words,
                        decoration: InputDecoration(labelText: s.paidTo),
                      ),
                      if (moneyCountry != 'AE') ...[
                      const SizedBox(height: 10),
                      TextField(
                        controller: _rate,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: InputDecoration(labelText: inFormat(context, '{tax} rate inside the amount (optional)', {'tax': salesTaxName}), suffixText: '%'),
                      ),
                      ],
                      const SizedBox(height: 10),
                      DropdownButtonFormField<String>(
                        isExpanded: true,
                        initialValue: _every,
                        decoration: InputDecoration(labelText: s.repeat, helperText: s.repeatHint),
                        items: [
                          for (final entry in repeatEveryLabels.entries) DropdownMenuItem(value: entry.key, child: Text(s.repeatEvery(entry.key))),
                        ],
                        onChanged: (value) => setState(() => _every = value ?? 'month'),
                      ),
                      if (_error.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(_error, style: text.bodyMedium?.copyWith(color: Palette.danger)),
                      ],
                      const SizedBox(height: 14),
                      FilledButton(onPressed: busy ? null : _addExpense, child: Text(s.preview)),
                    ],
                    for (final entry in entries) entry.toBubble(),
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
