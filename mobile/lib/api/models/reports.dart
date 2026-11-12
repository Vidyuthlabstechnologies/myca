part of '../models.dart';

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

List<String> _texts(Object? value) => value is List ? value.map(_text).toList() : const <String>[];

num? _numOrNull(Object? value) => value is num ? value : null;

String _rupeesOr(num? amount, String none) => amount == null ? none : rupees(amount);

String bankDocKindWords(String docKind) => switch (docKind) {
  'receipt' => 'receipt',
  'payment' => 'payment',
  'expense' => 'expense',
  'settlement' => 'payout',
  'transfer' => 'transfer',
  'salary' => 'salary',
  'gst' => 'GST payment',
  _ => 'entry',
};

String _capitalised(String words) => words.isEmpty ? words : '${words[0].toUpperCase()}${words.substring(1)}';
