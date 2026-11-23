import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../excel.dart';
import '../format.dart';
import '../marks.dart';
import '../proposal_flow.dart';
import '../theme.dart';
import '../uae/uae_edition.dart';
import '../uae/uae_strings.dart';
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

  Future<List<SavedReport>> _load() async => savedReportsFrom(loaded(await api.query('list_reports')));

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
    final failed = UaeStrings.of(context).reportFailed;
    try {
      result = ReportResult.fromTool(await api.query('run_report', {'name': report.name}));
      if (result == null) note = failed;
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

  Future<void> _delete(SavedReport report) => propose(UaeStrings.of(context).deleteReportSaid(report.name), 'delete_report', {'name': report.name});

  Future<void> _saveExcel(SavedReport report) async {
    final state = AppScope.of(context);
    final aeStrings = uaeEdition(context) ? UaeStrings.of(context) : null;
    setState(() => _excelNote = '');
    var note = '';
    try {
      note = await saveXlsx(state, toolData(await state.api.query('export_xlsx', {'report': 'saved_report', 'name': report.name})), aeStrings);
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
    await propose(UaeStrings.of(context).saveReportSaid(draft.name), 'save_report', {
      'name': draft.name,
      'metric': draft.metric,
      'groupBy': draft.groupBy,
      'period': draft.period,
      'compare': draft.compare,
    });
  }

  Widget _resultPanel(ReportResult result, TextTheme text) {
    final s = UaeStrings.of(context);
    final comparison = s.reportComparison(result);
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
            subtitle: row.before == null ? '' : s.wasAmount(rupees(row.before!)),
          ),
        if (result.more > 0)
          RowCard(
            leading: const TintTile(tint: Tint.taxes, mark: Mark.comingUp),
            title: s.moreRows(result.more),
            subtitle: s.excelForFullList,
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final s = UaeStrings.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(s.reports),
        actions: [
          IconButton(
            tooltip: s.saveAReport,
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
                    SectionLabel(s.builtIn),
                    Panel(
                      children: [
                        RowCard(
                          key: const ValueKey('reports.audit'),
                          leading: const TintTile(tint: Tint.taxes, mark: Mark.paper),
                          title: s.auditTrail,
                          subtitle: s.auditTrailSubtitle,
                          trailing: const Chevron(),
                          onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AuditTrailScreen())),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    if (snap.hasError)
                      LoadFailed(onRetry: () => setState(() => _reports = _load()))
                    else if (reports.isEmpty)
                      EmptyNote(text: s.noSavedReports)
                    else ...[
                      SectionLabel(s.yourReports),
                      Panel(
                        children: [
                          for (final report in reports) ...[
                            RowCard(
                              leading: TintTile(tint: Tint.taxes, mark: _openName == report.name ? Mark.confirm : Mark.sales),
                              title: report.name,
                              subtitle: s.reportWords(report),
                              trailing: IconButton(
                                tooltip: s.deleteNamed(report.name),
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
                                      child: Text(s.saveAsExcel),
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
              if (pending != null) ProposalBar(busy: busy, onPost: postPending, onDiscard: discardPending, postLabel: s.yes),
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
    items: [for (final option in options) DropdownMenuItem(value: option, child: Text(UaeStrings.of(context).reportOption(option), overflow: TextOverflow.ellipsis))],
    onChanged: (chosen) {
      if (chosen != null) setState(() => onChanged(chosen));
    },
  );

  @override
  Widget build(BuildContext context) {
    final name = _name.text.trim();
    final s = UaeStrings.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(s.saveAReport, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          TextField(
            controller: _name,
            autofocus: true,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(labelText: s.name),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),
          _choice(s.what, reportMetrics, _metric, (v) => _metric = v),
          const SizedBox(height: 12),
          _choice(s.groupedBy, reportGroups, _groupBy, (v) => _groupBy = v),
          const SizedBox(height: 12),
          _choice(s.period, reportPeriods, _period, (v) => _period = v),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _compare,
            onChanged: (v) => setState(() => _compare = v),
            title: Text(s.compareBefore),
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: name.isEmpty
                ? null
                : () => Navigator.of(context).pop(_ReportDraft(name: name, metric: _metric, groupBy: _groupBy, period: _period, compare: _compare)),
            child: Text(s.preview),
          ),
        ],
      )),
    );
  }
}
