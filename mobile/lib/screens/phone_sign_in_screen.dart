import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../brand.dart';
import '../cloud/cloud_session.dart';
import '../secure_window.dart';
import '../theme.dart';

String? usPhoneNumber(String typed) {
  var digits = typed.replaceAll(RegExp(r'\D'), '');
  if (digits.length == 11 && digits.startsWith('1')) digits = digits.substring(1);
  if (!RegExp(r'^[2-9]\d{2}[2-9]\d{6}$').hasMatch(digits)) return null;
  return '+1$digits';
}

class PhoneSignInScreen extends StatefulWidget {
  const PhoneSignInScreen({super.key});

  @override
  State<PhoneSignInScreen> createState() => _PhoneSignInScreenState();
}

class _PhoneSignInScreenState extends State<PhoneSignInScreen> with SecureWindowWhileShown {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  final _authCode = TextEditingController();
  String _error = '';
  bool _busy = false;
  SignInMethods? _methods;
  bool _asked = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_asked) return;
    _asked = true;
    AppScope.of(context).cloud!.methods().then((methods) {
      if (mounted) setState(() => _methods = methods);
    });
  }

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    _authCode.dispose();
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
    final String phone;
    if (state.edition == 'US') {
      final number = usPhoneNumber(_phone.text);
      if (number == null) {
        setState(() => _error = 'Enter your 10-digit US phone number, like (415) 555-0123.');
        return Future.value();
      }
      phone = number;
    } else {
      phone = _phone.text.trim();
    }
    return _run(() async {
      await state.cloud!.requestCode(phone);
      _code.clear();
    });
  }

  Future<void> _google() {
    final state = AppScope.of(context);
    return _run(() async {
      final token = await state.google!.idToken();
      if (token == null) return;
      await state.cloud!.signInWithGoogle(token);
      await state.refresh();
    });
  }

  Future<void> _firm() {
    final state = AppScope.of(context);
    final issuer = _methods?.oidcIssuer ?? '';
    return _run(() async {
      final token = await state.oidc!.idToken(issuer);
      await state.cloud!.signInWithOidc(token);
      await state.refresh();
    });
  }

  Future<void> _verify() {
    final state = AppScope.of(context);
    return _run(() async {
      await state.cloud!.verifyCode(_code.text.trim());
      await state.refresh();
    });
  }

  Future<void> _secondStep() {
    final state = AppScope.of(context);
    return _run(() async {
      final result = await state.cloud!.completeSecondStep(_authCode.text.trim());
      state.noteSecondStep(result);
      await state.refresh();
    });
  }

  void _startOver(CloudSession cloud) {
    setState(() {
      cloud.cancelSecondStep();
      _authCode.clear();
      _code.clear();
      _error = '';
    });
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final state = AppScope.of(context);
    final cloud = state.cloud!;
    final secondStep = cloud.secondStepPending;
    final awaitingCode = cloud.awaitingCode && !secondStep;
    final googleOn = state.google != null && (_methods?.google ?? true);
    final firmOn = state.oidc != null && (_methods?.oidc ?? false);
    final firmHost = _methods?.oidcIssuerHost ?? '';
    final phoneOn = (_methods?.phone ?? true) && !(state.edition == 'US' && (googleOn || firmOn));
    final phoneOnly = phoneOn && !googleOn && !firmOn;
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
                    secondStep
                        ? 'Enter your authenticator code'
                        : awaitingCode
                            ? 'Enter the code'
                            : (phoneOnly ? 'Your mobile number' : 'Sign in'),
                    style: text.displaySmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    secondStep
                        ? 'Open your authenticator app and type the 6-digit code. A recovery code works too.'
                        : awaitingCode
                            ? 'We sent a 6-digit code to ${_phone.text.trim()}.'
                            : (phoneOnly
                                  ? 'We will text you a code to sign in. No password to remember.'
                                  : (googleOn ? 'Use your Google account. No new password to remember.' : 'Use the account your firm gave you. No new password to remember.')),
                    style: text.bodyLarge?.copyWith(color: Palette.muted),
                  ),
                  const SizedBox(height: 28),
                  if (googleOn && !awaitingCode && !secondStep) ...[
                    FilledButton(
                      onPressed: _busy ? null : _google,
                      child: Text(
                        _busy ? 'Please wait…' : 'Continue with Google',
                      ),
                    ),
                  ],
                  if (firmOn && !awaitingCode && !secondStep) ...[
                    if (googleOn) const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: _busy ? null : _firm,
                      child: Text(firmHost.isEmpty ? 'Sign in with your firm\'s account' : 'Sign in with your firm\'s account ($firmHost)'),
                    ),
                  ],
                  if ((googleOn || firmOn) && phoneOn && !awaitingCode && !secondStep) ...[
                    const SizedBox(height: 24),
                    Text(
                      'Or use your mobile number',
                      style: text.bodyMedium?.copyWith(color: Palette.muted),
                    ),
                    const SizedBox(height: 8),
                  ],
                  if (secondStep)
                    TextField(
                      controller: _authCode,
                      autofocus: true,
                      maxLength: 11,
                      autocorrect: false,
                      enableSuggestions: false,
                      autofillHints: const [AutofillHints.oneTimeCode],
                      style: const TextStyle(
                        fontSize: 22,
                        letterSpacing: 4,
                        fontWeight: FontWeight.w500,
                      ),
                      decoration: const InputDecoration(
                        labelText: 'Code',
                        counterText: '',
                      ),
                      onSubmitted: (_) => _secondStep(),
                    )
                  else if (!phoneOn && !googleOn && !firmOn)
                    Text(
                      'Sign-in is not available right now. Try again later.',
                      style: text.bodyLarge,
                    )
                  else if (!phoneOn)
                    const SizedBox.shrink()
                  else if (!awaitingCode)
                    TextField(
                      controller: _phone,
                      autofocus: true,
                      keyboardType: TextInputType.phone,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(state.edition == 'US' ? RegExp(r'[0-9() -]') : RegExp(r'[0-9+ ]')),
                      ],
                      autofillHints: const [AutofillHints.telephoneNumberNational],
                      decoration: state.edition == 'US'
                          ? const InputDecoration(
                              labelText: 'Mobile number',
                              prefixText: '+1  ',
                              hintText: '(415) 555-0123',
                            )
                          : const InputDecoration(
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
                  if (secondStep) ...[
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _busy ? null : _secondStep,
                      child: Text(_busy ? 'Please wait…' : 'Sign in'),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _busy ? null : () => _startOver(cloud),
                      child: const Text('Start over'),
                    ),
                  ] else if (phoneOn) ...[
                    const SizedBox(height: 20),
                    ((googleOn || firmOn) && !awaitingCode)
                        ? OutlinedButton(
                            onPressed: _busy ? null : _sendCode,
                            child: const Text('Send code'),
                          )
                        : FilledButton(
                            onPressed: _busy
                                ? null
                                : (awaitingCode ? _verify : _sendCode),
                            child: Text(
                              _busy
                                  ? 'Please wait…'
                                  : (awaitingCode ? 'Sign in' : 'Send code'),
                            ),
                          ),
                  ],
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
