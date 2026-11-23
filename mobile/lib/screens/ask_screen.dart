import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../my/my_strings.dart';
import '../proposal_flow.dart';
import '../marks.dart';
import '../theme.dart';
import '../us/us_ai_permission.dart';
import '../uae/uae_edition.dart';
import '../uae/uae_strings.dart';
import '../widgets.dart';

class AskScreen extends StatefulWidget {
  const AskScreen({super.key, this.first});

  final String? first;

  @override
  State<AskScreen> createState() => _AskScreenState();
}

class _AskScreenState extends State<AskScreen> with ProposalFlow {
  static const _usStarters = [
    'Is my return ready to file?',
    'What is my refund so far?',
    'Which forms do I still need?',
    'Show deadlines',
  ];

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
        if (mounted) _send(first);
      });
    }
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send(String text, {String? shown}) async {
    final message = text.trim();
    if (message.isEmpty || busy) return;
    if (!await ensureUsAiPermission(context)) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Nothing was sent. You can finish your return without the assistant.')));
      return;
    }
    if (!mounted) return;
    _input.clear();
    say(message, shown: shown);
  }

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final us = AppScope.of(context).edition == 'US';
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            const TintTile(tint: Tint.ask, mark: Mark.ask, size: 34),
            const SizedBox(width: 12),
            Text(s.askMyCa),
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
                      if (uaeEdition(context))
                        EmptyNote(text: UaeStrings.of(context).askIntro)
                      else if (us)
                        const EmptyNote(
                          text: 'Ask about your return, your forms or a deadline. Your question goes to Anthropic\'s AI only if you allow it. '
                              'Nothing is saved until you confirm it, and every figure comes from MyCA\'s tax rules, not the AI. '
                              'MyCA is tax preparation software, not a CPA, enrolled agent or attorney, and does not give legal advice.',
                        )
                      else
                      EmptyNote(
                        text:
                            moneyCountry == 'GB'
                                ? 'Ask about your VAT, deadlines or invoices. '
                                    'Nothing is posted to your books until you confirm it. '
                                    'MyCA works from the rules it shows you; it is not a chartered accountant '
                                    'and does not give tax or legal advice.'
                                : inText(context, 'Ask about your GST, deadlines or invoices. Nothing is posted to your books until you confirm it. MyCA works from the rules it shows you; it is not a chartered accountant and does not give tax or legal advice.'),
                      ),
                      Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final starter in us ? _usStarters : _starters)
                            if (!uaeEdition(context) || starter != 'Dhanda kaisa chal raha hai?')
                            ActionChip(
                              label: Text(s.starter(starter)),
                              onPressed: () => _send(starter, shown: s.ar ? s.starter(starter) : null),
                            ),
                        ],
                      ),
                    ],
                  )
                : ListView(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                    children: [
                      for (final entry in entries)
                        if (entry.tone == BubbleTone.mine)
                          entry.toBubble()
                        else
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              entry.toBubble(),
                              TextButton.icon(
                                key: ValueKey('ask.report.${entries.indexOf(entry)}'),
                                onPressed: () => reportAnswer(context, entry.text),
                                style: TextButton.styleFrom(foregroundColor: Palette.muted, visualDensity: VisualDensity.compact),
                                icon: const Icon(Icons.flag_outlined, size: 16),
                                label: Text(myMalayOr(context, inText(context, 'Report this answer'), 'Laporkan jawapan ini')),
                              ),
                            ],
                          ),
                    ],
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
                      decoration: InputDecoration(
                        hintText: s.messageMyCa,
                      ),
                      onSubmitted: _send,
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    tooltip: s.send,
                    style: IconButton.styleFrom(
                      backgroundColor: paletteOf(context).ink,
                      foregroundColor: paletteOf(context).onInk,
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

const answerReportReasons = ['Wrong or misleading', 'Harmful or offensive', 'Something else'];

const _answerReportReasonsMalay = {'Wrong or misleading': 'Salah atau mengelirukan', 'Harmful or offensive': 'Berbahaya atau menyinggung', 'Something else': 'Lain-lain'};

String _reasonWords(BuildContext context, String reason) => switch (reason) {
  'Wrong or misleading' => inText(context, 'Wrong or misleading'),
  'Harmful or offensive' => inText(context, 'Harmful or offensive'),
  'Something else' => inText(context, 'Something else'),
  _ => reason,
};

Future<void> reportAnswer(BuildContext context, String answer) async {
  final state = AppScope.of(context);
  final messenger = ScaffoldMessenger.of(context);
  String w(String english, String malay) => myMalayOr(context, english, malay);
  final thanks = w(inText(context, 'Thank you. The answer was reported for review.'), 'Terima kasih. Jawapan ini telah dilaporkan untuk disemak.');
  final failed = w(inText(context, 'Could not send the report. Try again when you are online.'), 'Laporan tidak dapat dihantar. Cuba lagi apabila anda dalam talian.');
  final reason = await showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    builder: (context) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
            child: Text(w(inText(context, 'Report this answer'), 'Laporkan jawapan ini'), style: Theme.of(context).textTheme.titleMedium),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text(w(inText(context, 'Tell us what is wrong. The answer is sent to MyCA for review, without your books.'), 'Beritahu kami apa yang salah. Jawapan ini dihantar kepada MyCA untuk disemak, tanpa buku akaun anda.')),
          ),
          for (final reason in answerReportReasons)
            ListTile(key: ValueKey('ask.reason.$reason'), title: Text(w(_reasonWords(context, reason), _answerReportReasonsMalay[reason] ?? reason)), onTap: () => Navigator.of(context).pop(reason)),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
  if (reason == null) return;
  final sent = await state.reportAnswer(answer: answer, reason: reason);
  messenger.showSnackBar(SnackBar(content: Text(sent ? thanks : failed)));
}
