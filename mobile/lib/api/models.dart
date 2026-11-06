import '../format.dart';

Map<String, dynamic> _map(Object? value) =>
    value is Map ? value.cast<String, dynamic>() : const <String, dynamic>{};

List<Map<String, dynamic>> _maps(Object? value) =>
    value is List ? value.map(_map).toList() : const <Map<String, dynamic>>[];

num _num(Object? value) => value is num ? value : 0;

String _text(Object? value) => value == null ? '' : value.toString();

class Company {
  const Company({required this.name, required this.gstin, this.tdsDeductor = false, this.country = 'IN', this.gstFrequency = 'monthly'});

  factory Company.fromJson(Object? json) {
    final map = _map(json);
    return Company(
      name: _text(map['name']),
      gstin: _text(map['gstin']),
      tdsDeductor: map['tdsDeductor'] == true,
      country: _text(map['country']).isEmpty ? 'IN' : _text(map['country']).toUpperCase(),
      gstFrequency: _text(map['gstFrequency']).toLowerCase() == 'quarterly' ? 'quarterly' : 'monthly',
    );
  }

  final String name;
  final String gstin;
  final String country;
  final String gstFrequency;

  bool get quarterlyGst => gstFrequency == 'quarterly';
  final bool tdsDeductor;
}

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

class FirmUser {
  const FirmUser({
    required this.userId,
    required this.name,
    required this.role,
    required this.locked,
  });

  factory FirmUser.fromJson(Object? json) {
    final map = _map(json);
    return FirmUser(
      userId: _text(map['userId']),
      name: _text(map['name']),
      role: _text(map['role']),
      locked: map['locked'] == true,
    );
  }

  final String userId;
  final String name;
  final String role;
  final bool locked;
}

class Receipt {
  const Receipt({required this.amount, required this.date, required this.mode});

  factory Receipt.fromJson(Object? json) {
    final map = _map(json);
    return Receipt(
      amount: _num(map['amount']),
      date: _text(map['date']),
      mode: _text(map['mode']),
    );
  }

  final num amount;
  final String date;
  final String mode;
}

class CreditNote {
  const CreditNote({
    required this.id,
    required this.date,
    required this.invoiceId,
    required this.partyName,
    required this.reason,
    required this.total,
    required this.cancels,
  });

  factory CreditNote.fromJson(Object? json) {
    final map = _map(json);
    return CreditNote(
      id: _text(map['id']),
      date: _text(map['date']),
      invoiceId: _text(map['invoiceId']),
      partyName: _text(map['partyName']),
      reason: _text(map['reason']),
      total: _num(map['total']),
      cancels: map['cancels'] == true,
    );
  }

  final String id;
  final String date;
  final String invoiceId;
  final String partyName;
  final String reason;
  final num total;
  final bool cancels;
}

class Invoice {
  const Invoice({
    required this.id,
    required this.date,
    required this.partyName,
    required this.partyGstin,
    required this.total,
    required this.status,
    required this.receipts,
    required this.gstRates,
    this.payments = const [],
    this.dueDate = '',
    this.termsDays,
    this.msme = false,
  });

  factory Invoice.fromJson(Object? json) {
    final map = _map(json);
    return Invoice(
      id: _text(map['id']),
      date: _text(map['date']),
      partyName: _text(map['partyName']),
      partyGstin: _text(map['partyGstin']),
      total: _num(map['total']),
      status: _text(map['status']),
      receipts: _maps(map['receipts']).map(Receipt.fromJson).toList(),
      payments: _maps(map['payments']).map(Receipt.fromJson).toList(),
      dueDate: _text(map['dueDate']),
      msme: map['msme'] == true,
      termsDays: map['paymentTermsDays'] is num
          ? (map['paymentTermsDays'] as num).toInt()
          : null,
      gstRates: [
        for (final line in _maps(map['lines']))
          if (line['gstRate'] is num) line['gstRate'] as num,
      ],
    );
  }

  final String id;
  final String date;
  final String partyName;
  final String partyGstin;
  final num total;
  final String status;
  final List<Receipt> receipts;
  final List<Receipt> payments;
  final List<num> gstRates;
  final String dueDate;
  final int? termsDays;
  final bool msme;

  bool get paid => status == 'paid';

  bool get partial => status == 'partial';

  num get owed => payments.fold<num>(total, (left, p) => left - p.amount);

  bool get cancelled => status == 'cancelled';

  bool get open => !paid && !cancelled && status != 'settled';
}

