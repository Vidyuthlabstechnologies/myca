import 'dart:convert';

import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../attention.dart';
import '../format.dart';
import '../marks.dart';
import '../theme.dart';
import '../widgets.dart';
import 'ca_screen.dart';
import 'credit_card.dart';
import 'review_screen.dart';

const _heldReasons = {
  'INVALID_GSTIN': 'the buyer GSTIN is not valid',
  'INVALID_RATE': 'the GST rate is not one in force on that date',
  'MISSING_PLACE_OF_SUPPLY': 'the place of supply is missing',
};

String heldReason(String code) =>
    _heldReasons[code] ?? code.toLowerCase().replaceAll('_', ' ');

class TaxesScreen extends StatefulWidget {
  const TaxesScreen({super.key});

  @override
  State<TaxesScreen> createState() => _TaxesScreenState();
}

class _TaxesScreenState extends State<TaxesScreen> {
  Future<Today>? _today;
  String? _period;
  String _fileNote = '';
  bool _saving = false;
  String _entriesNote = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _today ??= loadToday(AppScope.of(context).api);
  }

  Future<void> _reload({String? period}) async {
    final next = loadToday(AppScope.of(context).api, period: period ?? _period);
    setState(() {
      _period = period ?? _period;
      _today = next;
      _fileNote = '';
    });
    try {
      await next;
    } on MycaApiException {
      return;
    }
  }

  Future<void> _saveFile(PeriodGst gst) async {
    final state = AppScope.of(context);
    setState(() {
      _saving = true;
      _fileNote = '';
    });
    var note = '';
    try {
      final body = await state.api.query('export_gstr1_json', {
        'fp': gst.gstr1.fp,
      });
      final data = toolData(body);
      if (data.isEmpty) {
        note = 'The file could not be prepared.';
      } else {
        final name = 'GSTR1_${data['gstin'] ?? ''}_${gst.gstr1.fp}.json';
        final saved = await state.saveTextFile(
          name,
          const JsonEncoder.withIndent('  ').convert(data),
        );
        note = saved
            ? 'Saved $name. Upload it in the GST offline tool or send it to your CA.'
            : 'Not saved.';
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() {
      _saving = false;
      _fileNote = note;
    });
  }

  Future<void> _saveEntries(String period) async {
    final state = AppScope.of(context);
    setState(() => _entriesNote = '');
    var note = '';
    try {
      final data = toolData(
        await state.api.query('export_entries', {'period': period}),
      );
      if (data.isEmpty) {
        note = 'The entries could not be prepared.';
      } else {
        final name = data['fileName'] as String;
        final count = data['count'] as num;
        final saved = await state.saveTextFile(name, data['csv'] as String);
        note = saved
            ? 'Saved $name with ${count == 1 ? '1 entry' : '$count entries'}. Send it to your CA.'
            : 'Not saved.';
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() => _entriesNote = note);
  }

  void _explain(ExceptionItem item) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) {
        final text = Theme.of(sheet).textTheme;
        final urgent = isUrgent(item);
        return SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(22, 0, 22, 22),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                MarkIcon(
                  mark: urgent ? Mark.urgent : Mark.dueSoon,
                  color: urgent ? Palette.danger : Palette.warn,
                  size: 28,
                ),
                const SizedBox(height: 14),
                Text(item.title, style: text.headlineSmall),
                const SizedBox(height: 10),
                Text(item.why, style: text.bodyLarge),
                if (item.moneyAtRisk > 0) ...[
                  const SizedBox(height: 16),
                  Text('AT RISK', style: text.labelSmall),
                  Text(
                    rupees(item.moneyAtRisk),
                    style: text.headlineMedium?.copyWith(
                      fontFeatures: moneyFigures,
                    ),
                  ),
                ],
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () => Navigator.of(sheet).pop(),
                    child: const Text('Got it'),
                  ),
                ),
                if (item.id.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () async {
                        Navigator.of(sheet).pop();
                        final reply = await askMyCa(
                          context,
                          subject: {'kind': 'exception', 'id': item.id},
                          about: item.title,
                        );
                        if (!mounted || reply.isEmpty) return;
                        setState(() => _fileNote = reply);
                      },
                      child: const Text('Ask my CA'),
                    ),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Taxes and filings')),
      body: FutureBuilder<Today>(
        future: _today,
        builder: (context, state) {
          final today = state.data;
          if (today == null) {
            if (state.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '${state.error ?? 'Could not load.'}',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _reload,
                    child: const Text('Try again'),
                  ),
                ],
              ),
            );
          }
          final open = needsYou(today);
          final upcoming = comingUp(today);
          final gst = today.gst;
          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
              children: [
                SectionLabel(
                  open.isEmpty
                      ? 'Nothing needs you right now'
                      : 'Needs you (${open.length})',
                ),
                if (open.isNotEmpty)
                  Panel(
                    children: [
                      for (final item in open)
                        RowCard(
                          leading: TintTile(
                            tint: isUrgent(item) ? Tint.urgent : Tint.taxes,
                            mark: isUrgent(item) ? Mark.urgent : Mark.dueSoon,
                          ),
                          title: item.title,
                          subtitle: item.moneyAtRisk > 0
                              ? 'At risk: ${rupees(item.moneyAtRisk)}'
                              : item.why,
                          trailing: const Chevron(),
                          onTap: () => _explain(item),
                        ),
                    ],
                  ),
                const SizedBox(height: 26),
                if (gst != null) ...[
                  if (gst.periods.length > 1)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final period in gst.periods.reversed.take(6))
                            ChoiceChip(
                              label: Text(monthLabel(period)),
                              selected: period == gst.period,
                              selectedColor: Palette.sunken,
                              showCheckmark: false,
                              onSelected: (_) => _reload(period: period),
                            ),
                        ],
                      ),
                    ),
                  _PeriodCard(gst: gst),
                  const SizedBox(height: 12),
                  _Gstr1Card(
                    gst: gst,
                    saving: _saving,
                    note: _fileNote,
                    onSave: () => _saveFile(gst),
                  ),
                  const SizedBox(height: 12),
                  CreditCard(period: gst.period),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: gst.salesCount == 0 && gst.gstr1.empty
                          ? null
                          : () => Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) =>
                                    ReviewScreen(period: gst.period),
                              ),
                            ),
                      child: Text(
                        'Review the ${monthLabel(gst.period)} return',
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => _saveEntries(gst.period),
                      child: const Text('Save entries for your CA'),
                    ),
                  ),
                  if (_entriesNote.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        _entriesNote,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ),
                ],
                if (upcoming.isNotEmpty) ...[
                  const SizedBox(height: 26),
                  const SectionLabel('Coming up'),
                  Panel(
                    children: [
                      for (final deadline in upcoming)
                        RowCard(
                          leading: const TintTile(
                            tint: Tint.ask,
                            mark: Mark.comingUp,
                          ),
                          title: '${deadline.label} for ${deadline.period}',
                          subtitle:
                              '${dueLabel(deadline.daysUntil)} (${deadline.dueDate})',
                        ),
                    ],
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Palette.surface,
        borderRadius: BorderRadius.circular(radiusCard),
        border: Border.all(color: Palette.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: children,
      ),
    );
  }
}

