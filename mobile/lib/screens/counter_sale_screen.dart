import 'dart:async';

import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../india/loyalty_points.dart';
import '../pos/escpos.dart';
import '../pos/printer.dart';
import '../pos/receipt.dart';
import '../pos/scan_screen.dart';
import '../offline/gstin.dart';
import '../registers.dart';
import 'offline_bills_screen.dart';
import 'loyalty_screen.dart';
import 'counter_items.dart';
import 'stock_alerts_screen.dart';
import '../widgets/glass.dart';

const counterUnits = ['NOS', 'PCS', 'KGS', 'GMS', 'LTR', 'MLT', 'MTR', 'BOX', 'PAC', 'BTL', 'TBS', 'DOZ', 'SET', 'BAG', 'CTN', 'PRS'];

class CartLine {
  CartLine({required this.sku, required this.name, required this.price, required this.gstRate, this.hsn = '', this.unit = '', this.qty = 1, this.lowStock = false, this.onHand}) : listPrice = price;

  final String sku;
  final String name;
  num price;
  final num listPrice;
  final num gstRate;
  final String hsn;
  final String unit;
  final bool lowStock;
  final num? onHand;
  num qty;

  num get amount => (price * qty * 100).round() / 100;

  Map<String, Object?> toLine() => {
    'description': name,
    if (sku.isNotEmpty) 'sku': sku,
    if (hsn.isNotEmpty) 'hsn': hsn,
    'qty': qty,
    if (unit.isNotEmpty) 'unit': unit,
    'rate': price,
    'gstRate': gstRate,
  };
}

const buyerDetailsFromRupees = 50000;

num billTotal(List<CartLine> cart) => cart.fold<num>(0, (sum, line) => sum + ((line.amount * (100 + line.gstRate)).round() / 100));

num billTaxable(List<CartLine> cart) => cart.fold<num>(0, (sum, line) => sum + line.amount);

bool needsBuyerDetails(List<CartLine> cart) => billTaxable(cart) >= buyerDetailsFromRupees;

Map<String, Object?> counterSaleArgs(List<CartLine> cart, {String customer = '', String address = '', String gstin = '', int? redeemPoints}) => {
  'partyName': customer.trim().isEmpty ? 'Walk-in customer' : customer.trim(),
  if (gstin.trim().isNotEmpty) 'partyGstin': normalGstin(gstin),
  if (address.trim().isNotEmpty) 'partyAddress': address.trim(),
  'lines': [for (final line in cart) line.toLine()],
  if (customer.trim().isNotEmpty && redeemPoints != null && redeemPoints > 0) 'redeemPoints': redeemPoints,
};

const counterPayModes = ['cash', 'upi', 'card', 'credit'];

String payModeWords(BuildContext context, String mode) => switch (mode) {
  'cash' => inText(context, 'Cash'),
  'upi' => inText(context, 'UPI'),
  'card' => inText(context, 'Card'),
  _ => inText(context, 'Pay later'),
};

class CounterSaleScreen extends StatefulWidget {
  const CounterSaleScreen({super.key, this.scan = scanBarcodeWithCamera, this.printer = const BluetoothReceiptPrinter()});

  final BarcodeScan scan;
  final ReceiptPrinter printer;

  @override
  State<CounterSaleScreen> createState() => _CounterSaleScreenState();
}

