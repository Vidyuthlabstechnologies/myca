import 'package:flutter/material.dart';
import 'package:myca_design/myca_design.dart' show MycaThemeContext;

import '../../app_state.dart';
import '../../format.dart';
import '../../my/my_strings.dart';
import '../../my/my_tools.dart';
import 'my_widgets.dart';

class _Staff {
  final name = TextEditingController();
  final wages = TextEditingController();
  final bonus = TextEditingController();
  final children = TextEditingController();
  final taxNumber = TextEditingController();
  final ic = TextEditingController();
  final passport = TextEditingController();
  final country = TextEditingController();
  int category = 1;

  void dispose() {
    for (final controller in [name, wages, bonus, children, taxNumber, ic, passport, country]) {
      controller.dispose();
    }
  }
}

class MyPayrollScreen extends StatefulWidget {
  const MyPayrollScreen({super.key});

  @override
  State<MyPayrollScreen> createState() => _MyPayrollScreenState();
}

class _MyPayrollScreenState extends State<MyPayrollScreen> {
  String? _month;
  final _staff = [_Staff()];
  final _employerNo = TextEditingController();
  Map<String, String> _errors = const {};
  String _error = '';
  List<MyProblem> _problems = const [];
  bool _busy = false;
  MyPayrollRun? _result;
  String _fileError = '';
  String _fileErrorCode = '';
  List<MyProblem> _fileProblems = const [];
  bool _fileBusy = false;
  MyCp39File? _file;
  bool _fileSaved = false;
  final _resultKey = GlobalKey();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _month ??= _monthId(AppScope.of(context).now());
  }

  @override
  void dispose() {
    for (final person in _staff) {
      person.dispose();
    }
    _employerNo.dispose();
    super.dispose();
  }

  String _monthId(DateTime day) => '${day.year.toString().padLeft(4, '0')}-${day.month.toString().padLeft(2, '0')}';

  void _changed() {
    if (_result == null && _file == null) return;
    setState(_clearResult);
  }

  void _clearResult() {
    _result = null;
    _file = null;
    _fileError = '';
    _fileErrorCode = '';
    _fileProblems = const [];
  }

  Future<void> _workOut() async {
    if (_busy) return;
    final t = MyStrings.of(context);
    final errors = <String, String>{};
    final employees = <Map<String, Object?>>[];
    for (var i = 0; i < _staff.length; i += 1) {
      final person = _staff[i];
      final wages = parseMyAmount(person.wages.text);
      if (wages == null || wages < 0) {
        errors['$i.wages'] = t.amountBad;
      } else if (wages > myLargestAmount) {
        errors['$i.wages'] = t.amountTooLarge;
      }
      final bonusTyped = person.bonus.text.trim();
      final bonus = bonusTyped.isEmpty ? 0 : parseMyAmount(bonusTyped);
      if (bonus == null || bonus < 0) {
        errors['$i.bonus'] = t.amountBad;
      } else if (bonus > myLargestAmount) {
        errors['$i.bonus'] = t.amountTooLarge;
      }
      final childrenTyped = person.children.text.trim();
      final children = childrenTyped.isEmpty ? 0 : int.tryParse(childrenTyped);
      if (children == null || children < 0 || children > 30) errors['$i.children'] = t.staffChildrenBad;
      employees.add({
        if (person.name.text.trim().isNotEmpty) 'name': person.name.text.trim(),
        'wages': wages,
        if (bonus != null && bonus > 0) 'bonus': bonus,
        'pcbCategory': person.category,
        'children': children,
      });
    }
    setState(() {
      _errors = errors;
      _error = '';
      _problems = const [];
      _clearResult();
    });
    if (errors.isNotEmpty) return;
    setState(() => _busy = true);
    try {
      final result = await MyTools(AppScope.of(context).api).payroll(month: _month!, employees: employees);
      if (mounted) {
        setState(() => _result = result);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          final target = _resultKey.currentContext;
          if (target != null && target.mounted) Scrollable.ensureVisible(target, duration: const Duration(milliseconds: 250));
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = myErrorMessage(t, error);
          _problems = error is MyToolFailure ? error.problems : const [];
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _saveCp39() async {
    final result = _result;
    if (_fileBusy || result == null) return;
    final t = MyStrings.of(context);
    final state = AppScope.of(context);
    setState(() {
      _fileBusy = true;
      _fileError = '';
      _fileErrorCode = '';
      _fileProblems = const [];
      _file = null;
    });
    try {
      final file = await MyTools(state.api).cp39File(
        month: result.month,
        employerNo: _employerNo.text.trim(),
        employees: [
          for (var i = 0; i < result.employees.length && i < _staff.length; i += 1)
            {
              'name': result.employees[i].name,
              'taxNumber': _staff[i].taxNumber.text.trim(),
              if (_staff[i].ic.text.trim().isNotEmpty) 'newIc': _staff[i].ic.text.trim(),
              if (_staff[i].passport.text.trim().isNotEmpty) 'passport': _staff[i].passport.text.trim(),
              if (_staff[i].country.text.trim().isNotEmpty) 'countryCode': _staff[i].country.text.trim(),
              'pcb': result.employees[i].pcb ?? 0,
            },
        ],
      );
      final saved = await state.saveTextFile(file.fileName, file.content).catchError((Object _) => false);
      if (mounted) {
        setState(() {
          _file = file;
          _fileSaved = saved;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _fileError = myErrorMessage(t, error);
          _fileErrorCode = error is MyToolFailure ? error.code : '';
          _fileProblems = error is MyToolFailure ? error.problems : const [];
        });
      }
    } finally {
      if (mounted) setState(() => _fileBusy = false);
    }
  }

  Widget _field(String key, TextEditingController controller, String label, {TextInputType? keyboard, TextCapitalization capitalization = TextCapitalization.none}) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextField(
      key: Key('myPayroll.$key'),
      controller: controller,
      keyboardType: keyboard,
      textCapitalization: capitalization,
      onChanged: (_) => _changed(),
      decoration: InputDecoration(labelText: label, errorText: _errors[key], errorMaxLines: 2),
    ),
  );

  Widget _person(MyStrings t, int i) {
    final person = _staff[i];
    const amount = TextInputType.numberWithOptions(decimal: true);
    return MyPanel(
      key: Key('myPayroll.staff.$i'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(t.employeeN(i + 1), style: Theme.of(context).textTheme.titleSmall)),
              if (_staff.length > 1)
                IconButton(
                  key: Key('myPayroll.remove.$i'),
                  tooltip: t.removeEmployee,
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => setState(() {
                    _staff.removeAt(i).dispose();
                    _errors = const {};
                    _clearResult();
                  }),
                ),
            ],
          ),
          const SizedBox(height: 8),
          _field('$i.name', person.name, t.staffName, capitalization: TextCapitalization.words),
          _field('$i.wages', person.wages, t.staffWages, keyboard: amount),
          _field('$i.bonus', person.bonus, t.staffBonus, keyboard: amount),
          MyPicker<int>(
            key: Key('myPayroll.$i.category'),
            label: t.staffCategory,
            value: person.category,
            items: [for (final category in const [1, 2, 3]) (category, t.staffCategoryName(category))],
            onChanged: (value) => setState(() {
              person.category = value ?? 1;
              _clearResult();
            }),
          ),
          const SizedBox(height: 12),
          _field('$i.children', person.children, t.staffChildren, keyboard: TextInputType.number),
          ExpansionTile(
            key: Key('myPayroll.$i.cp39'),
            tilePadding: EdgeInsets.zero,
            childrenPadding: EdgeInsets.zero,
            maintainState: true,
            title: Text(t.staffForCp39, style: Theme.of(context).textTheme.titleSmall),
            children: [
              const SizedBox(height: 8),
              _field('$i.taxNumber', person.taxNumber, t.staffTaxNumber, capitalization: TextCapitalization.characters),
              _field('$i.ic', person.ic, t.staffIc, keyboard: TextInputType.number),
              _field('$i.passport', person.passport, t.staffPassport, capitalization: TextCapitalization.characters),
              _field('$i.country', person.country, t.staffCountry, capitalization: TextCapitalization.characters),
            ],
          ),
        ],
      ),
    );
  }

  Widget _payslip(MyStrings t, MyPayslip slip, int i) {
    final text = Theme.of(context).textTheme;
    final palette = context.myca;
    return MyPanel(
      key: Key('myPayroll.slip.$i'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(slip.name, style: text.titleMedium, maxLines: 2, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 4),
          MyAmountLine(label: t.wagesLine, amount: ringgit(slip.wages)),
          if (slip.bonus > 0) MyAmountLine(label: t.bonusLine, amount: ringgit(slip.bonus)),
          MyAmountLine(label: t.epfEmployee, amount: '-${ringgit(slip.epfEmployee)}'),
          MyAmountLine(label: t.socsoEmployee, amount: '-${ringgit(slip.socsoEmployee)}'),
          MyAmountLine(label: t.eisEmployee, amount: '-${ringgit(slip.eisEmployee)}'),
          MyAmountLine(label: t.pcbLine, amount: slip.pcb == null ? t.pcbNotWorkedOut : '-${ringgit(slip.pcb!)}'),
          const Divider(),
          MyAmountLine(label: t.netPay, amount: ringgit(slip.netPay), strong: true),
          MyAmountLine(label: t.employerShare, caption: t.employerShareBody(ringgit(slip.epfEmployer), ringgit(slip.socsoEmployer), ringgit(slip.eisEmployer)), amount: ringgit(slip.epfEmployer + slip.socsoEmployer + slip.eisEmployer)),
          for (final note in slip.notes) Padding(padding: const EdgeInsets.only(top: 6), child: Text(note, style: text.bodySmall?.copyWith(color: palette.muted))),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    final now = AppScope.of(context).now();
    final months = [for (var back = 0; back < 6; back += 1) DateTime(now.year, now.month - back)];
    final result = _result;
    final file = _file;
    return Scaffold(
      appBar: AppBar(title: Text(t.payrollTitle, maxLines: 1, overflow: TextOverflow.ellipsis)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            MyNote(t.payrollNote),
            const SizedBox(height: 12),
            MyPicker<String>(
              key: const Key('myPayroll.month'),
              label: t.payrollMonth,
              value: _month,
              items: [for (final month in months) (_monthId(month), t.monthLabel(month.year, month.month))],
              onChanged: (value) => setState(() {
                _month = value ?? _month;
                _clearResult();
              }),
            ),
            const SizedBox(height: 12),
            for (var i = 0; i < _staff.length; i += 1) ...[_person(t, i), const SizedBox(height: 12)],
            OutlinedButton.icon(
              key: const Key('myPayroll.add'),
              icon: const Icon(Icons.add),
              label: Text(t.addEmployee),
              onPressed: () => setState(() {
                _staff.add(_Staff());
                _clearResult();
              }),
            ),
            const SizedBox(height: 12),
            MyBusyButton(key: const Key('myPayroll.workOut'), label: t.workOutPayroll, busyLabel: t.workingOutPayroll, busy: _busy, onPressed: _workOut),
            if (_problems.isNotEmpty) ...[const SizedBox(height: 12), MyProblems(title: _error, problems: _problems)] else if (_error.isNotEmpty) ...[const SizedBox(height: 12), MyErrorBox(message: _error, onRetry: _workOut)],
            if (result != null) ...[
              const SizedBox(height: 16),
              KeyedSubtree(key: _resultKey, child: const SizedBox.shrink()),
              for (var i = 0; i < result.employees.length; i += 1) ...[_payslip(t, result.employees[i], i), const SizedBox(height: 12)],
              MySection(t.payrollTotals),
              MyPanel(
                key: const Key('myPayroll.totals'),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    MyAmountLine(label: t.epfBoth, amount: ringgit(result.epf)),
                    MyAmountLine(label: t.socsoBoth, amount: ringgit(result.socso)),
                    MyAmountLine(label: t.eisBoth, amount: ringgit(result.eis)),
                    MyAmountLine(label: t.pcbLine, amount: ringgit(result.pcb)),
                    const Divider(),
                    MyAmountLine(label: t.employerCost, amount: ringgit(result.employerCost), strong: true),
                    const SizedBox(height: 4),
                    Text(t.payrollDueBy(dayMonthYear(result.dueBy)), key: const Key('myPayroll.dueBy'), style: Theme.of(context).textTheme.bodyMedium),
                  ],
                ),
              ),
              if (result.unreviewed) ...[const SizedBox(height: 12), MyNote(t.unreviewed, tone: MyTone.warn, icon: Icons.gavel_outlined)],
              if (result.pcb > 0) ...[
                MySection(t.cp39Section),
                MyPanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(t.cp39Body, style: Theme.of(context).textTheme.bodyMedium),
                      const SizedBox(height: 12),
                      TextField(
                        key: const Key('myPayroll.employerNo'),
                        controller: _employerNo,
                        keyboardType: TextInputType.text,
                        decoration: InputDecoration(labelText: t.employerNo, errorText: _fileErrorCode == 'EMPLOYER_NUMBER_REQUIRED' ? _fileError : null, errorMaxLines: 2),
                      ),
                      const SizedBox(height: 12),
                      MyBusyButton(key: const Key('myPayroll.cp39'), label: t.makeCp39, busyLabel: t.makingCp39, busy: _fileBusy, onPressed: _saveCp39, outlined: true),
                    ],
                  ),
                ),
                if (_fileProblems.isNotEmpty) ...[const SizedBox(height: 12), MyProblems(title: _fileError, problems: _fileProblems)] else if (_fileError.isNotEmpty && _fileErrorCode != 'EMPLOYER_NUMBER_REQUIRED') ...[const SizedBox(height: 12), MyErrorBox(message: _fileError, onRetry: _saveCp39)],
                if (file != null) ...[
                  const SizedBox(height: 12),
                  MyNote(
                    _fileSaved ? t.cp39Saved(file.fileName, file.records, ringgit(file.pcb)) : t.cp39NotSaved(file.fileName),
                    key: const Key('myPayroll.cp39Result'),
                    tone: _fileSaved ? MyTone.info : MyTone.warn,
                  ),
                  if (file.leftOut.isNotEmpty) ...[const SizedBox(height: 8), Text(t.cp39LeftOut(file.leftOut.join(', ')), style: Theme.of(context).textTheme.bodySmall)],
                ],
              ],
            ],
          ],
        ),
      ),
    );
  }
}
