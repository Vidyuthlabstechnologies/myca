import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../marks.dart';
import '../proposal_flow.dart';
import '../registers.dart';
import '../theme.dart';
import '../widgets.dart';

const _channels = ['amazon', 'flipkart', 'myntra', 'nykaa', 'meesho', 'shopify', 'razorpay', 'quick-commerce'];

class MarketplaceScreen extends StatefulWidget {
  const MarketplaceScreen({super.key});

  @override
  State<MarketplaceScreen> createState() => _MarketplaceScreenState();
}

class _MarketplaceScreenState extends State<MarketplaceScreen> with ProposalFlow {
  Future<_MarketplaceData>? _data;

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  Future<void> onPosted() async {
    await AppScope.of(context).refresh();
    _reload();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _data ??= _load();
  }

  Future<_MarketplaceData> _load() async {
    final results = await Future.wait([
      api.query('registrations'),
      api.query('settlement_status'),
      api.query('marketplace_credits'),
      api.query('sku_margins'),
      api.query('stock_position'),
    ]);
    return _MarketplaceData(
      registrations: toolData(results[0]),
      settlements: toolData(results[1]),
      credits: toolData(results[2]),
      margins: toolData(results[3]),
      stock: toolData(results[4]),
    );
  }

  void _reload() {
    final next = _load();
    setState(() => _data = next);
  }

  Future<void> _importFile(String tool, String said, {Map<String, Object?> extra = const {}}) async {
    final state = AppScope.of(context);
    final picked = await state.pickTextFile(const ['csv', 'txt', 'tsv']);
    if (picked == null || !mounted) return;
    final String sha;
    try {
      sha = await api.upload(picked.name, picked.content);
    } on MycaApiException catch (err) {
      setState(() => entries.add(ThreadEntry(text: err.message, tone: BubbleTone.problem)));
      return;
    }
    if (!mounted) return;
    await propose('$said: ${picked.name}', tool, {'documentSha256': sha, ...extra});
  }

  Future<void> _importSettlement() async {
    final channel = await _pickChannel('Which channel paid out?');
    if (channel == null || !mounted) return;
    await _importFile('import_settlement', 'Import the $channel settlement', extra: {'channel': channel});
  }

  Future<void> _importOrders() async {
    final channel = await _pickChannel('Which channel\'s orders?');
    if (channel == null || !mounted) return;
    await _importFile('import_marketplace_orders', 'Import $channel orders', extra: {'channel': channel});
  }

