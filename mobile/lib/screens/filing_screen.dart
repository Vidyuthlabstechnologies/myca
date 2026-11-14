import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../proposal_flow.dart';
import '../theme.dart';
import '../widgets.dart';

class RecordFilingScreen extends StatefulWidget {
  const RecordFilingScreen({super.key, required this.returns, this.gstin = ''});

  final List<Deadline> returns;
  final String gstin;

  @override
  State<RecordFilingScreen> createState() => _RecordFilingScreenState();
}

class _RecordFilingScreenState extends State<RecordFilingScreen>
    with ProposalFlow {
  final _arn = TextEditingController();
  late Deadline? _chosen = widget.returns.isEmpty ? null : widget.returns.first;
  DateTime? _filedOn;
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
    _arn.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final today = AppScope.of(context).now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _filedOn ?? today,
      firstDate: DateTime(today.year - 2),
      lastDate: today,
    );
    if (picked != null) setState(() => _filedOn = picked);
  }

  Future<void> _preview() async {
    final chosen = _chosen;
    final arn = _arn.text.replaceAll(RegExp(r'\s+'), '').toUpperCase();
    if (chosen == null) {
      return setState(() => _error = 'Choose the return that was filed.');
    }
    if (!RegExp(r'^[A-Z0-9]{10,20}$').hasMatch(arn)) {
      return setState(
        () => _error =
            'Enter the acknowledgement number (ARN) as printed: 10 to 20 letters and digits.',
      );
    }
    final filedOn = isoDate(_filedOn ?? AppScope.of(context).now());
    setState(() => _error = '');
    await propose(
      '${chosen.label} for ${monthLabel(chosen.period)} filed on ${longDate(filedOn)}, ARN $arn',
      'record_filing',
      {
        'returnType': chosen.returnType,
        'period': chosen.period,
        if (widget.gstin.isNotEmpty) 'gstin': widget.gstin,
        'arn': arn,
        'filedOn': filedOn,
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final today = AppScope.of(context).now();
    return Scaffold(
      appBar: AppBar(title: const Text('Record a filing')),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              children: [
                Text(
                  'For a return already filed on the GST portal or by your CA. MyCA files nothing; it keeps the acknowledgement and stops showing the return as due.',
                  style: text.bodyMedium,
                ),
                const SizedBox(height: 16),
                if (widget.returns.isEmpty)
                  const EmptyNote(text: 'No return is waiting to be filed.')
                else if (!_posted && pending == null) ...[
                  DropdownButtonFormField<Deadline>(
                    initialValue: _chosen,
                    isExpanded: true,
                    decoration: const InputDecoration(labelText: 'Return'),
                    items: [
                      for (final item in widget.returns)
                        DropdownMenuItem(
                          value: item,
                          child: Text(
                            '${item.label} for ${monthLabel(item.period)} · due ${longDate(item.dueDate)}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                    ],
                    onChanged: (value) => setState(() => _chosen = value),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _arn,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(
                      labelText: 'Acknowledgement number (ARN)',
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text('Filed on', style: text.bodyMedium),
                      ActionChip(
                        label: Text(longDate(isoDate(_filedOn ?? today))),
                        onPressed: _pickDate,
                      ),
                    ],
                  ),
                  if (_error.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(_error, style: TextStyle(color: Palette.danger)),
                  ],
                  const SizedBox(height: 16),
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
