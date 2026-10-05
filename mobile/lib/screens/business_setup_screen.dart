import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../migration.dart';
import 'invitation_cards.dart';
import '../theme.dart';

class BusinessSetupScreen extends StatefulWidget {
  const BusinessSetupScreen({super.key});

  @override
  State<BusinessSetupScreen> createState() => _BusinessSetupScreenState();
}

class _BusinessSetupScreenState extends State<BusinessSetupScreen> {
  final _name = TextEditingController();
  final _gstin = TextEditingController();
  Future<List<StateRef>>? _states;
  Future<Me>? _me;
  String? _state;
  String _error = '';
  bool _busy = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _states ??= AppScope.of(context).cloud!.states();
    _me ??= AppScope.of(context).cloud!.me();
  }

  @override
  void dispose() {
    _name.dispose();
    _gstin.dispose();
    super.dispose();
  }

  Future<void> _answered({required bool joined}) async {
    final state = AppScope.of(context);
    if (joined) return state.refresh();
    setState(() {
      _me = state.cloud!.me();
    });
  }

  bool get _registered => _gstin.text.trim().isNotEmpty;

  Future<void> _create() async {
    final name = _name.text.trim();
    final gstin = _gstin.text.trim().toUpperCase();
    final shape = gstinShapeError(gstin);
    if (name.isEmpty) {
      return setState(() => _error = 'Enter your business name.');
    }
    if (shape != null) return setState(() => _error = shape);
    if (gstin.isEmpty && _state == null) {
      return setState(() => _error = 'Choose the state your business is in.');
    }
    final state = AppScope.of(context);
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await state.cloud!.createBusiness(
        name: name,
        gstin: gstin,
        state: gstin.isEmpty ? _state! : '',
      );
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
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        actions: [
          TextButton(
            onPressed: AppScope.of(context).signOut,
            child: const Text('Sign out'),
          ),
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
            Text('Tell us about the business', style: text.headlineMedium),
            const SizedBox(height: 6),
            Text(
              'This goes on your invoices and returns.',
              style: text.bodyLarge?.copyWith(color: Palette.muted),
            ),
            const SizedBox(height: 24),
            TextField(
              controller: _name,
              autofocus: true,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Business name'),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _gstin,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(
                labelText: 'GSTIN',
                helperText: 'Leave empty if you are not registered for GST',
              ),
              onChanged: (_) => setState(() {}),
            ),
            if (!_registered) ...[
              const SizedBox(height: 14),
              FutureBuilder<List<StateRef>>(
                future: _states,
                builder: (context, loaded) {
                  final states = loaded.data ?? const <StateRef>[];
                  return DropdownButtonFormField<String>(
                    initialValue: _state,
                    isExpanded: true,
                    decoration: InputDecoration(
                      labelText: 'State',
                      helperText: loaded.hasError
                          ? 'Could not load the list of states.'
                          : null,
                    ),
                    items: [
                      for (final state in states)
                        DropdownMenuItem(
                          value: state.code,
                          child: Text(state.name),
                        ),
                    ],
                    onChanged: (value) => setState(() => _state = value),
                  );
                },
              ),
            ],
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
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _busy ? null : _create,
              child: Text(_busy ? 'Setting up…' : 'Continue'),
            ),
          ],
        ),
      ),
    );
  }
}