class _CounterSaleScreenState extends State<CounterSaleScreen> {
  final _code = TextEditingController();
  final _customer = TextEditingController();
  final _address = TextEditingController();
  final _gstin = TextEditingController();
  String _pay = 'cash';
  bool _offlineBill = false;
  final cart = <CartLine>[];
  String _message = '';
  bool _busy = false;
  ChatPreview? _preview;
  Map<String, dynamic>? _posted;
  int? _redeem;
  List<ItemHit> _hits = const [];
  List<ItemHit> _favourites = const [];
  Timer? _debounce;
  int _searchSeq = 0;
  bool _searched = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadFavourites());
  }

  MycaApi get api => AppScope.of(context).api;

  bool get _composition => AppScope.of(context).snapshot?.company.composition == true;

  CartLine _forBill(CartLine line) => _composition && line.gstRate != 0 ? CartLine(sku: line.sku, name: line.name, price: line.price, gstRate: 0, hsn: line.hsn, unit: line.unit, qty: line.qty, lowStock: line.lowStock, onHand: line.onHand) : line;

  @override
  void dispose() {
    _debounce?.cancel();
    _code.dispose();
    _customer.dispose();
    _address.dispose();
    _gstin.dispose();
    super.dispose();
  }

  Future<List<ItemHit>> _lookup(String query) async {
    try {
      return parseItemHits(await api.query('search_items', {'query': query, 'limit': query.isEmpty ? 8 : 6}));
    } on MycaApiException {
      return const [];
    }
  }

  Future<void> _loadFavourites() async {
    if (!mounted) return;
    final found = await _lookup('');
    if (mounted) setState(() => _favourites = found);
  }

  void _typed(String text) {
    _debounce?.cancel();
    final query = text.trim();
    final seq = ++_searchSeq;
    if (query.isEmpty) {
      setState(() {
        _hits = const [];
        _searched = false;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 220), () async {
      final found = await _lookup(query);
      if (!mounted || seq != _searchSeq) return;
      setState(() {
        _hits = found;
        _searched = true;
      });
    });
  }

  void _clearSearch() {
    _debounce?.cancel();
    _searchSeq += 1;
    _code.clear();
    _hits = const [];
    _searched = false;
  }

  void _pick(ItemHit hit) {
    if (!hit.billable) {
      unawaited(_newItem('', sku: hit.sku, name: hit.name));
      return;
    }
    _put(CartLine(sku: hit.sku, name: hit.name, price: hit.price!, gstRate: hit.gstRate!, hsn: hit.hsn, unit: hit.unit, lowStock: hit.lowStock, onHand: hit.tracked ? hit.onHand : null));
    setState(_clearSearch);
  }

  Future<void> _addTyped(String text) async {
    final clean = text.trim();
    if (clean.isEmpty) return;
    if (looksLikeItemCode(clean)) return _add(clean);
    _debounce?.cancel();
    final seq = ++_searchSeq;
    final found = await _lookup(clean);
    if (!mounted || seq != _searchSeq) return;
    final exact = found.where((hit) => hit.billable && hit.sku.toLowerCase() == clean.toLowerCase()).firstOrNull;
    if (exact != null) return _pick(exact);
    if (found.length == 1 && found.first.billable) return _pick(found.first);
    setState(() {
      _hits = found;
      _searched = true;
    });
  }

  Future<void> _quickAdd(String name) => _newItem('', sku: quickItemSku(DateTime.now()), name: name.trim());

  Future<void> _editLine(CartLine line) async {
    final edit = await showMycaSheet<LineEdit>(
      context: context,
      isScrollControlled: true,
      builder: (_) => LineEditSheet(name: line.name, unit: line.unit, qty: line.qty, price: line.price, listPrice: line.listPrice),
    );
    if (edit == null || !mounted) return;
    setState(() {
      line.qty = edit.qty;
      line.price = edit.price;
      _preview = null;
      _posted = null;
    });
  }

  Future<void> _scan() async {
    final code = await widget.scan(context);
    if (code == null || code.isEmpty || !mounted) return;
    await _add(code);
  }

  Future<void> _add(String code) async {
    final clean = code.trim();
    if (clean.isEmpty) return;
    setState(() {
      _busy = true;
      _message = '';
    });
    try {
      final data = toolData(await api.query('find_item', {'code': clean}));
      if (!mounted) return;
      if (data['found'] != true) {
        setState(() => _busy = false);
        await _newItem(clean);
        return;
      }
      final price = data['price'];
      final gstRate = data['gstRate'];
      if (price is! num || gstRate is! num) {
        setState(() => _busy = false);
        await _newItem(clean, sku: '${data['sku']}', name: '${data['name']}');
        return;
      }
      _put(CartLine(sku: '${data['sku']}', name: '${data['name']}', price: price, gstRate: gstRate, hsn: '${data['hsn'] ?? ''}', unit: '${data['unit'] ?? ''}', lowStock: data['lowStock'] == true, onHand: data['tracked'] == true && data['onHand'] is num ? data['onHand'] as num : null));
      if (mounted) setState(_clearSearch);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _message = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _put(CartLine picked) {
    final line = _forBill(picked);
    setState(() {
      final existing = cart.where((item) => item.sku == line.sku).firstOrNull;
      if (existing != null) {
        existing.qty += 1;
      } else {
        cart.add(line);
      }
      _preview = null;
      _posted = null;
    });
  }

  Future<void> _newItem(String code, {String sku = '', String name = ''}) async {
    final item = await showMycaSheet<NewItem>(
      context: context,
      isScrollControlled: true,
      builder: (_) => NewItemSheet(code: code, sku: sku, name: name, composition: _composition),
    );
    if (item == null || !mounted) return;
    final result = item.line;
    setState(() => _busy = true);
    try {
      final reply = await api.propose('set_sku_cost', newItemArgs(item, code));
      final preview = reply.preview;
      if (preview != null) await api.confirm(preview.token);
      final stockIn = stockInArgs(item);
      if (stockIn != null) {
        final stocked = await api.propose('record_stock', stockIn);
        final held = stocked.preview;
        if (held != null) await api.confirm(held.token);
      }
      _put(result);
      if (mounted) setState(_clearSearch);
      unawaited(_loadFavourites());
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _message = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _makeBill() async {
    if (cart.isEmpty) return;
    final gstinIssue = gstinProblem(_gstin.text);
    if (gstinIssue != null) {
      setState(() => _message = gstinIssue);
      return;
    }
    if (needsBuyerDetails(cart) && _gstin.text.trim().isEmpty && (_customer.text.trim().isEmpty || _address.text.trim().isEmpty)) {
      setState(() => _message = inText(context, 'A bill of ₹50,000 or more before GST must carry the customer\'s name and address with the state. Add both, then make the bill.'));
      return;
    }
    setState(() {
      _busy = true;
      _message = '';
    });
    try {
      final reply = await api.propose('create_invoice', counterSaleArgs(cart, customer: _customer.text, address: _address.text, gstin: _gstin.text, redeemPoints: _redeem));
      if (!mounted) return;
      setState(() {
        _preview = reply.preview;
        if (reply.preview == null) _message = reply.reply;
      });
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _message = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _post() async {
    final preview = _preview;
    if (preview == null) return;
    setState(() => _busy = true);
    try {
      final reply = await api.confirm(preview.token);
      if (!mounted) return;
      Map<String, dynamic>? invoice;
      var offline = false;
      for (final tool in reply.tools) {
        final result = tool['result'];
        if (tool['name'] == 'create_invoice' && result is Map && result['invoice'] is Map) {
          invoice = Map<String, dynamic>.from(result['invoice'] as Map);
          offline = result['offline'] == true;
        }
      }
      var said = reply.reply;
      if (reply.posted && invoice != null && _pay != 'credit') said = '$said ${await _takePayment(invoice)}'.trim();
      if (!mounted) return;
      setState(() {
        _preview = null;
        _posted = invoice;
        _offlineBill = offline;
        _message = said;
        if (reply.posted) {
          cart.clear();
          _customer.clear();
          _address.clear();
          _gstin.clear();
          _redeem = null;
        }
      });
      if (reply.posted) await AppScope.of(context).refresh();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _message = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<String> _takePayment(Map<String, dynamic> invoice) async {
    final total = invoice['total'];
    final args = <String, Object?>{
      'invoiceId': '${invoice['id']}',
      if (total is num) 'amount': total,
      'mode': _pay,
      'date': '${invoice['date'] ?? isoDate(AppScope.of(context).now())}',
    };
    try {
      final proposed = await api.propose('record_receipt', args);
      final preview = proposed.preview;
      if (!mounted) return '';
      if (preview == null) return proposed.reply.isEmpty ? inText(context, 'The payment was not recorded; record it from the customer\'s thread.') : proposed.reply;
      final done = await api.confirm(preview.token);
      if (!mounted) return '';
      return done.posted ? inFormat(context, 'Paid by {mode}.', {'mode': payModeWords(context, _pay)}) : done.reply;
    } on MycaApiException catch (err) {
      if (!mounted) return '';
      return inFormat(context, 'The bill is made, but the payment was not recorded: {why}', {'why': err.message});
    }
  }

  Future<void> _print() async {
    final invoice = _posted;
    if (invoice == null) return;
    var printer = await widget.printer.remembered();
    if (!mounted) return;
    if (printer == null) {
      final choices = await widget.printer.paired();
      if (!mounted) return;
      if (choices.isEmpty) {
        setState(() => _message = inText(context, 'Allow Nearby devices for MyCA and pair the receipt printer in Android Bluetooth settings, then print again.'));
        return;
      }
      printer = await showMycaSheet<PrinterChoice>(
        context: context,
        builder: (sheet) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              ListTile(title: Text(inText(context, 'Choose the receipt printer'))),
              for (final choice in choices) ListTile(title: Text(choice.name), subtitle: Text(choice.address), onTap: () => Navigator.of(sheet).pop(choice)),
            ],
          ),
        ),
      );
      if (printer == null) return;
      await widget.printer.remember(printer);
    }
    if (!mounted) return;
    final company = AppScope.of(context).snapshot?.company;
    Map<String, dynamic> document;
    try {
      document = toolData(await api.query('invoice_document', {'id': '${invoice['id']}'}));
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _message = err.message);
      return;
    }
    if (!mounted) return;
    if (document.isEmpty) {
      setState(() => _message = inFormat(context, 'Could not load bill {id} to print. Try again.', {'id': '${invoice['id']}'}));
      return;
    }
    final books = AppScope.of(context).offline;
    final bytes = receiptBytes(invoice: document, businessName: company?.name ?? '', gstin: company?.gstin ?? '', paper: await widget.printer.paper());
    final problem = await widget.printer.print(printer, bytes);
    final bill = _offlineBill ? books?.billById('${invoice['id']}') : null;
    if (problem == null && bill != null) await books!.markPrinted(bill.ref);
    if (mounted) {
      setState(() => _message = problem == null ? inFormat(context, 'Receipt sent to {printer}.', {'printer': printer!.name}) : printerProblemIn(indiaLang(context), problem, printer!.name));
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final subtotal = cart.fold<num>(0, (sum, line) => sum + line.amount);
    return Scaffold(
      appBar: AppBar(
        title: Text(inText(context, 'Counter sale')),
        actions: [
          if (AppScope.of(context).offline != null)
            IconButton(
              key: const Key('counter-offline-bills'),
              tooltip: inText(context, 'Offline bills'),
              icon: const Icon(Icons.cloud_sync_outlined),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const OfflineBillsScreen())),
            ),
          if (loyaltyEdition(context))
            IconButton(
              key: const Key('counter-loyalty'),
              tooltip: inText(context, 'Loyalty points'),
              icon: const Icon(Icons.loyalty_outlined),
              onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AppScope(state: AppScope.of(context), child: const LoyaltyScreen()))),
            ),
          IconButton(
            key: const Key('counter-alerts'),
            tooltip: inText(context, 'Expiring soon and low stock'),
            icon: const Icon(Icons.inventory_2_outlined),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const StockAlertsScreen())),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  key: const Key('counter-code'),
                  controller: _code,
                  textInputAction: TextInputAction.done,
                  onChanged: _typed,
                  onSubmitted: _addTyped,
                  decoration: InputDecoration(labelText: inText(context, 'Item name, barcode or code'), prefixIcon: const Icon(Icons.search)),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(key: const Key('counter-scan'), tooltip: inText(context, 'Scan'), onPressed: _busy ? null : _scan, icon: const Icon(Icons.qr_code_scanner)),
            ],
          ),
          if (_composition)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(inText(context, 'Composition dealer: these are bills of supply and carry no GST.'), key: const Key('counter-composition'), style: text.bodySmall),
            ),
          if (_hits.isNotEmpty)
            Card(
              key: const Key('counter-results'),
              margin: const EdgeInsets.only(top: 8),
              child: Column(
                children: [
                  for (final hit in _hits)
                    ListTile(
                      key: Key('counter-hit-${hit.sku}'),
                      dense: true,
                      title: Text(hit.name),
                      subtitle: Text(itemPriceLine(context, hit)),
                      trailing: const Icon(Icons.add_circle_outline),
                      onTap: () => _pick(hit),
                    ),
                ],
              ),
            ),
          if (_searched && _hits.isEmpty && _code.text.trim().isNotEmpty)
            ListTile(
              key: const Key('counter-quick-add'),
              leading: const Icon(Icons.add_box_outlined),
              title: Text(inFormat(context, 'Add "{name}" as a new item', {'name': _code.text.trim()})),
              onTap: () => _quickAdd(_code.text),
            ),
          if (_code.text.trim().isEmpty && _favourites.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Wrap(
                key: const Key('counter-favourites'),
                spacing: 8,
                runSpacing: 4,
                children: [
                  for (final hit in _favourites)
                    ActionChip(key: Key('counter-fav-${hit.sku}'), label: Text(hit.price == null ? hit.name : '${hit.name} · ${rupees(hit.price!)}'), onPressed: () => _pick(hit)),
                ],
              ),
            ),
          const SizedBox(height: 12),
          if (cart.isEmpty)
            Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: Text(inText(context, 'Search an item by name, or scan it, to start the bill.'), style: text.bodyMedium, textAlign: TextAlign.center)),
          for (final line in cart)
            Card(
              child: ListTile(
                title: Text(line.name),
                onTap: () => _editLine(line),
                subtitle: Text([
                  '${rupees(line.price)}${line.unit.isEmpty ? '' : ' / ${line.unit}'} + GST ${line.gstRate}%',
                  if (line.price != line.listPrice) inFormat(context, 'Shelf price {amount}', {'amount': rupees(line.listPrice)}),
                  if (line.lowStock) '${inText(context, 'Low stock')}: ${line.onHand ?? 0}',
                ].join(' · ')),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(tooltip: inText(context, 'One less'), icon: const Icon(Icons.remove_circle_outline), onPressed: () => setState(() {
                      line.qty -= 1;
                      if (line.qty <= 0) cart.remove(line);
                      _preview = null;
                    })),
                    InkWell(key: Key('counter-qty-${line.sku}'), onTap: () => _editLine(line), child: Padding(padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8), child: Text(qtyText(line.qty), style: text.titleMedium))),
                    IconButton(tooltip: inText(context, 'One more'), icon: const Icon(Icons.add_circle_outline), onPressed: () => setState(() {
                      line.qty += 1;
                      _preview = null;
                    })),
                  ],
                ),
              ),
            ),
          if (cart.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(inFormat(context, 'Before GST: {amount}', {'amount': rupees(subtotal)}), style: text.titleMedium, key: const Key('counter-subtotal')),
            const SizedBox(height: 8),
            TextField(key: const Key('counter-customer'), controller: _customer, onChanged: (_) => setState(() => _preview = null), decoration: InputDecoration(labelText: needsBuyerDetails(cart) ? inText(context, 'Customer name') : inText(context, 'Customer (optional)'), hintText: needsBuyerDetails(cart) ? null : inText(context, 'Walk-in customer'))),
            const SizedBox(height: 8),
            TextField(key: const Key('counter-gstin'), controller: _gstin, onChanged: (_) => setState(() => _preview = null), textCapitalization: TextCapitalization.characters, maxLength: 15, decoration: InputDecoration(labelText: inText(context, 'Customer GSTIN (optional)'), helperText: inText(context, 'For a business buyer who claims input tax credit'))),
            if (needsBuyerDetails(cart) && _gstin.text.trim().isEmpty) ...[
              const SizedBox(height: 8),
              TextField(key: const Key('counter-address'), controller: _address, onChanged: (_) => setState(() => _preview = null), maxLength: 200, decoration: InputDecoration(labelText: inText(context, 'Customer address with state'), helperText: inText(context, 'Needed on bills of ₹50,000 or more before GST'))),
            ],
            LoyaltyPointsField(
              partyName: _customer.text,
              billBeforeGst: subtotal,
              onChanged: (points) => setState(() {
                _redeem = points;
                _preview = null;
              }),
            ),
            const SizedBox(height: 12),
            Text(inText(context, 'Payment'), style: text.labelLarge),
            Wrap(
              spacing: 8,
              children: [
                for (final mode in counterPayModes)
                  ChoiceChip(key: Key('counter-pay-$mode'), label: Text(payModeWords(context, mode)), selected: _pay == mode, onSelected: (_) => setState(() => _pay = mode)),
              ],
            ),
            const SizedBox(height: 12),
            if (_preview == null) FilledButton(key: const Key('counter-make'), onPressed: _busy ? null : _makeBill, child: Text(inText(context, 'Make bill'))),
          ],
          if (_preview != null) ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(_preview!.summary, style: text.titleMedium),
                    for (final effect in _preview!.effects) Text(effect, style: text.bodyMedium),
                  ],
                ),
              ),
            ),
            FilledButton(key: const Key('counter-post'), onPressed: _busy ? null : _post, child: Text(inText(context, 'Post bill'))),
          ],
          if (_posted != null) ...[
            const SizedBox(height: 12),
            OutlinedButton.icon(key: const Key('counter-print'), onPressed: _busy ? null : _print, icon: const Icon(Icons.print_outlined), label: Text(inText(context, 'Print receipt'))),
            TextButton(
              onPressed: () async {
                final next = await widget.printer.paper() == PaperWidth.mm58 ? PaperWidth.mm80 : PaperWidth.mm58;
                await widget.printer.setPaper(next);
                if (mounted) setState(() => _message = inFormat(context, 'Receipts now print on {width} mm paper.', {'width': next == PaperWidth.mm58 ? '58' : '80'}));
              },
              child: Text(inText(context, 'Change paper width')),
            ),
          ],
          if (_message.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_message, key: const Key('counter-message'), style: text.bodyMedium)),
        ],
      ),
    );
  }
}

