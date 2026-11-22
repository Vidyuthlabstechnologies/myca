import 'us_return_test.dart' show UsFakeApi;

const noTaxStates = ['AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY'];

Map<String, Object?> nyReturn({bool provisional = false}) => {
      'state': 'NY',
      'stateName': 'New York',
      'status': 'computed',
      'residency': 'full-year',
      'form': 'IT-201',
      'stateIncome': 158000,
      'taxableIncome': 142000,
      'taxBeforeCredits': 8460,
      'nonrefundableCredits': [
        {'code': 'NY_HOUSEHOLD', 'label': 'New York State household credit', 'amount': 0},
        {'code': 'NY_RESIDENT_CREDIT', 'label': 'Resident credit for tax paid to another state', 'amount': 1310},
      ],
      'otherStateCredit': 1310,
      'otherTaxes': [
        {'code': 'NYC_TAX', 'label': 'New York City resident tax', 'amount': 5390},
      ],
      'totalTax': 12540,
      'refundableCredits': [
        {'code': 'NY_ESCC', 'label': 'Empire State child credit', 'amount': 330},
      ],
      'payments': {'withheld': 13900, 'localWithheld': 0, 'estimated': 0, 'extension': 0, 'local': 0},
      'refund': 1690,
      'owed': 0,
      'due': '2026-04-15',
      'checks': [
        {'level': 'warning', 'code': 'NY_MUNICIPAL_INTEREST', 'message': 'All your federally tax-exempt interest was added back as interest on other states\' bonds.', 'fix': 'Say how much of it is from New York bonds in your New York answers.'},
        {'level': 'info', 'code': 'NY_IT112R', 'message': 'Resident credit for tax paid to another state (Form IT-112-R) is limited to the New York tax on the income taxed there. Keep a copy of the other state\'s return.', 'fix': ''},
      ],
      'notCovered': [
        'Real property tax credit (Form IT-214), child and dependent care credits (Form IT-216) and the noncustodial parent EIC (Form IT-209)',
        'Yonkers nonresident earnings tax (Form Y-203)',
      ],
      'notes': const [],
      'lines': {'1': 158000, '17': 158000, '19': 158000, '33': 158000, '37': 142000, '39': 8460, '47a': 5390, '72': 13900, '78': 1690, 'ratio': 0.4523},
      'labels': {'1': 'Wages, salaries, tips, etc.', '17': 'Total federal income', '19': 'Federal adjusted gross income', '33': 'New York adjusted gross income', '37': 'Taxable income', '39': 'New York State tax on line 38 amount', '47a': 'New York City resident tax', '72': 'Total New York State tax withheld', '78': 'Amount of line 77 to be refunded', 'ratio': 'Income percentage'},
      'provisional': provisional,
      'unreviewed': true,
      'rulesUsed': const ['us.state-return.ny.income-tax@2025-01-01'],
    };

Map<String, Object?> njReturn() => {
      'state': 'NJ',
      'stateName': 'New Jersey',
      'status': 'computed',
      'residency': 'nonresident',
      'form': 'NJ-1040NR',
      'stateIncome': 24000,
      'taxableIncome': 22500,
      'taxBeforeCredits': 1310,
      'nonrefundableCredits': const [],
      'otherStateCredit': 0,
      'otherTaxes': const [],
      'totalTax': 1310,
      'refundableCredits': const [],
      'payments': {'withheld': 1100, 'estimated': 0, 'extension': 0, 'local': 0},
      'refund': 0,
      'owed': 210,
      'due': '2026-04-15',
      'checks': const [],
      'notCovered': const ['Property tax deduction for nonresidents'],
      'notes': const [],
      'provisional': false,
      'unreviewed': true,
    };

Map<String, Object?> paReciprocal() => {
      'state': 'PA',
      'stateName': 'Pennsylvania',
      'status': 'reciprocal',
      'residency': 'nonresident',
      'returnNeeded': true,
      'withheld': 640,
      'why': 'Pennsylvania does not tax the wages of New Jersey residents under their reciprocal agreement. Your W-2 shows \$640 withheld for Pennsylvania, so file its nonresident return to get it back, and give your employer the Pennsylvania exemption certificate.',
    };

