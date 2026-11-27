import 'offline_words.dart';
import '../api/models.dart';
import '../api/myca_api.dart';
import '../format.dart';
import 'offline_billing.dart';
import 'offline_models.dart';

const offlineTokenPrefix = 'offline-';
const offlineSkipServerFor = Duration(seconds: 30);

class _LocalPending {
  const _LocalPending(this.name, this.args);

  final String name;
  final Map<String, Object?> args;
}

class OfflineFirstApi implements MycaApi {
  OfflineFirstApi(this.inner, this.offline, {required this.business, DateTime Function()? now}) : now = now ?? DateTime.now;

  final MycaApi inner;
  final OfflineBilling offline;
  final String Function() business;
  final DateTime Function() now;
  final _pending = <String, _LocalPending>{};
  DateTime? _wentOffline;
  int _tokens = 0;

  Future<void> _open() async {
    final key = business();
    if (key.isNotEmpty && key != offline.business) await offline.open(key);
  }

  bool get _skipServer {
    final since = _wentOffline;
    return offline.online == false && since != null && now().difference(since) < offlineSkipServerFor;
  }

  void _reached() {
    _wentOffline = null;
    offline.markOnline(true);
  }

  void _lost() {
    _wentOffline = now();
    offline.markOnline(false);
  }

  Future<T> _online<T>(Future<T> Function() call) async {
    try {
      final out = await call();
      _reached();
      return out;
    } on MycaApiException catch (err) {
      if (isUnreachable(err)) _lost();
      rethrow;
    }
  }

  List<Map<String, dynamic>> _localInvoices() => [
    for (final bill in offline.bills)
      if (bill.status != EntryStatus.synced)
        {
          'id': bill.id,
          'date': bill.date,
          'partyName': bill.partyName,
          'partyGstin': bill.partyGstin,
          'total': bill.total,
          'status': bill.voided != null ? 'cancelled' : 'offline',
          'lines': [for (final line in bill.lines) line.toJson()],
          ...bill.printed,
          if (bill.payment != null) 'receipts': [{'amount': bill.payment!['amount'], 'date': bill.date, 'mode': bill.payment!['mode']}],
        },
  ];

  Snapshot _withLocal(Map<String, dynamic> raw) {
    final local = _localInvoices();
    if (local.isEmpty) return Snapshot.fromJson(raw);
    final ids = {for (final invoice in local) invoice['id']};
    final server = offlineMaps(raw['invoices']).where((invoice) => !ids.contains(invoice['id'])).toList();
    return Snapshot.fromJson({...raw, 'invoices': [...server, ...local]});
  }

  @override
  Future<Snapshot> snapshot() async {
    await _open();
    try {
      final fresh = await _online(inner.snapshot);
      if (fresh.raw.isNotEmpty) {
        await offline.cacheSnapshot(fresh.raw);
        return _withLocal(fresh.raw);
      }
      return fresh;
    } on MycaApiException catch (err) {
      if (!isUnreachable(err)) rethrow;
      final cached = await offline.cachedSnapshot();
      if (cached is! Map) rethrow;
      return _withLocal(Map<String, dynamic>.from(cached));
    }
  }

  @override
  Future<SignInResult> signIn(String userId, String pin) => inner.signIn(userId, pin);

  @override
  Future<void> signOut() => inner.signOut();

  @override
  Future<ChatReply> chat(String message, {String lang = 'en'}) => _online(() => inner.chat(message, lang: lang));

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async {
    await _open();
    final local = const {'create_invoice', 'record_receipt', 'set_sku_cost'}.contains(name);
    if (!local) return _online(() => inner.propose(name, args));
    if (name == 'record_receipt' && offline.billById('${args['invoiceId']}') != null && offline.billById('${args['invoiceId']}')!.status != EntryStatus.synced) return _localPreview(name, args);
    if (_skipServer) return _localPreview(name, args);
    try {
      return await _online(() => inner.propose(name, args));
    } on MycaApiException catch (err) {
      if (!isUnreachable(err)) rethrow;
      return _localPreview(name, args);
    }
  }

