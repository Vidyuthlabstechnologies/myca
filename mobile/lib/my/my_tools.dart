import '../api/myca_api.dart';
import 'my_codes.dart';

Map<String, dynamic> _map(Object? value) => value is Map ? value.cast<String, dynamic>() : <String, dynamic>{};

List<Map<String, dynamic>> _maps(Object? value) => value is List ? [for (final row in value) if (row is Map) row.cast<String, dynamic>()] : const [];

String _text(Object? value) => value == null ? '' : '$value';

num _num(Object? value) => value is num ? value : (num.tryParse('$value') ?? 0);

num? _numOrNull(Object? value) => value is num ? value : null;

class MyProblem {
  const MyProblem(this.field, this.why);

  factory MyProblem.fromJson(Object? json) {
    final map = _map(json);
    return MyProblem(_text(map['field']), _text(map['why'] ?? map['error'] ?? map['hint']));
  }

  factory MyProblem.fromBlocker(String line) {
    final at = line.indexOf(': ');
    if (at <= 0) return MyProblem('', line);
    return MyProblem(line.substring(0, at), line.substring(at + 2));
  }

  final String field;
  final String why;
}

class MyToolFailure implements Exception {
  const MyToolFailure(this.code, {this.problems = const [], this.detail = ''});

  factory MyToolFailure.fromResult(Map<String, dynamic> result) => MyToolFailure(
    _text(result['error']).isEmpty ? 'UNKNOWN' : _text(result['error']),
    problems: [..._maps(result['problems']).map(MyProblem.fromJson)],
    detail: _text(result['hint'] ?? result['why']),
  );

  final String code;
  final List<MyProblem> problems;
  final String detail;

  @override
  String toString() => code;
}

class MyAddress {
  const MyAddress({this.lines = const [], this.postcode = '', this.city = '', this.state = '', this.country = 'MYS'});

  factory MyAddress.fromJson(Object? json) {
    final map = _map(json);
    return MyAddress(
      lines: [for (final line in (map['lines'] is List ? map['lines'] as List : const [])) _text(line)],
      postcode: _text(map['postcode']),
      city: _text(map['city']),
      state: _text(map['state']),
      country: _text(map['country']).isEmpty ? 'MYS' : _text(map['country']),
    );
  }

  final List<String> lines;
  final String postcode;
  final String city;
  final String state;
  final String country;

  Map<String, Object?> toJson() => {
    'lines': [for (final line in lines) if (line.trim().isNotEmpty) line.trim()],
    if (postcode.trim().isNotEmpty) 'postcode': postcode.trim(),
    'city': city.trim(),
    'state': state,
    'country': country,
  };
}

class MyParty {
  const MyParty({
    required this.name,
    required this.tin,
    this.idType = 'BRN',
    this.idValue = '',
    this.sst = '',
    this.ttx = '',
    this.msic = '',
    this.phone = '',
    this.email = '',
    this.address = const MyAddress(),
  });

  factory MyParty.fromJson(Object? json) {
    final map = _map(json);
    return MyParty(
      name: _text(map['name']),
      tin: _text(map['tin']),
      idType: _text(map['idType']).isEmpty ? 'BRN' : _text(map['idType']),
      idValue: _text(map['idValue']),
      sst: _text(map['sst']),
      ttx: _text(map['ttx']),
      msic: _text(map['msic']),
      phone: _text(map['phone']),
      email: _text(map['email']),
      address: MyAddress.fromJson(map['address']),
    );
  }

  final String name;
  final String tin;
  final String idType;
  final String idValue;
  final String sst;
  final String ttx;
  final String msic;
  final String phone;
  final String email;
  final MyAddress address;

