import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../theme.dart';
import '../widgets.dart';

const connectorHelp = {
  'plaid': 'Sign up at dashboard.plaid.com; the Sandbox is free. Open Developers → Keys and copy the client_id and the Sandbox secret. Save them with environment sandbox, then connect your bank. Pulled transactions land as a bank statement file with a reminder; import it from Documents.',
  'taxjar': 'Sign up at app.taxjar.com and open Account → API Access. Generate a Sandbox token, or use the live token with environment production. Save it, then look up a rate below; MyCA records the combined rate for that jurisdiction from today.',
  'gusto': 'Create a developer account at dev.gusto.com and add an application. Copy its Client ID and Client Secret, save them here with environment demo, then tap Connect Gusto and allow the app in the browser. Gusto sends the browser back to MyCA; tap Refresh when you return. Processed payrolls land as a CSV with a reminder.',
  'track1099': 'Sign up at track1099.com; test mode needs no payment. Turn on two-factor sign-in, then open the Account page, API tab: copy the API token and the Team API ID shown beneath it. Until the Track1099 API routes are confirmed, MyCA files nothing through it; the 1099-NEC figures come from the 1099 screen as a file you upload to Track1099.',
  'amazon': 'Seller Central → Apps and Services → Develop apps: create a private SP-API app, note the LWA client id and secret, and authorise it to get the refresh token. Marketplace id is A21TJRUUN4KGV for India; region IN.',
  'shopify': 'Shopify admin → Settings → Apps and sales channels → Develop apps: create an app with read_orders and read_shopify_payments_payouts, install it, and copy the Admin API access token. Shop domain is the myshopify.com host.',
  'razorpay': 'Razorpay dashboard → Account & Settings → API Keys: generate the key id and secret (test or live).',
  'zoho': 'Zoho API console → Self Client: create a client, generate a code for ZohoBooks.fullaccess.all, exchange it for a refresh token; org id from Zoho Books settings; dc is in for India.',
};

const connectorFieldLabels = {
  'clientId': 'Client id',
  'clientSecret': 'Client secret',
  'refreshToken': 'Refresh token',
  'marketplaceId': 'Marketplace id',
  'region': 'Region',
  'shopDomain': 'Shop domain',
  'accessToken': 'Access token',
  'keyId': 'Key id',
  'keySecret': 'Key secret',
  'orgId': 'Organisation id',
  'dc': 'Data centre',
  'secret': 'Secret',
  'environment': 'Environment',
  'apiToken': 'API token',
  'apiKey': 'API token',
  'teamApiId': 'Team API ID',
  'testMode': 'Test mode (true/false)',
  'redirectUri': 'Redirect URI',
  'apiSecret': 'API secret',
  'username': 'API user name',
  'password': 'API password',
  'gstin': 'GSTIN',
  'publicKeyPem': 'NIC public key (paste the .pem text)',
};

const machineManagedFields = {'accessToken', 'refreshToken', 'itemId', 'cursor', 'oauthState', 'companyUuid'};

const connectorEnvironments = {
  'plaid': ['sandbox', 'development', 'production'],
  'taxjar': ['sandbox', 'production'],
  'gusto': ['demo', 'production'],
  'quicko': ['sandbox', 'production'],
  'nic': ['sandbox', 'production'],
};

const modeChannels = {'quicko', 'nic'};

String environmentLabel(String channel, String choice) {
  if (!modeChannels.contains(channel)) return choice;
  return choice == 'production' ? 'Live (real portal)' : 'Test (sandbox)';
}

const connectorPullLabels = {
  'plaid': 'Pull transactions',
  'gusto': 'Pull payroll summaries',
  'amazon': 'Pull settlement',
  'shopify': 'Pull payouts',
  'razorpay': 'Pull settlements',
};

const oauthChannels = {'plaid', 'gusto'};

List<String> editableFields(ConnectorView view) => [
      for (final field in view.fields)
        if (!oauthChannels.contains(view.channel) || !machineManagedFields.contains(field)) field,
    ];

String connectorStatus(ConnectorView view) {
  if (!view.configured) return 'Not connected';
  return view.enabled ? 'Connected' : 'Saved, paused';
}

class ConnectorsScreen extends StatefulWidget {
  const ConnectorsScreen({super.key});

  @override
  State<ConnectorsScreen> createState() => _ConnectorsScreenState();
}

