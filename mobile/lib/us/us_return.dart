import '../api/models.dart';
import '../api/myca_api.dart';

Map<String, dynamic> _map(Object? value) => value is Map ? value.cast<String, dynamic>() : const <String, dynamic>{};

List<Map<String, dynamic>> _maps(Object? value) => value is List ? [for (final v in value) if (v is Map) v.cast<String, dynamic>()] : const [];

String _text(Object? value) => value == null ? '' : '$value';

num _num(Object? value) => value is num ? value : num.tryParse('${value ?? ''}') ?? 0;

const filingStatuses = <(String, String, String)>[
  ('single', 'Single', 'Not married on December 31, or legally separated.'),
  ('mfj', 'Married filing jointly', 'One return for both of you. Usually the lowest tax.'),
  ('mfs', 'Married filing separately', 'Each spouse files their own return.'),
  ('hoh', 'Head of household', 'Unmarried and paid more than half the cost of a home for a qualifying person.'),
  ('qss', 'Qualifying surviving spouse', 'Your spouse died in the last two years and you have a dependent child.'),
];

String filingStatusLabel(String code) => filingStatuses.firstWhere((s) => s.$1 == code, orElse: () => (code, code, '')).$2;

bool filingWithSpouse(String code) => code == 'mfj' || code == 'mfs';

const usStates = <(String, String)>[
  ('AL', 'Alabama'), ('AK', 'Alaska'), ('AZ', 'Arizona'), ('AR', 'Arkansas'), ('CA', 'California'),
  ('CO', 'Colorado'), ('CT', 'Connecticut'), ('DE', 'Delaware'), ('DC', 'District of Columbia'), ('FL', 'Florida'),
  ('GA', 'Georgia'), ('HI', 'Hawaii'), ('ID', 'Idaho'), ('IL', 'Illinois'), ('IN', 'Indiana'),
  ('IA', 'Iowa'), ('KS', 'Kansas'), ('KY', 'Kentucky'), ('LA', 'Louisiana'), ('ME', 'Maine'),
  ('MD', 'Maryland'), ('MA', 'Massachusetts'), ('MI', 'Michigan'), ('MN', 'Minnesota'), ('MS', 'Mississippi'),
  ('MO', 'Missouri'), ('MT', 'Montana'), ('NE', 'Nebraska'), ('NV', 'Nevada'), ('NH', 'New Hampshire'),
  ('NJ', 'New Jersey'), ('NM', 'New Mexico'), ('NY', 'New York'), ('NC', 'North Carolina'), ('ND', 'North Dakota'),
  ('OH', 'Ohio'), ('OK', 'Oklahoma'), ('OR', 'Oregon'), ('PA', 'Pennsylvania'), ('RI', 'Rhode Island'),
  ('SC', 'South Carolina'), ('SD', 'South Dakota'), ('TN', 'Tennessee'), ('TX', 'Texas'), ('UT', 'Utah'),
  ('VT', 'Vermont'), ('VA', 'Virginia'), ('WA', 'Washington'), ('WV', 'West Virginia'), ('WI', 'Wisconsin'),
  ('WY', 'Wyoming'),
];

class UsFieldSpec {
  const UsFieldSpec(this.key, this.label, {this.box = '', this.type = 'money', this.required = false});

  factory UsFieldSpec.fromJson(Object? json) {
    final map = _map(json);
    return UsFieldSpec(
      _text(map['key']),
      _text(map['label']),
      box: _text(map['box']),
      type: _text(map['type']).isEmpty ? 'money' : _text(map['type']),
      required: map['required'] == true,
    );
  }

  final String key;
  final String label;
  final String box;
  final String type;
  final bool required;
}

class UsFormKind {
  const UsFormKind(this.kind, this.title, this.description, this.fields);

  factory UsFormKind.fromJson(Object? json) {
    final map = _map(json);
    return UsFormKind(_text(map['kind']), _text(map['title']), _text(map['description']), _maps(map['fields']).map(UsFieldSpec.fromJson).toList());
  }

