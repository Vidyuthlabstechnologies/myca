import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../proposal_flow.dart';
import '../theme.dart';
import '../widgets.dart';
import '../widgets/utf16_limit.dart';

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
    final lang = indiaLang(context);
    final shared = await AppScope.of(context).shareText(_message.text.trim());
    if (!mounted) return;
    setState(
      () => _sentNote = shared
          ? inLine(lang, 'Your phone offered the message to WhatsApp, email or another app. MyCA will remind you to check for the payment in a week.')
          : inLine(lang, 'Your phone could not open the share sheet. Copy the message and send it yourself.'),
    );
  }

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() => propose(
    inText(context, 'Send this payment reminder from my phone'),
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
      appBar: AppBar(title: Text(inText(context, 'Remind customer'))),
      body: FutureBuilder<CollectionDraft?>(
        future: _draft,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final draft = snap.data;
          if (draft == null) {
            return EmptyNote(
              text: inFormat(
                context,
                '{name} has nothing overdue, or paid something in the last two weeks. Match your bank statement before chasing.',
                {'name': widget.customer},
              ),
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
                      inCount(
                        context,
                        draft.invoices,
                        '{amount} overdue across 1 invoice, oldest {days} days late.',
                        '{amount} overdue across {n} invoices, oldest {days} days late.',
                        {'amount': rupees(draft.total), 'days': draft.oldestDaysLate},
                      ),
                      style: text.bodyMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      inFormat(context, '{name} {score}, so this draft is {tone}.', {
                        'name': draft.customer,
                        'score': _scoreWords(context, draft.scoreWords),
                        'tone': _tone(context, draft.tone),
                      }),
                      style: text.bodyMedium?.copyWith(color: Palette.muted),
                    ),
                    if (draft.timesSent > 0)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          draft.timesSent > 1
                              ? inFormat(context, 'You reminded them on {date} ({n} times so far).', {'date': longDate(draft.lastSent), 'n': draft.timesSent})
                              : inFormat(context, 'You reminded them on {date}.', {'date': longDate(draft.lastSent)}),
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
                        decoration: InputDecoration(
                          labelText: inText(context, 'Message'),
                          helperText:
                              inText(context, 'Their invoice numbers, dates and amounts, and your bank details. Edit it as you like.'),
                        ),
                      ),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: busy ? null : _send,
                        child: Text(inText(context, 'Send from my phone')),
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
                        child: Text(inText(context, 'Copy message')),
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
                  postLabel: inText(context, 'Yes, send it'),
                ),
            ],
          );
        },
      ),
    );
  }
}

String _scoreWords(BuildContext context, String words) => switch (words) {
  'usually pays on time' => inText(context, 'usually pays on time'),
  'has not paid enough invoices yet to judge' => inText(context, 'has not paid enough invoices yet to judge'),
  'is sometimes late' => inText(context, 'is sometimes late'),
  'is late more often than not' => inText(context, 'is late more often than not'),
  _ => words,
};

String _tone(BuildContext context, String tone) => switch (tone) {
  'gentle' => inText(context, 'gentle'),
  'neutral' => inText(context, 'neutral'),
  'firm' => inText(context, 'firm'),
  _ => tone,
};
