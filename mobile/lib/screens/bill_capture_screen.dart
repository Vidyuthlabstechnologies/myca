import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_services.dart';
import '../app_state.dart';
import '../format.dart';
import '../india/india_strings.dart';
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
  String _sha = '';
  String _note = '';
  bool _reading = false;
  bool _matchDismissed = false;

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
        (_) => _readStored(widget.documentSha256, widget.fileName.isEmpty ? inText(context, 'the file') : widget.fileName),
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
    final lang = indiaLang(context);
    setState(() {
      _note = '';
      _read = null;
      _reading = true;
      _fileName = name;
    });
    var note = '';
    Map<String, dynamic>? read;
    _sha = sha;
    _matchDismissed = false;
    try {
      final answer = await state.api.query('read_document', {'documentSha256': sha});
      final data = toolData(answer);
      if (data.isEmpty) {
        note = answer is Map && answer['error'] == 'MODEL_NOT_CONFIGURED'
            ? inLine(lang, 'Reading bills needs the model switched on by whoever runs your MyCA. Until then, add the bill by hand from Purchases.')
            : inLine(lang, 'The bill could not be read. Add it by hand from Purchases.');
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

  Future<void> _attach(Map<String, dynamic> match) => propose(inFormat(context, 'Attach {file} to {id}', {'file': _fileName, 'id': '${match['id']}'}), 'attach_document', {'documentSha256': _sha, 'id': '${match['id']}'});

  Widget _matchCard(Map<String, dynamic> match, TextTheme text) {
    final bill = match['kind'] == 'bill';
    final id = '${match['id']}';
    final when = '${match['date'] ?? ''}';
    final party = '${match['party'] ?? ''}';
    final parts = {'id': id, 'amount': rupees(match['amount'] as num? ?? 0), 'party': party, 'date': when};
    final looks = switch ((bill, party.isEmpty, when.isEmpty)) {
      (true, true, true) => inFormat(context, 'This looks like bill {id} already in the books: {amount}', parts),
      (true, false, true) => inFormat(context, 'This looks like bill {id} already in the books: {amount} to {party}', parts),
      (true, true, false) => inFormat(context, 'This looks like bill {id} already in the books: {amount} on {date}', parts),
      (true, false, false) => inFormat(context, 'This looks like bill {id} already in the books: {amount} to {party} on {date}', parts),
      (false, true, true) => inFormat(context, 'This looks like expense {id} already in the books: {amount}', parts),
      (false, false, true) => inFormat(context, 'This looks like expense {id} already in the books: {amount} to {party}', parts),
      (false, true, false) => inFormat(context, 'This looks like expense {id} already in the books: {amount} on {date}', parts),
      (false, false, false) => inFormat(context, 'This looks like expense {id} already in the books: {amount} to {party} on {date}', parts),
    };
    return Panel(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                looks,
                style: text.bodyMedium,
              ),
              const SizedBox(height: 10),
              FilledButton(onPressed: busy ? null : () => _attach(match), child: Text(inFormat(context, 'Attach to {id}', {'id': id}))),
              TextButton(onPressed: busy ? null : () => setState(() => _matchDismissed = true), child: Text(inText(context, 'It is a new bill'))),
            ],
          ),
        ),
      ],
    );
  }

  Future<void> _record() async {
    final proposal = Map<String, dynamic>.from(_read!['proposal'] as Map);
    final args = Map<String, Object?>.from(proposal['args'] as Map);
    await propose(inFormat(context, 'Bill from {name} read from {file}', {'name': '${args['partyName']}', 'file': _fileName}), '${proposal['tool']}', args);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final read = _read;
    final args = read == null ? null : Map<String, dynamic>.from((read['proposal'] as Map)['args'] as Map);
    final lines = args == null ? const <Map<String, dynamic>>[] : [for (final line in (args['lines'] as List? ?? const [])) if (line is Map) Map<String, dynamic>.from(line)];
    final warnings = read == null ? const <String>[] : [for (final w in (read['warnings'] as List? ?? const [])) '$w'];
    final matches = read == null ? const <Map<String, dynamic>>[] : [for (final m in (read['matches'] as List? ?? const [])) if (m is Map) Map<String, dynamic>.from(m)];
    final match = !_matchDismissed && matches.isNotEmpty ? matches.first : null;
    return Scaffold(
      appBar: AppBar(title: Text(inText(context, 'Read a bill'))),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              children: [
                Text(inText(context, 'Pick a photo, PDF or text of a supplier bill. MyCA reads the supplier, number, date and lines, then previews the purchase; nothing is posted until you confirm, and every figure is yours to correct.'), style: text.bodyMedium),
                const SizedBox(height: 14),
                if (read == null && pending == null)
                  FilledButton.icon(
                    onPressed: _reading || busy ? null : _pick,
                    icon: const Icon(Icons.photo_camera_outlined),
                    label: Text(_reading ? inFormat(context, 'Reading {file}…', {'file': _fileName}) : inText(context, 'Choose a bill')),
                  ),
                if (_note.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(_note, style: text.bodyMedium),
                ],
                if (read != null && args != null) ...[
                  const SizedBox(height: 10),
                  if (match != null && pending == null) ...[
                    _matchCard(match, text),
                    const SizedBox(height: 10),
                  ],
                  SectionLabel(inFormat(context, 'Read from {file}', {'file': _fileName})),
                  Panel(
                    children: [
                      RowCard(
                        leading: const TintTile(tint: Tint.purchases, mark: Mark.purchases),
                        title: '${args['partyName']}',
                        subtitle: [if (args['partyGstin'] != null) 'GSTIN ${args['partyGstin']}', if (args['supplierInvoiceNo'] != null) inFormat(context, 'Bill {number}', {'number': '${args['supplierInvoiceNo']}'}), if (args['date'] != null) longDate('${args['date']}')].join(' · '),
                      ),
                      for (final line in lines)
                        RowCard(
                          leading: const TintTile(tint: Tint.purchases, mark: Mark.comingUp),
                          title: '${line['description']}',
                          subtitle: [
                            line['gstRate'] != null
                                ? inFormat(context, '{qty} × {rate} at {gst}% GST', {'qty': '${line['qty']}', 'rate': rupees(line['rate'] as num? ?? 0), 'gst': '${line['gstRate']}'})
                                : '${line['qty']} × ${rupees(line['rate'] as num? ?? 0)}',
                            if (line['hsn'] != null && '${line['hsn']}'.isNotEmpty) 'HSN ${line['hsn']}',
                          ].join(' · '),
                        ),
                    ],
                  ),
                  for (final warning in warnings) ...[
                    const SizedBox(height: 6),
                    Text('! $warning', style: text.bodySmall),
                  ],
                  const SizedBox(height: 14),
                  if (pending == null && match == null) ...[
                    FilledButton(onPressed: busy || lines.isEmpty ? null : _record, child: Text(inText(context, 'Preview the purchase'))),
                    TextButton(onPressed: busy ? null : _pick, child: Text(inText(context, 'Choose another bill'))),
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
