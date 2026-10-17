import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../registers.dart';
import '../theme.dart';
import 'pay_bills_screen.dart';

class CashScreen extends StatefulWidget {
  const CashScreen({super.key});

  @override
  State<CashScreen> createState() => _CashScreenState();
}

class _CashScreenState extends State<CashScreen> {
  Future<CashForecast?>? _forecast;
  final _amount = TextEditingController();
  String _when = 'Today';
  Affordability? _answer;
  String _note = '';
  bool _busy = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _forecast ??= _load();
  }

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  MycaApi get _api => AppScope.of(context).api;

  Future<CashForecast?> _load() async =>
      CashForecast.fromTool(await _api.query('cash_forecast'));

  void _reload() {
    final next = _load();
    setState(() {
      _forecast = next;
    });
  }

  String _whenDate() {
    final now = AppScope.of(context).now();
    final today = DateTime(now.year, now.month, now.day);
    return switch (_when) {
      'Next month' => isoDate(DateTime(today.year, today.month + 1, 1)),
      'In 3 months' => isoDate(DateTime(today.year, today.month + 3, 1)),
      _ => isoDate(today),
    };
  }

  Future<void> _ask() async {
    final amount = parseAmount(_amount.text);
    if (amount == null) return setState(() => _note = 'Enter an amount.');
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _note = '';
    });
    Affordability? answer;
    var note = '';
    try {
      answer = Affordability.fromTool(
        await _api.query('can_afford', {'amount': amount, 'on': _whenDate()}),
      );
      if (answer == null) note = 'That could not be worked out.';
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _answer = answer;
      _note = note;
    });
  }

  Future<void> _updateBalance(CashForecast forecast) async {
    final entered = await showModalBottomSheet<(num?, num?)>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) =>
          _BalanceSheet(bank: forecast.bank, cash: forecast.cash),
    );
    if (entered == null || !mounted) return;
    final (bank, cash) = entered;
    setState(() => _busy = true);
    var note = '';
    try {
      final held = await _api.propose('set_cash_balance', {
        'bank': ?bank,
        'cash': ?cash,
      });
      final preview = held.preview;
      if (preview == null) {
        note = held.reply;
      } else if (mounted && await _confirm(preview)) {
        final done = await _api.confirm(preview.token);
        note = done.posted ? '' : done.reply;
      } else {
        await _api.discard();
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _note = note;
      _answer = null;
    });
    _reload();
  }

  Future<bool> _confirm(ChatPreview preview) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Use these balances?'),
        content: Text([preview.summary, ...preview.effects].join('\n\n')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialog).pop(true),
            child: const Text('Use them'),
          ),
        ],
      ),
    );
    return yes ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Cash')),
      body: FutureBuilder<CashForecast?>(
        future: _forecast,
        builder: (context, state) {
          if (state.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final forecast = state.data;
          if (forecast == null) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('The forecast could not be worked out.'),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _reload,
                    child: const Text('Try again'),
                  ),
                ],
              ),
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
            children: [
              _Card(
                children: [
                  Text('BANK AND CASH NOW', style: text.labelSmall),
                  const SizedBox(height: 6),
                  Text(
                    rupees(forecast.startAmount),
                    style: text.displaySmall?.copyWith(
                      fontWeight: FontWeight.w400,
                      fontFeatures: moneyFigures,
                    ),
                  ),
                  Text(
                    'Bank ${rupees(forecast.bank)} · cash in hand ${rupees(forecast.cash)}',
                    style: text.bodyMedium?.copyWith(
                      fontFeatures: moneyFigures,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    forecast.fromReading
                        ? 'From the balance you gave on ${longDate(forecast.readingOn)}, with what was recorded since.'
                        : forecast.startNote,
                    style: text.bodySmall?.copyWith(
                      color: forecast.fromReading
                          ? Palette.muted
                          : Palette.warn,
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: _busy ? null : () => _updateBalance(forecast),
                      child: Text(
                        forecast.fromReading
                            ? 'Update balance'
                            : 'Tell MyCA your balance today',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.payments_outlined),
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const PayBillsScreen(),
                    ),
                  ),
                  label: const Text('Who to pay'),
                ),
              ),
              const SizedBox(height: 12),
              _Card(
                children: [
                  Text('NEXT ${forecast.days} DAYS', style: text.labelSmall),
                  const SizedBox(height: 8),
                  _Line(label: 'Coming in', amount: forecast.comingTotal),
                  _Line(label: 'Going out', amount: -forecast.goingTotal),
                  const Divider(height: 20),
                  _Line(
                    label: 'On ${longDate(forecast.until)}',
                    amount: forecast.end,
                    strong: true,
                  ),
                  _Line(
                    label: 'Lowest, on ${longDate(forecast.lowestOn)}',
                    amount: forecast.lowest,
                  ),
                  const SizedBox(height: 10),
                  for (final row in forecast.rows)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(row.label, style: text.bodyMedium),
                                Text(
                                  '${longDate(row.date)} · ${row.basis}',
                                  style: text.bodySmall,
                                ),
                              ],
                            ),
                          ),
                          Text(
                            '${row.incoming ? '+' : '−'}${rupees(row.amount)}',
                            style: text.bodyMedium?.copyWith(
                              fontFeatures: moneyFigures,
                              color: row.incoming
                                  ? Palette.accent
                                  : Palette.ink,
                            ),
                          ),
                        ],
                      ),
                    ),
                  if (forecast.overdueTotal > 0) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Overdue and not counted: ${rupees(forecast.overdueTotal)}. MyCA cannot tell when it will be paid.',
                      style: text.bodySmall?.copyWith(color: Palette.warn),
                    ),
                  ],
                  for (final note in forecast.notes.where(
                    (n) => !n.contains('Overdue') && n != forecast.startNote,
                  ))
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(note, style: text.bodySmall),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              _Card(
                children: [
                  Text('CAN I AFFORD IT?', style: text.labelSmall),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _amount,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: const InputDecoration(
                      labelText: 'Amount to spend',
                      prefixText: '₹ ',
                    ),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    children: [
                      for (final when in const [
                        'Today',
                        'Next month',
                        'In 3 months',
                      ])
                        ChoiceChip(
                          label: Text(when),
                          selected: _when == when,
                          selectedColor: Palette.sunken,
                          showCheckmark: false,
                          onSelected: (_) => setState(() => _when = when),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: _busy ? null : _ask,
                      child: const Text('Check'),
                    ),
                  ),
                  if (_answer != null) ...[
                    const SizedBox(height: 14),
                    Text(_answer!.headline, style: text.titleMedium),
                    const SizedBox(height: 4),
                    Text(
                      _answer!.detail,
                      style: text.bodyMedium?.copyWith(
                        fontFeatures: moneyFigures,
                      ),
                    ),
                  ],
                  if (_note.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(_note, style: text.bodyMedium),
                  ],
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.label, required this.amount, this.strong = false});

  final String label;
  final num amount;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final style = (strong ? text.titleMedium : text.bodyMedium)?.copyWith(
      fontFeatures: moneyFigures,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(child: Text(label, style: style)),
          Text(rupees(amount), style: style),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Palette.surface,
        borderRadius: BorderRadius.circular(radiusCard),
        border: Border.all(color: Palette.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: children,
      ),
    );
  }
}

