import 'package:flutter/material.dart';

import 'tds_fields.dart';
import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../proposal_flow.dart';
import '../registers.dart';
import '../theme.dart';
import '../widgets.dart';
import 'head_picker.dart';

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
      return setState(() => _error = 'Say what the expense was for.');
    }
    if (amount == null) return setState(() => _error = 'Enter the amount.');
    if (rate == null) {
      return setState(
        () => _error = 'The GST rate must be a number, or leave it blank.',
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
      '$what: ${rupees(amount)} from $_mode${rate > 0 ? ', GST $rate% inside' : ''}',
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
      await propose('Put it under ${chosen.name}', 'post_expense', args);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final preview = pending;
    return Scaffold(
      appBar: AppBar(title: const Text('Expense')),
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
                  decoration: const InputDecoration(
                    labelText: 'What was it for',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _payee,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                    labelText: 'Paid to (optional)',
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: TextField(
                        controller: _amount,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: const InputDecoration(
                          labelText: 'Amount paid, with GST',
                          prefixText: '₹ ',
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
                        decoration: const InputDecoration(
                          labelText: 'GST inside',
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
                        label: Text(mode == 'bank' ? 'From bank' : 'From cash'),
                        selected: _mode == mode,
                        selectedColor: Palette.sunken,
                        showCheckmark: false,
                        onSelected: (_) => setState(() => _mode = mode),
                      ),
                    ActionChip(
                      label: Text(
                        _head == null
                            ? 'Head: automatic'
                            : 'Head: ${_head!.name}',
                      ),
                      onPressed: busy ? null : _pickHead,
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'Give the GST rate only if the bill shows GST. Credit is taken only when the supplier GSTIN is on the bill; add it later from the Purchases chat if you need it.',
                  style: text.bodySmall,
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
                  label: Text('Under ${preview.headName} · change'),
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
                    child: const Text('Preview'),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
