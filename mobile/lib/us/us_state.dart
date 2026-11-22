import '../api/myca_api.dart';
import '../format.dart';
import 'us_return.dart';

Map<String, dynamic> _map(Object? value) => value is Map ? value.cast<String, dynamic>() : const <String, dynamic>{};

List<Map<String, dynamic>> _maps(Object? value) => value is List ? [for (final v in value) if (v is Map) v.cast<String, dynamic>()] : const [];

List<String> _texts(Object? value) => value is List ? [for (final v in value) if ('$v'.trim().isNotEmpty) '$v'] : const [];

String _text(Object? value) => value == null ? '' : '$value';

num _num(Object? value) => value is num ? value : num.tryParse('${value ?? ''}') ?? 0;

String usStateName(String code) => usStates.firstWhere((s) => s.$1 == code.toUpperCase(), orElse: () => (code, code)).$2;

const residencyKinds = ['full-year', 'part-year', 'nonresident'];

const _entryKeys = {'state', 'residency', 'from', 'to', 'income', 'estimatedPayments', 'extensionPayment', 'otherWithheld'};

class UsResidency {
  const UsResidency({required this.state, required this.residency, this.from = '', this.to = '', this.extra = const {}});

  factory UsResidency.fromJson(Object? json) {
    final map = _map(json);
    return UsResidency(
      state: _text(map['state']).toUpperCase(),
      residency: _text(map['residency']),
      from: _text(map['from']),
      to: _text(map['to']),
      extra: {
        for (final entry in map.entries)
          if (_entryKeys.contains(entry.key) && !const {'state', 'residency', 'from', 'to'}.contains(entry.key) && entry.value != null) entry.key: entry.value,
      },
    );
  }

  final String state;
  final String residency;
  final String from;
  final String to;
  final Map<String, Object?> extra;

  UsResidency moved({required String residency, String from = '', String to = ''}) => UsResidency(state: state, residency: residency, from: from, to: to, extra: extra);

  Map<String, Object?> toArgs() => {
        'state': state,
        'residency': residency,
        if (residency == 'part-year' && from.isNotEmpty) 'from': from,
        if (residency == 'part-year' && to.isNotEmpty) 'to': to,
        ...extra,
      };

  String get spoken {
    switch (residency) {
      case 'full-year':
        return '${usStateName(state)} all year';
      case 'part-year':
        return from.isEmpty || to.isEmpty ? '${usStateName(state)} part of the year' : '${usStateName(state)} ${usDate(from)} to ${usDate(to)}';
      default:
        return '${usStateName(state)}, worked there only';
    }
  }
}

class UsStateAmount {
  const UsStateAmount(this.label, this.amount);

  final String label;
  final num amount;
}

List<UsStateAmount> _amounts(Object? value) => [
      for (final m in _maps(value))
        if (_num(m['amount']) != 0) UsStateAmount(_text(m['label']).isEmpty ? wordsFromKey(_text(m['code'])) : _text(m['label']), _num(m['amount'])),
    ];

class UsStateLine {
  const UsStateLine(this.line, this.label, this.value);

  final String line;
  final String label;
  final Object? value;

  String get shown {
    final v = value;
    if (v is num) return v == v.roundToDouble() ? dollars(v) : '$v';
    return '${v ?? ''}';
  }
}

List<UsStateLine> _labelledLines(Object? lines, Object? labels) {
  final values = _map(lines);
  final names = _map(labels);
  return [
    for (final entry in values.entries)
      if (_text(names[entry.key]).isNotEmpty && (entry.value is num || entry.value is String)) UsStateLine(entry.key, _text(names[entry.key]), entry.value),
  ];
}

class UsStateCheck {
  const UsStateCheck({required this.level, required this.code, required this.message, this.fix = ''});

  final String level;
  final String code;
  final String message;
  final String fix;

  bool get blocking => level == 'error';
}

class UsStateReturn {
  const UsStateReturn({
    required this.state,
    required this.stateName,
    required this.status,
    required this.residency,
    this.from = '',
    this.to = '',
    this.form = '',
    this.why = '',
    this.stateIncome = 0,
    this.taxableIncome = 0,
    this.taxBeforeCredits = 0,
    this.totalTax = 0,
    this.otherStateCredit = 0,
    this.refund = 0,
    this.owed = 0,
    this.withheld = 0,
    this.estimated = 0,
    this.extension = 0,
    this.localPaid = 0,
    this.credits = const [],
    this.otherTaxes = const [],
    this.refundableCredits = const [],
    this.checks = const [],
    this.notCovered = const [],
    this.notes = const [],
    this.due = '',
    this.provisional = false,
    this.unreviewed = false,
    this.returnNeeded,
    this.lines = const [],
  });

