import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../format.dart';
import '../marks.dart';
import '../theme.dart';
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
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Copied $email')));
  }

  Future<void> _turnOff(InboundKey key) async {
    final cloud = AppScope.of(context).cloud!;
    final yes = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text('Turn off ${key.label}?'),
        content: const Text('Anything it sends from now on is refused. What it already recorded stays in the books.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialog).pop(false), child: const Text('Keep')),
          FilledButton(onPressed: () => Navigator.of(dialog).pop(true), child: const Text('Turn off')),
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
    return Scaffold(
      appBar: AppBar(title: const Text('Connections')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _add,
        icon: const Icon(Icons.add, size: 20),
        label: const Text('Connect something'),
      ),
      body: FutureBuilder<List<InboundKey>>(
        future: _keys,
        builder: (context, loaded) {
          final keys = loaded.data;
          if (keys == null) {
            return Center(
              child: loaded.hasError ? Text('${loaded.error}', textAlign: TextAlign.center) : const CircularProgressIndicator(),
            );
          }
          final on = keys.where((k) => k.enabled).toList();
          final off = keys.where((k) => !k.enabled).toList();
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
            children: [
              Text(
                'Other systems that put entries or documents into these books on their own. Each gets its own key; turn it off here any time.',
                style: text.bodyMedium,
              ),
              if (_error.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(_error, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
              ],
              const SizedBox(height: 16),
              if (on.isEmpty) Text('Nothing is connected yet.', style: text.bodyMedium),
              if (on.isNotEmpty) ...[
                const SectionLabel('Connected'),
                Panel(
                  children: [
                    for (final key in on)
                      RowCard(
                        leading: TintTile(tint: Tint.ask, mark: key.source == 'pos' ? Mark.sales : Mark.paper),
                        title: key.label,
                        subtitle: key.source == 'pos'
                            ? 'Today: ${key.todayCount == 1 ? '1 sale' : '${key.todayCount} sales'}, ${rupees(key.todayTotal)}'
                            : key.email.isEmpty
                                ? sourceLabel(key.source)
                                : 'Forward bills to ${key.email}',
                        onTap: key.email.isEmpty ? null : () => _copyAddress(key.email),
                        trailing: TextButton(onPressed: () => _turnOff(key), child: const Text('Turn off')),
                      ),
                  ],
                ),
              ],
              if (off.isNotEmpty) ...[
                const SizedBox(height: 26),
                const SectionLabel('Turned off'),
                Panel(
                  children: [
                    for (final key in off)
                      RowCard(
                        leading: TintTile(tint: Tint.ask, mark: key.source == 'pos' ? Mark.sales : Mark.paper),
                        title: key.label,
                        subtitle: sourceLabel(key.source),
                        trailing: const StatusTag(text: 'Off', color: Palette.muted),
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
    if (_label.text.trim().isEmpty) return setState(() => _error = 'Name the system, for example "Counter till".');
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
    final made = _made;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: made == null
            ? [
                Text('Connect something', style: text.titleLarge),
                const SizedBox(height: 12),
                TextField(
                  controller: _label,
                  decoration: const InputDecoration(labelText: 'What is it?', hintText: 'Counter till, Mail inbox'),
                  textCapitalization: TextCapitalization.sentences,
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final source in _sourceHelp.keys)
                      ChoiceChip(
                        label: Text(sourceLabel(source)),
                        selected: _source == source,
                        onSelected: (_) => setState(() => _source = source),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(_sourceHelp[_source]!, style: text.bodyMedium),
                if (_error.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(_error, style: const TextStyle(color: Palette.danger)),
                ],
                const SizedBox(height: 16),
                FilledButton(onPressed: _busy ? null : _create, child: const Text('Create key')),
              ]
            : [
                Text('${made.label} is connected', style: text.titleLarge),
                const SizedBox(height: 8),
                Text('Give this key to the system once. It is shown only now; if it is lost, turn this connection off and make a new one.', style: text.bodyMedium),
                const SizedBox(height: 12),
                SelectableText(made.secret, style: text.bodyLarge?.copyWith(fontFamily: 'monospace')),
                if (made.email.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text('Or forward bills by mail to this address; it stays on the Connections list.', style: text.bodyMedium),
                  const SizedBox(height: 6),
                  SelectableText(made.email, style: text.bodyLarge),
                ],
                const SizedBox(height: 12),
                Row(
                  children: [
                    OutlinedButton(
                      onPressed: () async {
                        await Clipboard.setData(ClipboardData(text: made.secret));
                        if (mounted) setState(() => _copied = true);
                      },
                      child: Text(_copied ? 'Copied' : 'Copy key'),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Done')),
                  ],
                ),
              ],
      ),
    );
  }
}
