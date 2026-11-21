import 'package:myca/api/models.dart';
import 'package:myca/api/myca_api.dart';

const unreachable = MycaApiException('Cannot reach MyCA. Check your connection and try again.', code: 'UNREACHABLE');

Map<String, Object?> kitFor({Map<String, Object?>? series, bool composition = false, bool einvoiceB2b = false, String lockThrough = ''}) => {
  'version': 1,
  'generatedAt': '2026-11-21T10:00:00Z',
  'company': {'name': 'Sharma Kirana', 'gstin': '27AABCU9603R1ZN', 'state': '27', 'composition': composition, 'address': '4 Station Road, Pune'},
  'lockThrough': lockThrough,
  'einvoiceB2b': einvoiceB2b,
  'buyerDetails': {'taxablePaiseAtLeast': 5000000, 'rule': 'gst.invoice.unregistered-buyer-details'},
  'items': [
    {'sku': 'PARLE-G', 'name': 'Parle-G 250g', 'barcode': '8901063010031', 'hsn': '1905', 'gstRate': 18, 'price': 25, 'unit': 'PCS', 'onHand': 40},
    {'sku': 'TATA-SALT', 'name': 'Tata Salt 1kg', 'barcode': '8904043901015', 'hsn': '2501', 'gstRate': 0, 'price': 28, 'unit': 'PCS', 'onHand': 12},
  ],
  'parties': [
    {'name': 'Gupta Traders', 'gstin': '29AAGCR4375J1ZU', 'state': '29', 'address': 'MG Road, Bengaluru'},
  ],
  'openInvoices': [
    {'id': 'INV-0040', 'date': '2026-11-10', 'partyName': 'Gupta Traders', 'partyGstin': '29AAGCR4375J1ZU', 'total': 1180, 'due': 1180},
  ],
  'series': series,
};

class OfflineServer implements MycaApi {
  OfflineServer({this.reachable = true, this.composition = false, this.einvoiceB2b = false, this.lockThrough = ''});

  bool reachable;
  bool composition;
  bool einvoiceB2b;
  String lockThrough;
  bool dropNextReply = false;
  num serverDue = 1180;
  Map<String, Object?>? series;
  final posted = <String, Map<String, Object?>>{};
  final receiptRefs = <String>{};
  final batches = <Map<String, Object?>>[];
  final proposals = <String>[];
  final conflictFor = <String, Map<String, Object?>>{};
  final snapshotRaw = <String, Object?>{
    'company': {'name': 'Sharma Kirana', 'gstin': '27AABCU9603R1ZN', 'state': '27', 'country': 'IN'},
    'invoices': [
      {'id': 'INV-0040', 'date': '2026-11-10', 'partyName': 'Gupta Traders', 'total': 1180, 'status': 'posted'},
    ],
    'purchases': <Object?>[],
    'expenses': <Object?>[],
    'creditNotes': <Object?>[],
    'users': <Object?>[],
  };
  Map<String, Object?>? _held;
  int _tokens = 0;

  void _check() {
    if (!reachable) throw unreachable;
  }

  @override
  Future<Snapshot> snapshot() async {
    _check();
    return Snapshot.fromJson(snapshotRaw);
  }

  @override
  Future<SignInResult> signIn(String userId, String pin) async => const SignInResult(ok: true, error: '');

  @override
  Future<void> signOut() async {}

  @override
  Future<ChatReply> chat(String message) async {
    _check();
    return ChatReply.fromJson({'reply': 'ok'});
  }

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async {
    _check();
    proposals.add(name);
    final token = 'tok-${_tokens++}';
    _held = {'token': token, 'name': name, 'args': args};
    return ChatReply.fromJson({
      'reply': 'Check $name',
      'awaitingConfirmation': true,
      'preview': {'token': token, 'summary': 'Run $name', 'effects': <Object?>[], 'figures': <String, Object?>{}},
    });
  }