class _BalanceSheet extends StatefulWidget {
  const _BalanceSheet({required this.bank, required this.cash});

  final num bank;
  final num cash;

  @override
  State<_BalanceSheet> createState() => _BalanceSheetState();
}

class _BalanceSheetState extends State<_BalanceSheet> {
  final _bank = TextEditingController();
  final _cash = TextEditingController();
  String _error = '';

  @override
  void dispose() {
    _bank.dispose();
    _cash.dispose();
    super.dispose();
  }

  void _done() {
    final bank = _bank.text.trim().isEmpty ? null : parseAmount(_bank.text);
    final cash = _cash.text.trim().isEmpty ? null : parseAmount(_cash.text);
    if (bank == null && cash == null) {
      return setState(
        () => _error = 'Enter the bank balance, the cash in hand, or both.',
      );
    }
    Navigator.of(context).pop((bank, cash));
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        22,
        4,
        22,
        22 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Your balance today', style: text.headlineSmall),
          const SizedBox(height: 6),
          Text(
            'As your bank app or passbook shows it. This posts nothing to your books.',
            style: text.bodySmall,
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _bank,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Bank balance',
              prefixText: '₹ ',
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _cash,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Cash in hand',
              prefixText: '₹ ',
            ),
          ),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              _error,
              style: const TextStyle(
                color: Palette.danger,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(onPressed: _done, child: const Text('Preview')),
          ),
        ],
      ),
    );
  }
}
