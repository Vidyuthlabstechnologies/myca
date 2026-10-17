import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../proposal_flow.dart';
import '../theme.dart';
import '../widgets.dart';

class RemindCustomerScreen extends StatefulWidget {
  const RemindCustomerScreen({super.key, required this.customer});

  final String customer;

  @override
  State<RemindCustomerScreen> createState() => _RemindCustomerScreenState();
}

class _RemindCustomerScreenState extends State<RemindCustomerScreen>
    with ProposalFlow {
  final _message = TextEditingController();
  Future<CollectionDraft?>? _draft;
  String _sentNote = '';

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _draft ??= _load();
  }

  Future<CollectionDraft?> _load() async {
    final draft = CollectionDraft.fromTool(
      await api.query('collection_drafts', {'customer': widget.customer}),
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
          ? 'Your phone offered the message to WhatsApp, email or another app. MyCA will remind you to check for the payment in a week.'
          : 'Your phone could not open the share sheet. Copy the message and send it yourself.',
    );
  }

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() => propose(
    'Send this payment reminder from my phone',
    'record_collection_reminder',
    {
      'customer': widget.customer,
      'message': _message.text.trim(),
      'channel': 'whatsapp',
    },
  );

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Remind customer')),
      body: FutureBuilder<CollectionDraft?>(
        future: _draft,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final draft = snap.data;
          if (draft == null) {
            return EmptyNote(
              text:
                  '${widget.customer} has nothing overdue, or paid something in the last two weeks. Match your bank statement before chasing.',
            );
          }
          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  children: [
                    Text(draft.customer, style: text.headlineSmall),
                    const SizedBox(height: 4),
                    Text(
                      '${rupees(draft.total)} overdue across ${draft.invoices == 1 ? '1 invoice' : '${draft.invoices} invoices'}, oldest ${draft.oldestDaysLate} days late.',
                      style: text.bodyMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${draft.customer} ${draft.scoreWords}, so this draft is ${draft.tone}.',
                      style: text.bodyMedium?.copyWith(color: Palette.muted),
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
                        maxLength: 2000,
                        decoration: const InputDecoration(
                          labelText: 'Message',
                          helperText:
                              'Their invoice numbers, dates and amounts, and your bank details. Edit it as you like.',
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
