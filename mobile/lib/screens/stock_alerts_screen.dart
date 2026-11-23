import 'package:flutter/material.dart';

import '../widgets.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../india/india_strings.dart';

class StockAlertsScreen extends StatefulWidget {
  const StockAlertsScreen({super.key});

  @override
  State<StockAlertsScreen> createState() => _StockAlertsScreenState();
}

class _StockAlertsScreenState extends State<StockAlertsScreen> {
  Map<String, dynamic>? _data;
  String _message = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_data == null && _message.isEmpty) _load();
  }

  Future<void> _load() async {
    try {
      final data = loadedData(await AppScope.of(context).api.query('stock_alerts', const {}));
      if (mounted) setState(() => _data = data);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _message = err.message.isEmpty ? inText(context, 'Could not load.') : err.message);
    }
  }

  List<Map<String, dynamic>> _rows(String key) {
    final list = _data?[key];
    return list is List ? [for (final row in list) if (row is Map) Map<String, dynamic>.from(row)] : const [];
  }

  String _unit(Map<String, dynamic> row) => '${row['unit'] ?? ''}'.isEmpty ? '' : ' ${row['unit']}';

  String _name(Map<String, dynamic> row) => '${row['name'] ?? ''}'.isEmpty ? '${row['sku']}' : '${row['name']} (${row['sku']})';

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final data = _data;
    final expired = _rows('expired');
    final expiring = _rows('expiring');
    final low = _rows('lowStock');
    return Scaffold(
      appBar: AppBar(title: Text(inText(context, 'Expiring soon and low stock'))),
      body: data == null
          ? _message.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : LoadFailed(
                  key: const Key('alerts-message'),
                  message: _message,
                  onRetry: () {
                    setState(() => _message = '');
                    _load();
                  },
                )
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                children: [
                  if (expired.isEmpty && expiring.isEmpty && low.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 24),
                      child: Text(inText(context, 'Nothing expires in the next 30 days and nothing is below its low-stock level.'), key: const Key('alerts-empty'), textAlign: TextAlign.center, style: text.bodyMedium),
                    ),
                  if (expired.isNotEmpty) ...[
                    Text(inText(context, 'Expired, still on hand'), style: text.titleMedium),
                    for (final row in expired)
                      Card(
                        child: ListTile(
                          leading: Icon(Icons.dangerous_outlined, color: Theme.of(context).colorScheme.error),
                          title: Text(_name(row)),
                          subtitle: Text('${inText(context, 'Batch')} ${row['batch']} · ${row['qty']}${_unit(row)} · ${inText(context, 'Expired on')} ${row['expiry']}'),
                        ),
                      ),
                    const SizedBox(height: 12),
                  ],
                  if (expiring.isNotEmpty) ...[
                    Text(inText(context, 'Expiring in 30 days'), style: text.titleMedium),
                    for (final row in expiring)
                      Card(
                        child: ListTile(
                          leading: const Icon(Icons.event_outlined),
                          title: Text(_name(row)),
                          subtitle: Text('${inText(context, 'Batch')} ${row['batch']} · ${row['qty']}${_unit(row)} · ${inText(context, 'Expires on')} ${row['expiry']}'),
                          trailing: Text('${row['daysLeft']} ${inText(context, 'days')}'),
                        ),
                      ),
                    const SizedBox(height: 12),
                  ],
                  if (low.isNotEmpty) ...[
                    Text(inText(context, 'Low stock'), style: text.titleMedium),
                    for (final row in low)
                      Card(
                        child: ListTile(
                          leading: const Icon(Icons.trending_down),
                          title: Text(_name(row)),
                          subtitle: Text('${row['onHand']}${_unit(row)} ${inText(context, 'left')} · ${inText(context, 'alert at')} ${row['reorderLevel']}${(row['onOrder'] is num && (row['onOrder'] as num) > 0) ? ' · ${row['onOrder']} ${inText(context, 'on order')}' : ''}'),
                        ),
                      ),
                  ],
                ],
              ),
            ),
    );
  }
}
