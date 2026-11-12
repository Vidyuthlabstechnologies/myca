part of '../models.dart';

class TaxHeads {
  const TaxHeads({
    required this.igst,
    required this.cgst,
    required this.sgst,
    required this.total,
  });

  factory TaxHeads.fromJson(Object? json) {
    final map = _map(json);
    return TaxHeads(
      igst: _num(map['igst']),
      cgst: _num(map['cgst']),
      sgst: _num(map['sgst']),
      total: _num(map['total']),
    );
  }

  final num igst;
  final num cgst;
  final num sgst;
  final num total;
}

class HeldInvoice {
  const HeldInvoice({required this.number, required this.code});

  factory HeldInvoice.fromJson(Object? json) {
    final map = _map(json);
    return HeldInvoice(number: _text(map['inum']), code: _text(map['code']));
  }

  final String number;
  final String code;
}

class Gstr1File {
  const Gstr1File({
    required this.fp,
    required this.b2b,
    required this.b2cl,
    required this.b2cs,
    required this.held,
    required this.warnings,
    required this.caveat,
  });

  factory Gstr1File.fromJson(Object? json) {
    final map = _map(json);
    final warnings = map['warnings'];
    return Gstr1File(
      fp: _text(map['fp']),
      b2b: _num(map['b2b']).toInt(),
      b2cl: _num(map['b2cl']).toInt(),
      b2cs: _num(map['b2cs']).toInt(),
      held: _maps(map['held']).map(HeldInvoice.fromJson).toList(),
      warnings: warnings is List
          ? warnings.map(_text).toList()
          : const <String>[],
      caveat: _text(map['caveat']),
    );
  }

  final String fp;
  final int b2b;
  final int b2cl;
  final int b2cs;
  final List<HeldInvoice> held;
  final List<String> warnings;
  final String caveat;

  bool get empty => b2b + b2cl + b2cs == 0;
}

class GstLate {
  const GstLate({
    required this.payOn,
    required this.days,
    required this.interest,
    required this.lateFee,
    required this.total,
  });

  factory GstLate.fromJson(Object? json) {
    final map = _map(json);
    return GstLate(
      payOn: _text(map['payOn']),
      days: _num(map['days']).toInt(),
      interest: _num(map['interest']),
      lateFee: _num(map['lateFee']),
      total: _num(map['total']),
    );
  }

  final String payOn;
  final int days;
  final num interest;
  final num lateFee;
  final num total;
}

class GstPayment {
  const GstPayment({
    required this.period,
    required this.output,
    required this.credit,
    required this.broughtForward,
    required this.broughtForwardKnown,
    required this.creditUsed,
    required this.cash,
    required this.toPay,
    required this.carried,
    required this.dueDate,
    required this.filedArn,
    required this.late,
    required this.unreviewed,
    required this.notes,
  });

  factory GstPayment.fromJson(Object? json) {
    final map = _map(json);
    final notes = map['notes'];
    final filed = map['filed'];
    return GstPayment(
      period: _text(map['period']),
      output: TaxHeads.fromJson(map['output']),
      credit: TaxHeads.fromJson(map['credit']),
      broughtForward: TaxHeads.fromJson(map['broughtForward']),
      broughtForwardKnown: map['broughtForwardKnown'] == true,
      creditUsed: _num(map['creditUsed']),
      cash: TaxHeads.fromJson(map['cash']),
      toPay: _num(map['toPay']),
      carried: TaxHeads.fromJson(map['carried']),
      dueDate: _text(map['dueDate']),
      filedArn: filed is Map ? _text(filed['arn']) : '',
      late: map['late'] is Map ? GstLate.fromJson(map['late']) : null,
      unreviewed: map['unreviewed'] == true,
      notes: notes is List ? notes.map(_text).toList() : const <String>[],
    );
  }

  final String period;
  final TaxHeads output;
  final TaxHeads credit;
  final TaxHeads broughtForward;
  final bool broughtForwardKnown;
  final num creditUsed;
  final TaxHeads cash;
  final num toPay;
  final TaxHeads carried;
  final String dueDate;
  final String filedArn;
  final GstLate? late;
  final bool unreviewed;
  final List<String> notes;
}

