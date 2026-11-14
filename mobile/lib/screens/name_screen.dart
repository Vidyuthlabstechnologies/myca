import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../my/my_strings.dart';
import '../theme.dart';

class NameScreen extends StatefulWidget {
  const NameScreen({super.key});

  @override
  State<NameScreen> createState() => _NameScreenState();
}

class _NameScreenState extends State<NameScreen> {
  final _name = TextEditingController();
  String _error = '';
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.isEmpty) return setState(() => _error = myMalayOr(context, 'Enter your name.', 'Masukkan nama anda.'));
    final state = AppScope.of(context);
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await state.cloud!.setName(name);
      await state.refresh();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    String w(String english, String malay) => myMalayOr(context, english, malay);
    final muted = AppScope.of(context).edition == 'MY' ? Theme.of(context).colorScheme.onSurfaceVariant : Palette.muted;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(w('What should we call you?', 'Apakah nama panggilan anda?'), style: text.displaySmall),
                  const SizedBox(height: 8),
                  Text(
                    w('People you work with will see this name next to what you record.', 'Rakan sekerja anda akan melihat nama ini di sebelah apa yang anda rekodkan.'),
                    style: text.bodyLarge?.copyWith(color: muted),
                  ),
                  const SizedBox(height: 28),
                  TextField(
                    controller: _name,
                    autofocus: true,
                    textCapitalization: TextCapitalization.words,
                    decoration: InputDecoration(labelText: w('Your name', 'Nama anda')),
                    onSubmitted: (_) => _save(),
                  ),
                  if (_error.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(_error, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(onPressed: _busy ? null : _save, child: Text(_busy ? w('Saving…', 'Menyimpan…') : w('Continue', 'Teruskan'))),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