  factory UsStateReturn.fromJson(Object? json) {
    final map = _map(json);
    final payments = _map(map['payments']);
    final code = _text(map['state']).toUpperCase();
    return UsStateReturn(
      state: code,
      stateName: _text(map['stateName']).isEmpty ? usStateName(code) : _text(map['stateName']),
      status: _text(map['status']),
      residency: _text(map['residency']),
      from: _text(map['from']),
      to: _text(map['to']),
      form: _text(map['form']),
      why: _text(map['why']),
      stateIncome: _num(map['stateIncome']),
      taxableIncome: _num(map['taxableIncome']),
      taxBeforeCredits: _num(map['taxBeforeCredits']),
      totalTax: _num(map['totalTax']),
      otherStateCredit: _num(map['otherStateCredit']),
      refund: _num(map['refund']),
      owed: _num(map['owed']),
      withheld: payments.isEmpty ? _num(map['withheld']) : _num(payments['withheld']),
      estimated: _num(payments['estimated']),
      extension: _num(payments['extension']),
      localPaid: _num(payments['local']) + _num(payments['localWithheld']),
      credits: _amounts(map['nonrefundableCredits']),
      otherTaxes: _amounts(map['otherTaxes']),
      refundableCredits: _amounts(map['refundableCredits']),
      checks: [
        for (final c in _maps(map['checks'])) UsStateCheck(level: _text(c['level']), code: _text(c['code']), message: _text(c['message']), fix: _text(c['fix'])),
      ],
      notCovered: _texts(map['notCovered']),
      notes: [for (final n in map['notes'] is List ? map['notes'] as List : const []) n is Map ? _text(n['message'] ?? n['text']) : _text(n)]..removeWhere((n) => n.trim().isEmpty),
      due: _text(map['due']),
      provisional: map['provisional'] == true,
      unreviewed: map['unreviewed'] == true,
      returnNeeded: map['returnNeeded'] is bool ? map['returnNeeded'] as bool : null,
      lines: _labelledLines(map['lines'], map['labels']),
    );
  }

  final String state;
  final String stateName;
  final String status;
  final String residency;
  final String from;
  final String to;
  final String form;
  final String why;
  final num stateIncome;
  final num taxableIncome;
  final num taxBeforeCredits;
  final num totalTax;
  final num otherStateCredit;
  final num refund;
  final num owed;
  final num withheld;
  final num estimated;
  final num extension;
  final num localPaid;
  final List<UsStateAmount> credits;
  final List<UsStateAmount> otherTaxes;
  final List<UsStateAmount> refundableCredits;
  final List<UsStateCheck> checks;
  final List<String> notCovered;
  final List<String> notes;
  final String due;
  final bool provisional;
  final bool unreviewed;
  final bool? returnNeeded;
  final List<UsStateLine> lines;

  bool get computed => status == 'computed';
  bool get readyToFile => computed && !provisional && !checks.any((c) => c.blocking);
  bool get blocked => checks.any((c) => c.blocking) || status == 'blocked' || status == 'error';

  String get residencyLine {
    switch (residency) {
      case 'full-year':
        return 'Resident all year';
      case 'part-year':
        return from.isEmpty || to.isEmpty ? 'Part-year resident' : 'Part-year resident, ${usDate(from)} to ${usDate(to)}';
      default:
        return 'Nonresident';
    }
  }

  String headline(String taxYear) {
    switch (status) {
      case 'computed':
        if (provisional) return 'Can\'t be filed until $stateName publishes its $taxYear figures';
        if (checks.any((c) => c.blocking)) return 'Not ready to file: something to fix';
        if (refund > 0) return 'Refund ${dollars(refund)}';
        if (owed > 0) return 'You owe ${dollars(owed)}';
        return 'Nothing to pay or get back';
      case 'reciprocal':
        return returnNeeded == true ? 'File to get your withholding back' : 'No tax under the reciprocal agreement';
      case 'no-income-tax':
        return 'No state income tax';
      case 'capital-gains-only':
        return returnNeeded == false ? 'No return needed' : 'Taxes only large capital gains';
      case 'not-built':
        return 'MyCA doesn\'t prepare this return yet';
      default:
        return 'Could not be worked out yet';
    }
  }
}

class UsStateReturns {
  const UsStateReturns({required this.taxYear, required this.assumed, required this.residency, required this.returns, this.refund = 0, this.owed = 0});

