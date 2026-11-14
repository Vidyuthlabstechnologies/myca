import 'dart:async';
import 'dart:io';

import 'package:app_links/app_links.dart';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../theme.dart';
import 'hmrc_device.dart';
import 'uk_common.dart';

class HmrcStatus {
  const HmrcStatus(this.data);

  factory HmrcStatus.fromTool(Object? result) => HmrcStatus(toolData(result));

  final Map<String, dynamic> data;

  bool get connected => ukText(data['status']) == 'connected';
  String get environment => ukText(data['environment']).isEmpty ? ukText(data['serviceEnvironment']) : ukText(data['environment']);
  String get lastSync => ukText(data['lastSync']);
  String get connectedAt => ukText(data['connectedAt']);
  bool get tokenValid => data['accessTokenValid'] == true;
  List<String> get missingSettings => [for (final s in (data['missingSettings'] as List? ?? const [])) '$s'];
  List<Map<String, dynamic>> get vatObligations => ukMaps(data['vatObligations']);
  List<Map<String, dynamic>> get itsaObligations => ukMaps(data['itsaObligations']);
  List<Map<String, dynamic>> get itsaBusinesses => ukMaps(data['itsaBusinesses']);
  List<Map<String, dynamic>> get calculations => ukMaps(data['calculations']);
  Map<String, dynamic> get fraudHeaderCheck => ukMap(data['fraudHeaderCheck']);
}

Future<HmrcStatus> loadHmrcStatus(MycaApi api) async => HmrcStatus.fromTool(await ukQuery(api, 'gb_hmrc_status'));

String hmrcStatusWords(HmrcStatus status) {
  final where = hmrcEnvironmentLabel(status.environment);
  if (!status.connected) return 'Not connected to HMRC';
  return where.isEmpty ? 'Connected to HMRC' : 'Connected to $where';
}

String syncWords(HmrcStatus status) {
  final at = DateTime.tryParse(status.lastSync);
  if (at == null) return 'Not synced yet';
  return 'Last synced ${readableDay(isoDate(at.toLocal()))}';
}

Future<String> syncWithHmrc(BuildContext context, MycaApi api, String taxYear) async {
  final device = await hmrcDeviceReader(context);
  final reply = await proposeAndConfirm(api, 'sync_gb_hmrc', {'taxYear': taxYear, 'device': device});
  if (reply.posted) {
    final pulled = [for (final p in (reply.toolResult('sync_gb_hmrc')['pulled'] as List? ?? const [])) '$p'];
    return pulled.isEmpty ? 'Synced with HMRC.' : 'Synced with HMRC: ${pulled.map((p) => p.replaceAll('-', ' ')).join(', ')}.';
  }
  return replyProblem(reply, 'sync_gb_hmrc', fallback: 'HMRC did not answer. Try again in a few minutes.');
}

({String code, String state}) hmrcCodeFrom(String typed) {
  final text = typed.trim();
  final uri = Uri.tryParse(text);
  if (uri != null && uri.queryParameters.containsKey('code')) {
    return (code: uri.queryParameters['code'] ?? '', state: uri.queryParameters['state'] ?? '');
  }
  return (code: text, state: '');
}

class UkConnectScreen extends StatefulWidget {
  const UkConnectScreen({super.key, required this.taxYear, this.links});

  final String taxYear;
  final Stream<Uri>? links;

  @override
  State<UkConnectScreen> createState() => _UkConnectScreenState();
}

class _UkConnectScreenState extends State<UkConnectScreen> {
  Future<HmrcStatus>? _status;
  final _code = TextEditingController();
  String _authorizeUrl = '';
  String _state = '';
  String _note = '';
  String _problem = '';
  bool _busy = false;
  StreamSubscription<Uri>? _linkSub;

