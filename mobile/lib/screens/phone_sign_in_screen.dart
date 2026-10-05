import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../brand.dart';
import '../theme.dart';

class PhoneSignInScreen extends StatefulWidget {
  const PhoneSignInScreen({super.key});

  @override
  State<PhoneSignInScreen> createState() => _PhoneSignInScreenState();
}

class _PhoneSignInScreenState extends State<PhoneSignInScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  String _error = '';
  bool _busy = false;

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await action();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendCode() {
    final state = AppScope.of(context);
    return _run(() async {
      await state.cloud!.requestCode(_phone.text.trim());
      _code.clear();
    });
  }

  Future<void> _verify() {
    final state = AppScope.of(context);
    return _run(() async {
      await state.cloud!.verifyCode(_code.text.trim());
      await state.refresh();
    });
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final cloud = AppScope.of(context).cloud!;
    final awaitingCode = cloud.awaitingCode;
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
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: BrandMark(size: 44),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    awaitingCode ? 'Enter the code' : 'Your mobile number',
                    style: text.displaySmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    awaitingCode
                        ? 'We sent a 6-digit code to ${_phone.text.trim()}.'
                        : 'We will text you a code to sign in. No password to remember.',
                    style: text.bodyLarge?.copyWith(color: Palette.muted),
                  ),
                  const SizedBox(height: 28),
                  if (!awaitingCode)
                    TextField(
                      controller: _phone,
                      autofocus: true,
                      keyboardType: TextInputType.phone,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]')),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Mobile number',
                        prefixText: '+91  ',
                      ),
                      onSubmitted: (_) => _sendCode(),
                    )
                  else
                    TextField(
                      controller: _code,
                      autofocus: true,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      style: const TextStyle(
                        fontSize: 22,
                        letterSpacing: 6,
                        fontWeight: FontWeight.w500,
                      ),
                      decoration: const InputDecoration(
                        labelText: 'Code',
                        counterText: '',
                      ),
                      onSubmitted: (_) => _verify(),
                    ),
                  if (_error.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(
                      _error,
                      style: const TextStyle(
                        color: Palette.danger,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _busy
                        ? null
                        : (awaitingCode ? _verify : _sendCode),
                    child: Text(
                      _busy
                          ? 'Please wait…'
                          : (awaitingCode ? 'Sign in' : 'Send code'),
                    ),
                  ),
                  if (awaitingCode) ...[
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () => setState(() {
                              cloud.changeNumber();
                              _error = '';
                            }),
                      child: const Text('Use a different number'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
