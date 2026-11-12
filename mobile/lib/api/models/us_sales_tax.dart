part of '../models.dart';

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
