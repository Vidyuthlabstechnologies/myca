import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../registers.dart';
import '../../us/us_return.dart';

const _fields = <(String, String, String)>[
  ('agi', 'Adjusted gross income', 'Form 1040 line 11'),
  ('totalTax', 'Total tax', 'Form 1040 line 24'),
  ('overpaymentApplied', 'Refund applied to this year', 'Form 1040 line 36'),
  ('shortTermLossCarryover', 'Short-term capital loss carried over', 'Capital loss carryover worksheet'),
  ('longTermLossCarryover', 'Long-term capital loss carried over', 'Capital loss carryover worksheet'),
  ('qbiLossCarryforward', 'Qualified business loss carried forward', 'Form 8995 line 16 (line 18 from 2026)'),
  ('qbiReitPtpLossCarryforward', 'REIT and PTP loss carried forward', 'Form 8995 line 17 (line 19 from 2026)'),
];

Map<String, Object?> priorYearArgs(int taxYear, Map<String, String> typed) {
  final figures = <String, Object?>{};
  for (final (id, _, _) in _fields) {
    final amount = parseAmount(typed[id] ?? '');
    if (amount != null) figures[id] = amount;
  }
  return {'taxYear': '$taxYear', if (figures.isNotEmpty) 'figures': figures};
}

class UsPriorYearScreen extends StatefulWidget {
  const UsPriorYearScreen({super.key, required this.taxYear});

  final int taxYear;

  @override
  State<UsPriorYearScreen> createState() => _UsPriorYearScreenState();
}

class _UsPriorYearScreenState extends State<UsPriorYearScreen> {
  final _controllers = {for (final (id, _, _) in _fields) id: TextEditingController()};
  bool _busy = false;
  String _note = '';
  Map<String, dynamic>? _done;

  MycaApi get _api => AppScope.of(context).api;

  @override
  void dispose() {
    for (final controller in _controllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _bring() async {
    for (final (id, label, _) in _fields) {
      final typed = _controllers[id]!.text.trim();
      if (typed.isNotEmpty && parseAmount(typed) == null) {
        return setState(() => _note = '$label is an amount, for example 85000.');
      }
    }
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      final reply = await saveAndConfirm(_api, 'import_us_prior_year', priorYearArgs(widget.taxYear, {for (final entry in _controllers.entries) entry.key: entry.value.text}));
      if (!mounted) return;
      if (!reply.posted) {
        setState(() => _note = reply.reply.isEmpty ? 'Nothing was brought in. Try again.' : reply.reply);
        return;
      }
      Map<String, dynamic> data = const {};
      for (final tool in reply.tools) {
        final result = tool['result'];
        if (tool['name'] == 'import_us_prior_year' && result is Map && result['data'] is Map) data = Map<String, dynamic>.from(result['data'] as Map);
      }
      setState(() => _done = data);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final last = widget.taxYear - 1;
    final done = _done;
    return Scaffold(
      appBar: AppBar(title: const Text('Start from last year')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: done != null
            ? [
                Text(done['profileCopied'] == true ? 'Your $last details are on your ${widget.taxYear} return.' : 'Your $last figures are on your ${widget.taxYear} return.', key: const Key('usPrior.done'), style: text.titleLarge),
                const SizedBox(height: 12),
                for (final note in (done['notes'] is List ? done['notes'] as List : const [])) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text('$note', style: text.bodyMedium)),
                if (done['expectedForms'] is List && (done['expectedForms'] as List).isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text('Forms to expect again', style: text.titleMedium),
                  for (final form in done['expectedForms'] as List)
                    if (form is Map) ListTile(contentPadding: EdgeInsets.zero, leading: const Icon(Icons.description_outlined), title: Text('${form['kind']}'), subtitle: '${form['payer'] ?? ''}'.isEmpty ? null : Text('${form['payer']}')),
                ],
                const SizedBox(height: 16),
                FilledButton(key: const Key('usPrior.back'), onPressed: () => Navigator.of(context).pop(), child: const Text('Back to my return')),
              ]
            : [
                Text('Filed $last with MyCA? Tap the button and your details, dependents and carryovers come across.', style: text.bodyLarge),
                const SizedBox(height: 8),
                Text('Filed somewhere else? Copy these from your $last Form 1040. Leave blank what you do not have.', style: text.bodyMedium),
                const SizedBox(height: 8),
                for (final (id, label, help) in _fields)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: TextField(
                      key: Key('usPrior.$id'),
                      controller: _controllers[id],
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
                      decoration: InputDecoration(labelText: label, helperText: help, prefixText: '\$ '),
                    ),
                  ),
                if (_note.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_note, key: const Key('usPrior.note'), style: text.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.error))),
                const SizedBox(height: 16),
                FilledButton(key: const Key('usPrior.bring'), onPressed: _busy ? null : _bring, child: Text(_busy ? 'Bringing it in…' : 'Bring in $last')),
              ],
      ),
    );
  }
}
