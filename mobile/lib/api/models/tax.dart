part of '../models.dart';

class TdsMonth {
  const TdsMonth({required this.month, required this.deducted, required this.depositBy});

  final String month;
  final num deducted;
  final String depositBy;
}

class TdsQuarter {
  const TdsQuarter({
    required this.quarter,
    this.kind = 'other',
    required this.deducted,
    required this.deposited,
    required this.shortfall,
    required this.dueDate,
    required this.form,
    required this.approved,
    required this.filedArn,
  });

  factory TdsQuarter.fromJson(Object? json) {
    final map = _map(json);
    final filed = map['filed'];
    return TdsQuarter(
      quarter: _text(map['quarter']),
      kind: _text(map['kind']).isEmpty ? 'other' : _text(map['kind']),
      deducted: _num(map['deducted']),
      deposited: _num(map['deposited']),
      shortfall: _num(map['shortfall']),
      dueDate: _text(map['dueDate']),
      form: _text(map['form']),
      approved: map['approved'] == true,
      filedArn: filed is Map ? _text(filed['arn']) : '',
    );
  }

  final String quarter;
  final String kind;
  final num deducted;
  final num deposited;
  final num shortfall;
  final String dueDate;
  final String form;
  final bool approved;
  final String filedArn;
}

class TdsSummary {
  const TdsSummary({
    required this.deductor,
    required this.tan,
    required this.deducted,
    required this.deposited,
    required this.due,
    required this.months,
    this.quarters = const <TdsQuarter>[],
  });

  static TdsSummary? fromTool(Object? json) {
    final map = _map(json);
    if (map['ok'] == false) return null;
    final data = toolData(json);
    return TdsSummary(
      deductor: data['deductor'] == true,
      tan: _text(data['tan']),
      deducted: _num(data['deducted']),
      deposited: _num(data['deposited']),
      due: _num(data['due']),
      months: [
        for (final row in _maps(data['months']))
          TdsMonth(month: _text(row['month']), deducted: _num(row['deducted']), depositBy: _text(row['depositBy'])),
      ],
      quarters: _maps(data['quarters']).map(TdsQuarter.fromJson).toList(),
    );
  }

  final bool deductor;
  final String tan;
  final num deducted;
  final num deposited;
  final num due;
  final List<TdsMonth> months;
  final List<TdsQuarter> quarters;
}

class TdsCreditRow {
  const TdsCreditRow({
    required this.section,
    required this.tan,
    required this.deductor,
    required this.customer,
    required this.quarter,
    required this.in26as,
    required this.inBooks,
    required this.gap,
    required this.status,
    this.note = '',
  });

  factory TdsCreditRow.fromJson(Object? json) {
    final map = _map(json);
    return TdsCreditRow(
      section: _text(map['section']),
      tan: _text(map['tan']),
      deductor: _text(map['deductor']),
      customer: _text(map['customer']),
      quarter: _text(map['quarter']),
      in26as: _num(map['in26as']),
      inBooks: _num(map['inBooks']),
      gap: _num(map['gap']),
      status: _text(map['status']),
      note: _text(map['note']).trim(),
    );
  }

  final String section;
  final String tan;
  final String deductor;
  final String customer;
  final String quarter;
  final num in26as;
  final num inBooks;
  final num gap;
  final String status;
  final String note;

  String get who => deductor.isNotEmpty ? deductor : customer;
}

class TdsCreditCheck {
  const TdsCreditCheck({
    required this.fy,
    required this.source,
    required this.rows,
    required this.in26as,
    required this.inBooks,
    required this.gap,
    required this.note,
  });

  static TdsCreditCheck? fromTool(Object? json) {
    final map = _map(json);
    if (map['ok'] == false) return null;
    final data = toolData(json);
    final totals = _map(data['totals']);
    return TdsCreditCheck(
      fy: _text(data['fy']),
      source: _text(data['source']),
      rows: _maps(data['rows']).map(TdsCreditRow.fromJson).toList(),
      in26as: _num(totals['in26as']),
      inBooks: _num(totals['inBooks']),
      gap: _num(totals['gap']),
      note: _text(data['note']),
    );
  }

  final String fy;
  final String source;
  final List<TdsCreditRow> rows;
  final num in26as;
  final num inBooks;
  final num gap;
  final String note;
}

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

class RulesStatus {
  const RulesStatus({required this.asOf, required this.records, required this.attested, required this.attention, required this.notes});

  static RulesStatus? fromTool(Object? json) {
    final map = _map(json);
    if (map['ok'] == false) return null;
    final data = toolData(json);
    final totals = _map(data['totals']);
    return RulesStatus(
      asOf: _text(data['asOf']),
      records: totals['records'] is num ? (totals['records'] as num).toInt() : 0,
      attested: totals['attested'] is num ? (totals['attested'] as num).toInt() : 0,
      attention: [for (final row in _maps(data['families'])) if (row['attention'] == true) _text(row['title'])],
      notes: [for (final note in (data['notes'] as List? ?? const [])) _text(note)],
    );
  }

  final String asOf;
  final int records;
  final int attested;
  final List<String> attention;
  final List<String> notes;

  String get summary => '$records dated records, $attested reviewed by your accountant.';
}

List<Deadline> deadlinesFrom(Object? json) =>
    _maps(toolData(json)['deadlines']).map(Deadline.fromJson).toList();

PeriodGst? periodGstFrom(Object? json) {
  final data = toolData(json);
  return data.isEmpty ? null : PeriodGst.fromJson(data);
}