const nyQuestions = [
  {'id': 'nycResident', 'kind': 'choice', 'options': ['full-year', 'part-year', 'no'], 'text': 'Did you live in New York City (the Bronx, Brooklyn, Manhattan, Queens or Staten Island) this year?', 'help': 'full-year, part-year (you moved in or out) or no. New York City tax is on the state return for city residents.'},
  {'id': 'nycMonths', 'when': {'nycResident': 'part-year'}, 'kind': 'count', 'text': 'Part-year New York City residents: full months you lived in the city', 'help': 'Count a period of more than half a month as a full month (Form IT-360.1, line 39).'},
  {'id': 'yonkersNonresidentWages', 'kind': 'yesno', 'text': 'Did you or your spouse work in Yonkers while not living there?', 'help': 'Wages or self-employment earned in Yonkers by a nonresident are taxed on Form Y-203.'},
  {'id': 'ny529Contributions', 'kind': 'amount', 'text': 'Contributions you made this year to New York\'s 529 college savings program as account owner', 'help': 'Subtracted up to \$5,000, or \$10,000 on a joint return (line 30).'},
  {'id': 'schoolDistrict', 'kind': 'text', 'text': 'Your New York school district name', 'help': 'As it appears in the IT-201 instructions.'},
  {'id': 'county', 'kind': 'choice', 'options': ['Albany', 'Bronx', 'Kings', 'Nassau', 'New York', 'Queens', 'Richmond', 'Suffolk', 'Westchester', 'Other'], 'text': 'County you lived in on December 31', 'help': ''},
];

class StateBook {
  StateBook({List<Map<String, Object?>>? residency, this.assumed = false, Map<String, Map<String, Object?>>? returns, Map<String, List<Map<String, Object?>>>? questions, Map<String, Map<String, Object?>>? answers, this.package, this.route = 'partner'})
      : residency = residency ?? [
          {'state': 'NY', 'residency': 'full-year'},
          {'state': 'NJ', 'residency': 'nonresident'},
        ],
        returns = returns ?? {'NY': nyReturn(), 'NJ': njReturn(), 'PA': paReciprocal()},
        questions = questions ?? {'NY': nyQuestions},
        answers = answers ?? {};

  List<Map<String, Object?>> residency;
  bool assumed;
  final Map<String, Map<String, Object?>> returns;
  final Map<String, List<Map<String, Object?>>> questions;
  final Map<String, Map<String, Object?>> answers;
  Map<String, Object?>? package;
  String route;
  bool fails = false;
  final saves = <List<Map<String, Object?>>>[];
  final answered = <Map<String, Object?>>[];

  void attach(UsFakeApi api) {
    api.stateTools = query;
    api.stateSaved = saved;
    api.stateAnswered = answer;
  }

  void answer(Map<String, Object?> args) {
    answered.add(args);
    final code = '${args['state']}';
    final current = {...?answers[code]};
    (args['answers'] as Map).forEach((key, value) => value == null ? current.remove('$key') : current['$key'] = value);
    answers[code] = current;
  }

  bool _applies(Map<String, Object?> q, Map<String, Object?> given) {
    final when = q['when'];
    if (when is! Map) return true;
    return when.entries.every((e) => given[e.key] == e.value);
  }

  void saved(Map<String, Object?> args) {
    final states = [for (final s in args['states'] as List) Map<String, Object?>.from(s as Map)];
    saves.add(states);
    residency = states;
    assumed = false;
  }

  Map<String, Object?> _returnFor(Map<String, Object?> entry) {
    final code = '${entry['state']}';
    final known = returns[code];
    if (known != null) return {...known, 'residency': entry['residency'], if (entry['from'] != null) 'from': entry['from'], if (entry['to'] != null) 'to': entry['to']};
    if (noTaxStates.contains(code)) return {'state': code, 'stateName': code, 'status': 'no-income-tax', 'residency': entry['residency'], 'returnNeeded': false, 'why': '$code levies no individual income tax, so there is no state income tax return.'};
    return {'state': code, 'stateName': code, 'status': 'not-built', 'residency': entry['residency'], 'returnNeeded': true, 'why': 'MyCA does not prepare the $code return yet.'};
  }

