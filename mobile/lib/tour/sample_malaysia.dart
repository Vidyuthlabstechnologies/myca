import '../my/my_code_tables.dart';
import '../my/my_codes.dart';

const sampleMalaysiaCompany = 'Teratai Digital Sdn Bhd';

const _tinFormatWhy = 'Not in an LHDN TIN format (IG for individuals, C, CS, D, E, F, FA, PT, TA, TC, TN, TR, TP, J or LE for others).';

const _taxTypeCodes = {'01', '02', '03', '04', '05', '06', 'E'};

const _adjustments = {'credit-note', 'debit-note', 'refund-note', 'self-billed-credit-note', 'self-billed-debit-note', 'self-billed-refund-note'};

const _documentTypes = {'invoice', 'credit-note', 'debit-note', 'refund-note', 'self-billed-invoice', 'self-billed-credit-note', 'self-billed-debit-note', 'self-billed-refund-note'};

const _specialTins = {myGeneralPublicTin, myForeignBuyerTin, myForeignSupplierTin, myGovernmentTin};

const _residentBands = [
  (0, 0),
  (5000, 100),
  (20000, 300),
  (35000, 600),
  (50000, 1100),
  (70000, 1900),
  (100000, 2500),
  (400000, 2600),
  (600000, 2800),
  (2000000, 3000),
];

const _reliefCaps2025 = {
  'individual': 9000,
  'disabledIndividual': 7000,
  'spouse': 4000,
  'disabledSpouse': 6000,
  'educationFees': 7000,
  'medicalSelfSpouseChild': 10000,
  'medicalParents': 8000,
  'disabilityEquipment': 6000,
  'lifestyle': 2500,
  'sportsLifestyle': 1000,
  'evChargingOrComposting': 2500,
  'lifeInsuranceAndEpf': 7000,
  'prsAndDeferredAnnuity': 3000,
  'educationAndMedicalInsurance': 4000,
  'socso': 350,
  'sspnNetSavings': 8000,
  'childcareFees': 3000,
  'breastfeedingEquipment': 1000,
  'firstHomeLoanInterest': 7000,
};

const _perChild2025 = {'childUnder18': 2000, 'childHigherEducation': 8000, 'disabledChild': 8000};

const _serviceThresholds = {'rental-or-leasing': 1000000, 'insurance': 1000000, 'food-and-beverage': 1500000, 'construction': 1500000, 'healthcare': 1500000};

const _reducedServices = {'food-and-beverage', 'telecommunication', 'parking', 'logistics', 'construction', 'healthcare-non-citizen', 'education-non-citizen'};

num _round2(num value) => (value * 100).round() / 100;

Map<String, dynamic> _map(Object? value) => value is Map ? value.cast<String, dynamic>() : <String, dynamic>{};

List<Map<String, dynamic>> _maps(Object? value) => value is List ? [for (final row in value) if (row is Map) row.cast<String, dynamic>()] : const [];

num _num(Object? value) => value is num ? value : (num.tryParse('$value') ?? 0);

String _iso(DateTime day) => '${day.year.toString().padLeft(4, '0')}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';

String sampleUid(String seed) {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  var hash = 2166136261;
  final out = StringBuffer();
  for (var round = 0; out.length < 26; round++) {
    for (final unit in '$seed#$round'.codeUnits) {
      hash = ((hash ^ unit) * 16777619) & 0xFFFFFFFF;
    }
    out.write(alphabet[hash % 32]);
  }
  return out.toString();
}

class SampleMalaysia {
  SampleMalaysia({required this.clock});

  final DateTime Function() clock;
  bool hasProfile = true;
  String? heldTool;
  Map<String, Object?> heldArgs = const {};

  Map<String, dynamic> profile = {
    'name': sampleMalaysiaCompany,
    'tin': 'C25845632020',
    'idType': 'BRN',
    'idValue': '202001034567',
    'sst': 'W10-2508-32000123',
    'msic': '62010',
    'phone': '+60321234567',
    'email': 'akaun@teratai.example.my',
    'address': {
      'lines': ['Level 12, Menara Teratai, Jalan Ampang'],
      'postcode': '50450',
      'city': 'Kuala Lumpur',
      'state': '14',
      'country': 'MYS',
    },
  };

  late final List<Map<String, dynamic>> einvoices = [
    _seed('INV-2026-0141', 'Syarikat Maju Jaya Sdn Bhd', 'valid', clock().toUtc().subtract(const Duration(hours: 33, minutes: 15)), 12500, 1000),
    _seed('INV-2026-0139', 'Restoran Selera Kampung', 'invalid', clock().toUtc().subtract(const Duration(days: 2, hours: 4)), 3200, 192, errors: const ['buyer.tin: The TIN does not match the registration number LHDN holds for this buyer (CF321)', 'lines[0].classification: Classification 022 needs a tariff code for goods (CF404)']),
    _seed('INV-2026-0137', 'Kedai Buku Ilmu Enterprise', 'valid', clock().toUtc().subtract(const Duration(days: 7)), 1850, 148),
    _seed('CON-2026-09', 'General Public', 'valid', clock().toUtc().subtract(const Duration(days: 4, hours: 2)), 8640.5, 691.24, type: 'invoice'),
    _seed('SUP-88231', '', 'valid', clock().toUtc().subtract(const Duration(hours: 9, minutes: 50)), 2400, 192, direction: 'received', supplier: 'Tenaga Pejabat Supplies Sdn Bhd'),
  ];

  Map<String, dynamic> _seed(String number, String buyer, String status, DateTime at, num net, num tax, {List<String> errors = const [], String type = 'invoice', String direction = 'issued', String supplier = ''}) {
    final uuid = sampleUid('doc$number');
    final longId = sampleUid('long$number');
    return {
      'number': number,
      'submissionUid': sampleUid('sub$number'),
      'uuid': uuid,
      'status': status,
      'errors': errors,
      'totals': {'net': net, 'tax': tax, 'payable': _round2(net + tax), 'currency': 'MYR'},
      'environment': 'mock',
      'at': at.toIso8601String(),
      'validatedAt': status == 'valid' ? at.add(const Duration(seconds: 4)).toIso8601String() : '',
      'link': status == 'valid' ? 'https://preprod.myinvois.hasil.gov.my/$uuid/share/$longId' : '',
      'buyerName': buyer,
      'supplierName': direction == 'received' ? supplier : sampleMalaysiaCompany,
      'direction': direction,
      'type': type,
    };
  }

