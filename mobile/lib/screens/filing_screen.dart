import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../india/india_strings.dart';
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
  String _tdsForm = '';
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
      return setState(() => _error = inText(context, 'Choose the return that was filed.'));
    }
    if (!RegExp(r'^[A-Z0-9]{10,20}$').hasMatch(arn)) {
      return setState(
        () => _error = inText(context, 'Enter the acknowledgement number (ARN) as printed: 10 to 20 letters and digits.'),
      );
    }
    final filedOn = isoDate(_filedOn ?? AppScope.of(context).now());
    setState(() => _error = '');
    await propose(
      inFormat(context, '{form} for {month} filed on {date}, ARN {arn}', {'form': chosen.label, 'month': monthLabel(chosen.period), 'date': longDate(filedOn), 'arn': arn}),
      'record_filing',
      {
        'returnType': chosen.returnType,
        'period': chosen.period,
        if (widget.gstin.isNotEmpty) 'gstin': widget.gstin,
        if (chosen.returnType == 'TDS_QUARTERLY' && _tdsForm.isNotEmpty)
          'form': _tdsForm,
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
      appBar: AppBar(title: Text(inText(context, 'Record a filing'))),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              children: [
                Text(
                  inText(context, 'For a return already filed on the GST portal or by your CA. MyCA files nothing; it keeps the acknowledgement and stops showing the return as due.'),
                  style: text.bodyMedium,
                ),
                const SizedBox(height: 16),
                if (widget.returns.isEmpty)
                  EmptyNote(text: inText(context, 'No return is waiting to be filed.'))
                else if (!_posted && pending == null) ...[
                  DropdownButtonFormField<Deadline>(
                    initialValue: _chosen,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: inText(context, 'Return')),
                    items: [
                      for (final item in widget.returns)
                        DropdownMenuItem(
                          value: item,
                          child: Text(
                            inFormat(context, '{form} for {month} · due {date}', {'form': item.label, 'month': monthLabel(item.period), 'date': longDate(item.dueDate)}),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                    ],
                    onChanged: (value) => setState(() {
                      _chosen = value;
                      _tdsForm = '';
                    }),
                  ),
                  if (_chosen?.returnType == 'TDS_QUARTERLY') ...[
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      children: [
                        for (final option in [
                          ('24Q', inText(context, 'Salary (24Q / Form 138)')),
                          ('26Q', inText(context, 'Other payments (26Q / Form 140)')),
                        ])
                          ChoiceChip(
                            label: Text(option.$2),
                            selected: _tdsForm == option.$1,
                            onSelected: (on) => setState(
                              () => _tdsForm = on ? option.$1 : '',
                            ),
                          ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 12),
                  TextField(
                    controller: _arn,
                    textCapitalization: TextCapitalization.characters,
                    decoration: InputDecoration(
                      labelText: inText(context, 'Acknowledgement number (ARN)'),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(inText(context, 'Filed on'), style: text.bodyMedium),
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
                    child: Text(inText(context, 'Preview')),
                  ),
                ],
                for (final entry in entries) entry.toBubble(),
                if (_posted) ...[
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: () => Navigator.of(context).pop(true),
                    child: Text(inText(context, 'Done')),
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
