import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api/myca_api.dart';
import '../../format.dart';
import '../../us/tin.dart';
import '../../us/us_return.dart';

class SsnField extends StatefulWidget {
  const SsnField({super.key, required this.controller, required this.label, this.savedMask = '', this.errorText});

  final TextEditingController controller;
  final String label;
  final String savedMask;
  final String? errorText;

  @override
  State<SsnField> createState() => _SsnFieldState();
}

class _SsnFieldState extends State<SsnField> {
  bool _shown = false;

  @override
  Widget build(BuildContext context) {
    final saved = widget.savedMask.isNotEmpty;
    return TextField(
      controller: widget.controller,
      obscureText: !_shown,
      obscuringCharacter: '•',
      enableSuggestions: false,
      autocorrect: false,
      enableIMEPersonalizedLearning: false,
      keyboardType: TextInputType.number,
      inputFormatters: [TinInputFormatter()],
      decoration: InputDecoration(
        labelText: widget.label,
        hintText: saved ? widget.savedMask : '123-45-6789',
        helperText: saved ? 'Saved as ${widget.savedMask}. Leave empty to keep it.' : 'Social Security number or ITIN',
        errorText: widget.errorText,
        suffixIcon: IconButton(
          tooltip: _shown ? 'Hide number' : 'Show number',
          icon: Icon(_shown ? Icons.visibility_off_outlined : Icons.visibility_outlined),
          onPressed: () => setState(() => _shown = !_shown),
        ),
      ),
    );
  }
}

class UsDateField extends StatelessWidget {
  const UsDateField({super.key, required this.controller, required this.label, this.errorText});

  final TextEditingController controller;
  final String label;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: TextInputType.datetime,
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9/]')), LengthLimitingTextInputFormatter(10)],
      decoration: InputDecoration(labelText: label, hintText: 'MM/DD/YYYY', errorText: errorText),
    );
  }
}

String? usDateProblem(String typed, {bool required = true}) {
  if (typed.trim().isEmpty) return required ? 'Enter the date as MM/DD/YYYY.' : null;
  return isoFromUsDate(typed) == null ? 'Enter the date as MM/DD/YYYY.' : null;
}

class UsStateField extends StatelessWidget {
  const UsStateField({super.key, required this.value, required this.onChanged, this.label = 'State', this.helperText, this.errorText});

  final String? value;
  final ValueChanged<String?> onChanged;
  final String label;
  final String? helperText;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: usStates.any((s) => s.$1 == value) ? value : null,
      isExpanded: true,
      decoration: InputDecoration(labelText: label, helperText: helperText, errorText: errorText),
      items: [for (final (code, name) in usStates) DropdownMenuItem(value: code, child: Text(name))],
      onChanged: onChanged,
    );
  }
}

class MoneyField extends StatelessWidget {
  const MoneyField({super.key, required this.controller, required this.label, this.helper, this.errorText, this.signed = false});

  final TextEditingController controller;
  final bool signed;
  final String label;
  final String? helper;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: TextInputType.numberWithOptions(decimal: true, signed: signed),
      inputFormatters: [FilteringTextInputFormatter.allow(signed ? RegExp(r'[-0-9.,]') : RegExp(r'[0-9.,]'))],
      decoration: InputDecoration(labelText: label, prefixText: '\$ ', helperText: helper, errorText: errorText),
    );
  }
}

num? parseDollars(String typed) {
  final cleaned = typed.replaceAll(',', '').trim();
  if (cleaned.isEmpty) return null;
  final value = num.tryParse(cleaned);
  if (value == null || value < 0) return null;
  return (value * 100).round() / 100;
}

num? parseSignedDollars(String typed) {
  final cleaned = typed.replaceAll(',', '').trim();
  if (cleaned.startsWith('-')) {
    final magnitude = parseDollars(cleaned.substring(1));
    return magnitude == null ? null : -magnitude;
  }
  return parseDollars(cleaned);
}

String usLoadProblem(Object? error, String fallback) => error is MycaApiException ? error.message : fallback;

class UsLoadError extends StatelessWidget {
  const UsLoadError({super.key, required this.message, required this.onRetry, this.inline = false});

  final String message;
  final VoidCallback onRetry;
  final bool inline;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final children = [
        Icon(Icons.cloud_off_outlined, size: 40, color: Theme.of(context).colorScheme.onSurfaceVariant, semanticLabel: 'Could not load'),
        const SizedBox(height: 16),
        Text(message, textAlign: TextAlign.center, style: text.bodyLarge),
        const SizedBox(height: 20),
        Center(child: FilledButton(key: const Key('usLoadError.retry'), onPressed: onRetry, child: const Text('Try again'))),
      ];
    if (inline) return Padding(key: const Key('usLoadError'), padding: const EdgeInsets.symmetric(vertical: 24), child: Column(children: children));
    return ListView(key: const Key('usLoadError'), padding: const EdgeInsets.fromLTRB(24, 48, 24, 24), children: children);
  }
}

String dollarsTyped(Object? value) {
  final n = value is num ? value : num.tryParse('${value ?? ''}');
  if (n == null) return '';
  return n == n.roundToDouble() ? n.round().toString() : n.toStringAsFixed(2);
}

class EinInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final cut = digits.length > 9 ? digits.substring(0, 9) : digits;
    final text = cut.length <= 2 ? cut : '${cut.substring(0, 2)}-${cut.substring(2)}';
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }
}

class ZipInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final cut = digits.length > 9 ? digits.substring(0, 9) : digits;
    final text = cut.length <= 5 ? cut : '${cut.substring(0, 5)}-${cut.substring(5)}';
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }
}

String typedSnapshot(Iterable<TextEditingController> controllers, [Iterable<Object?> extra = const []]) =>
    [for (final c in controllers) c.text, for (final e in extra) '$e'].join('\u0000');

class UsLeaveGuard extends StatelessWidget {
  const UsLeaveGuard({super.key, required this.dirty, required this.listenable, required this.child});

  final bool Function() dirty;
  final Listenable listenable;
  final Widget child;

  Future<void> _ask(BuildContext context) async {
    final navigator = Navigator.of(context);
    final leave = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Leave without saving?'),
        content: const Text('What you typed on this screen is not saved yet.'),
        actions: [
          TextButton(key: const Key('usLeave.stay'), onPressed: () => Navigator.of(dialog).pop(false), child: const Text('Keep editing')),
          TextButton(key: const Key('usLeave.leave'), onPressed: () => Navigator.of(dialog).pop(true), child: const Text('Leave')),
        ],
      ),
    );
    if (leave == true) navigator.pop();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: listenable,
      builder: (context, _) => PopScope<Object?>(
        canPop: !dirty(),
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) _ask(context);
        },
        child: child,
      ),
    );
  }
}
