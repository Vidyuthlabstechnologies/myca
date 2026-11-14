import 'package:flutter/material.dart';
import 'package:myca_design/myca_design.dart' show MycaThemeContext, moneyFigures;

import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../my/my_strings.dart';
import '../../my/my_tools.dart';
import '../../tour/tour.dart';

String myErrorMessage(MyStrings t, Object error) {
  if (error is MyToolFailure) return t.errorText(error.code);
  if (error is MycaApiException) {
    final words = error.message.toLowerCase();
    if (words.contains('reach') || words.contains('connection') || words.contains('timed out') || words.contains('network')) return t.offline;
    return error.message;
  }
  return t.offline;
}

bool mySandbox(BuildContext context) => TourScope.maybeOf(context)?.active ?? false;

class MyPanel extends StatelessWidget {
  const MyPanel({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.tone});

  final Widget child;
  final EdgeInsets padding;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    final palette = context.myca;
    return Material(
      color: tone ?? palette.surface,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: BorderSide(color: palette.line)),
      child: Padding(padding: padding, child: SizedBox(width: double.infinity, child: child)),
    );
  }
}

class MySection extends StatelessWidget {
  const MySection(this.title, {super.key});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 20, 2, 8),
      child: Semantics(
        header: true,
        child: Text(title.toUpperCase(), style: Theme.of(context).textTheme.labelMedium?.copyWith(color: context.myca.muted, letterSpacing: 0.8, fontWeight: FontWeight.w600)),
      ),
    );
  }
}

enum MyTone { info, warn, danger, good }

class MyNote extends StatelessWidget {
  const MyNote(this.text, {super.key, this.tone = MyTone.info, this.icon});

  final String text;
  final MyTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final palette = context.myca;
    final (background, foreground, symbol) = switch (tone) {
      MyTone.info => (palette.accentSoft, palette.ink, Icons.info_outline),
      MyTone.warn => (palette.warnSoft, palette.warn, Icons.error_outline),
      MyTone.danger => (palette.dangerSoft, palette.danger, Icons.report_gmailerrorred_outlined),
      MyTone.good => (palette.accentSoft, palette.accent, Icons.check_circle_outline),
    };
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(10)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(padding: const EdgeInsets.only(top: 1), child: Icon(icon ?? symbol, size: 18, color: foreground)),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: tone == MyTone.info ? palette.ink : foreground))),
        ],
      ),
    );
  }
}

class MyErrorBox extends StatelessWidget {
  const MyErrorBox({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(liveRegion: true, child: MyNote(message, tone: MyTone.danger)),
        if (onRetry != null) ...[
          const SizedBox(height: 8),
          Align(alignment: Alignment.centerLeft, child: OutlinedButton(onPressed: onRetry, child: Text(t.tryAgain))),
        ],
      ],
    );
  }
}

class MyAmountLine extends StatelessWidget {
  const MyAmountLine({super.key, required this.label, required this.amount, this.strong = false, this.caption = ''});

  final String label;
  final String amount;
  final bool strong;
  final String caption;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final style = (strong ? text.titleMedium : text.bodyLarge)?.copyWith(fontFeatures: moneyFigures, fontWeight: strong ? FontWeight.w600 : null);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 3,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: strong ? text.titleMedium : text.bodyLarge),
                if (caption.isNotEmpty) Text(caption, style: text.bodySmall?.copyWith(color: context.myca.muted)),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Flexible(flex: 2, child: Text(amount, textAlign: TextAlign.end, style: style)),
        ],
      ),
    );
  }
}

class MyStatusChip extends StatelessWidget {
  const MyStatusChip(this.status, {super.key});

  final String status;

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    final palette = context.myca;
    final key = status.toLowerCase();
    final (background, foreground) = switch (key) {
      'valid' => (palette.accentSoft, palette.accent),
      'invalid' || 'rejected' => (palette.dangerSoft, palette.danger),
      'cancelled' => (palette.sunken, palette.muted),
      _ => (palette.warnSoft, palette.warn),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(99)),
      child: Text(t.statusName(key), style: Theme.of(context).textTheme.labelMedium?.copyWith(color: foreground, fontWeight: FontWeight.w600)),
    );
  }
}

class MyProblems extends StatelessWidget {
  const MyProblems({super.key, required this.title, required this.problems});

