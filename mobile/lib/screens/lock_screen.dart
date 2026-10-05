import 'package:flutter/material.dart';

import '../app_state.dart';
import '../brand.dart';
import '../theme.dart';

class LockScreen extends StatefulWidget {
  const LockScreen({super.key});

  @override
  State<LockScreen> createState() => _LockScreenState();
}

class _LockScreenState extends State<LockScreen> {
  bool _busy = false;
  bool _failed = false;
  bool _asked = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_asked) return;
    _asked = true;
    WidgetsBinding.instance.addPostFrameCallback((_) => _unlock());
  }

  Future<void> _unlock() async {
    if (_busy || !mounted) return;
    final state = AppScope.of(context);
    setState(() {
      _busy = true;
      _failed = false;
    });
    final opened = await state.unlock();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _failed = !opened;
    });
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(flex: 2),
              const BrandMark(size: 64),
              const SizedBox(height: 24),
              Text('MyCA is locked', style: text.headlineMedium),
              const SizedBox(height: 8),
              Text(
                _failed ? 'That did not work. Try again.' : 'Use your fingerprint, face or screen lock to open your books.',
                textAlign: TextAlign.center,
                style: text.bodyLarge?.copyWith(color: _failed ? Palette.danger : Palette.muted),
              ),
              const Spacer(flex: 3),
              SizedBox(
                width: double.infinity,
                child: FilledButton(onPressed: _busy ? null : _unlock, child: Text(_busy ? 'Waiting…' : 'Unlock')),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: _busy ? null : AppScope.of(context).signOut,
                child: const Text('Sign out instead'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