  final String kind;
  final String title;
  final String description;
  final List<UsFieldSpec> fields;
}

const _payer = UsFieldSpec('payer', 'Payer or employer name', type: 'text', required: true);
const _payerTin = UsFieldSpec('payerTin', 'Payer or employer EIN', type: 'ein');

const builtInFormKinds = <UsFormKind>[
  UsFormKind('W-2', 'W-2', 'Wages from an employer', [
    UsFieldSpec('payer', 'Employer name', type: 'text', required: true),
    UsFieldSpec('payerTin', 'Employer EIN', box: 'b', type: 'ein'),
    UsFieldSpec('wages', 'Wages, tips, other compensation', box: '1', required: true),
    UsFieldSpec('federalWithheld', 'Federal income tax withheld', box: '2'),
    UsFieldSpec('socialSecurityWages', 'Social Security wages', box: '3'),
    UsFieldSpec('socialSecurityTax', 'Social Security tax withheld', box: '4'),
    UsFieldSpec('medicareWages', 'Medicare wages and tips', box: '5'),
    UsFieldSpec('medicareTax', 'Medicare tax withheld', box: '6'),
    UsFieldSpec('socialSecurityTips', 'Social Security tips', box: '7'),
    UsFieldSpec('state', 'State', box: '15', type: 'state'),
    UsFieldSpec('stateWages', 'State wages', box: '16'),
    UsFieldSpec('stateWithheld', 'State income tax', box: '17'),
  ]),
  UsFormKind('1099-NEC', '1099-NEC', 'Pay for freelance or contract work', [
    _payer, _payerTin,
    UsFieldSpec('nonemployeeCompensation', 'Nonemployee compensation', box: '1', required: true),
    UsFieldSpec('federalWithheld', 'Federal income tax withheld', box: '4'),
  ]),
  UsFormKind('1099-INT', '1099-INT', 'Interest from a bank or bonds', [
    _payer, _payerTin,
    UsFieldSpec('interest', 'Interest income', box: '1', required: true),
    UsFieldSpec('earlyWithdrawalPenalty', 'Early withdrawal penalty', box: '2'),
    UsFieldSpec('treasuryInterest', 'Interest on US Savings Bonds and Treasury obligations', box: '3'),
    UsFieldSpec('federalWithheld', 'Federal income tax withheld', box: '4'),
    UsFieldSpec('taxExemptInterest', 'Tax-exempt interest', box: '8'),
  ]),
  UsFormKind('1099-DIV', '1099-DIV', 'Dividends from shares or funds', [
    _payer, _payerTin,
    UsFieldSpec('ordinaryDividends', 'Total ordinary dividends', box: '1a', required: true),
    UsFieldSpec('qualifiedDividends', 'Qualified dividends', box: '1b'),
    UsFieldSpec('capitalGainDistributions', 'Total capital gain distributions', box: '2a'),
    UsFieldSpec('federalWithheld', 'Federal income tax withheld', box: '4'),
    UsFieldSpec('foreignTaxPaid', 'Foreign tax paid', box: '7'),
  ]),
  UsFormKind('1099-B', '1099-B', 'Sales of shares, funds or crypto', [
    _payer, _payerTin,
    UsFieldSpec('proceeds', 'Proceeds', box: '1d', required: true),
    UsFieldSpec('costBasis', 'Cost or other basis', box: '1e'),
    UsFieldSpec('term', 'Short-term or long-term', box: '2', type: 'term'),
    UsFieldSpec('federalWithheld', 'Federal income tax withheld', box: '4'),
  ]),
  UsFormKind('1099-MISC', '1099-MISC', 'Rent, royalties, prizes and other income', [
    _payer, _payerTin,
    UsFieldSpec('rents', 'Rents', box: '1'),
    UsFieldSpec('royalties', 'Royalties', box: '2'),
    UsFieldSpec('otherIncome', 'Other income', box: '3'),
    UsFieldSpec('federalWithheld', 'Federal income tax withheld', box: '4'),
  ]),
  UsFormKind('1099-G', '1099-G', 'Unemployment pay or a state tax refund', [
    _payer, _payerTin,
    UsFieldSpec('unemployment', 'Unemployment compensation', box: '1'),
    UsFieldSpec('stateRefund', 'State or local income tax refund', box: '2'),
    UsFieldSpec('federalWithheld', 'Federal income tax withheld', box: '4'),
  ]),
  UsFormKind('1099-R', '1099-R', 'Pension, IRA or 401(k) payouts', [
    _payer, _payerTin,
    UsFieldSpec('grossDistribution', 'Gross distribution', box: '1', required: true),
    UsFieldSpec('taxableAmount', 'Taxable amount', box: '2a'),
    UsFieldSpec('federalWithheld', 'Federal income tax withheld', box: '4'),
    UsFieldSpec('distributionCode', 'Distribution code', box: '7', type: 'code'),
  ]),
  UsFormKind('SSA-1099', 'SSA-1099', 'Social Security benefits', [
    UsFieldSpec('netBenefits', 'Net benefits for the year', box: '5', required: true),
    UsFieldSpec('federalWithheld', 'Voluntary federal income tax withheld', box: '6'),
  ]),
  UsFormKind('1098', '1098', 'Mortgage interest you paid', [
    UsFieldSpec('payer', 'Lender name', type: 'text', required: true),
    UsFieldSpec('mortgageInterest', 'Mortgage interest received', box: '1', required: true),
    UsFieldSpec('outstandingPrincipal', 'Outstanding mortgage principal', box: '2'),
    UsFieldSpec('pointsPaid', 'Points paid on purchase', box: '6'),
    UsFieldSpec('propertyTax', 'Property tax (if shown)', box: '10'),
  ]),
  UsFormKind('1098-E', '1098-E', 'Student loan interest you paid', [
    UsFieldSpec('payer', 'Lender name', type: 'text', required: true),
    UsFieldSpec('studentLoanInterest', 'Student loan interest received', box: '1', required: true),
  ]),
  UsFormKind('1098-T', '1098-T', 'College tuition', [
    UsFieldSpec('payer', 'School name', type: 'text', required: true),
    UsFieldSpec('payerTin', 'School EIN', type: 'ein'),
    UsFieldSpec('tuitionPaid', 'Payments received for tuition', box: '1', required: true),
    UsFieldSpec('scholarships', 'Scholarships or grants', box: '5'),
  ]),
];

