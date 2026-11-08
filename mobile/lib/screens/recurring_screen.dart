import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
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
    final amount = parseAmount(_amount.text);
    if (amount == null || amount <= 0) return setState(() => _error = 'Enter the amount paid each time.');
    final what = _what.text.trim();
    if (what.isEmpty) return setState(() => _error = 'Say what it is for, for example broadband or rent.');
    final rateText = _rate.text.trim();
    final rate = rateText.isEmpty ? null : parseRate(rateText);
    if (rateText.isNotEmpty && rate == null) return setState(() => _error = 'Enter the GST rate as a number, or leave it blank.');
    setState(() => _error = '');
    await propose(
      'Expense: ${rupees(amount)} for $what, ${(repeatEveryLabels[_every] ?? _every).toLowerCase()}',
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
    final parts = <String>[
      (repeatEveryLabels[row.every] ?? row.every),
      if (row.active) 'next ${longDate(row.nextDate)}' else if (row.status == 'ended') 'ended' else 'stopped',
      if (row.count > 0) '${row.count} made',
      if (row.lastError.isNotEmpty) 'last try failed: ${row.lastError}',
    ];
    return parts.join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Repeating entries')),
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
                      'Invoices, bills and expenses that repeat are posted on their dates by the daily run, exactly as if you entered them. Set a repeating invoice or bill from the customer or supplier page.',
                      style: text.bodyMedium,
                    ),
                    const SizedBox(height: 16),
                    if (snap.connectionState != ConnectionState.done)
                      const Center(child: CircularProgressIndicator())
                    else if (rows.isEmpty)
                      Text('Nothing repeats yet.', style: text.bodyMedium)
                    else
                      Panel(
                        children: [
                          for (final row in rows)
                            RowCard(
                              key: ValueKey('recurring.${row.id}'),
                              leading: TintTile(tint: row.kind == 'invoice' ? Tint.sales : Tint.purchases, mark: Mark.comingUp),
                              title: '${row.kindWords} ${row.party}'.trim(),
                              subtitle: '${rupees(row.amount)} · ${_subtitle(row)}',
                              trailing: row.active
                                  ? TextButton(
                                      onPressed: busy ? null : () => propose('Stop ${row.id}', 'stop_recurring', {'id': row.id}),
                                      child: const Text('Stop'),
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
                        child: const Text('Add a repeating expense'),
                      ),
                    if (pending == null && _adding) ...[
                      TextField(
                        controller: _what,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: const InputDecoration(labelText: 'What it is for', helperText: 'For example broadband, shop rent or software'),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _amount,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: const InputDecoration(labelText: 'Amount paid each time', prefixText: '₹ ', helperText: 'Including any GST'),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _payee,
                        textCapitalization: TextCapitalization.words,
                        decoration: const InputDecoration(labelText: 'Paid to (optional)'),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _rate,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: const InputDecoration(labelText: 'GST rate inside the amount (optional)', suffixText: '%'),
                      ),
                      const SizedBox(height: 10),
                      DropdownButtonFormField<String>(
                        isExpanded: true,
                        initialValue: _every,
                        decoration: const InputDecoration(labelText: 'Repeat', helperText: 'From today, paid from the bank'),
                        items: [
                          for (final entry in repeatEveryLabels.entries) DropdownMenuItem(value: entry.key, child: Text(entry.value)),
                        ],
                        onChanged: (value) => setState(() => _every = value ?? 'month'),
                      ),
                      if (_error.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(_error, style: text.bodyMedium?.copyWith(color: Palette.danger)),
                      ],
                      const SizedBox(height: 14),
                      FilledButton(onPressed: busy ? null : _addExpense, child: const Text('Preview')),
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