class _ConnectorsScreenState extends State<ConnectorsScreen> {
  ConnectorList? _list;
  String _error = '';
  bool _loading = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_list == null && !_loading && _error.isEmpty) _reload();
  }

  Future<void> _reload() async {
    final cloud = AppScope.of(context).cloud!;
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final list = await cloud.listConnectors();
      if (mounted) setState(() => _list = list);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _replace(ConnectorView view) {
    final list = _list;
    if (list == null) return;
    setState(() {
      _list = ConnectorList(
        pulls: list.pulls,
        connectors: [for (final c in list.connectors) c.channel == view.channel ? view : c],
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final state = AppScope.of(context);
    final country = state.snapshot?.company.country ?? 'IN';
    final list = _list;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Connections to banks and apps'),
        actions: [
          IconButton(tooltip: 'Refresh', onPressed: _loading ? null : _reload, icon: const Icon(Icons.refresh, size: 22)),
        ],
      ),
      body: list == null
          ? Center(
              child: _error.isEmpty
                  ? const CircularProgressIndicator()
                  : Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text(_error, textAlign: TextAlign.center, style: text.bodyMedium?.copyWith(color: Palette.danger)),
                    ),
            )
          : ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                Text(
                  country == 'US'
                      ? 'Your bank, sales tax rates, payroll and 1099 filing. Keys stay on the MyCA server, encrypted; nothing posts to the books without you.'
                      : 'Marketplaces, payment gateways and Zoho Books. Keys stay on the MyCA server, encrypted; nothing posts to the books without you.',
                  style: text.bodyMedium,
                ),
                if (!list.pulls) ...[
                  const SizedBox(height: 8),
                  Text('Pulls are switched off on the service, so Pull now runs as a dry run.', style: text.bodyMedium?.copyWith(color: Palette.warn)),
                ],
                if (_error.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(_error, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
                ],
                for (final view in list.forCountry(country)) ...[
                  const SizedBox(height: 16),
                  ConnectorCard(
                    key: ValueKey(view.channel),
                    view: view,
                    onChanged: _replace,
                    onRefresh: _reload,
                  ),
                ],
              ],
            ),
    );
  }
}

class ConnectorCard extends StatefulWidget {
  const ConnectorCard({super.key, required this.view, required this.onChanged, required this.onRefresh});

  final ConnectorView view;
  final void Function(ConnectorView view) onChanged;
  final Future<void> Function() onRefresh;

  @override
  State<ConnectorCard> createState() => _ConnectorCardState();
}

class _ConnectorCardState extends State<ConnectorCard> {
  final _controllers = <String, TextEditingController>{};
  final _zip = TextEditingController();
  final _city = TextEditingController();
  final _state = TextEditingController();
  String _environment = '';
  String _status = '';
  bool _problem = false;
  bool _busy = false;

  ConnectorView get view => widget.view;

  @override
  void initState() {
    super.initState();
    for (final field in editableFields(view)) {
      _controllers[field] = TextEditingController(text: view.isSecret(field) ? '' : view.values[field] ?? '');
    }
    final choices = connectorEnvironments[view.channel];
    if (choices != null) {
      final current = view.values['environment'] ?? '';
      _environment = choices.contains(current) ? current : choices.first;
    }
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    _zip.dispose();
    _city.dispose();
    _state.dispose();
    super.dispose();
  }

  void _say(String message, {bool problem = false}) {
    if (!mounted) return;
    setState(() {
      _status = message;
      _problem = problem;
    });
  }