class InvoiceShare {
  const InvoiceShare({required this.on, required this.by, required this.channel, required this.outcome});

  factory InvoiceShare.fromJson(Object? json) {
    final map = _map(json);
    return InvoiceShare(on: _text(map['on']), by: _text(map['by']), channel: _text(map['channel']), outcome: _text(map['outcome']));
  }

  final String on;
  final String by;
  final String channel;
  final String outcome;
}

class EInvoice {
  const EInvoice({required this.status, required this.irn, required this.ackNo, required this.why});

  factory EInvoice.fromJson(Object? json) {
    final map = _map(json);
    return EInvoice(status: _text(map['status']), irn: _text(map['irn']), ackNo: _text(map['ackNo']), why: _text(map['why']));
  }

  final String status;
  final String irn;
  final String ackNo;
  final String why;
}

class EwayBill {
  const EwayBill({
    required this.needed,
    required this.why,
    required this.status,
    required this.transportWords,
    required this.ewbNo,
    required this.ewbValidity,
    required this.next,
  });

  factory EwayBill.fromJson(Object? json) {
    final map = _map(json);
    final transport = map['transport'];
    return EwayBill(
      needed: map['needed'] == true,
      why: _text(map['why']),
      status: _text(map['status']),
      transportWords: transport is Map ? _text(transport['words']) : '',
      ewbNo: _text(map['ewbNo']),
      ewbValidity: _text(map['ewbValidity']),
      next: _text(map['next']),
    );
  }

  final bool needed;
  final String why;
  final String status;
  final String transportWords;
  final String ewbNo;
  final String ewbValidity;
  final String next;
}

class PeriodGst {
  const PeriodGst({
    required this.period,
    required this.periods,
    required this.salesCount,
    required this.purchaseCount,
    required this.taxableSales,
    required this.outputTax,
    required this.inputCredit,
    required this.gstr1,
    this.payment,
  });

  factory PeriodGst.fromJson(Object? json) {
    final map = _map(json);
    final periods = map['periods'];
    return PeriodGst(
      period: _text(map['period']),
      periods: periods is List ? periods.map(_text).toList() : const <String>[],
      salesCount: _num(map['salesCount']).toInt(),
      purchaseCount: _num(map['purchaseCount']).toInt(),
      taxableSales: _num(map['taxableSales']),
      outputTax: TaxHeads.fromJson(map['outputTax']),
      inputCredit: TaxHeads.fromJson(map['inputCredit']),
      gstr1: Gstr1File.fromJson(map['gstr1']),
      payment: map['payment'] is Map ? GstPayment.fromJson(map['payment']) : null,
    );
  }

  final String period;
  final List<String> periods;
  final int salesCount;
  final int purchaseCount;
  final num taxableSales;
  final TaxHeads outputTax;
  final TaxHeads inputCredit;
  final Gstr1File gstr1;
  final GstPayment? payment;
}

class Deadline {
  const Deadline({
    required this.label,
    required this.period,
    required this.dueDate,
    required this.daysUntil,
    required this.level,
    this.returnType = '',
    this.filedArn = '',
  });

  factory Deadline.fromJson(Object? json) {
    final map = _map(json);
    final label = _text(map['returnLabel']);
    return Deadline(
      label: label.isEmpty ? _text(map['returnType']) : label,
      returnType: _text(map['returnType']),
      period: _text(map['period']),
      dueDate: _text(map['dueDate']),
      daysUntil: _num(map['daysUntil']).toInt(),
      level: _text(map['level']),
      filedArn: _text(_map(map['filed'])['arn']),
    );
  }

  final String label;
  final String returnType;
  final String period;
  final String dueDate;
  final int daysUntil;
  final String level;
  final String filedArn;

  bool get onTrack => level == 'on_track';

  bool get filed => filedArn.isNotEmpty;
}

class FiledReturn {
  const FiledReturn({
    required this.label,
    required this.period,
    required this.arn,
    required this.filedOn,
    required this.late,
  });