  factory UsStateReturns.fromJson(Object? json) {
    final map = _map(json);
    final totals = _map(map['totals']);
    return UsStateReturns(
      taxYear: _text(map['taxYear']),
      assumed: map['residencyAssumed'] == true,
      residency: [for (final r in _maps(map['residency'])) UsResidency.fromJson(r)],
      returns: [for (final r in _maps(map['returns'])) UsStateReturn.fromJson(r)],
      refund: _num(totals['refund']),
      owed: _num(totals['owed']),
    );
  }

  final String taxYear;
  final bool assumed;
  final List<UsResidency> residency;
  final List<UsStateReturn> returns;
  final num refund;
  final num owed;

  UsStateReturn? of(String state) => returns.where((r) => r.state == state.toUpperCase()).firstOrNull;
}

class UsStateQuestionSet {
  const UsStateQuestionSet({required this.state, required this.stateName, required this.built, required this.questions, this.residency = '', this.skipped = 0});

  final String state;
  final String stateName;
  final bool built;
  final List<UsQuestion> questions;
  final String residency;
  final int skipped;
}

const _stateOptionLabels = {
  'full-year': 'Yes, all year',
  'part-year': 'Yes, part of the year',
  'no': 'No',
  'none': 'None',
  'taxpayer': 'Me',
  'spouse': 'My spouse',
  'both': 'Both of us',
  'owner': 'I own my home',
  'renter': 'I rent',
  'neither': 'Neither',
  'automatic': 'Whichever saves more',
  'best': 'Whichever saves more',
  'standard': 'Standard deduction',
  'itemized': 'Itemized deductions',
};

String stateOptionLabel(String value) {
  final named = _stateOptionLabels[value];
  if (named != null) return named;
  final words = value.replaceAll('-', ' ').trim();
  return words.isEmpty ? value : '${words[0].toUpperCase()}${words.substring(1)}';
}

UsQuestion _stateQuestion(Map<String, dynamic> map) {
  final question = UsQuestion.fromJson(map);
  final raw = map['options'];
  if (raw is! List || raw.any((o) => o is Map)) return question;
  return UsQuestion(id: question.id, text: question.text, help: question.help, kind: question.kind, options: [for (final o in raw) ('$o', stateOptionLabel('$o'))], answer: question.answer);
}

class UsStateCoverage {
  const UsStateCoverage({required this.built, required this.notBuilt, required this.noIncomeTax, this.forms = const {}, this.notCovered = const {}});

  factory UsStateCoverage.fromJson(Object? json) {
    final map = _map(json);
    final built = _maps(map['built']);
    return UsStateCoverage(
      built: {for (final b in built) _text(b['state']).toUpperCase()},
      notBuilt: {for (final s in _texts(map['notBuilt'])) s.toUpperCase()},
      noIncomeTax: {for (final s in _texts(map['noIncomeTax'])) s.toUpperCase()},
      forms: {for (final b in built) _text(b['state']).toUpperCase(): _map(b['forms']).values.map(_text).where((f) => f.isNotEmpty).toSet().toList()},
      notCovered: {for (final b in built) _text(b['state']).toUpperCase(): _texts(b['notCovered'])},
    );
  }

  static const unknown = UsStateCoverage(built: {}, notBuilt: {}, noIncomeTax: noIncomeTaxStates);

  final Set<String> built;
  final Set<String> notBuilt;
  final Set<String> noIncomeTax;
  final Map<String, List<String>> forms;
  final Map<String, List<String>> notCovered;

  bool prepares(String state) => built.contains(state.toUpperCase());
  bool taxFree(String state) => noIncomeTax.contains(state.toUpperCase());

  String? message(String state) {
    final code = state.toUpperCase();
    if (code.isEmpty) return null;
    final name = usStateName(code);
    if (taxFree(code)) return '$name has no state income tax, so there is no $name return to file.';
    if (notBuilt.contains(code) || (built.isNotEmpty && !built.contains(code))) return 'MyCA doesn\'t prepare the $name return yet. You can file it on $name\'s tax website, using the numbers from your federal return.';
    return null;
  }
}

class UsStatePackage {
  const UsStatePackage({required this.state, required this.form, required this.partner, required this.ready, required this.blockers, this.route = ''});

  final String route;

  final String state;
  final String form;
  final bool partner;
  final bool ready;
  final List<String> blockers;

  bool get provisional => blockers.contains('STATE_FIGURES_PROVISIONAL');
}

class UsStateFilingPackage {
  const UsStateFilingPackage({required this.packages, required this.missing, this.route = '', this.routeNote = ''});

