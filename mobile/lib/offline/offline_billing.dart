import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';

import '../api/myca_api.dart';
import 'gstin.dart';
import 'invoice_math.dart';
import 'offline_files.dart';
import 'offline_models.dart';

const offlineSaleTool = 'post_offline_sales';
const offlineKitTool = 'offline_kit';
const offlineRegisterTool = 'register_offline_device';
const offlineBatchLimit = 20;
const offlineBatchBytes = 40000;
const keepSyncedDays = 45;
const paymentModes = ['cash', 'upi', 'card', 'bank'];
const unnamedBuyers = ['', 'walk-in', 'walk-in customer', 'cash', 'cash sale', 'cash customer'];

bool isUnreachable(Object error) => error is MycaApiException && (error.code == 'UNREACHABLE' || error.code == 'SERVER_BUSY');

String fyCodeOf(String date) {
  final parts = date.split('-');
  final year = int.tryParse(parts.isNotEmpty ? parts[0] : '') ?? 0;
  final month = int.tryParse(parts.length > 1 ? parts[1] : '') ?? 0;
  final start = month >= 4 ? year : year - 1;
  String two(int value) => (value % 100).toString().padLeft(2, '0');
  return '${two(start)}${two(start + 1)}';
}

String offlineInvoiceId(String code, String date, int number) => 'INV-$code${fyCodeOf(date)}-${number.toString().padLeft(4, '0')}';

final offlineIdPattern = RegExp(r'^INV-[A-Z]{2}[0-9]{4}-[0-9]{4,}$');

String _isoDay(DateTime time) => '${time.year.toString().padLeft(4, '0')}-${time.month.toString().padLeft(2, '0')}-${time.day.toString().padLeft(2, '0')}';

String _stateCode(Object? value) {
  final text = offlineText(value);
  return RegExp(r'^\d{1,2}$').hasMatch(text) ? text.padLeft(2, '0') : '';
}

class OfflineDraft {
  const OfflineDraft({this.problem = '', this.figures, this.partyName = '', this.partyGstin = '', this.placeOfSupply = '', this.lines = const [], this.nextId = '', this.date = ''});

  final String problem;
  final BillFigures? figures;
  final String partyName;
  final String partyGstin;
  final String placeOfSupply;
  final List<OfflineLine> lines;
  final String nextId;
  final String date;

  bool get ok => problem.isEmpty && figures != null;
}

class OfflineBilling extends ChangeNotifier {
  OfflineBilling(this.files, {DateTime Function()? now, Random? random})
    : now = now ?? DateTime.now,
      _random = random ?? Random.secure();

  final OfflineFiles files;
  final DateTime Function() now;
  final Random _random;

  String _business = '';
  String _deviceId = '';
  Map<String, dynamic> _state = {};
  Future<void> _queue = Future.value();
  bool _syncing = false;
  bool? online;
  String lastSyncMessage = '';

  String get business => _business;
  String get deviceId => _deviceId;
  bool get syncing => _syncing;
  OfflineKit? get kit => _state['kit'] is Map ? OfflineKit(offlineMap(_state['kit'])) : null;
  String get kitAt => offlineText(_state['kitAt']);
  String get lastSyncAt => offlineText(_state['lastSyncAt']);
  KitSeries? get series => kit?.series;
  bool get ready => kit != null && series != null && series!.code.isNotEmpty;

  List<OfflineBill> get bills => offlineMaps(_state['bills']).map(OfflineBill.new).toList();
  List<OfflineReceipt> get receipts => offlineMaps(_state['receipts']).map(OfflineReceipt.new).toList();
  List<OfflineItem> get items => offlineMaps(_state['items']).map(OfflineItem.new).toList();

  int get waitingCount => [...bills.map((b) => b.status), ...receipts.map((r) => r.status), ...items.map((i) => i.status)].where((s) => s == EntryStatus.waiting).length;
  int get needsYouCount => [...bills.map((b) => b.status), ...receipts.map((r) => r.status)].where((s) => s == EntryStatus.conflict || s == EntryStatus.rejected).length;

  Future<T> _exclusive<T>(Future<T> Function() task) {
    final completer = Completer<T>();
    _queue = _queue.then((_) async {
      try {
        completer.complete(await task());
      } catch (err, stack) {
        completer.completeError(err, stack);
      }
    });
    return completer.future;
  }

