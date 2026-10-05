import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../proposal_flow.dart';
import '../registers.dart';
import '../theme.dart';
import '../widgets.dart';

class ExpenseScreen extends StatefulWidget {
  const ExpenseScreen({super.key});

  @override
  State<ExpenseScreen> createState() => _ExpenseScreenState();
}

class _ExpenseScreenState extends State<ExpenseScreen> with ProposalFlow {
  final _what = TextEditingController();
  final _amount = TextEditingController();
  final _rate = TextEditingController();
  String _error = '';

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  Future<void> onPosted() => AppScope.of(context).refresh();

  @override
  void dispose() {
    _what.dispose();
    _amount.dispose();
    _rate.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final what = _what.text.trim();
    final amount = parseAmount(_amount.text);
    final rate = parseRate(_rate.text);
    if (what.isEmpty) {
      return setState(() => _error = 'Say what the expense was for.');
    }
    if (amount == null) return setState(() => _error = 'Enter the amount.');
    if (rate == null) {
      return setState(
        () =>
            _error = 'Enter the GST rate on the bill. Use 0 if there is none.',
      );
    }
    setState(() => _error = '');
    FocusScope.of(context).unfocus();
    await propose(
      '$what: ${rupees(amount)}, GST ${_rate.text.trim()}%',
      'post_expense',
      {'narration': what, 'amount': amount, 'gstRate': rate},
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Expense')),
      body: Column(
        children: [
          Expanded(
            child: ListView(
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
                          labelText: 'GST',
                          suffixText: '%',
                        ),
                      ),
                    ),
                  ],
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
          if (pending != null)
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
