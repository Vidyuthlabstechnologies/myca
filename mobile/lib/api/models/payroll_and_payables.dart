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

class PaymentRunBill {
  const PaymentRunBill({
    required this.billId,
    required this.supplier,
    required this.supplierInvoiceNo,
    required this.outstanding,
    required this.bucket,
    required this.daysLeft,
    required this.daysToCredit,
    required this.age,
    required this.reason,
  });

  factory PaymentRunBill.fromJson(Map<String, dynamic> map) => PaymentRunBill(
    billId: _text(map['billId']),
    supplier: _text(map['supplier']),
    supplierInvoiceNo: _text(map['supplierInvoiceNo']),
    outstanding: _num(map['outstanding']),
    bucket: _text(map['bucket']),
    daysLeft: map['daysLeft'] is num ? (map['daysLeft'] as num).toInt() : null,
    daysToCredit: _num(map['daysToCredit']).toInt(),
    age: _num(map['age']).toInt(),
    reason: _text(map['reason']),
  );

  final String billId;
  final String supplier;
  final String supplierInvoiceNo;
  final num outstanding;
  final String bucket;
  final int? daysLeft;
  final int daysToCredit;
  final int age;
  final String reason;

  bool get urgent => bucket == 'msme-limit' || bucket == 'credit-at-risk';

  String get whenWords {
    final left = daysLeft;
    switch (bucket) {
      case 'msme-limit':
        if (left == null) return 'MSMED pay-by date';
        if (left < 0) return '${-left} days past the MSMED pay-by date';
        if (left == 0) return 'MSMED pay-by date is today';
        return 'MSMED pay-by date in $left days';
      case 'credit-at-risk':
        return daysToCredit < 0
            ? 'past 180 days, credit reversible'
            : '$daysToCredit days to the 180-day credit limit';
      case 'due':
        if (left == null) return 'due';
        if (left < 0) return '${-left} days past the agreed date';
        if (left == 0) return 'due today';
        return 'due in $left days';
      case 'aging':
        return '$age days old, no agreed terms';
      default:
        return left == null ? '$age days old' : 'due in $left days';
    }
  }
}

class SupplierDueBill {
  const SupplierDueBill({
    required this.billId,
    required this.supplier,
    required this.gstin,
    required this.date,
    required this.total,
    required this.outstanding,
    required this.payBy,
    required this.daysLeft,
    required this.overdue,
    required this.msme,
  });

  factory SupplierDueBill.fromJson(Map<String, dynamic> map) => SupplierDueBill(
    billId: _text(map['billId']),
    supplier: _text(map['supplier']),
    gstin: _text(map['gstin']),
    date: _text(map['date']),
    total: _num(map['total']),
    outstanding: _num(map['outstanding']),
    payBy: _text(map['payBy']),
    daysLeft: _num(map['daysLeft']).toInt(),
    overdue: map['overdue'] == true,
    msme: map['msme'] == true,
  );

  final String billId;
  final String supplier;
  final String gstin;
  final String date;
  final num total;
  final num outstanding;
  final String payBy;
  final int daysLeft;
  final bool overdue;
  final bool msme;
}

class MsmePosition {
  const MsmePosition({
    required this.count,
    required this.outstanding,
    required this.overdue,
    required this.overdueOutstanding,
    required this.rule,
  });

  factory MsmePosition.fromJson(Object? json) {
    final map = _map(json);
    return MsmePosition(
      count: _num(map['count']).toInt(),
      outstanding: _num(map['outstanding']),
      overdue: _num(map['overdue']).toInt(),
      overdueOutstanding: _num(map['overdueOutstanding']),
      rule: _text(map['rule']),
    );
  }

  final int count;
  final num outstanding;
  final int overdue;
  final num overdueOutstanding;
  final String rule;
}

class SupplierDues {
  const SupplierDues({
    required this.asOf,
    required this.bills,
    required this.msme,
    required this.note,
  });

  factory SupplierDues.fromTool(Object? json) {
    final data = toolData(json);
    return SupplierDues(
      asOf: _text(data['asOf']),
      bills: _maps(data['bills']).map(SupplierDueBill.fromJson).toList(),
      msme: MsmePosition.fromJson(data['msme']),
      note: _text(data['note']),
    );
  }

  final String asOf;
  final List<SupplierDueBill> bills;
  final MsmePosition msme;
  final String note;
}

