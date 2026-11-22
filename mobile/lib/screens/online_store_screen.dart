import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../india/india_strings.dart';

String storeLinkOf(Map<String, dynamic> view) {
  final link = view['link'];
  if (link is! Map) return '';
  final url = '${link['url'] ?? ''}';
  return url.isNotEmpty ? url : '${link['path'] ?? ''}';
}

String storeShareText(String storeName, String url) => 'Order from $storeName online: $url';

class OnlineStoreScreen extends StatefulWidget {
  const OnlineStoreScreen({super.key, this.initialTab = 0});

  final int initialTab;

  @override
  State<OnlineStoreScreen> createState() => _OnlineStoreScreenState();
}

class _OnlineStoreScreenState extends State<OnlineStoreScreen> {
  final _name = TextEditingController();
  final _whatsapp = TextEditingController();
  final _description = TextEditingController();
  final _city = TextEditingController();
  final _slug = TextEditingController();
  Map<String, dynamic> _view = const {};
  List<Map<String, dynamic>> _orders = const [];
  final _published = <String, bool>{};
  bool _enabled = false;
  bool _showPrices = true;
  bool _showStock = false;
  bool _showGstin = false;
  bool _loading = true;
  bool _busy = false;
  String _message = '';
  ChatPreview? _preview;

