import 'package:flutter/material.dart';

import '../../proposal_flow.dart';
import '../../theme.dart';
import '../../uae/uae_strings.dart';
import '../../widgets.dart';

class UaeAutoText extends StatelessWidget {
  const UaeAutoText(this.text, {super.key, this.style});

  final String text;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: style,
    textDirection: directionOfText(text, Directionality.of(context)),
    textAlign: TextAlign.start,
  );
}

class UaePanel extends StatelessWidget {
  const UaePanel({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
    clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(
      color: Palette.surface,
      borderRadius: BorderRadius.circular(radiusCard),
      border: Border.all(color: Palette.line),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const Divider(height: 1, indent: 16, endIndent: 16),
          children[i],
        ],
      ],
    ),
  );
}

class UaeFigure extends StatelessWidget {
  const UaeFigure({super.key, required this.label, required this.value, this.caption, this.strong = false, this.valueKey});

  final String label;
  final String value;
  final String? caption;
  final bool strong;
  final Key? valueKey;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final style = strong ? text.titleMedium : text.bodyMedium?.copyWith(color: Palette.ink);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: LayoutBuilder(
        builder: (context, box) => Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (caption != null) Text(caption!, style: text.labelSmall),
                  Text(label, style: style),
                ],
              ),
            ),
            if (value.isNotEmpty) ...[
              const SizedBox(width: 12),
              ConstrainedBox(
                constraints: BoxConstraints(maxWidth: box.maxWidth * 0.5),
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: AlignmentDirectional.centerEnd,
                  child: Text(value, key: valueKey, style: style?.copyWith(fontFeatures: moneyFigures)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class UaeBoxRow extends StatelessWidget {
  const UaeBoxRow({
    super.key,
    required this.box,
    required this.label,
    required this.amount,
    required this.vat,
    this.adjustment,
    this.strong = false,
  });

  final String box;
  final String label;
  final String? amount;
  final String? vat;
  final String? adjustment;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final text = Theme.of(context).textTheme;
    final figure = (strong ? text.titleSmall : text.bodyMedium)?.copyWith(color: Palette.ink, fontFeatures: moneyFigures);
    Widget pair(String name, String? value, String part) => Expanded(
      child: value == null
          ? const SizedBox.shrink()
          : Column(
              key: ValueKey('uae.box.$box.$part'),
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(name, style: text.labelSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                FittedBox(fit: BoxFit.scaleDown, alignment: AlignmentDirectional.centerEnd, child: Text(value, style: figure)),
              ],
            ),
    );
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                constraints: const BoxConstraints(minWidth: 30),
                alignment: Alignment.center,
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(color: Palette.sunken, borderRadius: BorderRadius.circular(6)),
                child: Text(box, style: text.labelMedium?.copyWith(color: Palette.ink, fontFeatures: moneyFigures)),
              ),
              const SizedBox(width: 10),
              Expanded(child: Text(label, style: strong ? text.titleSmall : text.bodyMedium?.copyWith(color: Palette.ink))),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(width: 40),
              pair(s.amount, amount, 'amount'),
              const SizedBox(width: 16),
              pair(s.vat, vat, 'vat'),
            ],
          ),
          if (adjustment != null) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                const SizedBox(width: 40),
                const Spacer(),
                const SizedBox(width: 16),
                pair(s.adjustment, adjustment, 'adjustment'),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class UaeNotes extends StatelessWidget {
  const UaeNotes({super.key, required this.title, required this.notes, this.danger = false});

  final String title;
  final List<String> notes;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: danger ? Palette.dangerSoft : Palette.warnSoft,
        borderRadius: BorderRadius.circular(radiusCard),
        border: Border.all(color: Palette.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: text.titleSmall?.copyWith(color: danger ? Palette.danger : Palette.warn)),
          for (final note in notes) ...[
            const SizedBox(height: 6),
            UaeAutoText(note, style: text.bodyMedium?.copyWith(color: Palette.ink)),
          ],
        ],
      ),
    );
  }
}

class UaeThread extends StatelessWidget {
  const UaeThread({super.key, required this.entries});

  final List<ThreadEntry> entries;

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final entry in entries)
          if (entry.tone != BubbleTone.mine)
            Container(
              margin: const EdgeInsets.only(top: 10),
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
              decoration: BoxDecoration(
                color: switch (entry.tone) {
                  BubbleTone.posted => Palette.accentSoft,
                  BubbleTone.problem => Palette.dangerSoft,
                  BubbleTone.pending => Palette.warnSoft,
                  _ => Palette.surface,
                },
                borderRadius: BorderRadius.circular(radiusCard),
                border: Border.all(color: Palette.line),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if ((entry.label ?? '').isNotEmpty) ...[
                    Text(s.threadLabel(entry.label), style: text.labelMedium?.copyWith(color: entry.tone == BubbleTone.problem ? Palette.danger : Palette.ink)),
                    const SizedBox(height: 4),
                  ],
                  UaeAutoText(entry.text, style: text.bodyMedium?.copyWith(color: Palette.ink)),
                  for (final note in entry.footnotes) ...[
                    const SizedBox(height: 4),
                    UaeAutoText(note, style: text.bodySmall),
                  ],
                ],
              ),
            ),
      ],
    );
  }
}

class UaeConfirmBar extends StatelessWidget {
  const UaeConfirmBar({super.key, required this.busy, required this.onConfirm, required this.onDiscard});

  final bool busy;
  final VoidCallback onConfirm;
  final VoidCallback onDiscard;

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
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
            Expanded(child: OutlinedButton(onPressed: busy ? null : onDiscard, child: Text(s.discard))),
            const SizedBox(width: 10),
            Expanded(flex: 2, child: FilledButton(onPressed: busy ? null : onConfirm, child: Text(s.confirm))),
          ],
        ),
      ),
    );
  }
}

class UaeMoneyField extends StatelessWidget {
  const UaeMoneyField({super.key, required this.controller, required this.label, this.helper, this.signed = false, this.fieldKey});

  final TextEditingController controller;
  final String label;
  final String? helper;
  final bool signed;
  final Key? fieldKey;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextField(
      key: fieldKey,
      controller: controller,
      keyboardType: TextInputType.numberWithOptions(decimal: true, signed: signed),
      textDirection: TextDirection.ltr,
      decoration: InputDecoration(
        label: Text(label, maxLines: 2, overflow: TextOverflow.ellipsis),
        helperText: helper,
        helperMaxLines: 3,
        prefixText: 'AED ',
      ),
    ),
  );
}

class UaeError extends StatelessWidget {
  const UaeError({super.key, required this.onRetry, this.detail = ''});

  final VoidCallback onRetry;
  final String detail;

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final text = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(s.couldNotWorkOut, style: text.titleMedium, textAlign: TextAlign.center),
            if (detail.isNotEmpty) ...[
              const SizedBox(height: 6),
              UaeAutoText(detail, style: text.bodyMedium),
            ],
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: Text(s.tryAgain)),
          ],
        ),
      ),
    );
  }
}

String uaeFailure(Object? result) {
  if (result is! Map) return '';
  final hint = result['hint'];
  if (hint is String && hint.isNotEmpty) return hint;
  final error = result['error'];
  return error is String ? error : '';
}

List<String> uaeProblems(Object? result, {String Function(String field)? label}) {
  if (result is! Map) return const [];
  String name(String field) => label == null ? field : label(field);
  return [
    for (final row in (result['problems'] as List? ?? const []))
      if (row is Map) [if (row['field'] != null && '${row['field']}'.isNotEmpty) name('${row['field']}'), '${row['why'] ?? ''}'].join(': '),
  ];
}
