import 'package:flutter/material.dart';

import 'tds_fields.dart';
import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../proposal_flow.dart';
import '../registers.dart';
import '../theme.dart';
import '../uae/uae_edition.dart';
import '../uae/uae_strings.dart';
import '../widgets.dart';
import 'head_picker.dart';
import 'uae/uae_document_screen.dart';

class ExpenseScreen extends StatefulWidget {
  const ExpenseScreen({super.key, this.head});

  final ExpenseHead? head;

  @override
  State<ExpenseScreen> createState() => _ExpenseScreenState();
}

class _ExpenseScreenState extends State<ExpenseScreen> with ProposalFlow {
  final _what = TextEditingController();
  final _payee = TextEditingController();
  final _tds = TdsChoice();
  final _amount = TextEditingController();
  final _rate = TextEditingController();
  final _scroll = ScrollController();
  String _mode = 'bank';
  ExpenseHead? _head;
  String _error = '';
  Map<String, Object?>? _lastArgs;

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  Future<void> onPosted() => AppScope.of(context).refresh();

  @override
  void onThreadChanged() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  @override
  void initState() {
    super.initState();
    _head = widget.head;
  }

  @override
  void dispose() {
    _scroll.dispose();
    _what.dispose();
    _payee.dispose();
    _tds.dispose();
    _amount.dispose();
    _rate.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final what = _what.text.trim();
    final amount = parseAmount(_amount.text);
    final rate = _rate.text.trim().isEmpty ? 0 : parseRate(_rate.text);
    if (what.isEmpty) {
      return setState(() => _error = UaeStrings.of(context).sayWhatFor);
    }
    if (amount == null) return setState(() => _error = UaeStrings.of(context).enterAmount);
    if (rate == null) {
      return setState(
        () => _error = inFormat(context, 'The {tax} rate must be a number, or leave it blank.', {'tax': salesTaxName}),
      );
    }
    final tdsProblem = _tds.problem();
    if (tdsProblem != null) return setState(() => _error = tdsProblem);
    setState(() => _error = '');
    FocusScope.of(context).unfocus();
    final payee = _payee.text.trim();
    final args = <String, Object?>{
      'narration': what,
      'amount': amount,
      'gstRate': rate,
      'mode': _mode,
      'date': isoDate(AppScope.of(context).now()),
      if (payee.isNotEmpty) 'payee': payee,
      if (_head != null) 'head': _head!.code,
      ..._tds.args(),
    };
    _lastArgs = args;
    await propose(
      rate > 0
          ? _mode == 'bank'
                ? inFormat(context, '{what}: {amount} from bank, {tax} {rate}% inside', {'what': what, 'amount': rupees(amount), 'tax': salesTaxName, 'rate': rate})
                : inFormat(context, '{what}: {amount} from cash, {tax} {rate}% inside', {'what': what, 'amount': rupees(amount), 'tax': salesTaxName, 'rate': rate})
          : UaeStrings.of(context).expenseSaid(what, rupees(amount), _mode == 'bank'),
      'post_expense',
      args,
    );
  }

  Future<void> _pickHead() async {
    final chosen = await showHeadPicker(
      context,
      current: _head?.code ?? pending?.head,
    );
    if (chosen == null || !mounted) return;
    setState(() => _head = chosen);
    final last = _lastArgs;
    if (pending != null && last != null) {
      await discardPending();
      if (!mounted) return;
      final args = {...last, 'head': chosen.code};
      _lastArgs = args;
      await propose(UaeStrings.of(context).putUnder(UaeStrings.of(context).accountName(chosen.name)), 'post_expense', args);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final preview = pending;
    final ae = uaeEdition(context) ? UaeStrings.of(context) : null;
    final s = UaeStrings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s.expense)),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              children: [
                TextField(
                  controller: _what,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: InputDecoration(
                    labelText: s.whatFor,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _payee,
                  textCapitalization: TextCapitalization.words,
                  decoration: InputDecoration(
                    labelText: s.paidTo,
                  ),
                ),
                const SizedBox(height: 12),
                if (ae != null)
                  TextField(
                    key: const ValueKey('expense.amount'),
                    controller: _amount,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: InputDecoration(labelText: ae.amountPaidWithVat, prefixText: 'AED '),
                  )
                else
                Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: TextField(
                        controller: _amount,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: InputDecoration(
                          labelText: inFormat(context, 'Amount paid, with {tax}', {'tax': salesTaxName}),
                          prefixText: moneyPrefix,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 2,
                      child: TextField(
                        controller: _rate,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: InputDecoration(
                          labelText: inFormat(context, '{tax} inside', {'tax': salesTaxName}),
                          suffixText: '%',
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final mode in const ['bank', 'cash'])
                      ChoiceChip(
                        label: Text(mode == 'bank' ? s.fromBank : s.fromCash),
                        selected: _mode == mode,
                        selectedColor: Palette.sunken,
                        showCheckmark: false,
                        onSelected: (_) => setState(() => _mode = mode),
                      ),
                    ActionChip(
                      label: Text(s.headChip(_head == null ? null : s.accountName(_head!.name))),
                      onPressed: busy ? null : _pickHead,
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                if (ae != null) ...[
                  Text(ae.expenseVatNote, key: const ValueKey('expense.aeNote'), style: text.bodySmall),
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: TextButton(
                      key: const ValueKey('expense.aeBill'),
                      onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute<void>(builder: (_) => const UaePurchaseScreen())),
                      child: Text(ae.addPurchaseBill),
                    ),
                  ),
                ] else
                Text(
                  moneyCountry == 'GB' ? 'Give the VAT rate only if the receipt shows VAT. Reclaim VAT only with a valid VAT receipt from a VAT-registered supplier.' : inText(context, 'Give the GST rate only if the bill shows GST. Credit is taken only when the supplier GSTIN is on the bill; add it later from the Purchases chat if you need it.'),
                  style: text.bodySmall,
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
                for (final entry in entries) entry.toBubble(),
              ],
            ),
          ),
          if (preview != null && preview.headName.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
              child: Align(
                alignment: Alignment.centerLeft,
                child: ActionChip(
                  label: Text(s.underHead(s.accountName(preview.headName))),
                  onPressed: busy ? null : _pickHead,
                ),
              ),
            ),
          if (preview != null)
            ProposalBar(
              busy: busy,
              onPost: postPending,
              onDiscard: discardPending,
            )
          else
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: busy ? null : _submit,
                    child: Text(s.preview),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