UsFormKind? formKindOf(String kind, [List<UsFormKind> kinds = builtInFormKinds]) {
  for (final k in kinds) {
    if (k.kind == kind) return k;
  }
  for (final k in builtInFormKinds) {
    if (k.kind == kind) return k;
  }
  return null;
}

Future<List<UsFormKind>> loadFormKinds(MycaApi api) async {
  try {
    final kinds = _maps(toolData(await api.query('us_form_kinds'))['kinds']).map(UsFormKind.fromJson).where((k) => k.kind.isNotEmpty && k.fields.isNotEmpty).toList();
    return kinds.isEmpty ? builtInFormKinds : kinds;
  } on MycaApiException {
    return builtInFormKinds;
  }
}

class UsStep {
  const UsStep({required this.id, required this.label, required this.done});

  final String id;
  final String label;
  final bool done;
}

class UsReturnStatus {
  const UsReturnStatus({
    required this.taxYear,
    required this.filingStatus,
    required this.steps,
    required this.refund,
    required this.owed,
    required this.readyToSign,
    this.taxpayerName = '',
  });

  factory UsReturnStatus.fromJson(Object? json, {required int fallbackYear}) {
    final data = _map(json);
    return UsReturnStatus(
      taxYear: _num(data['taxYear']).toInt() == 0 ? fallbackYear : _num(data['taxYear']).toInt(),
      filingStatus: _text(data['filingStatus']),
      steps: [for (final s in _maps(data['steps'])) UsStep(id: _text(s['id']), label: _text(s['label']), done: s['done'] == true)],
      refund: _num(data['refund']),
      owed: _num(data['owed']),
      readyToSign: data['readyToSign'] == true,
      taxpayerName: _text(data['taxpayerName']),
    );
  }

