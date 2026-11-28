Map<String, dynamic> offlineMap(Object? value) => value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

List<Map<String, dynamic>> offlineMaps(Object? value) => value is List ? [for (final item in value) if (item is Map) Map<String, dynamic>.from(item)] : <Map<String, dynamic>>[];

String offlineText(Object? value) => value == null ? '' : '$value'.trim();

num offlineNum(Object? value) => value is num ? value : num.tryParse('$value') ?? 0;

enum EntryStatus { waiting, synced, conflict, rejected }

EntryStatus entryStatusOf(Object? value) => EntryStatus.values.firstWhere((status) => status.name == value, orElse: () => EntryStatus.waiting);

class KitItem {
  const KitItem({required this.sku, required this.name, this.barcode = '', this.hsn = '', this.gstRate, this.price, this.unit = '', this.onHand = 0});

  factory KitItem.fromJson(Map<String, dynamic> map) => KitItem(
    sku: offlineText(map['sku']),
    name: offlineText(map['name']).isEmpty ? offlineText(map['sku']) : offlineText(map['name']),
    barcode: offlineText(map['barcode']),
    hsn: offlineText(map['hsn']),
    gstRate: map['gstRate'] is num ? map['gstRate'] as num : null,
    price: map['price'] is num ? map['price'] as num : null,
    unit: offlineText(map['unit']),
    onHand: offlineNum(map['onHand']),
  );

  final String sku;
  final String name;
  final String barcode;
  final String hsn;
  final num? gstRate;
  final num? price;
  final String unit;
  final num onHand;
}

class KitParty {
  const KitParty({required this.name, this.gstin = '', this.state = '', this.address = ''});

  factory KitParty.fromJson(Map<String, dynamic> map) => KitParty(name: offlineText(map['name']), gstin: offlineText(map['gstin']), state: offlineText(map['state']), address: offlineText(map['address']));

  final String name;
  final String gstin;
  final String state;
  final String address;
}

class KitInvoice {
  const KitInvoice({required this.id, required this.date, required this.partyName, this.partyGstin = '', required this.total, required this.due});

  factory KitInvoice.fromJson(Map<String, dynamic> map) => KitInvoice(
    id: offlineText(map['id']),
    date: offlineText(map['date']),
    partyName: offlineText(map['partyName']),
    partyGstin: offlineText(map['partyGstin']),
    total: offlineNum(map['total']),
    due: offlineNum(map['due']),
  );

  final String id;
  final String date;
  final String partyName;
  final String partyGstin;
  final num total;
  final num due;
}

class KitSeries {
  const KitSeries({required this.code, required this.lastNumberByFy});

  factory KitSeries.fromJson(Map<String, dynamic> map) => KitSeries(
    code: offlineText(map['code']),
    lastNumberByFy: {for (final entry in offlineMap(map['lastNumberByFy']).entries) entry.key: offlineNum(entry.value).toInt()},
  );

  final String code;
  final Map<String, int> lastNumberByFy;
}

class OfflineKit {
  const OfflineKit(this.raw);

  final Map<String, dynamic> raw;

  Map<String, dynamic> get company => offlineMap(raw['company']);
  String get businessName => offlineText(company['name']);
  String get gstin => offlineText(company['gstin']);
  String get state => offlineText(company['state']);
  String get address => offlineText(company['address']);
  bool get composition => company['composition'] == true;
  String get lockThrough => offlineText(raw['lockThrough']);
  bool get einvoiceB2b => raw['einvoiceB2b'] == true;
  String get generatedAt => offlineText(raw['generatedAt']);
  int get buyerDetailsPaise {
    final value = offlineMap(raw['buyerDetails'])['taxablePaiseAtLeast'];
    return value is num ? value.toInt() : 5000000;
  }

  List<num> get gstRates => [for (final rate in (raw['gstRates'] is List ? raw['gstRates'] as List : const [])) if (rate is num) rate];

  List<KitItem> get items => offlineMaps(raw['items']).map(KitItem.fromJson).toList();
  List<KitParty> get parties => offlineMaps(raw['parties']).map(KitParty.fromJson).toList();
  List<KitInvoice> get openInvoices => offlineMaps(raw['openInvoices']).map(KitInvoice.fromJson).toList();
  KitSeries? get series => raw['series'] is Map ? KitSeries.fromJson(offlineMap(raw['series'])) : null;
}

class OfflineLine {
  const OfflineLine({required this.description, this.sku = '', this.hsn = '', required this.qty, this.unit = '', required this.rate, required this.gstRate});

