import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../marks.dart';
import '../proposal_flow.dart';
import '../registers.dart';
import '../theme.dart';
import '../widgets.dart';
import 'payroll_screen.dart';

class EmployeesScreen extends StatefulWidget {
  const EmployeesScreen({super.key});

  @override
  State<EmployeesScreen> createState() => _EmployeesScreenState();
}

class _EmployeesScreenState extends State<EmployeesScreen> {
  Future<EmployeeList>? _list;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _list ??= _load();
  }

  Future<EmployeeList> _load() async => EmployeeList.fromTool(
    await AppScope.of(context).api.query('list_employees', {'include': 'all'}),
  );

  Future<void> _open(Widget screen) async {
    final changed = await Navigator.of(
      context,
    ).push<bool>(MaterialPageRoute(builder: (_) => screen));
    if (changed == true && mounted) {
      setState(() {
        _list = _load();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(inText(context, 'Employees'))),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _open(const EmployeeFormScreen()),
        icon: const Icon(Icons.add, size: 20),
        label: Text(inText(context, 'Add employee')),
      ),
      body: FutureBuilder<EmployeeList>(
        future: _list,
        builder: (context, snap) {
          final list = snap.data;
          if (list == null) {
            if (snap.hasError) return LoadFailed(onRetry: () => setState(() => _list = _load()));
            return const Center(child: CircularProgressIndicator());
          }
          if (list.error.isNotEmpty) return EmptyNote(text: list.error);
          final current = list.employees.where((e) => e.active).toList();
          final past = list.employees.where((e) => !e.active).toList();
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
            children: [
              Text(
                current.isEmpty
                    ? inText(context, 'No employees yet.')
                    : inCount(
                        context,
                        current.length,
                        '1 employee, {amount} a month before deductions.',
                        '{n} employees, {amount} a month before deductions.',
                        {'amount': rupees(list.monthlyTotal)},
                      ),
                style: text.titleMedium,
              ),
              const SizedBox(height: 4),
              Text(list.note, style: text.bodySmall),
              const SizedBox(height: 16),
              if (current.isNotEmpty) ...[
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () => _open(
                      PayrollScreen(period: isoDate(AppScope.of(context).now()).substring(0, 7)),
                    ),
                    child: Text(inFormat(context, 'Payroll for {month}', {'month': monthLabel(isoDate(AppScope.of(context).now()).substring(0, 7))})),
                  ),
                ),
                const SizedBox(height: 16),
              ],
              if (current.isNotEmpty)
                Panel(
                  children: [
                    for (final e in current)
                      RowCard(
                        leading: TintTile(
                          tint: Tint.ask,
                          letter: e.name[0].toUpperCase(),
                        ),
                        title: e.name,
                        subtitle: e.designation.isEmpty
                            ? inFormat(context, '{amount} a month · since {date}', {'amount': rupees(e.monthly), 'date': longDate(e.joinedOn)})
                            : inFormat(context, '{role} · {amount} a month · since {date}', {'role': e.designation, 'amount': rupees(e.monthly), 'date': longDate(e.joinedOn)}),
                        trailing: const Chevron(),
                        onTap: () => _open(EmployeeScreen(employee: e)),
                      ),
                  ],
                ),
              if (past.isNotEmpty) ...[
                const SizedBox(height: 26),
                SectionLabel(inText(context, 'Left')),
                Panel(
                  children: [
                    for (final e in past)
                      RowCard(
                        leading: TintTile(
                          tint: Tint.ask,
                          letter: e.name[0].toUpperCase(),
                        ),
                        title: e.name,
                        subtitle: inFormat(context, 'Left {date}', {'date': longDate(e.leftOn)}),
                      ),
                  ],
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class EmployeeScreen extends StatelessWidget {
  const EmployeeScreen({super.key, required this.employee});

  final Employee employee;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final navigator = Navigator.of(context);
    Future<void> open(Widget screen) async {
      final changed = await navigator.push<bool>(
        MaterialPageRoute(builder: (_) => screen),
      );
      if (changed == true) navigator.pop(true);
    }

    return Scaffold(
      appBar: AppBar(title: Text(employee.name)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Text(
            [
              if (employee.designation.isNotEmpty) employee.designation,
              inFormat(context, 'Joined {date}', {'date': longDate(employee.joinedOn)}),
              if (employee.pfMember) inText(context, 'Provident fund'),
              if (employee.esiMember) inText(context, 'State insurance'),
              if (employee.taxRegime.isNotEmpty)
                employee.taxRegime == 'new' ? inText(context, 'New tax regime') : inText(context, 'Old tax regime'),
            ].join(' · '),
            style: text.bodyMedium,
          ),
          const SizedBox(height: 16),
          SectionLabel(inText(context, 'Salary history')),
          Panel(
            children: [
              for (final row in employee.salary.reversed)
                RowCard(
                  leading: const TintTile(tint: Tint.ask, mark: Mark.comingUp),
                  title: inFormat(context, '{amount} a month', {'amount': rupees(row.monthly)}),
                  subtitle: inFormat(context, 'From {date} · {parts}', {
                    'date': longDate(row.from),
                    'parts': row.parts.map((p) => '${p.name} ${rupees(p.amount)}').join(' + '),
                  }),
                ),
            ],
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () => open(EmployeeFormScreen(employee: employee)),
            child: Text(inText(context, 'Change salary')),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: () =>
                open(EmployeeFormScreen(employee: employee, leaving: true)),
            child: Text(inText(context, 'Record leaving')),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: () => open(EmployeeBankScreen(employee: employee)),
            child: Text(inText(context, 'Bank account for salary')),
          ),
        ],
      ),
    );
  }
}

class EmployeeBankScreen extends StatefulWidget {
  const EmployeeBankScreen({super.key, required this.employee});

  final Employee employee;

  @override
  State<EmployeeBankScreen> createState() => _EmployeeBankScreenState();
}

class _EmployeeBankScreenState extends State<EmployeeBankScreen> with ProposalFlow {
  final _account = TextEditingController();
  final _ifsc = TextEditingController();
  String _error = '';

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  Future<void> onPosted() async {
    await AppScope.of(context).refresh();
    if (mounted) Navigator.of(context).pop(true);
  }

  @override
  void dispose() {
    _account.dispose();
    _ifsc.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final account = _account.text.replaceAll(' ', '');
    final ifsc = _ifsc.text.replaceAll(' ', '').toUpperCase();
    if (!RegExp(r'^[0-9]{9,18}$').hasMatch(account)) return setState(() => _error = inText(context, 'Enter the account number: 9 to 18 digits.'));
    if (!RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$').hasMatch(ifsc) && !RegExp(r'^[0-9]{9}$').hasMatch(ifsc)) {
      return setState(() => _error = inText(context, 'Enter the IFSC (11 characters, like HDFC0001234) or a 9-digit US routing number.'));
    }
    setState(() => _error = '');
    await propose(inFormat(context, 'Pay {name} into account ending {last}', {'name': widget.employee.name, 'last': account.substring(account.length - 4)}), 'set_employee_bank', {
      'id': widget.employee.id,
      'bankAccount': account,
      'ifsc': ifsc,
    });
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(widget.employee.name)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Text(inText(context, 'Used only for the salary payout file you upload to the bank. Kept with the employee, never shown in full again.'), style: text.bodyMedium),
          const SizedBox(height: 16),
          TextField(
            controller: _account,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(labelText: inText(context, 'Account number')),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _ifsc,
            textCapitalization: TextCapitalization.characters,
            decoration: const InputDecoration(labelText: 'IFSC'),
          ),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(_error, style: TextStyle(color: Palette.danger)),
          ],
          const SizedBox(height: 16),
          for (final entry in entries) entry.toBubble(),
          const SizedBox(height: 12),
          if (pending == null)
            FilledButton(onPressed: busy ? null : _submit, child: Text(inText(context, 'Save')))
          else
            Row(
              children: [
                FilledButton(onPressed: busy ? null : postPending, child: Text(inText(context, 'Confirm'))),
                const SizedBox(width: 8),
                TextButton(onPressed: busy ? null : discardPending, child: Text(inText(context, 'Not now'))),
              ],
            ),
        ],
      ),
    );
  }
}