  factory FiledReturn.fromJson(Object? json) {
    final map = _map(json);
    final label = _text(map['label']);
    return FiledReturn(
      label: label.isEmpty ? _text(map['returnType']) : label,
      period: _text(map['period']),
      arn: _text(map['arn']),
      filedOn: _text(map['filedOn']),
      late: map['late'] == true,
    );
  }

  final String label;
  final String period;
  final String arn;
  final String filedOn;
  final bool late;
}

List<FiledReturn> filedReturnsFrom(Object? json) {
  final data = json is Map ? json['data'] : null;
  return data is List ? data.map(FiledReturn.fromJson).toList() : const [];
}

class ExceptionItem {
  const ExceptionItem({
    required this.id,
    required this.title,
    required this.why,
    required this.severity,
    required this.moneyAtRisk,
    required this.status,
  });

  factory ExceptionItem.fromJson(Object? json) {
    final map = _map(json);
    return ExceptionItem(
      id: _text(map['id']),
      title: _text(map['title']),
      why: _text(map['why']),
      severity: _text(map['severity']),
      moneyAtRisk: _num(map['moneyAtRisk']),
      status: _text(map['status']),
    );
  }

  final String id;
  final String title;
  final String why;
  final String severity;
  final num moneyAtRisk;
  final String status;

  bool get open => status == 'open';
}

class MonthFigures {
  const MonthFigures({
    required this.sales,
    required this.salesNet,
    required this.purchases,
    required this.expenses,
    this.payrollStatus = 'hidden',
    this.payrollGross = 0,
    this.payrollPaidOn = '',
  });

  factory MonthFigures.fromJson(Object? json) {
    final map = _map(json);
    final payroll = map['payroll'];
    return MonthFigures(
      sales: _num(_map(map['sales'])['total']),
      salesNet: _num(_map(map['sales'])['net']),
      purchases: _num(_map(map['purchases'])['total']),
      expenses: _num(_map(map['expenses'])['total']),
      payrollStatus: payroll is Map ? _text(payroll['status']) : 'hidden',
      payrollGross: payroll is Map ? _num(payroll['gross']) : 0,
      payrollPaidOn: payroll is Map ? _text(payroll['paidOn']) : '',
    );
  }

  final num sales;
  final num salesNet;
  final num purchases;
  final num expenses;
  final String payrollStatus;
  final num payrollGross;
  final String payrollPaidOn;
}

class OwedCustomer {
  const OwedCustomer({
    required this.name,
    required this.due,
    required this.invoices,
  });

  factory OwedCustomer.fromJson(Object? json) {
    final map = _map(json);
    return OwedCustomer(
      name: _text(map['name']),
      due: _num(map['due']),
      invoices: _num(map['invoices']).toInt(),
    );
  }

  final String name;
  final num due;
  final int invoices;
}

class BusinessSummary {
  const BusinessSummary({
    required this.period,
    required this.previousPeriod,
    required this.current,
    required this.previous,
    required this.owedToYou,
    required this.openInvoices,
    required this.customers,
    required this.caveat,
    this.owedBySuppliers = 0,
    this.unpaidBills = 0,
    this.suppliers = const [],
  });

  factory BusinessSummary.fromJson(Object? json) {
    final map = _map(json);
    final owed = _map(map['owedToYou']);
    final owing = _map(map['owedBySuppliers']);
    return BusinessSummary(
      period: _text(map['period']),
      previousPeriod: _text(map['previousPeriod']),
      current: MonthFigures.fromJson(map['current']),
      previous: MonthFigures.fromJson(map['previous']),
      owedToYou: _num(owed['total']),
      openInvoices: _num(owed['invoices']).toInt(),
      customers: _maps(owed['customers']).map(OwedCustomer.fromJson).toList(),
      caveat: _text(map['caveat']),
      owedBySuppliers: _num(owing['total']),
      unpaidBills: _num(owing['bills']).toInt(),
      suppliers: _maps(
        owing['suppliers'],
      ).map(OwedCustomer.fromJson).toList(),
    );
  }

  final String period;
  final String previousPeriod;
  final MonthFigures current;
  final MonthFigures previous;
  final num owedToYou;
  final int openInvoices;
  final List<OwedCustomer> customers;
  final String caveat;
  final num owedBySuppliers;
  final int unpaidBills;
  final List<OwedCustomer> suppliers;
}