  final int taxYear;
  final String filingStatus;
  final List<UsStep> steps;
  final num refund;
  final num owed;
  final bool readyToSign;
  final String taxpayerName;

  bool done(String id) => steps.any((s) => s.id == id && s.done);
}

class UsTaxForm {
  const UsTaxForm({required this.id, required this.kind, required this.payer, required this.amounts, required this.source, this.owner = 'taxpayer'});

  factory UsTaxForm.fromJson(Object? json) {
    final map = _map(json);
    final amounts = <String, Object?>{};
    final raw = map['amounts'] is Map ? _map(map['amounts']) : _map(map['fields']);
    amounts.addAll(raw);
    return UsTaxForm(
      id: _text(map['id']),
      kind: _text(map['kind']),
      payer: _text(map['payer']).isEmpty ? _text(raw['payer']) : _text(map['payer']),
      amounts: amounts,
      source: _text(map['source']),
      owner: _text(map['owner']).isEmpty ? 'taxpayer' : _text(map['owner']),
    );
  }

  final String id;
  final String kind;
  final String payer;
  final Map<String, Object?> amounts;
  final String source;
  final String owner;

  num get headline {
    final spec = formKindOf(kind);
    if (spec == null) return 0;
    for (final f in spec.fields) {
      if (f.type == 'money' && f.required) return _num(amounts[f.key]);
    }
    return 0;
  }

  num get withheld => _num(amounts['federalWithheld']);
}

class UsQuestion {
  const UsQuestion({required this.id, required this.text, required this.help, required this.kind, required this.options, required this.answer});

  factory UsQuestion.fromJson(Object? json) {
    final map = _map(json);
    final options = <(String, String)>[];
    final raw = map['options'];
    if (raw is List) {
      for (final o in raw) {
        if (o is Map) {
          options.add((_text(o['value']), _text(o['label']).isEmpty ? _text(o['value']) : _text(o['label'])));
        } else {
          options.add((_text(o), _text(o)));
        }
      }
    }
    return UsQuestion(id: _text(map['id']), text: _text(map['text']), help: _text(map['help']), kind: _text(map['kind']).isEmpty ? 'yesno' : _text(map['kind']), options: options, answer: map['answer']);
  }

  final String id;
  final String text;
  final String help;
  final String kind;
  final List<(String, String)> options;
  final Object? answer;

  bool get answered => answer != null && '$answer'.isNotEmpty;
}

class UsReviewLine {
  const UsReviewLine({required this.form, required this.line, required this.label, required this.amount, required this.source});

  final String form;
  final String line;
  final String label;
  final num amount;
  final String source;
}

class UsCheck {
  const UsCheck({required this.level, required this.message, required this.fix, this.step = ''});

  final String level;
  final String message;
  final String fix;
  final String step;

  bool get blocking => level == 'error';
}

class UsUnsupportedForm {
  const UsUnsupportedForm(this.form, this.reason);

  final String form;
  final String reason;
}

class UsReview {
  const UsReview({required this.lines, required this.refund, required this.owed, required this.checks, this.unsupported = const []});

  factory UsReview.fromJson(Object? json) {
    final data = _map(json);
    return UsReview(
      lines: [for (final l in _maps(data['lines'])) UsReviewLine(form: _text(l['form']), line: _text(l['line']), label: _text(l['label']), amount: _num(l['amount']), source: _text(l['source']))],
      refund: _num(data['refund']),
      owed: _num(data['owed']),
      checks: [for (final c in _maps(data['checks'])) UsCheck(level: _text(c['level']), message: _text(c['message']), fix: _text(c['fix']), step: _text(c['step']))],
      unsupported: [
        if (data['unsupported'] is List)
          for (final u in data['unsupported'] as List)
            if (u is Map && _text(u['form']).isNotEmpty && u['required'] != false) UsUnsupportedForm(_text(u['form']), _text(u['reason'])) else if (u is String && u.isNotEmpty) UsUnsupportedForm(u, ''),
      ],
    );
  }