  factory UsStateFilingPackage.fromJson(Object? json) {
    final map = _map(json);
    final route = _text(map['route']);
    return UsStateFilingPackage(
      route: route,
      routeNote: _text(map['routeNote']),
      packages: [
        for (final p in _maps(map['packages']))
          UsStatePackage(
            state: _text(p['state']).toUpperCase(),
            form: _text(p['form']),
            route: _text(p['route']).isEmpty ? route : _text(p['route']),
            partner: (_text(p['route']).isEmpty ? route : _text(p['route'])) == 'partner' && p['piggyback'] != false,
            ready: p['ready'] == true,
            blockers: _texts(p['blockers']),
          ),
      ],
      missing: [for (final s in _texts(map['missing'])) s.toUpperCase()],
    );
  }

  final List<UsStatePackage> packages;
  final List<String> missing;
  final String route;
  final String routeNote;

  bool get withFederal => packages.any((p) => p.partner);
  bool get direct => route == 'irs-mef';
  bool get worthShowing => packages.isNotEmpty || missing.isNotEmpty;
}

class UsStateProblem implements Exception {
  const UsStateProblem(this.code, this.hint);

  final String code;
  final String hint;

  @override
  String toString() => hint.isEmpty ? code : hint;
}

Map<String, dynamic> _stateData(Object? json, String fallback) {
  final map = _map(json);
  if (map['ok'] == false) {
    throw UsStateProblem(_text(map['error']), _text(map['hint']).isEmpty ? fallback : _text(map['hint']));
  }
  return _map(map['data']);
}

Future<UsStateReturns> loadStateReturns(MycaApi api, int year, {String state = ''}) async => UsStateReturns.fromJson(
      _stateData(await api.query('us_state_returns', {'taxYear': '$year', if (state.isNotEmpty) 'state': state}), 'Your state returns can be worked out once your federal return has your address.'),
    );

Future<UsStateQuestionSet> loadStateQuestions(MycaApi api, int year, String state) async {
  final data = _stateData(await api.query('us_state_questions', {'taxYear': '$year', 'state': state}), 'The state questions could not be loaded.');
  final found = _maps(data['states']).where((s) => _text(s['state']).toUpperCase() == state.toUpperCase()).firstOrNull ?? const <String, dynamic>{};
  return UsStateQuestionSet(
    state: state.toUpperCase(),
    stateName: _text(found['stateName']).isEmpty ? usStateName(state) : _text(found['stateName']),
    built: found['built'] == true,
    questions: [for (final q in _maps(found['questions'])) _stateQuestion(q)],
    residency: _text(found['residency']),
    skipped: _num(found['skipped']).toInt(),
  );
}

Future<UsStateCoverage> loadStateCoverage(MycaApi api) async {
  try {
    final map = _map(await api.query('us_state_coverage'));
    if (map['ok'] == false) return UsStateCoverage.unknown;
    return UsStateCoverage.fromJson(map['data']);
  } on MycaApiException {
    return UsStateCoverage.unknown;
  }
}

Future<UsStateFilingPackage?> loadStateFilingPackage(MycaApi api, int year) async {
  try {
    final map = _map(await api.query('us_state_filing_package', {'taxYear': '$year'}));
    if (map['ok'] == false) return null;
    return UsStateFilingPackage.fromJson(map['data']);
  } on MycaApiException {
    return null;
  }
}

Future<String?> _saved(MycaApi api, String tool, Map<String, Object?> args) async {
  final reply = await api.propose(tool, args);
  final preview = reply.preview;
  if (preview == null) return reply.blockers.isNotEmpty ? reply.blockers.join('\n') : (reply.reply.isEmpty ? 'Not saved. Check your connection and try again.' : reply.reply);
  final confirmed = await api.confirm(preview.token);
  if (confirmed.posted) return null;
  return confirmed.reply.isEmpty ? 'Not saved. Check your connection and try again.' : confirmed.reply;
}

Future<String?> saveStateResidency(MycaApi api, int year, List<UsResidency> states) => _saved(api, 'set_us_state_residency', {'taxYear': '$year', 'states': [for (final s in states) s.toArgs()]});

Future<String?> saveStateAnswers(MycaApi api, int year, String state, Map<String, Object?> answers) => _saved(api, 'set_us_state_answers', {'taxYear': '$year', 'state': state.toUpperCase(), 'answers': answers});

List<String> w2States(List<UsTaxForm> forms) => {
      for (final f in forms)
        if (f.kind == 'W-2' && '${f.amounts['state'] ?? ''}'.trim().isNotEmpty) '${f.amounts['state']}'.trim().toUpperCase(),
    }.toList();

String provisionalNote(String stateName, String taxYear) => '$stateName hasn\'t published its $taxYear figures yet, so this return can\'t be filed. MyCA updates it as soon as $stateName does.';