  String _uuid() {
    final bytes = List<int>.generate(16, (_) => _random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }

  String _fileName(String business) => 'books-${business.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_')}.json';

  Future<void> open(String business) => _exclusive(() async {
    if (_deviceId.isEmpty) {
      final saved = offlineMap(_decode(await files.read('device.json')));
      _deviceId = offlineText(saved['deviceId']);
      if (_deviceId.isEmpty) {
        _deviceId = _uuid();
        await files.write('device.json', jsonEncode({'deviceId': _deviceId, 'createdAt': now().toUtc().toIso8601String()}));
      }
    }
    if (business == _business && _state.isNotEmpty) return;
    _business = business;
    _state = offlineMap(_decode(await files.read(_fileName(business))));
    _state.putIfAbsent('bills', () => <Object?>[]);
    _state.putIfAbsent('receipts', () => <Object?>[]);
    _state.putIfAbsent('items', () => <Object?>[]);
    _state.putIfAbsent('counters', () => <String, Object?>{});
    notifyListeners();
  });

  Object? _decode(String? text) {
    if (text == null || text.isEmpty) return null;
    try {
      return jsonDecode(text);
    } on FormatException {
      return null;
    }
  }

  Future<void> _save() async {
    _state['version'] = 1;
    _state['business'] = _business;
    _state['deviceId'] = _deviceId;
    await files.write(_fileName(_business), jsonEncode(_state));
  }

  Future<Object?> cachedSnapshot() async => _decode(await files.read('snapshot-${_fileName(_business)}'));

  Future<void> cacheSnapshot(Map<String, dynamic> raw) async {
    if (_business.isEmpty) return;
    await files.write('snapshot-${_fileName(_business)}', jsonEncode({...raw, 'cachedAt': now().toUtc().toIso8601String()}));
  }

  void markOnline(bool value) {
    if (online == value) return;
    online = value;
    notifyListeners();
  }

  Future<void> prepare(MycaApi api, {String deviceName = 'Phone'}) async {
    if (_business.isEmpty) return;
    var fetched = await api.query(offlineKitTool, {'deviceId': _deviceId});
    var data = _toolData(fetched);
    if (data == null) return;
    if (data['series'] == null) {
      final reply = await api.propose(offlineRegisterTool, {'deviceId': _deviceId, 'deviceName': deviceName});
      final preview = reply.preview;
      if (preview == null) return;
      await api.confirm(preview.token);
      fetched = await api.query(offlineKitTool, {'deviceId': _deviceId});
      data = _toolData(fetched);
      if (data == null) return;
    }
    final kitData = data;
    await _exclusive(() async {
      _state['kit'] = kitData;
      _state['kitAt'] = now().toUtc().toIso8601String();
      await _save();
    });
    notifyListeners();
  }

  Map<String, dynamic>? _toolData(Object? reply) {
    final map = offlineMap(reply);
    if (map['ok'] == false) return null;
    if (map['data'] is Map) return offlineMap(map['data']);
    if (map['result'] is Map) return _toolData(map['result']);
    return map.isEmpty ? null : map;
  }

  KitItem? findItem(String code) {
    final clean = code.replaceAll(RegExp(r'\s'), '');
    if (clean.isEmpty) return null;
    final key = clean.toUpperCase();
    for (final item in items.reversed) {
      if (item.sku == key || (item.barcode.isNotEmpty && item.barcode == clean)) return KitItem(sku: item.sku, name: item.name, barcode: item.barcode, hsn: item.hsn, gstRate: item.gstRate, price: item.price);
    }
    final known = kit?.items ?? const <KitItem>[];
    for (final item in known) {
      if (item.sku == key || (item.barcode.isNotEmpty && item.barcode == clean)) return item;
    }
    return null;
  }

  List<KitItem> searchItems(String typed, {int limit = 6}) {
    final query = typed.trim().toLowerCase().replaceAll(RegExp(r'\s+'), ' ');
    final seen = <String>{};
    final all = <KitItem>[];
    for (final item in items.reversed) {
      if (seen.add(item.sku)) all.add(KitItem(sku: item.sku, name: item.name, barcode: item.barcode, hsn: item.hsn, gstRate: item.gstRate, price: item.price));
    }
    for (final item in kit?.items ?? const <KitItem>[]) {
      if (seen.add(item.sku)) all.add(item);
    }
    if (query.isEmpty) return all.take(limit).toList();
    int rank(KitItem item) {
      final name = item.name.toLowerCase();
      final code = item.sku.toLowerCase();
      if (code == query || (item.barcode.isNotEmpty && item.barcode == query)) return 0;
      if (name.startsWith(query)) return 1;
      if (name.split(' ').any((word) => word.startsWith(query))) return 2;
      if (name.contains(query)) return 3;
      if (code.startsWith(query) || (item.barcode.isNotEmpty && item.barcode.endsWith(query))) return 4;
      return -1;
    }
    final ranked = [for (final item in all) if (rank(item) >= 0) (rank: rank(item), item: item)];
    ranked.sort((a, b) => a.rank != b.rank ? a.rank.compareTo(b.rank) : a.item.name.toLowerCase().compareTo(b.item.name.toLowerCase()));
    return [for (final entry in ranked.take(limit)) entry.item];
  }

  List<KitParty> findParties(String typed) {
    final words = typed.trim().toLowerCase();
    final known = <String, KitParty>{};
    for (final party in kit?.parties ?? const <KitParty>[]) {
      known['${party.name.toLowerCase()}|${party.gstin}'] = party;
    }
    for (final bill in bills) {
      known.putIfAbsent('${bill.partyName.toLowerCase()}|${bill.partyGstin}', () => KitParty(name: bill.partyName, gstin: bill.partyGstin, state: bill.partyState, address: bill.partyAddress));
    }
    return known.values.where((party) => words.isEmpty || party.name.toLowerCase().contains(words) || party.gstin.toLowerCase().contains(words)).take(20).toList();
  }

  int _nextNumber(String date) {
    final fy = fyCodeOf(date);
    final counters = offlineMap(_state['counters']);
    final local = offlineNum(counters[fy]).toInt();
    final server = series?.lastNumberByFy[fy] ?? 0;
    final used = bills.where((bill) => fyCodeOf(bill.date) == fy).map((bill) => int.tryParse(bill.id.split('-').last) ?? 0).fold<int>(0, max);
    return [local, server, used].reduce(max) + 1;
  }

  OfflineDraft draftSale(Map<String, Object?> args) {
    final current = kit;
    final code = series?.code ?? '';
    if (current == null || code.isEmpty) return const OfflineDraft(problem: 'This phone is not set up to bill offline yet. Open MyCA once with a connection and it sets itself up.');
    for (final key in const ['exportSale', 'supplyType']) {
      if (args[key] != null) return const OfflineDraft(problem: 'Exports and SEZ supplies need a connection. Make this invoice when you are back online.');
    }
    final date = offlineText(args['date']).isEmpty ? _isoDay(now()) : offlineText(args['date']);
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(date)) return const OfflineDraft(problem: 'The bill date could not be read.');
    if (current.lockThrough.isNotEmpty && date.compareTo(current.lockThrough) <= 0) return OfflineDraft(problem: 'Your books are locked up to ${current.lockThrough}, so a bill dated $date cannot be made.');
    final rawLines = offlineMaps(args['lines']);
    if (rawLines.isEmpty) return const OfflineDraft(problem: 'Add at least one item to the bill.');
    for (final (index, line) in rawLines.indexed) {
      if (line['cess'] != null || line['cessRate'] != null || line['cessPerUnit'] != null || offlineText(line['supply']).isNotEmpty) return const OfflineDraft(problem: 'Cess and nil-rated, exempt or non-GST lines need a connection. Make this bill when you are back online.');
      if (line['gstRate'] == null || offlineText(line['gstRate']).isEmpty) return OfflineDraft(problem: 'Line ${index + 1} needs a GST rate.');
    }
    final lines = rawLines.map(OfflineLine.fromJson).toList();
    for (final (index, line) in lines.indexed) {
      if (!line.qty.isFinite || line.qty <= 0 || !line.rate.isFinite || line.rate < 0 || !line.gstRate.isFinite || line.gstRate < 0) return OfflineDraft(problem: 'Line ${index + 1} has a quantity, price or GST rate that cannot be used.');
    }
    if (current.composition) {
      final taxed = lines.indexWhere((line) => line.gstRate != 0);
      if (taxed >= 0) return OfflineDraft(problem: 'A composition dealer issues a bill of supply and cannot collect GST (section 10(4)). Give line ${taxed + 1} a GST rate of 0.');
    }
    final partyGstin = normalGstin(offlineText(args['partyGstin']));
    final gstinIssue = gstinProblem(partyGstin);
    if (gstinIssue != null) return OfflineDraft(problem: gstinIssue);
    if (partyGstin.isNotEmpty && current.einvoiceB2b) return const OfflineDraft(problem: 'Your business must generate an e-invoice (IRN) before a B2B invoice is issued, and that needs a connection. Make this invoice when you are back online, or bill without the buyer\'s GSTIN if it is a sale to a consumer.');
    final partyName = offlineText(args['partyName']).isEmpty ? 'Walk-in' : offlineText(args['partyName']);
    final supplierState = current.state.isNotEmpty ? current.state : gstinState(current.gstin);
    final pos = _stateCode(args['partyState']).isNotEmpty ? _stateCode(args['partyState']) : partyGstin.isNotEmpty ? gstinState(partyGstin) : supplierState;
    final figures = billFigures([for (final line in lines) BillLineInput(qty: line.qty, rate: line.rate, gstRate: line.gstRate)], supplierState: supplierState, placeOfSupply: pos);
    if (figures.taxable <= 0) return const OfflineDraft(problem: 'The bill comes to zero. Add a price.');
    final taxablePaise = lines.fold<int>(0, (sum, line) => sum + (line.qty * line.rate * 100).round());
    if (partyGstin.isEmpty && current.gstin.isNotEmpty && !current.composition && taxablePaise >= current.buyerDetailsPaise) {
      final address = offlineText(args['partyAddress']).isNotEmpty ? offlineText(args['partyAddress']) : current.parties.where((party) => party.name == partyName && party.gstin.isEmpty).map((party) => party.address).firstWhere((text) => text.isNotEmpty, orElse: () => '');
      final rupees = current.buyerDetailsPaise ~/ 100;
      if (unnamedBuyers.contains(partyName.toLowerCase()) || address.isEmpty) return OfflineDraft(problem: 'A tax invoice to an unregistered buyer with a taxable value of ₹$rupees or more must carry the buyer\'s name and address with the state (rule 46(e)). Add them before you give out this bill.');
    }
    return OfflineDraft(figures: figures, partyName: partyName, partyGstin: partyGstin, placeOfSupply: pos, lines: lines, nextId: offlineInvoiceId(series!.code, date, _nextNumber(date)), date: date);
  }

  Future<OfflineBill> saveSale(Map<String, Object?> args, {Map<String, Object?>? payment}) => _exclusive(() async {
    final draft = draftSale(args);
    if (!draft.ok) throw MycaApiException(draft.problem, code: 'OFFLINE_REFUSED');
    final number = _nextNumber(draft.date);
    final id = offlineInvoiceId(series!.code, draft.date, number);
    final figures = draft.figures!;
    final bill = <String, dynamic>{
      'ref': _uuid(),
      'id': id,
      'date': draft.date,
      'createdAt': now().toUtc().toIso8601String(),
      'partyName': draft.partyName,
      if (draft.partyGstin.isNotEmpty) 'partyGstin': draft.partyGstin,
      if (_stateCode(args['partyState']).isNotEmpty) 'partyState': _stateCode(args['partyState']),
      if (offlineText(args['partyAddress']).isNotEmpty) 'partyAddress': offlineText(args['partyAddress']),
      'placeOfSupply': draft.placeOfSupply,
      'lines': [for (final line in draft.lines) line.toJson()],
      'lineFigures': [for (final line in figures.lines) line.toJson()],
      'printed': figures.totals(),
      if (payment != null) 'payment': _payment(payment, figures.total),
      'status': EntryStatus.waiting.name,
    };
    final counters = offlineMap(_state['counters']);
    counters[fyCodeOf(draft.date)] = number;
    _state['counters'] = counters;
    _state['bills'] = [...offlineMaps(_state['bills']), bill];
    await _save();
    notifyListeners();
    return OfflineBill(bill);
  });

  Map<String, Object?> _payment(Map<String, Object?> payment, num total) {
    final mode = paymentModes.contains(payment['mode']) ? payment['mode'] as String : 'cash';
    final amount = payment['amount'] is num ? payment['amount'] as num : total;
    return {'amount': amount, 'mode': mode};
  }

  OfflineBill? billById(String id) => bills.where((bill) => bill.id == id).firstOrNull;

  num _localPaid(String invoiceId) => receipts.where((r) => r.invoiceId == invoiceId && r.status != EntryStatus.rejected).fold<num>(0, (sum, r) => sum + r.amount);

  String? receiptProblem(Map<String, Object?> args) {
    final invoiceId = offlineText(args['invoiceId']);
    final amount = args['amount'];
    final date = offlineText(args['date']).isEmpty ? _isoDay(now()) : offlineText(args['date']);
    final local = billById(invoiceId);
    final known = (kit?.openInvoices ?? const <KitInvoice>[]).where((inv) => inv.id == invoiceId).firstOrNull;
    if (local == null && known == null) return 'This phone has no record of $invoiceId with money due. Take this payment when you are back online.';
    final invoiceDate = local?.date ?? known!.date;
    if (date.compareTo(invoiceDate) < 0) return 'A receipt cannot be dated before the invoice ($invoiceDate).';
    final lock = kit?.lockThrough ?? '';
    if (lock.isNotEmpty && date.compareTo(lock) <= 0) return 'Your books are locked up to $lock.';
    final paidAtBill = local?.payment == null ? 0 : offlineNum(local!.payment!['amount']);
    final due = (local != null ? local.total - paidAtBill : known!.due) - _localPaid(invoiceId);
    final value = amount == null ? due : (amount is num ? amount : num.tryParse('$amount'));
    if (value == null || value <= 0) return 'Enter the amount received.';
    if (value > due + 0.005) return 'Only ₹${due.toStringAsFixed(2)} is due on $invoiceId.';
    return null;
  }

  Future<OfflineReceipt> saveReceipt(Map<String, Object?> args) => _exclusive(() async {
    final problem = receiptProblem(args);
    if (problem != null) throw MycaApiException(problem, code: 'OFFLINE_REFUSED');
    final invoiceId = offlineText(args['invoiceId']);
    final date = offlineText(args['date']).isEmpty ? _isoDay(now()) : offlineText(args['date']);
    final local = billById(invoiceId);
    final known = (kit?.openInvoices ?? const <KitInvoice>[]).where((inv) => inv.id == invoiceId).firstOrNull;
    final paidAtBill = local?.payment == null ? 0 : offlineNum(local!.payment!['amount']);
    final due = (local != null ? local.total - paidAtBill : known!.due) - _localPaid(invoiceId);
    final amount = args['amount'] is num ? args['amount'] as num : num.tryParse('${args['amount']}') ?? due;
    final mode = paymentModes.contains(args['mode']) ? args['mode'] as String : 'cash';
    if (local != null && local.payment == null && local.status != EntryStatus.synced && date == local.date) {
      final updated = Map<String, dynamic>.from(local.data)..['payment'] = {'amount': amount, 'mode': mode};
      _replaceBill(updated);
      await _save();
      notifyListeners();
      return OfflineReceipt({'ref': updated['ref'], 'invoiceId': invoiceId, 'amount': amount, 'date': date, 'mode': mode, 'partyName': local.partyName, 'status': EntryStatus.waiting.name});
    }
    final receipt = <String, dynamic>{
      'ref': _uuid(),
      'invoiceId': invoiceId,
      'amount': amount,
      'date': date,
      'mode': mode,
      'partyName': local?.partyName ?? known?.partyName ?? '',
      'createdAt': now().toUtc().toIso8601String(),
      'status': EntryStatus.waiting.name,
    };
    _state['receipts'] = [...offlineMaps(_state['receipts']), receipt];
    await _save();
    notifyListeners();
    return OfflineReceipt(receipt);
  });

  Future<OfflineItem> saveItem({required String sku, required String name, required num price, required num gstRate, String hsn = '', String barcode = ''}) => _exclusive(() async {
    final item = <String, dynamic>{
      'ref': _uuid(),
      'sku': sku.trim().toUpperCase(),
      'name': name.trim(),
      'price': price,
      'gstRate': gstRate,
      if (hsn.trim().isNotEmpty) 'hsn': hsn.trim(),
      if (barcode.trim().isNotEmpty) 'barcode': barcode.trim(),
      'status': EntryStatus.waiting.name,
    };
    _state['items'] = [...offlineMaps(_state['items']), item];
    await _save();
    notifyListeners();
    return OfflineItem(item);
  });

  void _replaceBill(Map<String, dynamic> updated) {
    _state['bills'] = [for (final bill in offlineMaps(_state['bills'])) bill['ref'] == updated['ref'] ? updated : bill];
  }

  void _replaceReceipt(Map<String, dynamic> updated) {
    _state['receipts'] = [for (final receipt in offlineMaps(_state['receipts'])) receipt['ref'] == updated['ref'] ? updated : receipt];
  }

  Future<String?> voidBill(String ref, String reason) => _exclusive(() async {
    final bill = bills.where((b) => b.ref == ref).firstOrNull;
    if (bill == null) return 'That bill is not on this phone.';
    if (bill.status == EntryStatus.synced) return '${bill.id} is in your books now. Cancel it from the invoice, which issues a credit note.';
    final updated = Map<String, dynamic>.from(bill.data)
      ..['voided'] = {'reason': reason.trim().isEmpty ? 'Cancelled at the counter' : reason.trim(), 'at': now().toUtc().toIso8601String()}
      ..['status'] = EntryStatus.waiting.name;
    _replaceBill(updated);
    await _save();
    notifyListeners();
    return null;
  });

  Future<void> acceptEngineFigures(String ref) => _exclusive(() async {
    final bill = bills.where((b) => b.ref == ref).firstOrNull;
    if (bill == null || bill.engine.isEmpty) return;
    final updated = Map<String, dynamic>.from(bill.data)
      ..['acceptEngineFigures'] = true
      ..['printed'] = {for (final key in const ['taxable', 'cgst', 'sgst', 'igst', 'total']) key: bill.engine[key]}
      ..['reprintNeeded'] = true
      ..['status'] = EntryStatus.waiting.name
      ..remove('error')
      ..remove('hint');
    _replaceBill(updated);
    await _save();
    notifyListeners();
  });

  Future<void> renumber(String ref) => _exclusive(() async {
    final bill = bills.where((b) => b.ref == ref).firstOrNull;
    if (bill == null || series == null) return;
    final number = _nextNumber(bill.date);
    final counters = offlineMap(_state['counters']);
    counters[fyCodeOf(bill.date)] = number;
    _state['counters'] = counters;
    final updated = Map<String, dynamic>.from(bill.data)
      ..['previousId'] = bill.id
      ..['id'] = offlineInvoiceId(series!.code, bill.date, number)
      ..['ref'] = _uuid()
      ..['reprintNeeded'] = true
      ..['status'] = EntryStatus.waiting.name
      ..remove('error')
      ..remove('hint');
    _state['bills'] = [for (final item in offlineMaps(_state['bills'])) item['ref'] == ref ? updated : item];
    await _save();
    notifyListeners();
  });

  Future<String?> fixGstin(String ref, String gstin) => _exclusive(() async {
    final bill = bills.where((b) => b.ref == ref).firstOrNull;
    if (bill == null) return 'That bill is not on this phone.';
    final clean = normalGstin(gstin);
    final problem = gstinProblem(clean);
    if (problem != null) return problem;
    final current = kit;
    final supplierState = current == null ? '' : (current.state.isNotEmpty ? current.state : gstinState(current.gstin));
    final pos = bill.partyState.isNotEmpty ? bill.partyState : clean.isNotEmpty ? gstinState(clean) : supplierState;
    final figures = billFigures([for (final line in bill.lines) BillLineInput(qty: line.qty, rate: line.rate, gstRate: line.gstRate)], supplierState: supplierState, placeOfSupply: pos);
    final updated = Map<String, dynamic>.from(bill.data)
      ..['partyGstin'] = clean
      ..['placeOfSupply'] = pos
      ..['lineFigures'] = [for (final line in figures.lines) line.toJson()]
      ..['printed'] = figures.totals()
      ..['reprintNeeded'] = true
      ..['status'] = EntryStatus.waiting.name
      ..remove('error')
      ..remove('hint');
    if (clean.isEmpty) updated.remove('partyGstin');
    _replaceBill(updated);
    await _save();
    notifyListeners();
    return null;
  });

  Future<void> retry(String ref) => _exclusive(() async {
    for (final bill in bills.where((b) => b.ref == ref)) {
      _replaceBill(Map<String, dynamic>.from(bill.data)..['status'] = EntryStatus.waiting.name);
    }
    for (final receipt in receipts.where((r) => r.ref == ref)) {
      _replaceReceipt(Map<String, dynamic>.from(receipt.data)..['status'] = EntryStatus.waiting.name);
    }
    await _save();
    notifyListeners();
  });

  Future<void> changeReceipt(String ref, num amount) => _exclusive(() async {
    for (final receipt in receipts.where((r) => r.ref == ref)) {
      _replaceReceipt(Map<String, dynamic>.from(receipt.data)
        ..['amount'] = amount
        ..['status'] = EntryStatus.waiting.name
        ..remove('error')
        ..remove('hint'));
    }
    await _save();
    notifyListeners();
  });

  Future<void> dropReceipt(String ref) => _exclusive(() async {
    _state['receipts'] = [for (final receipt in offlineMaps(_state['receipts'])) if (receipt['ref'] != ref || receipt['status'] == EntryStatus.synced.name) receipt];
    await _save();
    notifyListeners();
  });

  Future<void> markPrinted(String ref) => _exclusive(() async {
    for (final bill in bills.where((b) => b.ref == ref)) {
      _replaceBill(Map<String, dynamic>.from(bill.data)..remove('reprintNeeded'));
    }
    await _save();
    notifyListeners();
  });

  Map<String, dynamic> documentOf(OfflineBill bill) {
    final current = kit;
    final figures = bill.lineFigures;
    final lines = bill.lines;
    final title = current?.composition == true ? 'Bill of supply' : (current?.gstin.isNotEmpty ?? false) ? 'Tax invoice' : 'Invoice';
    return {
      'id': bill.id,
      'date': bill.date,
      'documentTitle': title,
      if (current?.composition == true) 'compositionDeclaration': 'Composition taxable person, not eligible to collect tax on supplies',
      'seller': {'name': current?.businessName ?? '', 'gstin': current?.gstin ?? '', 'address': current?.address ?? '', 'state': {'code': current?.state ?? '', 'name': gstStateNames[current?.state ?? ''] ?? ''}},
      'buyer': {'name': bill.partyName, 'gstin': bill.partyGstin, 'address': bill.partyAddress},
      'partyName': bill.partyName,
      'partyGstin': bill.partyGstin,
      'placeOfSupply': {'code': offlineText(bill.data['placeOfSupply']), 'name': gstStateNames[offlineText(bill.data['placeOfSupply'])] ?? ''},
      'lines': [
        for (final (index, line) in lines.indexed) {...line.toJson(), ...(index < figures.length ? figures[index] : const <String, dynamic>{})},
      ],
      ...bill.printed,
      'offline': true,
      'status': bill.status.name,
    };
  }

  List<Map<String, Object?>> _batch() {
    final entries = <Map<String, Object?>>[];
    final kinds = <String>[];
    var bytes = 0;
    bool add(String kind, Map<String, Object?> entry) {
      final size = jsonEncode(entry).length;
      if (entries.length >= offlineBatchLimit || (entries.isNotEmpty && bytes + size > offlineBatchBytes)) return false;
      entries.add(entry);
      kinds.add(kind);
      bytes += size;
      return true;
    }

    for (final item in items.where((i) => i.status == EntryStatus.waiting)) {
      if (!add('items', item.toSync())) break;
    }
    final waitingBills = bills.where((b) => b.status == EntryStatus.waiting).toList()..sort((a, b) => a.id.compareTo(b.id));
    for (final bill in waitingBills) {
      if (!add('sales', bill.toSync())) break;
    }
    final postedIds = {for (final bill in bills) if (bill.status == EntryStatus.synced) bill.id};
    final sending = {for (final (index, entry) in entries.indexed) if (kinds[index] == 'sales') entry['id']};
    for (final receipt in receipts.where((r) => r.status == EntryStatus.waiting)) {
      final offlineInvoice = offlineIdPattern.hasMatch(receipt.invoiceId);
      if (offlineInvoice && !postedIds.contains(receipt.invoiceId) && !sending.contains(receipt.invoiceId)) continue;
      if (!add('receipts', receipt.toSync())) break;
    }
    return [for (final (index, entry) in entries.indexed) {'kind': kinds[index], 'entry': entry}];
  }

  Future<SyncOutcome>? _running;

  Future<SyncOutcome> sync(MycaApi api) {
    final running = _running;
    if (running != null) return running;
    final started = _sync(api);
    _running = started;
    return started.whenComplete(() => _running = null);
  }

  Future<SyncOutcome> _sync(MycaApi api) async {
    if (_business.isEmpty) return const SyncOutcome(message: 'Offline billing is not set up yet.');
    if (!ready) return const SyncOutcome(message: 'Offline billing is not set up yet.');
    _syncing = true;
    notifyListeners();
    var sent = 0, synced = 0, needsYou = 0, empty = 0;
    try {
      for (var round = 0; round < 50; round++) {
        final batch = _batch();
        if (batch.isEmpty) break;
        final args = <String, Object?>{
          'deviceId': _deviceId,
          for (final kind in const ['sales', 'receipts', 'items'])
            if (batch.any((part) => part['kind'] == kind)) kind: [for (final part in batch) if (part['kind'] == kind) part['entry']],
        };
        final reply = await api.propose(offlineSaleTool, args);
        final preview = reply.preview;
        if (preview == null) {
          lastSyncMessage = reply.reply.isEmpty ? 'MyCA did not take the offline bills.' : reply.reply;
          break;
        }
        final confirmed = await api.confirm(preview.token);
        final results = _resultsOf(confirmed.tools, confirmed.results);
        if (results.isEmpty && empty < 2) {
          empty += 1;
          continue;
        }
        if (results.isEmpty) {
          lastSyncMessage = confirmed.reply.isEmpty ? 'MyCA did not say what happened to the offline bills. They stay on this phone and are sent again.' : confirmed.reply;
          break;
        }
        sent += batch.length;
        final counts = await _apply(results);
        synced += counts.$1;
        needsYou += counts.$2;
        if (counts.$1 + counts.$2 == 0) break;
      }
      markOnline(true);
      if (sent > 0) {
        await _exclusive(() async {
          _state['lastSyncAt'] = now().toUtc().toIso8601String();
          _prune();
          await _save();
        });
        try {
          await prepare(api);
        } on MycaApiException {
          return SyncOutcome(sent: sent, synced: synced, needsYou: needsYou);
        }
      }
      lastSyncMessage = sent == 0 && lastSyncMessage.isNotEmpty ? lastSyncMessage : _summary(synced, needsYou);
      return SyncOutcome(sent: sent, synced: synced, needsYou: needsYou, message: lastSyncMessage);
    } on MycaApiException catch (err) {
      if (isUnreachable(err)) {
        markOnline(false);
        lastSyncMessage = 'Waiting for a connection. ${waitingCount == 1 ? '1 entry is' : '$waitingCount entries are'} saved on this phone.';
        return SyncOutcome(sent: sent, synced: synced, needsYou: needsYou, reachedServer: false, message: lastSyncMessage);
      }
      lastSyncMessage = err.message;
      return SyncOutcome(sent: sent, synced: synced, needsYou: needsYou, message: err.message);
    } finally {
      _syncing = false;
      notifyListeners();
    }
  }

  String _summary(int synced, int needsYou) {
    if (synced == 0 && needsYou == 0) return 'Everything on this phone is in your books.';
    final parts = <String>[if (synced > 0) '${synced == 1 ? '1 entry' : '$synced entries'} reached your books', if (needsYou > 0) '${needsYou == 1 ? '1 needs' : '$needsYou need'} you'];
    return '${parts.join('; ')}.';
  }

  List<Map<String, dynamic>> _resultsOf(List<Map<String, dynamic>> tools, List<Map<String, dynamic>> plain) {
    for (final tool in tools) {
      if (tool['name'] != offlineSaleTool) continue;
      final result = offlineMap(tool['result']);
      final data = offlineMap(result['data']);
      final found = data['results'] ?? result['results'];
      if (found is List) return offlineMaps(found);
    }
    for (final result in plain) {
      final data = offlineMap(result['data']);
      final found = data['results'] ?? result['results'];
      if (found is List) return offlineMaps(found);
    }
    return const [];
  }

  Future<(int, int)> _apply(List<Map<String, dynamic>> results) => _exclusive(() async {
    var synced = 0, needsYou = 0;
    final at = now().toUtc().toIso8601String();
    for (final result in results) {
      final ref = offlineText(result['ref']);
      final status = offlineText(result['status']);
      final done = status == 'posted' || status == 'already';
      final next = done ? EntryStatus.synced : status == 'conflict' ? EntryStatus.conflict : status == 'rejected' ? EntryStatus.rejected : null;
      if (next == null || ref.isEmpty) continue;
      if (done) {
        synced += 1;
      } else {
        needsYou += 1;
      }
      void mark(Map<String, dynamic> entry) {
        entry['status'] = next.name;
        if (done) {
          entry['syncedAt'] = at;
          entry.remove('error');
          entry.remove('hint');
        } else {
          entry['error'] = offlineText(result['error']);
          entry['hint'] = offlineText(result['hint']);
        }
        if (result['engine'] is Map) entry['engine'] = offlineMap(result['engine']);
        if (result['due'] is num) entry['due'] = result['due'];
      }

      final kind = offlineText(result['kind']);
      if (kind == 'receipt' && !done && offlineText(result['error']) == 'INVOICE_NOT_FOUND') {
        final receipt = receipts.where((r) => r.ref == ref).firstOrNull;
        final bill = receipt == null ? null : billById(receipt.invoiceId);
        if (bill != null && bill.status != EntryStatus.synced) {
          needsYou -= 1;
          continue;
        }
      }
      if (kind == 'item') {
        if (status == 'conflict' && offlineText(result['error']) == 'ITEM_CHANGED') {
          needsYou -= 1;
          synced += 1;
        }
        _state['items'] = [
          for (final item in offlineMaps(_state['items']))
            if (item['ref'] == ref) (Map<String, dynamic>.from(item)..['status'] = (done || offlineText(result['error']) == 'ITEM_CHANGED') ? EntryStatus.synced.name : next.name) else item,
        ];
        continue;
      }
      final list = kind == 'receipt' ? 'receipts' : 'bills';
      _state[list] = [
        for (final entry in offlineMaps(_state[list]))
          if (entry['ref'] == ref) _marked(entry, mark) else entry,
      ];
    }
    await _save();
    notifyListeners();
    return (synced, needsYou);
  });

  void _prune() {
    final cutoff = now().toUtc().subtract(const Duration(days: keepSyncedDays)).toIso8601String();
    bool keep(Map<String, dynamic> entry) => entry['status'] != EntryStatus.synced.name || offlineText(entry['syncedAt']).compareTo(cutoff) >= 0;
    _state['bills'] = offlineMaps(_state['bills']).where(keep).toList();
    _state['receipts'] = offlineMaps(_state['receipts']).where(keep).toList();
    _state['items'] = offlineMaps(_state['items']).where((item) => item['status'] != EntryStatus.synced.name).toList();
  }
}

Map<String, dynamic> _marked(Map<String, dynamic> entry, void Function(Map<String, dynamic> entry) mark) {
  final copy = Map<String, dynamic>.from(entry);
  mark(copy);
  return copy;
}
