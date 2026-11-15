import 'package:flutter/material.dart';
import 'package:myca_design/myca_design.dart' show MycaThemeContext;

import '../../app_state.dart';
import '../../format.dart';
import '../../my/my_codes.dart';
import '../../my/my_strings.dart';
import '../../my/my_tools.dart';
import 'my_widgets.dart';

class MySstScreen extends StatelessWidget {
  const MySstScreen({super.key, this.startOnRegistration = false});

  final bool startOnRegistration;

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    return DefaultTabController(
      length: 2,
      initialIndex: startOnRegistration ? 1 : 0,
      child: Scaffold(
        appBar: AppBar(
          title: Text(t.homeSst, maxLines: 1, overflow: TextOverflow.ellipsis),
          bottom: TabBar(tabs: [Tab(key: const Key('mySst.returnTab'), text: t.returnTab), Tab(key: const Key('mySst.registrationTab'), text: t.registrationTab)]),
        ),
        body: const SafeArea(child: TabBarView(children: [MySstReturnView(), MySstRegistrationView()])),
      ),
    );
  }
}

class MySstRegistrationView extends StatefulWidget {
  const MySstRegistrationView({super.key});

  @override
  State<MySstRegistrationView> createState() => _MySstRegistrationViewState();
}

class _MySstRegistrationViewState extends State<MySstRegistrationView> with AutomaticKeepAliveClientMixin {
  String _kind = 'service';
  String _category = 'general';
  final _value = TextEditingController();
  final _next = TextEditingController();
  String _fieldError = '';
  String _nextError = '';
  String _error = '';
  bool _busy = false;
  MySstRegistration? _result;

  @override
  bool get wantKeepAlive => true;

  @override
  void dispose() {
    _value.dispose();
    _next.dispose();
    super.dispose();
  }

  Future<void> _check() async {
    if (_busy) return;
    final t = MyStrings.of(context);
    final value = parseMyAmount(_value.text);
    if (value == null || value < 0) return setState(() => _fieldError = t.amountBad);
    if (value > myLargestAmount) return setState(() => _fieldError = t.amountTooLarge);
    final typedNext = _next.text.trim();
    final next = typedNext.isEmpty ? null : parseMyAmount(typedNext);
    if (typedNext.isNotEmpty && (next == null || next < 0)) return setState(() => _nextError = t.amountBad);
    if (next != null && next > myLargestAmount) return setState(() => _nextError = t.amountTooLarge);
    final state = AppScope.of(context);
    setState(() {
      _busy = true;
      _fieldError = '';
      _nextError = '';
      _error = '';
      _result = null;
    });
    try {
      final result = await MyTools(state.api).sstRegistration(kind: _kind, category: _category, last12Months: value, next12Months: next, date: isoDate(state.now()));
      if (mounted) setState(() => _result = result);
    } catch (error) {
      if (mounted) setState(() => _error = myErrorMessage(t, error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final t = MyStrings.of(context);
    final text = Theme.of(context).textTheme;
    final palette = context.myca;
    final result = _result;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        Text(t.registrationTitle, style: text.titleLarge),
        const SizedBox(height: 12),
        Text(t.chargeKind, style: text.titleSmall),
        const SizedBox(height: 8),
        MyChoices<String>(
          keyPrefix: 'mySstReg.kind',
          value: _kind,
          items: [('service', t.kindService), ('sales', t.kindSales)],
          onChanged: (kind) => setState(() {
            _kind = kind;
            _result = null;
          }),
        ),
        const SizedBox(height: 12),
        if (_kind == 'service')
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: MyPicker<String>(
              key: const Key('mySstReg.category'),
              label: t.serviceCategory,
              value: _category,
              items: [for (final code in myServiceCategories) if (code != 'credit-card') (code, t.serviceCategoryName(code))],
              onChanged: (value) => setState(() {
                _category = value ?? 'general';
                _result = null;
              }),
            ),
          ),
        TextField(
          key: const Key('mySstReg.value'),
          controller: _value,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: t.last12, errorText: _fieldError.isEmpty ? null : _fieldError, errorMaxLines: 2),
        ),
        const SizedBox(height: 12),
        TextField(
          key: const Key('mySstReg.next'),
          controller: _next,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(labelText: t.next12, errorText: _nextError.isEmpty ? null : _nextError, errorMaxLines: 2),
        ),
        const SizedBox(height: 16),
        MyBusyButton(key: const Key('mySstReg.check'), label: t.checkRegistration, busyLabel: t.checking, busy: _busy, onPressed: _check),
        if (_error.isNotEmpty) ...[const SizedBox(height: 12), MyErrorBox(message: _error, onRetry: _check)],
        if (result != null) ...[
          const SizedBox(height: 16),
          MyPanel(
            key: const Key('mySstReg.result'),
            tone: result.mustRegister ? palette.warnSoft : palette.accentSoft,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(result.mustRegister ? t.mustRegister : t.noNeedToRegister, style: text.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                MyAmountLine(label: t.threshold('').trim(), amount: ringgit(result.threshold)),
                MyAmountLine(label: t.yourValue('').trim(), amount: ringgit(result.last12Months)),
                if (result.why.isNotEmpty) ...[const SizedBox(height: 4), Text(result.why, style: text.bodyMedium)],
              ],
            ),
          ),
          if (result.unreviewed) ...[const SizedBox(height: 12), MyNote(t.unreviewed, tone: MyTone.warn)],
        ],
      ],
    );
  }
}

