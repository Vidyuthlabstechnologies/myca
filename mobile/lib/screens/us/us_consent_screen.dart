import 'package:flutter/material.dart';

import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../format.dart';
import '../../theme.dart';
import '../../us/us_consents.dart';
import '../../widgets.dart';
import 'us_fields.dart';

class UsConsentScreen extends StatefulWidget {
  const UsConsentScreen({super.key, required this.consents, required this.document});

  final UsConsents consents;
  final String document;

  @override
  State<UsConsentScreen> createState() => _UsConsentScreenState();
}

class _UsConsentScreenState extends State<UsConsentScreen> {
  Future<UsConsentForm?>? _form;
  final _name = TextEditingController();
  DateTime? _until;
  String? _nameError;
  String _note = '';
  bool _busy = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _form ??= _load();
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<UsConsentForm?> _load() async {
    for (final form in await widget.consents.list()) {
      if (form.document == widget.document) return form;
    }
    return null;
  }

  DateTime get _today {
    final now = AppScope.of(context).now();
    return DateTime(now.year, now.month, now.day);
  }

  DateTime get _defaultUntil => DateTime(_today.year + 1, _today.month, _today.day);

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _until ?? _defaultUntil,
      firstDate: _today.add(const Duration(days: 1)),
      lastDate: DateTime(_today.year + 3, _today.month, _today.day).subtract(const Duration(days: 1)),
      helpText: 'Consent valid until',
    );
    if (picked != null && mounted) setState(() => _until = picked);
  }

  Future<void> _sign(UsConsentForm form) async {
    final name = _name.text.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (name.length < 2) return setState(() => _nameError = 'Type your full name to sign.');
    setState(() {
      _busy = true;
      _nameError = null;
      _note = '';
    });
    try {
      await widget.consents.sign(form, signedName: name, validUntil: isoDate(_until ?? _defaultUntil));
      if (mounted) Navigator.of(context).pop(true);
    } on MycaApiException catch (err) {
      if (!mounted) return;
      setState(() {
        switch (err.code) {
          case 'SIGNATURE_REQUIRED':
            _nameError = err.message;
          case 'CONSENT_CHANGED':
            _note = 'This consent was just updated. Read the new text, then sign again.';
            _form = _load();
          default:
            _note = err.message;
        }
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _withdraw(UsConsentForm form) async {
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      await widget.consents.revoke(form.document);
      if (mounted) Navigator.of(context).pop(false);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Your consent')),
      body: SafeArea(
        child: FutureBuilder<UsConsentForm?>(
          future: _form,
          builder: (context, loaded) {
            if (loaded.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
            if (loaded.hasError) {
              return UsLoadError(message: usLoadProblem(loaded.error, 'The consent could not be loaded.'), onRetry: () => setState(() { _form = _load(); }));
            }
            final form = loaded.data;
            if (form == null) return const EmptyNote(text: 'This consent is not available right now.');
            final until = _until ?? _defaultUntil;
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                Text(form.title, style: text.headlineSmall),
                const SizedBox(height: 14),
                Text(form.text, key: const Key('usConsent.text'), style: text.bodyLarge?.copyWith(color: Palette.ink)),
                const SizedBox(height: 18),
                if (form.signed) ...[
                  Container(
                    key: const Key('usConsent.signed'),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(color: Palette.accentSoft, borderRadius: BorderRadius.circular(radiusControl)),
                    child: Text(
                      'You signed this on ${longDate(form.signedAt.substring(0, 10))}. It is valid until ${longDate(form.validUntil.substring(0, 10))}.',
                      style: text.bodyMedium?.copyWith(color: Palette.ink),
                    ),
                  ),
                  const SizedBox(height: 14),
                  OutlinedButton(key: const Key('usConsent.withdraw'), onPressed: _busy ? null : () => _withdraw(form), child: Text(_busy ? 'Withdrawing…' : 'Withdraw my consent')),
                  const SizedBox(height: 6),
                  Text('After you withdraw, MyCA stops sharing your Social Security numbers. You type them on the partner\'s screen yourself.', style: text.bodySmall),
                ] else ...[
                  if (!form.ready)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Text('This consent cannot be signed yet. You can still e-file and type your Social Security numbers on the partner\'s screen.', key: const Key('usConsent.notReady'), style: text.bodyMedium?.copyWith(color: Palette.warn)),
                    ),
                  ListTile(
                    key: const Key('usConsent.until'),
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Valid until'),
                    subtitle: Text(longDate(isoDate(until))),
                    trailing: const Icon(Icons.edit_calendar_outlined, semanticLabel: 'Change date'),
                    onTap: _busy || !form.ready ? null : _pickDate,
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    key: const Key('usConsent.name'),
                    controller: _name,
                    enabled: form.ready,
                    textCapitalization: TextCapitalization.words,
                    autocorrect: false,
                    decoration: InputDecoration(labelText: 'Type your full name to sign', errorText: _nameError),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(key: const Key('usConsent.sign'), onPressed: _busy || !form.ready ? null : () => _sign(form), child: Text(_busy ? 'Signing…' : 'Sign')),
                ],
                const SizedBox(height: 8),
                TextButton(key: const Key('usConsent.copy'), onPressed: () => AppScope.of(context).shareText(form.text), child: const Text('Save a copy')),
                if (_note.isNotEmpty) ...[const SizedBox(height: 8), Text(_note, key: const Key('usConsent.note'), style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w500))],
              ],
            );
          },
        ),
      ),
    );
  }
}
