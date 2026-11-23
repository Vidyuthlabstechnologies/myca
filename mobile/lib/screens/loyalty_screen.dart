import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../india/loyalty_points.dart';
import '../widgets.dart';

String _plain(num value) => value == value.roundToDouble() ? value.toInt().toString() : value.toString();

Map<String, Object?> loyaltySettingsArgs({
  required bool enabled,
  required String earnPoints,
  required String earnPerRupees,
  required String earnOn,
  required String pointValue,
  required String minRedeemPoints,
  required String maxRedeemPercent,
  required String expiryMonths,
}) {
  num? number(String text) => num.tryParse(text.trim().replaceAll(',', ''));
  int? whole(String text) => int.tryParse(text.trim().replaceAll(',', ''));
  return {
    'enabled': enabled,
    if (whole(earnPoints) != null) 'earnPoints': whole(earnPoints),
    if (number(earnPerRupees) != null) 'earnPerRupees': number(earnPerRupees),
    'earnOn': earnOn,
    if (number(pointValue) != null) 'pointValue': number(pointValue),
    if (whole(minRedeemPoints) != null) 'minRedeemPoints': whole(minRedeemPoints),
    if (number(maxRedeemPercent) != null) 'maxRedeemPercent': number(maxRedeemPercent),
    if (whole(expiryMonths) != null) 'expiryMonths': whole(expiryMonths),
  };
}

class LoyaltyScreen extends StatefulWidget {
  const LoyaltyScreen({super.key});

  @override
  State<LoyaltyScreen> createState() => _LoyaltyScreenState();
}

class _LoyaltyScreenState extends State<LoyaltyScreen> {
  final _earnPoints = TextEditingController();
  final _earnPer = TextEditingController();
  final _pointValue = TextEditingController();
  final _minimum = TextEditingController();
  final _maxShare = TextEditingController();
  final _expiry = TextEditingController();
  bool _enabled = false;
  String _earnOn = 'taxable';
  bool _loading = true;
  String _loadError = '';
  bool _busy = false;
  String _message = '';
  ChatPreview? _preview;
  List<String> _blockers = const [];
  List<LoyaltyCustomer> _customers = const [];
  int _outstanding = 0;
  num _liability = 0;
  int _soon = 0;