  final List<UsReviewLine> lines;
  final num refund;
  final num owed;
  final List<UsCheck> checks;
  final List<UsUnsupportedForm> unsupported;

  bool get blocked => checks.any((c) => c.blocking);
  bool get canFile => unsupported.isEmpty;

  UsReviewLine? line(String form, String line) {
    for (final l in lines) {
      if (l.form == form && l.line == line) return l;
    }
    return null;
  }
}

class UsRejection {
  const UsRejection({required this.code, required this.message, required this.fix, required this.step});

  final String code;
  final String message;
  final String fix;
  final String step;
}

class UsEfileStatus {
  const UsEfileStatus({required this.status, required this.mode, required this.submissionId, required this.acceptedAt, required this.rejections});

  factory UsEfileStatus.fromJson(Object? json) {
    final data = _map(json);
    return UsEfileStatus(
      status: _text(data['status']).isEmpty ? 'not_filed' : _text(data['status']),
      mode: _text(data['mode']).isEmpty ? 'sandbox' : _text(data['mode']),
      submissionId: _text(data['submissionId']),
      acceptedAt: _text(data['acceptedAt']),
      rejections: [for (final r in _maps(data['rejections'])) UsRejection(code: _text(r['code']), message: _text(r['message']), fix: _text(r['fix']), step: _text(r['step']))],
    );
  }

  static const notFiled = UsEfileStatus(status: 'not_filed', mode: 'sandbox', submissionId: '', acceptedAt: '', rejections: []);

  final String status;
  final String mode;
  final String submissionId;
  final String acceptedAt;
  final List<UsRejection> rejections;

  bool get filed => status == 'submitted' || status == 'accepted';
  bool get sandbox => mode != 'live';
}

int currentTaxYear(DateTime now) => now.month >= 11 ? now.year : now.year - 1;

Future<ChatReply> saveAndConfirm(MycaApi api, String tool, Map<String, Object?> args) async {
  final reply = await api.propose(tool, args);
  final preview = reply.preview;
  if (preview == null) return reply;
  return api.confirm(preview.token);
}

Future<UsReturnStatus> loadReturnStatus(MycaApi api, int year) async =>
    UsReturnStatus.fromJson(toolData(await api.query('us_return_status', {'taxYear': year})), fallbackYear: year);

Future<List<UsTaxForm>> loadTaxForms(MycaApi api, int year) async =>
    _maps(toolData(await api.query('list_us_tax_forms', {'taxYear': year}))['forms']).map(UsTaxForm.fromJson).toList();

Future<List<UsQuestion>> loadInterview(MycaApi api, int year) async =>
    _maps(toolData(await api.query('us_interview', {'taxYear': year}))['questions']).map(UsQuestion.fromJson).toList();

Future<UsReview> loadReview(MycaApi api, int year) async => UsReview.fromJson(toolData(await api.query('us_return_review', {'taxYear': year})));

Future<UsEfileStatus> loadEfileStatus(MycaApi api, int year) async {
  try {
    return UsEfileStatus.fromJson(toolData(await api.query('us_efile_status', {'taxYear': year})));
  } on MycaApiException {
    return UsEfileStatus.notFiled;
  }
}


const noIncomeTaxStates = {'AK', 'FL', 'NV', 'NH', 'SD', 'TN', 'TX', 'WA', 'WY'};

bool stateHasIncomeTax(String code) => code.isNotEmpty && !noIncomeTaxStates.contains(code.toUpperCase());

const stateReturnNote = "File your state return on your state's website. We'll give you the numbers it needs.";

String unsupportedFormsLine(List<UsUnsupportedForm> forms) {
  final names = [for (final f in forms) f.form];
  final list = names.length <= 1 ? names.join() : '${names.sublist(0, names.length - 1).join(', ')} and ${names.last}';
  return 'Your return needs $list, which MyCA can\'t file yet. You won\'t be charged for a return we can\'t file.';
}
