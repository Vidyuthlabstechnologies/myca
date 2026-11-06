import 'package:flutter/material.dart';

import 'api/models.dart';
import 'marks.dart';
import 'theme.dart';

class RulesStatusNote extends StatelessWidget {
  const RulesStatusNote({super.key, required this.status});

  final Future<RulesStatus?> status;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return FutureBuilder<RulesStatus?>(
      future: status,
      builder: (context, snap) {
        final rules = snap.data;
        if (rules == null) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(top: 26),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SectionLabel('Statutory rules'),
              Text(rules.summary, style: text.bodyMedium),
              for (final family in rules.attention)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text('Needs an update: $family', style: text.bodyMedium?.copyWith(color: Palette.warn)),
                ),
              for (final note in rules.notes)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(note, style: text.bodySmall?.copyWith(color: Palette.muted)),
                ),
            ],
          ),
        );
      },
    );
  }
}

class TintTile extends StatelessWidget {
  const TintTile({
    super.key,
    required this.tint,
    this.mark,
    this.letter,
    this.size = 40,
  });

  final Tint tint;
  final Mark? mark;
  final String? letter;
  final double size;

  @override
  Widget build(BuildContext context) {
    final glyph = mark;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: glyph == null ? Palette.sunken : Palette.surface,
        borderRadius: BorderRadius.circular(
          glyph == null ? size : radiusControl,
        ),
        border: glyph == null ? null : Border.all(color: Palette.line),
      ),
      child: glyph != null
          ? MarkIcon(mark: glyph, color: tint.stroke, size: size * 0.55)
          : Text(
              letter ?? '',
              style: TextStyle(
                color: Palette.ink,
                fontSize: size * 0.4,
                fontWeight: FontWeight.w500,
              ),
            ),
    );
  }
}

class Panel extends StatelessWidget {
  const Panel({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: Palette.surface,
        borderRadius: BorderRadius.circular(radiusCard),
        border: Border.all(color: Palette.line),
      ),
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) const Divider(indent: 68),
            children[i],
          ],
        ],
      ),
    );
  }
}

class RowCard extends StatelessWidget {
  const RowCard({
    super.key,
    required this.leading,
    required this.title,
    required this.subtitle,
    this.trailing,
    this.badge,
    this.onTap,
  });

  final Widget leading;
  final String title;
  final String subtitle;
  final Widget? trailing;
  final Widget? badge;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Material(
      color: Palette.surface,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
          child: Row(
            children: [
              leading,
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: text.titleMedium,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 1),
                    Text(
                      subtitle,
                      style: text.bodyMedium,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (badge != null) ...[const SizedBox(height: 6), badge!],
                  ],
                ),
              ),
              if (trailing != null) ...[const SizedBox(width: 10), trailing!],
            ],
          ),
        ),
      ),
    );
  }
}

class Chevron extends StatelessWidget {
  const Chevron({super.key});

  @override
  Widget build(BuildContext context) =>
      const Icon(Icons.chevron_right, color: Palette.faint, size: 20);
}

class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 0, 2, 8),
      child: Text(
        text.toUpperCase(),
        style: Theme.of(context).textTheme.labelSmall,
      ),
    );
  }
}

class CountBadge extends StatelessWidget {
  const CountBadge({super.key, required this.count, this.urgent = false});

  final int count;
  final bool urgent;

  @override
  Widget build(BuildContext context) {
    return StatusTag(
      text: '$count',
      color: urgent ? Palette.danger : Palette.warn,
    );
  }
}

class StatusTag extends StatelessWidget {
  const StatusTag({super.key, required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 6,
          height: 6,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(
          text,
          style: TextStyle(
            color: color,
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

enum BubbleTone { plain, mine, posted, pending, problem }

class Bubble extends StatelessWidget {
  const Bubble({
    super.key,
    required this.text,
    this.tone = BubbleTone.plain,
    this.label,
    this.amount,
    this.stamp,
    this.footnotes = const [],
    this.animate = false,
    this.onTap,
  });

  final String text;
  final BubbleTone tone;
  final String? label;
  final String? amount;
  final String? stamp;
  final List<String> footnotes;
  final bool animate;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final mine = tone == BubbleTone.mine;
    final status = switch (tone) {
      BubbleTone.pending => Palette.warn,
      BubbleTone.problem => Palette.danger,
      BubbleTone.posted => Palette.accent,
      _ => Palette.muted,
    };
    final foreground = mine ? Colors.white : Palette.ink;
    final stampColor = switch (stamp) {
      'Unpaid' || 'Part paid' || 'Declined' || 'Expired' => Palette.warn,
      'Cancelled' => Palette.danger,
      'Open' => Palette.muted,
      _ => Palette.accent,
    };
    final body = Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
          constraints: BoxConstraints(
            maxWidth: MediaQuery.sizeOf(context).width * 0.8,
          ),
          decoration: BoxDecoration(
            color: mine ? Palette.ink : Palette.surface,
            borderRadius: BorderRadius.circular(radiusCard),
            border: mine
                ? null
                : Border.all(
                    color: tone == BubbleTone.pending
                        ? Palette.warn.withValues(alpha: 0.45)
                        : Palette.line,
                  ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (label != null || stamp != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 5),
                  child: Wrap(
                    spacing: 12,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      if (label != null)
                        Text(
                          label!.toUpperCase(),
                          style: TextStyle(
                            color: status,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 0.8,
                          ),
                        ),
                      if (stamp != null)
                        StatusTag(text: stamp!, color: stampColor),
                    ],
                  ),
                ),
              Text(
                text,
                style: TextStyle(
                  color: foreground,
                  fontSize: 15,
                  height: 1.4,
                  fontFeatures: moneyFigures,
                ),
              ),
              if (amount != null)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    amount!,
                    style: TextStyle(
                      color: foreground,
                      fontSize: 20,
                      fontWeight: FontWeight.w500,
                      letterSpacing: -0.3,
                      fontFeatures: moneyFigures,
                    ),
                  ),
                ),
              for (final note in footnotes)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    note,
                    style: const TextStyle(
                      color: Palette.muted,
                      fontSize: 13,
                      height: 1.35,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
    if (!animate) return body;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
      builder: (context, t, child) => Opacity(
        opacity: t,
        child: Transform.translate(
          offset: Offset(0, 8 * (1 - t)),
          child: child,
        ),
      ),
      child: body,
    );
  }
}

class ProposalBar extends StatelessWidget {
  const ProposalBar({
    super.key,
    required this.busy,
    required this.onPost,
    required this.onDiscard,
    this.postLabel = 'Post it',
  });

  final bool busy;
  final VoidCallback onPost;
  final VoidCallback onDiscard;
  final String postLabel;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        decoration: const BoxDecoration(
          color: Palette.surface,
          border: Border(top: BorderSide(color: Palette.line)),
        ),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: busy ? null : onDiscard,
                child: const Text('Discard'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              flex: 2,
              child: FilledButton(
                onPressed: busy ? null : onPost,
                child: Text(postLabel),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Bubble previewBubble(ChatPreview preview) => Bubble(
  text: preview.summary,
  tone: BubbleTone.pending,
  label: 'Not posted yet',
  footnotes: preview.effects,
);

class EmptyNote extends StatelessWidget {
  const EmptyNote({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: Theme.of(context).textTheme.bodyMedium,
      ),
    );
  }
}