  MycaApi get api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loading && !_busy) _load();
  }

  @override
  void dispose() {
    for (final c in [_earnPoints, _earnPer, _pointValue, _minimum, _maxShare, _expiry]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    _busy = true;
    try {
      final data = loadedData(await api.query('loyalty_balance', {}));
      if (!mounted) return;
      final rules = LoyaltyRules.fromJson(data['settings']);
      final rows = data['customers'];
      setState(() {
        _loadError = '';
        _enabled = rules.enabled;
        _earnOn = rules.earnOn;
        _earnPoints.text = _plain(rules.earnPoints);
        _earnPer.text = _plain(rules.earnPerRupees);
        _pointValue.text = _plain(rules.pointValue);
        _minimum.text = _plain(rules.minRedeemPoints);
        _maxShare.text = _plain(rules.maxRedeemPercent);
        _expiry.text = _plain(rules.expiryMonths);
        _customers = [if (rows is List) for (final row in rows) LoyaltyCustomer.fromJson(row)];
        _outstanding = (data['outstandingPoints'] is num ? data['outstandingPoints'] as num : 0).toInt();
        _liability = data['liability'] is num ? data['liability'] as num : 0;
        _soon = (data['expiringSoonPoints'] is num ? data['expiringSoonPoints'] as num : 0).toInt();
      });
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _loadError = err.message.isEmpty ? inText(context, 'Could not load.') : err.message);
    } finally {
      _busy = false;
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _propose() async {
    setState(() {
      _busy = true;
      _message = '';
    });
    try {
      final reply = await api.propose('loyalty_settings', loyaltySettingsArgs(
        enabled: _enabled,
        earnPoints: _earnPoints.text,
        earnPerRupees: _earnPer.text,
        earnOn: _earnOn,
        pointValue: _pointValue.text,
        minRedeemPoints: _minimum.text,
        maxRedeemPercent: _maxShare.text,
        expiryMonths: _expiry.text,
      ));
      if (!mounted) return;
      setState(() {
        _preview = reply.preview;
        _blockers = reply.blockers;
        if (reply.preview == null) _message = reply.reply;
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
      await _load();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _message = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openCustomer(LoyaltyCustomer row) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => AppScope(state: AppScope.of(context), child: _CustomerSheet(partyName: row.partyName)),
    );
    if (mounted) await _load();
  }

  Widget _number(Key key, TextEditingController controller, String label, {String? helper}) => Padding(
    padding: const EdgeInsets.only(top: 8),
    child: TextField(
      key: key,
      controller: controller,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      onChanged: (_) => setState(() => _preview = null),
      decoration: InputDecoration(labelText: label, helperText: helper),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(inText(context, 'Loyalty points'))),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _loadError.isNotEmpty
          ? LoadFailed(
              message: _loadError,
              onRetry: () {
                setState(() => _loading = true);
                _load();
              },
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              children: [
                Text(inText(context, 'Customers earn points on every bill and use them as a discount on a later bill. Walk-in sales earn nothing.'), style: text.bodyMedium),
                const SizedBox(height: 8),
                SwitchListTile(
                  key: const Key('loyalty-enabled'),
                  contentPadding: EdgeInsets.zero,
                  title: Text(inText(context, 'Loyalty points on')),
                  value: _enabled,
                  onChanged: (on) => setState(() {
                    _enabled = on;
                    _preview = null;
                  }),
                ),
                Row(
                  children: [
                    Expanded(child: _number(const Key('loyalty-earn-points'), _earnPoints, inText(context, 'Points earned'))),
                    const SizedBox(width: 10),
                    Expanded(child: _number(const Key('loyalty-earn-per'), _earnPer, inText(context, 'For every ₹'))),
                  ],
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    ChoiceChip(key: const Key('loyalty-on-taxable'), label: Text(inText(context, 'On the bill before GST')), selected: _earnOn == 'taxable', onSelected: (_) => setState(() => _earnOn = 'taxable')),
                    ChoiceChip(key: const Key('loyalty-on-total'), label: Text(inText(context, 'On the bill total')), selected: _earnOn == 'total', onSelected: (_) => setState(() => _earnOn = 'total')),
                  ],
                ),
                _number(const Key('loyalty-point-value'), _pointValue, inText(context, 'Value of one point (₹)')),
                _number(const Key('loyalty-minimum'), _minimum, inText(context, 'Fewest points used at a time')),
                _number(const Key('loyalty-max-share'), _maxShare, inText(context, 'Most of a bill points can pay (%)'), helper: inText(context, 'Of the bill before GST')),
                _number(const Key('loyalty-expiry'), _expiry, inText(context, 'Points expire after (months)'), helper: inText(context, '0 means points never expire')),
                const SizedBox(height: 12),
                if (_preview == null) FilledButton(key: const Key('loyalty-save'), onPressed: _busy ? null : _propose, child: Text(inText(context, 'Save settings'))),
                if (_blockers.isNotEmpty) for (final line in _blockers) Text(line, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                if (_preview != null) ...[
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(_preview!.summary, style: text.titleMedium, key: const Key('loyalty-preview')),
                          for (final effect in _preview!.effects) Text(effect, style: text.bodyMedium),
                        ],
                      ),
                    ),
                  ),
                  FilledButton(key: const Key('loyalty-confirm'), onPressed: _busy ? null : _confirm, child: Text(inText(context, 'Confirm'))),
                ],
                if (_message.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_message, key: const Key('loyalty-message'))),
                const SizedBox(height: 20),
                Text(inText(context, 'Customer points'), style: text.titleLarge),
                const SizedBox(height: 4),
                Text(
                  _customers.isEmpty
                      ? inText(context, 'No customer has points yet.')
                      : '$_outstanding ${inText(context, 'points held by customers, worth')} ${rupees(_liability)}.${_soon > 0 ? ' $_soon ${inText(context, 'expire in the next 30 days.')}' : ''}',
                  key: const Key('loyalty-liability'),
                  style: text.bodyMedium,
                ),
                for (final row in _customers)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(row.partyName),
                    subtitle: row.expiringSoon.isEmpty ? null : Text('${row.expiringSoon.first.points} ${inText(context, 'expire on')} ${longDate(row.expiringSoon.first.on)}'),
                    trailing: ConstrainedBox(
                      constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.4),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Amount('${row.balance} ${inText(context, 'points')}', style: text.bodyMedium, alignment: Alignment.centerRight),
                          Amount(rupees(row.value), style: text.bodySmall, alignment: Alignment.centerRight),
                        ],
                      ),
                    ),
                    onTap: () => _openCustomer(row),
                  ),
              ],
            ),
    );
  }
}

