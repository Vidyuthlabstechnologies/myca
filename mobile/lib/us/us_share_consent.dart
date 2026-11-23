import 'package:flutter/material.dart';
import 'package:myca_design/myca_design.dart' show MycaThemeContext;

import '../app_state.dart';

Future<String?> showUsShareConsent(BuildContext context, String consentText) => Navigator.of(context).push<String>(
  MaterialPageRoute(fullscreenDialog: true, builder: (_) => UsShareConsentPage(consentText: consentText)),
);

class UsShareConsentPage extends StatefulWidget {
  const UsShareConsentPage({super.key, required this.consentText});

  final String consentText;

  @override
  State<UsShareConsentPage> createState() => _UsShareConsentPageState();
}

class _UsShareConsentPageState extends State<UsShareConsentPage> {
  final _name = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _sign() {
    final name = _name.text.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (name.length < 2) return setState(() => _error = 'Type your full name to sign.');
    Navigator.of(context).pop(name);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Your consent')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: [
            Text(widget.consentText, key: const Key('usShare.text'), style: text.bodyLarge?.copyWith(color: context.myca.ink)),
            const SizedBox(height: 18),
            TextField(
              key: const Key('usShare.name'),
              controller: _name,
              textCapitalization: TextCapitalization.words,
              autocorrect: false,
              decoration: InputDecoration(labelText: 'Your full name', helperText: 'Typing your name signs this consent. It is valid for one year.', errorText: _error),
            ),
            const SizedBox(height: 16),
            FilledButton(key: const Key('usShare.sign'), onPressed: _sign, child: const Text('Sign and invite')),
            TextButton(key: const Key('usShare.copy'), onPressed: () => AppScope.of(context).shareText(widget.consentText), child: const Text('Save a copy')),
            TextButton(key: const Key('usShare.cancel'), onPressed: () => Navigator.of(context).pop(), child: const Text('Do not share')),
          ],
        ),
      ),
    );
  }
}