BusinessSummary? businessSummaryFrom(Object? json) {
  final data = toolData(json);
  return data.isEmpty ? null : BusinessSummary.fromJson(data);
}

class ReviewLine {
  const ReviewLine({
    required this.label,
    required this.amount,
    required this.strong,
  });

  factory ReviewLine.fromJson(Object? json) {
    final map = _map(json);
    final amount = map['amount'];
    return ReviewLine(
      label: _text(map['label']),
      amount: amount is num ? amount : null,
      strong: map['strong'] == true,
    );
  }

  final String label;
  final num? amount;
  final bool strong;
}

class ReviewStep {
  const ReviewStep({
    required this.id,
    required this.title,
    required this.lines,
    required this.explain,
    required this.question,
    required this.yes,
    required this.no,
    required this.status,
    required this.waitingFor,
    required this.note,
  });

  factory ReviewStep.fromJson(Object? json) {
    final map = _map(json);
    final waiting = map['waitingFor'];
    return ReviewStep(
      id: _text(map['id']),
      title: _text(map['title']),
      lines: _maps(map['lines']).map(ReviewLine.fromJson).toList(),
      explain: _text(map['note']),
      question: _text(map['question']),
      yes: _text(map['yes']),
      no: _text(map['no']),
      status: _text(map['status']),
      waitingFor: waiting is String ? waiting : null,
      note: _text(_map(map['answer'])['note']),
    );
  }

  final String id;
  final String title;
  final List<ReviewLine> lines;
  final String explain;
  final String question;
  final String yes;
  final String no;
  final String status;
  final String? waitingFor;
  final String note;
}

class GstReview {
  const GstReview({
    required this.period,
    required this.month,
    required this.draftHash,
    required this.empty,
    required this.changed,
    required this.steps,
    required this.next,
    required this.approved,
    required this.approvedOn,
  });

  static GstReview? fromTool(Object? json) {
    final map = toolData(json);
    if (_text(map['period']).isEmpty) return null;
    final next = map['next'];
    return GstReview(
      period: _text(map['period']),
      month: _text(map['month']),
      draftHash: _text(map['draftHash']),
      empty: map['empty'] == true,
      changed: map['changed'] == true,
      steps: _maps(map['steps']).map(ReviewStep.fromJson).toList(),
      next: next is String ? next : null,
      approved: map['approved'] == true,
      approvedOn: _text(_map(map['approval'])['on']),
    );
  }

  final String period;
  final String month;
  final String draftHash;
  final bool empty;
  final bool changed;
  final List<ReviewStep> steps;
  final String? next;
  final bool approved;
  final String approvedOn;
}

class CreditRisk {
  const CreditRisk({
    required this.billId,
    required this.supplierInvoiceNo,
    required this.supplier,
    required this.gstin,
    required this.date,
    required this.credit,
    required this.reason,
    required this.why,
  });

  factory CreditRisk.fromJson(Object? json) {
    final map = _map(json);
    return CreditRisk(
      billId: _text(map['billId']),
      supplierInvoiceNo: _text(map['supplierInvoiceNo']),
      supplier: _text(map['supplier']),
      gstin: _text(map['gstin']),
      date: _text(map['date']),
      credit: _num(map['credit']),
      reason: _text(map['reason']),
      why: _text(map['why']),
    );
  }

  final String billId;
  final String supplierInvoiceNo;
  final String supplier;
  final String gstin;
  final String date;
  final num credit;
  final String reason;
  final String why;
}

class ImsRow {
  const ImsRow({
    required this.key,
    required this.section,
    required this.supplierGstin,
    required this.supplierName,
    required this.invoiceNo,
    required this.invoiceDate,
    required this.taxableValue,
    required this.credit,
    required this.totalValue,
    required this.itcAvailability,
    required this.billId,
    required this.match,
    required this.why,
    required this.suggested,
    required this.decision,
    required this.note,
    this.lines = 1,
  });

