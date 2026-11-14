import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../proposal_flow.dart';
import '../marks.dart';
import '../theme.dart';
import '../widgets.dart';

class AskScreen extends StatefulWidget {
  const AskScreen({super.key, this.first});

  final String? first;

  @override
  State<AskScreen> createState() => _AskScreenState();
}

class _AskScreenState extends State<AskScreen> with ProposalFlow {
  static const _starters = [
    'How is business?',
    'Dhanda kaisa chal raha hai?',
    'Who owes me?',
    'Who should I chase?',
    'Who do I need to pay?',
    'Cash forecast',
    'Can I make payroll?',
    'What should I reorder?',
    'How much tax should I set aside?',
    'Close the month',
    'My reminders',
    'Show deadlines',
  ];

  final _input = TextEditingController();
  final _scroll = ScrollController();

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  Future<void> onPosted() => AppScope.of(context).refresh();

  @override
  void onThreadChanged() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  @override
  void initState() {
    super.initState();
    final first = widget.first?.trim() ?? '';
    if (first.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) say(first);
      });
    }
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _send(String text) {
    final message = text.trim();
    if (message.isEmpty || busy) return;
    _input.clear();
    say(message);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: const Row(
          children: [
            TintTile(tint: Tint.ask, mark: Mark.ask, size: 34),
            SizedBox(width: 12),
            Text('Ask MyCA'),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: entries.isEmpty
                ? ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      const EmptyNote(
                        text:
                            'Ask about your GST, deadlines or invoices. '
                            'Nothing is posted to your books until you confirm it. '
                            'MyCA works from the rules it shows you; it is not a chartered accountant '
                            'and does not give tax or legal advice.',
                      ),
                      Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final starter in _starters)
                            ActionChip(
                              label: Text(starter),
                              onPressed: () => _send(starter),
                            ),
                        ],
                      ),
                    ],
                  )
                : ListView(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                    children: [for (final entry in entries) entry.toBubble()],
                  ),
          ),
          if (pending != null)
            ProposalBar(
              busy: busy,
              onPost: postPending,
              onDiscard: discardPending,
            ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.send,
                      decoration: const InputDecoration(
                        hintText: 'Message MyCA',
                      ),
                      onSubmitted: _send,
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    tooltip: 'Send',
                    style: IconButton.styleFrom(
                      backgroundColor: Palette.ink,
                      foregroundColor: Palette.onInk,
                      minimumSize: const Size(50, 50),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(radiusControl),
                      ),
                    ),
                    icon: const Icon(Icons.arrow_upward),
                    onPressed: busy ? null : () => _send(_input.text),
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
