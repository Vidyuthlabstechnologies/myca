import 'dart:convert';

import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../attention.dart';
import '../excel.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../marks.dart';
import '../theme.dart';
import '../widgets.dart';
import 'ca_screen.dart';
import 'credit_card.dart';
import 'filing_screen.dart';
import 'gst_payment_screen.dart';
import 'gst_portal_screen.dart';
import 'year_close_screen.dart';
import 'quicko_screen.dart';
import 'tds_credit_screen.dart';
import 'tds_screen.dart';
import 'review_screen.dart';
import '../widgets/glass.dart';

const _heldReasons = {
  'INVALID_GSTIN': 'the buyer GSTIN is not valid',
  'INVALID_RATE': 'the GST rate is not one in force on that date',
  'MISSING_PLACE_OF_SUPPLY': 'the place of supply is missing',
};

String heldReason(String code) =>
    _heldReasons[code] ?? code.toLowerCase().replaceAll('_', ' ');

String _heldLine(BuildContext context, String number, String code) => switch (code) {
  'INVALID_GSTIN' => inFormat(context, '{number} is left out: the buyer GSTIN is not valid.', {'number': number}),
  'INVALID_RATE' => inFormat(context, '{number} is left out: the GST rate is not one in force on that date.', {'number': number}),
  'MISSING_PLACE_OF_SUPPLY' => inFormat(context, '{number} is left out: the place of supply is missing.', {'number': number}),
  _ => inFormat(context, '{number} is left out: {reason}.', {'number': number, 'reason': heldReason(code)}),
};

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

  bool get _portalAllowed {
    final state = AppScope.of(context);
    final cloud = state.cloud;
    final role = state.snapshot?.activeUser?.role;
    return cloud != null && cloud.signedIn && (role == 'owner' || role == 'accountant');
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
          title: quarter.kind == 'salary' ? inText(context, 'Review the salary TDS statement') : inText(context, 'Review the TDS statement'),
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
    final lang = indiaLang(context);
    num toPay = 0;
    try {
      final payable = toolData(await state.api.query('gst_payable', {'period': gst.period, ..._regArgs}));
      final heads = payable['toPay'];
      if (heads is Map && heads['total'] is num) toPay = heads['total'] as num;
      if (payable['paid'] is Map) {
        setState(() => _entriesNote = inFill(inLine(lang, 'The GST payment for {month} is already recorded.'), {'month': monthLabel(gst.period)}));
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

  Future<void> _saveQuarterly({required bool iff, required String shown}) async {
    final state = AppScope.of(context);
    final lang = indiaLang(context);
    setState(() => _entriesNote = '');
    var note = '';
    try {
      final period = _period ?? shown;
      final month = period.isEmpty ? '' : period.substring(5, 7);
      final quarter = period.isEmpty ? '' : 'Q${((int.parse(month) + 8) % 12) ~/ 3 + 1} ${_fyOf(period)}';
      final data = toolData(await state.api.query(iff ? 'export_iff' : 'export_gstr1_quarter', iff ? {'period': period, ..._regArgs} : {'quarter': quarter, ..._regArgs}));
      if (data.isEmpty) {
        note = iff ? inLine(lang, 'The IFF file could not be prepared for this month.') : inLine(lang, 'The quarterly file could not be prepared.');
      } else {
        final name = data['fileName'] as String;
        final saved = await state.saveTextFile(name, const JsonEncoder.withIndent('  ').convert(data));
        note = saved ? inFill(inLine(lang, 'Saved {name}. {note}'), {'name': name, 'note': data['note'] ?? ''}) : inLine(lang, 'Not saved.');
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
    final lang = indiaLang(context);
    setState(() => _entriesNote = '');
    var note = '';
    try {
      final data = toolData(await state.api.query('gstr9_draft'));
      if (data.isEmpty) {
        note = inLine(lang, 'The GSTR-9 draft could not be prepared.');
      } else {
        final name = 'GSTR9_draft_${data['gstin'] ?? ''}_${data['fy'] ?? ''}.json';
        final saved = await state.saveTextFile(name, const JsonEncoder.withIndent('  ').convert(data));
        note = saved ? inFill(inLine(lang, 'Saved {name}: the annual return tables from the months so far, for your CA to complete and file.'), {'name': name}) : inLine(lang, 'Not saved.');
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() => _entriesNote = note);
  }

  Future<void> _saveFilingPack(String period) async {
    final state = AppScope.of(context);
    final lang = indiaLang(context);
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
        note = inLine(lang, 'The filing pack could not be prepared.');
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
            ? inFill(inLine(lang, 'Saved {name}: GSTR-1, GSTR-3B, the amount to pay and the trial balance in one file for your CA to file on GSTN.'), {'name': name})
            : inLine(lang, 'Not saved.');
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() => _entriesNote = note);
  }

  Future<void> _saveForm16A(TdsQuarter quarter) async {
    final state = AppScope.of(context);
    final lang = indiaLang(context);
    setState(() => _tdsNote = '');
    var note = '';
    try {
      final data = toolData(await state.api.query('tds_certificates', {'quarter': quarter.quarter}));
      final rows = data['certificates'] as List<Object?>? ?? const <Object?>[];
      if (data.isEmpty || rows.isEmpty) {
        note = inFill(inLine(lang, 'No Form 16A draft for {quarter}: nothing was deducted in it.'), {'quarter': quarter.quarter});
      } else {
        final name = data['fileName'] as String;
        final saved = await state.saveTextFile(name, data['csv'] as String);
        note = !saved
            ? inLine(lang, 'Not saved.')
            : rows.length == 1
            ? inFill(inLine(lang, 'Saved {name} with 1 deductee. The certificates themselves are generated on TRACES once the statement is processed.'), {'name': name})
            : inFill(inLine(lang, 'Saved {name} with {n} deductees. The certificates themselves are generated on TRACES once the statement is processed.'), {'name': name, 'n': rows.length});
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
    final lang = indiaLang(context);
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
        note = inLine(lang, 'The file could not be prepared.');
      } else {
        final name = 'GSTR1_${data['gstin'] ?? ''}_${gst.gstr1.fp}.json';
        final saved = await state.saveTextFile(
          name,
          const JsonEncoder.withIndent('  ').convert(data),
        );
        note = saved
            ? inFill(inLine(lang, 'Saved {name}. Upload it in the GST offline tool or send it to your CA.'), {'name': name})
            : inLine(lang, 'Not saved.');
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
    final lang = indiaLang(context);
    setState(() => _entriesNote = '');
    var note = '';
    try {
      final data = toolData(
        trialBalance
            ? await state.api.query('export_trial_balance')
            : await state.api.query(tally ? 'export_tally' : 'export_entries', {'period': period}),
      );
      if (data.isEmpty) {
        note = trialBalance ? inLine(lang, 'The trial balance could not be prepared.') : inLine(lang, 'The entries could not be prepared.');
      } else {
        final name = data['fileName'] as String;
        final count = (trialBalance ? data['accounts'] : data['count']) as num;
        final saved = await state.saveTextFile(name, data[tally ? 'xml' : 'csv'] as String);
        final parts = {'name': name, 'n': count};
        final ties = data['balanced'] != false;
        note = !saved
            ? inLine(lang, 'Not saved.')
            : trialBalance
            ? (count == 1
                  ? (ties ? inFill(inLine(lang, 'Saved {name} with 1 account. Send it to your CA.'), parts) : inFill(inLine(lang, 'Saved {name} with 1 account (it does not tie; ask your CA to look). Send it to your CA.'), parts))
                  : (ties ? inFill(inLine(lang, 'Saved {name} with {n} accounts. Send it to your CA.'), parts) : inFill(inLine(lang, 'Saved {name} with {n} accounts (it does not tie; ask your CA to look). Send it to your CA.'), parts)))
            : tally
            ? (count == 1
                  ? inFill(inLine(lang, 'Saved {name} with 1 voucher. Import it in Tally (Import Data) or send it to your CA.'), parts)
                  : inFill(inLine(lang, 'Saved {name} with {n} vouchers. Import it in Tally (Import Data) or send it to your CA.'), parts))
            : (count == 1 ? inFill(inLine(lang, 'Saved {name} with 1 entry. Send it to your CA.'), parts) : inFill(inLine(lang, 'Saved {name} with {n} entries. Send it to your CA.'), parts));
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
    showMycaSheet<void>(
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
                  Text(inText(context, 'AT RISK'), style: text.labelSmall),
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
                    child: Text(inText(context, 'Got it')),
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
                      child: Text(inText(context, 'Ask my CA')),
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
      appBar: AppBar(title: Text(inText(context, 'Taxes and filings'))),
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
                    '${'${state.error ?? ''}'.isEmpty ? inText(context, 'Could not load.') : state.error}',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _reload,
                    child: Text(inText(context, 'Try again')),
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
                      ? inText(context, 'Nothing needs you right now')
                      : inFormat(context, 'Needs you ({n})', {'n': open.length}),
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
                              ? inFormat(context, 'At risk: {amount}', {'amount': rupees(item.moneyAtRisk)})
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
                    onPortal: _portalAllowed
                        ? (form) => Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => GstPortalScreen(period: gst.period, gstin: _gstin, form: form),
                              ),
                            )
                        : null,
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
                        inFormat(context, 'Review the {month} return', {'month': monthLabel(gst.period)}),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => _recordGstPayment(gst),
                      child: Text(inText(context, 'Record the GST payment')),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => _saveEntries(gst.period),
                      child: Text(inText(context, 'Save entries for your CA')),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => _saveExcel('entries', {'period': gst.period}),
                      child: Text(inText(context, 'Save entries as Excel')),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: _saveGstr9,
                      child: Text(inText(context, 'Save the GSTR-9 draft')),
                    ),
                  ),
                  if (AppScope.of(context).snapshot?.company.quarterlyGst ?? false) ...[
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: () => _saveQuarterly(iff: false, shown: gst.period),
                        child: Text(inText(context, 'Save the quarterly GSTR-1')),
                      ),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton(
                        onPressed: () => _saveQuarterly(iff: true, shown: gst.period),
                        child: Text(inText(context, 'Save the IFF for this month')),
                      ),
                    ),
                  ],
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: _closeYear,
                      child: Text(inText(context, 'Close the year')),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => _saveEntries(gst.period, tally: true),
                      child: Text(inText(context, 'Save a Tally file')),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => _saveFilingPack(gst.period),
                      child: Text(inText(context, 'Save the filing pack for your CA')),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => _saveEntries(gst.period, trialBalance: true),
                      child: Text(inText(context, 'Save the trial balance')),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => _saveExcel('trial_balance'),
                      child: Text(inText(context, 'Save as Excel')),
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
                                  title: inText(context, 'Deduct TDS on bills'),
                                  subtitle: inText(context, 'Add your TAN if you deduct TDS on contractors, fees or rent'),
                                  trailing: const Chevron(),
                                  onTap: () => _openTds(tds),
                                )
                              else ...[
                                for (final month in tds.months.reversed.take(3))
                                  RowCard(
                                    leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
                                    title: inFormat(context, '{amount} deducted in {month}', {'amount': rupees(month.deducted), 'month': monthLabel(month.month)}),
                                    subtitle: month.depositBy.isEmpty ? '' : inFormat(context, 'Deposit by {date}', {'date': longDate(month.depositBy)}),
                                  ),
                                RowCard(
                                  leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
                                  title: tds.due > 0 ? inFormat(context, '{amount} still to deposit', {'amount': rupees(tds.due)}) : inText(context, 'Nothing left to deposit'),
                                  subtitle: tds.due > 0
                                      ? inText(context, 'Record a challan once you have paid it')
                                      : inFormat(context, 'Deducted {deducted}, deposited {deposited}', {'deducted': rupees(tds.deducted), 'deposited': rupees(tds.deposited)}),
                                  trailing: tds.due > 0 ? const Chevron() : null,
                                  onTap: tds.due > 0 ? () => _openTds(tds) : null,
                                ),
                                for (final quarter in tds.quarters.reversed.take(4))
                                  RowCard(
                                    leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
                                    title: quarter.kind == 'salary'
                                        ? inFormat(context, 'Salary TDS statement for {quarter}', {'quarter': quarter.quarter})
                                        : inFormat(context, 'TDS statement for {quarter}', {'quarter': quarter.quarter}),
                                    subtitle: quarter.filedArn.isNotEmpty
                                        ? inFormat(context, 'Filed, ARN {arn}', {'arn': quarter.filedArn})
                                        : quarter.approved
                                            ? (quarter.shortfall > 0
                                                ? inFormat(context, 'Approved · {deducted} deducted, {shortfall} still to deposit', {'deducted': rupees(quarter.deducted), 'shortfall': rupees(quarter.shortfall)})
                                                : inFormat(context, 'Approved · {deducted} deducted', {'deducted': rupees(quarter.deducted)}))
                                            : quarter.dueDate.isEmpty
                                                ? inFormat(context, '{deducted} deducted · review it', {'deducted': rupees(quarter.deducted)})
                                                : inFormat(context, '{deducted} deducted · due by {date} · review it', {'deducted': rupees(quarter.deducted), 'date': longDate(quarter.dueDate)}),
                                    trailing: const Chevron(),
                                    onTap: () => _openTdsReview(quarter),
                                  ),
                                if (tds.quarters.any((q) => q.kind != 'salary'))
                                  RowCard(
                                    leading: const TintTile(tint: Tint.taxes, mark: Mark.comingUp),
                                    title: inText(context, 'Form 16A drafts'),
                                    subtitle: inFormat(context, 'One per deductee for {quarter}, for checking before TRACES issues them', {'quarter': tds.quarters.lastWhere((q) => q.kind != 'salary').quarter}),
                                    trailing: const Chevron(),
                                    onTap: () => _saveForm16A(tds.quarters.lastWhere((q) => q.kind != 'salary')),
                                  ),
                              ],
                              RowCard(
                                leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
                                title: inText(context, 'Form 26AS check'),
                                subtitle: inText(context, 'TDS your customers deducted, compared with 26AS'),
                                trailing: const Chevron(),
                                onTap: () => Navigator.of(context).push(
                                  MaterialPageRoute<void>(builder: (_) => const TdsCreditScreen()),
                                ),
                              ),
                              if (_portalAllowed)
                                RowCard(
                                  leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
                                  title: inText(context, 'Income tax checks'),
                                  subtitle: inText(context, 'Read Form 16 or 26AS, check a PAN, section 206AB or a bank account'),
                                  trailing: const Chevron(),
                                  onTap: () => Navigator.of(context).push(
                                    MaterialPageRoute<void>(builder: (_) => const QuickoScreen()),
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
                SectionLabel(inText(context, 'Filed')),
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
                            title: inFormat(context, '{form} for {month}', {'form': item.label, 'month': monthLabel(item.period)}),
                            subtitle: item.late
                                ? inFormat(context, 'Filed {date}, after the due date · ARN {arn}', {'date': longDate(item.filedOn), 'arn': item.arn})
                                : inFormat(context, 'Filed {date} · ARN {arn}', {'date': longDate(item.filedOn), 'arn': item.arn}),
                          ),
                        RowCard(
                          leading: const TintTile(
                            tint: Tint.ask,
                            mark: Mark.comingUp,
                          ),
                          title: inText(context, 'Record a filing'),
                          subtitle: filed.isEmpty
                              ? inText(context, 'Filed a return on the portal or through your CA? Keep its ARN here.')
                              : inText(context, 'Add another return with its ARN'),
                          trailing: const Chevron(),
                          onTap: () => _recordFiling(today.deadlines),
                        ),
                      ],
                    );
                  },
                ),
                if (upcoming.isNotEmpty) ...[
                  const SizedBox(height: 26),
                  SectionLabel(inText(context, 'Coming up')),
                  Panel(
                    children: [
                      for (final deadline in upcoming)
                        RowCard(
                          leading: const TintTile(
                            tint: Tint.ask,
                            mark: Mark.comingUp,
                          ),
                          title: inFormat(context, '{form} for {month}', {'form': deadline.label, 'month': monthLabel(deadline.period)}),
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
          inFormat(context, 'GST FOR {month}', {'month': monthLabel(gst.period).toUpperCase()}),
          style: text.labelSmall,
        ),
        const SizedBox(height: 6),
        Amount(
          rupees(gst.outputTax.total),
          style: text.displaySmall?.copyWith(
            fontWeight: FontWeight.w400,
            fontFeatures: moneyFigures,
          ),
        ),
        Text(
          inCount(context, gst.salesCount, 'Tax on 1 sale of {amount}', 'Tax on {n} sales of {amount}', {'amount': rupees(gst.taxableSales)}),
          style: text.bodyMedium,
        ),
        const SizedBox(height: 14),
        const Divider(),
        const SizedBox(height: 10),
        _HeadsRow(label: inText(context, 'Tax on sales'), heads: gst.outputTax),
        const SizedBox(height: 10),
        _HeadsRow(label: inText(context, 'Credit on purchases'), heads: gst.inputCredit),
        const SizedBox(height: 14),
        const Divider(),
        const SizedBox(height: 10),
        if (gst.payment case final pay?) ...[
          _HeadsRow(label: inText(context, 'To pay in cash'), heads: pay.cash),
          const SizedBox(height: 6),
          Text(
            pay.broughtForwardKnown
                ? inFormat(context, 'Credit brought forward {forward} · credit used {used}', {'forward': rupees(pay.broughtForward.total), 'used': rupees(pay.creditUsed)})
                : inFormat(context, 'Credit used {used}', {'used': rupees(pay.creditUsed)}),
            style: text.bodySmall?.copyWith(fontFeatures: moneyFigures),
          ),
          if (pay.carried.total > 0)
            Text(
              inFormat(context, 'Credit carried forward {amount}', {'amount': rupees(pay.carried.total)}),
              style: text.bodySmall?.copyWith(fontFeatures: moneyFigures),
            ),
          if (pay.filedArn.isNotEmpty)
            Text(inFormat(context, 'Filed, ARN {arn}.', {'arn': pay.filedArn}), style: text.bodySmall)
          else if (pay.late case final late?)
            Text(
              inCount(
                context,
                late.days,
                'If paid today, 1 day late: interest {interest} and late fee {fee}, {total} in all.',
                'If paid today, {n} days late: interest {interest} and late fee {fee}, {total} in all.',
                {'interest': rupees(late.interest), 'fee': rupees(late.lateFee), 'total': rupees(late.total)},
              ),
              style: text.bodyMedium?.copyWith(fontFeatures: moneyFigures),
            )
          else if (pay.dueDate.isNotEmpty)
            Text(inFormat(context, 'Due by {date}.', {'date': longDate(pay.dueDate)}), style: text.bodyMedium),
          const SizedBox(height: 8),
          Text(pay.notes.join(' '), style: text.bodySmall),
        ] else
          Text(
            inText(context, 'The amount to pay could not be worked out for this month.'),
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
        AmountRow(
          start: Text(label, style: text.titleMedium),
          amount: rupees(heads.total),
          style: text.titleMedium?.copyWith(fontFeatures: moneyFigures),
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
    this.onPortal,
  });

  final PeriodGst gst;
  final bool saving;
  final String note;
  final VoidCallback onSave;
  final void Function(String form)? onPortal;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final file = gst.gstr1;
    return _Card(
      children: [
        Text(
          inFormat(context, 'GSTR-1 FILE FOR {month}', {'month': monthLabel(gst.period).toUpperCase()}),
          style: text.labelSmall,
        ),
        const SizedBox(height: 8),
        if (file.empty && file.held.isEmpty)
          Text(inText(context, 'No sales to report for this month.'), style: text.bodyLarge)
        else ...[
          Text(
            inCount(
              context,
              file.b2cs,
              '{b2b} to registered buyers · {b2cl} large to unregistered · {n} summary row',
              '{b2b} to registered buyers · {b2cl} large to unregistered · {n} summary rows',
              {'b2b': file.b2b, 'b2cl': file.b2cl},
            ),
            style: text.bodyLarge,
          ),
          for (final held in file.held)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                _heldLine(context, held.number, held.code),
                style: TextStyle(
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
                saving ? inText(context, 'Preparing…') : inText(context, 'Save file for the GST portal'),
              ),
            ),
          ),
          if (onPortal != null) ...[
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: file.empty ? null : () => onPortal!('gstr1'),
                child: Text(inText(context, 'File GSTR-1 on the GST portal')),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () => onPortal!('gstr3b'),
                child: Text(inText(context, 'File GSTR-3B on the GST portal')),
              ),
            ),
          ],
          const SizedBox(height: 8),
          Text(
            onPortal == null
                ? inText(context, 'MyCA does not upload or file this. You or your CA do that on the GST portal.')
                : inText(context, 'Save the file to upload it yourself, or file GSTR-1 and GSTR-3B on the GST portal from here with the portal OTP.'),
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