  MycaApi get api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loading && _view.isEmpty) _load();
  }

  @override
  void dispose() {
    for (final c in [_name, _whatsapp, _description, _city, _slug]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final view = toolData(await api.query('catalogue_view'));
      final orders = toolData(await api.query('store_orders'));
      if (!mounted) return;
      final settings = view['settings'] is Map ? Map<String, dynamic>.from(view['settings'] as Map) : <String, dynamic>{};
      setState(() {
        _view = view;
        _orders = [for (final o in (orders['orders'] is List ? orders['orders'] as List : const [])) if (o is Map) Map<String, dynamic>.from(o)];
        _enabled = settings['enabled'] == true;
        _showPrices = settings['showPrices'] != false;
        _showStock = settings['showStock'] == true;
        _showGstin = settings['showGstin'] == true;
        _name.text = '${settings['storeName'] ?? ''}';
        _whatsapp.text = '${settings['whatsapp'] ?? ''}';
        _description.text = '${settings['description'] ?? ''}';
        _city.text = '${settings['city'] ?? ''}';
        final link = view['link'] is Map ? view['link'] as Map : const {};
        _slug.text = '${settings['slug'] ?? ''}'.isNotEmpty ? '${settings['slug']}' : '${link['slug'] ?? ''}';
        _published
          ..clear()
          ..addEntries([for (final item in _items) MapEntry('${item['sku']}', item['published'] == true)]);
        _loading = false;
      });
    } on MycaApiException catch (err) {
      if (mounted) {
        setState(() {
          _message = err.message;
          _loading = false;
        });
      }
    }
  }

  List<Map<String, dynamic>> get _items => [for (final i in (_view['items'] is List ? _view['items'] as List : const [])) if (i is Map) Map<String, dynamic>.from(i)];

  Future<void> _propose(String tool, Map<String, Object?> args) async {
    setState(() {
      _busy = true;
      _message = '';
      _preview = null;
    });
    try {
      final reply = await api.propose(tool, args);
      if (!mounted) return;
      setState(() {
        _preview = reply.preview;
        if (reply.preview == null) _message = reply.blockers.isNotEmpty ? reply.blockers.join(' ') : reply.reply;
      });
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _message = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirm() async {
    final preview = _preview;
    if (preview == null) return;
    setState(() => _busy = true);
    try {
      final reply = await api.confirm(preview.token);
      if (!mounted) return;
      setState(() {
        _preview = null;
        _message = reply.reply;
      });
      if (reply.posted) await _load();
    } on MycaApiException catch (err) {
      if (mounted) {
        setState(() {
          _preview = null;
          _message = err.message;
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Map<String, Object?> _settingsArgs() => {
    'enabled': _enabled,
    'storeName': _name.text.trim(),
    'whatsapp': _whatsapp.text.trim(),
    'description': _description.text.trim(),
    'city': _city.text.trim(),
    'showPrices': _showPrices,
    'showStock': _showStock,
    'showGstin': _showGstin,
    if (_slug.text.trim().isNotEmpty) 'slug': _slug.text.trim().toLowerCase(),
  };

  Future<void> _saveItems() async {
    final changed = [
      for (final item in _items)
        if ((_published['${item['sku']}'] ?? false) != (item['published'] == true)) {'sku': '${item['sku']}', 'published': _published['${item['sku']}'] ?? false},
    ];
    if (changed.isEmpty) {
      setState(() => _message = inText(context, 'Nothing changed.'));
      return;
    }
    await _propose('catalogue_items', {'items': changed});
  }

  Future<void> _share() async {
    final url = storeLinkOf(_view);
    if (url.isEmpty) return;
    final shared = await AppScope.of(context).shareText(storeShareText(_name.text.trim(), url));
    if (!mounted) return;
    setState(() => _message = shared ? inText(context, 'Your phone offered the link to WhatsApp or another app.') : inText(context, 'Your phone could not open the share sheet. Copy the link instead.'));
  }

  Future<void> _copy() async {
    final url = storeLinkOf(_view);
    if (url.isEmpty) return;
    await Clipboard.setData(ClipboardData(text: url));
    if (mounted) setState(() => _message = inText(context, 'Link copied.'));
  }

  Widget _previewCard(TextTheme text) {
    final preview = _preview!;
    return Card(
      key: const Key('store-preview'),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(preview.summary, style: text.titleMedium),
            for (final effect in preview.effects) Text(effect, style: text.bodyMedium),
            const SizedBox(height: 8),
            Row(
              children: [
                FilledButton(key: const Key('store-confirm'), onPressed: _busy ? null : _confirm, child: Text(inText(context, 'Confirm'))),
                const SizedBox(width: 8),
                TextButton(onPressed: _busy ? null : () => setState(() => _preview = null), child: Text(inText(context, 'Cancel'))),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _storeTab(TextTheme text) {
    final url = storeLinkOf(_view);
    final live = _view['link'] is Map && (_view['link'] as Map)['live'] == true;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        SwitchListTile(
          key: const Key('store-enabled'),
          contentPadding: EdgeInsets.zero,
          title: Text(inText(context, 'Store is on')),
          subtitle: Text(inText(context, 'Buyers with the link see the items you publish. Costs, stock quantities and your books are never shown.')),
          value: _enabled,
          onChanged: _busy ? null : (value) => setState(() => _enabled = value),
        ),
        if (url.isNotEmpty) ...[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(live ? inText(context, 'Your store link') : inText(context, 'Your store link (switched off)'), style: text.titleSmall),
                  SelectableText(url, key: const Key('store-link')),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: [
                      OutlinedButton.icon(key: const Key('store-copy'), onPressed: _copy, icon: const Icon(Icons.copy), label: Text(inText(context, 'Copy link'))),
                      FilledButton.icon(key: const Key('store-share'), onPressed: live ? _share : null, icon: const Icon(Icons.share), label: Text(inText(context, 'Share on WhatsApp'))),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
        TextField(key: const Key('store-name'), controller: _name, maxLength: 80, decoration: InputDecoration(labelText: inText(context, 'Store name'))),
        TextField(key: const Key('store-whatsapp'), controller: _whatsapp, maxLength: 14, keyboardType: TextInputType.phone, decoration: InputDecoration(labelText: inText(context, 'WhatsApp number for orders'), helperText: inText(context, '10-digit Indian mobile number'))),
        TextField(key: const Key('store-description'), controller: _description, maxLength: 300, decoration: InputDecoration(labelText: inText(context, 'Short description (optional)'))),
        TextField(key: const Key('store-city'), controller: _city, maxLength: 60, decoration: InputDecoration(labelText: inText(context, 'City (optional)'))),
        TextField(key: const Key('store-slug'), controller: _slug, maxLength: 40, decoration: InputDecoration(labelText: inText(context, 'Link name'), helperText: inText(context, 'Lowercase letters, digits and hyphens, 3 to 40'))),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(inText(context, 'Show prices with GST')), value: _showPrices, onChanged: (v) => setState(() => _showPrices = v)),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(inText(context, 'Show in stock or out of stock')), value: _showStock, onChanged: (v) => setState(() => _showStock = v)),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(inText(context, 'Show my GSTIN')), value: _showGstin, onChanged: (v) => setState(() => _showGstin = v)),
        FilledButton(key: const Key('store-save'), onPressed: _busy ? null : () => _propose('catalogue_settings', _settingsArgs()), child: Text(inText(context, 'Save store'))),
        const SizedBox(height: 20),
        Text(inText(context, 'Items to publish'), style: text.titleMedium),
        if (_items.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Text(inText(context, 'Save items with a name, price and GST rate first, for example from Counter sale.'))),
        for (final item in _items)
          CheckboxListTile(
            key: Key('store-item-${item['sku']}'),
            contentPadding: EdgeInsets.zero,
            title: Text('${item['name']}'),
            subtitle: Text(item['priceWithGst'] is num ? '${rupees(item['priceWithGst'] as num)} ${inText(context, 'incl. GST')}' : inText(context, 'No price yet')),
            value: _published['${item['sku']}'] ?? false,
            onChanged: _busy ? null : (value) => setState(() => _published['${item['sku']}'] = value ?? false),
          ),
        if (_items.isNotEmpty) OutlinedButton(key: const Key('store-save-items'), onPressed: _busy ? null : _saveItems, child: Text(inText(context, 'Save items'))),
      ],
    );
  }

  String _statusWords(String status) => switch (status) {
    'new' => inText(context, 'New'),
    'accepted' => inText(context, 'Quote made'),
    'declined' => inText(context, 'Declined'),
    'fulfilled' => inText(context, 'Fulfilled'),
    _ => status,
  };

  Widget _ordersTab(TextTheme text) {
    if (_orders.isEmpty) return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(inText(context, 'No orders yet. Share your store link to get orders.'), textAlign: TextAlign.center)));
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        for (final order in _orders)
          Card(
            key: Key('store-order-${order['id']}'),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${order['id']} · ${order['buyerName']} · ${order['buyerPhone']}', style: text.titleSmall),
                  for (final line in (order['lines'] is List ? order['lines'] as List : const []))
                    if (line is Map) Text('${line['qty']} x ${line['name']}${line['amount'] is num ? ' = ${rupees(line['amount'] as num)}' : ''}'),
                  if ('${order['note'] ?? ''}'.isNotEmpty) Text('${order['note']}', style: text.bodySmall),
                  Text('${_statusWords('${order['status']}')}${'${order['quoteId'] ?? ''}'.isNotEmpty ? ' · ${order['quoteId']}' : ''}', style: text.bodyMedium),
                  Wrap(
                    spacing: 8,
                    children: [
                      if (order['status'] == 'new') FilledButton(key: Key('store-accept-${order['id']}'), onPressed: _busy ? null : () => _propose('store_order_action', {'id': '${order['id']}', 'action': 'accept'}), child: Text(inText(context, 'Make quote'))),
                      if (order['status'] == 'new') TextButton(key: Key('store-decline-${order['id']}'), onPressed: _busy ? null : () => _propose('store_order_action', {'id': '${order['id']}', 'action': 'decline'}), child: Text(inText(context, 'Decline'))),
                      if (order['status'] == 'new' || order['status'] == 'accepted') OutlinedButton(key: Key('store-fulfil-${order['id']}'), onPressed: _busy ? null : () => _propose('store_order_action', {'id': '${order['id']}', 'action': 'fulfil'}), child: Text(inText(context, 'Mark fulfilled'))),
                    ],
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final fresh = _orders.where((o) => o['status'] == 'new').length;
    return DefaultTabController(
      length: 2,
      initialIndex: widget.initialTab,
      child: Scaffold(
        appBar: AppBar(
          title: Text(inText(context, 'Online store')),
          bottom: TabBar(tabs: [Tab(text: inText(context, 'Store')), Tab(text: fresh > 0 ? '${inText(context, 'Orders')} ($fresh)' : inText(context, 'Orders'))]),
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : Column(
                children: [
                  if (_preview != null) Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: _previewCard(text)),
                  if (_message.isNotEmpty) Padding(padding: const EdgeInsets.fromLTRB(16, 8, 16, 0), child: Text(_message, key: const Key('store-message'), style: text.bodyMedium)),
                  Expanded(child: TabBarView(children: [_storeTab(text), _ordersTab(text)])),
                ],
              ),
      ),
    );
  }
}
