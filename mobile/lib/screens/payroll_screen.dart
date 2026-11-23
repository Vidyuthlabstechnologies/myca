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
    inFormat(context, 'Approve payroll for {month}', {'month': run.month}),
    'approve_payroll',
    {'period': run.period, 'draftHash': run.draftHash},
  );

  Future<void> _saveFile(PayrollRun run, {required bool pf}) async {
    final state = AppScope.of(context);
    final lang = indiaLang(context);
    setState(() => _fileNote = '');
    var note = '';
    try {
      final data = toolData(
        await state.api.query(pf ? 'pf_ecr' : 'esi_return', {'period': run.period}),
      );
      if (data.isEmpty) {
        note = pf ? inLine(lang, 'No provident fund member in this month.') : inLine(lang, 'No state insurance member in this month.');
      } else {
        final name = data['fileName'] as String;
        final saved = await state.saveTextFile(name, (pf ? data['text'] : data['csv']) as String);
        final missing = (data[pf ? 'missingUan' : 'missingIp'] as List<Object?>? ?? const <Object?>[]).map((e) => '$e').toList();
        note = saved
            ? [
                pf
                    ? inFill(inLine(lang, 'Saved {name}. Upload it on the EPFO portal and pay the challan.'), {'name': name})
                    : inFill(inLine(lang, 'Saved {name}. Upload it on the ESIC portal and pay the challan.'), {'name': name}),
                if (missing.isNotEmpty)
                  pf
                      ? inFill(inLine(lang, 'No UAN for {names}; add it on the employee first.'), {'names': missing.join(', ')})
                      : inFill(inLine(lang, 'No insurance number for {names}; add it on the employee first.'), {'names': missing.join(', ')}),
              ].join(' ')
            : inLine(lang, 'Not saved.');
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() => _fileNote = note);
  }

  Future<void> _savePayout(PayrollRun run) async {
    final state = AppScope.of(context);
    final lang = indiaLang(context);
    setState(() => _fileNote = '');
    var note = '';
    try {
      final data = toolData(await state.api.query('payroll_payout_file', {'period': run.period}));
      if (data.isEmpty) {
        note = inLine(lang, 'Nothing to pay out this month.');
      } else {
        final name = data['fileName'] as String;
        final saved = await state.saveTextFile(name, data['csv'] as String);
        final missing = (data['missingBank'] as List<Object?>? ?? const <Object?>[]).map((e) => '$e').toList();
        final count = (data['employees'] as num? ?? 0).toInt();
        final total = rupees(data['total'] as num? ?? 0);
        note = saved
            ? [
                count == 1
                    ? inFill(inLine(lang, 'Saved {name} with 1 employee, {total}. Upload it on the bank\'s bulk payment page, then record the salary payment here.'), {'name': name, 'total': total})
                    : inFill(inLine(lang, 'Saved {name} with {n} employees, {total}. Upload it on the bank\'s bulk payment page, then record the salary payment here.'), {'n': count, 'name': name, 'total': total}),
                if (missing.isNotEmpty) inFill(inLine(lang, 'No bank account for {names}; add it on the employee first.'), {'names': missing.join(', ')}),
              ].join(' ')
            : inLine(lang, 'Not saved.');
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() => _fileNote = note);
  }

  Future<void> _saveAnnexure(PayrollRun run) async {
    final state = AppScope.of(context);
    final lang = indiaLang(context);
    setState(() => _fileNote = '');
    var note = '';
    try {
      final data = toolData(await state.api.query('salary_annexure'));
      final rows = data['rows'] as List<Object?>? ?? const <Object?>[];
      if (data.isEmpty || rows.isEmpty) {
        note = inLine(lang, 'No approved salary month in this year yet, so Annexure II has no rows.');
      } else {
        final name = data['fileName'] as String;
        final saved = await state.saveTextFile(name, data['csv'] as String);
        note = saved
            ? rows.length == 1
                  ? inFill(inLine(lang, 'Saved {name} with 1 employee. Add each employee\'s declaration (section 10 exemptions, other 80C and 80D) before filing the Q4 statement.'), {'name': name})
                  : inFill(inLine(lang, 'Saved {name} with {n} employees. Add each employee\'s declaration (section 10 exemptions, other 80C and 80D) before filing the Q4 statement.'), {'n': rows.length, 'name': name})
            : inLine(lang, 'Not saved.');
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() => _fileNote = note);
  }

  Future<void> _saveForm16(PayrollRun run) async {
    final state = AppScope.of(context);
    final lang = indiaLang(context);
    setState(() => _fileNote = '');
    var note = '';
    try {
      final data = toolData(await state.api.query('tds_certificates', {'form': 'salary'}));
      final rows = data['certificates'] as List<Object?>? ?? const <Object?>[];
      if (data.isEmpty || rows.isEmpty) {
        note = inLine(lang, 'No Form 16 draft yet: approve a salary month with TDS first, and record the TAN under Taxes.');
      } else {
        final name = data['fileName'] as String;
        final saved = await state.saveTextFile(name, data['csv'] as String);
        note = saved
            ? rows.length == 1
                  ? inFill(inLine(lang, 'Saved {name} with 1 employee. Part A comes from TRACES after the 24Q statements are processed; these are the books\' own figures for checking.'), {'name': name})
                  : inFill(inLine(lang, 'Saved {name} with {n} employees. Part A comes from TRACES after the 24Q statements are processed; these are the books\' own figures for checking.'), {'n': rows.length, 'name': name})
            : inLine(lang, 'Not saved.');
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() => _fileNote = note);
  }

  Future<void> _paid(PayrollRun run) => propose(
    inFormat(context, 'Salaries for {month} paid', {'month': run.month}),
    'record_salary_payment',
    {'period': run.period, 'date': isoDate(AppScope.of(context).now())},
  );

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(inFormat(context, 'Payroll for {month}', {'month': monthLabel(widget.period)}))),
      body: FutureBuilder<PayrollRun?>(
        future: _run,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final run = snap.data;
          if (snap.hasError) return LoadFailed(onRetry: () => setState(() => _run = _load()));
          if (run == null) {
            return EmptyNote(text: inText(context, 'Payroll could not be prepared. Only the owner can run it.'));
          }
          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  children: [
                    Text(
                      run.employees == 0
                          ? inFormat(context, 'No one was employed in {month}.', {'month': monthLabel(run.period)})
                          : inCount(
                              context,
                              run.employees,
                              '1 employee · gross {gross} · net to pay {net}',
                              '{n} employees · gross {gross} · net to pay {net}',
                              {'gross': rupees(run.totals.gross), 'net': rupees(run.totals.net)},
                            ),
                      style: text.titleMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      run.status != 'approved'
                          ? inText(context, 'A draft. Nothing is posted until you approve it.')
                          : run.paidOn.isEmpty
                          ? inFormat(context, 'Approved on {date}. Salaries not yet recorded as paid.', {'date': longDate(run.approvedOn)})
                          : inFormat(context, 'Approved on {date}. Paid on {paid}.', {'date': longDate(run.approvedOn), 'paid': longDate(run.paidOn)}),
                      style: text.bodySmall,
                    ),
                    const SizedBox(height: 16),
                    Panel(
                      children: [
                        for (final row in run.rows)
                          RowCard(
                            leading: TintTile(tint: Tint.ask, letter: row.name[0].toUpperCase()),
                            title: row.name,
                            subtitle: row.daysWorked < row.daysInMonth
                                ? inFormat(context, 'Gross {gross} · deductions {deductions} · net {net} · {worked} of {days} days', {
                                    'gross': rupees(row.gross),
                                    'deductions': rupees(row.deductions),
                                    'net': rupees(row.net),
                                    'worked': row.daysWorked,
                                    'days': row.daysInMonth,
                                  })
                                : inFormat(context, 'Gross {gross} · deductions {deductions} · net {net}', {
                                    'gross': rupees(row.gross),
                                    'deductions': rupees(row.deductions),
                                    'net': rupees(row.net),
                                  }),
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
                            label: Text(inText(context, 'Save PF file')),
                            onPressed: busy ? null : () => _saveFile(run, pf: true),
                          ),
                          ActionChip(
                            label: Text(inText(context, 'Save ESI file')),
                            onPressed: busy ? null : () => _saveFile(run, pf: false),
                          ),
                          ActionChip(
                            label: Text(inText(context, 'Save payout file')),
                            onPressed: busy ? null : () => _savePayout(run),
                          ),
                          ActionChip(
                            label: Text(inText(context, 'Save Annexure II')),
                            onPressed: busy ? null : () => _saveAnnexure(run),
                          ),
                          ActionChip(
                            label: Text(inText(context, 'Save Form 16 drafts')),
                            onPressed: busy ? null : () => _saveForm16(run),
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
                          child: Text(inText(context, 'Approve payroll')),
                        )
                      else if (run.paidOn.isEmpty)
                        FilledButton(
                          onPressed: busy ? null : () => _paid(run),
                          child: Text(inText(context, 'Salaries paid')),
                        ),
                    ],
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
      child: AmountRow(
        start: Padding(padding: const EdgeInsets.only(right: 12), child: Text(label, style: strong ? text.titleMedium : text.bodyMedium)),
        amount: rupees(amount),
        style: (strong ? text.titleMedium : text.bodyMedium)?.copyWith(fontFeatures: moneyFigures),
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
          line(totals.hasOwnLines ? inText(context, 'Gross wages') : inText(context, 'Gross salaries'), totals.gross),
          if (totals.hasOwnLines)
            for (final (name, amount) in totals.lines) line(name, amount)
          else ...[
            line(inText(context, 'Provident fund (employees)'), totals.pfEmployee),
            line(inText(context, 'State insurance (employees)'), totals.esiEmployee),
            line(inText(context, 'Professional tax'), totals.pt),
            line(inText(context, 'Income tax (TDS)'), totals.tds),
          ],
          line(inText(context, 'Net to pay'), totals.net, strong: true),
          const Divider(height: 18),
          if (totals.hasOwnLines)
            for (final (name, amount) in totals.employerLines) line(name, amount)
          else
            line(inText(context, 'Employer contributions'), totals.employerContributions),
          line(inText(context, 'Total cost'), totals.employerCost, strong: true),
        ],
      ),
    );
  }
}
