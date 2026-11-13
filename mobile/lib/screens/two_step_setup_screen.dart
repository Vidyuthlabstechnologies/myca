import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../secure_window.dart';
import '../theme.dart';
import '../widgets/qr_image.dart';
import 'recovery_codes_screen.dart';

class TwoStepSetupScreen extends StatefulWidget {
  const TwoStepSetupScreen({super.key});

  @override
  State<TwoStepSetupScreen> createState() => _TwoStepSetupScreenState();
}

class _TwoStepSetupScreenState extends State<TwoStepSetupScreen> with SecureWindowWhileShown {
  Future<SecondStepSetup>? _setup;
  final _code = TextEditingController();
  String _error = '';
  bool _busy = false;
  bool _copied = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _setup ??= AppScope.of(context).cloud!.beginSecondStep();
  }

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _copy(SecondStepSetup setup) async {
    await Clipboard.setData(ClipboardData(text: setup.secret));
    if (mounted) setState(() => _copied = true);
  }

  Future<void> _open(SecondStepSetup setup) async {
    final state = AppScope.of(context);
    final uri = Uri.tryParse(setup.uri);
    var opened = false;
    if (uri != null) {
      try {
        opened = await state.openLink(uri);
      } on Exception {
        opened = false;
      }
    }
    if (!opened && mounted) {
      setState(() => _error = 'No authenticator app could open this. Scan the code or copy the key instead.');
    }
  }

  Future<void> _turnOn() async {
    final code = _code.text.trim();
    if (!RegExp(r'^[0-9]{6}$').hasMatch(code)) {
      setState(() => _error = 'Type the 6-digit code the app shows.');
      return;
    }
    final state = AppScope.of(context);
    final navigator = Navigator.of(context);
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final codes = await state.cloud!.confirmSecondStep(code);
      final route = MaterialPageRoute<void>(builder: (_) => RecoveryCodesScreen(codes));
      if (mounted) {
        navigator.pushReplacement(route);
      } else {
        navigator.push(route);
      }
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Turn on two-step sign-in')),
      body: FutureBuilder<SecondStepSetup>(
        future: _setup,
        builder: (context, loaded) {
          final setup = loaded.data;
          if (setup == null) {
            return Center(
              child: loaded.hasError
                  ? Padding(padding: const EdgeInsets.all(24), child: Text('${loaded.error}', textAlign: TextAlign.center))
                  : const CircularProgressIndicator(),
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              Text(
                'Scan this with Google Authenticator, Authy or any authenticator app, or copy the key into it. Then type the code it shows.',
                style: text.bodyMedium,
              ),
              const SizedBox(height: 16),
              Center(child: QrSquare(data: setup.uri, label: 'QR code for your authenticator app')),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: SelectableText(
                      setup.groupedSecret,
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 18,
                        fontWeight: FontWeight.w500,
                        letterSpacing: 1,
                        height: 48 / 18,
                        leadingDistribution: TextLeadingDistribution.even,
                        color: Palette.ink,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Copy key',
                    onPressed: () => _copy(setup),
                    icon: Icon(_copied ? Icons.check : Icons.copy_outlined),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              OutlinedButton(onPressed: () => _open(setup), child: const Text('Open in authenticator app')),
              const SizedBox(height: 24),
              TextField(
                controller: _code,
                keyboardType: TextInputType.number,
                maxLength: 6,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(labelText: 'Code from the app', counterText: ''),
                onSubmitted: (_) => _turnOn(),
              ),
              if (_error.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(_error, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
              ],
              const SizedBox(height: 16),
              FilledButton(onPressed: _busy ? null : _turnOn, child: Text(_busy ? 'Please wait…' : 'Turn on')),
            ],
          );
        },
      ),
    );
  }
}