class Expense {
  const Expense({
    required this.id,
    required this.date,
    required this.head,
    required this.headName,
    required this.description,
    required this.payee,
    required this.amount,
    required this.gstRate,
    required this.inputCredit,
    required this.mode,
    required this.tagSource,
    required this.tagWhy,
  });

  factory Expense.fromJson(Object? json) {
    final map = _map(json);
    final tag = _map(map['tag']);
    return Expense(
      id: _text(map['id']),
      date: _text(map['date']),
      head: _text(map['head']),
      headName: _text(map['headName']),
      description: _text(map['description']),
      payee: _text(map['payee']),
      amount: _num(map['amount']),
      gstRate: _num(map['gstRate']),
      inputCredit: map['inputCredit'] == true,
      mode: _text(map['mode']),
      tagSource: _text(tag['source']),
      tagWhy: _text(tag['why']),
    );
  }

  final String id;
  final String date;
  final String head;
  final String headName;
  final String description;
  final String payee;
  final num amount;
  final num gstRate;
  final bool inputCredit;
  final String mode;
  final String tagSource;
  final String tagWhy;

  String get title => description.isNotEmpty
      ? description
      : (payee.isNotEmpty ? payee : headName);
}

class ExpenseHead {
  const ExpenseHead({required this.code, required this.name});

  factory ExpenseHead.fromJson(Object? json) {
    final map = _map(json);
    return ExpenseHead(code: _text(map['code']), name: _text(map['name']));
  }

  final String code;
  final String name;
}

List<ExpenseHead> expenseHeadsFrom(Object? json) {
  final data = _map(json)['data'];
  return data is List ? data.map(ExpenseHead.fromJson).toList() : const [];
}

class Snapshot {
  const Snapshot({
    required this.company,
    required this.invoices,
    required this.purchases,
    required this.expenses,
    required this.creditNotes,
    this.customerTerms = const {},
    this.quotes = const [],
    required this.users,
    required this.activeUser,
    this.sharedAsOf = '',
  });

  factory Snapshot.fromJson(Object? json) {
    final map = _map(json);
    final active = map['activeUser'];
    return Snapshot(
      company: Company.fromJson(map['company']),
      invoices: _maps(map['invoices']).map(Invoice.fromJson).toList(),
      purchases: _maps(map['purchases']).map(Invoice.fromJson).toList(),
      expenses: _maps(map['expenses']).map(Expense.fromJson).toList(),
      creditNotes: _maps(map['creditNotes']).map(CreditNote.fromJson).toList(),
      quotes: _maps(map['quotes']).map(Quote.fromJson).toList(),
      customerTerms: {
        for (final entry in _map(map['customerTerms']).entries)
          if (entry.value is num) entry.key: (entry.value as num).toInt(),
      },
      users: _maps(map['users']).map(FirmUser.fromJson).toList(),
      activeUser: active is Map ? FirmUser.fromJson(active) : null,
      sharedAsOf: _text(map['sharedAsOf']),
    );
  }

  final String sharedAsOf;
  final Company company;
  final List<Invoice> invoices;
  final List<Invoice> purchases;
  final List<Expense> expenses;
  final List<CreditNote> creditNotes;
  final Map<String, int> customerTerms;
  final List<Quote> quotes;
  final List<FirmUser> users;

  int? termsFor(String name, String gstin) {
    final tax = gstin.trim().toUpperCase();
    if (tax.isNotEmpty && customerTerms.containsKey('gstin:$tax')) {
      return customerTerms['gstin:$tax'];
    }
    return customerTerms['name:${name.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ')}'];
  }

  final FirmUser? activeUser;
}

class SignInResult {
  const SignInResult({required this.ok, required this.error});

  factory SignInResult.fromJson(Object? json) {
    final map = _map(json);
    return SignInResult(ok: map['ok'] == true, error: _text(map['error']));
  }

  final bool ok;
  final String error;
}

class ChatPreview {
  const ChatPreview({
    required this.token,
    required this.summary,
    required this.effects,
    this.figures = const <String, dynamic>{},
  });

  factory ChatPreview.fromJson(Object? json) {
    final map = _map(json);
    final effects = map['effects'];
    return ChatPreview(
      token: _text(map['token']),
      summary: _text(map['summary']),
      effects: effects is List ? effects.map(_text).toList() : const <String>[],
      figures: _map(map['figures']),
    );
  }

  final String token;
  final String summary;
  final List<String> effects;
  final Map<String, dynamic> figures;

