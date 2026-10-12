import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
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
      appBar: AppBar(title: const Text('Employees')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _open(const EmployeeFormScreen()),
        icon: const Icon(Icons.add, size: 20),
        label: const Text('Add employee'),
      ),
      body: FutureBuilder<EmployeeList>(
        future: _list,
        builder: (context, snap) {
          final list = snap.data;
          if (list == null) {
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
                    ? 'No employees yet.'
                    : '${current.length == 1 ? '1 employee' : '${current.length} employees'}, ${rupees(list.monthlyTotal)} a month before deductions.',
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
                    child: Text('Payroll for ${monthLabel(isoDate(AppScope.of(context).now()).substring(0, 7))}'),
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
                        subtitle:
                            '${e.designation.isEmpty ? '' : '${e.designation} · '}${rupees(e.monthly)} a month · since ${longDate(e.joinedOn)}',
                        trailing: const Chevron(),
                        onTap: () => _open(EmployeeScreen(employee: e)),
                      ),
                  ],
                ),
              if (past.isNotEmpty) ...[
                const SizedBox(height: 26),
                const SectionLabel('Left'),
                Panel(
                  children: [
                    for (final e in past)
                      RowCard(
                        leading: TintTile(
                          tint: Tint.ask,
                          letter: e.name[0].toUpperCase(),
                        ),
                        title: e.name,
                        subtitle: 'Left ${longDate(e.leftOn)}',
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
              'Joined ${longDate(employee.joinedOn)}',
              if (employee.pfMember) 'Provident fund',
              if (employee.esiMember) 'State insurance',
              if (employee.taxRegime.isNotEmpty)
                '${employee.taxRegime == 'new' ? 'New' : 'Old'} tax regime',
            ].join(' · '),
            style: text.bodyMedium,
          ),
          const SizedBox(height: 16),
          const SectionLabel('Salary history'),
          Panel(
            children: [
              for (final row in employee.salary.reversed)
                RowCard(
                  leading: const TintTile(tint: Tint.ask, mark: Mark.comingUp),
                  title: '${rupees(row.monthly)} a month',
                  subtitle:
                      'From ${longDate(row.from)} · ${row.parts.map((p) => '${p.name} ${rupees(p.amount)}').join(' + ')}',
                ),
            ],
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () => open(EmployeeFormScreen(employee: employee)),
            child: const Text('Change salary'),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: () =>
                open(EmployeeFormScreen(employee: employee, leaving: true)),
            child: const Text('Record leaving'),
          ),
        ],
      ),
    );
  }
}

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
  DateTime? _date;
  bool _pf = false;
  bool _esi = false;
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
    for (final c in [_name, _role, _pan, _basic, _hra, _other]) {
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
      await propose('Last day $day', 'end_employment', {
        'id': widget.employee!.id,
        'leftOn': day,
      });
      return;
    }
    final parts = _parts();
    if (parts == null || parts.isEmpty) {
      return setState(
        () => _error = 'Enter the monthly salary: at least the basic pay.',
      );
    }
    if (_adding && _name.text.trim().isEmpty) {
      return setState(() => _error = 'Enter the employee\'s name.');
    }
    setState(() => _error = '');
    if (_adding) {
      await propose('Add ${_name.text.trim()}', 'add_employee', {
        'name': _name.text.trim(),
        'joinedOn': day,
        'components': parts,
        if (_role.text.trim().isNotEmpty) 'designation': _role.text.trim(),
        if (_pan.text.trim().isNotEmpty) 'pan': _pan.text.trim().toUpperCase(),
        'pfMember': _pf,
        'esiMember': _esi,
      });
    } else {
      await propose('New salary from $day', 'change_salary', {
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
        ? 'Record leaving'
        : (_adding ? 'Add employee' : 'Change salary');
    final dateLabel = widget.leaving
        ? 'Last day'
        : (_adding ? 'Joined on' : 'New salary from');
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
                      decoration: const InputDecoration(labelText: 'Name'),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _role,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        labelText: 'Designation (optional)',
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
                    Text('Monthly salary', style: text.titleMedium),
                    TextField(
                      controller: _basic,
                      keyboardType: money,
                      decoration: const InputDecoration(
                        labelText: 'Basic',
                        prefixText: '₹ ',
                      ),
                    ),
                    TextField(
                      controller: _hra,
                      keyboardType: money,
                      decoration: const InputDecoration(
                        labelText: 'HRA (optional)',
                        prefixText: '₹ ',
                      ),
                    ),
                    TextField(
                      controller: _other,
                      keyboardType: money,
                      decoration: const InputDecoration(
                        labelText: 'Other allowances (optional)',
                        prefixText: '₹ ',
                      ),
                    ),
                  ],
                  if (_adding) ...[
                    const SizedBox(height: 10),
                    TextField(
                      controller: _pan,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(
                        labelText: 'PAN (optional)',
                      ),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('In provident fund'),
                      value: _pf,
                      onChanged: (v) => setState(() => _pf = v),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('In state insurance (ESI)'),
                      value: _esi,
                      onChanged: (v) => setState(() => _esi = v),
                    ),
                  ],
                  Text(
                    'Records only. No payroll is run and no deduction is worked out yet.',
                    style: text.bodySmall,
                  ),
                  if (_error.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(_error, style: const TextStyle(color: Palette.danger)),
                  ],
                  const SizedBox(height: 14),
                  FilledButton(
                    onPressed: busy ? null : _preview,
                    child: const Text('Preview'),
                  ),
                ],
                for (final entry in entries) entry.toBubble(),
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