class PaymentRun {
  const PaymentRun({
    required this.asOf,
    required this.windowDays,
    required this.proposed,
    required this.consider,
    required this.later,
    required this.held,
    required this.total,
    required this.laterTotal,
    required this.balance,
    required this.fromReading,
    required this.after,
    required this.verdict,
  });

  static PaymentRun? fromTool(Object? json) {
    final map = toolData(json);
    if (map['proposed'] is! List) return null;
    return PaymentRun(
      asOf: _text(map['asOf']),
      windowDays: _num(map['windowDays']).toInt(),
      proposed: _maps(map['proposed']).map(PaymentRunBill.fromJson).toList(),
      consider: _maps(map['consider']).map(PaymentRunBill.fromJson).toList(),
      later: _maps(map['later']).map(PaymentRunBill.fromJson).toList(),
      held: _maps(map['held']).map(PaymentRunBill.fromJson).toList(),
      total: _num(map['total']),
      laterTotal: _num(map['laterTotal']),
      balance: _num(map['balance']),
      fromReading: _text(map['balanceSource']) == 'reading',
      after: _num(map['after']),
      verdict: _text(map['verdict']),
    );
  }

  final String asOf;
  final int windowDays;
  final List<PaymentRunBill> proposed;
  final List<PaymentRunBill> consider;
  final List<PaymentRunBill> later;
  final List<PaymentRunBill> held;
  final num total;
  final num laterTotal;
  final num balance;
  final bool fromReading;
  final num after;
  final String verdict;

  String get verdictWords {
    switch (verdict) {
      case 'no':
        return 'Paying all of these takes the balance below zero before the month is out.';
      case 'tight':
        return "Tight against the month's usual outgoings.";
      case 'yes':
        return 'Payroll and GST still clear.';
      default:
        return '';
    }
  }
}

class CollectionDraft {
  const CollectionDraft({
    required this.customer,
    required this.total,
    required this.invoices,
    required this.oldestDaysLate,
    required this.tone,
    required this.scoreWords,
    required this.message,
    required this.lastSent,
    required this.timesSent,
  });

  static CollectionDraft? fromTool(Object? json) {
    final data = toolData(json);
    final rows = _maps(data['customers']);
    if (rows.isEmpty) return null;
    final map = rows.first;
    if (_text(map['message']).isEmpty) return null;
    return CollectionDraft(
      customer: _text(map['customer']),
      total: _num(map['total']),
      invoices: _maps(map['invoices']).length,
      oldestDaysLate: _num(map['oldestDaysLate']).toInt(),
      tone: _text(map['tone']),
      scoreWords: _text(map['scoreWords']),
      message: _text(map['message']),
      lastSent: _text(map['lastSent']),
      timesSent: _num(map['timesSent']).toInt(),
    );
  }

  final String customer;
  final num total;
  final int invoices;
  final int oldestDaysLate;
  final String tone;
  final String scoreWords;
  final String message;
  final String lastSent;
  final int timesSent;
}

class SupplierReminderDraft {
  const SupplierReminderDraft({
    required this.supplier,
    required this.period,
    required this.bills,
    required this.credit,
    required this.message,
    required this.lastSent,
    required this.timesSent,
  });

  static SupplierReminderDraft? fromTool(Object? json) {
    final map = toolData(json);
    if (_text(map['message']).isEmpty) return null;
    return SupplierReminderDraft(
      supplier: _text(map['supplier']),
      period: _text(map['period']),
      bills: _maps(map['bills']).length,
      credit: _num(map['credit']),
      message: _text(map['message']),
      lastSent: _text(map['lastSent']),
      timesSent: _num(map['timesSent']).toInt(),
    );
  }

  final String supplier;
  final String period;
  final int bills;
  final num credit;
  final String message;
  final String lastSent;
  final int timesSent;
}

class CreditCheck {
  const CreditCheck({
    required this.period,
    required this.statementFile,
    required this.statementOn,
    required this.bills,
    required this.creditInBooks,
    required this.creditMatched,
    required this.creditAtRisk,
    required this.risks,
    required this.bySupplier,
    required this.notBooked,
  });

