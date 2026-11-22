import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../brand.dart';
import '../india/india_strings.dart';
import '../theme.dart';
import '../uae/uae_cloud_strings.dart';
import '../uae/uae_edition.dart';
import '../uae/uae_strings.dart';

String signInMessage(BuildContext context, String code) => switch (code) {
  'USER_NOT_FOUND' => inText(context, 'That user does not exist.'),
  'INVALID_PIN' => inText(context, 'Wrong PIN. Try again.'),
  'PIN_NOT_SET' => inText(context, 'This user has no PIN yet. Set one in MyCA on Windows.'),
  'USER_LOCKED_OUT' => inText(context, 'Too many wrong attempts. This user is locked.'),
  _ => inFormat(context, 'Could not sign in ({code}).', {'code': code}),
};

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key, required this.snapshot});

  final Snapshot snapshot;

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _pin = TextEditingController();
  String? _userId;
  String _error = '';
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final users = widget.snapshot.users;
    if (users.isNotEmpty) _userId = users.first.userId;
  }

  @override
  void dispose() {
    _pin.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final userId = _userId;
    if (userId == null || _pin.text.isEmpty || _busy) return;
    final state = AppScope.of(context);
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      final result = await state.api.signIn(userId, _pin.text);
      if (!mounted) return;
      if (result.ok) {
        await state.refresh();
        return;
      }
      setState(() => _error = uaeEdition(context) ? UaeStrings.of(context).pinProblem(result.error) : signInMessage(context, result.error));
    } on MycaApiException catch (err) {
      if (!mounted) return;
      setState(() => _error = err.message);
    } finally {
      if (mounted) {
        _pin.clear();
        setState(() => _busy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final users = widget.snapshot.users;
    final s = UaeStrings.of(context);
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
                    child: BrandMark(size: 52),
                  ),
                  const SizedBox(height: 24),
                  Text(s.welcomeBack, style: text.displaySmall),
                  const SizedBox(height: 6),
                  Text(widget.snapshot.company.name, style: text.bodyLarge),
                  const SizedBox(height: 32),
                  if (users.isEmpty)
                    Text(s.noUsersYet)
                  else ...[
                    if (users.length > 1)
                      DropdownButtonFormField<String>(
                        isExpanded: true,
                        initialValue: _userId,
                        decoration: InputDecoration(labelText: s.user),
                        items: [
                          for (final user in users)
                            DropdownMenuItem(
                              value: user.userId,
                              child: Text(user.name),
                            ),
                        ],
                        onChanged: (value) => setState(() => _userId = value),
                      )
                    else
                      Text(
                        s.signingInAs(users.first.name),
                        style: text.titleMedium,
                      ),
                    const SizedBox(height: 16),
                    TextField(
                      controller: _pin,
                      obscureText: true,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      style: const TextStyle(
                        fontSize: 22,
                        letterSpacing: 8,
                        fontWeight: FontWeight.w700,
                      ),
                      decoration: InputDecoration(labelText: s.pin),
                      onSubmitted: (_) => _submit(),
                    ),
                    if (_error.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(
                        s.cloudSaid(_error),
                        style: TextStyle(
                          color: Palette.danger,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: Text(_busy ? s.signingIn : s.signIn),
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
