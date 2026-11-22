import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../secure_window.dart';
import '../theme.dart';
import '../uae/uae_cloud_strings.dart';
import '../uae/uae_strings.dart';

class RecoveryCodesScreen extends StatefulWidget {
  const RecoveryCodesScreen(this.codes, {super.key});

  final List<String> codes;

  @override
  State<RecoveryCodesScreen> createState() => _RecoveryCodesScreenState();
}

class _RecoveryCodesScreenState extends State<RecoveryCodesScreen> with SecureWindowWhileShown {
  bool _copied = false;

  Future<void> _copyAll() async {
    await Clipboard.setData(ClipboardData(text: widget.codes.join('\n')));
    if (mounted) setState(() => _copied = true);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final s = UaeStrings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s.recoveryCodes)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Text(s.saveRecoveryCodes, style: text.headlineSmall),
          const SizedBox(height: 8),
          Text(
            s.recoveryCodesNote,
            style: text.bodyMedium,
          ),
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Palette.surface,
              borderRadius: BorderRadius.circular(radiusCard),
              border: Border.all(color: Palette.line),
            ),
            child: SelectableText(
              widget.codes.join('\n'),
              style: text.titleMedium?.copyWith(fontFamily: 'monospace', height: 1.8, letterSpacing: 1),
            ),
          ),
          const SizedBox(height: 16),
          OutlinedButton(onPressed: _copyAll, child: Text(_copied ? s.copied : s.copyAll)),
          const SizedBox(height: 8),
          FilledButton(onPressed: () => Navigator.of(context).pop(), child: Text(s.done)),
        ],
      ),
    );
  }
}
