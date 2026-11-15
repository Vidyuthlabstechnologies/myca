import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../pos/escpos.dart';
import '../pos/printer.dart';
import '../pos/receipt.dart';
import '../pos/scan_screen.dart';
import '../registers.dart';

class CartLine {
  CartLine({required this.sku, required this.name, required this.price, required this.gstRate, this.hsn = '', this.qty = 1});

  final String sku;
  final String name;
  final num price;
  final num gstRate;
  final String hsn;
  num qty;

  num get amount => (price * qty * 100).round() / 100;

  Map<String, Object?> toLine() => {
    'description': name,
    if (hsn.isNotEmpty) 'hsn': hsn,
    'qty': qty,
    'rate': price,
    'gstRate': gstRate,
  };
}

const buyerDetailsFromRupees = 50000;

num billTotal(List<CartLine> cart) => cart.fold<num>(0, (sum, line) => sum + ((line.amount * (100 + line.gstRate)).round() / 100));

bool needsBuyerDetails(List<CartLine> cart) => billTotal(cart) >= buyerDetailsFromRupees;

Map<String, Object?> counterSaleArgs(List<CartLine> cart, {String customer = '', String address = ''}) => {
  'partyName': customer.trim().isEmpty ? 'Walk-in customer' : customer.trim(),
  if (address.trim().isNotEmpty) 'partyAddress': address.trim(),
  'lines': [for (final line in cart) line.toLine()],
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
  final cart = <CartLine>[];
  String _message = '';
  bool _busy = false;
  ChatPreview? _preview;
  Map<String, dynamic>? _posted;

  MycaApi get api => AppScope.of(context).api;

  @override
  void dispose() {
    _code.dispose();
    _customer.dispose();
    _address.dispose();
    super.dispose();
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
      _put(CartLine(sku: '${data['sku']}', name: '${data['name']}', price: price, gstRate: gstRate, hsn: '${data['hsn'] ?? ''}'));
      _code.clear();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _message = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _put(CartLine line) {
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
    final result = await showModalBottomSheet<CartLine>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _NewItemSheet(code: code, sku: sku, name: name),
    );
    if (result == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final reply = await api.propose('set_sku_cost', {
        'sku': result.sku,
        'name': result.name,
        'price': result.price,
        'gstRate': result.gstRate,
        if (result.hsn.isNotEmpty) 'hsn': result.hsn,
        if (RegExp(r'^[0-9A-Za-z-]{4,32}$').hasMatch(code) && code.toUpperCase() != result.sku) 'barcode': code,
      });
      final preview = reply.preview;
      if (preview != null) await api.confirm(preview.token);
      _put(result);
      _code.clear();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _message = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _makeBill() async {
    if (cart.isEmpty) return;
    if (needsBuyerDetails(cart) && (_customer.text.trim().isEmpty || _address.text.trim().isEmpty)) {
      setState(() => _message = inText(context, 'A bill of ₹50,000 or more must carry the customer\'s name and address with the state. Add both, then make the bill.'));
      return;
    }
    setState(() {
      _busy = true;
      _message = '';
    });
    try {
      final reply = await api.propose('create_invoice', counterSaleArgs(cart, customer: _customer.text, address: _address.text));
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
      for (final tool in reply.tools) {
        final result = tool['result'];
        if (tool['name'] == 'create_invoice' && result is Map && result['invoice'] is Map) invoice = Map<String, dynamic>.from(result['invoice'] as Map);
      }
      setState(() {
        _preview = null;
        _posted = invoice;
        _message = reply.posted ? reply.reply : reply.reply;
        if (reply.posted) {
          cart.clear();
          _customer.clear();
          _address.clear();
        }
      });
      if (reply.posted) await AppScope.of(context).refresh();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _message = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
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
      printer = await showModalBottomSheet<PrinterChoice>(
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
      setState(() => _message = 'Could not load bill ${invoice['id']} to print. Try again.');
      return;
    }
    final bytes = receiptBytes(invoice: document, businessName: company?.name ?? '', gstin: company?.gstin ?? '', paper: await widget.printer.paper());
    final problem = await widget.printer.print(printer, bytes);
    if (mounted) setState(() => _message = problem ?? 'Receipt sent to ${printer!.name}.');
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final subtotal = cart.fold<num>(0, (sum, line) => sum + line.amount);
    return Scaffold(
      appBar: AppBar(title: Text(inText(context, 'Counter sale'))),
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
                  onSubmitted: _add,
                  decoration: InputDecoration(labelText: inText(context, 'Barcode or item code')),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(key: const Key('counter-scan'), tooltip: inText(context, 'Scan'), onPressed: _busy ? null : _scan, icon: const Icon(Icons.qr_code_scanner)),
            ],
          ),
          const SizedBox(height: 12),
          if (cart.isEmpty)
            Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: Text(inText(context, 'Scan or type an item to start the bill.'), style: text.bodyMedium, textAlign: TextAlign.center)),
          for (final line in cart)
            Card(
              child: ListTile(
                title: Text(line.name),
                subtitle: Text('${rupees(line.price)} + GST ${line.gstRate}%'),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(tooltip: inText(context, 'One less'), icon: const Icon(Icons.remove_circle_outline), onPressed: () => setState(() {
                      line.qty -= 1;
                      if (line.qty <= 0) cart.remove(line);
                      _preview = null;
                    })),
                    Text('${line.qty}', style: text.titleMedium),
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
            Text('Before GST: ${rupees(subtotal)}', style: text.titleMedium, key: const Key('counter-subtotal')),
            const SizedBox(height: 8),
            TextField(key: const Key('counter-customer'), controller: _customer, decoration: InputDecoration(labelText: needsBuyerDetails(cart) ? inText(context, 'Customer name') : inText(context, 'Customer (optional)'), hintText: needsBuyerDetails(cart) ? null : inText(context, 'Walk-in customer'))),
            if (needsBuyerDetails(cart)) ...[
              const SizedBox(height: 8),
              TextField(key: const Key('counter-address'), controller: _address, maxLength: 200, decoration: InputDecoration(labelText: inText(context, 'Customer address with state'), helperText: inText(context, 'Needed on bills of ₹50,000 or more'))),
            ],
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
                if (mounted) setState(() => _message = 'Receipts now print on ${next == PaperWidth.mm58 ? '58' : '80'} mm paper.');
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

class _NewItemSheet extends StatefulWidget {
  const _NewItemSheet({required this.code, required this.sku, required this.name});

  final String code;
  final String sku;
  final String name;

  @override
  State<_NewItemSheet> createState() => _NewItemSheetState();
}

class _NewItemSheetState extends State<_NewItemSheet> {
  late final _name = TextEditingController(text: widget.name);
  final _price = TextEditingController();
  final _gst = TextEditingController();
  final _hsn = TextEditingController();
  String _error = '';

  @override
  void dispose() {
    _name.dispose();
    _price.dispose();
    _gst.dispose();
    _hsn.dispose();
    super.dispose();
  }

  void _save() {
    final price = parseAmount(_price.text);
    final gst = parseRate(_gst.text);
    if (_name.text.trim().isEmpty) return setState(() => _error = inText(context, 'Give the item a name.'));
    if (price == null) return setState(() => _error = inText(context, 'Enter the selling price before GST.'));
    if (gst == null) return setState(() => _error = inText(context, 'Enter the GST rate, for example 5 or 18. Use 0 if there is none.'));
    final sku = widget.sku.isNotEmpty ? widget.sku : widget.code.toUpperCase();
    Navigator.of(context).pop(CartLine(sku: sku.length > 64 ? sku.substring(0, 64) : sku, name: _name.text.trim(), price: price, gstRate: gst, hsn: _hsn.text.trim()));
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('New item ${widget.code}', style: Theme.of(context).textTheme.titleLarge),
          Text(inText(context, 'Saved once; the next scan fills the bill.')),
          TextField(key: const Key('item-name'), controller: _name, decoration: InputDecoration(labelText: inText(context, 'Name'))),
          TextField(key: const Key('item-price'), controller: _price, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: inText(context, 'Selling price before GST'))),
          TextField(key: const Key('item-gst'), controller: _gst, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: inText(context, 'GST %'))),
          TextField(controller: _hsn, decoration: InputDecoration(labelText: inText(context, 'HSN (optional)'))),
          if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error, style: TextStyle(color: Theme.of(context).colorScheme.error))),
          const SizedBox(height: 12),
          FilledButton(key: const Key('item-save'), onPressed: _save, child: Text(inText(context, 'Save and add'))),
        ],
      ),
    );
  }
}
