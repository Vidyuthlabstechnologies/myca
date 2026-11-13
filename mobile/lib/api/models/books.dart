part of '../models.dart';

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

List<ExceptionItem> exceptionsFrom(Object? json) =>
    _maps(toolData(json)['exceptions']).map(ExceptionItem.fromJson).toList();

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

class AuditEvent {
  const AuditEvent({
    required this.eventId,
    required this.at,
    required this.actor,
    required this.action,
    required this.kind,
    required this.summary,
    required this.ids,
    required this.transfers,
    required this.chained,
  });

  factory AuditEvent.fromJson(Object? json) {
    final map = _map(json);
    final name = _text(map['actorName']);
    return AuditEvent(
      eventId: _text(map['eventId']),
      at: DateTime.tryParse(_text(map['at'])),
      actor: name.isNotEmpty ? name : _text(map['actorId']),
      action: _text(map['action']),
      kind: _text(map['kind']),
      summary: _text(map['summary']),
      ids: _texts(map['ids']),
      transfers: _texts(map['transfers']),
      chained: map['chained'] == true,
    );
  }

  final String eventId;
  final DateTime? at;
  final String actor;
  final String action;
  final String kind;
  final String summary;
  final List<String> ids;
  final List<String> transfers;
  final bool chained;

  String get when {
    final utc = at?.toUtc();
    if (utc == null) return '';
    String two(int n) => n.toString().padLeft(2, '0');
    return '${isoDate(utc)} ${two(utc.hour)}:${two(utc.minute)} UTC';
  }

  String get subtitle => [when, actor, if (ids.isNotEmpty) ids.join(', ')].where((part) => part.isNotEmpty).join(' · ');
}

class AuditTrail {
  const AuditTrail({
    required this.from,
    required this.to,
    required this.label,
    required this.view,
    required this.events,
    required this.count,
    required this.total,
    required this.more,
    required this.chainOk,
    required this.chainWords,
    required this.ledgerOk,
  });

  static AuditTrail? fromTool(Object? json) {
    final data = toolData(json);
    if (data.isEmpty) return null;
    final chain = _map(data['chain']);
    final chainOk = chain['ok'] == true;
    final chained = _num(chain['chained']).toInt();
    final earlier = _num(chain['unchained']).toInt();
    final caveats = [
      if (chained > 0) 'the client an event is filed under is not sealed',
      if (earlier > 0) '$earlier earlier ${earlier == 1 ? 'event was' : 'events were'} recorded before sealing and ${earlier == 1 ? 'is' : 'are'} not covered',
    ];
    return AuditTrail(
      from: _text(data['from']),
      to: _text(data['to']),
      label: _text(data['label']),
      view: _text(data['view']),
      events: _maps(data['events']).map(AuditEvent.fromJson).toList(),
      count: _num(data['count']).toInt(),
      total: _num(data['total']).toInt(),
      more: data['more'] == true,
      chainOk: chainOk,
      chainWords: chainOk ? 'Log chain verified ($chained ${chained == 1 ? 'event' : 'events'}${caveats.map((said) => '; $said').join()})' : 'Log chain broken at ${_text(chain['at'])}',
      ledgerOk: _map(data['ledger'])['ok'] != false,
    );
  }

  final String from;
  final String to;
  final String label;
  final String view;
  final List<AuditEvent> events;
  final int count;
  final int total;
  final bool more;
  final bool chainOk;
  final String chainWords;
  final bool ledgerOk;
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