  factory OfflineLine.fromJson(Map<String, dynamic> map) => OfflineLine(
    description: offlineText(map['description']),
    sku: offlineText(map['sku']),
    hsn: offlineText(map['hsn']),
    qty: map['qty'] == null || map['qty'] == '' ? 1 : offlineNum(map['qty']),
    unit: offlineText(map['unit']),
    rate: offlineNum(map['rate']),
    gstRate: offlineNum(map['gstRate']),
  );

  final String description;
  final String sku;
  final String hsn;
  final num qty;
  final String unit;
  final num rate;
  final num gstRate;

  Map<String, Object?> toJson() => {
    'description': description,
    if (sku.isNotEmpty) 'sku': sku,
    if (hsn.isNotEmpty) 'hsn': hsn,
    'qty': qty,
    if (unit.isNotEmpty) 'unit': unit,
    'rate': rate,
    'gstRate': gstRate,
  };
}

class OfflineBill {
  OfflineBill(this.data);

  final Map<String, dynamic> data;

  String get ref => offlineText(data['ref']);
  String get id => offlineText(data['id']);
  String get date => offlineText(data['date']);
  String get createdAt => offlineText(data['createdAt']);
  String get partyName => offlineText(data['partyName']);
  String get partyGstin => offlineText(data['partyGstin']);
  String get partyState => offlineText(data['partyState']);
  String get partyAddress => offlineText(data['partyAddress']);
  List<OfflineLine> get lines => offlineMaps(data['lines']).map(OfflineLine.fromJson).toList();
  Map<String, dynamic> get printed => offlineMap(data['printed']);
  Map<String, dynamic> get engine => offlineMap(data['engine']);
  List<Map<String, dynamic>> get lineFigures => offlineMaps(data['lineFigures']);
  num get total => offlineNum(printed['total']);
  Map<String, dynamic>? get payment => data['payment'] is Map ? offlineMap(data['payment']) : null;
  Map<String, dynamic>? get voided => data['voided'] is Map ? offlineMap(data['voided']) : null;
  EntryStatus get status => entryStatusOf(data['status']);
  String get error => offlineText(data['error']);
  String get hint => offlineText(data['hint']);
  String get syncedAt => offlineText(data['syncedAt']);
  bool get reprintNeeded => data['reprintNeeded'] == true;

  Map<String, Object?> toSync() => {
    'ref': ref,
    'id': id,
    'date': date,
    'createdAt': createdAt,
    'partyName': partyName,
    if (partyGstin.isNotEmpty) 'partyGstin': partyGstin,
    if (partyState.isNotEmpty) 'partyState': partyState,
    if (partyAddress.isNotEmpty) 'partyAddress': partyAddress,
    'lines': [for (final line in lines) line.toJson()],
    'printed': {for (final key in const ['taxable', 'cgst', 'sgst', 'igst', 'total']) key: printed[key]},
    if (payment != null) 'payment': payment,
    if (voided != null) 'voided': voided,
    if (data['acceptEngineFigures'] == true) 'acceptEngineFigures': true,
  };
}

class OfflineReceipt {
  OfflineReceipt(this.data);

  final Map<String, dynamic> data;

  String get ref => offlineText(data['ref']);
  String get invoiceId => offlineText(data['invoiceId']);
  num get amount => offlineNum(data['amount']);
  String get date => offlineText(data['date']);
  String get mode => offlineText(data['mode']);
  String get partyName => offlineText(data['partyName']);
  EntryStatus get status => entryStatusOf(data['status']);
  String get error => offlineText(data['error']);
  String get hint => offlineText(data['hint']);
  num? get due => data['due'] is num ? data['due'] as num : null;

  Map<String, Object?> toSync() => {'ref': ref, 'invoiceId': invoiceId, 'amount': amount, 'date': date, 'mode': mode};
}

class OfflineItem {
  OfflineItem(this.data);

  final Map<String, dynamic> data;

  String get ref => offlineText(data['ref']);
  String get sku => offlineText(data['sku']);
  String get name => offlineText(data['name']);
  num get price => offlineNum(data['price']);
  num get gstRate => offlineNum(data['gstRate']);
  String get hsn => offlineText(data['hsn']);
  String get barcode => offlineText(data['barcode']);
  EntryStatus get status => entryStatusOf(data['status']);
  String get error => offlineText(data['error']);
  String get hint => offlineText(data['hint']);

  Map<String, Object?> toSync() => {
    'ref': ref,
    'sku': sku,
    'name': name,
    'price': price,
    'gstRate': gstRate,
    if (hsn.isNotEmpty) 'hsn': hsn,
    if (barcode.isNotEmpty) 'barcode': barcode,
  };
}

class SyncOutcome {
  const SyncOutcome({this.sent = 0, this.synced = 0, this.needsYou = 0, this.reachedServer = true, this.message = ''});

  final int sent;
  final int synced;
  final int needsYou;
  final bool reachedServer;
  final String message;
}