  ChatReply _blocked(String problem) => ChatReply(reply: problem, preview: null, posted: false, blocked: true, blockers: [problem]);

  ChatReply _localPreview(String name, Map<String, Object?> args) {
    final token = '$offlineTokenPrefix${now().microsecondsSinceEpoch}-${_tokens++}';
    if (name == 'create_invoice') {
      final points = args['redeemPoints'];
      if (points is num && points > 0) return _blocked(off('Loyalty points need a connection. Bill without using points, or wait until you are back online.'));
      final draft = offline.draftSale(args);
      if (!draft.ok) return _blocked(draft.problem);
      final figures = draft.figures!;
      final taxWords = figures.igst > 0 ? 'IGST ${rupees(figures.igst)}' : figures.cgst > 0 ? 'CGST ${rupees(figures.cgst)} + SGST ${rupees(figures.sgst)}' : 'no GST';
      _pending
        ..clear()
        ..[token] = _LocalPending(name, args);
      return ChatReply(
        reply: '',
        preview: ChatPreview(
          token: token,
          summary: off('Bill {id} to {party}: {taxable} + {tax} = {total}.', {'id': draft.nextId, 'party': draft.partyName, 'taxable': rupees(figures.taxable), 'tax': taxWords, 'total': rupees(figures.total)}),
          effects: [off('No connection, so this bill is saved on this phone with its own number and reaches your books when you are back online.')],
          figures: {...figures.totals(), 'offline': true, 'id': draft.nextId},
        ),
        posted: false,
        blocked: false,
      );
    }
    if (name == 'record_receipt') {
      final problem = offline.receiptProblem(args);
      if (problem != null) return _blocked(problem);
      _pending
        ..clear()
        ..[token] = _LocalPending(name, args);
      final amount = args['amount'];
      return ChatReply(
        reply: '',
        preview: ChatPreview(
          token: token,
          summary: off('Received {amount} against {invoice} by {mode}.', {'amount': amount is num ? rupees(amount) : off('the amount due'), 'invoice': args['invoiceId'], 'mode': offMode('${args['mode'] ?? 'cash'}')}),
          effects: [off('No connection, so this receipt is saved on this phone and reaches your books when you are back online.')],
          figures: const {'offline': true},
        ),
        posted: false,
        blocked: false,
      );
    }
    final price = args['price'], rate = args['gstRate'];
    if (price is! num || rate is! num) return _blocked(off('Give the item a selling price and a GST rate to save it without a connection.'));
    if (rate < 0 || rate > 28) return _blocked(off('Enter a GST rate from 0 to 28 for the item.'));
    _pending
      ..clear()
      ..[token] = _LocalPending(name, args);
    return ChatReply(
      reply: '',
      preview: ChatPreview(token: token, summary: off('Save {item} at {price} + GST {rate}%.', {'item': args['name'] ?? args['sku'], 'price': rupees(price), 'rate': rate}), effects: [off('Saved on this phone until you are back online.')], figures: const {'offline': true}),
      posted: false,
      blocked: false,
    );
  }

