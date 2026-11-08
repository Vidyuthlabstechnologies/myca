import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme.dart';

class RecoveryCodesScreen extends StatefulWidget {
  const RecoveryCodesScreen(this.codes, {super.key});

  final List<String> codes;

  @override
  State<RecoveryCodesScreen> createState() => _RecoveryCodesScreenState();
}

class _RecoveryCodesScreenState extends State<RecoveryCodesScreen> {
  bool _copied = false;

  Future<void> _copyAll() async {
    await Clipboard.setData(ClipboardData(text: widget.codes.join('\n')));
    if (mounted) setState(() => _copied = true);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Recovery codes')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Text('Save these recovery codes', style: text.headlineSmall),
          const SizedBox(height: 8),
          Text(
            'Each one signs you in once if you lose your authenticator. Keep them somewhere safe; MyCA cannot show them again.',
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
          OutlinedButton(onPressed: _copyAll, child: Text(_copied ? 'Copied' : 'Copy all')),
          const SizedBox(height: 8),
          FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Done')),
        ],
      ),
    );
  }
}
