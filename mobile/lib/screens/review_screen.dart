import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../theme.dart';
import 'ca_screen.dart';

class ReviewScreen extends StatefulWidget {
  const ReviewScreen({
    super.key,
    required this.period,
    this.tool = 'gst_review',
    this.answerTool = 'gst_review_answer',
    this.title = 'Review the return',
    this.extraArgs = const <String, Object?>{},
  });

  final String period;
  final String tool;
  final String answerTool;
  final String title;
  final Map<String, Object?> extraArgs;

  @override
  State<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends State<ReviewScreen> {
  Future<GstReview?>? _review;
  bool _busy = false;
  String _message = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _review ??= _load();
  }

  Future<GstReview?> _load() async => GstReview.fromTool(
    await AppScope.of(
      context,
    ).api.query(widget.tool, {'period': widget.period, ...widget.extraArgs}),
  );

  void _reload({String message = ''}) {
    final next = _load();
    setState(() {
      _review = next;
      _message = message;
    });
  }

  Future<void> _answer(
    GstReview review,
    ReviewStep step,
    String answer, {
    String note = '',
  }) async {
    final api = AppScope.of(context).api;
    setState(() {
      _busy = true;
      _message = '';
    });
    var message = '';
    try {
      final held = await api.propose(widget.answerTool, {
        'period': review.period,
        ...widget.extraArgs,
        'step': step.id,
        'answer': answer,
        'draftHash': review.draftHash,
        if (note.isNotEmpty) 'note': note,
      });
      final preview = held.preview;
      if (preview == null) {
        message = held.reply;
      } else {
        final done = await api.confirm(preview.token);
        message = done.posted && answer == 'correct' ? '' : done.reply;
      }
    } on MycaApiException catch (err) {
      message = err.message;
    }
    if (!mounted) return;
    setState(() => _busy = false);
    _reload(message: message);
  }

  Future<void> _wrong(GstReview review, ReviewStep step) async {
    final note = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => const _WrongSheet(),
    );
    if (note == null || !mounted) return;
    await _answer(review, step, 'wrong', note: note);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: FutureBuilder<GstReview?>(
        future: _review,
        builder: (context, state) {
          if (state.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final review = state.data;
          if (review == null) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('The review could not be loaded.'),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _reload,
                    child: const Text('Try again'),
                  ),
                ],
              ),
            );
          }
          return _ReviewBody(
            review: review,
            busy: _busy,
            message: _message,
            onYes: (step) => _answer(
              review,
              step,
              step.id == 'approve' ? 'approve' : 'correct',
            ),
            onNo: (step) => step.id == 'approve'
                ? Navigator.of(context).pop()
                : _wrong(review, step),
          );
        },
      ),
    );
  }
}

class _ReviewBody extends StatelessWidget {
  const _ReviewBody({
    required this.review,
    required this.busy,
    required this.message,
    required this.onYes,
    required this.onNo,
  });

  final GstReview review;
  final bool busy;
  final String message;
  final void Function(ReviewStep) onYes;
  final void Function(ReviewStep) onNo;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    if (review.empty) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          'There is nothing dated in ${review.month} to review.',
          style: text.bodyLarge,
        ),
      );
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
      children: [
        Text(review.month.toUpperCase(), style: text.labelSmall),
        const SizedBox(height: 4),
        Text(
          review.approved
              ? 'You approved these figures on ${longDate(review.approvedOn)}.'
              : 'Check each part. Nothing is filed from here.',
          style: text.bodyLarge,
        ),
        if (review.changed && !review.approved) ...[
          const SizedBox(height: 10),
          Text(
            'Your books for this month changed after you last confirmed, so the review starts again.',
            style: text.bodyMedium?.copyWith(
              color: Palette.warn,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
        if (message.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(message, style: text.bodyMedium?.copyWith(color: Palette.ink)),
        ],
        const SizedBox(height: 16),
        for (final step in review.steps) ...[
          _StepCard(
            step: step,
            current: step.id == review.next,
            busy: busy,
            onYes: () => onYes(step),
            onNo: () => onNo(step),
          ),
          const SizedBox(height: 12),
        ],
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: busy
                ? null
                : () => askMyCa(
                    context,
                    subject: {'kind': 'period', 'period': review.period},
                    about: 'the ${review.month} return',
                  ),
            child: Text('Ask my CA about ${review.month}'),
          ),
        ),
        const SizedBox(height: 12),
        if (review.approved)
          Text(
            'Next: save the GSTR-1 file from Taxes and upload it on the GST portal, or send it to your CA.',
            style: text.bodyMedium,
          ),
      ],
    );
  }
}

class _StepCard extends StatelessWidget {
  const _StepCard({
    required this.step,
    required this.current,
    required this.busy,
    required this.onYes,
    required this.onNo,
  });

  final ReviewStep step;
  final bool current;
  final bool busy;
  final VoidCallback onYes;
  final VoidCallback onNo;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final done = step.status == 'confirmed';
    final wrong = step.status == 'wrong';
    final open = current || wrong;
    final statusLine = done
        ? (step.id == 'approve' ? 'Approved' : 'Confirmed')
        : wrong
        ? 'Marked not right${step.note.isEmpty ? '' : ': ${step.note}'}'
        : step.waitingFor != null
        ? 'Waiting for the step above'
        : '';
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Palette.surface,
        borderRadius: BorderRadius.circular(radiusCard),
        border: Border.all(color: current ? Palette.ink : Palette.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(step.title, style: text.titleMedium)),
              if (done)
                const Icon(Icons.check, size: 18, color: Palette.accent),
            ],
          ),
          if (statusLine.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                statusLine,
                style: text.bodySmall?.copyWith(
                  color: wrong
                      ? Palette.danger
                      : (done ? Palette.accent : Palette.muted),
                ),
              ),
            ),
          if (open || done) ...[
            const SizedBox(height: 10),
            for (final line in step.lines)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        line.label,
                        style: line.strong ? text.titleMedium : text.bodyMedium,
                      ),
                    ),
                    if (line.amount != null)
                      Text(
                        rupees(line.amount!),
                        style:
                            (line.strong ? text.titleMedium : text.bodyMedium)
                                ?.copyWith(fontFeatures: moneyFigures),
                      ),
                  ],
                ),
              ),
          ],
          if (open) ...[
            const SizedBox(height: 10),
            Text(step.explain, style: text.bodySmall),
            const SizedBox(height: 14),
            Text(step.question, style: text.titleMedium),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: busy ? null : onYes,
                    child: Text(step.yes),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton(
                    onPressed: busy ? null : onNo,
                    child: Text(step.no),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _WrongSheet extends StatefulWidget {
  const _WrongSheet();

  @override
  State<_WrongSheet> createState() => _WrongSheetState();
}

class _WrongSheetState extends State<_WrongSheet> {
  final _note = TextEditingController();

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
          Text('What is not right?', style: text.headlineSmall),
          const SizedBox(height: 6),
          Text(
            'Fix the entry in its chat. When the figures change, this step opens again.',
            style: text.bodySmall,
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _note,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Note for yourself or your CA (optional)',
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () => Navigator.of(context).pop(_note.text.trim()),
              child: const Text('Mark as not right'),
            ),
          ),
        ],
      ),
    );
  }
}
