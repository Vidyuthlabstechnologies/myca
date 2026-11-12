part of '../models.dart';

class SupplierRisk {
  const SupplierRisk({
    required this.supplier,
    required this.gstin,
    required this.credit,
    required this.bills,
  });

  factory SupplierRisk.fromJson(Object? json) {
    final map = _map(json);
    return SupplierRisk(
      supplier: _text(map['supplier']),
      gstin: _text(map['gstin']),
      credit: _num(map['credit']),
      bills: _num(map['bills']).toInt(),
    );
  }

  final String supplier;
  final String gstin;
  final num credit;
  final int bills;
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