  Map<String, Object?> toJson() => {
    'name': name.trim(),
    'tin': tidyMyId(tin),
    'idType': idType,
    if (idValue.trim().isNotEmpty) 'idValue': tidyMyId(idValue),
    if (sst.trim().isNotEmpty) 'sst': sst.split(';').map(tidyMyId).where((part) => part.isNotEmpty).join(';'),
    if (ttx.trim().isNotEmpty) 'ttx': tidyMyId(ttx),
    if (msic.trim().isNotEmpty) 'msic': msic.trim(),
    if (phone.trim().isNotEmpty) 'phone': tidyMyPhone(phone),
    if (email.trim().isNotEmpty) 'email': email.trim(),
    'address': address.toJson(),
  };
}

class MyLine {
  const MyLine({
    required this.description,
    this.classification = '022',
    this.quantity = 1,
    this.unitCode = 'C62',
    required this.unitPrice,
    this.taxType = '06',
    this.ratePercent = 0,
    this.exemptionReason = '',
  });

  final String description;
  final String classification;
  final num quantity;
  final String unitCode;
  final num unitPrice;
  final String taxType;
  final num ratePercent;
  final String exemptionReason;

  bool get taxed => taxType != '06' && taxType != 'E';

  Map<String, Object?> toJson() => {
    'description': description.trim(),
    'classification': classification,
    'quantity': quantity,
    'unitCode': unitCode,
    'unitPrice': unitPrice,
    'taxType': taxType,
    'taxRateBasisPoints': taxed ? (ratePercent * 100).round() : 0,
    if (taxType == 'E') 'exemptionReason': exemptionReason.trim(),
  };
}

class MyDraft {
  const MyDraft({
    this.type = 'invoice',
    required this.number,
    this.currency = 'MYR',
    this.exchangeRate,
    required this.buyer,
    required this.lines,
    this.originalUuid = '',
    this.originalNumber = '',
    this.paymentMethod = '',
    this.consolidated = false,
  });

  final String type;
  final String number;
  final String currency;
  final num? exchangeRate;
  final MyParty buyer;
  final List<MyLine> lines;
  final String originalUuid;
  final String originalNumber;
  final String paymentMethod;
  final bool consolidated;

  Map<String, Object?> toJson() => {
    'type': type,
    'number': number.trim(),
    'currency': currency,
    if (currency != 'MYR' && exchangeRate != null) 'exchangeRate': exchangeRate,
    'buyer': buyer.toJson(),
    'lines': [for (final line in lines) line.toJson()],
    if (myAdjustmentTypes.contains(type)) 'original': {'uuid': originalUuid.trim().toUpperCase(), if (originalNumber.trim().isNotEmpty) 'number': originalNumber.trim()},
    if (paymentMethod.isNotEmpty) 'paymentMethod': paymentMethod,
    if (consolidated) 'consolidated': true,
  };
}

class MyTotals {
  const MyTotals({required this.net, required this.tax, required this.payable, this.currency = 'MYR', this.payableOnly = false});

  factory MyTotals.fromJson(Object? json) {
    final map = _map(json);
    return MyTotals(net: _num(map['net']), tax: _num(map['tax']), payable: _num(map['payable']), currency: _text(map['currency']).isEmpty ? 'MYR' : _text(map['currency']));
  }

  final num net;
  final num tax;
  final num payable;
  final String currency;
  final bool payableOnly;
}

class MyCheck {
  const MyCheck({required this.ready, this.totals, this.problems = const []});

  final bool ready;
  final MyTotals? totals;
  final List<MyProblem> problems;
}

class MyHeld {
  const MyHeld({required this.token, required this.summary, required this.effects, this.figures = const {}});

  final String token;
  final String summary;
  final List<String> effects;
  final Map<String, dynamic> figures;
}

class MyEinvoice {
  const MyEinvoice({
    required this.number,
    this.submissionUid = '',
    this.uuid = '',
    this.status = '',
    this.errors = const [],
    this.totals,
    this.environment = '',
    this.at = '',
    this.validatedAt = '',
    this.link = '',
    this.buyerName = '',
    this.supplierName = '',
    this.direction = 'issued',
    this.type = 'invoice',
    this.kind = 'invoice',
    this.until = '',
    this.reason = '',
  });