class _PeriodCard extends StatelessWidget {
  const _PeriodCard({required this.gst});

  final PeriodGst gst;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return _Card(
      children: [
        Text(
          'GST FOR ${monthLabel(gst.period).toUpperCase()}',
          style: text.labelSmall,
        ),
        const SizedBox(height: 6),
        Text(
          rupees(gst.outputTax.total),
          style: text.displaySmall?.copyWith(
            fontWeight: FontWeight.w400,
            fontFeatures: moneyFigures,
          ),
        ),
        Text(
          'Tax on ${gst.salesCount == 1 ? '1 sale' : '${gst.salesCount} sales'} of ${rupees(gst.taxableSales)}',
          style: text.bodyMedium,
        ),
        const SizedBox(height: 14),
        const Divider(),
        const SizedBox(height: 10),
        _HeadsRow(label: 'Tax on sales', heads: gst.outputTax),
        const SizedBox(height: 10),
        _HeadsRow(label: 'Credit on purchases', heads: gst.inputCredit),
        const SizedBox(height: 12),
        Text(
          'What you pay after credit is set off head by head is worked out in the return, not here.',
          style: text.bodySmall,
        ),
      ],
    );
  }
}

class _HeadsRow extends StatelessWidget {
  const _HeadsRow({required this.label, required this.heads});

  final String label;
  final TaxHeads heads;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(child: Text(label, style: text.titleMedium)),
            Text(
              rupees(heads.total),
              style: text.titleMedium?.copyWith(fontFeatures: moneyFigures),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text(
          'IGST ${rupees(heads.igst)} · CGST ${rupees(heads.cgst)} · SGST ${rupees(heads.sgst)}',
          style: text.bodySmall?.copyWith(fontFeatures: moneyFigures),
        ),
      ],
    );
  }
}

class _Gstr1Card extends StatelessWidget {
  const _Gstr1Card({
    required this.gst,
    required this.saving,
    required this.note,
    required this.onSave,
  });

  final PeriodGst gst;
  final bool saving;
  final String note;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final file = gst.gstr1;
    return _Card(
      children: [
        Text(
          'GSTR-1 FILE FOR ${monthLabel(gst.period).toUpperCase()}',
          style: text.labelSmall,
        ),
        const SizedBox(height: 8),
        if (file.empty && file.held.isEmpty)
          Text('No sales to report for this month.', style: text.bodyLarge)
        else ...[
          Text(
            '${file.b2b} to registered buyers · ${file.b2cl} large to unregistered · ${file.b2cs} summary ${file.b2cs == 1 ? 'row' : 'rows'}',
            style: text.bodyLarge,
          ),
          for (final held in file.held)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                '${held.number} is left out: ${heldReason(held.code)}.',
                style: const TextStyle(
                  color: Palette.danger,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              onPressed: saving || file.empty ? null : onSave,
              child: Text(
                saving ? 'Preparing…' : 'Save file for the GST portal',
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'MyCA does not upload or file this. You or your CA do that on the GST portal.',
            style: text.bodySmall,
          ),
        ],
        if (note.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(note, style: text.bodyMedium?.copyWith(color: Palette.ink)),
        ],
      ],
    );
  }
}
