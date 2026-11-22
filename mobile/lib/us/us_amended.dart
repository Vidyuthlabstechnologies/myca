import '../api/models.dart';
import '../api/myca_api.dart';

Map<String, dynamic> _map(Object? value) => value is Map ? value.cast<String, dynamic>() : const <String, dynamic>{};

List<Map<String, dynamic>> _maps(Object? value) => value is List ? [for (final v in value) if (v is Map) v.cast<String, dynamic>()] : const [];

String _text(Object? value) => value == null ? '' : '$value';

num _num(Object? value) => value is num ? value : num.tryParse('${value ?? ''}') ?? 0;

const amendedOriginalFields = <(String, String, bool)>[
  ('agi', 'Adjusted gross income (Form 1040 line 11)', true),
  ('deduction', 'Standard or itemized deduction (line 12)', true),
  ('qbiDeduction', 'Qualified business income deduction (line 13a)', false),
  ('schedule1ADeduction', 'Schedule 1-A deductions (line 13b)', false),
  ('taxableIncome', 'Taxable income (line 15)', false),
  ('tax', 'Tax (line 18)', true),
  ('credits', 'Nonrefundable credits (line 21)', false),
  ('otherTaxes', 'Other taxes (line 23)', false),
  ('totalTax', 'Total tax (line 24)', false),
  ('withholding', 'Federal tax withheld (line 25d)', false),
  ('estimatedPayments', 'Estimated tax payments (line 26)', false),
  ('eic', 'Earned income credit (line 27)', false),
  ('refundableCredits', 'Other refundable credits (lines 28, 29 and Schedule 3)', false),
  ('refund', 'Refund (line 35a)', false),
  ('appliedToNextYear', 'Applied to next year\'s estimated tax (line 36)', false),
  ('amountOwed', 'Amount owed (line 37)', false),
];

const amendedLineOrder = ['1', '2', '3', '4a', '4b', '5', '6', '7', '8', '10', '11', '12', '13', '14', '15'];

class AmendedLine {
  const AmendedLine({required this.line, required this.label, required this.original, required this.change, required this.corrected});

  final String line;
  final String label;
  final num original;
  final num change;
  final num corrected;
}

class AmendedCheck {
  const AmendedCheck({required this.level, required this.code, required this.message, required this.fix});

  final String level;
  final String code;
  final String message;
  final String fix;

  bool get blocking => level == 'error';
}

class UsAmended {
  const UsAmended({
    required this.taxYear,
    required this.started,
    this.acceptedInMyca = false,
    this.form = '',
    this.source = '',
    this.lines = const [],
    this.refund = 0,
    this.owed = 0,
    this.appliedToNextYear = 0,
    this.explanation = '',
    this.claimBy = '',
    this.efileAllowed = false,
    this.efileReason = '',
    this.checks = const [],
    this.dependentsChanged = false,
    this.returnErrors = 0,
    this.notes = const [],
  });

  factory UsAmended.fromJson(Object? json, {int fallbackYear = 0}) {
    final data = _map(json);
    final year = int.tryParse(_text(data['taxYear'])) ?? fallbackYear;
    if (data['started'] != true) return UsAmended(taxYear: year, started: false, acceptedInMyca: data['acceptedInMyca'] == true);
    final raw = _map(data['lines']);
    final labels = _map(data['lineText']);
    final lines = <AmendedLine>[
      for (final id in [...amendedLineOrder, ...raw.keys.where((k) => !amendedLineOrder.contains(k))])
        if (raw[id] is Map)
          AmendedLine(line: id, label: _text(labels[id]).isEmpty ? 'Line $id' : _text(labels[id]), original: _num(raw[id]['A']), change: _num(raw[id]['B']), corrected: _num(raw[id]['C'])),
    ];
    final efile = _map(data['efile']);
    return UsAmended(
      taxYear: year,
      started: true,
      form: _text(data['form']),
      source: _text(data['source']),
      lines: lines,
      refund: _num(data['refund']),
      owed: _num(data['owed']),
      appliedToNextYear: _num(data['appliedToNextYear']),
      explanation: _text(data['partII']),
      claimBy: _text(_map(data['deadline'])['refundClaimBy']),
      efileAllowed: efile['allowedByIrs'] == true,
      efileReason: _text(efile['reason']),
      checks: [for (final c in _maps(data['checks'])) AmendedCheck(level: _text(c['level']), code: _text(c['code']), message: _text(c['message']), fix: _text(c['fix']))],
      dependentsChanged: data['partI'] is Map,
      returnErrors: _num(_map(data['corrected1040'])['errors']).toInt(),
      notes: [for (final n in (data['notes'] is List ? data['notes'] as List : const [])) _text(n)],
    );
  }

  final int taxYear;
  final bool started;
  final bool acceptedInMyca;
  final String form;
  final String source;
  final List<AmendedLine> lines;
  final num refund;
  final num owed;
  final num appliedToNextYear;
  final String explanation;
  final String claimBy;
  final bool efileAllowed;
  final String efileReason;
  final List<AmendedCheck> checks;
  final bool dependentsChanged;
  final int returnErrors;
  final List<String> notes;

  List<AmendedLine> get changed => [for (final l in lines) if (l.change != 0) l];

  AmendedLine? line(String id) => lines.where((l) => l.line == id).firstOrNull;

  bool has(String code) => checks.any((c) => c.code == code);

  bool get ready => started && !checks.any((c) => c.blocking) && returnErrors == 0;
}

Future<UsAmended> loadAmended(MycaApi api, int year) async => UsAmended.fromJson(toolData(await api.query('us_amended_return', {'taxYear': '$year'})), fallbackYear: year);

Map<String, Object?> amendedOriginalArgs(Map<String, num> figures, {String filingStatus = '', int? children, int? other}) => {
      if (figures.isNotEmpty) 'original': figures,
      if (filingStatus.isNotEmpty) 'originalFilingStatus': filingStatus,
      if (children != null || other != null) 'originalDependents': {'children': children ?? 0, 'other': other ?? 0},
    };