  Map<String, Object?> _ok(Object? data) => {'ok': true, 'mock': true, 'data': data};

  Map<String, Object?> _fail(String error, [Map<String, Object?> extra = const {}]) => {'ok': false, 'error': error, ...extra};

  static const tools = {
    'my_einvoice_profile',
    'validate_my_tin',
    'my_einvoice_check',
    'my_einvoice_status',
    'my_einvoices',
    'my_received_einvoices',
    'my_einvoice_details',
    'my_einvoice_required',
    'my_lhdn_codes',
    'my_sst_registration',
    'my_sst_return',
    'my_sst_rate',
    'my_tax_estimate',
    'set_my_einvoice_profile',
    'issue_my_einvoice',
    'cancel_my_einvoice',
    'reject_my_einvoice',
    'issue_my_consolidated_einvoice',
    'issue_my_self_billed_einvoice',
    'simulate_my_received_einvoice',
  };

  bool handles(String name) => tools.contains(name);

  Object? query(String name, Map<String, Object?> args) => switch (name) {
    'my_einvoice_profile' => _ok({'supplier': hasProfile ? profile : null}),
    'validate_my_tin' => _validateTin(args),
    'my_einvoice_check' => _check(args),
    'my_einvoice_status' => _status(args),
    'my_einvoices' => _issuedList(args),
    'my_received_einvoices' => _receivedList(args),
    'my_einvoice_details' => _details(args),
    'my_einvoice_required' => _required(args),
    'my_lhdn_codes' => _codes(args),
    'my_sst_registration' => _registration(args),
    'my_sst_return' => _sstReturn(args),
    'my_sst_rate' => _rate(args),
    'my_tax_estimate' => _tax(args),
    _ => _fail('NOT_QUERYABLE', {'tool': name}),
  };

  Map<String, Object?> _validateTin(Map<String, Object?> args) {
    final tin = '${args['tin'] ?? ''}'.trim().toUpperCase();
    if (!isMyTinShape(tin)) return _ok({'tin': tin, 'format': false, 'lhdn': 'not checked', 'why': _tinFormatWhy});
    return _ok({'tin': tin, 'format': true, 'lhdn': tin.endsWith('9999') ? 'not found' : 'valid'});
  }

  List<Map<String, String>> _partyProblems(Object? raw, String role, {required bool supplier}) {
    final problems = <Map<String, String>>[];
    void add(String field, String why) => problems.add({'field': '$role.$field', 'why': why});
    if (raw is! Map) return [{'field': role, 'why': supplier ? 'missing; save the business details first' : 'missing'}];
    final party = raw.cast<String, dynamic>();
    if ('${party['name'] ?? ''}'.trim().isEmpty) add('name', 'the registered name is required');
    final tin = '${party['tin'] ?? ''}';
    if (!isMyTinShape(tin)) add('tin', 'not an LHDN tax identification number; check it with validate_my_tin');
    if (!_specialTins.contains(tin)) {
      if (!myIdTypes.contains(party['idType'] ?? 'BRN')) add('idType', 'one of ${myIdTypes.join(', ')}');
      if ('${party['idValue'] ?? ''}'.trim().isEmpty) add('idValue', 'the business registration, MyKad, passport or army number is required');
    }
    if (supplier && !isMyMsicShape('${party['msic'] ?? ''}')) add('msic', 'the five-digit MSIC 2008 activity code is required');
    final phone = '${party['phone'] ?? ''}';
    if (phone.isNotEmpty && !isMyPhoneShape(phone)) add('phone', 'digits with an optional leading +, 8 to 15 long');
    if (phone.isEmpty && supplier) add('phone', 'the supplier contact number is required');
    final where = _map(party['address']);
    final country = '${where['country'] ?? 'MYS'}'.toUpperCase();
    if (!myCountries.contains(country)) add('address.country', 'an ISO 3166-1 alpha-3 code');
    final state = '${where['state'] ?? ''}'.padLeft(2, '0');
    if (country == 'MYS' && !(state == '17' || myStates.any((row) => row.$1 == state))) add('address.state', 'a Malaysian state name or LHDN state code 01 to 16');
    if ('${where['city'] ?? ''}'.trim().isEmpty) add('address.city', 'the city is required');
    return problems;
  }

  (List<Map<String, String>>, Map<String, num>) _build(Map<String, Object?> args) {
    final problems = <Map<String, String>>[];
    void add(String field, String why) => problems.add({'field': field, 'why': why});
    final type = '${args['type'] ?? 'invoice'}';
    if (!_documentTypes.contains(type)) add('type', 'one of ${_documentTypes.join(', ')}');
    final number = '${args['number'] ?? ''}'.trim();
    if (number.isEmpty || number.length > 50) add('number', 'the invoice number, at most 50 characters');
    final currency = '${args['currency'] ?? 'MYR'}'.toUpperCase();
    if (!myCurrencies.contains(currency)) add('currency', 'an ISO 4217 code');
    if (currency != 'MYR' && !(_num(args['exchangeRate']) > 0)) add('exchangeRate', 'needed when the invoice is not in ringgit');
    problems.addAll(_partyProblems(hasProfile ? profile : null, 'supplier', supplier: true));
    problems.addAll(_partyProblems(args['buyer'], 'buyer', supplier: false));
    if (_adjustments.contains(type) && '${_map(args['original'])['uuid'] ?? ''}'.isEmpty) add('original.uuid', 'a credit, debit or refund note names the LHDN UUID of the e-invoice it adjusts');
    final lines = _maps(args['lines']);
    if (lines.isEmpty) add('lines', 'at least one line');
    var net = 0.0;
    var tax = 0.0;
    for (final (index, line) in lines.indexed) {
      final at = 'lines[$index]';
      if ('${line['description'] ?? ''}'.trim().isEmpty) add('$at.description', 'required');
      if (!myClassifications.any((row) => row.$1 == '${line['classification'] ?? ''}')) add('$at.classification', 'an LHDN classification code such as 022 (others)');
      final taxType = '${line['taxType'] ?? ''}';
      if (!_taxTypeCodes.contains(taxType)) add('$at.taxType', 'one of ${_taxTypeCodes.join(', ')}');
      final unit = line['unitCode'];
      if (unit != null && !myUnitCodes.contains(unit)) add('$at.unitCode', 'a UN/ECE recommendation 20 unit code such as C62 (one)');
      final quantity = _num(line['quantity'] ?? 1);
      if (!(quantity > 0)) add('$at.quantity', 'greater than zero');
      final price = _num(line['unitPrice']);
      if (price < 0) add('$at.unitPrice', 'zero or more');
      if (taxType == 'E' && '${line['exemptionReason'] ?? ''}'.trim().isEmpty) add('$at.exemptionReason', 'say why the line is exempt');
      final lineNet = _round2(quantity * _round2(price));
      final lineTax = taxType == 'E' || taxType == '06' ? 0 : _round2(lineNet * _num(line['taxRateBasisPoints']) / 10000);
      if (args['consolidated'] == true && lineNet + lineTax > 10000) add(at, 'a transaction above RM10,000 needs its own e-invoice, not a consolidated one');
      net += lineNet;
      tax += lineTax;
    }
    return (problems, {'net': _round2(net), 'tax': _round2(tax), 'payable': _round2(net + tax)});
  }

