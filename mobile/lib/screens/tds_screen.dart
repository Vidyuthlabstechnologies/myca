import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../proposal_flow.dart';
import '../registers.dart';
import '../theme.dart';
import '../widgets.dart';

class TdsActionScreen extends StatefulWidget {
  const TdsActionScreen({super.key, required this.summary});

  final TdsSummary summary;

  @override
  State<TdsActionScreen> createState() => _TdsActionScreenState();
}

class _TdsActionScreenState extends State<TdsActionScreen> with ProposalFlow {
  final _tan = TextEditingController();
  final _challan = TextEditingController();
  final _amount = TextEditingController();
  DateTime? _date;
  String _error = '';
  bool _posted = false;

  bool get _setup => !widget.summary.deductor;

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  Future<void> onPosted() async {
    HapticFeedback.mediumImpact();
    setState(() => _posted = true);
  }

  @override
  void dispose() {
    _tan.dispose();
    _challan.dispose();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final today = AppScope.of(context).now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? today,
      firstDate: DateTime(today.year - 2),
      lastDate: today,
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _preview() async {
    if (_setup) {
      final tan = _tan.text.replaceAll(RegExp(r'\s+'), '').toUpperCase();
      if (!RegExp(r'^[A-Z]{4}[0-9]{5}[A-Z]$').hasMatch(tan)) {
        return setState(
          () => _error = 'A TAN is four letters, five digits and a letter.',
        );
      }
      setState(() => _error = '');
      return propose('We deduct TDS, TAN $tan', 'set_tds_deductor', {
        'tan': tan,
      });
    }
    final challan = _challan.text.trim();
    if (challan.length < 5) {
      return setState(
        () => _error =
            'Enter the challan reference as printed (the CIN, or the BSR code and serial number).',
      );
    }
    final amountText = _amount.text.trim();
    final amount = amountText.isEmpty ? null : parseAmount(amountText);
    if (amountText.isNotEmpty && amount == null) {
      return setState(
        () => _error =
            'Enter the amount, or leave it blank to deposit everything due.',
      );
    }
    final day = isoDate(_date ?? AppScope.of(context).now());
    setState(() => _error = '');
    await propose('Deposited TDS, challan $challan', 'record_tds_deposit', {
      'challan': challan,
      'date': day,
      'amount': ?amount,
    });
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final today = AppScope.of(context).now();
    return Scaffold(
      appBar: AppBar(
        title: Text(_setup ? 'Deduct TDS' : 'Record a TDS deposit'),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              children: [
                Text(
                  _setup
                      ? 'If this business deducts TDS on payments to contractors, professionals or landlords, add its TAN. Bills and expenses can then carry TDS, and the deposit dates show in your deadlines.'
                      : '${rupees(widget.summary.due)} of TDS is still to deposit. Record a challan paid on the income-tax portal or at the bank. MyCA pays nothing itself.',
                  style: text.bodyMedium,
                ),
                const SizedBox(height: 16),
                if (pending == null && !_posted) ...[
                  if (_setup)
                    TextField(
                      controller: _tan,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(labelText: 'TAN'),
                    )
                  else ...[
                    TextField(
                      controller: _challan,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(
                        labelText: 'Challan reference',
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _amount,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      decoration: const InputDecoration(
                        labelText: 'Amount (blank for everything due)',
                        prefixText: '₹ ',
                      ),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text('Paid on', style: text.bodyMedium),
                        ActionChip(
                          label: Text(longDate(isoDate(_date ?? today))),
                          onPressed: _pickDate,
                        ),
                      ],
                    ),
                  ],
                  if (_error.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(_error, style: TextStyle(color: Palette.danger)),
                  ],
                  const SizedBox(height: 14),
                  FilledButton(
                    onPressed: busy ? null : _preview,
                    child: const Text('Preview'),
                  ),
                ],
                for (final entry in entries) entry.toBubble(),
                if (_posted) ...[
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: () => Navigator.of(context).pop(true),
                    child: const Text('Done'),
                  ),
                ],
              ],
            ),
          ),
          if (pending != null)
            ProposalBar(
              busy: busy,
              onPost: postPending,
              onDiscard: discardPending,
            ),
        ],
      ),
    );
  }
}
