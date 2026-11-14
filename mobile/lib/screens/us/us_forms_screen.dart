import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../api/myca_api.dart';
import '../../app_services.dart';
import '../../app_state.dart';
import '../../format.dart';
import '../../marks.dart';
import '../../theme.dart';
import '../../us/us_return.dart';
import '../../widgets.dart';
import 'us_fields.dart';
import 'us_form_editor_screen.dart';

class UsFormsScreen extends StatefulWidget {
  const UsFormsScreen({super.key, required this.taxYear, this.joint = false});

  final int taxYear;
  final bool joint;

  @override
  State<UsFormsScreen> createState() => _UsFormsScreenState();
}

class _UsFormsScreenState extends State<UsFormsScreen> {
  Future<List<UsTaxForm>>? _forms;
  Future<List<UsFormKind>>? _kinds;
  String _note = '';
  bool _reading = false;

  MycaApi get _api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _forms ??= loadTaxForms(_api, widget.taxYear);
    _kinds ??= loadFormKinds(_api);
  }

  void _reload() => setState(() {
        _forms = loadTaxForms(_api, widget.taxYear);
      });

  Future<void> _edit(UsFormKind kind, {Map<String, Object?> fields = const {}, String documentSha = '', String id = '', String owner = 'taxpayer', String readNote = ''}) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => UsFormEditorScreen(taxYear: widget.taxYear, kind: kind, fields: fields, documentSha: documentSha, id: id, owner: owner, readNote: readNote, joint: widget.joint),
      ),
    );
    if (saved == true && mounted) _reload();
  }

  Future<void> _pickKind() async {
    final kinds = await _kinds!;
    if (!mounted) return;
    final picked = await showModalBottomSheet<UsFormKind>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheet) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(sheet).height * 0.8),
          child: ListView(
            shrinkWrap: true,
            children: [
              for (final k in kinds)
                ListTile(
                  key: Key('usForms.kind.${k.kind}'),
                  title: Text(k.title),
                  subtitle: Text(k.description),
                  onTap: () => Navigator.of(sheet).pop(k),
                ),
            ],
          ),
        ),
      ),
    );
    if (picked != null) await _edit(picked);
  }

  Future<void> _scan() async {
    final state = AppScope.of(context);
    setState(() => _note = '');
    final picked = await state.pickAnyFile();
    if (picked == null || !mounted) return;
    setState(() => _reading = true);
    try {
      final sha = await _api.upload(picked.name, dataUrlOf(picked));
      final answer = await _api.query('read_us_tax_document', {'documentId': sha, 'documentSha256': sha, 'taxYear': widget.taxYear});
      final data = toolData(answer);
      final kinds = await _kinds!;
      final kind = formKindOf('${data['kind'] ?? ''}', kinds);
      if (!mounted) return;
      setState(() => _reading = false);
      if (kind == null) {
        setState(() => _note = answer is Map && answer['error'] == 'MODEL_NOT_CONFIGURED'
            ? 'Reading forms is not switched on yet. Choose "Type it in" instead.'
            : 'MyCA could not tell which form that is. Choose "Type it in" and pick the form.');
        return;
      }
      final fields = data['fields'] is Map ? (data['fields'] as Map).cast<String, Object?>() : const <String, Object?>{};
      await _edit(kind, fields: fields, documentSha: sha, readNote: 'Read from ${shortFileName(picked.name, 40)}. Check each box against the form before you save.');
    } on Object catch (err) {
      if (mounted) {
        setState(() {
          _reading = false;
          _note = err is MycaApiException ? err.message : 'That file could not be read. Try a clear photo or a PDF, or choose "Type it in".';
        });
      }
    }
  }

  Future<void> _remove(UsTaxForm form) async {
    final sure = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text('Remove this ${form.kind}?'),
        content: Text(form.payer.isEmpty ? 'It comes off your return.' : 'The ${form.kind} from ${form.payer} comes off your return.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialog).pop(false), child: const Text('Keep')),
          TextButton(key: const Key('usForms.confirmRemove'), onPressed: () => Navigator.of(dialog).pop(true), child: const Text('Remove')),
        ],
      ),
    );
    if (sure != true || !mounted) return;
    try {
      await saveAndConfirm(_api, 'remove_us_tax_form', {'taxYear': widget.taxYear, 'id': form.id});
      if (mounted) _reload();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Tax documents')),
      body: SafeArea(
        child: FutureBuilder<List<UsTaxForm>>(
          future: _forms,
          builder: (context, loaded) {
            final forms = loaded.data ?? const <UsTaxForm>[];
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                Text('Add every W-2, 1099 and 1098 you got for ${widget.taxYear}.', style: text.bodyLarge),
                const SizedBox(height: 6),
                Text('Employers, banks and brokers send them by January 31. Look in your mail, email, and their websites.', style: text.bodySmall?.copyWith(color: Palette.muted)),
                const SizedBox(height: 18),
                LayoutBuilder(
                  builder: (context, box) {
                    final scan = FilledButton(
                      key: const Key('usForms.scan'),
                      onPressed: _reading ? null : _scan,
                      child: Text(_reading ? 'Reading…' : 'Snap or upload'),
                    );
                    final type = OutlinedButton(key: const Key('usForms.type'), onPressed: _reading ? null : _pickKind, child: const Text('Type it in'));
                    final stacked = box.maxWidth < 340 || MediaQuery.textScalerOf(context).scale(10) > 13;
                    if (stacked) return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [scan, const SizedBox(height: 10), type]);
                    return Row(children: [Expanded(child: scan), const SizedBox(width: 10), Expanded(child: type)]);
                  },
                ),
                if (_note.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text(_note, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
                ],
                const SizedBox(height: 22),
                if (loaded.connectionState != ConnectionState.done)
                  const Center(child: CircularProgressIndicator())
                else if (loaded.hasError)
                  UsLoadError(inline: true, message: usLoadProblem(loaded.error, 'Your forms could not be loaded.'), onRetry: _reload)
                else if (forms.isEmpty)
                  const EmptyNote(text: 'No forms yet. Start with your W-2 if you had a job.')
                else
                  Panel(
                    children: [
                      for (final f in forms)
                        RowCard(
                          key: Key('usForms.form.${f.id}'),
                          leading: const TintTile(tint: Tint.ask, mark: Mark.paper),
                          title: '${f.kind}${f.payer.isEmpty ? '' : ' · ${f.payer}'}',
                          subtitle: [
                            if (f.headline != 0) dollars(f.headline),
                            if (f.withheld != 0) '${dollars(f.withheld)} withheld',
                            if (f.owner == 'spouse') 'Spouse',
                          ].join(' · '),
                          trailing: PopupMenuButton<String>(
                            key: Key('usForms.menu.${f.id}'),
                            tooltip: 'Edit or remove this ${f.kind}',
                            onSelected: (choice) async {
                              if (choice == 'remove') return _remove(f);
                              final kind = formKindOf(f.kind, await _kinds!);
                              if (kind != null && mounted) await _edit(kind, fields: f.amounts, id: f.id, owner: f.owner);
                            },
                            itemBuilder: (_) => const [
                              PopupMenuItem(value: 'edit', child: Text('Edit')),
                              PopupMenuItem(value: 'remove', child: Text('Remove')),
                            ],
                          ),
                          onTap: () async {
                            final kind = formKindOf(f.kind, await _kinds!);
                            if (kind != null && mounted) await _edit(kind, fields: f.amounts, id: f.id, owner: f.owner);
                          },
                        ),
                    ],
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}
