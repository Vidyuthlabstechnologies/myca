import '../format.dart';

Map<String, dynamic> _map(Object? value) =>
    value is Map ? value.cast<String, dynamic>() : const <String, dynamic>{};

List<Map<String, dynamic>> _maps(Object? value) =>
    value is List ? value.map(_map).toList() : const <Map<String, dynamic>>[];

num _num(Object? value) => value is num ? value : 0;

String _text(Object? value) => value == null ? '' : value.toString();

class Company {
  const Company({required this.name, required this.gstin});

  factory Company.fromJson(Object? json) {
    final map = _map(json);
    return Company(name: _text(map['name']), gstin: _text(map['gstin']));
  }

  final String name;
  final String gstin;
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
    );
  }

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
}

class Deadline {
  const Deadline({
    required this.label,
    required this.period,
    required this.dueDate,
    required this.daysUntil,
    required this.level,
  });

  factory Deadline.fromJson(Object? json) {
    final map = _map(json);
    final label = _text(map['returnLabel']);
    return Deadline(
      label: label.isEmpty ? _text(map['returnType']) : label,
      period: _text(map['period']),
      dueDate: _text(map['dueDate']),
      daysUntil: _num(map['daysUntil']).toInt(),
      level: _text(map['level']),
    );
  }

  final String label;
  final String period;
  final String dueDate;
  final int daysUntil;
  final String level;

  bool get onTrack => level == 'on_track';
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
  });

  factory MonthFigures.fromJson(Object? json) {
    final map = _map(json);
    return MonthFigures(
      sales: _num(_map(map['sales'])['total']),
      salesNet: _num(_map(map['sales'])['net']),
      purchases: _num(_map(map['purchases'])['total']),
      expenses: _num(_map(map['expenses'])['total']),
    );
  }

  final num sales;
  final num salesNet;
  final num purchases;
  final num expenses;
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
      aboutLabel: [id, name].where((part) => part.isNotEmpty).join(', '),
    );
  }

  final String id;
  final String text;
  final String due;
  final int inDays;
  final String state;
  final String aboutLabel;

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
    );
  }

  final String description;
  final String hsn;
  final num qty;
  final num rate;
  final num gstRate;
  final num taxable;
  final num amount;
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
    this.dueDate = '',
    this.termsDays,
    this.kind = 'invoice',
    this.validUntil = '',
    this.linkedId = '',
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
      status: _text(map['status']),
      balance: _num(map['balance']),
      dueDate: _text(map['dueDate']),
      termsDays: map['paymentTermsDays'] is num
          ? (map['paymentTermsDays'] as num).toInt()
          : null,
      kind: _text(map['kind']).isEmpty ? 'invoice' : _text(map['kind']),
      validUntil: _text(map['validUntil']),
      linkedId: _text(map['kind']) == 'quote' ? _text(map['invoiceId']) : _text(map['quoteId']),
      missing: [
        for (final code in (map['missing'] as List? ?? const [])) _text(code),
      ],
    );
  }

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
  final String status;
  final num balance;
  final List<String> missing;
  final String dueDate;
  final int? termsDays;

  bool get cancelled => status == 'cancelled';

  final String kind;
  final String validUntil;
  final String linkedId;

  bool get isQuote => kind == 'quote';

  String get title => isQuote ? 'Quotation' : (sellerGstin.isEmpty ? 'Invoice' : 'Tax invoice');

  List<(String, num)> get taxHeads => [
    if (cgst > 0) ('CGST', cgst),
    if (sgst > 0) ('SGST', sgst),
    if (igst > 0) ('IGST', igst),
  ];
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
