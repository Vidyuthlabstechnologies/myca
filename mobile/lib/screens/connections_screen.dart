import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../format.dart';
import '../marks.dart';
import '../theme.dart';
import '../uae/uae_cloud_strings.dart';
import '../uae/uae_strings.dart';
import '../widgets.dart';

const _sourceHelp = {
  'pos': 'A billing counter or POS posts each sale straight into the books. No confirmation per sale; you see the day\'s total here.',
  'documents': 'A mail inbox or scanner drops bills and statements in. Nothing posts; you get a reminder to read each one.',
};

String sourceLabel(String source) => source == 'pos' ? 'Sales from a POS' : 'Documents in';

class ConnectionsScreen extends StatefulWidget {
  const ConnectionsScreen({super.key});

  @override
  State<ConnectionsScreen> createState() => _ConnectionsScreenState();
}

class _ConnectionsScreenState extends State<ConnectionsScreen> {
  Future<List<InboundKey>>? _keys;
  String _error = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _keys ??= AppScope.of(context).cloud!.inboundKeys();
  }

  void _reload() {
    final next = AppScope.of(context).cloud!.inboundKeys();
    setState(() {
      _keys = next;
    });
  }

  Future<void> _add() async {
    final cloud = AppScope.of(context).cloud!;
    final made = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _NewKeySheet(cloud: cloud),
    );
    if (made == true && mounted) _reload();
  }

  Future<void> _copyAddress(String email) async {
    await Clipboard.setData(ClipboardData(text: email));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(UaeStrings.of(context).copiedText(email))));
  }

  Future<void> _turnOff(InboundKey key) async {
    final cloud = AppScope.of(context).cloud!;
    final s = UaeStrings.of(context);
    final yes = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(s.turnOffKey(key.label)),
        content: Text(s.turnOffKeyBody),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialog).pop(false), child: Text(s.keep)),
          FilledButton(onPressed: () => Navigator.of(dialog).pop(true), child: Text(s.turnOff)),
        ],
      ),
    );
    if (yes != true || !mounted) return;
    setState(() => _error = '');
    try {
      await cloud.disableInboundKey(key.id);
      if (mounted) _reload();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final s = UaeStrings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s.connections)),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _add,
        icon: const Icon(Icons.add, size: 20),
        label: Text(s.connectSomething),
      ),
      body: FutureBuilder<List<InboundKey>>(
        future: _keys,
        builder: (context, loaded) {
          final keys = loaded.data;
          if (keys == null) {
            return Center(
              child: loaded.hasError ? Text(s.cloudSaid('${loaded.error}'), textAlign: TextAlign.center) : const CircularProgressIndicator(),
            );
          }
          final on = keys.where((k) => k.enabled).toList();
          final off = keys.where((k) => !k.enabled).toList();
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
            children: [
              Text(
                s.connectionsIntro,
                style: text.bodyMedium,
              ),
              if (_error.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(s.cloudSaid(_error), style: TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
              ],
              const SizedBox(height: 16),
              if (on.isEmpty) Text(s.nothingConnected, style: text.bodyMedium),
              if (on.isNotEmpty) ...[
                SectionLabel(s.connected),
                Panel(
                  children: [
                    for (final key in on)
                      RowCard(
                        leading: TintTile(tint: Tint.ask, mark: key.source == 'pos' ? Mark.sales : Mark.paper),
                        title: key.label,
                        subtitle: key.source == 'pos'
                            ? s.posToday(key.todayCount, rupees(key.todayTotal))
                            : key.email.isEmpty
                                ? s.sourceLabel(key.source)
                                : s.forwardBillsTo(key.email),
                        onTap: key.email.isEmpty ? null : () => _copyAddress(key.email),
                        trailing: TextButton(onPressed: () => _turnOff(key), child: Text(s.turnOff)),
                      ),
                  ],
                ),
              ],
              if (off.isNotEmpty) ...[
                const SizedBox(height: 26),
                SectionLabel(s.turnedOff),
                Panel(
                  children: [
                    for (final key in off)
                      RowCard(
                        leading: TintTile(tint: Tint.ask, mark: key.source == 'pos' ? Mark.sales : Mark.paper),
                        title: key.label,
                        subtitle: s.sourceLabel(key.source),
                        trailing: StatusTag(text: s.off, color: Palette.muted),
                      ),
                  ],
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _NewKeySheet extends StatefulWidget {
  const _NewKeySheet({required this.cloud});

  final CloudSession cloud;

  @override
  State<_NewKeySheet> createState() => _NewKeySheetState();
}

class _NewKeySheetState extends State<_NewKeySheet> {
  final _label = TextEditingController();
  String _source = 'pos';
  String _error = '';
  bool _busy = false;
  InboundKey? _made;
  bool _copied = false;

  @override
  void dispose() {
    _label.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    if (_label.text.trim().isEmpty) return setState(() => _error = UaeStrings.of(context).nameTheSystem);
    setState(() {
      _error = '';
      _busy = true;
    });
    try {
      final made = await widget.cloud.createInboundKey(_label.text.trim(), _source);
      if (mounted) setState(() => _made = made);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final s = UaeStrings.of(context);
    final made = _made;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: made == null
            ? [
                Text(s.connectSomething, style: text.titleLarge),
                const SizedBox(height: 12),
                TextField(
                  controller: _label,
                  decoration: InputDecoration(labelText: s.whatIsIt, hintText: s.whatIsItHint),
                  textCapitalization: TextCapitalization.sentences,
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final source in _sourceHelp.keys)
                      ChoiceChip(
                        label: Text(s.sourceLabel(source)),
                        selected: _source == source,
                        onSelected: (_) => setState(() => _source = source),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(s.sourceHelp(_source), style: text.bodyMedium),
                if (_error.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(s.cloudSaid(_error), style: TextStyle(color: Palette.danger)),
                ],
                const SizedBox(height: 16),
                FilledButton(onPressed: _busy ? null : _create, child: Text(s.createKey)),
              ]
            : [
                Text(s.isConnected(made.label), style: text.titleLarge),
                const SizedBox(height: 8),
                Text(s.giveKeyOnce, style: text.bodyMedium),
                const SizedBox(height: 12),
                SelectableText(made.secret, style: text.bodyLarge?.copyWith(fontFamily: 'monospace')),
                if (made.email.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(s.orForwardBills, style: text.bodyMedium),
                  const SizedBox(height: 6),
                  SelectableText(made.email, style: text.bodyLarge),
                ],
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    OutlinedButton(
                      onPressed: () async {
                        await Clipboard.setData(ClipboardData(text: made.secret));
                        if (mounted) setState(() => _copied = true);
                      },
                      child: Text(_copied ? s.copied : s.copyKey),
                    ),
                    FilledButton(onPressed: () => Navigator.of(context).pop(true), child: Text(s.done)),
                  ],
                ),
              ],
        ),
      ),
    );
  }
}
