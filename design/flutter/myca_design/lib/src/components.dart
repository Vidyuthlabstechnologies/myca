import 'package:flutter/material.dart';

import 'format.dart';
import 'theme.dart';
import 'tokens.g.dart';

enum MycaTone { neutral, good, warn, danger, accent }

extension MycaToneColors on MycaTone {
  Color strong(MycaPalette p) => switch (this) {
    MycaTone.neutral => p.muted,
    MycaTone.good => p.accent,
    MycaTone.warn => p.warn,
    MycaTone.danger => p.danger,
    MycaTone.accent => p.accent,
  };

  Color soft(MycaPalette p) => switch (this) {
    MycaTone.neutral => p.sunken,
    MycaTone.good => p.accentSoft,
    MycaTone.warn => p.warnSoft,
    MycaTone.danger => p.dangerSoft,
    MycaTone.accent => p.accentSoft,
  };
}

class MycaPanel extends StatelessWidget {
  const MycaPanel({super.key, required this.children, this.dividerIndent = 68});

  final List<Widget> children;
  final double dividerIndent;

  @override
  Widget build(BuildContext context) {
    final p = context.myca;
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: p.surface,
        borderRadius: BorderRadius.circular(MycaRadius.card),
        border: Border.all(color: p.line),
      ),
      child: Column(
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) Divider(indent: dividerIndent),
            children[i],
          ],
        ],
      ),
    );
  }
}

class MycaSectionLabel extends StatelessWidget {
  const MycaSectionLabel(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final upper = Directionality.of(context) == TextDirection.ltr ? text.toUpperCase() : text;
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(2, 0, 2, MycaSpace.s2),
      child: Text(upper, style: Theme.of(context).textTheme.labelSmall),
    );
  }
}

class MycaStatusTag extends StatelessWidget {
  const MycaStatusTag({super.key, required this.text, this.tone = MycaTone.neutral, this.filled = false});

  final String text;
  final MycaTone tone;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final p = context.myca;
    final color = tone.strong(p);
    final body = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 6, height: 6, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 6),
        Flexible(child: Text(text, style: TextStyle(color: color, fontSize: 12.5, fontWeight: FontWeight.w600))),
      ],
    );
    if (!filled) return body;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: MycaSpace.s2, vertical: MycaSpace.s1),
      decoration: BoxDecoration(color: tone.soft(p), borderRadius: BorderRadius.circular(MycaRadius.pill)),
      child: body,
    );
  }
}

class MycaMoney extends StatelessWidget {
  const MycaMoney(this.amount, {super.key, this.minor = false, this.style, this.signed = false, this.format});

  final num amount;
  final bool minor;
  final bool signed;
  final TextStyle? style;
  final MycaFormat? format;

  @override
  Widget build(BuildContext context) {
    final f = format ?? MycaFormat(context.mycaCountry, Localizations.maybeLocaleOf(context));
    final value = minor ? amount / 100 : amount;
    final text = signed && value > 0 ? '+${f.money(value)}' : f.money(value);
    final base = style ?? DefaultTextStyle.of(context).style;
    final color = signed ? (value < 0 ? context.myca.danger : value > 0 ? context.myca.accent : null) : null;
    return Text(
      text,
      textDirection: TextDirection.ltr,
      style: base.copyWith(fontFeatures: moneyFigures, color: color ?? base.color),
    );
  }
}

class MycaAmountRow extends StatelessWidget {
  const MycaAmountRow({super.key, required this.start, required this.amount, this.style, this.after});

  final Widget start;
  final Widget amount;
  final TextStyle? style;
  final Widget? after;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) => Row(
        children: [
          Expanded(child: start),
          ConstrainedBox(
            constraints: BoxConstraints(maxWidth: box.maxWidth.isFinite ? box.maxWidth * 0.6 : double.infinity),
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: AlignmentDirectional.centerEnd,
              child: DefaultTextStyle.merge(style: style, child: amount),
            ),
          ),
          ?after,
        ],
      ),
    );
  }
}

class MycaChevron extends StatelessWidget {
  const MycaChevron({super.key});

  @override
  Widget build(BuildContext context) => Icon(
    Directionality.of(context) == TextDirection.rtl ? Icons.chevron_left : Icons.chevron_right,
    color: context.myca.faint,
    size: 20,
  );
}

class MycaNotice extends StatelessWidget {
  const MycaNotice({super.key, required this.text, this.tone = MycaTone.warn, this.icon, this.action});

  final String text;
  final MycaTone tone;
  final IconData? icon;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final p = context.myca;
    return Container(
      padding: const EdgeInsets.all(MycaSpace.s3),
      decoration: BoxDecoration(color: tone.soft(p), borderRadius: BorderRadius.circular(MycaRadius.control)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon ?? Icons.info_outline, size: 18, color: tone.strong(p)),
          const SizedBox(width: MycaSpace.s2),
          Expanded(child: Text(text, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: p.ink))),
          if (action != null) ...[const SizedBox(width: MycaSpace.s2), action!],
        ],
      ),
    );
  }
}