  @override
  Future<ChatReply> confirm(String token) async {
    _check();
    final held = _held;
    _held = null;
    if (held == null || held['token'] != token) return ChatReply.fromJson({'reply': 'Nothing to confirm.', 'posted': false});
    final name = held['name'] as String;
    final args = Map<String, Object?>.from(held['args'] as Map);
    Map<String, Object?> result = {'ok': true};
    if (name == 'register_offline_device') {
      series ??= {'code': 'MA', 'deviceId': args['deviceId'], 'deviceName': args['deviceName'], 'lastNumberByFy': <String, Object?>{}};
      result = {'ok': true, 'series': series};
    }
    if (name == 'post_offline_sales') {
      batches.add(args);
      result = {'ok': true, 'data': {'results': _post(args), 'series': series}};
    }
    if (name == 'create_invoice') {
      result = {'ok': true, 'invoice': {'id': 'INV-0041', 'date': '2026-11-21', 'total': 59, 'lines': <Object?>[]}};
    }
    if (dropNextReply) {
      dropNextReply = false;
      throw unreachable;
    }
    return ChatReply.fromJson({
      'reply': 'Done $name.',
      'posted': true,
      'confirmed': true,
      'tools': [
        {'name': name, 'result': result},
      ],
    });
  }

  List<Map<String, Object?>> _post(Map<String, Object?> args) {
    final out = <Map<String, Object?>>[];
    for (final raw in (args['items'] as List?) ?? const []) {
      final item = Map<String, Object?>.from(raw as Map);
      out.add({'ref': item['ref'], 'kind': 'item', 'status': 'posted'});
    }
    for (final raw in (args['sales'] as List?) ?? const []) {
      final sale = Map<String, Object?>.from(raw as Map);
      final ref = sale['ref'] as String;
      final id = sale['id'] as String;
      final existing = posted[id];
      if (existing != null) {
        out.add(existing['ref'] == ref ? {'ref': ref, 'kind': 'sale', 'status': 'already', 'id': id} : {'ref': ref, 'kind': 'sale', 'status': 'conflict', 'error': 'NUMBER_TAKEN', 'id': id});
        continue;
      }
      final forced = conflictFor[id];
      if (forced != null && sale['acceptEngineFigures'] != true) {
        out.add({'ref': ref, 'kind': 'sale', 'id': id, ...forced});
        continue;
      }
      if (lockThrough.isNotEmpty && (sale['date'] as String).compareTo(lockThrough) <= 0) {
        out.add({'ref': ref, 'kind': 'sale', 'status': 'rejected', 'error': 'PERIOD_LOCKED', 'hint': 'Unlock the month first.', 'id': id});
        continue;
      }
      posted[id] = sale;
      final number = int.parse(id.split('-').last);
      final fy = id.substring(6, 10);
      final last = Map<String, Object?>.from((series!['lastNumberByFy'] as Map?) ?? const {});
      if (((last[fy] as int?) ?? 0) < number) last[fy] = number;
      series = {...series!, 'lastNumberByFy': last};
      out.add({'ref': ref, 'kind': 'sale', 'status': 'posted', 'id': id});
    }
    for (final raw in (args['receipts'] as List?) ?? const []) {
      final receipt = Map<String, Object?>.from(raw as Map);
      final ref = receipt['ref'] as String;
      if (receiptRefs.contains(ref)) {
        out.add({'ref': ref, 'kind': 'receipt', 'status': 'already'});
        continue;
      }
      final invoiceId = receipt['invoiceId'] as String;
      if (invoiceId != 'INV-0040' && !posted.containsKey(invoiceId)) {
        out.add({'ref': ref, 'kind': 'receipt', 'status': 'rejected', 'error': 'INVOICE_NOT_FOUND'});
        continue;
      }
      if ((receipt['amount'] as num) > serverDue) {
        out.add({'ref': ref, 'kind': 'receipt', 'status': 'conflict', 'error': 'OVERPAYMENT', 'due': serverDue});
        continue;
      }
      receiptRefs.add(ref);
      out.add({'ref': ref, 'kind': 'receipt', 'status': 'posted'});
    }
    return out;
  }

  @override
  Future<ChatReply> discard() async => ChatReply.fromJson({'reply': 'Discarded.'});

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    _check();
    if (name == 'offline_kit') return {'ok': true, 'data': kitFor(series: series, composition: composition, einvoiceB2b: einvoiceB2b, lockThrough: lockThrough)};
    if (name == 'find_item') return {'ok': true, 'data': {'found': false, 'code': args['code']}};
    return {'ok': true, 'data': <String, Object?>{}};
  }

  @override
  Future<String> upload(String name, String content) async => 'hash';

  @override
  Future<ToolOutcome> updateCompany({required String name, String gstin = ''}) async => ToolOutcome.fromJson({'ok': true});
}
