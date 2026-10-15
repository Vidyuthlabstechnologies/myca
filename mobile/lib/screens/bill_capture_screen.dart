import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_services.dart';
import '../app_state.dart';
import '../format.dart';
import '../marks.dart';
import '../proposal_flow.dart';
import '../theme.dart';
import '../widgets.dart';

class BillCaptureScreen extends StatefulWidget {
  const BillCaptureScreen({
    super.key,
    this.initial,
    this.documentSha256 = '',
    this.fileName = '',
  });

  final PickedFile? initial;
  final String documentSha256;
  final String fileName;

  @override
  State<BillCaptureScreen> createState() => _BillCaptureScreenState();
}

class _BillCaptureScreenState extends State<BillCaptureScreen> with ProposalFlow {
  Map<String, dynamic>? _read;
  String _fileName = '';
  String _note = '';
  bool _reading = false;

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  Future<void> onPosted() async {
    await AppScope.of(context).refresh();
    if (mounted) setState(() => _read = null);
  }

  @override
  void initState() {
    super.initState();
    final shared = widget.initial;
    if (shared != null) WidgetsBinding.instance.addPostFrameCallback((_) => _readFile(shared));
    if (shared == null && widget.documentSha256.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _readStored(widget.documentSha256, widget.fileName.isEmpty ? 'the file' : widget.fileName),
      );
    }
  }

  Future<void> _pick() async {
    final state = AppScope.of(context);
    setState(() {
      _note = '';
      _read = null;
    });
    final picked = await state.pickAnyFile();
    if (picked == null || !mounted) return;
    await _readFile(picked);
  }

  Future<void> _readFile(PickedFile picked) async {
    final state = AppScope.of(context);
    setState(() {
      _note = '';
      _read = null;
      _reading = true;
      _fileName = picked.name;
    });
    String sha;
    try {
      sha = await state.api.upload(picked.name, dataUrlOf(picked));
    } on MycaApiException catch (err) {
      if (!mounted) return;
      setState(() {
        _reading = false;
        _note = err.message;
      });
      return;
    }
    if (!mounted) return;
    await _readStored(sha, picked.name);
  }

  Future<void> _readStored(String sha, String name) async {
    final state = AppScope.of(context);
    setState(() {
      _note = '';
      _read = null;
      _reading = true;
      _fileName = name;
    });
    var note = '';
    Map<String, dynamic>? read;
    try {
      final answer = await state.api.query('read_document', {'documentSha256': sha});
      final data = toolData(answer);
      if (data.isEmpty) {
        note = answer is Map && answer['error'] == 'MODEL_NOT_CONFIGURED'
            ? 'Reading bills needs the model switched on by whoever runs your MyCA. Until then, add the bill by hand from Purchases.'
            : 'The bill could not be read. Add it by hand from Purchases.';
      } else {
        read = data;
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() {
      _reading = false;
      _read = read;
      _note = note;
    });
  }

  Future<void> _record() async {
    final proposal = Map<String, dynamic>.from(_read!['proposal'] as Map);
    final args = Map<String, Object?>.from(proposal['args'] as Map);
    await propose('Bill from ${args['partyName']} read from $_fileName', '${proposal['tool']}', args);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final read = _read;
    final args = read == null ? null : Map<String, dynamic>.from((read['proposal'] as Map)['args'] as Map);
    final lines = args == null ? const <Map<String, dynamic>>[] : [for (final line in (args['lines'] as List? ?? const [])) if (line is Map) Map<String, dynamic>.from(line)];
    final warnings = read == null ? const <String>[] : [for (final w in (read['warnings'] as List? ?? const [])) '$w'];
    return Scaffold(
      appBar: AppBar(title: const Text('Read a bill')),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              children: [
                Text('Pick a photo, PDF or text of a supplier bill. MyCA reads the supplier, number, date and lines, then previews the purchase; nothing is posted until you confirm, and every figure is yours to correct.', style: text.bodyMedium),
                const SizedBox(height: 14),
                if (read == null && pending == null)
                  FilledButton.icon(
                    onPressed: _reading || busy ? null : _pick,
                    icon: const Icon(Icons.photo_camera_outlined),
                    label: Text(_reading ? 'Reading $_fileName…' : 'Choose a bill'),
                  ),
                if (_note.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(_note, style: text.bodyMedium),
                ],
                if (read != null && args != null) ...[
                  const SizedBox(height: 10),
                  SectionLabel('Read from $_fileName'),
                  Panel(
                    children: [
                      RowCard(
                        leading: const TintTile(tint: Tint.purchases, mark: Mark.purchases),
                        title: '${args['partyName']}',
                        subtitle: [if (args['partyGstin'] != null) 'GSTIN ${args['partyGstin']}', if (args['supplierInvoiceNo'] != null) 'Bill ${args['supplierInvoiceNo']}', if (args['date'] != null) longDate('${args['date']}')].join(' · '),
                      ),
                      for (final line in lines)
                        RowCard(
                          leading: const TintTile(tint: Tint.purchases, mark: Mark.comingUp),
                          title: '${line['description']}',
                          subtitle: '${line['qty']} × ${rupees(line['rate'] as num? ?? 0)}${line['gstRate'] != null ? ' at ${line['gstRate']}% GST' : ''}${line['hsn'] != null && '${line['hsn']}'.isNotEmpty ? ' · HSN ${line['hsn']}' : ''}',
                        ),
                    ],
                  ),
                  for (final warning in warnings) ...[
                    const SizedBox(height: 6),
                    Text('! $warning', style: text.bodySmall),
                  ],
                  const SizedBox(height: 14),
                  if (pending == null) ...[
                    FilledButton(onPressed: busy || lines.isEmpty ? null : _record, child: const Text('Preview the purchase')),
                    TextButton(onPressed: busy ? null : _pick, child: const Text('Choose another bill')),
                  ],
                ],
                for (final entry in entries) entry.toBubble(),
              ],
            ),
          ),
          if (pending != null) ProposalBar(busy: busy, onPost: postPending, onDiscard: discardPending),
        ],
      ),
    );
  }
}
