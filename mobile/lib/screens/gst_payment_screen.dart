import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../proposal_flow.dart';
import '../theme.dart';
import '../widgets.dart';

class GstPaymentScreen extends StatefulWidget {
  const GstPaymentScreen({super.key, required this.period, required this.toPay});

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
      return setState(() => _error = 'A CPIN is the fourteen-digit challan number from the GST portal. Leave it blank if you do not have it yet.');
    }
    setState(() => _error = '');
    await propose('Paid GST for ${monthLabel(widget.period)}', 'record_gst_payment', {
      'period': widget.period,
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
      appBar: AppBar(title: Text('GST paid for ${monthLabel(widget.period)}')),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              children: [
                Text(
                  '${rupees(widget.toPay)} is to pay in cash after set-off. Record the challan you paid on the GST portal; MyCA posts the set-off and the payment, and pays nothing itself.',
                  style: text.bodyMedium,
                ),
                const SizedBox(height: 16),
                if (pending == null && !_posted) ...[
                  TextField(
                    controller: _cpin,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'CPIN (optional)', helperText: 'The fourteen-digit challan number'),
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text('Paid on', style: text.bodyMedium),
                      ActionChip(label: Text(longDate(isoDate(_date ?? today))), onPressed: _pickDate),
                      for (final mode in const ['bank', 'cash'])
                        ChoiceChip(
                          label: Text(mode == 'bank' ? 'Bank' : 'Cash'),
                          selected: _mode == mode,
                          onSelected: (_) => setState(() => _mode = mode),
                        ),
                    ],
                  ),
                  if (_error.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(_error, style: const TextStyle(color: Palette.danger)),
                  ],
                  const SizedBox(height: 14),
                  FilledButton(onPressed: busy ? null : _preview, child: const Text('Preview')),
                ],
                for (final entry in entries) entry.toBubble(),
                if (_posted) ...[
                  const SizedBox(height: 16),
                  FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Done')),
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