  static CreditCheck? fromTool(Object? json) {
    final map = toolData(json);
    if (_text(map['period']).isEmpty) return null;
    final statement = _map(map['statement']);
    return CreditCheck(
      period: _text(map['period']),
      statementFile: _text(statement['fileName']),
      statementOn: _text(statement['importedOn']),
      bills: _num(map['bills']).toInt(),
      creditInBooks: _num(map['creditInBooks']),
      creditMatched: _num(map['creditMatched']),
      creditAtRisk: _num(map['creditAtRisk']),
      risks: _maps(map['risks']).map(CreditRisk.fromJson).toList(),
      bySupplier: _maps(map['bySupplier']).map(SupplierRisk.fromJson).toList(),
      notBooked: _maps(map['notBooked']).length,
    );
  }

  final String period;
  final String statementFile;
  final String statementOn;
  final int bills;
  final num creditInBooks;
  final num creditMatched;
  final num creditAtRisk;
  final List<CreditRisk> risks;
  final List<SupplierRisk> bySupplier;
  final int notBooked;

  bool get hasStatement => statementFile.isNotEmpty;
}

class CheckFinding {
  const CheckFinding({
    required this.id,
    required this.severity,
    required this.title,
    required this.detail,
    required this.action,
  });

  factory CheckFinding.fromJson(Object? json) {
    final map = _map(json);
    return CheckFinding(
      id: _text(map['id']),
      severity: _text(map['severity']),
      title: _text(map['title']),
      detail: _text(map['detail']),
      action: _text(map['action']),
    );
  }

  final String id;
  final String severity;
  final String title;
  final String detail;
  final String action;
}

class BooksCheck {
  const BooksCheck({
    required this.asOfDate,
    required this.headline,
    required this.findings,
  });

  static BooksCheck? fromTool(Object? json) {
    final map = toolData(json);
    if (_text(map['headline']).isEmpty) return null;
    return BooksCheck(
      asOfDate: _text(map['asOfDate']),
      headline: _text(map['headline']),
      findings: _maps(map['findings']).map(CheckFinding.fromJson).toList(),
    );
  }

  final String asOfDate;
  final String headline;
  final List<CheckFinding> findings;
}

class Reminder {
  const Reminder({
    required this.id,
    required this.text,
    required this.due,
    required this.inDays,
    required this.state,
    required this.aboutLabel,
    this.documentSha256 = '',
    this.documentName = '',
  });

  factory Reminder.fromJson(Object? json) {
    final map = _map(json);
    final about = _map(map['about']);
    final id = _text(about['id']);
    final name = _text(about['name']);
    return Reminder(
      id: _text(map['id']),
      text: _text(map['text']),
      due: _text(map['due']),
      inDays: _num(map['inDays']).toInt(),
      state: _text(map['state']),
      aboutLabel: _text(about['kind']) == 'document'
          ? name
          : [id, name].where((part) => part.isNotEmpty).join(', '),
      documentSha256: _text(map['documentSha256']),
      documentName: _text(map['documentName']),
    );
  }

  final String id;
  final String text;
  final String due;
  final int inDays;
  final String state;
  final String aboutLabel;
  final String documentSha256;
  final String documentName;

  bool get hasDocument => documentSha256.isNotEmpty;
  bool get isDue => state == 'overdue' || state == 'today';
}

List<Reminder> remindersFrom(Object? json) =>
    _maps(toolData(json)['reminders']).map(Reminder.fromJson).toList();

class CashRow {
  const CashRow({
    required this.date,
    required this.label,
    required this.amount,
    required this.basis,
    required this.incoming,
  });

  factory CashRow.fromJson(Object? json, {required bool incoming}) {
    final map = _map(json);
    return CashRow(
      date: _text(map['date']),
      label: _text(map['label']),
      amount: _num(map['amount']),
      basis: _text(map['basis']),
      incoming: incoming,
    );
  }

  final String date;
  final String label;
  final num amount;
  final String basis;
  final bool incoming;
}

class CashForecast {
  const CashForecast({
    required this.days,
    required this.until,
    required this.startAmount,
    required this.bank,
    required this.cash,
    required this.fromReading,
    required this.readingOn,
    required this.startNote,
    required this.comingTotal,
    required this.goingTotal,
    required this.end,
    required this.lowest,
    required this.lowestOn,
    required this.overdueTotal,
    required this.rows,
    required this.notes,
  });

