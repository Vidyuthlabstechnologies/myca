import 'package:flutter/material.dart';
import 'package:myca_design/myca_design.dart' show MycaThemeContext;

import '../../app_state.dart';
import '../../format.dart';
import '../../my/my_codes.dart';
import '../../my/my_strings.dart';
import '../../my/my_tools.dart';
import 'my_widgets.dart';

class MyTaxScreen extends StatefulWidget {
  const MyTaxScreen({super.key});

  @override
  State<MyTaxScreen> createState() => _MyTaxScreenState();
}

class _MyTaxScreenState extends State<MyTaxScreen> {
  String? _year;
  bool _resident = true;
  bool _spouseHasIncome = true;
  final _income = {for (final head in myIncomeHeads) head: TextEditingController()};
  final _reliefs = {for (final key in myReliefs) key: TextEditingController()};
  final _children = {for (final key in myChildReliefs) key: TextEditingController()};
  final _zakat = TextEditingController();
  final _pcb = TextEditingController();
  Map<String, String> _errors = const {};
  String _error = '';
  bool _busy = false;
  bool _showReliefs = false;
  MyTaxEstimate? _result;
  final _resultKey = GlobalKey();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _year ??= '${AppScope.of(context).now().year - 1}';
  }

  @override
  void dispose() {
    for (final controller in [..._income.values, ..._reliefs.values, ..._children.values, _zakat, _pcb]) {
      controller.dispose();
    }
    super.dispose();
  }

  Map<String, num> _amounts(Map<String, TextEditingController> fields, Map<String, String> errors, MyStrings t, {bool whole = false}) {
    final out = <String, num>{};
    for (final entry in fields.entries) {
      final typed = entry.value.text.trim();
      if (typed.isEmpty) continue;
      final value = whole ? int.tryParse(typed) : parseMyAmount(typed);
      if (value == null || value < 0) {
        errors[entry.key] = t.amountBad;
      } else if (value > myLargestAmount) {
        errors[entry.key] = t.amountTooLarge;
      } else if (value > 0) {
        out[entry.key] = value;
      }
    }
    return out;
  }

  Future<void> _estimate() async {
    if (_busy) return;
    final t = MyStrings.of(context);
    final errors = <String, String>{};
    final income = _amounts(_income, errors, t);
    final reliefs = {..._amounts(_reliefs, errors, t), ..._amounts(_children, errors, t, whole: true)};
    final extras = _amounts({'zakat': _zakat, 'pcb': _pcb}, errors, t);
    if (income.isEmpty && errors.isEmpty) errors['income'] = t.enterIncome;
    setState(() {
      _errors = errors;
      _error = '';
      _result = null;
      if (errors.keys.any((key) => _reliefs.containsKey(key) || _children.containsKey(key))) _showReliefs = true;
    });
    if (errors.isNotEmpty) return;
    setState(() => _busy = true);
    try {
      final result = await MyTools(AppScope.of(context).api).taxEstimate({
        'yearOfAssessment': _year,
        'resident': _resident,
        'income': income,
        if (_resident) 'reliefs': reliefs,
        'spouseHasIncome': _spouseHasIncome,
        if (extras['zakat'] != null) 'zakat': extras['zakat'],
        if (extras['pcb'] != null) 'monthlyTaxDeductionsPaid': extras['pcb'],
      });
      if (mounted) {
        setState(() => _result = result);
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

  Widget _money(String key, TextEditingController controller, String label, {bool whole = false}) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextField(
      key: Key('myTax.$key'),
      controller: controller,
      keyboardType: whole ? TextInputType.number : const TextInputType.numberWithOptions(decimal: true),
      onChanged: (_) {
        if (_result != null) setState(() => _result = null);
      },
      decoration: InputDecoration(labelText: label, errorText: _errors[key], errorMaxLines: 2),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    final text = Theme.of(context).textTheme;
    final palette = context.myca;
    final now = AppScope.of(context).now();
    final years = ['${now.year - 1}', '${now.year - 2}', '${now.year}'];
    final result = _result;
    return Scaffold(
      appBar: AppBar(title: Text(t.taxTitle, maxLines: 1, overflow: TextOverflow.ellipsis)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            MyNote(t.fileInMyTax),
            const SizedBox(height: 12),
            MyPicker<String>(
              key: const Key('myTax.year'),
              label: t.yearOfAssessment,
              value: _year,
              items: [for (final year in years) (year, year)],
              onChanged: (value) => setState(() {
                _year = value;
                _result = null;
              }),
            ),
            SwitchListTile(
              key: const Key('myTax.resident'),
              contentPadding: EdgeInsets.zero,
              title: Text(t.residentLabel),
              subtitle: Text(t.residentHelp),
              value: _resident,
              onChanged: (on) => setState(() {
                _resident = on;
                _result = null;
              }),
            ),
            MySection(t.incomeSection),
            if (_errors['income'] != null) ...[MyNote(_errors['income']!, tone: MyTone.danger), const SizedBox(height: 12)],
            for (final head in myIncomeHeads) _money(head, _income[head]!, t.incomeName(head)),
            if (_resident) ...[
              MySection(t.reliefsSection),
              Text(t.individualReliefNote, style: text.bodyMedium?.copyWith(color: palette.muted)),
              SwitchListTile(
                key: const Key('myTax.spouseHasIncome'),
                contentPadding: EdgeInsets.zero,
                title: Text(t.spouseHasIncome),
                value: _spouseHasIncome,
                onChanged: (on) => setState(() {
                  _spouseHasIncome = on;
                  _result = null;
                }),
              ),
              ExpansionTile(
                key: const Key('myTax.reliefs'),
                initiallyExpanded: _showReliefs,
                tilePadding: EdgeInsets.zero,
                childrenPadding: EdgeInsets.zero,
                title: Text(t.reliefsSection, style: text.titleSmall),
                onExpansionChanged: (open) => _showReliefs = open,
                children: [
                  for (final key in myReliefs) _money(key, _reliefs[key]!, t.reliefName(key)),
                  MySection(t.childrenSection),
                  for (final key in myChildReliefs) _money(key, _children[key]!, t.reliefName(key), whole: true),
                ],
              ),
            ],
            MySection(t.zakatAllowed),
            _money('zakat', _zakat, t.zakat),
            _money('pcb', _pcb, t.pcb),
            const SizedBox(height: 8),
            MyBusyButton(key: const Key('myTax.estimate'), label: t.estimate, busyLabel: t.estimating, busy: _busy, onPressed: _estimate),
            if (_error.isNotEmpty) ...[const SizedBox(height: 12), MyErrorBox(message: _error, onRetry: _estimate)],
            if (result != null) ...[
              const SizedBox(height: 16),
              KeyedSubtree(key: _resultKey, child: const SizedBox.shrink()),
              MyPanel(
                key: const Key('myTax.result'),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      result.outcome == 'to pay'
                          ? t.toPay(ringgit(result.balance))
                          : result.outcome == 'refund due'
                              ? t.refundDue(ringgit(-result.balance))
                              : t.nothingDue,
                      key: const Key('myTax.outcome'),
                      style: text.titleLarge,
                    ),
                    const SizedBox(height: 4),
                    Text('${t.yearOfAssessment} ${result.yearOfAssessment}', style: text.bodyMedium?.copyWith(color: palette.muted)),
                    const SizedBox(height: 8),
                    MyAmountLine(label: t.totalIncome, amount: ringgit(result.totalIncome)),
                    for (final line in result.reliefs)
                      MyAmountLine(
                        label: line.children == null ? t.reliefName(line.relief) : '${t.reliefName(line.relief)} × ${line.children}',
                        caption: line.why.isNotEmpty
                            ? (line.relief.contains('pouse') ? t.spouseReliefNotAllowed : line.why)
                            : (line.cap != null && line.claimed > line.allowed ? t.allowedOf(ringgit(line.allowed), ringgit(line.cap!)) : ''),
                        amount: '-${ringgit(line.allowed)}',
                      ),
                    MyAmountLine(label: t.totalReliefs, amount: '-${ringgit(result.totalReliefs)}'),
                    const Divider(),
                    MyAmountLine(label: t.chargeable, amount: ringgit(result.chargeableIncome), strong: true),
                    MyAmountLine(label: t.taxOnChargeable, amount: ringgit(result.taxOnChargeableIncome)),
                    if (result.rebate > 0) MyAmountLine(label: t.rebate, amount: '-${ringgit(result.rebate)}'),
                    if (result.zakat > 0) MyAmountLine(label: t.zakatAllowed, amount: '-${ringgit(result.zakat)}'),
                    MyAmountLine(label: t.taxPayable, amount: ringgit(result.taxPayable), strong: true),
                    if (result.pcbPaid > 0) MyAmountLine(label: t.pcbPaid, amount: '-${ringgit(result.pcbPaid)}'),
                    if (result.form.isNotEmpty) ...[const SizedBox(height: 8), Text('${t.form}: ${result.form}', style: text.bodyMedium)],
                  ],
                ),
              ),
              const SizedBox(height: 12),
              MyNote(t.unreviewed, tone: MyTone.warn, icon: Icons.gavel_outlined),
            ],
          ],
        ),
      ),
    );
  }
}
