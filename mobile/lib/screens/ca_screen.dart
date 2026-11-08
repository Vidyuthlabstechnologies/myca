import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../app_services.dart';
import '../marks.dart';
import '../theme.dart';
import '../widgets.dart';
import '../widgets/utf16_limit.dart';

Future<String> askMyCa(
  BuildContext context, {
  required Map<String, Object?> subject,
  required String about,
}) async {
  final state = AppScope.of(context);
  final api = state.api;
  final asked = await showModalBottomSheet<_Ask>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => _AskSheet(about: about, pickFile: state.pickAnyFile, upload: api.upload),
  );
  if (asked == null || !context.mounted) return '';
  try {
    final held = await api.propose('ask_ca', {
      'subject': subject,
      'note': asked.note,
      if (asked.documents.isNotEmpty) 'documents': [for (final doc in asked.documents) {'sha256': doc.sha256, 'name': doc.name}],
    });
    final preview = held.preview;
    if (preview == null) return held.reply;
    if (!context.mounted) return '';
    final yes = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Send to your CA?'),
        content: SingleChildScrollView(
          child: Text([preview.summary, ...preview.effects].join('\n\n')),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialog).pop(true),
            child: const Text('Send'),
          ),
        ],
      ),
    );
    if (yes != true) {
      await api.discard();
      return 'Not sent.';
    }
    return (await api.confirm(preview.token)).reply;
  } on MycaApiException catch (err) {
    return err.message;
  }
}

class _Attached {
  const _Attached({required this.sha256, required this.name});

  final String sha256;
  final String name;
}

class _Ask {
  const _Ask({required this.note, required this.documents});

  final String note;
  final List<_Attached> documents;
}

class _AskSheet extends StatefulWidget {
  const _AskSheet({required this.about, required this.pickFile, required this.upload});

  final String about;
  final PickAnyFile pickFile;
  final Future<String> Function(String name, String content) upload;

  @override
  State<_AskSheet> createState() => _AskSheetState();
}

class _AskSheetState extends State<_AskSheet> {
  final _note = TextEditingController();
  final _documents = <_Attached>[];
  String _error = '';
  bool _attaching = false;

  Future<void> _attach() async {
    if (_documents.length >= 5) return setState(() => _error = 'At most five files on one question.');
    setState(() {
      _error = '';
      _attaching = true;
    });
    try {
      final picked = await widget.pickFile();
      if (picked == null) return;
      final sha = await widget.upload(picked.name, dataUrlOf(picked));
      if (!mounted) return;
      setState(() => _documents.add(_Attached(sha256: sha, name: picked.name)));
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _attaching = false);
    }
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        22,
        4,
        22,
        22 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Ask your CA', style: text.headlineSmall),
          const SizedBox(height: 4),
          Text(
            'About ${widget.about}. MyCA attaches the details.',
            style: text.bodySmall,
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _note,
            autofocus: true,
            minLines: 2,
            maxLines: 5,
            inputFormatters: const [Utf16LengthLimit(1000)],
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Your question',
              counterText: '',
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              ActionChip(
                avatar: const Icon(Icons.attach_file, size: 16),
                label: Text(_attaching ? 'Attaching…' : 'Attach a file'),
                onPressed: _attaching ? null : _attach,
              ),
              for (final doc in _documents)
                InputChip(
                  label: Text(doc.name),
                  onDeleted: () => setState(() => _documents.remove(doc)),
                ),
            ],
          ),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              _error,
              style: const TextStyle(
                color: Palette.danger,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () {
                final note = _note.text.trim();
                if (note.isEmpty) {
                  setState(() => _error = 'Write what you want to ask.');
                  return;
                }
                Navigator.of(context).pop(_Ask(note: note, documents: List.of(_documents)));
              },
              child: const Text('Preview'),
            ),
          ),
        ],
      ),
    );
  }
}

String caStatusWords(CaRequest request) => switch (request.status) {
  'answered' => 'Answered',
  'closed' => 'Closed',
  _ => 'Waiting for your CA',
};

class CaScreen extends StatefulWidget {
  const CaScreen({super.key});

  @override
  State<CaScreen> createState() => _CaScreenState();
}

