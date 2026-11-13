part of '../models.dart';

class SalaryPart {
  const SalaryPart({required this.name, required this.amount});

  final String name;
  final num amount;
}

class SalaryRow {
  const SalaryRow({required this.from, required this.monthly, required this.parts});

  factory SalaryRow.fromJson(Object? json) {
    final map = _map(json);
    return SalaryRow(
      from: _text(map['from']),
      monthly: _num(map['monthly']),
      parts: [
        for (final part in _maps(map['components']))
          SalaryPart(name: _text(part['name']), amount: _num(part['amount'])),
      ],
    );
  }

  final String from;
  final num monthly;
  final List<SalaryPart> parts;
}

class Employee {
  const Employee({
    required this.id,
    required this.name,
    required this.designation,
    required this.joinedOn,
    required this.leftOn,
    required this.monthly,
    required this.active,
    required this.pfMember,
    required this.esiMember,
    required this.taxRegime,
    required this.salary,
  });

  factory Employee.fromJson(Object? json) {
    final map = _map(json);
    return Employee(
      id: _text(map['id']),
      name: _text(map['name']),
      designation: _text(map['designation']),
      joinedOn: _text(map['joinedOn']),
      leftOn: _text(map['leftOn']),
      monthly: _num(map['monthly']),
      active: map['active'] != false,
      pfMember: map['pfMember'] == true,
      esiMember: map['esiMember'] == true,
      taxRegime: _text(map['taxRegime']),
      salary: _maps(map['salary']).map(SalaryRow.fromJson).toList(),
    );
  }

  final String id;
  final String name;
  final String designation;
  final String joinedOn;
  final String leftOn;
  final num monthly;
  final bool active;
  final bool pfMember;
  final bool esiMember;
  final String taxRegime;
  final List<SalaryRow> salary;
}

class PayrollTotals {
  const PayrollTotals({
    required this.gross,
    required this.pfEmployee,
    required this.esiEmployee,
    required this.pt,
    required this.tds,
    required this.deductions,
    required this.net,
    required this.employerContributions,
    required this.employerCost,
    this.lines = const <(String, num)>[],
    this.employerLines = const <(String, num)>[],
  });

  factory PayrollTotals.fromJson(Object? json) {
    final map = _map(json);
    List<(String, num)> pairs(Object? rows) => [for (final row in _maps(rows)) (_text(row['name']), _num(row['amount']))];
    return PayrollTotals(
      lines: pairs(map['lines']),
      employerLines: pairs(map['employerLines']),
      gross: _num(map['gross']),
      pfEmployee: _num(map['pfEmployee']),
      esiEmployee: _num(map['esiEmployee']),
      pt: _num(map['pt']),
      tds: _num(map['tds']),
      deductions: _num(map['deductions']),
      net: _num(map['net']),
      employerContributions: _num(map['employerContributions']),
      employerCost: _num(map['employerCost']),
    );
  }

  final num gross;
  final num pfEmployee;
  final num esiEmployee;
  final num pt;
  final num tds;
  final num deductions;
  final num net;
  final num employerContributions;
  final num employerCost;
  final List<(String, num)> lines;
  final List<(String, num)> employerLines;

  bool get hasOwnLines => lines.isNotEmpty || employerLines.isNotEmpty;
}

class PayrollRow {
  const PayrollRow({
    required this.employeeId,
    required this.name,
    required this.daysWorked,
    required this.daysInMonth,
    required this.gross,
    required this.deductions,
    required this.net,
    required this.notes,
  });

  factory PayrollRow.fromJson(Object? json) {
    final map = _map(json);
    final notes = map['notes'];
    return PayrollRow(
      employeeId: _text(map['employeeId']),
      name: _text(map['name']),
      daysWorked: _num(map['daysWorked']).toInt(),
      daysInMonth: _num(map['daysInMonth']).toInt(),
      gross: _num(map['gross']),
      deductions: _num(map['deductions']),
      net: _num(map['net']),
      notes: notes is List ? notes.map(_text).toList() : const <String>[],
    );
  }

  final String employeeId;
  final String name;
  final int daysWorked;
  final int daysInMonth;
  final num gross;
  final num deductions;
  final num net;
  final List<String> notes;
}

class PayrollRun {
  const PayrollRun({
    required this.period,
    required this.month,
    required this.status,
    required this.employees,
    required this.rows,
    required this.totals,
    required this.notes,
    required this.draftHash,
    required this.approvedOn,
    required this.paidOn,
    this.country = 'IN',
  });

  static PayrollRun? fromTool(Object? json) {
    final map = _map(json);
    if (map['ok'] == false) return null;
    final data = toolData(json);
    final notes = data['notes'];
    return PayrollRun(
      period: _text(data['period']),
      month: _text(data['month']),
      status: _text(data['status']),
      employees: _num(data['employees']).toInt(),
      rows: _maps(data['rows']).map(PayrollRow.fromJson).toList(),
      totals: PayrollTotals.fromJson(data['totals']),
      notes: notes is List ? notes.map(_text).toList() : const <String>[],
      draftHash: _text(data['draftHash']),
      approvedOn: _text(data['approvedOn']),
      country: _text(data['country']).isEmpty ? 'IN' : _text(data['country']).toUpperCase(),
      paidOn: _text(data['paidOn']),
    );
  }

  final String period;
  final String month;
  final String status;
  final int employees;
  final List<PayrollRow> rows;
  final PayrollTotals totals;
  final List<String> notes;
  final String draftHash;
  final String approvedOn;
  final String paidOn;
  final String country;

  bool get isUs => country == 'US';
}

class EmployeeList {
  const EmployeeList({
    required this.employees,
    required this.monthlyTotal,
    required this.note,
    this.error = '',
  });

  factory EmployeeList.fromTool(Object? json) {
    final map = _map(json);
    if (map['ok'] == false) {
      return EmployeeList(
        employees: const [],
        monthlyTotal: 0,
        note: '',
        error: map['error'] == 'SALARIES_PRIVATE'
            ? 'Only the owner can see employees and salaries.'
            : 'Employees could not be loaded.',
      );
    }
    final data = toolData(json);
    return EmployeeList(
      employees: _maps(data['employees']).map(Employee.fromJson).toList(),
      monthlyTotal: _num(data['monthlyTotal']),
      note: _text(data['note']),
    );
  }

  final List<Employee> employees;
  final num monthlyTotal;
  final String note;
  final String error;
}