  factory MyEinvoice.fromJson(Object? json, {String direction = ''}) {
    final map = _map(json);
    final payable = map['payable'] ?? map['totalPayable'];
    final currency = _text(map['currency']).isEmpty ? 'MYR' : _text(map['currency']);
    final given = _text(map['direction']);
    final type = _text(map['type']).toLowerCase().replaceAll(' ', '-');
    return MyEinvoice(
      number: _text(map['number']),
      submissionUid: _text(map['submissionUid']),
      uuid: _text(map['uuid']),
      status: _text(map['status']).toLowerCase(),
      errors: _errors(map['errors'] ?? map['error'] ?? map['lhdn']),
      totals: map['totals'] is Map ? MyTotals.fromJson(map['totals']) : (payable is num ? MyTotals(net: payable, tax: 0, payable: payable, currency: currency, payableOnly: true) : null),
      environment: _text(map['environment']),
      at: [map['at'], map['issuedAt'], map['issueDate']].map(_text).firstWhere((value) => value.isNotEmpty, orElse: () => ''),
      validatedAt: _text(map['validatedAt']),
      link: _text(map['link']),
      buyerName: _text(map['buyerName']).isNotEmpty ? _text(map['buyerName']) : _text(_map(map['buyer'] ?? map['receiver'])['name']),
      supplierName: _text(map['supplierName']).isNotEmpty ? _text(map['supplierName']) : _text(_map(map['supplier'] ?? map['issuer'])['name']),
      direction: direction.isNotEmpty ? direction : (given.isEmpty ? 'issued' : given),
      type: type.isEmpty ? 'invoice' : type,
      kind: _text(map['kind']).isEmpty ? 'invoice' : _text(map['kind']),
      until: _text(map['cancellableUntil']).isNotEmpty ? _text(map['cancellableUntil']) : _text(map['rejectableUntil']),
      reason: _text(map['rejectionReason']).isNotEmpty ? _text(map['rejectionReason']) : _text(map['reason']),
    );
  }

  final String number;
  final String submissionUid;
  final String uuid;
  final String status;
  final List<String> errors;
  final MyTotals? totals;
  final String environment;
  final String at;
  final String validatedAt;
  final String link;
  final String buyerName;
  final String supplierName;
  final String direction;
  final String type;
  final String kind;
  final String until;
  final String reason;

  bool get valid => status == 'valid';
  bool get received => direction == 'received';
  bool get sandbox => environment == 'mock' || environment == 'test' || environment == 'sandbox';

  DateTime? get validatedTime => DateTime.tryParse(validatedAt.isNotEmpty ? validatedAt : at);

  MyEinvoice withStatus(MyDocumentStatus doc) => MyEinvoice(
    number: number,
    submissionUid: submissionUid,
    uuid: doc.uuid.isEmpty ? uuid : doc.uuid,
    status: doc.status.isEmpty ? status : doc.status,
    errors: doc.errors.isEmpty ? errors : doc.errors,
    totals: totals,
    environment: environment,
    at: at,
    validatedAt: doc.validatedAt.isEmpty ? validatedAt : doc.validatedAt,
    link: doc.link.isEmpty ? link : doc.link,
    buyerName: buyerName,
    supplierName: supplierName,
    direction: direction,
    type: type,
    kind: kind,
    until: until,
    reason: reason,
  );

  MyEinvoice cancelled() => MyEinvoice(
    number: number,
    submissionUid: submissionUid,
    uuid: uuid,
    status: 'cancelled',
    errors: errors,
    totals: totals,
    environment: environment,
    at: at,
    validatedAt: validatedAt,
    link: link,
    buyerName: buyerName,
    supplierName: supplierName,
    direction: direction,
    type: type,
    kind: kind,
    until: until,
    reason: reason,
  );

  MyEinvoice rejected([String why = '']) => MyEinvoice(
    number: number,
    submissionUid: submissionUid,
    uuid: uuid,
    status: 'rejection requested',
    errors: errors,
    totals: totals,
    environment: environment,
    at: at,
    validatedAt: validatedAt,
    link: link,
    buyerName: buyerName,
    supplierName: supplierName,
    direction: direction,
    type: type,
    kind: kind,
    until: until,
    reason: why.isEmpty ? reason : why.trim(),
  );
}