  static CashForecast? fromTool(Object? json) {
    final map = toolData(json);
    if (_text(map['from']).isEmpty) return null;
    final start = _map(map['start']);
    final coming = _map(map['coming']);
    final going = _map(map['going']);
    final lowest = _map(map['lowest']);
    final rows = [
      ..._maps(
        coming['rows'],
      ).map((row) => CashRow.fromJson(row, incoming: true)),
      ..._maps(
        going['rows'],
      ).map((row) => CashRow.fromJson(row, incoming: false)),
    ]..sort((a, b) => a.date.compareTo(b.date));
    final notes = map['notes'];
    return CashForecast(
      days: _num(map['days']).toInt(),
      until: _text(map['until']),
      startAmount: _num(start['amount']),
      bank: _num(start['bank']),
      cash: _num(start['cash']),
      fromReading: start['source'] == 'reading',
      readingOn: _text(start['readingOn']),
      startNote: _text(start['note']),
      comingTotal: _num(coming['total']),
      goingTotal: _num(going['total']),
      end: _num(map['end']),
      lowest: _num(lowest['amount']),
      lowestOn: _text(lowest['date']),
      overdueTotal: _num(_map(map['overdue'])['total']),
      rows: rows,
      notes: notes is List ? notes.map(_text).toList() : const [],
    );
  }

  final int days;
  final String until;
  final num startAmount;
  final num bank;
  final num cash;
  final bool fromReading;
  final String readingOn;
  final String startNote;
  final num comingTotal;
  final num goingTotal;
  final num end;
  final num lowest;
  final String lowestOn;
  final num overdueTotal;
  final List<CashRow> rows;
  final List<String> notes;
}

class Affordability {
  const Affordability({
    required this.verdict,
    required this.amount,
    required this.on,
    required this.balanceThen,
    required this.left,
    required this.monthsCovered,
    required this.safeToSpend,
  });

  static Affordability? fromTool(Object? json) {
    final map = toolData(json);
    if (_text(map['verdict']).isEmpty) return null;
    final months = map['monthsCovered'];
    return Affordability(
      verdict: _text(map['verdict']),
      amount: _num(map['amount']),
      on: _text(map['on']),
      balanceThen: _num(map['balanceThen']),
      left: _num(map['left']),
      monthsCovered: months is num ? months : null,
      safeToSpend: _num(map['safeToSpend']),
    );
  }

  final String verdict;
  final num amount;
  final String on;
  final num balanceThen;
  final num left;
  final num? monthsCovered;
  final num safeToSpend;

  String get headline => switch (verdict) {
    'yes' => 'Yes',
    'tight' => 'Yes, but it is tight',
    _ => 'Not on these figures',
  };

  String get detail {
    final covered = monthsCovered == null
        ? ''
        : ' That is about $monthsCovered months of your usual outgoings.';
    final keep = verdict == 'yes'
        ? ''
        : ' To keep a month in hand, spend up to ${rupees(safeToSpend)}.';
    return 'You would have about ${rupees(balanceThen)} then. After spending ${rupees(amount)}, the lowest point in the month after is ${rupees(left)}.$covered$keep';
  }
}

class CaMessage {
  const CaMessage({required this.by, required this.on, required this.text});

  factory CaMessage.fromJson(Object? json) {
    final map = _map(json);
    return CaMessage(
      by: _text(map['by']),
      on: _text(map['on']),
      text: _text(map['text']),
    );
  }

  final String by;
  final String on;
  final String text;
}

class CaRequest {
  const CaRequest({
    required this.id,
    required this.title,
    required this.facts,
    required this.status,
    required this.askedBy,
    required this.lastOn,
    required this.messages,
    required this.text,
    this.attachments = const [],
  });

  factory CaRequest.fromJson(Object? json) {
    final map = _map(json);
    final facts = map['facts'];
    return CaRequest(
      id: _text(map['id']),
      title: _text(map['title']),
      facts: facts is List ? facts.map(_text).toList() : const [],
      status: _text(map['status']),
      askedBy: _text(map['askedBy']),
      lastOn: _text(map['lastOn']),
      messages: _maps(map['messages']).map(CaMessage.fromJson).toList(),
      attachments: [for (final a in _maps(map['attachments'])) _text(a['name']).isEmpty ? _text(a['sha256']).substring(0, 12) : _text(a['name'])],
      text: _text(map['text']),
    );
  }

  final String id;
  final String title;
  final List<String> facts;
  final String status;
  final String askedBy;
  final String lastOn;
  final List<CaMessage> messages;
  final String text;
  final List<String> attachments;
}

List<CaRequest> caRequestsFrom(Object? json) =>
    _maps(toolData(json)['requests']).map(CaRequest.fromJson).toList();