  Future<void> _run(String doing, Future<void> Function(CloudSession cloud) action) async {
    final cloud = AppScope.of(context).cloud!;
    setState(() {
      _busy = true;
      _status = doing;
      _problem = false;
    });
    try {
      await action(cloud);
    } on MycaApiException catch (err) {
      _say(err.message, problem: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save() => _run('Saving…', (cloud) async {
        final fields = <String, Object?>{};
        for (final entry in _controllers.entries) {
          final value = entry.value.text.trim();
          if (value.isNotEmpty) fields[entry.key] = value;
        }
        if (_environment.isNotEmpty) fields['environment'] = _environment;
        final saved = await cloud.saveConnector(view.channel, fields);
        for (final field in view.secrets) {
          _controllers[field]?.clear();
        }
        widget.onChanged(saved);
        _say('Saved.');
      });

  Future<void> _setEnabled(bool enabled) => _run(enabled ? 'Resuming…' : 'Pausing…', (cloud) async {
        widget.onChanged(await cloud.saveConnector(view.channel, {'enabled': enabled}));
        _say(enabled ? 'Resumed.' : 'Paused; nothing is pulled until you resume.');
      });

  Future<void> _connectBank() => _run('Opening Plaid Link…', (cloud) async {
        final token = await cloud.plaidLinkToken();
        if (!mounted) return;
        final publicToken = await AppScope.of(context).plaidLink.open(token.linkToken);
        if (publicToken == null || publicToken.isEmpty) {
          _say('Plaid Link was closed before a bank was linked.', problem: true);
          return;
        }
        final item = await cloud.plaidExchange(publicToken);
        _say('Bank linked${token.mock ? ' (simulated)' : ''}, item ${item.itemId}.');
        await widget.onRefresh();
      });

  Future<void> _connectGusto() => _run('Asking Gusto…', (cloud) async {
        final connect = await cloud.gustoConnect();
        final url = Uri.tryParse(connect.url);
        if (!mounted) return;
        if (url == null || !await AppScope.of(context).openLink(url)) {
          _say('Could not open the browser for Gusto.', problem: true);
          return;
        }
        _say('Opened Gusto. Allow the app there; the browser comes back to MyCA at ${connect.redirectUri}. Then tap Refresh.');
      });

  Future<void> _lookUpRate() => _run('Looking up the rate…', (cloud) async {
        final rate = await cloud.taxjarRate(zip: _zip.text.trim(), city: _city.text.trim(), state: _state.text.trim().toUpperCase());
        _say(rate.line);
      });

  Future<void> _pull() => _run('Pulling…', (cloud) async {
        final sync = await cloud.connectorSync();
        final mine = sync.forChannel(view.channel);
        _say(mine.isEmpty ? 'Nothing was pulled for ${view.title}.' : mine.map((r) => r.line).join('\n'), problem: mine.any((r) => !r.ok));
        await widget.onRefresh();
      });

  Widget _field(String field) {
    final label = field == 'environment' && modeChannels.contains(view.channel) ? 'Mode' : connectorFieldLabels[field] ?? field;
    final choices = field == 'environment' ? connectorEnvironments[view.channel] : null;
    if (choices != null) {
      return DropdownButtonFormField<String>(
        key: ValueKey('${view.channel}.environment'),
        initialValue: _environment,
        decoration: InputDecoration(labelText: label),
        items: [for (final choice in choices) DropdownMenuItem(value: choice, child: Text(environmentLabel(view.channel, choice)))],
        onChanged: _busy ? null : (value) => setState(() => _environment = value ?? _environment),
      );
    }
    final secret = view.isSecret(field);
    return TextField(
      key: ValueKey('${view.channel}.$field'),
      controller: _controllers[field],
      obscureText: secret,
      enableSuggestions: !secret,
      autocorrect: false,
      decoration: InputDecoration(
        labelText: label,
        helperText: secret && view.isSet(field) ? '(saved)' : (view.optional.contains(field) ? 'Optional' : null),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final fields = editableFields(view);
    final status = connectorStatus(view);
    final pullLabel = connectorPullLabels[view.channel] ?? 'Pull now';
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Palette.surface,
        borderRadius: BorderRadius.circular(radiusCard),
        border: Border.all(color: Palette.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(view.title, style: text.titleMedium),
          const SizedBox(height: 4),
          Wrap(
            spacing: 12,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              StatusTag(text: status, color: view.configured ? (view.enabled ? Palette.accent : Palette.warn) : Palette.muted),
              if (view.lastFetchedTo.isNotEmpty) Text('Pulled to ${view.lastFetchedTo}', style: text.bodySmall?.copyWith(color: Palette.muted)),
            ],
          ),
          const SizedBox(height: 10),
          Text(connectorHelp[view.channel] ?? '', style: text.bodyMedium),
          const SizedBox(height: 8),
          for (final field in fields) ...[
            const SizedBox(height: 6),
            _field(field),
          ],
          if (view.channel == 'taxjar') ...[
            const SizedBox(height: 14),
            Text('Look up a rate', style: text.labelLarge),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    key: const ValueKey('taxjar.zip'),
                    controller: _zip,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Zip', hintText: '78701'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    key: const ValueKey('taxjar.city'),
                    controller: _city,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(labelText: 'City', hintText: 'Austin'),
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  width: 72,
                  child: TextField(
                    key: const ValueKey('taxjar.state'),
                    controller: _state,
                    maxLength: 2,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(labelText: 'State', hintText: 'TX', counterText: ''),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton(onPressed: _busy ? null : _save, child: const Text('Save')),
              if (view.channel == 'plaid') OutlinedButton(onPressed: _busy ? null : _connectBank, child: const Text('Connect my bank')),
              if (view.channel == 'gusto') OutlinedButton(onPressed: _busy ? null : _connectGusto, child: const Text('Connect Gusto')),
              if (view.channel == 'taxjar') OutlinedButton(onPressed: _busy ? null : _lookUpRate, child: const Text('Look up rate')),
              if (view.kinds.isNotEmpty) OutlinedButton(onPressed: _busy ? null : _pull, child: Text(pullLabel)),
              if (view.configured)
                TextButton(
                  onPressed: _busy ? null : () => _setEnabled(!view.enabled),
                  child: Text(view.enabled ? 'Pause' : 'Resume'),
                ),
            ],
          ),
          if (_status.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              _status,
              style: text.bodyMedium?.copyWith(color: _problem ? Palette.danger : Palette.muted, fontWeight: _problem ? FontWeight.w500 : null),
            ),
          ],
        ],
      ),
    );
  }
}
