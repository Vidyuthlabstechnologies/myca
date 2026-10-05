import 'package:flutter/widgets.dart';

import 'api/models.dart';
import 'api/myca_api.dart';
import 'widgets.dart';

class ThreadEntry {
  const ThreadEntry({
    required this.text,
    required this.tone,
    this.label,
    this.footnotes = const [],
  });

  final String text;
  final BubbleTone tone;
  final String? label;
  final List<String> footnotes;

  Bubble toBubble() => Bubble(
    key: ObjectKey(this),
    text: text,
    tone: tone,
    label: label,
    footnotes: footnotes,
    animate: true,
  );
}

mixin ProposalFlow<T extends StatefulWidget> on State<T> {
  final entries = <ThreadEntry>[];
  ChatPreview? pending;
  bool busy = false;

  MycaApi get api;

  Future<void> onPosted();

  void onThreadChanged() {}

  Future<void> _run(String? said, Future<ChatReply> Function() call) async {
    if (busy) return;
    setState(() {
      if (said != null) {
        entries.add(ThreadEntry(text: said, tone: BubbleTone.mine));
      }
      pending = null;
      busy = true;
    });
    try {
      final reply = await call();
      if (!mounted) return;
      setState(() {
        final preview = reply.preview;
        if (preview != null) {
          entries.add(
            ThreadEntry(
              text: preview.summary,
              tone: BubbleTone.pending,
              label: 'Not posted yet',
              footnotes: preview.effects,
            ),
          );
          pending = preview;
        } else if (reply.posted) {
          entries.add(
            ThreadEntry(
              text: reply.reply,
              tone: BubbleTone.posted,
              label: 'Posted',
            ),
          );
        } else if (reply.blocked) {
          entries.add(
            ThreadEntry(
              text: reply.reply,
              tone: BubbleTone.problem,
              label: 'Not posted',
            ),
          );
        } else {
          entries.add(ThreadEntry(text: reply.reply, tone: BubbleTone.plain));
        }
      });
      if (reply.posted) await onPosted();
    } on MycaApiException catch (err) {
      if (!mounted) return;
      setState(
        () => entries.add(
          ThreadEntry(text: err.message, tone: BubbleTone.problem),
        ),
      );
    } finally {
      if (mounted) {
        setState(() => busy = false);
        onThreadChanged();
      }
    }
  }

  Future<void> say(String message) => _run(message, () => api.chat(message));

  Future<void> propose(String said, String tool, Map<String, Object?> args) =>
      _run(said, () => api.propose(tool, args));

  Future<void> postPending() {
    final preview = pending;
    if (preview == null) return Future.value();
    return _run(null, () => api.confirm(preview.token));
  }

  Future<void> discardPending() => _run(null, () => api.discard());
}