  String get headName => _text(figures['headName']);
  String get head => _text(figures['head']);
}

class ChatReply {
  const ChatReply({
    required this.reply,
    required this.preview,
    required this.posted,
    required this.blocked,
  });

  factory ChatReply.fromJson(Object? json) {
    final map = _map(json);
    final awaiting =
        map['awaitingConfirmation'] == true && map['preview'] is Map;
    return ChatReply(
      reply: _text(map['reply']),
      preview: awaiting ? ChatPreview.fromJson(map['preview']) : null,
      posted: map['posted'] == true,
      blocked: map['blocked'] == true,
    );
  }

  final String reply;
  final ChatPreview? preview;
  final bool posted;
  final bool blocked;
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

class Quote {
  const Quote({
    required this.id,
    required this.date,
    required this.partyName,
    required this.partyGstin,
    required this.total,
    required this.validUntil,
    required this.status,
    required this.invoiceId,
  });

  factory Quote.fromJson(Object? json) {
    final map = _map(json);
    return Quote(
      id: _text(map['id']),
      date: _text(map['date']),
      partyName: _text(map['partyName']),
      partyGstin: _text(map['partyGstin']),
      total: _num(map['total']),
      validUntil: _text(map['validUntil']),
      status: _text(map['status']),
      invoiceId: _text(map['invoiceId']),
    );
  }

  final String id;
  final String date;
  final String partyName;
  final String partyGstin;
  final num total;
  final String validUntil;
  final String status;
  final String invoiceId;

  String stateOn(String today) => status == 'open' && validUntil.compareTo(today) < 0 ? 'expired' : status;
}

class Today {
  const Today({
    required this.gst,
    required this.deadlines,
    required this.exceptions,
    this.summary,
    this.reminders = const [],
  });

  final PeriodGst? gst;
  final List<Deadline> deadlines;
  final List<ExceptionItem> exceptions;
  final BusinessSummary? summary;
  final List<Reminder> reminders;
}

class ToolOutcome {
  const ToolOutcome({required this.ok, required this.error});

  factory ToolOutcome.fromJson(Object? json) {
    final map = _map(json);
    return ToolOutcome(ok: map['ok'] != false, error: _text(map['error']));
  }

  final bool ok;
  final String error;
}

class Place {
  const Place({required this.code, required this.name});

  factory Place.fromJson(Object? json) {
    final map = _map(json);
    return Place(code: _text(map['code']), name: _text(map['name']));
  }

  final String code;
  final String name;

  String get label =>
      name.isEmpty ? code : (code.isEmpty ? name : '$name ($code)');
}

class InvoiceLine {
  const InvoiceLine({
    required this.description,
    required this.hsn,
    required this.qty,
    required this.rate,
    required this.gstRate,
    required this.taxable,
    required this.amount,
    this.taxRate = 0,
  });

  factory InvoiceLine.fromJson(Object? json) {
    final map = _map(json);
    return InvoiceLine(
      description: _text(map['description']),
      hsn: _text(map['hsn']),
      qty: _num(map['qty']),
      rate: _num(map['rate']),
      gstRate: _num(map['gstRate']),
      taxable: _num(map['taxable']),
      amount: _num(map['amount']),
      taxRate: _num(map['taxRate']),
    );
  }

  final String description;
  final String hsn;
  final num qty;
  final num rate;
  final num gstRate;
  final num taxable;
  final num amount;
  final num taxRate;
}

class InvoiceTemplate {
  const InvoiceTemplate({
    this.accent = 0xFFB42318,
    this.layout = 'classic',
    this.signatory = '',
    this.footer = '',
    this.terms = '',
    this.bankWords = '',
    this.showHsn = true,
  });

  factory InvoiceTemplate.fromJson(Object? json) {
    final map = _map(json);
    final hex = _text(map['accent']);
    final parsed = RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(hex)
        ? int.parse(hex.substring(1), radix: 16)
        : 0xB42318;
    return InvoiceTemplate(
      accent: 0xFF000000 | parsed,
      layout: _text(map['layout']) == 'minimal' ? 'minimal' : 'classic',
      signatory: _text(map['signatory']),
      footer: _text(map['footer']),
      terms: _text(map['terms']),
      bankWords: _text(map['bankWords']),
      showHsn: map['showHsn'] != false,
    );
  }

  final int accent;
  final String layout;
  final String signatory;
  final String footer;
  final String terms;
  final String bankWords;
  final bool showHsn;

