import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../brand.dart';
import '../theme.dart';

const _signInErrors = {
  'USER_NOT_FOUND': 'That user does not exist.',
  'INVALID_PIN': 'Wrong PIN. Try again.',
  'PIN_NOT_SET': 'This user has no PIN yet. Set one in MyCA on Windows.',
  'USER_LOCKED_OUT': 'Too many wrong attempts. This user is locked.',
};

String signInMessage(String code) =>
    _signInErrors[code] ?? 'Could not sign in ($code).';

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
      setState(() => _error = signInMessage(result.error));
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
                  Text('Welcome back', style: text.displaySmall),
                  const SizedBox(height: 6),
                  Text(widget.snapshot.company.name, style: text.bodyLarge),
                  const SizedBox(height: 32),
                  if (users.isEmpty)
                    const Text('No users are set up for this business yet.')
                  else ...[
                    if (users.length > 1)
                      DropdownButtonFormField<String>(
                        isExpanded: true,
                        initialValue: _userId,
                        decoration: const InputDecoration(labelText: 'User'),
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
                        'Signing in as ${users.first.name}',
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
                      decoration: const InputDecoration(labelText: 'PIN'),
                      onSubmitted: (_) => _submit(),
                    ),
                    if (_error.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(
                        _error,
                        style: const TextStyle(
                          color: Palette.danger,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: Text(_busy ? 'Signing in…' : 'Sign in'),
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