  Object? query(String name, Map<String, Object?> args) {
    if (fails) return {'ok': false, 'error': 'STATE_RESIDENCY_REQUIRED', 'hint': 'Add your home address to the federal return, or say which states you lived in.'};
    final only = '${args['state'] ?? ''}'.toUpperCase();
    switch (name) {
      case 'us_state_returns':
        final all = [for (final e in residency) _returnFor(e)];
        final picked = only.isEmpty ? all : all.where((r) => r['state'] == only).toList();
        if (only.isNotEmpty && picked.isEmpty) return {'ok': false, 'error': 'STATE_NOT_ON_RETURN', 'hint': '$only is not among the states on your return.'};
        final computed = all.where((r) => r['status'] == 'computed');
        return {
          'ok': true,
          'data': {
            'taxYear': '${args['taxYear']}',
            'filingStatus': 'mfj',
            'residencyAssumed': assumed,
            'residency': [for (final e in residency) {...e, if (assumed) 'assumed': true, if (answers['${e['state']}']?.isNotEmpty ?? false) 'answers': answers['${e['state']}']}],
            'returns': picked,
            'totals': {
              'tax': computed.fold<num>(0, (t, r) => t + (r['totalTax'] as num)),
              'refund': computed.fold<num>(0, (t, r) => t + (r['refund'] as num)),
              'owed': computed.fold<num>(0, (t, r) => t + (r['owed'] as num)),
            },
            'notBuilt': [for (final r in all) if (r['status'] == 'not-built') r['state']],
          },
        };
      case 'us_state_questions':
        final codes = only.isEmpty ? [for (final e in residency) '${e['state']}'] : [only];
        return {
          'ok': true,
          'data': {
            'taxYear': '${args['taxYear']}',
            'states': [
              for (final code in codes)
                {
                  'state': code,
                  'stateName': returns[code]?['stateName'] ?? code,
                  'built': returns.containsKey(code),
                  'residency': residency.where((e) => e['state'] == code).firstOrNull?['residency'] ?? 'full-year',
                  'skipped': (questions[code] ?? const []).where((q) => !_applies(q, answers[code] ?? const {})).length,
                  'questions': [
                    for (final q in questions[code] ?? const <Map<String, Object?>>[])
                      if (_applies(q, answers[code] ?? const {})) {for (final e in q.entries) if (e.key != 'when') e.key: e.value, 'answer': answers[code]?[q['id']]},
                  ],
                },
            ],
          },
        };
      case 'us_state_coverage':
        return {
          'ok': true,
          'data': {
            'years': ['2025', '2026'],
            'built': [
              {'state': 'NY', 'name': 'New York', 'forms': {'resident': 'IT-201', 'partYear': 'IT-203', 'nonresident': 'IT-203'}, 'notCovered': const []},
              {'state': 'NJ', 'name': 'New Jersey', 'forms': {'resident': 'NJ-1040', 'nonresident': 'NJ-1040NR'}, 'notCovered': const []},
              {'state': 'PA', 'name': 'Pennsylvania', 'forms': {'resident': 'PA-40'}, 'notCovered': const []},
              {'state': 'CA', 'name': 'California', 'forms': {'resident': '540', 'nonresident': '540NR'}, 'notCovered': const []},
            ],
            'notBuilt': const ['ZZ'],
            'noIncomeTax': noTaxStates,
          },
        };
      case 'us_state_filing_package':
        return package ??
            {
              'ok': true,
              'data': {
                'taxYear': '${args['taxYear']}',
                'contract': 'us-state-filing-v1',
                'route': route,
                if (route == 'irs-mef') 'routeNote': 'The federal return goes straight to the IRS, and MyCA does not send state returns with it yet. File the state returns with the e-file partner or on the state\'s own site.',
                'packages': [
                  for (final e in residency)
                    if (returns[e['state']]?['status'] == 'computed')
                      {
                        'state': e['state'],
                        'form': returns[e['state']]!['form'],
                        'route': route,
                        'piggyback': route == 'partner',
                        'ready': route == 'partner' && returns[e['state']]!['provisional'] != true,
                        'blockers': [if (route == 'irs-mef') 'STATE_MEF_NOT_BUILT', if (returns[e['state']]!['provisional'] == true) 'STATE_FIGURES_PROVISIONAL'],
                      },
                ],
                'missing': const [],
                'ready': route == 'partner',
              },
            };
    }
    return {'ok': false, 'error': 'UNKNOWN_TOOL'};
  }
}