class NewItem {
  const NewItem({required this.line, this.reorderLevel, this.stockQty, this.batch = '', this.expiry = '', this.unitCost});

  final CartLine line;
  final num? reorderLevel;
  final num? stockQty;
  final String batch;
  final String expiry;
  final num? unitCost;
}

Map<String, Object?> newItemArgs(NewItem item, String code) => {
  'sku': item.line.sku,
  'name': item.line.name,
  'price': item.line.price,
  'gstRate': item.line.gstRate,
  if (item.line.hsn.isNotEmpty) 'hsn': item.line.hsn,
  if (item.line.unit.isNotEmpty) 'unit': item.line.unit,
  if (item.reorderLevel != null) 'reorderLevel': item.reorderLevel,
  if (RegExp(r'^[0-9A-Za-z-]{4,32}$').hasMatch(code) && code.toUpperCase() != item.line.sku) 'barcode': code,
};

Map<String, Object?>? stockInArgs(NewItem item) {
  final qty = item.stockQty;
  if (qty == null || qty <= 0) return null;
  return {
    'sku': item.line.sku,
    'qty': qty,
    if (item.unitCost != null) 'unitCost': item.unitCost,
    if (item.batch.isNotEmpty) 'batch': item.batch,
    if (item.expiry.isNotEmpty) 'expiry': item.expiry,
  };
}

