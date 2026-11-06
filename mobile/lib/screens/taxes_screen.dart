import 'dart:convert';

import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../attention.dart';
import '../excel.dart';
import '../format.dart';
import '../marks.dart';
import '../theme.dart';
import '../widgets.dart';
import 'ca_screen.dart';
import 'credit_card.dart';
import 'filing_screen.dart';
import 'gst_payment_screen.dart';
import 'year_close_screen.dart';
import 'tds_credit_screen.dart';
import 'tds_screen.dart';
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
  Future<List<FiledReturn>>? _filed;
  Future<TdsSummary?>? _tds;
  Future<RulesStatus?>? _rules;
  String? _period;
  String _gstin = '';
  Future<List<Map<String, dynamic>>>? _registrations;
  String _fileNote = '';
  bool _saving = false;
  String _entriesNote = '';
  String _tdsNote = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _today ??= loadToday(AppScope.of(context).api);
    _registrations ??= _loadRegistrations();
    _filed ??= _loadFiled();
    _tds ??= _loadTds();
    _rules ??= _loadRules();
  }

  Future<List<Map<String, dynamic>>> _loadRegistrations() async {
    try {
      final data = toolData(await AppScope.of(context).api.query('registrations'));
      final rows = [for (final row in (data['registrations'] as List? ?? const [])) if (row is Map) Map<String, dynamic>.from(row)];
      return rows.where((row) => '${row['effectiveTo'] ?? ''}'.isEmpty && '${row['gstin'] ?? ''}'.isNotEmpty).toList();
    } on MycaApiException {
      return const [];
    }
  }

  Map<String, Object?> get _regArgs => _gstin.isEmpty ? const {} : {'gstin': _gstin};

  Future<RulesStatus?> _loadRules() async {
    try {
      return RulesStatus.fromTool(await AppScope.of(context).api.query('rules_status'));
    } on MycaApiException {
      return null;
    }
  }

  Future<TdsSummary?> _loadTds() async {
    try {
      return TdsSummary.fromTool(
        await AppScope.of(context).api.query('tds_summary'),
      );
    } on MycaApiException {
      return null;
    }
  }

  Future<void> _openTdsReview(TdsQuarter quarter) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ReviewScreen(
          period: quarter.quarter,
          tool: 'tds_review',
          answerTool: 'tds_review_answer',
          title: quarter.kind == 'salary' ? 'Review the salary TDS statement' : 'Review the TDS statement',
          extraArgs: quarter.kind == 'salary' ? const {'form': 'salary'} : const {},
        ),
      ),
    );
    if (!mounted) return;
    setState(() {
      _tds = _loadTds();
    });
  }

  Future<void> _openTds(TdsSummary summary) async {
    final state = AppScope.of(context);
    final done = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => TdsActionScreen(summary: summary)),
    );
    if (done != true || !mounted) return;
    setState(() {
      _tds = _loadTds();
    });
    await state.refresh();
    await _reload();
  }

  Future<void> _recordGstPayment(PeriodGst gst) async {
    final state = AppScope.of(context);
    num toPay = 0;
    try {
      final payable = toolData(await state.api.query('gst_payable', {'period': gst.period, ..._regArgs}));
      final heads = payable['toPay'];
      if (heads is Map && heads['total'] is num) toPay = heads['total'] as num;
      if (payable['paid'] is Map) {
        setState(() => _entriesNote = 'The GST payment for ${monthLabel(gst.period)} is already recorded.');
        return;
      }
    } on MycaApiException catch (err) {
      setState(() => _entriesNote = err.message);
      return;
    }
    if (!mounted) return;
    final done = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => GstPaymentScreen(period: gst.period, toPay: toPay, gstin: _gstin)),
    );
    if (done != true || !mounted) return;
    await state.refresh();
    await _reload();
  }

  Future<void> _saveQuarterly({required bool iff}) async {
    final state = AppScope.of(context);
    setState(() => _entriesNote = '');
    var note = '';
    try {
      final period = _period ?? '';
      final month = period.isEmpty ? '' : period.substring(5, 7);
      final quarter = period.isEmpty ? '' : 'Q${((int.parse(month) + 8) % 12) ~/ 3 + 1} ${_fyOf(period)}';
      final data = toolData(await state.api.query(iff ? 'export_iff' : 'export_gstr1_quarter', iff ? {'period': period, ..._regArgs} : {'quarter': quarter, ..._regArgs}));
      if (data.isEmpty) {
        note = iff ? 'The IFF file could not be prepared for this month.' : 'The quarterly file could not be prepared.';
      } else {
        final name = data['fileName'] as String;
        final saved = await state.saveTextFile(name, const JsonEncoder.withIndent('  ').convert(data));
        note = saved ? 'Saved $name. ${data['note'] ?? ''}' : 'Not saved.';
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() => _entriesNote = note);
  }

  String _fyOf(String period) {
    final y = int.parse(period.substring(0, 4));
    final m = int.parse(period.substring(5, 7));
    final start = m >= 4 ? y : y - 1;
    return '$start-${((start + 1) % 100).toString().padLeft(2, '0')}';
  }

  Future<void> _closeYear() async {
    final state = AppScope.of(context);
    final done = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const YearCloseScreen()));
    if (done != true || !mounted) return;
    await state.refresh();
    await _reload();
  }

  Future<void> _saveGstr9() async {
    final state = AppScope.of(context);
    setState(() => _entriesNote = '');
    var note = '';
    try {
      final data = toolData(await state.api.query('gstr9_draft'));
      if (data.isEmpty) {
        note = 'The GSTR-9 draft could not be prepared.';
      } else {
        final name = 'GSTR9_draft_${data['gstin'] ?? ''}_${data['fy'] ?? ''}.json';
        final saved = await state.saveTextFile(name, const JsonEncoder.withIndent('  ').convert(data));
        note = saved ? 'Saved $name: the annual return tables from the months so far, for your CA to complete and file.' : 'Not saved.';
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() => _entriesNote = note);
  }

  Future<void> _saveFilingPack(String period) async {
    final state = AppScope.of(context);
    setState(() => _entriesNote = '');
    var note = '';
    try {
      final results = await Future.wait([
        state.api.query('gst_period_summary', {'period': period, ..._regArgs}),
        state.api.query('export_gstr1_json', {'fp': '${period.substring(5, 7)}${period.substring(0, 4)}', ..._regArgs}),
        state.api.query('gst_payable', {'period': period, ..._regArgs}),
        state.api.query('export_trial_balance'),
      ]);
      final summary = toolData(results[0]);
      final gstr1 = toolData(results[1]);
      final payable = toolData(results[2]);
      final trialBalance = toolData(results[3]);
      if (summary.isEmpty) {
        note = 'The filing pack could not be prepared.';
      } else {
        final data = <String, Object?>{
          'gstin': gstr1['gstin'] ?? '',
          'period': period,
          'summary': summary,
          'gstr1': gstr1,
          'payable': payable,
          'trialBalance': trialBalance,
          'caveat': 'Prepared on the phone from the books. A practising CA must review and file on GSTN; MyCA files nothing.',
        };
        final name = 'filing_pack_${data['gstin']}_$period.json';
        final saved = await state.saveTextFile(name, const JsonEncoder.withIndent('  ').convert(data));
        note = saved
            ? 'Saved $name: GSTR-1, GSTR-3B, the amount to pay and the trial balance in one file for your CA to file on GSTN.'
            : 'Not saved.';
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() => _entriesNote = note);
  }

  Future<void> _saveForm16A(TdsQuarter quarter) async {
    final state = AppScope.of(context);
    setState(() => _tdsNote = '');
    var note = '';
    try {
      final data = toolData(await state.api.query('tds_certificates', {'quarter': quarter.quarter}));
      final rows = data['certificates'] as List<Object?>? ?? const <Object?>[];
      if (data.isEmpty || rows.isEmpty) {
        note = 'No Form 16A draft for ${quarter.quarter}: nothing was deducted in it.';
      } else {
        final name = data['fileName'] as String;
        final saved = await state.saveTextFile(name, data['csv'] as String);
        note = saved
            ? 'Saved $name with ${rows.length == 1 ? '1 deductee' : '${rows.length} deductees'}. The certificates themselves are generated on TRACES once the statement is processed.'
            : 'Not saved.';
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() => _tdsNote = note);
  }

  Future<List<FiledReturn>> _loadFiled() async {
    try {
      return filedReturnsFrom(
        await AppScope.of(context).api.query('list_filings'),
      );
    } on MycaApiException {
      return const [];
    }
  }

  Future<void> _recordFiling(List<Deadline> deadlines) async {
    final open = deadlines
        .where(
          (d) =>
              !d.filed &&
              d.returnType.isNotEmpty &&
              d.returnType != 'TDS_DEPOSIT' &&
              d.daysUntil <= 31,
        )
        .toList();
    final done = await Navigator.of(context).push<bool>(
      MaterialPageRoute(builder: (_) => RecordFilingScreen(returns: open, gstin: _gstin)),
    );
    if (done != true || !mounted) return;
    setState(() {
      _filed = _loadFiled();
    });
    await _reload();
  }

  Future<void> _reload({String? period, String? gstin}) async {
    final next = loadToday(AppScope.of(context).api, period: period ?? _period, gstin: gstin ?? _gstin);
    setState(() {
      _period = period ?? _period;
      _gstin = gstin ?? _gstin;
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

  Future<void> _saveEntries(String period, {bool tally = false, bool trialBalance = false}) async {
    final state = AppScope.of(context);
    setState(() => _entriesNote = '');
    var note = '';
    try {
      final data = toolData(
        trialBalance
            ? await state.api.query('export_trial_balance')
            : await state.api.query(tally ? 'export_tally' : 'export_entries', {'period': period}),
      );
      if (data.isEmpty) {
        note = trialBalance ? 'The trial balance could not be prepared.' : 'The entries could not be prepared.';
      } else {
        final name = data['fileName'] as String;
        final count = (trialBalance ? data['accounts'] : data['count']) as num;
        final saved = await state.saveTextFile(name, data[tally ? 'xml' : 'csv'] as String);
        note = saved
            ? trialBalance
                  ? 'Saved $name with ${count == 1 ? '1 account' : '$count accounts'}${data['balanced'] == false ? ' (it does not tie; ask your CA to look)' : ''}. Send it to your CA.'
                  : tally
                  ? 'Saved $name with ${count == 1 ? '1 voucher' : '$count vouchers'}. Import it in Tally (Import Data) or send it to your CA.'
                  : 'Saved $name with ${count == 1 ? '1 entry' : '$count entries'}. Send it to your CA.'
            : 'Not saved.';
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() => _entriesNote = note);
  }

  Future<void> _saveExcel(String report, [Map<String, Object?> args = const {}]) async {
    final state = AppScope.of(context);
    setState(() => _entriesNote = '');
    var note = '';
    try {
      note = await saveXlsx(state, toolData(await state.api.query('export_xlsx', {'report': report, ...args})));
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
                  FutureBuilder<List<Map<String, dynamic>>>(
                    future: _registrations,
                    builder: (context, regs) {
                      final rows = regs.data ?? const <Map<String, dynamic>>[];
                      if (rows.length < 2) return const SizedBox.shrink();
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final reg in rows)
                              ChoiceChip(
                                label: Text('${reg['label']}'),
                                selected: (reg['kind'] == 'principal' && _gstin.isEmpty) || '${reg['gstin']}' == _gstin,
                                selectedColor: Palette.sunken,
                                showCheckmark: false,
                                onSelected: (_) => _reload(gstin: reg['kind'] == 'principal' ? '' : '${reg['gstin']}'),
                              ),
                          ],
                        ),
                      );
                    },
                  ),
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
                                    ReviewScreen(period: gst.period, extraArgs: _regArgs),
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
                      onPressed: () => _recordGstPayment(gst),
                      child: const Text('Record the GST payment'),
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
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => _saveExcel('entries', {'period': gst.period}),
                      child: const Text('Save entries as Excel'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: _saveGstr9,
                      child: const Text('Save the GSTR-9 draft'),
                    ),
                  ),
                  if (AppScope.of(context).snapshot?.company.quarterlyGst ?? false) ...[
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: () => _saveQuarterly(iff: false),
                        child: const Text('Save the quarterly GSTR-1'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: () => _saveQuarterly(iff: true),
                        child: const Text('Save the IFF for this month'),
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: _closeYear,
                      child: const Text('Close the year'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => _saveEntries(gst.period, tally: true),
                      child: const Text('Save a Tally file'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => _saveFilingPack(gst.period),
                      child: const Text('Save the filing pack for your CA'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => _saveEntries(gst.period, trialBalance: true),
                      child: const Text('Save the trial balance'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => _saveExcel('trial_balance'),
                      child: const Text('Save as Excel'),
                    ),
                  ),
                  if (_entriesNote.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        _entriesNote,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    )
                  else
                    const SizedBox.shrink(),
                ],
                FutureBuilder<TdsSummary?>(
                  future: _tds,
                  builder: (context, snap) {
                    final tds = snap.data;
                    if (tds == null) return const SizedBox.shrink();
                    return Padding(
                      padding: const EdgeInsets.only(top: 26),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const SectionLabel('TDS'),
                          Panel(
                            children: [
                              if (!tds.deductor)
                                RowCard(
                                  leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
                                  title: 'Deduct TDS on bills',
                                  subtitle: 'Add your TAN if you deduct TDS on contractors, fees or rent',
                                  trailing: const Chevron(),
                                  onTap: () => _openTds(tds),
                                )
                              else ...[
                                for (final month in tds.months.reversed.take(3))
                                  RowCard(
                                    leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
                                    title: '${rupees(month.deducted)} deducted in ${monthLabel(month.month)}',
                                    subtitle: month.depositBy.isEmpty ? '' : 'Deposit by ${longDate(month.depositBy)}',
                                  ),
                                RowCard(
                                  leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
                                  title: tds.due > 0 ? '${rupees(tds.due)} still to deposit' : 'Nothing left to deposit',
                                  subtitle: tds.due > 0
                                      ? 'Record a challan once you have paid it'
                                      : 'Deducted ${rupees(tds.deducted)}, deposited ${rupees(tds.deposited)}',
                                  trailing: tds.due > 0 ? const Chevron() : null,
                                  onTap: tds.due > 0 ? () => _openTds(tds) : null,
                                ),
                                for (final quarter in tds.quarters.reversed.take(4))
                                  RowCard(
                                    leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
                                    title: '${quarter.kind == 'salary' ? 'Salary TDS statement' : 'TDS statement'} for ${quarter.quarter}',
                                    subtitle: quarter.filedArn.isNotEmpty
                                        ? 'Filed, ARN ${quarter.filedArn}'
                                        : quarter.approved
                                            ? 'Approved · ${rupees(quarter.deducted)} deducted${quarter.shortfall > 0 ? ', ${rupees(quarter.shortfall)} still to deposit' : ''}'
                                            : '${rupees(quarter.deducted)} deducted${quarter.dueDate.isEmpty ? '' : ' · due by ${longDate(quarter.dueDate)}'} · review it',
                                    trailing: const Chevron(),
                                    onTap: () => _openTdsReview(quarter),
                                  ),
                                if (tds.quarters.any((q) => q.kind != 'salary'))
                                  RowCard(
                                    leading: const TintTile(tint: Tint.taxes, mark: Mark.comingUp),
                                    title: 'Form 16A drafts',
                                    subtitle: 'One per deductee for ${tds.quarters.lastWhere((q) => q.kind != 'salary').quarter}, for checking before TRACES issues them',
                                    trailing: const Chevron(),
                                    onTap: () => _saveForm16A(tds.quarters.lastWhere((q) => q.kind != 'salary')),
                                  ),
                              ],
                              RowCard(
                                leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
                                title: 'Form 26AS check',
                                subtitle: 'TDS your customers deducted, compared with 26AS',
                                trailing: const Chevron(),
                                onTap: () => Navigator.of(context).push(
                                  MaterialPageRoute<void>(builder: (_) => const TdsCreditScreen()),
                                ),
                              ),
                            ],
                          ),
                          if (_tdsNote.isNotEmpty && tds.deductor)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(_tdsNote, style: Theme.of(context).textTheme.bodyMedium),
                            ),
                        ],
                      ),
                    );
                  },
                ),
                const SizedBox(height: 26),
                const SectionLabel('Filed'),
                FutureBuilder<List<FiledReturn>>(
                  future: _filed,
                  builder: (context, snap) {
                    final filed = snap.data ?? const <FiledReturn>[];
                    return Panel(
                      children: [
                        for (final item in filed.take(4))
                          RowCard(
                            leading: const TintTile(
                              tint: Tint.ask,
                              mark: Mark.comingUp,
                            ),
                            title: '${item.label} for ${monthLabel(item.period)}',
                            subtitle:
                                'Filed ${longDate(item.filedOn)}${item.late ? ', after the due date' : ''} · ARN ${item.arn}',
                          ),
                        RowCard(
                          leading: const TintTile(
                            tint: Tint.ask,
                            mark: Mark.comingUp,
                          ),
                          title: 'Record a filing',
                          subtitle: filed.isEmpty
                              ? 'Filed a return on the portal or through your CA? Keep its ARN here.'
                              : 'Add another return with its ARN',
                          trailing: const Chevron(),
                          onTap: () => _recordFiling(today.deadlines),
                        ),
                      ],
                    );
                  },
                ),
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
                          title: '${deadline.label} for ${monthLabel(deadline.period)}',
                          subtitle:
                              '${dueLabel(deadline.daysUntil)}, ${longDate(deadline.dueDate)}',
                        ),
                    ],
                  ),
                ],
                if (_rules != null) RulesStatusNote(status: _rules!),
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
        const SizedBox(height: 14),
        const Divider(),
        const SizedBox(height: 10),
        if (gst.payment case final pay?) ...[
          _HeadsRow(label: 'To pay in cash', heads: pay.cash),
          const SizedBox(height: 6),
          Text(
            pay.broughtForwardKnown
                ? 'Credit brought forward ${rupees(pay.broughtForward.total)} · credit used ${rupees(pay.creditUsed)}'
                : 'Credit used ${rupees(pay.creditUsed)}',
            style: text.bodySmall?.copyWith(fontFeatures: moneyFigures),
          ),
          if (pay.carried.total > 0)
            Text(
              'Credit carried forward ${rupees(pay.carried.total)}',
              style: text.bodySmall?.copyWith(fontFeatures: moneyFigures),
            ),
          if (pay.filedArn.isNotEmpty)
            Text('Filed, ARN ${pay.filedArn}.', style: text.bodySmall)
          else if (pay.late case final late?)
            Text(
              'If paid today, ${late.days} ${late.days == 1 ? 'day' : 'days'} late: interest ${rupees(late.interest)} and late fee ${rupees(late.lateFee)}, ${rupees(late.total)} in all.',
              style: text.bodyMedium?.copyWith(fontFeatures: moneyFigures),
            )
          else if (pay.dueDate.isNotEmpty)
            Text('Due by ${longDate(pay.dueDate)}.', style: text.bodyMedium),
          const SizedBox(height: 8),
          Text(pay.notes.join(' '), style: text.bodySmall),
        ] else
          Text(
            'The amount to pay could not be worked out for this month.',
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