  Map<String, Object?> _check(Map<String, Object?> args) {
    final (problems, totals) = _build(args);
    if (problems.isNotEmpty) return _fail('EINVOICE_FIELDS_MISSING', {'problems': problems});
    return _ok({'ready': true, 'totals': {...totals, 'currency': '${args['currency'] ?? 'MYR'}'.toUpperCase()}});
  }

  Map<String, Object?> _status(Map<String, Object?> args) {
    final uid = '${args['submissionUid'] ?? ''}'.trim();
    if (!RegExp(r'^[A-Z0-9]{26}$').hasMatch(uid)) return _fail('BAD_SUBMISSION_UID');
    final docs = [for (final row in einvoices) if (row['submissionUid'] == uid) row];
    for (final row in docs) {
      if (row['status'] != 'submitted') continue;
      final buyerTin = '${row['buyerTin'] ?? ''}';
      if (buyerTin.endsWith('0000')) {
        row['status'] = 'invalid';
        row['errors'] = ['buyer.tin: LHDN could not match TIN $buyerTin to the buyer registration number (CF321)'];
      } else {
        row['status'] = 'valid';
        row['validatedAt'] = clock().toUtc().toIso8601String();
        row['link'] = 'https://preprod.myinvois.hasil.gov.my/${row['uuid']}/share/${sampleUid('long${row['number']}')}';
      }
    }
    return _ok({
      'submissionUid': uid,
      'overallStatus': docs.isEmpty ? 'InProgress' : (docs.every((row) => row['status'] == 'valid') ? 'Valid' : 'Invalid'),
      'documents': [
        for (final row in docs) {'uuid': row['uuid'], 'number': row['number'], 'status': row['status'], 'link': row['link'] ?? '', 'errors': row['errors'] ?? const <String>[], 'validatedAt': row['validatedAt'] ?? ''},
      ],
    });
  }

