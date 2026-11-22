import 'package:myca_design/myca_design.dart' show MycaThemeContext;
import 'package:flutter/material.dart';

import '../../app_state.dart';
import '../../format.dart';
import '../../theme.dart';
import '../../us/us_state.dart';
import '../../us/us_text_scaler.dart';
import '../../widgets.dart';
import 'us_fields.dart';
import 'us_state_questions_screen.dart';
import 'us_state_residency_screen.dart';

class _Loaded {
  const _Loaded(this.returns, this.questions, this.coverage);

  final UsStateReturns? returns;
  final UsStateQuestionSet? questions;
  final UsStateCoverage coverage;
}

class UsStateCoverageNote extends StatelessWidget {
  const UsStateCoverageNote({super.key, required this.message, this.title = ''});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: context.myca.accentSoft, borderRadius: BorderRadius.circular(radiusCard)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title.isNotEmpty) ...[Text(title, style: text.titleMedium?.copyWith(color: context.myca.ink)), const SizedBox(height: 4)],
          Text(message, style: text.bodyMedium?.copyWith(color: context.myca.ink)),
        ],
      ),
    );
  }
}

class UsStateReturnScreen extends StatefulWidget {
  const UsStateReturnScreen({super.key, required this.taxYear, required this.state});

  final int taxYear;
  final String state;

  @override
  State<UsStateReturnScreen> createState() => _UsStateReturnScreenState();
}

class _UsStateReturnScreenState extends State<UsStateReturnScreen> {
  Future<_Loaded>? _loaded;

