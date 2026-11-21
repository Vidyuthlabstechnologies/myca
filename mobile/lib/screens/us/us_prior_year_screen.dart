import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:myca_design/myca_design.dart' show MycaThemeContext;

import '../../api/models.dart';
import '../../api/myca_api.dart';
import '../../app_services.dart';
import '../../app_state.dart';
import '../../format.dart';
import '../../registers.dart';
import '../../us/us_return.dart';

const _fields = <(String, String, String)>[
  ('agi', 'Adjusted gross income', 'Form 1040 line 11'),
  ('totalTax', 'Total tax', 'Form 1040 line 24'),
  ('overpaymentApplied', 'Refund applied to this year', 'Form 1040 line 36'),
  ('shortTermLossCarryover', 'Short-term capital loss carried over', 'Capital loss carryover worksheet'),
  ('longTermLossCarryover', 'Long-term capital loss carried over', 'Capital loss carryover worksheet'),
];

Map<String, Object?> priorYearArgs(int taxYear, Map<String, String> typed, {String documentSha = ''}) {
  final figures = <String, Object?>{};
  for (final (id, _, _) in _fields) {
    final amount = parseAmount(typed[id] ?? '');
    if (amount != null) figures[id] = amount;
  }
  return {'taxYear': '$taxYear', if (documentSha.isNotEmpty) 'documentSha256': documentSha, if (figures.isNotEmpty) 'figures': figures};
}

String priorYearFieldLabel(String id) => _fields.firstWhere((f) => f.$1 == id, orElse: () => (id, id, '')).$2;

class UsPriorYearScreen extends StatefulWidget {
  const UsPriorYearScreen({super.key, required this.taxYear});

  final int taxYear;

  @override
  State<UsPriorYearScreen> createState() => _UsPriorYearScreenState();
}

class _UsPriorYearScreenState extends State<UsPriorYearScreen> {
  final _controllers = {for (final (id, _, _) in _fields) id: TextEditingController()};
  bool _busy = false;
  bool _reading = false;
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

  String? _typedProblem() {
    for (final (id, label, _) in _fields) {
      final typed = _controllers[id]!.text.trim();
      if (typed.isNotEmpty && parseAmount(typed) == null) return '$label is an amount, for example 85000.';
    }
    return null;
  }

  Map<String, String> get _typed => {for (final entry in _controllers.entries) entry.key: entry.value.text};

  void _finish(ChatReply reply) {
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
  }

  Future<void> _bring() async {
    final problem = _typedProblem();
    if (problem != null) return setState(() => _note = problem);
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      final reply = await saveAndConfirm(_api, 'import_us_prior_year', priorYearArgs(widget.taxYear, _typed));
      if (mounted) _finish(reply);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pdf() async {
    final problem = _typedProblem();
    if (problem != null) return setState(() => _note = problem);
    final state = AppScope.of(context);
    setState(() => _note = '');
    final picked = await state.pickAnyFile();
    if (picked == null || !mounted) return;
    if (picked.mime != 'application/pdf') {
      return setState(() => _note = 'Pick the PDF of your ${widget.taxYear - 1} Form 1040. Download it from your tax software or ask your preparer. A photo cannot be read, so type the figures below instead.');
    }
    setState(() => _reading = true);
    try {
      final sha = await _api.upload(picked.name, dataUrlOf(picked));
      final reply = await _api.propose('import_us_prior_year', priorYearArgs(widget.taxYear, _typed, documentSha: sha));
      if (!mounted) return;
      final preview = reply.preview;
      if (preview == null) {
        setState(() => _note = reply.reply.isNotEmpty ? reply.reply : reply.blockers.isNotEmpty ? reply.blockers.join(' ') : 'That PDF could not be read. Type the figures below.');
        return;
      }
      setState(() => _reading = false);
      final sure = await showDialog<bool>(
        context: context,
        builder: (dialog) => AlertDialog(
          title: Text('Read from ${shortFileName(picked.name, 32)}'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(preview.summary),
                for (final effect in preview.effects) Padding(padding: const EdgeInsets.only(top: 8), child: Text(effect)),
              ],
            ),
          ),
          actions: [
            TextButton(key: const Key('usPrior.discardPdf'), onPressed: () => Navigator.of(dialog).pop(false), child: const Text('Not these')),
            TextButton(key: const Key('usPrior.confirmPdf'), onPressed: () => Navigator.of(dialog).pop(true), child: const Text('Bring these in')),
          ],
        ),
      );
      if (!mounted) return;
      if (sure != true) {
        await _api.discard();
        if (mounted) setState(() => _note = 'Nothing was brought in. Pick another PDF or type the figures below.');
        return;
      }
      setState(() => _busy = true);
      final done = await _api.confirm(preview.token);
      if (mounted) _finish(done);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _reading = false;
        });
      }
    }
  }

  List<Widget> _readFromPdf(Map<String, dynamic> pdf) {
    final text = Theme.of(context).textTheme;
    final found = pdf['found'] is Map ? Map<String, dynamic>.from(pdf['found'] as Map) : const <String, dynamic>{};
    final warnings = pdf['warnings'] is List ? pdf['warnings'] as List : const [];
    final year = '${pdf['taxYear'] ?? ''}';
    return [
      const SizedBox(height: 8),
      Text(year.isEmpty ? 'Read from your Form 1040 PDF' : 'Read from your $year Form 1040 PDF', key: const Key('usPrior.fromPdf'), style: text.titleMedium),
      for (final entry in found.entries)
        if (entry.value is Map)
          ListTile(
            key: Key('usPrior.found.${entry.key}'),
            contentPadding: EdgeInsets.zero,
            title: Text('${priorYearFieldLabel(entry.key)}: ${dollars(num.tryParse('${(entry.value as Map)['value']}') ?? 0)}'),
            subtitle: '${(entry.value as Map)['where'] ?? ''}'.isEmpty ? null : Text('${(entry.value as Map)['where']}'),
          ),
      for (final warning in warnings)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text('Check: $warning', key: const Key('usPrior.warning'), style: text.bodyMedium?.copyWith(color: context.myca.warn)),
        ),
    ];
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
                if (done['pdf'] is Map) ..._readFromPdf(Map<String, dynamic>.from(done['pdf'] as Map)),
                for (final note in (done['notes'] is List ? done['notes'] as List : const [])) Padding(padding: const EdgeInsets.only(top: 8), child: Text('$note', style: text.bodyMedium)),
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
                const SizedBox(height: 12),
                Text('Filed with other tax software or a preparer? Pick your $last Form 1040 PDF. MyCA reads the figures and shows them to you before anything is saved.', style: text.bodyMedium),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  key: const Key('usPrior.pdf'),
                  onPressed: _busy || _reading ? null : _pdf,
                  icon: const Icon(Icons.picture_as_pdf_outlined),
                  label: Text(_reading ? 'Reading the PDF…' : 'Pick last year\'s PDF'),
                ),
                const SizedBox(height: 12),
                Text('No PDF? Copy these from your $last Form 1040. Leave blank what you do not have.', style: text.bodyMedium),
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
                FilledButton(key: const Key('usPrior.bring'), onPressed: _busy || _reading ? null : _bring, child: Text(_busy ? 'Bringing it in…' : 'Bring in $last')),
              ],
      ),
    );
  }
}