List<String> _errors(Object? value) {
  if (value == null) return const [];
  if (value is String) return value.isEmpty ? const [] : [value];
  if (value is List) return [for (final row in value) ..._errors(row)];
  if (value is Map) {
    final map = value.cast<String, dynamic>();
    final own = _text(map['message'] ?? map['error'] ?? map['why']);
    final field = _text(map['propertyPath'] ?? map['target'] ?? map['field']);
    final details = map['details'];
    return [
      if (own.isNotEmpty) field.isEmpty ? own : '$field: $own',
      if (details != null) ..._errors(details),
    ];
  }
  return ['$value'];
}

class MyDocumentStatus {
  const MyDocumentStatus({required this.uuid, required this.number, required this.status, this.link = '', this.errors = const [], this.validatedAt = ''});

  factory MyDocumentStatus.fromJson(Object? json) {
    final map = _map(json);
    return MyDocumentStatus(
      uuid: _text(map['uuid']),
      number: _text(map['number']),
      status: _text(map['status']).toLowerCase(),
      link: _text(map['link']),
      errors: _errors(map['errors'] ?? map['validationErrors']),
      validatedAt: _text(map['validatedAt'] ?? map['dateTimeValidated']),
    );
  }

  final String uuid;
  final String number;
  final String status;
  final String link;
  final List<String> errors;
  final String validatedAt;
}

class MyTinCheck {
  const MyTinCheck({required this.tin, required this.format, required this.lhdn, this.why = ''});

  final String tin;
  final bool format;
  final String lhdn;
  final String why;

  bool get valid => format && lhdn == 'valid';
}

class MySstRegistration {
  const MySstRegistration({required this.mustRegister, required this.threshold, required this.last12Months, required this.why, required this.unreviewed});

  final bool mustRegister;
  final num threshold;
  final num last12Months;
  final String why;
  final bool unreviewed;
}

class MySstLine {
  const MySstLine({required this.kind, this.category = 'general', this.rateBasisPoints, required this.value, required this.date, this.cards});

  final String kind;
  final String category;
  final int? rateBasisPoints;
  final num value;
  final String date;
  final int? cards;

  Map<String, Object?> toJson() => {
    'kind': kind,
    if (kind == 'service') 'category': category,
    if (kind == 'sales' && rateBasisPoints != null) 'rateBasisPoints': rateBasisPoints,
    'value': value,
    'date': date,
    if (cards != null) 'cards': cards,
  };
}

class MySstRow {
  const MySstRow({required this.part, required this.category, required this.basisPoints, required this.flatSen, required this.value, required this.tax});

  factory MySstRow.fromJson(Object? json) {
    final map = _map(json);
    return MySstRow(
      part: _text(map['part']),
      category: _text(map['category']),
      basisPoints: _numOrNull(map['basisPoints']),
      flatSen: _numOrNull(map['flatSen']),
      value: _num(map['value']),
      tax: _num(map['tax']),
    );
  }

  final String part;
  final String category;
  final num? basisPoints;
  final num? flatSen;
  final num value;
  final num tax;

  bool get sales => part == 'sales tax';
}

class MySstReturn {
  const MySstReturn({required this.period, required this.from, required this.to, required this.due, required this.form, required this.rows, required this.salesTax, required this.serviceTax, required this.totalTax, required this.filing, required this.unreviewed});

  factory MySstReturn.fromJson(Map<String, dynamic> map) => MySstReturn(
    period: _text(map['period']),
    from: _text(map['from']),
    to: _text(map['to']),
    due: _text(map['due']),
    form: _text(map['form']).isEmpty ? 'SST-02' : _text(map['form']),
    rows: _maps(map['rows']).map(MySstRow.fromJson).toList(),
    salesTax: _num(map['salesTax']),
    serviceTax: _num(map['serviceTax']),
    totalTax: _num(map['totalTax']),
    filing: _text(map['filing']),
    unreviewed: map['unreviewed'] != false,
  );