  Future<String?> _pickChannel(String title) => showModalBottomSheet<String>(
        context: context,
        builder: (sheet) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
            children: [
              Text(title, style: Theme.of(sheet).textTheme.titleMedium),
              const SizedBox(height: 8),
              for (final channel in _channels)
                ListTile(title: Text(_cap(channel)), onTap: () => Navigator.of(sheet).pop(channel)),
            ],
          ),
        ),
      );

  Future<void> _showMoves(String sku, String location) async {
    final data = toolData(await api.query('stock_moves', {'sku': sku, 'location': location}));
    if (!mounted) return;
    final moves = _maps(data['moves']);
    await showModalBottomSheet<void>(
      context: context,
      builder: (sheet) {
        final text = Theme.of(sheet).textTheme;
        return SafeArea(
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(22, 12, 22, 22),
            children: [
              Text('$sku at $location', style: text.headlineSmall),
              Text('${data['onHand'] ?? 0} on hand', style: text.bodyMedium),
              const SizedBox(height: 10),
              if (moves.isEmpty) Text('No movement recorded yet.', style: text.bodyMedium),
              for (final move in moves.take(20))
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text('${_num(move['qty']) > 0 ? '+' : ''}${move['qty']} on ${longDate('${move['date']}')}'),
                  subtitle: Text('${move['note'] ?? ''}${'${move['ref'] ?? ''}'.isNotEmpty ? ' (${move['ref']})' : ''}'),
                ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _addRegistration() async {
    final draft = await showModalBottomSheet<_RegistrationDraft>(context: context, isScrollControlled: true, builder: (_) => const _RegistrationSheet());
    if (draft == null || !mounted) return;
    await propose('Add registration ${draft.gstin}', 'set_registration', {'gstin': draft.gstin, 'kind': draft.kind, if (draft.label.isNotEmpty) 'label': draft.label});
  }

  Future<void> _setCost() async {
    final draft = await showModalBottomSheet<_CostDraft>(context: context, isScrollControlled: true, builder: (_) => const _CostSheet());
    if (draft == null || !mounted) return;
    await propose('Cost of ${draft.sku} is ₹${draft.cost}', 'set_sku_cost', {'sku': draft.sku, 'cost': draft.cost, if (draft.gstRate != null) 'gstRate': draft.gstRate, if (draft.hsn.isNotEmpty) 'hsn': draft.hsn});
  }

  Future<void> _stockIn(List<Map<String, dynamic>> registrations) async {
    final draft = await showModalBottomSheet<_StockDraft>(context: context, isScrollControlled: true, builder: (_) => _StockSheet(registrations: registrations));
    if (draft == null || !mounted) return;
    if (draft.toGstin.isEmpty) {
      await propose('Stock in ${draft.qty} of ${draft.sku} at ${draft.location}', 'record_stock', {'sku': draft.sku, 'qty': draft.qty, 'location': draft.location});
    } else {
      await propose('Transfer ${draft.qty} of ${draft.sku} to ${draft.toGstin}', 'record_stock_transfer', {'sku': draft.sku, 'qty': draft.qty, 'fromGstin': draft.fromGstin, 'toGstin': draft.toGstin});
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Marketplace')),
      body: Column(
        children: [
          Expanded(
            child: FutureBuilder<_MarketplaceData>(
              future: _data,
              builder: (context, snap) {
                final data = snap.data;
                if (data == null) {
                  if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
                  return Center(child: FilledButton(onPressed: _reload, child: const Text('Try again')));
                }
                final registrations = _maps(data.registrations['registrations']);
                final settlementRows = _maps(data.settlements['settlements']);
                final byChannel = data.settlements['byChannel'] is Map ? Map<String, dynamic>.from(data.settlements['byChannel'] as Map) : const <String, dynamic>{};
                final creditTotals = data.credits['totals'] is Map ? Map<String, dynamic>.from(data.credits['totals'] as Map) : const <String, dynamic>{};
                final marginTotals = data.margins['totals'] is Map ? Map<String, dynamic>.from(data.margins['totals'] as Map) : const <String, dynamic>{};
                final marginRows = _maps(data.margins['rows']);
                final stockRows = _maps(data.stock['rows']);
                return RefreshIndicator(
                  onRefresh: () async => _reload(),
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                    children: [
                      const SectionLabel('Payouts'),
                      Panel(
                        children: [
                          if (byChannel.isEmpty)
                            const RowCard(leading: TintTile(tint: Tint.ask, mark: Mark.bringIn), title: 'No settlement imported yet', subtitle: 'Import a payout report from Amazon, Flipkart or your gateway'),
                          for (final entry in byChannel.entries)
                            RowCard(
                              leading: TintTile(tint: _num(entry.value['short']) > 0 || _num(entry.value['unmatched']) > 0 ? Tint.urgent : Tint.sales, mark: Mark.bringIn),
                              title: '${_cap(entry.key)}: expected ${rupees(_num(entry.value['expected']))}, paid ${rupees(_num(entry.value['paid']))}',
                              subtitle: [
                                if (_num(entry.value['short']) > 0) 'short ${rupees(_num(entry.value['short']))}',
                                if (_num(entry.value['unmatched']) > 0) '${_num(entry.value['unmatched']).toInt()} not in the bank yet',
                                if (_num(entry.value['penalties']) > 0) 'penalties ${rupees(_num(entry.value['penalties']))}',
                                'TCS ${rupees(_num(entry.value['tcs']))}, TDS ${rupees(_num(entry.value['tds']))} to claim',
                              ].join(' · '),
                            ),
                          for (final row in settlementRows.take(5))
                            RowCard(
                              leading: TintTile(tint: row['status'] == 'matched' ? Tint.ask : Tint.urgent, mark: row['status'] == 'matched' ? Mark.confirm : Mark.urgent),
                              title: '${row['id']} ${_cap('${row['channel']}')} ${row['settlementId']}: ${rupees(_num(row['expected']))}',
                              subtitle: '${longDate('${row['from']}')} to ${longDate('${row['to']}')} · ${_num(row['orders']).toInt()} orders · ${row['status'] == 'matched' ? 'paid in full' : row['status'] == 'short' ? 'short ${rupees(_num(row['shortfall']))}' : row['status'] == 'over' ? 'overpaid' : 'not in the bank yet'}',
                            ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          ActionChip(avatar: const Icon(Icons.upload_file, size: 18), label: const Text('Import settlement'), onPressed: busy ? null : _importSettlement),
                          ActionChip(avatar: const Icon(Icons.upload_file, size: 18), label: const Text('Import orders'), onPressed: busy ? null : _importOrders),
                        ],
                      ),
                      const SizedBox(height: 22),
                      const SectionLabel('TCS and TDS 194-O'),
                      Panel(
                        children: [
                          RowCard(
                            leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
                            title: 'GST TCS: ${rupees(_num(creditTotals['tcsRecorded']))} deducted, ${rupees(_num(creditTotals['tcsReported']))} confirmed',
                            subtitle: '${rupees(_num(creditTotals['tcsAvailable']))} available for the next GST payment',
                          ),
                          RowCard(
                            leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
                            title: 'TDS 194-O: ${rupees(_num(creditTotals['tdsRecorded']))} deducted, ${rupees(_num(creditTotals['tdsIn26as']))} in 26AS',
                            subtitle: 'Credit against income tax once Form 26AS confirms it',
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          ActionChip(avatar: const Icon(Icons.upload_file, size: 18), label: const Text('Import TCS statement'), onPressed: busy ? null : () => _importFile('import_tcs_statement', 'Import the TCS statement')),
                          ActionChip(avatar: const Icon(Icons.upload_file, size: 18), label: const Text('Import 26AS'), onPressed: busy ? null : () => _importFile('import_26as_credits', 'Import Form 26AS')),
                        ],
                      ),
                      const SizedBox(height: 22),
                      const SectionLabel('Margins by SKU'),
                      Panel(
                        children: [
                          if (marginRows.isEmpty)
                            const RowCard(leading: TintTile(tint: Tint.ask, mark: Mark.sales), title: 'No marketplace orders yet', subtitle: 'Import an order report and set SKU costs to see margins'),
                          if (marginRows.isNotEmpty)
                            RowCard(
                              leading: TintTile(tint: _num(marginTotals['margin']) < 0 ? Tint.urgent : Tint.sales, mark: Mark.sales),
                              title: 'Margin ${rupees(_num(marginTotals['margin']))} on net sales ${rupees(_num(marginTotals['net']))}',
                              subtitle: 'fees ${rupees(_num(marginTotals['fees']))} · cost of goods ${rupees(_num(marginTotals['cogs']))}',
                            ),
                          for (final row in marginRows.take(6))
                            RowCard(
                              leading: TintTile(tint: _num(row['margin']) < 0 ? Tint.urgent : Tint.ask, mark: _num(row['margin']) < 0 ? Mark.urgent : Mark.comingUp),
                              title: '${row['sku']} on ${row['channel']}: ${rupees(_num(row['margin']))}${row['marginPercent'] != null ? ' (${row['marginPercent']}%)' : ''}',
                              subtitle: row['costMissing'] == true ? 'No cost set yet' : '${_num(row['units']).toInt()} units · net ${rupees(_num(row['net']))} · fees ${rupees(_num(row['fees']))}',
                            ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          ActionChip(avatar: const Icon(Icons.price_change_outlined, size: 18), label: const Text('Set a cost'), onPressed: busy ? null : _setCost),
                          ActionChip(avatar: const Icon(Icons.upload_file, size: 18), label: const Text('Import costs'), onPressed: busy ? null : () => _importFile('import_sku_costs', 'Import SKU costs')),
                        ],
                      ),
                      const SizedBox(height: 22),
                      const SectionLabel('Stock'),
                      Panel(
                        children: [
                          if (stockRows.isEmpty)
                            const RowCard(leading: TintTile(tint: Tint.ask, mark: Mark.purchases), title: 'No stock recorded', subtitle: 'Orders move stock out; record what you hold or send to a warehouse'),
                          for (final row in stockRows.take(8))
                            RowCard(
                              leading: TintTile(tint: _num(row['qty']) < 0 ? Tint.urgent : Tint.purchases, mark: Mark.purchases),
                              title: '${row['sku']} at ${row['location']}: ${row['qty']}',
                              subtitle: row['value'] != null ? 'worth ${rupees(_num(row['value']))} at cost' : 'no cost set',
                              trailing: const Chevron(),
                              onTap: () => _showMoves('${row['sku']}', '${row['location']}'),
                            ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          ActionChip(avatar: const Icon(Icons.move_down, size: 18), label: const Text('Stock in or transfer'), onPressed: busy ? null : () => _stockIn(registrations)),
                          ActionChip(avatar: const Icon(Icons.account_balance_outlined, size: 18), label: const Text('Value inventory in the books'), onPressed: busy ? null : () => propose('Value inventory today', 'value_inventory', const {})),
                        ],
                      ),
                      const SizedBox(height: 22),
                      const SectionLabel('GST registrations'),
                      Panel(
                        children: [
                          for (final reg in registrations)
                            RowCard(
                              leading: TintTile(tint: reg['effectiveTo'] != null && '${reg['effectiveTo']}'.isNotEmpty ? Tint.ask : Tint.taxes, mark: Mark.taxes),
                              title: '${reg['label']} · ${reg['gstin'] ?? 'no GSTIN'}',
                              subtitle: '${reg['stateName'] ?? ''} · ${_num(reg['invoices']).toInt()} invoices, ${_num(reg['purchases']).toInt()} bills${'${reg['effectiveTo'] ?? ''}'.isNotEmpty ? ' · retired ${reg['effectiveTo']}' : ''}',
                            ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      ActionChip(avatar: const Icon(Icons.add, size: 18), label: const Text('Add a registration'), onPressed: busy ? null : _addRegistration),
                      const SizedBox(height: 12),
                      Text('Every figure here comes from the reports you imported and your books; MyCA never estimates a payout or a margin.', style: text.bodySmall),
                      const SizedBox(height: 12),
                      for (final entry in entries) entry.toBubble(),
                    ],
                  ),
                );
              },
            ),
          ),
          if (pending != null) ProposalBar(busy: busy, onPost: postPending, onDiscard: discardPending),
        ],
      ),
    );
  }
}

class _MarketplaceData {
  const _MarketplaceData({required this.registrations, required this.settlements, required this.credits, required this.margins, required this.stock});

  final Map<String, dynamic> registrations;
  final Map<String, dynamic> settlements;
  final Map<String, dynamic> credits;
  final Map<String, dynamic> margins;
  final Map<String, dynamic> stock;
}

List<Map<String, dynamic>> _maps(Object? value) => [for (final row in (value as List? ?? const [])) if (row is Map) Map<String, dynamic>.from(row)];

num _num(Object? value) => value is num ? value : 0;

String _cap(String value) => value.isEmpty ? value : '${value[0].toUpperCase()}${value.substring(1)}';

class _RegistrationDraft {
  const _RegistrationDraft({required this.gstin, required this.kind, required this.label});

  final String gstin;
  final String kind;
  final String label;
}

class _RegistrationSheet extends StatefulWidget {
  const _RegistrationSheet();

  @override
  State<_RegistrationSheet> createState() => _RegistrationSheetState();
}

class _RegistrationSheetState extends State<_RegistrationSheet> {
  final _gstin = TextEditingController();
  final _label = TextEditingController();
  String _kind = 'apob';
  String _error = '';

  @override
  void dispose() {
    _gstin.dispose();
    _label.dispose();
    super.dispose();
  }

  void _done() {
    final gstin = _gstin.text.replaceAll(RegExp(r'\s+'), '').toUpperCase();
    if (!RegExp(r'^[0-9]{2}[A-Z0-9]{13}$').hasMatch(gstin)) return setState(() => _error = 'A GSTIN is fifteen characters, for example 29AABCU9603R1ZW.');
    Navigator.of(context).pop(_RegistrationDraft(gstin: gstin, kind: _kind, label: _label.text.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(22, 4, 22, 22 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Add a GST registration', style: text.headlineSmall),
            const SizedBox(height: 4),
            Text('A warehouse or branch of this business in another state, registered under the same PAN.', style: text.bodyMedium),
            const SizedBox(height: 14),
            TextField(controller: _gstin, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'GSTIN')),
            const SizedBox(height: 10),
            SegmentedButton<String>(
              segments: const [ButtonSegment(value: 'apob', label: Text('Marketplace warehouse')), ButtonSegment(value: 'warehouse', label: Text('Own warehouse')), ButtonSegment(value: 'branch', label: Text('Branch'))],
              selected: {_kind},
              onSelectionChanged: (set) => setState(() => _kind = set.first),
            ),
            const SizedBox(height: 10),
            TextField(controller: _label, decoration: const InputDecoration(labelText: 'Name (optional)', hintText: 'Amazon BLR')),
            if (_error.isNotEmpty) ...[const SizedBox(height: 8), Text(_error, style: text.bodySmall?.copyWith(color: Palette.danger))],
            const SizedBox(height: 18),
            SizedBox(width: double.infinity, child: FilledButton(onPressed: _done, child: const Text('Preview'))),
          ],
        ),
      ),
    );
  }
}

class _CostDraft {
  const _CostDraft({required this.sku, required this.cost, required this.gstRate, required this.hsn});

  final String sku;
  final num cost;
  final num? gstRate;
  final String hsn;
}

class _CostSheet extends StatefulWidget {
  const _CostSheet();

  @override
  State<_CostSheet> createState() => _CostSheetState();
}

class _CostSheetState extends State<_CostSheet> {
  final _sku = TextEditingController();
  final _cost = TextEditingController();
  final _rate = TextEditingController();
  final _hsn = TextEditingController();
  String _error = '';

  @override
  void dispose() {
    _sku.dispose();
    _cost.dispose();
    _rate.dispose();
    _hsn.dispose();
    super.dispose();
  }

  void _done() {
    final sku = _sku.text.trim().toUpperCase();
    final cost = parseAmount(_cost.text);
    if (sku.isEmpty) return setState(() => _error = 'Say which SKU.');
    if (cost == null || cost < 0) return setState(() => _error = 'The cost is the landed price per unit.');
    final rate = _rate.text.trim().isEmpty ? null : num.tryParse(_rate.text.replaceAll('%', '').trim());
    Navigator.of(context).pop(_CostDraft(sku: sku, cost: cost, gstRate: rate, hsn: _hsn.text.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(22, 4, 22, 22 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Cost of a SKU', style: text.headlineSmall),
            const SizedBox(height: 14),
            TextField(controller: _sku, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'SKU')),
            const SizedBox(height: 10),
            TextField(controller: _cost, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Cost per unit', prefixText: '₹ ')),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: TextField(controller: _rate, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'GST rate % (optional)'))),
                const SizedBox(width: 10),
                Expanded(child: TextField(controller: _hsn, decoration: const InputDecoration(labelText: 'HSN (optional)'))),
              ],
            ),
            if (_error.isNotEmpty) ...[const SizedBox(height: 8), Text(_error, style: text.bodySmall?.copyWith(color: Palette.danger))],
            const SizedBox(height: 18),
            SizedBox(width: double.infinity, child: FilledButton(onPressed: _done, child: const Text('Preview'))),
          ],
        ),
      ),
    );
  }
}

class _StockDraft {
  const _StockDraft({required this.sku, required this.qty, required this.location, required this.fromGstin, required this.toGstin});

  final String sku;
  final num qty;
  final String location;
  final String fromGstin;
  final String toGstin;
}

class _StockSheet extends StatefulWidget {
  const _StockSheet({required this.registrations});

  final List<Map<String, dynamic>> registrations;

  @override
  State<_StockSheet> createState() => _StockSheetState();
}

class _StockSheetState extends State<_StockSheet> {
  final _sku = TextEditingController();
  final _qty = TextEditingController();
  final _location = TextEditingController(text: 'own');
  bool _transfer = false;
  String _from = '';
  String _to = '';
  String _error = '';

  @override
  void initState() {
    super.initState();
    final active = widget.registrations.where((reg) => '${reg['effectiveTo'] ?? ''}'.isEmpty).toList();
    if (active.isNotEmpty) _from = '${active.first['gstin'] ?? ''}';
    if (active.length > 1) _to = '${active[1]['gstin'] ?? ''}';
  }

  @override
  void dispose() {
    _sku.dispose();
    _qty.dispose();
    _location.dispose();
    super.dispose();
  }

  void _done() {
    final sku = _sku.text.trim().toUpperCase();
    final qty = num.tryParse(_qty.text.trim());
    if (sku.isEmpty) return setState(() => _error = 'Say which SKU.');
    if (qty == null || qty <= 0) return setState(() => _error = 'A quantity is a number above zero.');
    if (_transfer && (_from.isEmpty || _to.isEmpty || _from == _to)) return setState(() => _error = 'Choose two different registrations.');
    Navigator.of(context).pop(_StockDraft(sku: sku, qty: qty, location: _location.text.trim().toLowerCase(), fromGstin: _transfer ? _from : '', toGstin: _transfer ? _to : ''));
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final active = widget.registrations.where((reg) => '${reg['effectiveTo'] ?? ''}'.isEmpty).toList();
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(22, 4, 22, 22 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_transfer ? 'Transfer stock between registrations' : 'Stock in', style: text.headlineSmall),
            const SizedBox(height: 10),
            SegmentedButton<bool>(
              segments: const [ButtonSegment(value: false, label: Text('Stock in')), ButtonSegment(value: true, label: Text('Transfer'))],
              selected: {_transfer},
              onSelectionChanged: active.length > 1 ? (set) => setState(() => _transfer = set.first) : null,
            ),
            const SizedBox(height: 10),
            TextField(controller: _sku, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'SKU')),
            const SizedBox(height: 10),
            TextField(controller: _qty, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Quantity')),
            const SizedBox(height: 10),
            if (!_transfer) TextField(controller: _location, decoration: const InputDecoration(labelText: 'Location', hintText: 'own, amazon, flipkart, a warehouse name')),
            if (_transfer) ...[
              DropdownButtonFormField<String>(
                initialValue: _from.isEmpty ? null : _from,
                decoration: const InputDecoration(labelText: 'From'),
                items: [for (final reg in active) DropdownMenuItem(value: '${reg['gstin']}', child: Text('${reg['label']} ${reg['gstin']}'))],
                onChanged: (value) => setState(() => _from = value ?? ''),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: _to.isEmpty ? null : _to,
                decoration: const InputDecoration(labelText: 'To'),
                items: [for (final reg in active) DropdownMenuItem(value: '${reg['gstin']}', child: Text('${reg['label']} ${reg['gstin']}'))],
                onChanged: (value) => setState(() => _to = value ?? ''),
              ),
              const SizedBox(height: 6),
              Text('At cost, with IGST under the sending registration and credit under the receiving one; the two are settled by contra.', style: text.bodySmall),
            ],
            if (_error.isNotEmpty) ...[const SizedBox(height: 8), Text(_error, style: text.bodySmall?.copyWith(color: Palette.danger))],
            const SizedBox(height: 18),
            SizedBox(width: double.infinity, child: FilledButton(onPressed: _done, child: const Text('Preview'))),
          ],
        ),
      ),
    );
  }
}