  final String title;
  final List<MyProblem> problems;

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    final text = Theme.of(context).textTheme;
    final palette = context.myca;
    return Semantics(
      liveRegion: true,
      child: MyPanel(
        tone: palette.dangerSoft,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: text.titleSmall?.copyWith(color: palette.danger, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            for (final problem in problems)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(padding: const EdgeInsets.only(top: 2), child: Icon(Icons.close, size: 16, color: palette.danger)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text.rich(
                        TextSpan(children: [
                          if (problem.field.isNotEmpty) TextSpan(text: '${t.fieldName(problem.field)}: ', style: const TextStyle(fontWeight: FontWeight.w600)),
                          TextSpan(text: problem.why),
                        ]),
                        style: text.bodyMedium,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class MyBusyButton extends StatelessWidget {
  const MyBusyButton({super.key, required this.label, required this.busyLabel, required this.busy, required this.onPressed, this.outlined = false});

  final String label;
  final String busyLabel;
  final bool busy;
  final VoidCallback? onPressed;
  final bool outlined;

  @override
  Widget build(BuildContext context) {
    final child = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (busy) ...[
          const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
          const SizedBox(width: 10),
        ],
        Flexible(child: Text(busy ? busyLabel : label, textAlign: TextAlign.center)),
      ],
    );
    final pressed = busy ? null : onPressed;
    return SizedBox(
      width: double.infinity,
      child: outlined ? OutlinedButton(onPressed: pressed, child: child) : FilledButton(onPressed: pressed, child: child),
    );
  }
}

class MyPicker<T> extends StatelessWidget {
  const MyPicker({super.key, required this.label, required this.value, required this.items, required this.onChanged, this.helper, this.error});

  final String label;
  final T? value;
  final List<(T, String)> items;
  final ValueChanged<T?> onChanged;
  final String? helper;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<T>(
      initialValue: items.any((item) => item.$1 == value) ? value : null,
      isExpanded: true,
      decoration: InputDecoration(labelText: label, helperText: helper, helperMaxLines: 3, errorText: error, errorMaxLines: 3),
      selectedItemBuilder: (context) => [
        for (final (_, name) in items) Align(alignment: AlignmentDirectional.centerStart, child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis)),
      ],
      items: [
        for (final (key, name) in items) DropdownMenuItem<T>(value: key, child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis)),
      ],
      onChanged: onChanged,
    );
  }
}

class MyChoices<T> extends StatelessWidget {
  const MyChoices({super.key, required this.value, required this.items, required this.onChanged, this.keyPrefix = ''});

  final T value;
  final List<(T, String)> items;
  final ValueChanged<T> onChanged;
  final String keyPrefix;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final (key, name) in items)
          ChoiceChip(
            key: keyPrefix.isEmpty ? null : Key('$keyPrefix.$key'),
            label: Text(name),
            selected: key == value,
            onSelected: (_) => onChanged(key),
          ),
      ],
    );
  }
}

class MySandboxBanner extends StatelessWidget {
  const MySandboxBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    final palette = context.myca;
    return Material(
      key: const Key('my.sandboxBanner'),
      color: palette.highlight,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        child: Text(t.sandboxBanner, textAlign: TextAlign.center, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: const Color(0xFF15181B), fontWeight: FontWeight.w600)),
      ),
    );
  }
}

Future<void> showLanguageSheet(BuildContext context) async {
  final state = AppScope.of(context);
  final t = MyStrings.of(context);
  final current = Localizations.localeOf(context).languageCode;
  final picked = await showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    builder: (context) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 8), child: Text(t.language, style: Theme.of(context).textTheme.titleMedium)),
          for (final (code, name) in [('en', t.englishName), ('ms', t.malayName)])
            ListTile(
              key: Key('my.language.$code'),
              title: Text(name),
              trailing: code == current ? const Icon(Icons.check) : null,
              onTap: () => Navigator.of(context).pop(code),
            ),
          const SizedBox(height: 8),
        ],
      ),
    ),
  );
  if (picked != null) await state.setLanguage(picked);
}

class MyLanguageButton extends StatelessWidget {
  const MyLanguageButton({super.key});

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    return IconButton(
      key: const Key('my.language'),
      tooltip: t.language,
      icon: const Icon(Icons.translate),
      onPressed: () => showLanguageSheet(context),
    );
  }
}

num? parseMyAmount(String typed) {
  final clean = typed.trim().replaceAll(',', '').replaceAll(RegExp(r'^RM\s*', caseSensitive: false), '');
  if (clean.isEmpty) return null;
  return num.tryParse(clean);
}

const myLargestAmount = 999999999999.99;
