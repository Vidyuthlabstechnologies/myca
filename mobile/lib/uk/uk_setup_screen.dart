import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../screens/invitation_cards.dart';
import '../theme.dart';
import 'uk_common.dart';

class UkSetupScreen extends StatefulWidget {
  const UkSetupScreen({super.key});

  @override
  State<UkSetupScreen> createState() => _UkSetupScreenState();
}

class _UkSetupScreenState extends State<UkSetupScreen> {
  final _name = TextEditingController();
  Future<Me>? _me;
  String _error = '';
  bool _busy = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _me ??= AppScope.of(context).cloud?.me();
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _answered({required bool joined}) async {
    final state = AppScope.of(context);
    if (joined) return state.refresh();
    setState(() => _me = state.cloud?.me());
  }

  Future<void> _create() async {
    final name = _name.text.trim();
    if (name.isEmpty) return setState(() => _error = 'Enter your name or your business name.');
    final state = AppScope.of(context);
    final cloud = state.cloud;
    if (cloud == null) return;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await cloud.createBusiness(name: name, country: 'GB');
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
    final state = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        actions: [
          TextButton(onPressed: state.signOut, child: const Text('Sign out')),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          children: [
            FutureBuilder<Me>(
              future: _me,
              builder: (context, loaded) {
                final invitations = loaded.data?.invitations ?? const <InvitationRef>[];
                if (invitations.isEmpty) return const SizedBox.shrink();
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text('You have been invited', style: text.headlineMedium),
                    const SizedBox(height: 14),
                    InvitationCards(invitations: invitations, onChanged: _answered),
                    const SizedBox(height: 10),
                    const Divider(),
                    const SizedBox(height: 18),
                  ],
                );
              },
            ),
            Text('Set up your UK tax', style: text.headlineMedium),
            const SizedBox(height: 6),
            Text('Sole traders, landlords and small businesses: VAT returns, Self Assessment and Making Tax Digital in one place.', style: text.bodyLarge?.copyWith(color: Palette.muted)),
            const SizedBox(height: 22),
            TextField(
              key: const Key('ukSetup.name'),
              controller: _name,
              textCapitalization: TextCapitalization.words,
              inputFormatters: [LengthLimitingTextInputFormatter(160)],
              decoration: const InputDecoration(labelText: 'Your name or business name', helperText: 'As HMRC has it'),
            ),
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(_error, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
            ],
            const SizedBox(height: 24),
            FilledButton(
              key: const Key('ukSetup.continue'),
              onPressed: _busy ? null : _create,
              child: Text(_busy ? 'Setting up…' : 'Continue'),
            ),
            const SizedBox(height: 18),
            Text(
              'Your records are kept in the UK. Nothing is sent to HMRC until you check it and say so. $builtForMtd',
              style: text.bodySmall?.copyWith(color: Palette.muted),
            ),
          ],
        ),
      ),
    );
  }
}