  final String period;
  final String from;
  final String to;
  final String due;
  final String form;
  final List<MySstRow> rows;
  final num salesTax;
  final num serviceTax;
  final num totalTax;
  final String filing;
  final bool unreviewed;
}

class MyReliefLine {
  const MyReliefLine({required this.relief, required this.claimed, required this.allowed, this.cap, this.children, this.why = ''});

  factory MyReliefLine.fromJson(Object? json) {
    final map = _map(json);
    final capSen = _numOrNull(map['capSen']);
    return MyReliefLine(
      relief: _text(map['relief']),
      claimed: _num(map['claimed'] ?? (_num(map['claimedSen']) / 100)),
      allowed: _num(map['allowed'] ?? (_num(map['allowedSen']) / 100)),
      cap: capSen == null ? null : capSen / 100,
      children: _numOrNull(map['children'])?.toInt(),
      why: _text(map['why']),
    );
  }

  final String relief;
  final num claimed;
  final num allowed;
  final num? cap;
  final int? children;
  final String why;
}

class MyTaxEstimate {
  const MyTaxEstimate({
    required this.yearOfAssessment,
    required this.resident,
    required this.form,
    required this.totalIncome,
    required this.reliefs,
    required this.unknownReliefs,
    required this.totalReliefs,
    required this.chargeableIncome,
    required this.taxOnChargeableIncome,
    required this.rebate,
    required this.zakat,
    required this.taxPayable,
    required this.pcbPaid,
    required this.balance,
    required this.outcome,
    required this.unreviewed,
    required this.filing,
  });

  factory MyTaxEstimate.fromJson(Map<String, dynamic> map) => MyTaxEstimate(
    yearOfAssessment: _text(map['yearOfAssessment']),
    resident: map['resident'] != false,
    form: _text(map['form']),
    totalIncome: _num(map['totalIncome']),
    reliefs: _maps(map['reliefs']).map(MyReliefLine.fromJson).toList(),
    unknownReliefs: [for (final key in (map['unknownReliefs'] is List ? map['unknownReliefs'] as List : const [])) _text(key)],
    totalReliefs: _num(map['totalReliefs']),
    chargeableIncome: _num(map['chargeableIncome']),
    taxOnChargeableIncome: _num(map['taxOnChargeableIncome']),
    rebate: _num(map['rebate']),
    zakat: _num(map['zakat']),
    taxPayable: _num(map['taxPayable']),
    pcbPaid: _num(map['monthlyTaxDeductionsPaid']),
    balance: _num(map['balance']),
    outcome: _text(map['outcome']),
    unreviewed: map['unreviewed'] != false,
    filing: _text(map['filing']),
  );

  final String yearOfAssessment;
  final bool resident;
  final String form;
  final num totalIncome;
  final List<MyReliefLine> reliefs;
  final List<String> unknownReliefs;
  final num totalReliefs;
  final num chargeableIncome;
  final num taxOnChargeableIncome;
  final num rebate;
  final num zakat;
  final num taxPayable;
  final num pcbPaid;
  final num balance;
  final String outcome;
  final bool unreviewed;
  final String filing;
}

class MyTools {
  const MyTools(this.api);

  final MycaApi api;

  Future<Map<String, dynamic>> _read(String name, Map<String, Object?> args) async {
    final body = _map(await api.query(name, args));
    if (body['ok'] == false) throw MyToolFailure.fromResult(body);
    return _map(body['data']);
  }

  Future<MyHeld> propose(String name, Map<String, Object?> args) async {
    final reply = await api.propose(name, args);
    final preview = reply.preview;
    if (preview != null) return MyHeld(token: preview.token, summary: preview.summary, effects: preview.effects, figures: preview.figures);
    final problems = reply.blockers.map(MyProblem.fromBlocker).toList();
    throw MyToolFailure(reply.error.isNotEmpty ? reply.error : 'BLOCKED', problems: problems, detail: reply.reply);
  }

