import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../registers.dart';
import '../theme.dart';
import '../uae/uae_strings.dart';
import '../widgets.dart';
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
    final s = UaeStrings.of(context);
    if (amount == null) return setState(() => _note = s.enterAnAmount);
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
      if (answer == null) note = s.couldNotWorkThatOut;
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
    final s = UaeStrings.of(context);
    final yes = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(s.useTheseBalances),
        content: Text([preview.summary, ...preview.effects].join('\n\n')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(false),
            child: Text(s.cancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialog).pop(true),
            child: Text(s.useThem),
          ),
        ],
      ),
    );
    return yes ?? false;
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final s = UaeStrings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s.cash)),
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
                  Text(s.forecastFailed),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _reload,
                    child: Text(s.tryAgain),
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
                  Text(s.bankAndCashNow, style: text.labelSmall),
                  const SizedBox(height: 6),
                  Amount(
                    rupees(forecast.startAmount),
                    style: text.displaySmall?.copyWith(
                      fontWeight: FontWeight.w400,
                      fontFeatures: moneyFigures,
                    ),
                  ),
                  Text(
                    s.bankAndCash(rupees(forecast.bank), rupees(forecast.cash)),
                    style: text.bodyMedium?.copyWith(
                      fontFeatures: moneyFigures,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    forecast.fromReading
                        ? s.fromBalanceOn(s.longDate(forecast.readingOn))
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
                            ? s.updateBalance
                            : s.tellBalance,
                      ),
                    ),
                  ),
                ],
              ),
              if (moneyCountry != 'AE' && moneyCountry != 'US') ...[
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
                  label: Text(inText(context, 'Who to pay')),
                ),
              ),
              ],
              const SizedBox(height: 12),
              _Card(
                children: [
                  Text(s.nextDays(forecast.days), style: text.labelSmall),
                  const SizedBox(height: 8),
                  _Line(label: s.comingIn, amount: forecast.comingTotal),
                  _Line(label: s.goingOut, amount: -forecast.goingTotal),
                  const Divider(height: 20),
                  _Line(
                    label: s.onDate(s.longDate(forecast.until)),
                    amount: forecast.end,
                    strong: true,
                  ),
                  _Line(
                    label: s.lowestOn(s.longDate(forecast.lowestOn)),
                    amount: forecast.lowest,
                  ),
                  const SizedBox(height: 10),
                  for (final row in forecast.rows)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: AmountRow(
                        align: CrossAxisAlignment.start,
                        start: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(s.accountName(row.label), style: text.bodyMedium),
                            Text(
                              '${s.longDate(row.date)} · ${row.basis}',
                              style: text.bodySmall,
                            ),
                          ],
                        ),
                        amount: '${row.incoming ? '+' : '−'}${rupees(row.amount)}',
                        style: text.bodyMedium?.copyWith(
                          fontFeatures: moneyFigures,
                          color: row.incoming ? Palette.accent : Palette.ink,
                        ),
                      ),
                    ),
                  if (forecast.overdueTotal > 0) ...[
                    const SizedBox(height: 8),
                    Text(
                      s.overdueNotCounted(rupees(forecast.overdueTotal)),
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
                  Text(s.canIAfford, style: text.labelSmall),
                  const SizedBox(height: 10),
                  TextField(
                    controller: _amount,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    decoration: InputDecoration(
                      labelText: s.amountToSpend,
                      prefixText: moneyPrefix,
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
                          label: Text(s.cashWhen(when)),
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
                      child: Text(s.check),
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
      child: AmountRow(
        start: Text(label, style: style),
        amount: rupees(amount),
        style: style,
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
        () => _error = UaeStrings.of(context).enterBalances,
      );
    }
    Navigator.of(context).pop((bank, cash));
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final s = UaeStrings.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(
        22,
        4,
        22,
        22 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(s.yourBalanceToday, style: text.headlineSmall),
          const SizedBox(height: 6),
          Text(
            s.balanceSheetNote,
            style: text.bodySmall,
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _bank,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: s.bankBalance,
              prefixText: moneyPrefix,
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _cash,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: s.cashInHand,
              prefixText: moneyPrefix,
            ),
          ),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              _error,
              style: TextStyle(
                color: Palette.danger,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(onPressed: _done, child: Text(s.preview)),
          ),
        ],
      ),
      ),
    );
  }
}
