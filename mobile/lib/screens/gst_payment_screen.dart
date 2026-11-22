import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../proposal_flow.dart';
import '../theme.dart';
import '../widgets.dart';

class GstPaymentScreen extends StatefulWidget {
  const GstPaymentScreen({super.key, required this.period, required this.toPay, this.gstin = ''});

  final String gstin;

  final String period;
  final num toPay;

  @override
  State<GstPaymentScreen> createState() => _GstPaymentScreenState();
}

class _GstPaymentScreenState extends State<GstPaymentScreen> with ProposalFlow {
  final _cpin = TextEditingController();
  String _mode = 'bank';
  DateTime? _date;
  String _error = '';
  bool _posted = false;

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  Future<void> onPosted() async {
    HapticFeedback.mediumImpact();
    setState(() => _posted = true);
  }

  @override
  void dispose() {
    _cpin.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final today = AppScope.of(context).now();
    final picked = await showDatePicker(context: context, initialDate: _date ?? today, firstDate: DateTime(today.year - 2), lastDate: today);
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _preview() async {
    final cpin = _cpin.text.replaceAll(RegExp(r'\s+'), '');
    if (cpin.isNotEmpty && !RegExp(r'^[0-9]{14}$').hasMatch(cpin)) {
      return setState(() => _error = inText(context, 'A CPIN is the fourteen-digit challan number from the GST portal. Leave it blank if you do not have it yet.'));
    }
    setState(() => _error = '');
    await propose(inFormat(context, 'Paid GST for {month}', {'month': monthLabel(widget.period)}), 'record_gst_payment', {
      'period': widget.period,
      if (widget.gstin.isNotEmpty) 'gstin': widget.gstin,
      'date': isoDate(_date ?? AppScope.of(context).now()),
      'mode': _mode,
      if (cpin.isNotEmpty) 'cpin': cpin,
    });
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final today = AppScope.of(context).now();
    return Scaffold(
      appBar: AppBar(title: Text(inFormat(context, 'GST paid for {month}', {'month': monthLabel(widget.period)}))),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              children: [
                Text(
                  inFormat(context, '{amount} is to pay in cash after set-off. Record the challan you paid on the GST portal; MyCA posts the set-off and the payment, and pays nothing itself.', {'amount': rupees(widget.toPay)}),
                  style: text.bodyMedium,
                ),
                const SizedBox(height: 16),
                if (pending == null && !_posted) ...[
                  TextField(
                    controller: _cpin,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(labelText: inText(context, 'CPIN (optional)'), helperText: inText(context, 'The fourteen-digit challan number')),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(inText(context, 'Paid on'), style: text.bodyMedium),
                      ActionChip(label: Text(longDate(isoDate(_date ?? today))), onPressed: _pickDate),
                      for (final mode in const ['bank', 'cash'])
                        ChoiceChip(
                          label: Text(mode == 'bank' ? inText(context, 'Bank') : inText(context, 'Cash')),
                          selected: _mode == mode,
                          onSelected: (_) => setState(() => _mode = mode),
                        ),
                    ],
                  ),
                  if (_error.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(_error, style: TextStyle(color: Palette.danger)),
                  ],
                  const SizedBox(height: 14),
                  FilledButton(onPressed: busy ? null : _preview, child: Text(inText(context, 'Preview'))),
                ],
                for (final entry in entries) entry.toBubble(),
                if (_posted) ...[
                  const SizedBox(height: 16),
                  FilledButton(onPressed: () => Navigator.of(context).pop(true), child: Text(inText(context, 'Done'))),
                ],
              ],
            ),
          ),
          if (pending != null) ProposalBar(busy: busy, onPost: postPending, onDiscard: discardPending),
        ],
      ),
    );
  }
}