class _CustomerSheet extends StatefulWidget {
  const _CustomerSheet({required this.partyName});

  final String partyName;

  @override
  State<_CustomerSheet> createState() => _CustomerSheetState();
}

class _CustomerSheetState extends State<_CustomerSheet> {
  final _points = TextEditingController();
  final _reason = TextEditingController();
  LoyaltyCustomer? _customer;
  ChatPreview? _preview;
  List<String> _blockers = const [];
  String _message = '';
  bool _busy = false;

  MycaApi get api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_customer == null && !_busy) _load();
  }

  @override
  void dispose() {
    _points.dispose();
    _reason.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    _busy = true;
    try {
      final data = toolData(await api.query('loyalty_balance', {'partyName': widget.partyName}));
      if (mounted && data['customer'] is Map) setState(() => _customer = LoyaltyCustomer.fromJson(data['customer']));
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _message = err.message);
    } finally {
      _busy = false;
    }
  }

  Future<void> _propose() async {
    final points = int.tryParse(_points.text.trim());
    if (points == null || points == 0) return setState(() => _message = inText(context, 'Enter the points to add, or a minus sign to take points away.'));
    if (_reason.text.trim().isEmpty) return setState(() => _message = inText(context, 'Give the reason for the change.'));
    setState(() {
      _busy = true;
      _message = '';
    });
    try {
      final reply = await api.propose('loyalty_adjust', {'partyName': widget.partyName, 'points': points, 'reason': _reason.text.trim()});
      if (!mounted) return;
      setState(() {
        _preview = reply.preview;
        _blockers = reply.blockers;
        if (reply.preview == null) _message = reply.reply;
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
        _points.clear();
        _reason.clear();
      });
      await _load();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _message = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final customer = _customer;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(widget.partyName, style: text.titleLarge),
            if (customer != null) ...[
              Text('${customer.balance} ${inText(context, 'points')} · ${rupees(customer.value)}', key: const Key('loyalty-customer-balance'), style: text.titleMedium),
              for (final soon in customer.expiringSoon) Text('${soon.points} ${inText(context, 'expire on')} ${longDate(soon.on)}'),
              const SizedBox(height: 8),
              Text(customer.whatsapp, key: const Key('loyalty-whatsapp'), style: text.bodyMedium),
              OutlinedButton.icon(
                key: const Key('loyalty-send'),
                onPressed: () async {
                  final sent = await AppScope.of(context).shareText(customer.whatsapp);
                  if (mounted && !sent) setState(() => _message = inText(context, 'Could not open sharing on this phone.'));
                },
                icon: const Icon(Icons.send_outlined),
                label: Text(inText(context, 'Send balance on WhatsApp')),
              ),
            ],
            const SizedBox(height: 12),
            Text(inText(context, 'Add or take away points'), style: text.titleMedium),
            TextField(key: const Key('loyalty-adjust-points'), controller: _points, keyboardType: const TextInputType.numberWithOptions(signed: true), decoration: InputDecoration(labelText: inText(context, 'Points'), helperText: inText(context, 'Use a minus sign to take points away'))),
            TextField(key: const Key('loyalty-adjust-reason'), controller: _reason, maxLength: 200, decoration: InputDecoration(labelText: inText(context, 'Reason'))),
            if (_preview == null) FilledButton(key: const Key('loyalty-adjust'), onPressed: _busy ? null : _propose, child: Text(inText(context, 'Check the change'))),
            for (final line in _blockers) Text(line, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            if (_preview != null) ...[
              Text(_preview!.summary, key: const Key('loyalty-adjust-preview'), style: text.bodyLarge),
              for (final effect in _preview!.effects) Text(effect, style: text.bodySmall),
              FilledButton(key: const Key('loyalty-adjust-confirm'), onPressed: _busy ? null : _confirm, child: Text(inText(context, 'Confirm'))),
            ],
            if (_message.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_message, key: const Key('loyalty-adjust-message'))),
          ],
        ),
      ),
    );
  }
}
