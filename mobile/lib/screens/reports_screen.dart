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
import 'audit_trail_screen.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> with ProposalFlow {
  Future<List<SavedReport>>? _reports;
  String _openName = '';
  ReportResult? _result;
  bool _running = false;
  String _note = '';
  String _excelNote = '';

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reports ??= _load();
  }

  Future<List<SavedReport>> _load() async => savedReportsFrom(await api.query('list_reports'));

  @override
  Future<void> onPosted() async {
    setState(() {
      _reports = _load();
      if (_openName.isNotEmpty && pending == null) {
        _openName = '';
        _result = null;
      }
    });
  }

  Future<void> _run(SavedReport report) async {
    if (_openName == report.name && _result != null) {
      setState(() {
        _openName = '';
        _result = null;
      });
      return;
    }
    setState(() {
      _openName = report.name;
      _result = null;
      _running = true;
      _note = '';
      _excelNote = '';
    });
    ReportResult? result;
    var note = '';
    try {
      result = ReportResult.fromTool(await api.query('run_report', {'name': report.name}));
      if (result == null) note = 'The report could not be run.';
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() {
      _running = false;
      _result = result;
      _note = note;
    });
  }

  Future<void> _delete(SavedReport report) => propose('Delete the report ${report.name}', 'delete_report', {'name': report.name});

  Future<void> _saveExcel(SavedReport report) async {
    final state = AppScope.of(context);
    setState(() => _excelNote = '');
    var note = '';
    try {
      note = await saveXlsx(state, toolData(await state.api.query('export_xlsx', {'report': 'saved_report', 'name': report.name})));
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() => _excelNote = note);
  }

  Future<void> _add() async {
    final draft = await showModalBottomSheet<_ReportDraft>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _ReportForm(),
    );
    if (draft == null || !mounted) return;
    await propose('Save the report ${draft.name}', 'save_report', {
      'name': draft.name,
      'metric': draft.metric,
      'groupBy': draft.groupBy,
      'period': draft.period,
      'compare': draft.compare,
    });
  }

  Widget _resultPanel(ReportResult result, TextTheme text) {
    final comparison = reportComparisonWords(result, rupees);
    return Panel(
      children: [
        RowCard(
          leading: const TintTile(tint: Tint.taxes, mark: Mark.sales),
          title: rupees(result.total),
          subtitle: [result.rangeLabel, if (comparison.isNotEmpty) comparison].join(' · '),
        ),
        for (final row in result.rows)
          RowCard(
            leading: const TintTile(tint: Tint.taxes, mark: Mark.comingUp),
            title: '${row.label}: ${rupees(row.amount)}',
            subtitle: row.before == null ? '' : 'was ${rupees(row.before!)}',
          ),
        if (result.more > 0)
          RowCard(
            leading: const TintTile(tint: Tint.taxes, mark: Mark.comingUp),
            title: '${result.more} more',
            subtitle: 'Save as Excel for the full list',
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Reports'),
        actions: [
          IconButton(
            tooltip: 'Save a report',
            onPressed: busy || pending != null ? null : _add,
            icon: const Icon(Icons.add),
          ),
        ],
      ),
      body: FutureBuilder<List<SavedReport>>(
        future: _reports,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final reports = snap.data ?? const <SavedReport>[];
          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  children: [
                    const SectionLabel('Built-in'),
                    Panel(
                      children: [
                        RowCard(
                          key: const ValueKey('reports.audit'),
                          leading: const TintTile(tint: Tint.taxes, mark: Mark.paper),
                          title: 'Audit trail',
                          subtitle: 'Who changed what and when, with a check for edits to the log',
                          trailing: const Chevron(),
                          onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AuditTrailScreen())),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    if (reports.isEmpty)
                      const EmptyNote(text: 'No saved reports yet. Tap + to save one: sales by customer this month, expenses by head this quarter, and so on.')
                    else ...[
                      const SectionLabel('Your reports'),
                      Panel(
                        children: [
                          for (final report in reports) ...[
                            RowCard(
                              leading: TintTile(tint: Tint.taxes, mark: _openName == report.name ? Mark.confirm : Mark.sales),
                              title: report.name,
                              subtitle: report.words,
                              trailing: IconButton(
                                tooltip: 'Delete ${report.name}',
                                onPressed: busy || pending != null ? null : () => _delete(report),
                                icon: const Icon(Icons.delete_outline),
                              ),
                              onTap: busy ? null : () => _run(report),
                            ),
                            if (_openName == report.name && _running)
                              const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator())),
                            if (_openName == report.name && _note.isNotEmpty)
                              Padding(padding: const EdgeInsets.all(12), child: Text(_note, style: text.bodyMedium?.copyWith(color: Palette.warn))),
                            if (_openName == report.name && _result != null) ...[
                              _resultPanel(_result!, text),
                              Padding(
                                padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.stretch,
                                  children: [
                                    OutlinedButton(
                                      onPressed: busy ? null : () => _saveExcel(report),
                                      child: const Text('Save as Excel'),
                                    ),
                                    if (_excelNote.isNotEmpty)
                                      Padding(padding: const EdgeInsets.only(top: 8), child: Text(_excelNote, style: text.bodyMedium)),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ],
                      ),
                    ],
                    const SizedBox(height: 12),
                    for (final entry in entries) entry.toBubble(),
                  ],
                ),
              ),
              if (pending != null) ProposalBar(busy: busy, onPost: postPending, onDiscard: discardPending, postLabel: 'Yes'),
            ],
          );
        },
      ),
    );
  }
}

class _ReportDraft {
  const _ReportDraft({required this.name, required this.metric, required this.groupBy, required this.period, required this.compare});

  final String name;
  final String metric;
  final String groupBy;
  final String period;
  final bool compare;
}

class _ReportForm extends StatefulWidget {
  const _ReportForm();

  @override
  State<_ReportForm> createState() => _ReportFormState();
}

class _ReportFormState extends State<_ReportForm> {
  final _name = TextEditingController();
  String _metric = reportMetrics.first;
  String _groupBy = reportGroups.first;
  String _period = reportPeriods.first;
  bool _compare = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Widget _choice(String label, List<String> options, String value, void Function(String) onChanged) => DropdownButtonFormField<String>(
    initialValue: value,
    isExpanded: true,
    decoration: InputDecoration(labelText: label),
    items: [for (final option in options) DropdownMenuItem(value: option, child: Text(option.replaceAll('-', ' '), overflow: TextOverflow.ellipsis))],
    onChanged: (chosen) {
      if (chosen != null) setState(() => onChanged(chosen));
    },
  );

  @override
  Widget build(BuildContext context) {
    final name = _name.text.trim();
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Save a report', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          TextField(
            controller: _name,
            autofocus: true,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(labelText: 'Name'),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),
          _choice('What', reportMetrics, _metric, (v) => _metric = v),
          const SizedBox(height: 12),
          _choice('Grouped by', reportGroups, _groupBy, (v) => _groupBy = v),
          const SizedBox(height: 12),
          _choice('Period', reportPeriods, _period, (v) => _period = v),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _compare,
            onChanged: (v) => setState(() => _compare = v),
            title: const Text('Compare with the period before'),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: name.isEmpty
                ? null
                : () => Navigator.of(context).pop(_ReportDraft(name: name, metric: _metric, groupBy: _groupBy, period: _period, compare: _compare)),
            child: const Text('Preview'),
          ),
        ],
      )),
    );
  }
}
