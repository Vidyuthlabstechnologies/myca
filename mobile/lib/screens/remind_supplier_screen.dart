import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../proposal_flow.dart';
import '../theme.dart';
import '../widgets.dart';
import '../widgets/utf16_limit.dart';

class RemindSupplierScreen extends StatefulWidget {
  const RemindSupplierScreen({
    super.key,
    required this.supplier,
    required this.period,
  });

  final String supplier;
  final String period;

  @override
  State<RemindSupplierScreen> createState() => _RemindSupplierScreenState();
}

class _RemindSupplierScreenState extends State<RemindSupplierScreen>
    with ProposalFlow {
  final _message = TextEditingController();
  Future<SupplierReminderDraft?>? _draft;
  String _sentNote = '';

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _draft ??= _load();
  }

  Future<SupplierReminderDraft?> _load() async {
    final draft = SupplierReminderDraft.fromTool(
      await api.query('supplier_reminder_draft', {
        'supplier': widget.supplier,
        'period': widget.period,
      }),
    );
    if (draft != null) _message.text = draft.message;
    return draft;
  }

  @override
  Future<void> onPosted() async {
    HapticFeedback.mediumImpact();
    final shared = await AppScope.of(context).shareText(_message.text.trim());
    if (!mounted) return;
    setState(
      () => _sentNote = shared
          ? 'Your phone offered the message to WhatsApp, email or another app.'
          : 'Your phone could not open the share sheet. Copy the message and send it yourself.',
    );
  }

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() =>
      propose('Send this reminder from my phone', 'record_supplier_reminder', {
        'supplier': widget.supplier,
        'period': widget.period,
        'message': _message.text.trim(),
        'channel': 'other',
      });

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Remind supplier')),
      body: FutureBuilder<SupplierReminderDraft?>(
        future: _draft,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final draft = snap.data;
          if (draft == null) {
            return const EmptyNote(
              text: 'There is nothing to ask this supplier for this month.',
            );
          }
          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  children: [
                    Text(draft.supplier, style: text.headlineSmall),
                    const SizedBox(height: 4),
                    Text(
                      '${draft.bills == 1 ? '1 bill' : '${draft.bills} bills'} for ${monthLabel(draft.period)} · ${rupees(draft.credit)} of your input credit waiting',
                      style: text.bodyMedium,
                    ),
                    if (draft.timesSent > 0)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          'You reminded them on ${longDate(draft.lastSent)}${draft.timesSent > 1 ? ' (${draft.timesSent} times so far)' : ''}.',
                          style: text.bodyMedium?.copyWith(color: Palette.warn),
                        ),
                      ),
                    const SizedBox(height: 16),
                    if (pending == null && _sentNote.isEmpty) ...[
                      TextField(
                        controller: _message,
                        minLines: 6,
                        maxLines: 14,
                        inputFormatters: const [Utf16LengthLimit(2000)],
                        buildCounter: (context, {required currentLength, required isFocused, maxLength}) => Text(
                          '${_message.text.length}/2000',
                          style: text.bodySmall?.copyWith(color: Palette.muted),
                        ),
                        decoration: const InputDecoration(
                          labelText: 'Message',
                          helperText:
                              'Only their own bill numbers, dates and amounts. Edit it as you like.',
                        ),
                      ),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: busy ? null : _send,
                        child: const Text('Send from my phone'),
                      ),
                    ],
                    for (final entry in entries) entry.toBubble(),
                    if (_sentNote.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(_sentNote, style: text.bodyMedium),
                      const SizedBox(height: 12),
                      OutlinedButton(
                        onPressed: () => Clipboard.setData(
                          ClipboardData(text: _message.text.trim()),
                        ),
                        child: const Text('Copy message'),
                      ),
                    ],
                  ],
                ),
              ),
              if (pending != null)
                ProposalBar(
                  busy: busy,
                  onPost: postPending,
                  onDiscard: discardPending,
                  postLabel: 'Yes, send it',
                ),
            ],
          );
        },
      ),
    );
  }
}
