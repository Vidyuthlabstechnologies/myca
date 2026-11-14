import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../api/myca_api.dart';
import '../../theme.dart';
import '../../uae/uae_format.dart';
import '../../uae/uae_strings.dart';
import 'uae_widgets.dart';

const uaeWriteCodes = [
  'NO_LINES',
  'BAD_LINES',
  'EMIRATE_REQUIRED',
  'BAD_EMIRATE',
  'BAD_TRN',
  'EXCHANGE_RATE_REQUIRED',
  'ZERO_AMOUNT',
  'DUPLICATE_ID',
  'PERIOD_LOCKED',
  'INVOICE_NOT_FOUND',
  'MORE_THAN_INVOICE',
  'REASON_REQUIRED',
  'ALREADY_CREDITED',
  'INVALID_DATE',
  'BAD_CURRENCY',
  'BAD_AMOUNT',
];

class UaeWriteFailure {
  const UaeWriteFailure({required this.code, required this.problems, required this.said});

  final String code;
  final List<Map<String, dynamic>> problems;
  final List<String> said;
}

List<Map<String, dynamic>> _resultsOf(Map<String, dynamic> raw, String tool) => [
  for (final entry in (raw['tools'] as List? ?? const []))
    if (entry is Map && (entry['name'] == null || entry['name'] == tool) && entry['result'] is Map) Map<String, dynamic>.from(entry['result'] as Map),
];

UaeWriteFailure uaeWriteFailure(ChatReply reply, String tool) {
  final raw = reply.raw;
  final preview = uaeMap(raw['preview']);
  final places = <Map<String, dynamic>>[raw, preview, for (final result in _resultsOf(raw, tool)) ...[result, uaeMap(result['data'])]];
  var code = '';
  var problems = const <Map<String, dynamic>>[];
  for (final place in places) {
    final error = place['error'];
    if (code.isEmpty && error is String && error.isNotEmpty) code = error;
    final listed = uaeRows(place['problems']);
    if (problems.isEmpty && listed.isNotEmpty) problems = listed;
  }
  final blockers = [for (final b in (preview['blockers'] as List? ?? const [])) '$b'];
  if (code.isEmpty) {
    final found = RegExp('\\b(${uaeWriteCodes.join('|')})\\b').firstMatch([reply.reply, ...blockers].join('\n'));
    if (found != null) code = found.group(1)!;
  }
  final said = blockers.isNotEmpty ? blockers : [if (reply.reply.trim().isNotEmpty) reply.reply.trim()];
  return UaeWriteFailure(code: code, problems: problems, said: said);
}

Map<String, dynamic> uaeWriteResult(ChatReply reply, String tool) {
  for (final result in _resultsOf(reply.raw, tool)) {
    return {...result, ...uaeMap(result['data'])};
  }
  return const <String, dynamic>{};
}

List<String> uaeDescribeFailure(UaeStrings s, UaeWriteFailure failure, {String currency = ''}) {
  final out = <String>[];
  final mapped = s.writeError(failure.code, currency: currency);
  if (mapped.isNotEmpty) out.add(mapped);
  for (final problem in failure.problems) {
    final field = uaeText(problem['field']);
    final why = uaeText(problem['why']);
    final line = problem['line'];
    if (line is num) {
      out.add(s.lineProblem(line.toInt() + 1, s.fieldName(field), why));
    } else {
      out.add([if (field.isNotEmpty) s.fieldName(field), why].where((part) => part.isNotEmpty).join(': '));
    }
  }
  if (out.isEmpty) out.addAll(failure.said);
  if (out.isEmpty) out.add(s.couldNotWorkOut);
  return out;
}

mixin UaeWriteFlow<T extends StatefulWidget> on State<T> {
  ChatPreview? held;
  bool writing = false;
  List<String> writeProblems = const [];
  String _tool = '';
  String _currency = '';

  MycaApi get api;

  Future<void> onWritten(Map<String, dynamic> result, ChatReply reply);

  void clearWriteProblems() {
    if (writeProblems.isEmpty) return;
    setState(() => writeProblems = const []);
  }

  void showWriteProblems(List<String> problems) => setState(() => writeProblems = problems);

  Future<void> writeAe(String tool, Map<String, Object?> args) async {
    if (writing) return;
    _tool = tool;
    _currency = uaeText(args['currency']);
    setState(() {
      writing = true;
      held = null;
      writeProblems = const [];
    });
    await _run(() => api.propose(tool, args));
  }

  Future<void> confirmAe() async {
    final preview = held;
    if (preview == null || writing) return;
    setState(() => writing = true);
    await _run(() => api.confirm(preview.token));
  }

  Future<void> discardAe() async {
    if (writing) return;
    setState(() => writing = true);
    try {
      await api.discard();
    } on MycaApiException {
      held = null;
    }
    if (!mounted) return;
    setState(() {
      held = null;
      writing = false;
    });
  }

  Future<void> _run(Future<ChatReply> Function() call) async {
    ChatReply? reply;
    var problems = const <String>[];
    try {
      reply = await call();
    } on MycaApiException catch (err) {
      problems = [err.message];
    }
    if (!mounted) return;
    final s = UaeStrings.of(context);
    if (reply != null && reply.preview != null) {
      setState(() {
        held = reply!.preview;
        writing = false;
      });
      return;
    }
    if (reply != null && reply.posted) {
      setState(() {
        held = null;
        writing = false;
      });
      await onWritten(uaeWriteResult(reply, _tool), reply);
      return;
    }
    if (reply != null) problems = uaeDescribeFailure(s, uaeWriteFailure(reply, _tool), currency: _currency);
    setState(() {
      held = null;
      writing = false;
      writeProblems = problems;
    });
  }
}

class UaeHeldPreview extends StatelessWidget {
  const UaeHeldPreview({super.key, required this.preview});

  final ChatPreview preview;

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final text = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(color: Palette.warnSoft, borderRadius: BorderRadius.circular(radiusCard), border: Border.all(color: Palette.line)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(s.notPostedYet, style: text.labelMedium?.copyWith(color: Palette.ink)),
          const SizedBox(height: 4),
          UaeAutoText(preview.summary, style: text.bodyMedium?.copyWith(color: Palette.ink)),
          for (final effect in preview.effects) ...[
            const SizedBox(height: 4),
            UaeAutoText(effect, style: text.bodySmall),
          ],
        ],
      ),
    );
  }
}

class UaeDoneCard extends StatelessWidget {
  const UaeDoneCard({super.key, required this.title, this.notes = const [], this.actions = const []});

  final String title;
  final List<String> notes;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final text = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(color: Palette.accentSoft, borderRadius: BorderRadius.circular(radiusCard), border: Border.all(color: Palette.line)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(s.posted, style: text.labelMedium?.copyWith(color: Palette.ink)),
          const SizedBox(height: 4),
          UaeAutoText(title, style: text.titleSmall?.copyWith(color: Palette.ink)),
          for (final note in notes) ...[
            const SizedBox(height: 6),
            UaeAutoText(note, style: text.bodySmall),
          ],
          if (actions.isNotEmpty) ...[
            const SizedBox(height: 10),
            Wrap(spacing: 10, runSpacing: 8, children: actions),
          ],
        ],
      ),
    );
  }
}