String _sexWords(BuildContext context, String value) => switch (value) {
  'male' => inText(context, 'Male'),
  'female' => inText(context, 'Female'),
  _ => inText(context, 'Not set'),
};

String _regimeWords(BuildContext context, String value) => value == 'old' ? inText(context, 'Old regime') : inText(context, 'New regime');

class EmployeeFormScreen extends StatefulWidget {
  const EmployeeFormScreen({super.key, this.employee, this.leaving = false});

  final Employee? employee;
  final bool leaving;

  @override
  State<EmployeeFormScreen> createState() => _EmployeeFormScreenState();
}

class _EmployeeFormScreenState extends State<EmployeeFormScreen>
    with ProposalFlow {
  final _name = TextEditingController();
  final _role = TextEditingController();
  final _pan = TextEditingController();
  final _basic = TextEditingController();
  final _hra = TextEditingController();
  final _other = TextEditingController();
  final _workState = TextEditingController();
  final _federalWithholding = TextEditingController();
  final _uan = TextEditingController();
  final _esiNumber = TextEditingController();
  DateTime? _date;
  bool _pf = false;
  bool _esi = false;
  String _sex = '';
  String _regime = 'new';

  bool get _us => (AppScope.of(context).snapshot?.company.country ?? 'IN') == 'US';

  bool get _uk => AppScope.of(context).edition == 'GB';
  String _error = '';
  bool _posted = false;

  bool get _adding => widget.employee == null;

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  Future<void> onPosted() async {
    HapticFeedback.mediumImpact();
    setState(() => _posted = true);
  }

  @override
  void dispose() {
    for (final c in [_name, _role, _pan, _basic, _hra, _other, _workState, _federalWithholding, _uan, _esiNumber]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickDate() async {
    final today = AppScope.of(context).now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? today,
      firstDate: DateTime(today.year - 10),
      lastDate: DateTime(today.year + 1, 12, 31),
    );
    if (picked != null) setState(() => _date = picked);
  }

  List<Map<String, Object?>>? _parts() {
    final parts = <Map<String, Object?>>[];
    for (final (label, controller) in [
      ('Basic', _basic),
      ('HRA', _hra),
      ('Other allowances', _other),
    ]) {
      final value = controller.text.trim();
      if (value.isEmpty) continue;
      final amount = parseAmount(value);
      if (amount == null) return null;
      parts.add({'name': label, 'amount': amount});
    }
    return parts;
  }

  Future<void> _preview() async {
    final day = isoDate(_date ?? AppScope.of(context).now());
    if (widget.leaving) {
      setState(() => _error = '');
      await propose(inFormat(context, 'Last day {date}', {'date': day}), 'end_employment', {
        'id': widget.employee!.id,
        'leftOn': day,
      });
      return;
    }
    final parts = _parts();
    if (parts == null || parts.isEmpty) {
      return setState(
        () => _error = inText(context, 'Enter the monthly salary: at least the basic pay.'),
      );
    }
    if (_adding && _name.text.trim().isEmpty) {
      return setState(() => _error = inText(context, 'Enter the employee\'s name.'));
    }
    final uan = _uan.text.replaceAll(RegExp(r'\s'), '');
    final esiNumber = _esiNumber.text.replaceAll(RegExp(r'\s'), '');
    if (_adding && !_us && !_uk) {
      if (uan.isNotEmpty && !RegExp(r'^[0-9]{12}$').hasMatch(uan)) return setState(() => _error = inText(context, 'The UAN is 12 digits.'));
      if (_esi && esiNumber.isNotEmpty && !RegExp(r'^[0-9]{10}$').hasMatch(esiNumber)) return setState(() => _error = inText(context, 'The ESI number is 10 digits.'));
    }
    setState(() => _error = '');
    if (_adding) {
      await propose(inFormat(context, 'Add {name}', {'name': _name.text.trim()}), 'add_employee', {
        'name': _name.text.trim(),
        'joinedOn': day,
        'components': parts,
        if (_role.text.trim().isNotEmpty) 'designation': _role.text.trim(),
        if (_us) ...{
          if (_workState.text.trim().isNotEmpty) 'workState': _workState.text.trim().toUpperCase(),
          if (parseAmount(_federalWithholding.text) != null) 'federalWithholding': parseAmount(_federalWithholding.text),
        } else ...{
          if (_pan.text.trim().isNotEmpty) 'pan': _pan.text.trim().toUpperCase(),
          'pfMember': _pf,
          'esiMember': _esi,
          if (uan.isNotEmpty) 'uan': uan,
          if (_esi && esiNumber.isNotEmpty) 'esiNumber': esiNumber,
          if (_sex.isNotEmpty) 'sex': _sex,
          'taxRegime': _regime,
        },
      });
    } else {
      await propose(inFormat(context, 'New salary from {date}', {'date': day}), 'change_salary', {
        'id': widget.employee!.id,
        'effectiveFrom': day,
        'components': parts,
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final today = AppScope.of(context).now();
    final title = widget.leaving
        ? inText(context, 'Record leaving')
        : (_adding ? inText(context, 'Add employee') : inText(context, 'Change salary'));
    final dateLabel = widget.leaving
        ? inText(context, 'Last day')
        : (_adding ? inText(context, 'Joined on') : inText(context, 'New salary from'));
    final money = const TextInputType.numberWithOptions(decimal: true);
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              children: [
                if (pending == null && !_posted) ...[
                  if (_adding) ...[
                    TextField(
                      controller: _name,
                      textCapitalization: TextCapitalization.words,
                      decoration: InputDecoration(labelText: inText(context, 'Name')),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _role,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: InputDecoration(
                        labelText: inText(context, 'Designation (optional)'),
                      ),
                    ),
                    const SizedBox(height: 10),
                  ],
                  Wrap(
                    spacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(dateLabel, style: text.bodyMedium),
                      ActionChip(
                        label: Text(longDate(isoDate(_date ?? today))),
                        onPressed: _pickDate,
                      ),
                    ],
                  ),
                  if (!widget.leaving) ...[
                    const SizedBox(height: 10),
                    Text(inText(context, 'Monthly salary'), style: text.titleMedium),
                    TextField(
                      controller: _basic,
                      keyboardType: money,
                      decoration: InputDecoration(
                        labelText: inText(context, 'Basic'),
                        prefixText: moneyPrefix,
                      ),
                    ),
                    if (!_us && !_uk)
                    TextField(
                      controller: _hra,
                      keyboardType: money,
                      decoration: InputDecoration(
                        labelText: inText(context, 'HRA (optional)'),
                        prefixText: moneyPrefix,
                      ),
                    ),
                    TextField(
                      controller: _other,
                      keyboardType: money,
                      decoration: InputDecoration(
                        labelText: inText(context, 'Other allowances (optional)'),
                        prefixText: moneyPrefix,
                      ),
                    ),
                  ],
                  if (_adding && _us) ...[
                    const SizedBox(height: 10),
                    TextField(
                      controller: _workState,
                      textCapitalization: TextCapitalization.characters,
                      maxLength: 2,
                      decoration: const InputDecoration(labelText: 'Work state', helperText: 'Two letters, for example TX.', counterText: ''),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _federalWithholding,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'Federal withholding a month (optional)',
                        prefixText: '\$ ',
                        helperText: 'From the IRS Tax Withholding Estimator or the W-4 tables. MyCA does not work it out.',
                      ),
                    ),
                  ],
                  if (_adding && !_us && !_uk) ...[
                    const SizedBox(height: 10),
                    TextField(
                      controller: _pan,
                      textCapitalization: TextCapitalization.characters,
                      decoration: InputDecoration(
                        labelText: inText(context, 'PAN (optional)'),
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      key: const Key('employee-uan'),
                      controller: _uan,
                      keyboardType: TextInputType.number,
                      maxLength: 14,
                      decoration: InputDecoration(labelText: inText(context, 'UAN (optional)'), counterText: ''),
                    ),
                    Text(inText(context, 'Sex (used for professional tax)'), style: text.bodyMedium),
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final value in const ['', 'male', 'female'])
                          ChoiceChip(key: Key('employee-sex-${value.isEmpty ? 'none' : value}'), label: Text(_sexWords(context, value)), selected: _sex == value, onSelected: (_) => setState(() => _sex = value)),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text(inText(context, 'Tax regime for salary TDS'), style: text.bodyMedium),
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final value in const ['new', 'old'])
                          ChoiceChip(key: Key('employee-regime-$value'), label: Text(_regimeWords(context, value)), selected: _regime == value, onSelected: (_) => setState(() => _regime = value)),
                      ],
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(inText(context, 'In provident fund')),
                      value: _pf,
                      onChanged: (v) => setState(() => _pf = v),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(inText(context, 'In state insurance (ESI)')),
                      value: _esi,
                      onChanged: (v) => setState(() => _esi = v),
                    ),
                    if (_esi)
                      TextField(
                        key: const Key('employee-esi-number'),
                        controller: _esiNumber,
                        keyboardType: TextInputType.number,
                        maxLength: 12,
                        decoration: InputDecoration(labelText: inText(context, 'ESI number (optional)'), counterText: ''),
                      ),
                  ],
                  Text(
                    inText(context, 'Records only. No payroll is run and no deduction is worked out yet.'),
                    style: text.bodySmall,
                  ),
                  if (_error.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(_error, style: TextStyle(color: Palette.danger)),
                  ],
                  const SizedBox(height: 14),
                  FilledButton(
                    onPressed: busy ? null : _preview,
                    child: Text(inText(context, 'Preview')),
                  ),
                ],
                for (final entry in entries) entry.toBubble(),
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
            ProposalBar(
              busy: busy,
              onPost: postPending,
              onDiscard: discardPending,
            ),
        ],
      ),
    );
  }
}