  factory ImsRow.fromJson(Object? json) {
    final map = _map(json);
    final decision = _text(map['decision']);
    return ImsRow(
      key: _text(map['key']),
      section: _text(map['section']),
      supplierGstin: _text(map['supplierGstin']),
      supplierName: _text(map['supplierName']),
      invoiceNo: _text(map['invoiceNo']),
      invoiceDate: _text(map['invoiceDate']),
      taxableValue: _num(map['taxableValue']),
      credit: _num(map['credit']),
      totalValue: _num(map['totalValue']),
      itcAvailability: _text(map['itcAvailability']),
      billId: _text(map['billId']),
      match: _text(map['match']),
      why: _text(map['why']),
      suggested: _text(map['suggested']) == 'accept' ? 'accept' : 'pending',
      decision: const {'accept', 'reject', 'pending'}.contains(decision) ? decision : '',
      note: _text(map['note']),
      lines: _num(map['lines']) >= 1 ? _num(map['lines']).toInt() : 1,
    );
  }

  final String key;
  final String section;
  final String supplierGstin;
  final String supplierName;
  final String invoiceNo;
  final String invoiceDate;
  final num taxableValue;
  final num credit;
  final num totalValue;
  final String itcAvailability;
  final String billId;
  final String match;
  final String why;
  final String suggested;
  final String decision;
  final String note;
  final int lines;

  bool get decided => decision.isNotEmpty;

  bool get inBooks => billId.isNotEmpty;

  String get title => [supplierName, invoiceNo].where((part) => part.isNotEmpty).join(' · ');

  String get creditWords => credit < 0 ? '${rupees(-credit)} less credit' : '${rupees(credit)} credit';

  String get linesWords => lines > 1 ? '$lines lines' : '';

  String get subtitle => [if (invoiceDate.isNotEmpty) longDate(invoiceDate), creditWords, match, linesWords].where((part) => part.isNotEmpty).join(' · ');

  String get decisionWords => switch (decision) {
    'accept' => 'Accepted',
    'reject' => 'Rejected',
    'pending' => 'Pending',
    _ => '',
  };

  String get statusWords => decided ? decisionWords : 'Suggest $suggested';

  String get itcWords => switch (itcAvailability) {
    'Y' => 'Credit available in 2B',
    'N' => 'Credit not available in 2B',
    _ => '',
  };
}

class ImsCounts {
  const ImsCounts({
    required this.total,
    required this.accept,
    required this.reject,
    required this.pending,
    required this.undecided,
  });

  factory ImsCounts.fromJson(Object? json) {
    final map = _map(json);
    return ImsCounts(
      total: _num(map['total']).toInt(),
      accept: _num(map['accept']).toInt(),
      reject: _num(map['reject']).toInt(),
      pending: _num(map['pending']).toInt(),
      undecided: _num(map['undecided']).toInt(),
    );
  }

  final int total;
  final int accept;
  final int reject;
  final int pending;
  final int undecided;
}

class ImsReview {
  const ImsReview({
    required this.period,
    required this.statementRows,
    required this.hasStatement,
    required this.rows,
    required this.counts,
    required this.creditUndecided,
    required this.creditAccepted,
    required this.orphaned,
    required this.note,
  });

  static ImsReview? fromTool(Object? json) {
    final map = toolData(json);
    if (_text(map['period']).isEmpty) return null;
    final statement = map['statement'];
    final credit = _map(map['credit']);
    return ImsReview(
      period: _text(map['period']),
      statementRows: _num(_map(statement)['rows']).toInt(),
      hasStatement: statement is Map,
      rows: _maps(map['rows']).map(ImsRow.fromJson).toList(),
      counts: ImsCounts.fromJson(map['counts']),
      creditUndecided: _num(credit['undecided']),
      creditAccepted: _num(credit['accepted']),
      orphaned: _num(map['orphaned']).toInt(),
      note: _text(map['note']),
    );
  }

  final String period;
  final int statementRows;
  final bool hasStatement;
  final List<ImsRow> rows;
  final ImsCounts counts;
  final num creditUndecided;
  final num creditAccepted;
  final int orphaned;
  final String note;

  int get matchedRows => rows.where((row) => row.match == 'matched' || row.match == 'date differs').length;

  int get acceptableRows => rows.where((row) => (row.match == 'matched' || row.match == 'date differs') && row.decision != 'accept').length;
}

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