  bool get minimal => layout == 'minimal';
}

class InvoiceDocument {
  const InvoiceDocument({
    required this.id,
    required this.date,
    required this.sellerName,
    required this.sellerGstin,
    required this.sellerAddress,
    required this.sellerState,
    required this.buyerName,
    required this.buyerGstin,
    required this.placeOfSupply,
    required this.lines,
    required this.taxable,
    required this.cgst,
    required this.sgst,
    required this.igst,
    required this.total,
    required this.receipts,
    required this.received,
    required this.credited,
    required this.creditNotes,
    required this.status,
    required this.balance,
    required this.missing,
    this.debited = 0,
    this.debitNotes = const <CreditNote>[],
    this.buyerAddress = '',
    this.shares = const <InvoiceShare>[],
    this.ewayBill,
    this.einvoice,
    this.dueDate = '',
    this.termsDays,
    this.kind = 'invoice',
    this.validUntil = '',
    this.linkedId = '',
    this.country = 'IN',
    this.subtotal = 0,
    this.salesTax = 0,
    this.taxJurisdiction = '',
    this.taxRate = 0,
    this.taxExempt = false,
    this.exemptionReason = '',
    this.template = const InvoiceTemplate(),
    this.upiLink = '',
  });

  static InvoiceDocument? fromTool(Object? json) {
    final map = toolData(json);
    if (_text(map['id']).isEmpty) return null;
    final seller = _map(map['seller']);
    final buyer = _map(map['buyer']);
    final address = [
      _text(seller['address']),
      _text(seller['city']),
      _text(seller['pin']),
    ].where((part) => part.isNotEmpty).join(', ');
    return InvoiceDocument(
      id: _text(map['id']),
      date: _text(map['date']),
      sellerName: _text(seller['name']),
      sellerGstin: _text(seller['gstin']),
      sellerAddress: address,
      sellerState: Place.fromJson(seller['state']),
      buyerName: _text(buyer['name']),
      buyerGstin: _text(buyer['gstin']),
      placeOfSupply: Place.fromJson(map['placeOfSupply']),
      lines: _maps(map['lines']).map(InvoiceLine.fromJson).toList(),
      taxable: _num(map['taxable']),
      cgst: _num(map['cgst']),
      sgst: _num(map['sgst']),
      igst: _num(map['igst']),
      total: _num(map['total']),
      receipts: _maps(map['receipts']).map(Receipt.fromJson).toList(),
      received: _num(map['received']),
      credited: _num(map['credited']),
      creditNotes: _maps(map['creditNotes']).map(CreditNote.fromJson).toList(),
      debited: _num(map['debited']),
      debitNotes: _maps(map['debitNotes']).map(CreditNote.fromJson).toList(),
      buyerAddress: _text(buyer['address']),
      shares: _maps(map['shares']).map(InvoiceShare.fromJson).toList(),
      ewayBill: map['ewayBill'] is Map ? EwayBill.fromJson(map['ewayBill']) : null,
      einvoice: map['einvoice'] is Map ? EInvoice.fromJson(map['einvoice']) : null,
      status: _text(map['status']),
      balance: _num(map['balance']),
      dueDate: _text(map['dueDate']),
      termsDays: map['paymentTermsDays'] is num
          ? (map['paymentTermsDays'] as num).toInt()
          : null,
      kind: _text(map['kind']).isEmpty ? 'invoice' : _text(map['kind']),
      validUntil: _text(map['validUntil']),
      linkedId: _text(map['kind']) == 'quote' ? _text(map['invoiceId']) : _text(map['quoteId']),
      country: _text(map['country']).isEmpty ? 'IN' : _text(map['country']).toUpperCase(),
      subtotal: _num(map['subtotal']),
      salesTax: _num(map['salesTax']),
      taxJurisdiction: _text(map['taxJurisdiction']),
      taxRate: _num(map['taxRate']),
      taxExempt: map['taxExempt'] == true,
      exemptionReason: _text(map['exemptionReason']),
      template: InvoiceTemplate.fromJson(map['template']),
      upiLink: _text(_map(map['upiPayment'])['link']),
      missing: [
        for (final code in (map['missing'] as List? ?? const [])) _text(code),
      ],
    );
  }

