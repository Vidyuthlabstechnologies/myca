import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../india/india_strings.dart';
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
    final channel = await _pickChannel(inText(context, 'Which channel paid out?'));
    if (channel == null || !mounted) return;
    await _importFile('import_settlement', inFormat(context, 'Import the {channel} settlement', {'channel': channel}), extra: {'channel': channel});
  }

  Future<void> _importOrders() async {
    final channel = await _pickChannel(inText(context, 'Which channel\'s orders?'));
    if (channel == null || !mounted) return;
    await _importFile('import_marketplace_orders', inFormat(context, 'Import {channel} orders', {'channel': channel}), extra: {'channel': channel});
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
              Text(inFormat(context, '{sku} at {location}', {'sku': sku, 'location': location}), style: text.headlineSmall),
              Text(inFormat(context, '{qty} on hand', {'qty': data['onHand'] ?? 0}), style: text.bodyMedium),
              const SizedBox(height: 10),
              if (moves.isEmpty) Text(inText(context, 'No movement recorded yet.'), style: text.bodyMedium),
              for (final move in moves.take(20))
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(inFormat(context, '{qty} on {date}', {'qty': '${_num(move['qty']) > 0 ? '+' : ''}${move['qty']}', 'date': longDate('${move['date']}')})),
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
    await propose(inFormat(context, 'Add registration {gstin}', {'gstin': draft.gstin}), 'set_registration', {'gstin': draft.gstin, 'kind': draft.kind, if (draft.label.isNotEmpty) 'label': draft.label});
  }

  Future<void> _setCost() async {
    final draft = await showModalBottomSheet<_CostDraft>(context: context, isScrollControlled: true, builder: (_) => const _CostSheet());
    if (draft == null || !mounted) return;
    await propose(inFormat(context, 'Cost of {sku} is ₹{cost}', {'sku': draft.sku, 'cost': draft.cost}), 'set_sku_cost', {'sku': draft.sku, 'cost': draft.cost, if (draft.gstRate != null) 'gstRate': draft.gstRate, if (draft.hsn.isNotEmpty) 'hsn': draft.hsn});
  }

  Future<void> _stockIn(List<Map<String, dynamic>> registrations) async {
    final draft = await showModalBottomSheet<_StockDraft>(context: context, isScrollControlled: true, builder: (_) => _StockSheet(registrations: registrations));
    if (draft == null || !mounted) return;
    if (draft.toGstin.isEmpty) {
      await propose(inFormat(context, 'Stock in {qty} of {sku} at {location}', {'qty': draft.qty, 'sku': draft.sku, 'location': draft.location}), 'record_stock', {'sku': draft.sku, 'qty': draft.qty, 'location': draft.location});
    } else {
      await propose(inFormat(context, 'Transfer {qty} of {sku} to {gstin}', {'qty': draft.qty, 'sku': draft.sku, 'gstin': draft.toGstin}), 'record_stock_transfer', {'sku': draft.sku, 'qty': draft.qty, 'fromGstin': draft.fromGstin, 'toGstin': draft.toGstin});
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(inText(context, 'Marketplace'))),
      body: Column(
        children: [
          Expanded(
            child: FutureBuilder<_MarketplaceData>(
              future: _data,
              builder: (context, snap) {
                final data = snap.data;
                if (data == null) {
                  if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
                  return Center(child: FilledButton(onPressed: _reload, child: Text(inText(context, 'Try again'))));
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
                      SectionLabel(inText(context, 'Payouts')),
                      Panel(
                        children: [
                          if (byChannel.isEmpty)
                            RowCard(leading: const TintTile(tint: Tint.ask, mark: Mark.bringIn), title: inText(context, 'No settlement imported yet'), subtitle: inText(context, 'Import a payout report from Amazon, Flipkart or your gateway')),
                          for (final entry in byChannel.entries)
                            RowCard(
                              leading: TintTile(tint: _num(entry.value['short']) > 0 || _num(entry.value['unmatched']) > 0 ? Tint.urgent : Tint.sales, mark: Mark.bringIn),
                              title: inFormat(context, '{channel}: expected {expected}, paid {paid}', {'channel': _cap(entry.key), 'expected': rupees(_num(entry.value['expected'])), 'paid': rupees(_num(entry.value['paid']))}),
                              subtitle: [
                                if (_num(entry.value['short']) > 0) inFormat(context, 'short {amount}', {'amount': rupees(_num(entry.value['short']))}),
                                if (_num(entry.value['unmatched']) > 0) inCount(context, _num(entry.value['unmatched']).toInt(), '1 not in the bank yet', '{n} not in the bank yet'),
                                if (_num(entry.value['penalties']) > 0) inFormat(context, 'penalties {amount}', {'amount': rupees(_num(entry.value['penalties']))}),
                                inFormat(context, 'TCS {tcs}, TDS {tds} to claim', {'tcs': rupees(_num(entry.value['tcs'])), 'tds': rupees(_num(entry.value['tds']))}),
                              ].join(' · '),
                            ),
                          for (final row in settlementRows.take(5))
                            RowCard(
                              leading: TintTile(tint: row['status'] == 'matched' ? Tint.ask : Tint.urgent, mark: row['status'] == 'matched' ? Mark.confirm : Mark.urgent),
                              title: '${row['id']} ${_cap('${row['channel']}')} ${row['settlementId']}: ${rupees(_num(row['expected']))}',
                              subtitle: [
                                inFormat(context, '{from} to {to}', {'from': longDate('${row['from']}'), 'to': longDate('${row['to']}')}),
                                inFormat(context, '{n} orders', {'n': _num(row['orders']).toInt()}),
                                switch (row['status']) {
                                  'matched' => inText(context, 'paid in full'),
                                  'short' => inFormat(context, 'short {amount}', {'amount': rupees(_num(row['shortfall']))}),
                                  'over' => inText(context, 'overpaid'),
                                  _ => inText(context, 'not in the bank yet'),
                                },
                              ].join(' · '),
                            ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          ActionChip(avatar: const Icon(Icons.upload_file, size: 18), label: Text(inText(context, 'Import settlement')), onPressed: busy ? null : _importSettlement),
                          ActionChip(avatar: const Icon(Icons.upload_file, size: 18), label: Text(inText(context, 'Import orders')), onPressed: busy ? null : _importOrders),
                        ],
                      ),
                      const SizedBox(height: 22),
                      SectionLabel(inText(context, 'TCS and TDS 194-O')),
                      Panel(
                        children: [
                          RowCard(
                            leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
                            title: inFormat(context, 'GST TCS: {recorded} deducted, {reported} confirmed', {'recorded': rupees(_num(creditTotals['tcsRecorded'])), 'reported': rupees(_num(creditTotals['tcsReported']))}),
                            subtitle: inFormat(context, '{amount} available for the next GST payment', {'amount': rupees(_num(creditTotals['tcsAvailable']))}),
                          ),
                          RowCard(
                            leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
                            title: inFormat(context, 'TDS 194-O: {recorded} deducted, {confirmed} in 26AS', {'recorded': rupees(_num(creditTotals['tdsRecorded'])), 'confirmed': rupees(_num(creditTotals['tdsIn26as']))}),
                            subtitle: inText(context, 'Credit against income tax once Form 26AS confirms it'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          ActionChip(avatar: const Icon(Icons.upload_file, size: 18), label: Text(inText(context, 'Import TCS statement')), onPressed: busy ? null : () => _importFile('import_tcs_statement', inText(context, 'Import the TCS statement'))),
                          ActionChip(avatar: const Icon(Icons.upload_file, size: 18), label: Text(inText(context, 'Import 26AS')), onPressed: busy ? null : () => _importFile('import_26as_credits', inText(context, 'Import Form 26AS'))),
                        ],
                      ),
                      const SizedBox(height: 22),
                      SectionLabel(inText(context, 'Margins by SKU')),
                      Panel(
                        children: [
                          if (marginRows.isEmpty)
                            RowCard(leading: const TintTile(tint: Tint.ask, mark: Mark.sales), title: inText(context, 'No marketplace orders yet'), subtitle: inText(context, 'Import an order report and set SKU costs to see margins')),
                          if (marginRows.isNotEmpty)
                            RowCard(
                              leading: TintTile(tint: _num(marginTotals['margin']) < 0 ? Tint.urgent : Tint.sales, mark: Mark.sales),
                              title: inFormat(context, 'Margin {margin} on net sales {net}', {'margin': rupees(_num(marginTotals['margin'])), 'net': rupees(_num(marginTotals['net']))}),
                              subtitle: inFormat(context, 'fees {fees} · cost of goods {cogs}', {'fees': rupees(_num(marginTotals['fees'])), 'cogs': rupees(_num(marginTotals['cogs']))}),
                            ),
                          for (final row in marginRows.take(6))
                            RowCard(
                              leading: TintTile(tint: _num(row['margin']) < 0 ? Tint.urgent : Tint.ask, mark: _num(row['margin']) < 0 ? Mark.urgent : Mark.comingUp),
                              title: '${inFormat(context, '{sku} on {channel}: {margin}', {'sku': row['sku'], 'channel': row['channel'], 'margin': rupees(_num(row['margin']))})}${row['marginPercent'] != null ? ' (${row['marginPercent']}%)' : ''}',
                              subtitle: row['costMissing'] == true
                                  ? inText(context, 'No cost set yet')
                                  : inFormat(context, '{units} units · net {net} · fees {fees}', {'units': _num(row['units']).toInt(), 'net': rupees(_num(row['net'])), 'fees': rupees(_num(row['fees']))}),
                            ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          ActionChip(avatar: const Icon(Icons.price_change_outlined, size: 18), label: Text(inText(context, 'Set a cost')), onPressed: busy ? null : _setCost),
                          ActionChip(avatar: const Icon(Icons.upload_file, size: 18), label: Text(inText(context, 'Import costs')), onPressed: busy ? null : () => _importFile('import_sku_costs', inText(context, 'Import SKU costs'))),
                        ],
                      ),
                      const SizedBox(height: 22),
                      SectionLabel(inText(context, 'Stock')),
                      Panel(
                        children: [
                          if (stockRows.isEmpty)
                            RowCard(leading: const TintTile(tint: Tint.ask, mark: Mark.purchases), title: inText(context, 'No stock recorded'), subtitle: inText(context, 'Orders move stock out; record what you hold or send to a warehouse')),
                          for (final row in stockRows.take(8))
                            RowCard(
                              leading: TintTile(tint: _num(row['qty']) < 0 ? Tint.urgent : Tint.purchases, mark: Mark.purchases),
                              title: inFormat(context, '{sku} at {location}: {qty}', {'sku': row['sku'], 'location': row['location'], 'qty': row['qty']}),
                              subtitle: row['value'] != null ? inFormat(context, 'worth {amount} at cost', {'amount': rupees(_num(row['value']))}) : inText(context, 'no cost set'),
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
                          ActionChip(avatar: const Icon(Icons.move_down, size: 18), label: Text(inText(context, 'Stock in or transfer')), onPressed: busy ? null : () => _stockIn(registrations)),
                          ActionChip(avatar: const Icon(Icons.account_balance_outlined, size: 18), label: Text(inText(context, 'Value inventory in the books')), onPressed: busy ? null : () => propose(inText(context, 'Value inventory today'), 'value_inventory', const {})),
                        ],
                      ),
                      const SizedBox(height: 22),
                      SectionLabel(inText(context, 'GST registrations')),
                      Panel(
                        children: [
                          for (final reg in registrations)
                            RowCard(
                              leading: TintTile(tint: reg['effectiveTo'] != null && '${reg['effectiveTo']}'.isNotEmpty ? Tint.ask : Tint.taxes, mark: Mark.taxes),
                              title: '${reg['label']} · ${reg['gstin'] ?? inText(context, 'no GSTIN')}',
                              subtitle: [
                                '${reg['stateName'] ?? ''}',
                                inFormat(context, '{invoices} invoices, {bills} bills', {'invoices': _num(reg['invoices']).toInt(), 'bills': _num(reg['purchases']).toInt()}),
                                if ('${reg['effectiveTo'] ?? ''}'.isNotEmpty) inFormat(context, 'retired {date}', {'date': reg['effectiveTo']}),
                              ].join(' · '),
                            ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      ActionChip(avatar: const Icon(Icons.add, size: 18), label: Text(inText(context, 'Add a registration')), onPressed: busy ? null : _addRegistration),
                      const SizedBox(height: 12),
                      Text(inText(context, 'Every figure here comes from the reports you imported and your books; MyCA never estimates a payout or a margin.'), style: text.bodySmall),
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
    if (!RegExp(r'^[0-9]{2}[A-Z0-9]{13}$').hasMatch(gstin)) return setState(() => _error = inText(context, 'A GSTIN is fifteen characters, for example 29AABCU9603R1ZW.'));
    Navigator.of(context).pop(_RegistrationDraft(gstin: gstin, kind: _kind, label: _label.text.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(22, 4, 22, 22 + MediaQuery.of(context).viewInsets.bottom),
        child: SingleChildScrollView(child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(inText(context, 'Add a GST registration'), style: text.headlineSmall),
            const SizedBox(height: 4),
            Text(inText(context, 'A warehouse or branch of this business in another state, registered under the same PAN.'), style: text.bodyMedium),
            const SizedBox(height: 14),
            TextField(controller: _gstin, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'GSTIN')),
            const SizedBox(height: 10),
            SegmentedButton<String>(
              segments: [
                ButtonSegment(value: 'apob', label: Text(inText(context, 'Marketplace warehouse'))),
                ButtonSegment(value: 'warehouse', label: Text(inText(context, 'Own warehouse'))),
                ButtonSegment(value: 'branch', label: Text(inText(context, 'Branch'))),
              ],
              selected: {_kind},
              onSelectionChanged: (set) => setState(() => _kind = set.first),
            ),
            const SizedBox(height: 10),
            TextField(controller: _label, decoration: InputDecoration(labelText: inText(context, 'Name (optional)'), hintText: 'Amazon BLR')),
            if (_error.isNotEmpty) ...[const SizedBox(height: 8), Text(_error, style: text.bodySmall?.copyWith(color: Palette.danger))],
            const SizedBox(height: 18),
            SizedBox(width: double.infinity, child: FilledButton(onPressed: _done, child: Text(inText(context, 'Preview')))),
          ],
        )),
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
    if (sku.isEmpty) return setState(() => _error = inText(context, 'Say which SKU.'));
    if (cost == null || cost < 0) return setState(() => _error = inText(context, 'The cost is the landed price per unit.'));
    final rate = _rate.text.trim().isEmpty ? null : num.tryParse(_rate.text.replaceAll('%', '').trim());
    Navigator.of(context).pop(_CostDraft(sku: sku, cost: cost, gstRate: rate, hsn: _hsn.text.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(22, 4, 22, 22 + MediaQuery.of(context).viewInsets.bottom),
        child: SingleChildScrollView(child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(inText(context, 'Cost of a SKU'), style: text.headlineSmall),
            const SizedBox(height: 14),
            TextField(controller: _sku, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'SKU')),
            const SizedBox(height: 10),
            TextField(controller: _cost, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: inText(context, 'Cost per unit'), prefixText: '₹ ')),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: TextField(controller: _rate, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: inText(context, 'GST rate % (optional)')))),
                const SizedBox(width: 10),
                Expanded(child: TextField(controller: _hsn, decoration: InputDecoration(labelText: inText(context, 'HSN (optional)')))),
              ],
            ),
            if (_error.isNotEmpty) ...[const SizedBox(height: 8), Text(_error, style: text.bodySmall?.copyWith(color: Palette.danger))],
            const SizedBox(height: 18),
            SizedBox(width: double.infinity, child: FilledButton(onPressed: _done, child: Text(inText(context, 'Preview')))),
          ],
        )),
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
    if (sku.isEmpty) return setState(() => _error = inText(context, 'Say which SKU.'));
    if (qty == null || qty <= 0) return setState(() => _error = inText(context, 'A quantity is a number above zero.'));
    if (_transfer && (_from.isEmpty || _to.isEmpty || _from == _to)) return setState(() => _error = inText(context, 'Choose two different registrations.'));
    Navigator.of(context).pop(_StockDraft(sku: sku, qty: qty, location: _location.text.trim().toLowerCase(), fromGstin: _transfer ? _from : '', toGstin: _transfer ? _to : ''));
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final active = widget.registrations.where((reg) => '${reg['effectiveTo'] ?? ''}'.isEmpty).toList();
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(22, 4, 22, 22 + MediaQuery.of(context).viewInsets.bottom),
        child: SingleChildScrollView(child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_transfer ? inText(context, 'Transfer stock between registrations') : inText(context, 'Stock in'), style: text.headlineSmall),
            const SizedBox(height: 10),
            SegmentedButton<bool>(
              segments: [ButtonSegment(value: false, label: Text(inText(context, 'Stock in'))), ButtonSegment(value: true, label: Text(inText(context, 'Transfer')))],
              selected: {_transfer},
              onSelectionChanged: active.length > 1 ? (set) => setState(() => _transfer = set.first) : null,
            ),
            const SizedBox(height: 10),
            TextField(controller: _sku, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'SKU')),
            const SizedBox(height: 10),
            TextField(controller: _qty, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: inText(context, 'Quantity'))),
            const SizedBox(height: 10),
            if (!_transfer) TextField(controller: _location, decoration: InputDecoration(labelText: inText(context, 'Location'), hintText: inText(context, 'own, amazon, flipkart, a warehouse name'))),
            if (_transfer) ...[
              DropdownButtonFormField<String>(
                isExpanded: true,
                initialValue: _from.isEmpty ? null : _from,
                decoration: InputDecoration(labelText: inText(context, 'From')),
                items: [for (final reg in active) DropdownMenuItem(value: '${reg['gstin']}', child: Text('${reg['label']} ${reg['gstin']}'))],
                onChanged: (value) => setState(() => _from = value ?? ''),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                isExpanded: true,
                initialValue: _to.isEmpty ? null : _to,
                decoration: InputDecoration(labelText: inText(context, 'To')),
                items: [for (final reg in active) DropdownMenuItem(value: '${reg['gstin']}', child: Text('${reg['label']} ${reg['gstin']}'))],
                onChanged: (value) => setState(() => _to = value ?? ''),
              ),
              const SizedBox(height: 6),
              Text(inText(context, 'At cost, with IGST under the sending registration and credit under the receiving one; the two are settled by contra.'), style: text.bodySmall),
            ],
            if (_error.isNotEmpty) ...[const SizedBox(height: 8), Text(_error, style: text.bodySmall?.copyWith(color: Palette.danger))],
            const SizedBox(height: 18),
            SizedBox(width: double.infinity, child: FilledButton(onPressed: _done, child: Text(inText(context, 'Preview')))),
          ],
        )),
      ),
    );
  }
}
