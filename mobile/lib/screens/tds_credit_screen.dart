import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../excel.dart';
import '../format.dart';
import '../marks.dart';
import '../proposal_flow.dart';
import '../theme.dart';
import '../widgets.dart';

Color _statusColor(String status) => switch (status) {
  'matched' => Palette.accent,
  'not in books' || 'short in 26AS' => Palette.danger,
  _ => Palette.warn,
};

class TdsCreditScreen extends StatefulWidget {
  const TdsCreditScreen({super.key});

  @override
  State<TdsCreditScreen> createState() => _TdsCreditScreenState();
}

class _TdsCreditScreenState extends State<TdsCreditScreen> with ProposalFlow {
  Future<TdsCreditCheck?>? _check;
  bool _saving = false;
  String _note = '';

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  Future<void> onPosted() async {
    await AppScope.of(context).refresh();
    if (mounted) _reload();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _check ??= _load();
  }

  Future<TdsCreditCheck?> _load() async {
    try {
      return TdsCreditCheck.fromTool(await api.query('tds_credit_check'));
    } on MycaApiException {
      return null;
    }
  }

  void _reload() {
    final next = _load();
    setState(() {
      _check = next;
    });
  }

  Future<void> _importFile() async {
    final state = AppScope.of(context);
    final picked = await state.pickTextFile(const ['csv', 'txt', 'tsv']);
    if (picked == null || !mounted) return;
    final String sha;
    try {
      sha = await api.upload(picked.name, picked.content);
    } on MycaApiException catch (err) {
      setState(() => entries.add(ThreadEntry(text: err.message, tone: BubbleTone.problem)));
      return;
    }
    if (!mounted) return;
    await propose('Import Form 26AS: ${picked.name}', 'import_26as_credits', {'documentSha256': sha});
  }

  Future<void> _saveExcel() async {
    final state = AppScope.of(context);
    setState(() {
      _saving = true;
      _note = '';
    });
    var note = '';
    try {
      note = await saveXlsx(state, toolData(await state.api.query('export_xlsx', {'report': 'tds_credit_check'})));
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() {
      _saving = false;
      _note = note;
    });
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Form 26AS check')),
      body: Column(
        children: [
          Expanded(
            child: FutureBuilder<TdsCreditCheck?>(
              future: _check,
              builder: (context, snap) {
                final check = snap.data;
                if (check == null) {
                  if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
                  return Center(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text('The Form 26AS check could not be read.', textAlign: TextAlign.center),
                          const SizedBox(height: 16),
                          FilledButton(onPressed: _reload, child: const Text('Try again')),
                        ],
                      ),
                    ),
                  );
                }
                return RefreshIndicator(
                  onRefresh: () async => _reload(),
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                    children: [
                      _Header(check: check),
                      const SizedBox(height: 16),
                      if (check.rows.isEmpty)
                        const EmptyNote(text: 'Import Form 26AS from the income-tax portal (CSV or text) to compare it with your books.')
                      else
                        Panel(
                          children: [
                            for (var i = 0; i < check.rows.length; i++) _rowCard(ValueKey('tds26.$i'), check.rows[i]),
                          ],
                        ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          ActionChip(
                            avatar: const Icon(Icons.upload_file, size: 18),
                            label: const Text('Import 26AS'),
                            onPressed: busy ? null : _importFile,
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: busy || _saving ? null : _saveExcel,
                          child: const Text('Save as Excel'),
                        ),
                      ),
                      if (_note.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(_note, style: text.bodyMedium),
                        ),
                      if (check.note.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Text(check.note, style: text.bodySmall),
                      ],
                      const SizedBox(height: 12),
                      for (final entry in entries) entry.toBubble(),
                    ],
                  ),
                );
              },
            ),
          ),
          if (pending != null) ProposalBar(busy: busy, onPost: postPending, onDiscard: discardPending),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.check});

  final TdsCreditCheck check;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Palette.surface,
        borderRadius: BorderRadius.circular(radiusCard),
        border: Border.all(color: Palette.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(check.fy.isEmpty ? 'THIS FINANCIAL YEAR' : 'FINANCIAL YEAR ${check.fy}', style: text.labelSmall),
          const SizedBox(height: 10),
          Wrap(
            spacing: 24,
            runSpacing: 12,
            children: [
              _Total(label: 'In 26AS', amount: check.in26as),
              _Total(label: 'In your books', amount: check.inBooks),
              _Total(label: 'Gap', amount: check.gap, color: check.gap.abs() > 1 ? Palette.danger : null),
            ],
          ),
          if (check.source.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(check.source, style: text.bodySmall),
          ],
        ],
      ),
    );
  }
}

class _Total extends StatelessWidget {
  const _Total({required this.label, required this.amount, this.color});

  final String label;
  final num amount;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: text.bodySmall),
        const SizedBox(height: 2),
        Amount(rupees(amount), style: text.titleLarge?.copyWith(fontFeatures: moneyFigures, color: color)),
      ],
    );
  }
}

RowCard _rowCard(Key key, TdsCreditRow row) {
  final color = _statusColor(row.status);
  final tag = FittedBox(
    fit: BoxFit.scaleDown,
    alignment: Alignment.centerLeft,
    child: StatusTag(text: row.status, color: color),
  );
  return RowCard(
    key: key,
    leading: TintTile(tint: color == Palette.danger ? Tint.urgent : Tint.taxes, mark: Mark.taxes),
    title: '${row.who} · ${row.quarter}',
    subtitle: [
      '26AS ${rupees(row.in26as)}',
      'books ${rupees(row.inBooks)}',
      if (row.section.isNotEmpty) 'Section ${row.section}',
      if (row.tan.isNotEmpty) 'TAN ${row.tan}',
    ].join(' · '),
    badge: row.note.isEmpty
        ? tag
        : Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              tag,
              const SizedBox(height: 6),
              Builder(builder: (context) => Text(row.note, style: Theme.of(context).textTheme.bodySmall)),
            ],
          ),
  );
}