  final String upiLink;
  final String id;
  final String date;
  final String sellerName;
  final String sellerGstin;
  final String sellerAddress;
  final Place sellerState;
  final String buyerName;
  final String buyerGstin;
  final Place placeOfSupply;
  final List<InvoiceLine> lines;
  final num taxable;
  final num cgst;
  final num sgst;
  final num igst;
  final num total;
  final List<Receipt> receipts;
  final num received;
  final num credited;
  final List<CreditNote> creditNotes;
  final num debited;
  final List<CreditNote> debitNotes;
  final String buyerAddress;
  final List<InvoiceShare> shares;
  final EwayBill? ewayBill;
  final EInvoice? einvoice;
  final String status;
  final num balance;
  final List<String> missing;
  final String dueDate;
  final int? termsDays;

  bool get cancelled => status == 'cancelled';

  final String kind;
  final String validUntil;
  final String linkedId;
  final String country;
  final num subtotal;
  final num salesTax;
  final String taxJurisdiction;
  final num taxRate;
  final bool taxExempt;
  final String exemptionReason;
  final InvoiceTemplate template;

  bool get isQuote => kind == 'quote';

  bool get isUs => country == 'US';

  String get title => isQuote ? 'Quotation' : (sellerGstin.isEmpty ? 'Invoice' : 'Tax invoice');

  String get subtotalLabel => isUs ? 'Subtotal' : 'Taxable value';

  List<(String, num)> get taxHeads => isUs
      ? [
          if (taxExempt)
            ('Sales tax: exempt ($exemptionReason)', 0)
          else if (taxJurisdiction.isNotEmpty)
            ('Sales tax ($taxJurisdiction ${_plainRate(taxRate)}%)', salesTax),
        ]
      : [
          if (cgst > 0) ('CGST', cgst),
          if (sgst > 0) ('SGST', sgst),
          if (igst > 0) ('IGST', igst),
        ];
}

String _plainRate(num value) => value == value.roundToDouble() ? value.toInt().toString() : value.toString();

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

class SalesTaxFiled {
  const SalesTaxFiled({required this.confirmation, required this.filedOn, required this.late});

  final String confirmation;
  final String filedOn;
  final bool late;
}

class SalesTaxPeriod {
  const SalesTaxPeriod({
    required this.period,
    required this.taxCollected,
    required this.toPay,
    required this.dueDate,
    required this.filed,
    required this.approved,
    required this.empty,
    required this.ended,
  });

  factory SalesTaxPeriod.fromJson(Object? json) {
    final map = _map(json);
    final filed = map['filed'] is Map ? _map(map['filed']) : null;
    return SalesTaxPeriod(
      period: _text(map['period']),
      taxCollected: _num(map['taxCollected']),
      toPay: _num(map['toPay']),
      dueDate: _text(map['dueDate']),
      filed: filed == null ? null : SalesTaxFiled(confirmation: _text(filed['confirmation']), filedOn: _text(filed['filedOn']), late: filed['late'] == true),
      approved: map['approved'] == true,
      empty: map['empty'] == true,
      ended: map['ended'] != false,
    );
  }

  final String period;
  final num taxCollected;
  final num toPay;
  final String dueDate;
  final SalesTaxFiled? filed;
  final bool approved;
  final bool empty;
  final bool ended;
}

class SalesTaxStateRow {
  const SalesTaxStateRow({
    required this.state,
    required this.frequency,
    required this.permitNo,
    required this.lastPeriod,
    required this.overdue,
    required this.notes,
  });

  factory SalesTaxStateRow.fromJson(Object? json) {
    final map = _map(json);
    return SalesTaxStateRow(
      state: _text(map['state']),
      frequency: _text(map['frequency']),
      permitNo: _text(map['permitNo']),
      lastPeriod: map['lastPeriod'] is Map ? SalesTaxPeriod.fromJson(map['lastPeriod']) : null,
      overdue: map['overdue'] == true,
      notes: [for (final note in (map['notes'] as List? ?? const [])) _text(note)],
    );
  }

  final String state;
  final String frequency;
  final String permitNo;
  final SalesTaxPeriod? lastPeriod;
  final bool overdue;
  final List<String> notes;
}

class SalesTaxOverview {
  const SalesTaxOverview({required this.states, required this.overdue});

  static SalesTaxOverview? fromTool(Object? json) {
    final map = _map(json);
    if (map['ok'] == false) return null;
    final data = toolData(json);
    return SalesTaxOverview(
      states: _maps(data['states']).map(SalesTaxStateRow.fromJson).toList(),
      overdue: data['overdue'] is num ? (data['overdue'] as num).toInt() : 0,
    );
  }