  MycaApi get _api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _status ??= loadHmrcStatus(_api);
    _linkSub ??= (widget.links ?? (Platform.isAndroid ? AppLinks().uriLinkStream : null))?.listen(_fromLink);
  }

  @override
  void dispose() {
    _linkSub?.cancel();
    _code.dispose();
    super.dispose();
  }

  void _fromLink(Uri uri) {
    final code = uri.queryParameters['code'] ?? '';
    if (code.isEmpty || !mounted || !(uri.host == 'hmrc' || uri.path.contains('hmrc'))) return;
    _code.text = uri.toString();
    _finish();
  }

  Future<void> _run(Future<void> Function() step) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _problem = '';
      _note = '';
    });
    try {
      await step();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _problem = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _start() => _run(() async {
    final reply = await proposeAndConfirm(_api, 'connect_gb_hmrc', const {});
    if (!mounted) return;
    final data = reply.toolResult('connect_gb_hmrc');
    final url = ukText(data['authorizeUrl']);
    if (!reply.posted || url.isEmpty) {
      setState(() => _problem = replyProblem(reply, 'connect_gb_hmrc', fallback: 'MyCA could not start the HMRC sign-in.'));
      return;
    }
    setState(() {
      _authorizeUrl = url;
      _state = ukText(data['state']);
    });
    final opened = await AppScope.of(context).openLink(Uri.parse(url));
    if (!mounted) return;
    setState(() => _note = opened ? 'Sign in to your Government Gateway account in the browser and allow MyCA. Then paste the code HMRC shows, or the whole address it sends you to.' : 'MyCA could not open the browser. Copy the link below into one.');
  });

  Future<void> _finish() => _run(() async {
    final typed = hmrcCodeFrom(_code.text);
    final state = typed.state.isNotEmpty ? typed.state : _state;
    if (typed.code.isEmpty) {
      setState(() => _problem = 'Paste the code from HMRC first.');
      return;
    }
    if (state.isEmpty) {
      setState(() => _problem = 'Start connecting first, so HMRC sends a code for this sign-in.');
      return;
    }
    final reply = await proposeAndConfirm(_api, 'finish_gb_hmrc_connection', {'code': typed.code, 'state': state});
    if (!mounted) return;
    if (!reply.posted) {
      setState(() => _problem = replyProblem(reply, 'finish_gb_hmrc_connection', fallback: 'HMRC did not accept that code.'));
      return;
    }
    _code.clear();
    setState(() {
      _authorizeUrl = '';
      _state = '';
      _note = 'Connected to ${hmrcEnvironmentLabel(ukText(reply.toolResult('finish_gb_hmrc_connection')['environment'])).ifEmpty('HMRC')}.';
      _status = loadHmrcStatus(_api);
    });
  });

  Future<void> _sync() => _run(() async {
    final words = await syncWithHmrc(context, _api, widget.taxYear);
    if (!mounted) return;
    setState(() {
      _note = words;
      _status = loadHmrcStatus(_api);
    });
  });

  Future<void> _disconnect() => _run(() async {
    final reply = await proposeAndConfirm(_api, 'disconnect_gb_hmrc', const {});
    if (!mounted) return;
    setState(() {
      _note = reply.posted ? ukText(reply.toolResult('disconnect_gb_hmrc')['hint']).ifEmpty('Disconnected.') : '';
      _problem = reply.posted ? '' : replyProblem(reply, 'disconnect_gb_hmrc');
      _status = loadHmrcStatus(_api);
    });
  });

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Connect to HMRC')),
      body: FutureBuilder<HmrcStatus>(
        future: _status,
        builder: (context, snap) {
          final status = snap.data;
          if (status == null) return const Center(child: CircularProgressIndicator());
          return ListView(
            padding: ukPagePadding,
            children: [
              UkCard(
                children: [
                  Text(hmrcStatusWords(status), key: const Key('uk.connect.status'), style: text.titleMedium),
                  UkNote(syncWords(status)),
                  if (status.connected && !status.tokenValid) const UkNote('The HMRC sign-in has lapsed or will renew on the next sync.', warn: true),
                  if (status.missingSettings.isNotEmpty) const UkNote('The connection to HMRC is not set up on this MyCA service yet.', warn: true),
                ],
              ),
              if (_problem.isNotEmpty) UkProblem(_problem),
              if (_note.isNotEmpty) UkCard(tone: Palette.accentSoft, children: [Text(_note, key: const Key('uk.connect.note'), style: text.bodyLarge)]),
              Text('How it works', style: text.titleMedium),
              const UkNote('MyCA opens HMRC\'s sign-in page. You sign in with your Government Gateway user ID and allow MyCA to send VAT and Income Tax updates for you. MyCA never sees your password.'),
              const SizedBox(height: 8),
              UkWideButton(label: status.connected ? 'Connect again' : 'Start connecting', onPressed: _busy ? null : _start),
              if (_authorizeUrl.isNotEmpty) ...[
                const UkNote('If the browser did not open, copy this link into one:'),
                Text(_authorizeUrl, key: const Key('uk.connect.url'), style: text.bodySmall),
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton(
                    onPressed: () async {
                      await Clipboard.setData(ClipboardData(text: _authorizeUrl));
                      if (mounted) setState(() => _note = 'Link copied.');
                    },
                    child: const Text('Copy link'),
                  ),
                ),
                const SizedBox(height: 12),
              ],
              TextField(
                key: const Key('uk.connect.code'),
                controller: _code,
                autocorrect: false,
                enableSuggestions: false,
                decoration: const InputDecoration(labelText: 'Code from HMRC', helperText: 'The code, or the whole address HMRC sent you back to', helperMaxLines: 2),
              ),
              const SizedBox(height: 12),
              UkWideButton(label: 'Finish connecting', onPressed: _busy ? null : _finish),
              if (status.connected) ...[
                const SizedBox(height: 12),
                UkWideButton(label: 'Sync now', outlined: true, onPressed: _busy ? null : _sync),
                UkWideButton(label: 'Disconnect', outlined: true, onPressed: _busy ? null : _disconnect),
                const UkNote('Disconnecting deletes the HMRC sign-in MyCA holds. To remove MyCA\'s authority at HMRC too, use your Government Gateway account.'),
              ],
              if (_busy) const Padding(padding: EdgeInsets.only(top: 8), child: LinearProgressIndicator()),
              const UkFooter(),
            ],
          );
        },
      ),
    );
  }
}

extension on String {
  String ifEmpty(String other) => isEmpty ? other : this;
}
