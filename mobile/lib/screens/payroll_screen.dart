import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../proposal_flow.dart';
import '../theme.dart';
import '../widgets.dart';

class PayrollScreen extends StatefulWidget {
  const PayrollScreen({super.key, required this.period});

  final String period;

  @override
  State<PayrollScreen> createState() => _PayrollScreenState();
}

class _PayrollScreenState extends State<PayrollScreen> with ProposalFlow {
  Future<PayrollRun?>? _run;
  bool _posted = false;
  String _fileNote = '';

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _run ??= _load();
  }

  Future<PayrollRun?> _load() async => PayrollRun.fromTool(
    await AppScope.of(context).api.query('payroll_run', {'period': widget.period}),
  );

  @override
  Future<void> onPosted() async {
    HapticFeedback.mediumImpact();
    setState(() {
      _posted = true;
      _run = _load();
    });
  }

  Future<void> _approve(PayrollRun run) => propose(
    'Approve payroll for ${run.month}',
    'approve_payroll',
    {'period': run.period, 'draftHash': run.draftHash},
  );

  Future<void> _saveFile(PayrollRun run, {required bool pf}) async {
    final state = AppScope.of(context);
    setState(() => _fileNote = '');
    var note = '';
    try {
      final data = toolData(
        await state.api.query(pf ? 'pf_ecr' : 'esi_return', {'period': run.period}),
      );
      if (data.isEmpty) {
        note = pf ? 'No provident fund member in this month.' : 'No state insurance member in this month.';
      } else {
        final name = data['fileName'] as String;
        final saved = await state.saveTextFile(name, (pf ? data['text'] : data['csv']) as String);
        final missing = (data[pf ? 'missingUan' : 'missingIp'] as List<Object?>? ?? const <Object?>[]).map((e) => '$e').toList();
        note = saved
            ? 'Saved $name. Upload it on the ${pf ? 'EPFO' : 'ESIC'} portal and pay the challan.${missing.isEmpty ? '' : ' No ${pf ? 'UAN' : 'insurance number'} for ${missing.join(', ')}; add it on the employee first.'}'
            : 'Not saved.';
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() => _fileNote = note);
  }

  Future<void> _saveAnnexure(PayrollRun run) async {
    final state = AppScope.of(context);
    setState(() => _fileNote = '');
    var note = '';
    try {
      final data = toolData(await state.api.query('salary_annexure'));
      final rows = data['rows'] as List<Object?>? ?? const <Object?>[];
      if (data.isEmpty || rows.isEmpty) {
        note = 'No approved salary month in this year yet, so Annexure II has no rows.';
      } else {
        final name = data['fileName'] as String;
        final saved = await state.saveTextFile(name, data['csv'] as String);
        note = saved
            ? 'Saved $name with ${rows.length == 1 ? '1 employee' : '${rows.length} employees'}. Add each employee\'s declaration (section 10 exemptions, other 80C and 80D) before filing the Q4 statement.'
            : 'Not saved.';
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() => _fileNote = note);
  }

  Future<void> _paid(PayrollRun run) => propose(
    'Salaries for ${run.month} paid',
    'record_salary_payment',
    {'period': run.period, 'date': isoDate(AppScope.of(context).now())},
  );

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text('Payroll for ${monthLabel(widget.period)}')),
      body: FutureBuilder<PayrollRun?>(
        future: _run,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final run = snap.data;
          if (run == null) {
            return const EmptyNote(text: 'Payroll could not be prepared. Only the owner can run it.');
          }
          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  children: [
                    Text(
                      run.employees == 0
                          ? 'No one was employed in ${monthLabel(run.period)}.'
                          : '${run.employees == 1 ? '1 employee' : '${run.employees} employees'} · gross ${rupees(run.totals.gross)} · net to pay ${rupees(run.totals.net)}',
                      style: text.titleMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      run.status == 'approved'
                          ? 'Approved on ${longDate(run.approvedOn)}.${run.paidOn.isEmpty ? ' Salaries not yet recorded as paid.' : ' Paid on ${longDate(run.paidOn)}.'}'
                          : 'A draft. Nothing is posted until you approve it.',
                      style: text.bodySmall,
                    ),
                    const SizedBox(height: 16),
                    Panel(
                      children: [
                        for (final row in run.rows)
                          RowCard(
                            leading: TintTile(tint: Tint.ask, letter: row.name[0].toUpperCase()),
                            title: row.name,
                            subtitle:
                                'Gross ${rupees(row.gross)} · deductions ${rupees(row.deductions)} · net ${rupees(row.net)}${row.daysWorked < row.daysInMonth ? ' · ${row.daysWorked} of ${row.daysInMonth} days' : ''}',
                          ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    _Totals(totals: run.totals),
                    for (final note in run.notes) ...[
                      const SizedBox(height: 8),
                      Text(note, style: text.bodySmall),
                    ],
                    if (run.status == 'approved' && !run.isUs) ...[
                      const SizedBox(height: 16),
                      Wrap(
                        spacing: 8,
                        children: [
                          ActionChip(
                            label: const Text('Save PF file'),
                            onPressed: busy ? null : () => _saveFile(run, pf: true),
                          ),
                          ActionChip(
                            label: const Text('Save ESI file'),
                            onPressed: busy ? null : () => _saveFile(run, pf: false),
                          ),
                          ActionChip(
                            label: const Text('Save Annexure II'),
                            onPressed: busy ? null : () => _saveAnnexure(run),
                          ),
                        ],
                      ),
                      if (_fileNote.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(_fileNote, style: text.bodyMedium),
                      ],
                    ],
                    for (final entry in entries) entry.toBubble(),
                    if (pending == null && !_posted && run.employees > 0) ...[
                      const SizedBox(height: 16),
                      if (run.status != 'approved')
                        FilledButton(
                          onPressed: busy ? null : () => _approve(run),
                          child: const Text('Approve payroll'),
                        )
                      else if (run.paidOn.isEmpty)
                        FilledButton(
                          onPressed: busy ? null : () => _paid(run),
                          child: const Text('Salaries paid'),
                        ),
                    ],
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
                ProposalBar(busy: busy, onPost: postPending, onDiscard: discardPending),
            ],
          );
        },
      ),
    );
  }
}

class _Totals extends StatelessWidget {
  const _Totals({required this.totals});

  final PayrollTotals totals;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    Widget line(String label, num amount, {bool strong = false}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(child: Text(label, style: strong ? text.titleMedium : text.bodyMedium)),
          Text(rupees(amount), style: (strong ? text.titleMedium : text.bodyMedium)?.copyWith(fontFeatures: moneyFigures)),
        ],
      ),
    );
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Palette.surface,
        borderRadius: BorderRadius.circular(radiusCard),
        border: Border.all(color: Palette.line),
      ),
      child: Column(
        children: [
          line(totals.hasOwnLines ? 'Gross wages' : 'Gross salaries', totals.gross),
          if (totals.hasOwnLines)
            for (final (name, amount) in totals.lines) line(name, amount)
          else ...[
            line('Provident fund (employees)', totals.pfEmployee),
            line('State insurance (employees)', totals.esiEmployee),
            line('Professional tax', totals.pt),
            line('Income tax (TDS)', totals.tds),
          ],
          line('Net to pay', totals.net, strong: true),
          const Divider(height: 18),
          if (totals.hasOwnLines)
            for (final (name, amount) in totals.employerLines) line(name, amount)
          else
            line('Employer contributions', totals.employerContributions),
          line('Total cost', totals.employerCost, strong: true),
        ],
      ),
    );
  }
}