  String get _code => widget.state.toUpperCase();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _loaded ??= _load();
  }

  Future<_Loaded> _load() async {
    final api = AppScope.of(context).api;
    final results = await Future.wait<Object?>([
      loadStateReturns(api, widget.taxYear, state: _code).then<Object?>((r) => r).catchError((Object err) => err is UsStateProblem ? null : throw err),
      loadStateQuestions(api, widget.taxYear, _code).then<Object?>((r) => r).catchError((_) => null),
      loadStateCoverage(api),
    ]);
    return _Loaded(results[0] as UsStateReturns?, results[1] as UsStateQuestionSet?, results[2] as UsStateCoverage);
  }

  void _reload() => setState(() {
        _loaded = _load();
      });

  Future<void> _open(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
    if (mounted) _reload();
  }

  Widget _amount(UsStateReturn r) {
    final text = Theme.of(context).textTheme;
    final String label;
    final num shown;
    if (r.refund > 0) {
      label = 'Estimated ${r.stateName} refund';
      shown = r.refund;
    } else if (r.owed > 0) {
      label = '${r.stateName} tax due';
      shown = r.owed;
    } else {
      label = 'Nothing to pay or get back';
      shown = 0;
    }
    return Container(
      key: const Key('usStateReturn.summary'),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: context.myca.surface, borderRadius: BorderRadius.circular(radiusCard), border: Border.all(color: context.myca.line)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: text.bodyLarge?.copyWith(color: context.myca.muted)),
          const SizedBox(height: 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(dollars(shown), key: const Key('usStateReturn.amount'), maxLines: 1, style: text.displaySmall?.copyWith(color: r.owed > 0 ? context.myca.warn : context.myca.accent, fontFeatures: moneyFigures)),
          ),
          if (r.due.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(r.owed > 0 ? 'Pay by ${longDate(r.due)}.' : 'Due ${longDate(r.due)}.', style: text.bodySmall),
          ],
        ],
      ),
    );
  }

  Widget _line(String key, String label, num amount, {bool strong = false, bool minus = false}) {
    final text = Theme.of(context).textTheme;
    return Padding(
      key: Key('usStateReturn.line.$key'),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: AmountRow(
        start: Text(label, style: (strong ? text.titleSmall : text.bodyMedium)?.copyWith(color: context.myca.ink)),
        amount: minus && amount != 0 ? '−${dollars(amount)}' : dollars(amount),
        style: (strong ? text.titleMedium : text.titleSmall)?.copyWith(fontFeatures: moneyFigures),
      ),
    );
  }

  List<Widget> _lines(UsStateReturn r) => [
        _line('income', '${r.stateName} income', r.stateIncome),
        _line('taxable', 'Taxable income', r.taxableIncome),
        _line('taxBefore', 'Tax before credits', r.taxBeforeCredits),
        for (final c in r.credits) _line('credit.${c.label}', c.label, c.amount, minus: true),
        for (final t in r.otherTaxes) _line('tax.${t.label}', t.label, t.amount),
        _line('total', 'Total ${r.stateName} tax', r.totalTax, strong: true),
        if (r.withheld != 0) _line('withheld', '${r.stateName} tax withheld (W-2 box 17)', r.withheld, minus: true),
        if (r.localPaid != 0) _line('local', 'Local tax withheld or paid', r.localPaid, minus: true),
        if (r.estimated != 0) _line('estimated', 'Estimated payments', r.estimated, minus: true),
        if (r.extension != 0) _line('extension', 'Paid with an extension', r.extension, minus: true),
        for (final c in r.refundableCredits) _line('refundable.${c.label}', c.label, c.amount, minus: true),
        if (r.refund > 0) _line('refund', 'Refund', r.refund, strong: true) else _line('owed', 'Amount you owe', r.owed, strong: true),
      ];

  Widget _checks(UsStateReturn r) {
    final text = Theme.of(context).textTheme;
    final shown = r.checks.where((c) => c.level != 'info' || c.fix.isNotEmpty).toList();
    final info = r.checks.where((c) => c.level == 'info' && c.fix.isEmpty).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final c in shown) ...[
          const SizedBox(height: 10),
          Container(
            key: Key('usStateReturn.check.${c.code}'),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: c.blocking ? context.myca.dangerSoft : context.myca.warnSoft, borderRadius: BorderRadius.circular(radiusControl)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(c.message, style: text.bodyMedium?.copyWith(color: context.myca.ink)),
                if (c.fix.isNotEmpty) ...[const SizedBox(height: 4), Text(c.fix, style: text.bodySmall?.copyWith(color: context.myca.ink))],
              ],
            ),
          ),
        ],
        for (final c in info) ...[
          const SizedBox(height: 8),
          Text(c.message, key: Key('usStateReturn.note.${c.code}'), style: text.bodySmall),
        ],
      ],
    );
  }

  Widget _everyLine(UsStateReturn r) {
    final text = Theme.of(context).textTheme;
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        key: const Key('usStateReturn.everyLine'),
        tilePadding: EdgeInsets.zero,
        title: Text(r.form.isEmpty ? 'Every line of the return' : 'Every line of Form ${r.form}', style: text.titleSmall),
        children: [
          Panel(
            children: [
              for (final l in r.lines)
                Padding(
                  key: Key('usStateReturn.formLine.${l.line}'),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  child: AmountRow(
                    start: Text('Line ${l.line} · ${l.label}', style: text.bodyMedium?.copyWith(color: context.myca.ink)),
                    amount: l.shown,
                    style: text.titleSmall?.copyWith(fontFeatures: moneyFigures),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _notCovered(UsStateReturn r) {
    final text = Theme.of(context).textTheme;
    if (r.notCovered.isEmpty) return const SizedBox.shrink();
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        key: const Key('usStateReturn.notCovered'),
        tilePadding: EdgeInsets.zero,
        childrenPadding: const EdgeInsets.only(bottom: 8),
        title: Text('What this return doesn\'t include', style: text.titleSmall),
        subtitle: Text('If any of these apply to you, ${r.stateName} needs them on the return and MyCA can\'t add them yet.', style: text.bodySmall),
        children: [
          for (final item in r.notCovered)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('•  ', style: text.bodyMedium),
                  Expanded(child: Text(item, style: text.bodyMedium)),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _computed(UsStateReturn r, UsStateQuestionSet? questions) {
    final text = Theme.of(context).textTheme;
    final year = '${widget.taxYear}';
    final open = questions?.questions.where((q) => !q.answered).length ?? 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (r.provisional) ...[
          Container(
            key: const Key('usStateReturn.provisional'),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: context.myca.warnSoft, borderRadius: BorderRadius.circular(radiusControl)),
            child: Text(provisionalNote(r.stateName, year), style: text.bodyMedium?.copyWith(color: context.myca.ink)),
          ),
          const SizedBox(height: 14),
        ],
        if (!r.provisional && r.checks.any((c) => c.blocking)) ...[
          Container(
            key: const Key('usStateReturn.notReady'),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: context.myca.dangerSoft, borderRadius: BorderRadius.circular(radiusControl)),
            child: Text('This ${r.stateName} return isn\'t ready to file yet. Fix what is listed below first.', style: text.bodyMedium?.copyWith(color: context.myca.ink)),
          ),
          const SizedBox(height: 14),
        ],
        _amount(r),
        if (questions != null && questions.questions.isNotEmpty) ...[
          const SizedBox(height: 14),
          FilledButton(
            key: const Key('usStateReturn.questions'),
            onPressed: () => _open(UsStateQuestionsScreen(taxYear: widget.taxYear, state: _code)),
            child: Text(open == 0 ? 'Change my ${r.stateName} answers' : 'Answer ${r.stateName} questions ($open left)'),
          ),
        ],
        const SizedBox(height: 18),
        SectionLabel(r.form.isEmpty ? 'Your return' : 'Form ${r.form}'),
        Panel(children: _lines(r)),
        if (r.lines.isNotEmpty) _everyLine(r),
        if (r.otherStateCredit > 0) ...[
          const SizedBox(height: 10),
          Text(
            'Includes ${dollars(r.otherStateCredit)} credit for tax you paid to another state on the same income, so it isn\'t taxed twice.',
            key: const Key('usStateReturn.otherStateCredit'),
            style: text.bodyMedium,
          ),
        ],
        for (final note in r.notes) ...[const SizedBox(height: 8), Text(note, style: text.bodySmall)],
        _checks(r),
        const SizedBox(height: 10),
        _notCovered(r),
        if (r.unreviewed) ...[
          const SizedBox(height: 6),
          Text('These state figures come from dated rules a US CPA has not reviewed yet.', key: const Key('usStateReturn.unreviewed'), style: text.bodySmall?.copyWith(color: context.myca.muted)),
        ],
      ],
    );
  }

  Widget _other(UsStateReturn r, UsStateCoverage coverage) {
    final title = switch (r.status) {
      'reciprocal' => r.returnNeeded == true ? 'File to get your withholding back' : 'No ${r.stateName} tax on your wages',
      'no-income-tax' => 'No state income tax',
      'capital-gains-only' => r.headline('${widget.taxYear}'),
      'not-built' => 'Not prepared in MyCA yet',
      _ => 'This return could not be worked out',
    };
    final message = r.why.isNotEmpty ? r.why : (coverage.message(r.state) ?? 'Check your answers and try again.');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KeyedSubtree(key: Key('usStateReturn.status.${r.status}'), child: UsStateCoverageNote(title: title, message: message)),
        _checks(r),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final name = usStateName(_code);
    return Scaffold(
      appBar: AppBar(title: Text('$name return')),
      body: SafeArea(
        child: FutureBuilder<_Loaded>(
          future: _loaded,
          builder: (context, loaded) {
            if (loaded.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
            if (loaded.hasError) return UsLoadError(message: usLoadProblem(loaded.error, 'Your state return could not be loaded.'), onRetry: _reload);
            final data = loaded.data!;
            final r = data.returns?.of(_code);
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                Text(wholeWords('Your ${widget.taxYear} $name return'), style: text.headlineMedium),
                const SizedBox(height: 4),
                if (r != null) Text([if (r.form.isNotEmpty) 'Form ${r.form}', r.residencyLine].join(' · '), key: const Key('usStateReturn.residency'), style: text.bodyMedium?.copyWith(color: context.myca.muted)),
                const SizedBox(height: 16),
                if (r == null)
                  UsStateCoverageNote(key: const Key('usStateReturn.coverage'), message: data.coverage.message(_code) ?? '$name is not on your return. Add it under Where you lived.')
                else if (r.computed)
                  _computed(r, data.questions)
                else
                  _other(r, data.coverage),
                const SizedBox(height: 18),
                OutlinedButton(
                  key: const Key('usStateReturn.residencyEdit'),
                  onPressed: () => _open(UsStateResidencyScreen(taxYear: widget.taxYear)),
                  child: const Text('Change where I lived'),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