  Future<Map<String, dynamic>> confirm(String token) async {
    final reply = await api.confirm(token);
    if (reply.results.isEmpty) {
      if (reply.posted) return const {'ok': true, 'replayed': true};
      throw MyToolFailure(reply.error.isEmpty ? 'NOT_POSTED' : reply.error, detail: reply.reply);
    }
    return reply.results.first;
  }

  Future<void> discard() async {
    try {
      await api.discard();
    } on MycaApiException {
      return;
    }
  }

  Future<MyTinCheck> validateTin({required String tin, String idType = 'BRN', required String idValue}) async {
    final data = await _read('validate_my_tin', {'tin': tidyMyId(tin), 'idType': idType, 'idValue': tidyMyId(idValue)});
    return MyTinCheck(tin: _text(data['tin']), format: data['format'] != false, lhdn: _text(data['lhdn']), why: _text(data['why']));
  }

  Future<MyParty?> profile() async {
    try {
      final data = await _read('my_einvoice_profile', const {});
      final supplier = data['supplier'];
      if (supplier is! Map || _text(supplier['tin']).isEmpty) return null;
      return MyParty.fromJson(supplier);
    } on MyToolFailure {
      return null;
    }
  }

  Future<void> saveProfile(MyParty party) async {
    final held = await propose('set_my_einvoice_profile', party.toJson());
    final result = await confirm(held.token);
    if (result['ok'] == false) throw MyToolFailure.fromResult(result);
  }

  Future<MyCheck> check(MyDraft draft) async {
    final body = _map(await api.query('my_einvoice_check', draft.toJson()));
    if (body['ok'] == false) {
      final problems = _maps(body['problems']).map(MyProblem.fromJson).toList();
      if (problems.isEmpty) throw MyToolFailure.fromResult(body);
      return MyCheck(ready: false, problems: problems);
    }
    final data = _map(body['data']);
    return MyCheck(ready: data['ready'] != false, totals: MyTotals.fromJson(data['totals']));
  }

  Future<MyHeld> proposeIssue(MyDraft draft) => propose('issue_my_einvoice', draft.toJson());

  Future<MyEinvoice?> confirmIssue(String token, MyDraft draft) async {
    final result = await confirm(token);
    final data = _map(result['data']);
    if (data['number'] != null) {
      final record = _map(data);
      if (result['ok'] == false && record['error'] == null) record['error'] = result['lhdn'] ?? result['error'];
      return MyEinvoice.fromJson({...record, 'buyerName': draft.buyer.name, 'type': draft.type});
    }
    if (result['ok'] == false) throw MyToolFailure.fromResult(result);
    return null;
  }

  Future<List<MyDocumentStatus>> status(String submissionUid) async {
    final data = await _read('my_einvoice_status', {'submissionUid': submissionUid});
    return _maps(data['documents']).map(MyDocumentStatus.fromJson).toList();
  }

  Future<void> cancel(String uuid, String reason) async {
    final held = await propose('cancel_my_einvoice', {'uuid': uuid, 'reason': reason.trim()});
    final result = await confirm(held.token);
    if (result['ok'] == false) throw MyToolFailure.fromResult(result);
  }

  Future<void> reject(String uuid, String reason) async {
    final held = await propose('reject_my_einvoice', {'uuid': uuid, 'reason': reason.trim()});
    final result = await confirm(held.token);
    if (result['ok'] == false) throw MyToolFailure.fromResult(result);
  }

  static const _missing = {'NOT_QUERYABLE', 'UNKNOWN_TOOL', 'NOT_FOR_COUNTRY'};

  Future<List<MyEinvoice>?> list({String status = '', int limit = 100}) async {
    try {
      final data = await _read('my_einvoices', {if (status.isNotEmpty) 'status': status, 'limit': limit});
      return [for (final row in _maps(data['documents'])) MyEinvoice.fromJson(row, direction: 'issued')];
    } on MyToolFailure catch (failure) {
      if (_missing.contains(failure.code)) return null;
      rethrow;
    }
  }