class _CaScreenState extends State<CaScreen> {
  Future<List<CaRequest>>? _requests;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _requests ??= _load();
  }

  Future<List<CaRequest>> _load() async =>
      caRequestsFrom(await AppScope.of(context).api.query('list_ca_requests'));

  void _reload() {
    final next = _load();
    setState(() {
      _requests = next;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Your CA')),
      body: FutureBuilder<List<CaRequest>>(
        future: _requests,
        builder: (context, state) {
          if (state.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final requests = state.data ?? const <CaRequest>[];
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
            children: [
              if (requests.isEmpty)
                const EmptyNote(
                  text:
                      'No open questions. Use "Ask my CA" on an invoice, a flagged item or a month\'s review; MyCA attaches the details.',
                )
              else
                Panel(
                  children: [
                    for (final request in requests)
                      RowCard(
                        leading: TintTile(
                          tint: request.status == 'answered'
                              ? Tint.sales
                              : Tint.ask,
                          mark: request.status == 'answered'
                              ? Mark.confirm
                              : Mark.people,
                        ),
                        title: request.title,
                        subtitle:
                            '${caStatusWords(request)} · ${longDate(request.lastOn)}',
                        trailing: const Chevron(),
                        onTap: () async {
                          await Navigator.of(context).push(
                            MaterialPageRoute<void>(
                              builder: (_) => CaThreadScreen(request: request),
                            ),
                          );
                          if (mounted) _reload();
                        },
                      ),
                  ],
                ),
              const SizedBox(height: 14),
              Text(
                'Your CA sees these in MyCA once you have invited them from People.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          );
        },
      ),
    );
  }
}

class CaThreadScreen extends StatefulWidget {
  const CaThreadScreen({super.key, required this.request});

  final CaRequest request;

  @override
  State<CaThreadScreen> createState() => _CaThreadScreenState();
}

class _CaThreadScreenState extends State<CaThreadScreen> {
  late CaRequest _request = widget.request;
  final _reply = TextEditingController();
  bool _busy = false;
  String _note = '';

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  Future<void> _run(String tool, Map<String, Object?> args) async {
    final api = AppScope.of(context).api;
    setState(() {
      _busy = true;
      _note = '';
    });
    var note = '';
    try {
      final held = await api.propose(tool, args);
      final preview = held.preview;
      note = preview == null
          ? held.reply
          : (await api.confirm(preview.token)).reply;
      final fresh = caRequestsFrom(
        await api.query('list_ca_requests', {'status': 'all'}),
      );
      final match = fresh.where((item) => item.id == _request.id);
      if (match.isNotEmpty) _request = match.first;
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _note = note;
    });
  }

  Future<void> _send() async {
    final text = _reply.text.trim();
    if (text.isEmpty) return;
    FocusScope.of(context).unfocus();
    _reply.clear();
    await _run('reply_ca', {'id': _request.id, 'text': text});
  }

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: _request.text));
    if (!mounted) return;
    setState(
      () => _note =
          'Copied. Paste it into WhatsApp or email if your CA is not on MyCA yet.',
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final open = _request.status != 'closed';
    return Scaffold(
      appBar: AppBar(title: Text(_request.id)),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              children: [
                Text(
                  caStatusWords(_request).toUpperCase(),
                  style: text.labelSmall,
                ),
                const SizedBox(height: 4),
                Text(_request.title, style: text.headlineSmall),
                if (_request.facts.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  for (final fact in _request.facts)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: Text(
                        fact,
                        style: text.bodySmall?.copyWith(
                          fontFeatures: moneyFigures,
                        ),
                      ),
                    ),
                ],
                if (_request.attachments.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    'Attached: ${_request.attachments.join(', ')}',
                    style: text.bodySmall,
                  ),
                ],
                const SizedBox(height: 14),
                for (final message in _request.messages)
                  Bubble(
                    text: message.text,
                    tone: message.by == _request.askedBy
                        ? BubbleTone.mine
                        : BubbleTone.plain,
                    label: message.by == _request.askedBy
                        ? null
                        : 'Reply · ${longDate(message.on)}',
                  ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    ActionChip(
                      label: const Text('Copy to send'),
                      onPressed: _copy,
                    ),
                    if (open)
                      ActionChip(
                        label: const Text('Close'),
                        onPressed: _busy
                            ? null
                            : () => _run('close_ca', {'id': _request.id}),
                      ),
                  ],
                ),
                if (_note.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(_note, style: text.bodyMedium),
                ],
              ],
            ),
          ),
          if (open)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _reply,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: const InputDecoration(hintText: 'Reply'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(
                      onPressed: _busy ? null : _send,
                      child: const Text('Send'),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