final _expiryPattern = RegExp(r'^((0[1-9]|1[0-2])/\d{4}|\d{4}-(0[1-9]|1[0-2])(-\d{2})?)$');

class NewItemSheet extends StatefulWidget {
  const NewItemSheet({super.key, required this.code, required this.sku, required this.name, this.composition = false});

  final bool composition;
  final String code;
  final String sku;
  final String name;

  @override
  State<NewItemSheet> createState() => _NewItemSheetState();
}

class _NewItemSheetState extends State<NewItemSheet> {
  late final _name = TextEditingController(text: widget.name);
  final _price = TextEditingController();
  final _gst = TextEditingController();
  final _hsn = TextEditingController();
  final _reorder = TextEditingController();
  final _stock = TextEditingController();
  final _batch = TextEditingController();
  final _expiry = TextEditingController();
  final _cost = TextEditingController();
  String _unit = 'NOS';
  String _error = '';

  @override
  void dispose() {
    for (final field in [_name, _price, _gst, _hsn, _reorder, _stock, _batch, _expiry, _cost]) {
      field.dispose();
    }
    super.dispose();
  }

  void _save() {
    final price = parseAmount(_price.text);
    final gst = widget.composition ? 0 : parseRate(_gst.text);
    if (_name.text.trim().isEmpty) return setState(() => _error = inText(context, 'Give the item a name.'));
    if (price == null) return setState(() => _error = inText(context, 'Enter the selling price before GST.'));
    if (gst == null) return setState(() => _error = inText(context, 'Enter the GST rate, for example 5 or 18. Use 0 if there is none.'));
    final reorder = _reorder.text.trim().isEmpty ? null : parseAmount(_reorder.text);
    if (_reorder.text.trim().isNotEmpty && reorder == null) return setState(() => _error = inText(context, 'The low-stock level is a number, for example 10.'));
    final stock = _stock.text.trim().isEmpty ? null : parseAmount(_stock.text);
    if (_stock.text.trim().isNotEmpty && (stock == null || stock <= 0)) return setState(() => _error = inText(context, 'The stock you have now is a number above zero.'));
    final expiry = _expiry.text.trim();
    if (expiry.isNotEmpty && !_expiryPattern.hasMatch(expiry)) return setState(() => _error = inText(context, 'Write the expiry as on the pack, for example 03/2027.'));
    final batch = _batch.text.trim().toUpperCase();
    if (expiry.isNotEmpty && batch.isEmpty) return setState(() => _error = inText(context, 'An expiry goes with a batch number; add the batch printed on the pack.'));
    final cost = _cost.text.trim().isEmpty ? null : parseAmount(_cost.text);
    final sku = widget.sku.isNotEmpty ? widget.sku : widget.code.toUpperCase();
    final line = CartLine(sku: sku.length > 64 ? sku.substring(0, 64) : sku, name: _name.text.trim(), price: price, gstRate: gst, hsn: _hsn.text.trim(), unit: _unit);
    Navigator.of(context).pop(NewItem(line: line, reorderLevel: reorder, stockQty: stock, batch: batch, expiry: expiry, unitCost: cost));
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.code.isEmpty ? inFormat(context, 'New item {code}', {'code': widget.name}) : inFormat(context, 'New item {code}', {'code': widget.code}), style: Theme.of(context).textTheme.titleLarge),
            Text(inText(context, 'Saved once; the next scan fills the bill.')),
            TextField(key: const Key('item-name'), controller: _name, decoration: InputDecoration(labelText: inText(context, 'Name'))),
            TextField(key: const Key('item-price'), controller: _price, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: inText(context, 'Selling price before GST'))),
            if (!widget.composition) TextField(key: const Key('item-gst'), controller: _gst, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: inText(context, 'GST %'))),
            TextField(controller: _hsn, decoration: InputDecoration(labelText: inText(context, 'HSN (optional)'))),
            DropdownButtonFormField<String>(
              key: const Key('item-unit'),
              initialValue: _unit,
              decoration: InputDecoration(labelText: inText(context, 'Unit (GST UQC)')),
              items: [for (final code in counterUnits) DropdownMenuItem(value: code, child: Text(code))],
              onChanged: (value) => setState(() => _unit = value ?? 'NOS'),
            ),
            TextField(key: const Key('item-reorder'), controller: _reorder, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: inText(context, 'Low-stock alert at (optional)'))),
            const SizedBox(height: 12),
            Text(inText(context, 'Stock you have now (optional)'), style: Theme.of(context).textTheme.titleSmall),
            TextField(key: const Key('item-stock'), controller: _stock, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: inText(context, 'Quantity'))),
            TextField(key: const Key('item-cost'), controller: _cost, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: inText(context, 'Cost per unit (optional)'))),
            TextField(key: const Key('item-batch'), controller: _batch, decoration: InputDecoration(labelText: inText(context, 'Batch no. (optional)'))),
            TextField(key: const Key('item-expiry'), controller: _expiry, keyboardType: TextInputType.datetime, decoration: InputDecoration(labelText: inText(context, 'Expiry MM/YYYY (optional)'))),
            if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error, key: const Key('item-error'), style: TextStyle(color: Theme.of(context).colorScheme.error))),
            const SizedBox(height: 12),
            FilledButton(key: const Key('item-save'), onPressed: _save, child: Text(inText(context, 'Save and add'))),
          ],
        ),
      ),
    );
  }
}
