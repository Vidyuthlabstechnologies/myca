import '../format.dart';

part 'models/gst.dart';
part 'models/payroll_and_payables.dart';
part 'models/sales_documents.dart';
part 'models/reports.dart';
part 'models/bank.dart';

Map<String, dynamic> _map(Object? value) =>
    value is Map ? value.cast<String, dynamic>() : const <String, dynamic>{};

List<Map<String, dynamic>> _maps(Object? value) =>
    value is List ? value.map(_map).toList() : const <Map<String, dynamic>>[];

num _num(Object? value) => value is num ? value : 0;

String _text(Object? value) => value == null ? '' : value.toString();

num _stillOpen(num value) => value > 0 ? (value * 100).round() / 100 : 0;


class Company {
  const Company({required this.name, required this.gstin, this.tdsDeductor = false, this.country = 'IN', this.gstFrequency = 'monthly', this.entityType = ''});

  factory Company.fromJson(Object? json) {
    final map = _map(json);
    return Company(
      name: _text(map['name']),
      gstin: _text(map['gstin']),
      tdsDeductor: map['tdsDeductor'] == true,
      country: _text(map['country']).isEmpty ? 'IN' : _text(map['country']).toUpperCase(),
      gstFrequency: _text(map['gstFrequency']).toLowerCase() == 'quarterly' ? 'quarterly' : 'monthly',
      entityType: _text(map['entityType']).toLowerCase(),
    );
  }

  final String entityType;

  bool get household => country == 'US' && entityType == 'household';
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
  const Receipt({
    required this.amount,
    required this.date,
    required this.mode,
    this.section = '',
    this.tan = '',
  });

  factory Receipt.fromJson(Object? json) {
    final map = _map(json);
    return Receipt(
      amount: _num(map['amount']),
      date: _text(map['date']),
      mode: _text(map['mode']),
      section: _text(map['section']),
      tan: _text(map['tan']),
    );
  }

  final num amount;
  final String date;
  final String mode;
  final String section;
  final String tan;

  bool get tds => mode == 'tds';
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

  num get owed => _stillOpen(total - receipts.fold<num>(0, (sum, r) => sum + r.amount) - payments.fold<num>(0, (sum, p) => sum + p.amount));

  num owedAfter(Iterable<CreditNote> notes) => _stillOpen(owed - notes.where((note) => note.invoiceId == id).fold<num>(0, (sum, note) => sum + note.total));

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