  Future<List<MyEinvoice>?> received({int pageNo = 1, int pageSize = 50}) async {
    try {
      final data = await _read('my_received_einvoices', {'pageNo': pageNo, 'pageSize': pageSize});
      return [for (final row in _maps(data['documents'])) MyEinvoice.fromJson(row, direction: 'received')];
    } on MyToolFailure catch (failure) {
      if (_missing.contains(failure.code)) return null;
      rethrow;
    }
  }

  Future<MyEinvoice> details(String uuid, {String direction = 'issued'}) async {
    final data = await _read('my_einvoice_details', {'uuid': uuid});
    final errors = [
      for (final row in _maps(data['errors'])) [_text(row['path']).isEmpty ? '' : '${_text(row['path'])}: ', _text(row['why']), _text(row['code']).isEmpty ? '' : ' (${_text(row['code'])})'].join(),
    ];
    return MyEinvoice.fromJson({...data, 'errors': errors}, direction: direction);
  }

  Future<MyHeld> proposeConsolidated(Map<String, Object?> args) => propose('issue_my_consolidated_einvoice', args);

  Future<MyEinvoice?> confirmConsolidated(String token) async {
    final result = await confirm(token);
    final data = _map(result['data']);
    if (data['number'] != null) {
      final record = _map(data);
      if (result['ok'] == false && record['error'] == null) record['error'] = result['lhdn'] ?? result['error'];
      return MyEinvoice.fromJson({'buyerName': 'General Public', 'kind': 'consolidated', ...record});
    }
    if (result['ok'] == false) throw MyToolFailure.fromResult(result);
    return null;
  }

  Future<MySstRegistration> sstRegistration({required String kind, String category = 'general', required num last12Months, num? next12Months, required String date}) async {
    final data = await _read('my_sst_registration', {'kind': kind, if (kind == 'service') 'category': category, 'last12Months': last12Months, 'next12Months': ?next12Months, 'date': date});
    return MySstRegistration(mustRegister: data['mustRegister'] == true, threshold: _num(data['threshold']), last12Months: _num(data['last12Months']), why: _text(data['why']), unreviewed: data['unreviewed'] != false);
  }

  Future<(MySstReturn?, List<MyProblem>)> sstReturn({required String period, required List<MySstLine> lines}) async {
    final body = _map(await api.query('my_sst_return', {'period': period, 'lines': [for (final line in lines) line.toJson()]}));
    final data = body['data'];
    if (body['ok'] == false && data is! Map) throw MyToolFailure.fromResult(body);
    final problems = [
      for (final row in _maps(body['problems'])) MyProblem('lines[${row['index'] ?? 0}]', _text(row['error'])),
    ];
    return (MySstReturn.fromJson(_map(data)), problems);
  }

  Future<MyTaxEstimate> taxEstimate(Map<String, Object?> args) async => MyTaxEstimate.fromJson(await _read('my_tax_estimate', args));
}

String twoMonthPeriod(DateTime day) {
  final startMonth = day.month.isOdd ? day.month : day.month - 1;
  final start = DateTime(day.year, startMonth);
  final end = DateTime(day.year, startMonth + 1);
  String month(DateTime value) => '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}';
  return '${month(start)}/${month(end)}';
}

String dueSoonPeriod(DateTime now) => now.month.isOdd ? twoMonthPeriod(DateTime(now.year, now.month - 1)) : twoMonthPeriod(now);

List<String> recentPeriods(DateTime today, {int count = 6}) {
  final periods = <String>[];
  var cursor = DateTime(today.year, today.month);
  while (periods.length < count) {
    final period = twoMonthPeriod(cursor);
    if (!periods.contains(period)) periods.add(period);
    cursor = DateTime(cursor.year, cursor.month - 2);
  }
  return periods;
}

(DateTime, DateTime) periodBounds(String period) {
  final parts = period.split('/');
  final start = DateTime.parse('${parts[0]}-01');
  final endMonth = DateTime.parse('${parts[1]}-01');
  return (start, DateTime(endMonth.year, endMonth.month + 1, 0));
}