  @override
  Future<ChatReply> confirm(String token) async {
    if (!token.startsWith(offlineTokenPrefix)) return _online(() => inner.confirm(token));
    final held = _pending.remove(token);
    if (held == null) return _blocked(off('That preview has gone. Make the bill again.'));
    try {
      if (held.name == 'create_invoice') {
        final bill = await offline.saveSale(held.args);
        return ChatReply(
          reply: off('Saved {id} on this phone: {total}. It reaches your books when you are back online.', {'id': bill.id, 'total': rupees(bill.total)}),
          preview: null,
          posted: true,
          blocked: false,
          tools: [
            {
              'name': 'create_invoice',
              'result': {'ok': true, 'offline': true, 'invoice': offline.documentOf(bill)},
            },
          ],
        );
      }
      if (held.name == 'record_receipt') {
        final receipt = await offline.saveReceipt(held.args);
        return ChatReply(reply: 'Saved the receipt of ${rupees(receipt.amount)} against ${receipt.invoiceId} on this phone. It reaches your books when you are back online.', preview: null, posted: true, blocked: false, tools: [{'name': 'record_receipt', 'result': {'ok': true, 'offline': true}}]);
      }
      final args = held.args;
      final item = await offline.saveItem(sku: '${args['sku'] ?? ''}', name: '${args['name'] ?? args['sku'] ?? ''}', price: args['price'] as num, gstRate: args['gstRate'] as num, hsn: '${args['hsn'] ?? ''}', barcode: '${args['barcode'] ?? ''}');
      return ChatReply(reply: 'Saved ${item.name} on this phone.', preview: null, posted: true, blocked: false, tools: [{'name': 'set_sku_cost', 'result': {'ok': true, 'offline': true}}]);
    } on MycaApiException catch (err) {
      return _blocked(err.message);
    }
  }

  @override
  Future<ChatReply> discard() async {
    if (_pending.isNotEmpty) {
      _pending.clear();
      return ChatReply(reply: off('Discarded. Nothing was saved.'), preview: null, posted: false, blocked: false);
    }
    return _online(inner.discard);
  }

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    await _open();
    if (name == 'invoice_document') {
      final bill = offline.billById('${args['id'] ?? ''}');
      if (bill != null && bill.status != EntryStatus.synced) return {'ok': true, 'data': offline.documentOf(bill)};
    }
    if (name == 'find_item' && _skipServer) return _localItem(args);
    if (name == 'search_items' && _skipServer) return _localSearch(args);
    try {
      return await _online(() => inner.query(name, args));
    } on MycaApiException catch (err) {
      if (!isUnreachable(err)) rethrow;
      if (name == 'find_item') return _localItem(args);
      if (name == 'search_items') return _localSearch(args);
      if (name == 'invoice_document') {
        final bill = offline.billById('${args['id'] ?? ''}');
        if (bill != null) return {'ok': true, 'data': offline.documentOf(bill)};
      }
      rethrow;
    }
  }

  Map<String, Object?> _localSearch(Map<String, Object?> args) {
    final query = '${args['query'] ?? ''}';
    final asked = args['limit'];
    final limit = asked is int && asked >= 1 && asked <= 30 ? asked : 6;
    final found = offline.searchItems(query, limit: limit);
    return {
      'ok': true,
      'data': {
        'query': query.trim().toLowerCase(),
        'favourites': query.trim().isEmpty,
        'offline': true,
        'items': [
          for (final item in found) {'sku': item.sku, 'name': item.name, 'barcode': item.barcode, 'hsn': item.hsn, 'gstRate': item.gstRate, 'price': item.price, 'unit': item.unit, 'tracked': false, 'onHand': item.onHand, 'lowStock': false},
        ],
      },
    };
  }

  Map<String, Object?> _localItem(Map<String, Object?> args) {
    final code = '${args['code'] ?? ''}'.replaceAll(RegExp(r'\s'), '');
    final item = offline.findItem(code);
    if (item == null) return {'ok': true, 'data': {'found': false, 'code': code, 'offline': true}};
    return {
      'ok': true,
      'data': {'found': true, 'code': code, 'sku': item.sku, 'name': item.name, 'barcode': item.barcode, 'hsn': item.hsn, 'gstRate': item.gstRate, 'price': item.price, 'onHand': item.onHand, 'offline': true},
    };
  }

  @override
  Future<String> upload(String name, String content) => _online(() => inner.upload(name, content));

  @override
  Future<ToolOutcome> updateCompany({required String name, String gstin = ''}) => _online(() => inner.updateCompany(name: name, gstin: gstin));
}
