import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../theme.dart';
import '../../uae/uae_emirates.dart';
import '../../uae/uae_format.dart';
import '../../uae/uae_strings.dart';
import 'uae_taxes_screen.dart' show ctYearEnd;
import 'uae_widgets.dart';

bool _realDay(String text) {
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(text);
  if (match == null) return false;
  final day = DateTime(int.parse(match.group(1)!), int.parse(match.group(2)!), int.parse(match.group(3)!));
  return day.month == int.parse(match.group(2)!) && day.day == int.parse(match.group(3)!);
}

class UaeCtEstimateScreen extends StatefulWidget {
  const UaeCtEstimateScreen({super.key});

  @override
  State<UaeCtEstimateScreen> createState() => _UaeCtEstimateScreenState();
}

class _UaeCtEstimateScreenState extends State<UaeCtEstimateScreen> {
  final _start = TextEditingController();
  final _end = TextEditingController();
  final _revenue = TextEditingController();
  final _profit = TextEditingController();
  final _exempt = TextEditingController();
  final _nonDeductible = TextEditingController();
  final _losses = TextEditingController();
  final _qualifying = TextEditingController();
  bool _sbr = false;
  bool _qfzp = false;
  bool _busy = false;
  String _note = '';
  Map<String, dynamic>? _result;
  List<String> _problems = const [];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_end.text.isNotEmpty) return;
    final now = AppScope.of(context).now();
    final end = ctYearEnd(now.year, uaeProfile.value?['financialYearEnd'] as String?);
    final endDay = DateTime.parse(end);
    final startDay = DateTime(endDay.year - 1, endDay.month, endDay.day + 1);
    _end.text = end;
    _start.text = '${startDay.year}-${startDay.month.toString().padLeft(2, '0')}-${startDay.day.toString().padLeft(2, '0')}';
    _qfzp = uaeProfile.value?['freeZone'] == true;
  }

  @override
  void dispose() {
    for (final c in [_start, _end, _revenue, _profit, _exempt, _nonDeductible, _losses, _qualifying]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _workItOut() async {
    final s = UaeStrings.of(context);
    final start = _start.text.trim();
    final end = _end.text.trim();
    if (!_realDay(start) || !_realDay(end) || end.compareTo(start) <= 0) {
      setState(() => _note = s.badDates);
      return;
    }
    final amounts = {
      'revenue': parseDirhams(_revenue.text),
      'accountingProfit': parseDirhams(_profit.text),
      'exemptIncome': parseDirhams(_exempt.text),
      'nonDeductibleExpenses': parseDirhams(_nonDeductible.text),
      'lossesBroughtForward': parseDirhams(_losses.text),
      if (_qfzp) 'qualifyingIncome': parseDirhams(_qualifying.text),
    };
    if (amounts.values.any((v) => v == null) || amounts.entries.any((e) => e.key != 'accountingProfit' && e.value! < 0)) {
      setState(() => _note = s.badAmount);
      return;
    }
    setState(() {
      _note = '';
      _busy = true;
    });
    final api = AppScope.of(context).api;
    Map<String, dynamic>? data;
    var problems = const <String>[];
    var failure = '';
    try {
      final result = await api.query('ae_ct_estimate', {
        'periodStart': start,
        'periodEnd': end,
        ...amounts,
        'electSmallBusinessRelief': _sbr,
        'qualifyingFreeZonePerson': _qfzp,
        if (UaeStrings.of(context).ar) 'lang': 'ar',
      });
      data = toolData(result);
      problems = uaeProblems(result);
      failure = uaeFailure(result);
    } on MycaApiException catch (err) {
      failure = err.message;
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _result = data != null && data.isNotEmpty ? data : null;
      _problems = _result == null ? [...problems, if (problems.isEmpty && failure.isNotEmpty) failure, if (problems.isEmpty && failure.isEmpty) s.couldNotWorkOut] : const [];
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(s.ctTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Text(s.ctBands, style: text.bodyMedium),
          const SizedBox(height: 16),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              for (final (key, controller, label) in [('uae.ct.start', _start, s.periodStart), ('uae.ct.end', _end, s.periodEnd)])
                SizedBox(
                  width: 220,
                  child: TextField(
                    key: ValueKey(key),
                    controller: controller,
                    keyboardType: TextInputType.datetime,
                    textDirection: TextDirection.ltr,
                    decoration: InputDecoration(label: Text(label, maxLines: 2), hintText: 'YYYY-MM-DD'),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 14),
          UaeMoneyField(fieldKey: const ValueKey('uae.ct.revenue'), controller: _revenue, label: s.revenue),
          UaeMoneyField(fieldKey: const ValueKey('uae.ct.profit'), controller: _profit, label: s.accountingProfit, signed: true),
          UaeMoneyField(fieldKey: const ValueKey('uae.ct.exempt'), controller: _exempt, label: s.exemptIncome),
          UaeMoneyField(fieldKey: const ValueKey('uae.ct.nonDeductible'), controller: _nonDeductible, label: s.nonDeductible),
          UaeMoneyField(fieldKey: const ValueKey('uae.ct.losses'), controller: _losses, label: s.lossesBroughtForward),
          SwitchListTile(
            key: const ValueKey('uae.ct.sbr'),
            contentPadding: EdgeInsets.zero,
            value: _sbr,
            onChanged: (on) => setState(() => _sbr = on),
            title: Text(s.electSbr),
            subtitle: Text(s.sbrHint),
          ),
          SwitchListTile(
            key: const ValueKey('uae.ct.qfzp'),
            contentPadding: EdgeInsets.zero,
            value: _qfzp,
            onChanged: (on) => setState(() => _qfzp = on),
            title: Text(s.qfzp),
            subtitle: Text(s.qfzpHint),
          ),
          if (_qfzp) UaeMoneyField(fieldKey: const ValueKey('uae.ct.qualifying'), controller: _qualifying, label: s.qualifyingIncome),
          const SizedBox(height: 8),
          FilledButton(key: const ValueKey('uae.ct.work'), onPressed: _busy ? null : _workItOut, child: Text(s.workItOut)),
          if (_note.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(_note, key: const ValueKey('uae.ct.note'), style: text.bodyMedium?.copyWith(color: Palette.danger)),
          ],
          if (_busy) const Padding(padding: EdgeInsets.all(20), child: Center(child: CircularProgressIndicator())),
          if (_problems.isNotEmpty) ...[
            const SizedBox(height: 16),
            UaeNotes(title: s.couldNotWorkOut, notes: _problems, danger: true),
          ],
          if (_result != null) ...[
            const SizedBox(height: 20),
            _resultPanel(_result!, s, UaeFormat.of(context), text),
          ],
        ],
      ),
    );
  }

  Widget _resultPanel(Map<String, dynamic> d, UaeStrings s, UaeFormat f, TextTheme text) {
    String money(Object? v) => f.money(uaeNum(v));
    final warnings = [for (final w in (d['warnings'] as List? ?? const [])) '$w'];
    return Column(
      key: const ValueKey('uae.ct.result'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        UaePanel(children: [
          UaeFigure(label: s.adjustedProfit, value: money(d['adjustedProfit'])),
          UaeFigure(label: s.lossUsed, value: money(d['lossUsed']), valueKey: const ValueKey('uae.ct.lossUsed')),
          UaeFigure(label: s.taxableIncome, value: money(d['taxableIncome']), valueKey: const ValueKey('uae.ct.taxable')),
          if (uaeNum(d['zeroRatedQualifyingIncome']) != 0) UaeFigure(label: s.zeroRatedQualifying, value: money(d['zeroRatedQualifyingIncome'])),
          UaeFigure(label: s.corporateTax, value: money(d['tax']), valueKey: const ValueKey('uae.ct.tax')),
          UaeFigure(label: s.ctPayable, value: money(d['payable'] ?? d['tax']), strong: true, valueKey: const ValueKey('uae.ct.payable')),
          UaeFigure(label: s.reliefApplied, value: s.relief(uaeText(d['relief'])), valueKey: const ValueKey('uae.ct.relief')),
          UaeFigure(label: s.lossCarried, value: money(d['lossCarriedForward']), valueKey: const ValueKey('uae.ct.lossCarried')),
          if (uaeNum(d['lossForfeited']) != 0) UaeFigure(label: s.lossForfeited, value: money(d['lossForfeited'])),
          UaeFigure(label: s.returnDue, value: f.date(uaeText(d['due']), short: false), strong: true, valueKey: const ValueKey('uae.ct.due')),
        ]),
        if (d['unreviewed'] == true) ...[
          const SizedBox(height: 6),
          Text(s.unreviewed, style: text.bodySmall),
        ],
        if (warnings.isNotEmpty) ...[
          const SizedBox(height: 14),
          UaeNotes(title: s.checkBeforeFiling, notes: warnings),
        ],
      ],
    );
  }
}