  final List<SalesTaxStateRow> states;
  final int overdue;

  bool get hasNexus => states.isNotEmpty;
}

Map<String, dynamic> toolData(Object? json) {
  final map = _map(json);
  if (map['ok'] == false) return const <String, dynamic>{};
  return _map(map['data']);
}

List<Deadline> deadlinesFrom(Object? json) =>
    _maps(toolData(json)['deadlines']).map(Deadline.fromJson).toList();

List<ExceptionItem> exceptionsFrom(Object? json) =>
    _maps(toolData(json)['exceptions']).map(ExceptionItem.fromJson).toList();

PeriodGst? periodGstFrom(Object? json) {
  final data = toolData(json);
  return data.isEmpty ? null : PeriodGst.fromJson(data);
}

const reportMetrics = ['sales', 'purchases', 'expenses', 'owed', 'owing'];
const reportGroups = ['customer', 'supplier', 'head', 'month', 'none'];
const reportPeriods = ['this-month', 'last-month', 'this-quarter', 'this-year', 'last-year'];

class SavedReport {
  const SavedReport({
    required this.name,
    required this.metric,
    required this.groupBy,
    required this.period,
    required this.compare,
    required this.savedOn,
  });

  factory SavedReport.fromJson(Object? json) {
    final map = _map(json);
    return SavedReport(
      name: _text(map['name']),
      metric: _text(map['metric']),
      groupBy: _text(map['groupBy']),
      period: _text(map['period']),
      compare: map['compare'] == true,
      savedOn: _text(map['savedOn']),
    );
  }

  final String name;
  final String metric;
  final String groupBy;
  final String period;
  final bool compare;
  final String savedOn;

  String get words => '$metric${groupBy == 'none' || groupBy.isEmpty ? '' : ' by $groupBy'}, ${period.replaceAll('-', ' ')}${compare ? ', compared' : ''}';
}

List<SavedReport> savedReportsFrom(Object? json) {
  final map = _map(json);
  if (map['ok'] == false) return const <SavedReport>[];
  return _maps(map['reports']).map(SavedReport.fromJson).toList();
}

class ReportRow {
  const ReportRow({required this.label, required this.amount, this.before});

  final String label;
  final num amount;
  final num? before;
}

class ReportComparison {
  const ReportComparison({required this.label, required this.total, required this.changePct});

  final String label;
  final num total;
  final num? changePct;
}

class ReportResult {
  const ReportResult({
    required this.name,
    required this.metric,
    required this.groupBy,
    required this.period,
    required this.rangeLabel,
    required this.rows,
    required this.more,
    required this.total,
    required this.compare,
  });

  static ReportResult? fromTool(Object? json) {
    final map = _map(json);
    if (map['ok'] == false || map['result'] is! Map) return null;
    final result = _map(map['result']);
    final compare = result['compare'] is Map ? _map(result['compare']) : null;
    final before = <String, num>{
      if (compare != null)
        for (final row in _maps(compare['rows'])) _text(row['label']): _num(row['before']),
    };
    return ReportResult(
      name: _text(map['name']),
      metric: _text(result['metric']),
      groupBy: _text(result['groupBy']),
      period: _text(result['period']),
      rangeLabel: _text(_map(result['range'])['label']),
      rows: [
        for (final row in _maps(result['rows']))
          ReportRow(label: _text(row['label']), amount: _num(row['amount']), before: compare == null ? null : before[_text(row['label'])]),
      ],
      more: _num(result['more']).toInt(),
      total: _num(result['total']),
      compare: compare == null
          ? null
          : ReportComparison(
              label: _text(compare['label']),
              total: _num(compare['total']),
              changePct: compare['changePct'] is num ? compare['changePct'] as num : null,
            ),
    );
  }

  final String name;
  final String metric;
  final String groupBy;
  final String period;
  final String rangeLabel;
  final List<ReportRow> rows;
  final int more;
  final num total;
  final ReportComparison? compare;
}

String reportComparisonWords(ReportResult result, String Function(num) money) {
  final compare = result.compare;
  if (compare == null) return '';
  final pct = compare.changePct;
  if (pct == null) return 'was ${money(compare.total)} on ${compare.label}';
  final direction = pct == 0 ? 'unchanged' : '${pct > 0 ? 'up' : 'down'} ${pct.abs().toStringAsFixed(pct.abs() == pct.abs().roundToDouble() ? 0 : 1)}%';
  return '$direction on ${compare.label}, ${money(compare.total)}';
}