  Map<String, Object?> _registration(Map<String, Object?> args) {
    final date = '${args['date'] ?? ''}';
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(date)) return _fail('BAD_DATE', {'date': date});
    final kind = '${args['kind'] ?? 'service'}';
    final category = '${args['category'] ?? 'general'}'.replaceAll(RegExp(r'-non-citizen$'), '');
    final threshold = kind == 'sales' ? 500000 : (_serviceThresholds[category] ?? 500000);
    final value = _round2(_num(args['last12Months']));
    final ahead = args['next12Months'] == null ? null : _round2(_num(args['next12Months']));
    final must = value > threshold || (ahead != null && ahead > threshold);
    return _ok({
      'mustRegister': must,
      'threshold': threshold,
      'last12Months': value,
      'next12Months': ahead,
      'why': must ? 'Taxable value in the last twelve months has reached the registration threshold; register with Royal Malaysian Customs in MySST.' : 'Below the registration threshold; keep watching the twelve-month total.',
      'unreviewed': true,
    });
  }

  (String, int?, int?) _serviceRate(String category, String date) {
    if (!myServiceCategories.contains(category)) return ('unknown', null, null);
    if (category == 'credit-card') return ('flat', null, 2500);
    if (category == 'healthcare' || category == 'education') return ('exempt', 0, null);
    final reduced = {..._reducedServices, if (date.compareTo('2026-01-01') >= 0) 'rental-or-leasing'};
    return ('rate', reduced.contains(category) ? 600 : 800, null);
  }

  Map<String, Object?> _rate(Map<String, Object?> args) {
    if (args['kind'] == 'sales') return _ok({'kind': 'rate', 'percent': 10, 'ruleId': 'my.sst.sales-tax', 'unreviewed': true});
    final (kind, basis, flat) = _serviceRate('${args['category'] ?? 'general'}', '${args['date'] ?? ''}');
    if (kind == 'unknown') return _fail('UNKNOWN_SERVICE_CATEGORY');
    return _ok({'kind': kind, 'percent': basis == null ? null : basis / 100, 'flat': flat == null ? null : flat / 100, 'ruleId': 'my.sst.service-tax', 'unreviewed': true});
  }

  Map<String, Object?> _sstReturn(Map<String, Object?> args) {
    final match = RegExp(r'^(\d{4})-(0[1-9]|1[0-2])/(\d{4})-(0[1-9]|1[0-2])$').firstMatch('${args['period'] ?? ''}'.trim());
    if (match == null) return _fail('BAD_PERIOD', {'hint': 'A taxable period is two months written as 2026-01/2026-02.'});
    final start = DateTime(int.parse(match.group(1)!), int.parse(match.group(2)!));
    final endMonth = DateTime(int.parse(match.group(3)!), int.parse(match.group(4)!));
    if ((endMonth.year - start.year) * 12 + endMonth.month - start.month != 1) return _fail('BAD_PERIOD', {'hint': 'A taxable period is two months written as 2026-01/2026-02.'});
    final from = _iso(start);
    final to = _iso(DateTime(endMonth.year, endMonth.month + 1, 0));
    final due = _iso(DateTime(endMonth.year, endMonth.month + 2, 0));
    final groups = <String, Map<String, dynamic>>{};
    final problems = <Map<String, Object?>>[];
    for (final (index, line) in _maps(args['lines']).indexed) {
      final date = '${line['date'] ?? ''}';
      if (date.compareTo(from) < 0 || date.compareTo(to) > 0) continue;
      final valueSen = (_num(line['value']) * 100).round();
      if (line['kind'] == 'sales') {
        final rate = line['rateBasisPoints'] == null ? 1000 : _num(line['rateBasisPoints']).toInt();
        if (rate != 0 && rate != 500 && rate != 1000) {
          problems.add({'index': index, 'ok': false, 'error': 'SALES_TAX_RATE_NOT_IN_FORCE'});
          continue;
        }
        _add(groups, 'sales:$rate', {'part': 'sales tax', 'basisPoints': rate}, valueSen, (valueSen * rate / 10000).round());
      } else if (line['kind'] == 'service') {
        final category = '${line['category'] ?? 'general'}';
        final (kind, basis, flat) = _serviceRate(category, date);
        if (kind == 'unknown') {
          problems.add({'index': index, 'ok': false, 'error': 'UNKNOWN_SERVICE_CATEGORY'});
          continue;
        }
        if (kind == 'flat') {
          final counted = _num(line['cards'] ?? 1).floor();
          final cards = counted < 0 ? 0 : counted;
          _add(groups, 'service:credit-card', {'part': 'service tax', 'category': 'credit-card', 'flatSen': flat}, 0, cards * flat!);
        } else {
          _add(groups, 'service:$category:$basis', {'part': 'service tax', 'category': category, 'basisPoints': basis}, valueSen, (valueSen * basis! / 10000).round());
        }
      } else {
        problems.add({'index': index, 'ok': false, 'error': 'LINE_KIND_UNKNOWN'});
      }
    }
    final rows = [for (final row in groups.values) {...row, 'value': row['valueSen'] / 100, 'tax': row['taxSen'] / 100}];
    final salesSen = rows.where((row) => row['part'] == 'sales tax').fold<int>(0, (sum, row) => sum + (row['taxSen'] as int));
    final serviceSen = rows.where((row) => row['part'] == 'service tax').fold<int>(0, (sum, row) => sum + (row['taxSen'] as int));
    return {
      'ok': problems.isEmpty,
      if (problems.isNotEmpty) 'error': 'LINES_NEED_FIXING',
      if (problems.isNotEmpty) 'problems': problems,
      'data': {
        'period': '${match.group(1)}-${match.group(2)}/${match.group(3)}-${match.group(4)}',
        'from': from,
        'to': to,
        'due': due,
        'form': 'SST-02',
        'rows': rows,
        'salesTax': salesSen / 100,
        'serviceTax': serviceSen / 100,
        'totalTax': (salesSen + serviceSen) / 100,
        'filing': 'File SST-02 in MySST (mysst.customs.gov.my) and pay by the due date.',
        'unreviewed': true,
      },
    };
  }

  void _add(Map<String, Map<String, dynamic>> groups, String key, Map<String, Object?> base, int valueSen, int taxSen) {
    final row = groups.putIfAbsent(key, () => {...base, 'valueSen': 0, 'taxSen': 0});
    row['valueSen'] = (row['valueSen'] as int) + valueSen;
    row['taxSen'] = (row['taxSen'] as int) + taxSen;
  }

  Map<String, Object?> _tax(Map<String, Object?> args) {
    final year = '${args['yearOfAssessment'] ?? ''}';
    if (!RegExp(r'^\d{4}$').hasMatch(year)) return _fail('BAD_YEAR_OF_ASSESSMENT');
    final resident = args['resident'] != false;
    final gross = _map(args['income']).values.fold<num>(0, (sum, value) => sum + (_num(value) > 0 ? _num(value) : 0));
    final zakat = _num(args['zakat']);
    final pcb = _num(args['monthlyTaxDeductionsPaid']);
    if (int.parse(year) < 2023) return _fail('RULE_NOT_IN_FORCE', {'ruleId': 'my.income-tax.resident-bands'});
    final reliefs = <Map<String, Object?>>[];
    var chargeable = gross;
    num bandTax;
    var rebate = 0;
    if (!resident) {
      bandTax = _round2(gross * 0.3);
    } else {
      if (year != '2025') return _fail('RULE_NOT_IN_FORCE', {'ruleId': 'my.income-tax.reliefs', 'hint': 'MyCA has no attested figures for that year of assessment yet.'});
      final spouseHasIncome = args['spouseHasIncome'] != false;
      reliefs.add({'relief': 'individual', 'claimed': 9000, 'allowed': 9000});
      final unknown = <String>[];
      for (final entry in _map(args['reliefs']).entries) {
        if (entry.key == 'individual') continue;
        final perChild = _perChild2025[entry.key];
        if (perChild != null) {
          final children = _num(entry.value).floor();
          reliefs.add({'relief': entry.key, 'children': children, 'claimed': children * perChild, 'allowed': children * perChild});
          continue;
        }
        final cap = _reliefCaps2025[entry.key];
        if (cap == null) {
          unknown.add(entry.key);
          continue;
        }
        if ((entry.key == 'spouse' || entry.key == 'disabledSpouse') && spouseHasIncome) {
          reliefs.add({'relief': entry.key, 'claimed': 0, 'allowed': 0, 'why': 'Spouse relief needs a spouse with no income or a joint assessment.'});
          continue;
        }
        final claimed = _num(entry.value);
        reliefs.add({'relief': entry.key, 'claimed': claimed, 'allowed': claimed < cap ? claimed : cap, 'capSen': cap * 100});
      }
      final total = reliefs.fold<num>(0, (sum, row) => sum + _num(row['allowed']));
      chargeable = gross - total < 0 ? 0 : gross - total;
      bandTax = 0;
      for (var index = 0; index < _residentBands.length; index++) {
        final (over, rate) = _residentBands[index];
        final upTo = index + 1 < _residentBands.length ? _residentBands[index + 1].$1 : double.infinity;
        if (chargeable <= over) break;
        final slice = (chargeable < upTo ? chargeable : upTo) - over;
        bandTax += slice * rate / 10000;
      }
      bandTax = _round2(bandTax);
      if (chargeable <= 35000) {
        rebate = 400;
        if (!spouseHasIncome && reliefs.any((row) => row['relief'] == 'spouse' && _num(row['allowed']) > 0)) rebate += 400;
      }
    }
    final afterRebate = bandTax - rebate < 0 ? 0 : bandTax - rebate;
    final zakatAllowed = zakat < afterRebate ? zakat : afterRebate;
    final payable = _round2(afterRebate - zakatAllowed);
    final balance = _round2(payable - pcb);
    return _ok({
      'yearOfAssessment': year,
      'resident': resident,
      'form': resident ? 'Form BE (no business income) or Form B (with business income), filed in MyTax e-Filing' : 'Form M, filed in MyTax e-Filing',
      'totalIncome': _round2(gross),
      'reliefs': reliefs,
      'unknownReliefs': const <String>[],
      'totalReliefs': reliefs.fold<num>(0, (sum, row) => sum + _num(row['allowed'])),
      'chargeableIncome': _round2(chargeable),
      'taxOnChargeableIncome': bandTax,
      'rebate': rebate,
      'rebateEntitled': rebate,
      'zakat': _round2(zakatAllowed),
      'taxPayable': payable,
      'monthlyTaxDeductionsPaid': _round2(pcb),
      'balance': balance,
      'outcome': balance > 0 ? 'to pay' : (balance < 0 ? 'refund due' : 'nothing due'),
      'unreviewed': true,
      'filing': 'LHDN has no third-party filing API for individual returns. MyCA prepares the figures; the taxpayer signs in to MyTax and files.',
    });
  }


  static const _windowHours = 72;

  String _until(Map<String, dynamic> row) {
    final validated = DateTime.tryParse('${row['validatedAt'] ?? ''}');
    if (validated == null || row['status'] != 'valid') return '';
    return validated.add(const Duration(hours: _windowHours)).toUtc().toIso8601String();
  }

  Map<String, Object?> _issuedList(Map<String, Object?> args) {
    final status = '${args['status'] ?? ''}'.toLowerCase();
    const known = ['submitted', 'valid', 'invalid', 'rejected', 'cancelled'];
    if (status.isNotEmpty && !known.contains(status)) return _fail('BAD_STATUS', {'allowed': known});
    final limit = args['limit'] == null ? 50 : _num(args['limit']).toInt();
    if (limit < 1 || limit > 500) return _fail('BAD_LIMIT');
    final rows = [for (final row in einvoices) if (row['direction'] == 'issued' && (status.isEmpty || row['status'] == status)) row];
    final byStatus = <String, int>{};
    for (final row in rows) {
      byStatus['${row['status']}'] = (byStatus['${row['status']}'] ?? 0) + 1;
    }
    return _ok({
      'documents': [
        for (final row in rows.take(limit))
          {
            'number': row['number'],
            'type': row['type'] ?? 'invoice',
            'kind': row['kind'] ?? 'invoice',
            'uuid': row['uuid'],
            'submissionUid': row['submissionUid'],
            'status': row['status'],
            'issueDate': '${row['at'] ?? ''}'.split('T').first,
            'buyer': {'name': row['buyerName'], 'tin': row['buyerTin'] ?? ''},
            'payable': _map(row['totals'])['payable'],
            'currency': _map(row['totals'])['currency'] ?? 'MYR',
            'payableMyr': _map(row['totals'])['payable'],
            'link': row['link'] ?? '',
            'environment': 'sandbox',
            'cancellableUntil': _until(row),
            if (row['period'] != null) 'period': row['period'],
          },
      ],
      'total': rows.length,
      'byStatus': byStatus,
    });
  }

  Map<String, Object?> _receivedList(Map<String, Object?> args) {
    final pageNo = args['pageNo'] == null ? 1 : _num(args['pageNo']).toInt();
    final pageSize = args['pageSize'] == null ? 50 : _num(args['pageSize']).toInt();
    if (pageNo < 1 || pageSize < 1 || pageSize > 100) return _fail('BAD_PAGE');
    final rows = [for (final row in einvoices) if (row['direction'] == 'received') row];
    return {
      'ok': true,
      'simulated': true,
      'data': {
        'documents': [
          for (final row in rows.skip((pageNo - 1) * pageSize).take(pageSize))
            {
              'uuid': row['uuid'],
              'number': row['number'],
              'type': 'Invoice',
              'supplier': {'tin': row['supplierTin'] ?? 'C10987654321', 'name': row['supplierName']},
              'issuedAt': row['at'],
              'validatedAt': row['validatedAt'],
              'totalPayable': _map(row['totals'])['payable'],
              'status': row['status'],
              'rejectableUntil': _until(row),
              if (row['rejectionReason'] != null) 'rejectionReason': row['rejectionReason'],
            },
        ],
        'total': rows.length,
        'pages': 1,
        'pageNo': pageNo,
      },
    };
  }

  Map<String, String> _lhdnError(Object? line) {
    final text = '$line';
    final code = RegExp(r'\(([A-Z]{2}\d{3})\)$').firstMatch(text)?.group(1) ?? '';
    final at = text.indexOf(': ');
    final path = at > 0 ? text.substring(0, at) : '';
    final why = (at > 0 ? text.substring(at + 2) : text).replaceAll(RegExp(r'\s*\([A-Z]{2}\d{3}\)$'), '');
    return {'step': 'Validation', 'code': code, 'why': why, 'path': path};
  }

  Map<String, Object?> _details(Map<String, Object?> args) {
    final uuid = '${args['uuid'] ?? ''}'.trim();
    if (!RegExp(r'^[A-Z0-9]{26}$').hasMatch(uuid)) return _fail('BAD_DOCUMENT_UUID');
    final found = einvoices.where((row) => row['uuid'] == uuid);
    if (found.isEmpty) return _fail('EINVOICE_NOT_FOUND');
    final row = found.first;
    final issued = row['direction'] == 'issued';
    final status = '${row['status'] ?? ''}';
    return {
      'ok': true,
      'simulated': true,
      'data': {
        'uuid': uuid,
        'number': row['number'],
        'type': 'Invoice',
        'status': status.isEmpty ? '' : status[0].toUpperCase() + status.substring(1),
        'issuer': {'tin': issued ? profile['tin'] : (row['supplierTin'] ?? 'C10987654321'), 'name': row['supplierName']},
        'receiver': {'tin': issued ? (row['buyerTin'] ?? '') : profile['tin'], 'name': issued ? row['buyerName'] : profile['name']},
        'issuedAt': row['at'],
        'validatedAt': row['validatedAt'] ?? '',
        'totalPayable': _map(row['totals'])['payable'],
        'cancelledAt': row['cancelledAt'] ?? '',
        'rejectionRequestedAt': row['rejectedAt'] ?? '',
        'reason': row['rejectionReason'] ?? row['cancelReason'] ?? '',
        'link': row['link'] ?? '',
        'errors': [for (final line in (row['errors'] as List? ?? const [])) _lhdnError(line)],
      },
    };
  }

  Map<String, Object?> _required(Map<String, Object?> args) {
    final date = '${args['date'] ?? ''}';
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(date)) return _fail('BAD_DATE', {'date': date});
    final turnover = _num(args['annualTurnover']) + _num(args['relatedCompanyTurnover']);
    final exemptBelow = date.compareTo('2026-09-01') >= 0 ? 3000000 : 1000000;
    final exempt = turnover < exemptBelow;
    return _ok({
      'required': !exempt,
      'exempt': exempt,
      'startsFrom': exempt ? '' : '2025-07-01',
      'why': exempt ? 'Annual turnover is below RM${exemptBelow ~/ 1000000} million, so the business is exempt.' : 'Annual turnover is RM${exemptBelow ~/ 1000000} million or more, so e-invoicing applies.',
      'unreviewed': true,
    });
  }

  Map<String, Object?> _codes(Map<String, Object?> args) {
    final table = '${args['table'] ?? ''}';
    final query = '${args['query'] ?? ''}'.toLowerCase();
    final code = '${args['code'] ?? ''}';
    final limit = args['limit'] == null ? 50 : _num(args['limit']).toInt();
    final List<(String, String)> rows = switch (table) {
      'states' => myStates,
      'classifications' => myClassifications,
      'taxTypes' => [for (final code in myTaxTypes) (code, code)],
      'paymentMethods' => [for (final code in myPaymentMethods) (code, code)],
      'units' => [for (final code in myUnitCodes) (code, code)],
      'currencies' => [for (final code in myCurrencies) (code, code)],
      'countries' => [for (final code in myCountries) (code, code)],
      'documentTypes' => [for (final type in myDocumentTypes) (type, type)],
      _ => const [],
    };
    if (rows.isEmpty) return _fail('UNKNOWN_TABLE', {'tables': const ['states', 'taxTypes', 'documentTypes', 'classifications', 'paymentMethods', 'msic', 'countries', 'currencies', 'units']});
    final found = [
      for (final (key, name) in rows)
        if ((code.isEmpty || key == code) && (query.isEmpty || key.toLowerCase().contains(query) || name.toLowerCase().contains(query))) {'code': key, 'name': name},
    ];
    return _ok({'table': table, 'codes': found.take(limit).toList(), 'total': found.length});
  }

  (String, String, bool, String?) _monthWindow(String month) {
    final found = RegExp(r'^(\d{4})-(0[1-9]|1[0-2])$').firstMatch(month);
    if (found == null) return ('', '', false, 'BAD_MONTH');
    final year = int.parse(found.group(1)!);
    final number = int.parse(found.group(2)!);
    final to = DateTime(year, number + 1, 0);
    final due = to.add(const Duration(days: 7));
    final today = clock().toUtc().add(const Duration(hours: 8));
    final day = DateTime(today.year, today.month, today.day);
    if (!day.isAfter(to)) return (_iso(to), _iso(due), false, 'CONSOLIDATION_MONTH_NOT_ENDED');
    return (_iso(to), _iso(due), day.isAfter(due), null);
  }

  (List<String>, Map<String, num>, String?, String, bool) _consolidated(Map<String, Object?> args) {
    final blockers = <String>[];
    final month = '${args['month'] ?? ''}';
    final (_, due, late, problem) = _monthWindow(month);
    if (problem == 'BAD_MONTH') return (const ['month: give the month the receipts belong to, as 2026-10'], const {}, 'BAD_MONTH', due, late);
    if (problem != null) return (['month: a consolidated e-invoice for $month is issued after the month ends'], const {}, problem, due, late);
    if (late && args['acknowledgeLate'] != true) return (['LHDN expects the consolidated e-invoice within 7 days after the month ends (by $due). Send it with the late box ticked and say why.'], const {}, 'CONSOLIDATION_WINDOW_CLOSED', due, late);
    if (!hasProfile) return (const ['supplier: missing; save the business details first'], const {}, 'EINVOICE_PROFILE_MISSING', due, late);
    final lines = _maps(args['lines']);
    if (lines.isEmpty) blockers.add('lines: at least one line of receipts');
    var net = 0.0;
    var tax = 0.0;
    for (final (index, line) in lines.indexed) {
      final amount = line['amount'];
      if (amount is! num || amount < 0) {
        blockers.add('lines[$index].amount: the total of the receipts before tax, zero or more');
        continue;
      }
      final taxType = '${line['taxType'] ?? '06'}';
      final lineTax = taxType == '06' || taxType == 'E' ? 0 : _round2(amount * _num(line['taxRateBasisPoints']) / 10000);
      final largest = line['largestTransaction'] == null ? amount + lineTax : _num(line['largestTransaction']);
      if (largest > 10000) blockers.add('lines[$index]: a transaction above RM10,000 needs its own e-invoice, not a consolidated one');
      net += amount;
      tax += lineTax;
    }
    return (blockers, {'net': _round2(net), 'tax': _round2(tax), 'payable': _round2(net + tax)}, null, due, late);
  }

  Map<String, Object?> propose(String name, Map<String, Object?> args) {
    heldTool = null;
    heldArgs = const {};
    final blockers = <String>[];
    var code = '';
    var summary = '';
    var effects = <String>[];
    var figures = <String, Object?>{};
    switch (name) {
      case 'set_my_einvoice_profile':
        blockers.addAll(_partyProblems(args, 'supplier', supplier: true).map((row) => '${row['field']}: ${row['why']}'));
        summary = 'Save ${args['name'] ?? 'the business'} (TIN ${args['tin'] ?? '?'}) as the supplier on every e-invoice.';
        effects = ['Every new e-invoice uses these supplier details.'];
      case 'issue_my_einvoice' when args['consolidated'] == true:
        blockers.add('Issue the month\'s consolidated e-invoice with issue_my_consolidated_einvoice, which checks the 7-day window, excluded activities and the RM10,000 limit.');
        summary = 'Use the consolidated e-invoice tool.';
        code = 'USE_CONSOLIDATED_TOOL';
      case 'issue_my_consolidated_einvoice':
        final (problems, totals, problem, due, late) = _consolidated(args);
        blockers.addAll(problems);
        if (problem != null) code = problem;
        final month = '${args['month'] ?? ''}';
        summary = 'Send consolidated e-invoice CONS-${month.replaceAll('-', '')} for RM${(totals['payable'] ?? 0).toStringAsFixed(2)} to LHDN MyInvois.';
        effects = [
          if (late) 'This is late: it was due by $due. The late submission is recorded in the audit trail.',
          'One e-invoice to the general public (TIN EI00000000010) for the month\'s receipts, classification 004.',
          'LHDN expects it by $due.',
          'This goes to the built-in MyInvois sandbox; nothing reaches LHDN.',
        ];
        figures = totals;
      case 'issue_my_self_billed_einvoice':
        final (problems, totals) = _build({...args, 'buyer': profile, 'type': args['type'] ?? 'self-billed-invoice'});
        blockers.addAll([for (final row in problems) if (!'${row['field']}'.startsWith('buyer.')) '${row['field']}: ${row['why']}']);
        if (args['supplier'] is! Map) blockers.add('supplier: the supplier the business pays: a foreign supplier, an agent, a dealer or an individual');
        summary = 'Send self-billed e-invoice ${args['number']} for RM${totals['payable']!.toStringAsFixed(2)} to LHDN MyInvois.';
        effects = ['The business issues it as the buyer, on behalf of the supplier named.'];
        figures = totals;
      case 'simulate_my_received_einvoice':
        summary = 'Pretend supplier ${_map(args['supplier'])['name'] ?? ''} sent e-invoice ${args['number'] ?? ''} to the business.';
        effects = ['Sandbox only: it shows up in my_received_einvoices so rejection can be tried.'];
      case 'issue_my_einvoice':
        final (problems, totals) = _build(args);
        blockers.addAll(problems.map((row) => '${row['field']}: ${row['why']}'));
        summary = 'Send e-invoice ${args['number']} for RM${totals['payable']!.toStringAsFixed(2)} to LHDN MyInvois.';
        effects = ['LHDN validates it and gives it a UUID and a QR link for the buyer.', 'A validated e-invoice can only be cancelled within 72 hours.'];
        figures = totals;
      case 'cancel_my_einvoice':
      case 'reject_my_einvoice':
        if ('${args['reason'] ?? ''}'.trim().isEmpty) blockers.add(name == 'cancel_my_einvoice' ? 'Give the reason for cancelling.' : 'Give the reason for rejecting.');
        summary = '${name == 'cancel_my_einvoice' ? 'Cancel' : 'Reject'} e-invoice ${args['uuid'] ?? ''} at LHDN.';
        effects = ['The other party sees it as ${name == 'cancel_my_einvoice' ? 'cancelled' : 'rejected'}.'];
    }
    if (blockers.isNotEmpty) {
      return {'reply': 'I did not post anything, because:\n· ${blockers.join('\n· ')}', 'posted': false, 'blocked': true, if (code.isNotEmpty) 'error': code, 'preview': {'blockers': blockers, 'summary': summary, 'effects': const <String>[], 'figures': const <String, Object?>{}}};
    }
    heldTool = name;
    heldArgs = args;
    return {
      'reply': summary,
      'posted': false,
      'awaitingConfirmation': true,
      'preview': {'token': 'abc123abc123', 'tool': name, 'summary': summary, 'effects': effects, 'figures': figures},
    };
  }

  Map<String, Object?> confirm() {
    final name = heldTool;
    final args = heldArgs;
    heldTool = null;
    heldArgs = const {};
    if (name == null) return {'reply': 'There is nothing waiting to be posted.', 'tools': const <Object?>[], 'posted': false};
    final result = switch (name) {
      'set_my_einvoice_profile' => _saveProfile(args),
      'issue_my_einvoice' => _issue(args),
      'cancel_my_einvoice' => _cancel(args),
      'reject_my_einvoice' => _reject(args),
      'issue_my_consolidated_einvoice' => _issueConsolidated(args),
      'issue_my_self_billed_einvoice' => _issueSelfBilled(args),
      'simulate_my_received_einvoice' => _simulateReceived(args),
      _ => _fail('NOT_PROPOSABLE'),
    };
    return {
      'reply': result['ok'] == false ? 'Not done: ${result['error']}' : 'Done.',
      'tools': [
        {'name': name, 'result': result},
      ],
      'posted': result['ok'] != false,
      'confirmed': true,
    };
  }

  Map<String, Object?> _saveProfile(Map<String, Object?> args) {
    profile = Map<String, dynamic>.of(args);
    hasProfile = true;
    return _ok({'saved': true, 'supplier': {'name': args['name'], 'tin': args['tin'], 'msic': args['msic']}});
  }

  Map<String, Object?> _issue(Map<String, Object?> args) {
    final number = '${args['number']}'.trim();
    final existing = einvoices.where((row) => row['number'] == number && row['direction'] == 'issued' && row['status'] != 'rejected' && row['status'] != 'cancelled');
    if (existing.isNotEmpty) return _fail('EINVOICE_ALREADY_SENT', {'number': number, 'uuid': existing.first['uuid'], 'status': existing.first['status']});
    final (_, totals) = _build(args);
    final buyer = _map(args['buyer']);
    final rejected = number.toUpperCase().contains('REJECT');
    final record = <String, dynamic>{
      'number': number,
      'submissionUid': sampleUid('sub$number${clock().microsecondsSinceEpoch}'),
      'uuid': rejected ? '' : sampleUid('doc$number${clock().microsecondsSinceEpoch}'),
      'status': rejected ? 'rejected' : 'submitted',
      'errors': rejected ? ['DS302: The document structure is not valid for MyInvois version 1.1'] : const <String>[],
      'totals': {...totals, 'currency': '${args['currency'] ?? 'MYR'}'.toUpperCase()},
      'environment': 'mock',
      'at': clock().toUtc().toIso8601String(),
      'validatedAt': '',
      'link': '',
      'buyerName': '${buyer['name'] ?? ''}',
      'buyerTin': '${buyer['tin'] ?? ''}',
      'supplierName': '${profile['name'] ?? sampleMalaysiaCompany}',
      'direction': 'issued',
      'type': '${args['type'] ?? 'invoice'}',
    };
    einvoices.insert(0, record);
    if (rejected) return {'ok': false, 'error': 'EINVOICE_REJECTED', 'lhdn': record['errors'], 'mock': true, 'data': record};
    return {'ok': true, 'mock': true, 'data': record, 'hint': 'LHDN validates asynchronously; ask my_einvoice_status with the submission UID.'};
  }

  Map<String, Object?> _cancel(Map<String, Object?> args) {
    final uuid = '${args['uuid'] ?? ''}';
    final reason = '${args['reason'] ?? ''}'.trim();
    if (!RegExp(r'^[A-Z0-9]{26}$').hasMatch(uuid)) return _fail('BAD_DOCUMENT_UUID');
    if (reason.isEmpty || reason.length > 300) return _fail('CANCEL_REASON_REQUIRED');
    final found = einvoices.where((row) => row['uuid'] == uuid && row['direction'] == 'issued');
    if (found.isEmpty) return _fail('BAD_DOCUMENT_UUID');
    final row = found.first;
    if (row['status'] == 'cancelled') return _fail('EINVOICE_WRONG_STATE', {'status': 'cancelled', 'why': 'This e-invoice is already cancelled.'});
    final validated = DateTime.tryParse('${row['validatedAt'] ?? ''}');
    if (row['status'] != 'valid' || validated == null || clock().toUtc().difference(validated) > const Duration(hours: _windowHours)) {
      return _fail('WINDOW_CLOSED', {'why': 'LHDN allows a cancellation only within 72 hours of validation.', 'hint': 'Issue a credit note (issue_my_einvoice with type credit-note and original.uuid) instead.'});
    }
    row['status'] = 'cancelled';
    row['cancelledAt'] = clock().toUtc().toIso8601String();
    row['cancelReason'] = reason;
    return {'ok': true, 'simulated': true, 'data': {'uuid': uuid, 'number': row['number'], 'status': 'cancelled'}};
  }

  Map<String, Object?> _reject(Map<String, Object?> args) {
    final uuid = '${args['uuid'] ?? ''}';
    final reason = '${args['reason'] ?? ''}'.trim();
    if (!RegExp(r'^[A-Z0-9]{26}$').hasMatch(uuid)) return _fail('BAD_DOCUMENT_UUID');
    if (reason.isEmpty || reason.length > 300) return _fail('REJECT_REASON_REQUIRED');
    if (einvoices.any((row) => row['uuid'] == uuid && row['direction'] == 'issued')) return _fail('EINVOICE_NOT_YOURS', {'why': 'This is an e-invoice you issued; cancel it with cancel_my_einvoice instead of rejecting it.'});
    final found = einvoices.where((row) => row['uuid'] == uuid && row['direction'] == 'received');
    if (found.isEmpty) return _fail('BAD_DOCUMENT_UUID');
    final row = found.first;
    if (row['status'] == 'rejection requested') return _fail('EINVOICE_WRONG_STATE', {'why': 'A rejection was already requested; a document can be rejected only once.'});
    final validated = DateTime.tryParse('${row['validatedAt'] ?? ''}');
    if (validated != null && clock().toUtc().difference(validated) > const Duration(hours: _windowHours)) return _fail('WINDOW_CLOSED', {'hint': 'Ask the supplier to issue a credit note instead.'});
    row['status'] = 'rejection requested';
    row['rejectionReason'] = reason;
    row['rejectedAt'] = clock().toUtc().toIso8601String();
    return {'ok': true, 'simulated': true, 'data': {'uuid': uuid, 'status': 'rejection requested', 'note': 'The e-invoice stays valid until the supplier cancels it.'}};
  }

  Map<String, String> _problemOf(String line) {
    final at = line.indexOf(': ');
    if (at <= 0) return {'field': '', 'why': line};
    return {'field': line.substring(0, at), 'why': line.substring(at + 2)};
  }

  Map<String, Object?> _issueConsolidated(Map<String, Object?> args) {
    final (problems, totals, code, due, late) = _consolidated(args);
    if (problems.isNotEmpty) return _fail(code ?? 'EINVOICE_FIELDS_MISSING', {'problems': [for (final line in problems) _problemOf(line)]});
    final month = '${args['month']}';
    final number = '${args['number'] ?? 'CONS-${month.replaceAll('-', '')}'}';
    if (einvoices.any((row) => row['number'] == number && row['direction'] == 'issued' && row['status'] != 'rejected' && row['status'] != 'cancelled')) return _fail('EINVOICE_ALREADY_SENT', {'number': number});
    final record = <String, dynamic>{
      'number': number,
      'submissionUid': sampleUid('sub$number${clock().microsecondsSinceEpoch}'),
      'uuid': sampleUid('doc$number${clock().microsecondsSinceEpoch}'),
      'status': 'submitted',
      'errors': const <String>[],
      'totals': {...totals, 'currency': 'MYR'},
      'environment': 'sandbox',
      'at': clock().toUtc().toIso8601String(),
      'validatedAt': '',
      'link': '',
      'buyerName': 'General Public',
      'buyerTin': myGeneralPublicTin,
      'supplierName': '${profile['name'] ?? sampleMalaysiaCompany}',
      'direction': 'issued',
      'type': 'invoice',
      'kind': 'consolidated',
      'period': {'from': '$month-01', 'to': _monthWindow(month).$1, 'frequency': 'Monthly'},
    };
    einvoices.insert(0, record);
    return {'ok': true, 'simulated': true, 'data': {...record, 'late': late, 'due': due}};
  }

  Map<String, Object?> _issueSelfBilled(Map<String, Object?> args) {
    final number = '${args['number'] ?? ''}'.trim();
    final (_, totals) = _build({...args, 'buyer': profile, 'type': args['type'] ?? 'self-billed-invoice'});
    final supplier = _map(args['supplier']);
    final record = <String, dynamic>{
      'number': number,
      'submissionUid': sampleUid('sub$number${clock().microsecondsSinceEpoch}'),
      'uuid': sampleUid('doc$number${clock().microsecondsSinceEpoch}'),
      'status': 'submitted',
      'errors': const <String>[],
      'totals': {...totals, 'currency': '${args['currency'] ?? 'MYR'}'.toUpperCase()},
      'environment': 'sandbox',
      'at': clock().toUtc().toIso8601String(),
      'validatedAt': '',
      'link': '',
      'buyerName': '${profile['name'] ?? sampleMalaysiaCompany}',
      'supplierName': '${supplier['name'] ?? ''}',
      'direction': 'issued',
      'type': '${args['type'] ?? 'self-billed-invoice'}',
      'kind': 'self-billed',
    };
    einvoices.insert(0, record);
    return {'ok': true, 'simulated': true, 'data': record};
  }

  Map<String, Object?> _simulateReceived(Map<String, Object?> args) {
    final supplier = _map(args['supplier']);
    final number = '${args['number'] ?? 'SUP-${einvoices.length + 90000}'}';
    final total = _num(args['total'] ?? 1000);
    final tax = _num(args['tax'] ?? 0);
    final row = _seed(number, '', 'valid', clock().toUtc(), _round2(total - tax), tax, direction: 'received', supplier: '${supplier['name'] ?? 'Sample Supplier Sdn Bhd'}');
    row['supplierTin'] = '${supplier['tin'] ?? 'C10987654321'}';
    row['environment'] = 'sandbox';
    einvoices.insert(0, row);
    return {'ok': true, 'simulated': true, 'data': {'uuid': row['uuid'], 'number': number, 'supplier': {'tin': row['supplierTin'], 'name': row['supplierName']}, 'status': 'Valid'}};
  }
}
