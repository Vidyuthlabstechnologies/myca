import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../brand.dart';
import '../cloud/cloud_session.dart';
import '../india/india_strings.dart';
import '../my/my_strings.dart';
import '../secure_window.dart';
import '../theme.dart';
import '../uae/uae_cloud_strings.dart';
import '../uae/uae_edition.dart';
import '../uae/uae_strings.dart';
import 'apple_sign_in_button.dart';
import 'privacy_notice_screen.dart';

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
    } else if (state.edition == 'MY') {
      final digits = _phone.text.replaceAll(RegExp(r'\D'), '').replaceFirst(RegExp(r'^(60|0)'), '');
      phone = '+60$digits';
    } else if (uaeEdition(context)) {
      final number = uaeMobileNumber(_phone.text);
      if (number == null) {
        setState(() => _error = UaeStrings.of(context).enterUaeMobile);
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

  Future<void> _apple() {
    final state = AppScope.of(context);
    return _run(() async {
      final credential = await state.apple!.credential();
      if (credential == null) return;
      await state.cloud!.signInWithApple(credential);
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
    String w(String english, String malay) => myMalayOr(context, english, malay);
    final wait = w(UaeStrings.of(context).pleaseWait, 'Sila tunggu…');
    final muted = state.edition == 'MY' ? Theme.of(context).colorScheme.onSurfaceVariant : Palette.muted;
    final secondStep = cloud.secondStepPending;
    final awaitingCode = cloud.awaitingCode && !secondStep;
    final googleOn = state.google != null && (_methods?.google ?? true);
    final appleOn = state.apple != null && (_methods?.apple ?? true);
    final firmOn = state.oidc != null && (_methods?.oidc ?? false);
    final firmHost = _methods?.oidcIssuerHost ?? '';
    final accountOn = googleOn || appleOn || firmOn;
    final phoneOn = (_methods?.phone ?? true) && !((state.edition == 'US' || state.edition == 'MY') && accountOn);
    final phoneOnly = phoneOn && !accountOn;
    final s = UaeStrings.of(context);
    final ae = uaeEdition(context);
    final accountHint = s.accountHint(apple: appleOn, google: googleOn);
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
                        ? w(s.enterAuthenticatorCode, 'Masukkan kod pengesah anda')
                        : awaitingCode
                            ? w(s.enterTheCode, 'Masukkan kod')
                            : (phoneOnly ? w(s.yourMobileNumber, 'Nombor telefon bimbit anda') : w(s.signIn, 'Log masuk')),
                    style: text.displaySmall,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    secondStep
                        ? w(s.authenticatorNote, 'Buka aplikasi pengesah anda dan taip kod 6 digit. Kod pemulihan juga boleh digunakan.')
                        : awaitingCode
                            ? w(s.sentCodeTo(_phone.text.trim()), 'Kami telah menghantar kod 6 digit ke ${_phone.text.trim()}.')
                            : (phoneOnly
                                  ? w(s.weWillText, 'Kami akan menghantar kod melalui SMS untuk log masuk. Tiada kata laluan untuk diingat.')
                                  : (!appleOn ? w(accountHint, googleOn ? 'Gunakan akaun Google anda. Tiada kata laluan baharu untuk diingat.' : 'Gunakan akaun yang diberikan oleh firma anda. Tiada kata laluan baharu untuk diingat.') : accountHint)),
                    style: text.bodyLarge?.copyWith(color: muted),
                  ),
                  if (!awaitingCode && !secondStep) ...[
                    const SizedBox(height: 12),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton(
                        key: const Key('signIn.privacy'),
                        style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(48, 48)),
                        onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PrivacyNoticeScreen(readOnly: true))),
                        child: Text(w(s.readPrivacy, 'Baca cara MyCA menggunakan data anda (dasar privasi)')),
                      ),
                    ),
                  ],
                  const SizedBox(height: 28),
                  if (appleOn && !awaitingCode && !secondStep) ...[
                    AppleSignInButton(busy: _busy, onPressed: _busy ? null : _apple),
                  ],
                  if (googleOn && !awaitingCode && !secondStep) ...[
                    if (appleOn) const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _busy ? null : _google,
                      child: Text(
                        _busy ? wait : w(s.continueWithGoogle, 'Teruskan dengan Google'),
                      ),
                    ),
                  ],
                  if (firmOn && !awaitingCode && !secondStep) ...[
                    if (googleOn || appleOn) const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: _busy ? null : _firm,
                      child: Text(w(s.firmAccount(firmHost), firmHost.isEmpty ? 'Log masuk dengan akaun firma anda' : 'Log masuk dengan akaun firma anda ($firmHost)')),
                    ),
                  ],
                  if (accountOn && phoneOn && !awaitingCode && !secondStep) ...[
                    const SizedBox(height: 24),
                    Text(
                      w(s.orUseMobile, 'Atau gunakan nombor telefon bimbit anda'),
                      style: text.bodyMedium?.copyWith(color: muted),
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
                      decoration: InputDecoration(
                        labelText: w(s.code, 'Kod'),
                        counterText: '',
                      ),
                      onSubmitted: (_) => _secondStep(),
                    )
                  else if (!phoneOn && !accountOn)
                    Text(
                      w(s.signInUnavailable, 'Log masuk tidak tersedia sekarang. Cuba lagi kemudian.'),
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
                        const UaeWesternDigitsFormatter(),
                        FilteringTextInputFormatter.allow(state.edition == 'US' ? RegExp(r'[0-9() -]') : RegExp(r'[0-9+ ]')),
                      ],
                      autofillHints: const [AutofillHints.telephoneNumberNational],
                      decoration: state.edition == 'US'
                          ? const InputDecoration(
                              labelText: 'Mobile number',
                              prefixText: '+1  ',
                              hintText: '(415) 555-0123',
                            )
                          : state.edition == 'MY'
                          ? InputDecoration(
                              labelText: w('Mobile number', 'Nombor telefon bimbit'),
                              prefixText: '+60  ',
                              hintText: '12 345 6789',
                            )
                          : ae
                          ? InputDecoration(
                              labelText: s.mobileNumber,
                              prefixText: s.uaePrefix,
                              hintText: '050 123 4567',
                            )
                          : InputDecoration(
                              labelText: inText(context, 'Mobile number'),
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
                      inputFormatters: [const UaeWesternDigitsFormatter(), FilteringTextInputFormatter.digitsOnly],
                      style: const TextStyle(
                        fontSize: 22,
                        letterSpacing: 6,
                        fontWeight: FontWeight.w500,
                      ),
                      decoration: InputDecoration(
                        labelText: w(s.code, 'Kod'),
                        counterText: '',
                      ),
                      onSubmitted: (_) => _verify(),
                    ),
                  if (_error.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(
                      s.cloudSaid(_error),
                      style: TextStyle(
                        color: Palette.danger,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                  if (secondStep) ...[
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _busy ? null : _secondStep,
                      child: Text(_busy ? wait : w(s.signIn, 'Log masuk')),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _busy ? null : () => _startOver(cloud),
                      child: Text(w(s.startOver, 'Mula semula')),
                    ),
                  ] else if (phoneOn) ...[
                    const SizedBox(height: 20),
                    (accountOn && !awaitingCode)
                        ? OutlinedButton(
                            onPressed: _busy ? null : _sendCode,
                            child: Text(w(s.sendCode, 'Hantar kod')),
                          )
                        : FilledButton(
                            onPressed: _busy
                                ? null
                                : (awaitingCode ? _verify : _sendCode),
                            child: Text(
                              _busy
                                  ? wait
                                  : (awaitingCode ? w(s.signIn, 'Log masuk') : w(s.sendCode, 'Hantar kod')),
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
                      child: Text(w(s.differentNumber, 'Guna nombor lain')),
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