class _SstLineFields {
  _SstLineFields(String date) : value = TextEditingController(), date = TextEditingController(text: date), cards = TextEditingController(text: '1');

  final TextEditingController value;
  final TextEditingController date;
  final TextEditingController cards;
  String kind = 'service';
  String category = 'general';
  int rate = 1000;

  void dispose() {
    value.dispose();
    date.dispose();
    cards.dispose();
  }
}

class MySstReturnView extends StatefulWidget {
  const MySstReturnView({super.key});

  @override
  State<MySstReturnView> createState() => _MySstReturnViewState();
}

class _MySstReturnViewState extends State<MySstReturnView> with AutomaticKeepAliveClientMixin {
  String? _period;
  final _lines = <_SstLineFields>[];
  Map<String, String> _errors = const {};
  String _error = '';
  bool _busy = false;
  MySstReturn? _result;
  final _resultKey = GlobalKey();
  List<MyProblem> _problems = const [];

  @override
  bool get wantKeepAlive => true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_period == null) {
      final now = AppScope.of(context).now();
      _period = dueSoonPeriod(now);
      _lines.add(_SstLineFields(_defaultDate()));
    }
  }

  @override
  void dispose() {
    for (final line in _lines) {
      line.dispose();
    }
    super.dispose();
  }

  String _defaultDate() => dayMonthYear(isoDate(periodBounds(_period!).$2));

  void _reset() {
    _result = null;
    _problems = const [];
    _error = '';
  }

  Future<void> _prepare() async {
    if (_busy) return;
    final t = MyStrings.of(context);
    final (from, to) = periodBounds(_period!);
    final errors = <String, String>{};
    final lines = <MySstLine>[];
    for (final (index, line) in _lines.indexed) {
      final value = parseMyAmount(line.value.text);
      final cards = int.tryParse(line.cards.text.trim());
      final iso = isoFromDayMonthYear(line.date.text);
      final card = line.kind == 'service' && line.category == 'credit-card';
      if (!card && (value == null || value < 0)) errors['$index.value'] = t.amountBad;
      if (value != null && value > myLargestAmount) errors['$index.value'] = t.amountTooLarge;
      if (card && (cards == null || cards < 0)) errors['$index.cards'] = t.amountBad;
      if (iso == null) {
        errors['$index.date'] = t.dateBad;
      } else {
        final day = DateTime.parse(iso);
        if (day.isBefore(from) || day.isAfter(to)) errors['$index.date'] = t.dateOutside;
      }
      if (errors.keys.any((key) => key.startsWith('$index.'))) continue;
      lines.add(MySstLine(kind: line.kind, category: line.category, rateBasisPoints: line.kind == 'sales' ? line.rate : null, value: value ?? 0, date: iso!, cards: card ? cards : null));
    }
    setState(() {
      _errors = errors;
      _reset();
    });
    if (errors.isNotEmpty) return;
    setState(() => _busy = true);
    try {
      final (result, problems) = await MyTools(AppScope.of(context).api).sstReturn(period: _period!, lines: lines);
      if (mounted) {
        setState(() {
          _result = result;
          _problems = problems;
        });
        WidgetsBinding.instance.addPostFrameCallback((_) {
          final target = _resultKey.currentContext;
          if (target != null && target.mounted) Scrollable.ensureVisible(target, duration: const Duration(milliseconds: 250));
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = myErrorMessage(t, error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _line(MyStrings t, int index, _SstLineFields line) {
    final card = line.kind == 'service' && line.category == 'credit-card';
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: MyPanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: MyChoices<String>(keyPrefix: 'mySst.line$index.kind', value: line.kind, items: [('service', t.kindService), ('sales', t.kindSales)], onChanged: (kind) => setState(() {
                  line.kind = kind;
                  _reset();
                }))),
                if (_lines.length > 1)
                  IconButton(
                    key: Key('mySst.line$index.remove'),
                    tooltip: t.removeValue,
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () => setState(() {
                      _lines.removeAt(index).dispose();
                      _reset();
                    }),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            if (line.kind == 'service')
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: MyPicker<String>(
                  key: Key('mySst.line$index.category'),
                  label: t.serviceCategory,
                  value: line.category,
                  items: [for (final code in myServiceCategories) (code, t.serviceCategoryName(code))],
                  onChanged: (value) => setState(() {
                    line.category = value ?? 'general';
                    _reset();
                  }),
                ),
              )
            else ...[
              Text(t.salesRate, style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: 6),
              MyChoices<int>(keyPrefix: 'mySst.line$index.rate', value: line.rate, items: const [(500, '5%'), (1000, '10%'), (0, '0%')], onChanged: (rate) => setState(() {
                line.rate = rate;
                _reset();
              })),
              const SizedBox(height: 12),
            ],
            if (card)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TextField(
                  key: Key('mySst.line$index.cards'),
                  controller: line.cards,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(labelText: t.cards, errorText: _errors['$index.cards'], errorMaxLines: 2),
                ),
              )
            else
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TextField(
                  key: Key('mySst.line$index.value'),
                  controller: line.value,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  onChanged: (_) => setState(_reset),
                  decoration: InputDecoration(labelText: t.value, errorText: _errors['$index.value'], errorMaxLines: 2),
                ),
              ),
            TextField(
              key: Key('mySst.line$index.date'),
              controller: line.date,
              keyboardType: TextInputType.datetime,
              onChanged: (_) => setState(_reset),
              decoration: InputDecoration(labelText: t.date, errorText: _errors['$index.date'], errorMaxLines: 2),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final t = MyStrings.of(context);
    final text = Theme.of(context).textTheme;
    final state = AppScope.of(context);
    final palette = context.myca;
    final result = _result;
    final periods = recentPeriods(state.now(), count: 7);
    final due = result == null ? null : DateTime.tryParse(result.due);
    final today = DateTime(state.now().year, state.now().month, state.now().day);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        Text(t.returnTitle, style: text.titleLarge),
        const SizedBox(height: 12),
        MyPicker<String>(
          key: const Key('mySst.period'),
          label: t.period,
          value: _period,
          items: [
            for (final period in periods) (period, t.periodLabel(periodBounds(period).$1, periodBounds(period).$2)),
          ],
          onChanged: (value) => setState(() {
            _period = value ?? _period;
            for (final line in _lines) {
              line.date.text = _defaultDate();
            }
            _reset();
          }),
        ),
        const SizedBox(height: 12),
        Text(t.sstEmpty, style: text.bodyMedium?.copyWith(color: palette.muted)),
        const SizedBox(height: 12),
        for (final (index, line) in _lines.indexed) _line(t, index, line),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            key: const Key('mySst.addLine'),
            onPressed: _lines.length >= 50 ? null : () => setState(() => _lines.add(_SstLineFields(_defaultDate()))),
            icon: const Icon(Icons.add),
            label: Text(t.addSstLine),
          ),
        ),
        const SizedBox(height: 12),
        MyBusyButton(key: const Key('mySst.prepare'), label: t.prepare, busyLabel: t.preparing, busy: _busy, onPressed: _prepare),
        if (_error.isNotEmpty) ...[const SizedBox(height: 12), MyErrorBox(message: _error, onRetry: _prepare)],
        if (_problems.isNotEmpty) ...[const SizedBox(height: 12), MyProblems(title: t.errorText('LINES_NEED_FIXING'), problems: [for (final problem in _problems) MyProblem(problem.field, t.errorText(problem.why))])],
        if (result != null) ...[
          const SizedBox(height: 16),
          KeyedSubtree(key: _resultKey, child: const SizedBox.shrink()),
          MyPanel(
            key: const Key('mySst.result'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${result.form} · ${t.periodLabel(periodBounds(result.period).$1, periodBounds(result.period).$2)}', style: text.titleMedium),
                const SizedBox(height: 8),
                for (final row in result.rows)
                  MyAmountLine(
                    label: row.sales ? t.salesTax : '${t.serviceTax} · ${t.serviceCategoryName(row.category)}',
                    caption: row.flatSen != null ? t.flatLine(ringgit(row.flatSen! / 100)) : '${ringgit(row.value)} ${t.rateLine('${plainNumber((row.basisPoints ?? 0) / 100)}%')}',
                    amount: ringgit(row.tax),
                  ),
                const Divider(),
                MyAmountLine(label: t.salesTax, amount: ringgit(result.salesTax)),
                MyAmountLine(label: t.serviceTax, amount: ringgit(result.serviceTax)),
                MyAmountLine(label: t.totalSst, amount: ringgit(result.totalTax), strong: true),
                const SizedBox(height: 8),
                Text(t.dueOn(dayMonthYear(result.due)), key: const Key('mySst.due'), style: text.titleSmall),
                if (due != null) Text(t.daysLeft(due.difference(today).inDays), style: text.bodyMedium?.copyWith(color: due.isBefore(today) ? palette.danger : palette.muted)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          MyNote(t.fileInMySst),
          if (result.unreviewed) ...[const SizedBox(height: 8), MyNote(t.unreviewed, tone: MyTone.warn)],
        ],
      ],
    );
  }
}
