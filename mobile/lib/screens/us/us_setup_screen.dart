import 'package:flutter/material.dart';

import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../cloud/cloud_session.dart';
import '../../marks.dart';
import '../../theme.dart';
import '../../widgets.dart';
import '../invitation_cards.dart';

class UsSetupScreen extends StatefulWidget {
  const UsSetupScreen({super.key});

  @override
  State<UsSetupScreen> createState() => _UsSetupScreenState();
}

class _UsSetupScreenState extends State<UsSetupScreen> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _business = TextEditingController();
  Future<Me>? _me;
  String _goal = 'personal';
  String _error = '';
  bool _busy = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _me ??= AppScope.of(context).cloud!.me();
  }

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _business.dispose();
    super.dispose();
  }

  Future<void> _answered({required bool joined}) async {
    final state = AppScope.of(context);
    if (joined) return state.refresh();
    setState(() => _me = state.cloud!.me());
  }

  Future<void> _create() async {
    final personal = _goal == 'personal';
    final first = _first.text.trim();
    final last = _last.text.trim();
    final business = _business.text.trim();
    if (personal && (first.isEmpty || last.isEmpty)) {
      return setState(() => _error = 'Enter your first and last name as they are on your Social Security card.');
    }
    if (!personal && business.isEmpty) return setState(() => _error = 'Enter your business name.');
    final state = AppScope.of(context);
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await state.cloud!.createBusiness(
        name: personal ? '$first $last' : business,
        country: 'US',
        kind: personal ? 'household' : '',
      );
      await state.refresh();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _choice(String value, Mark mark, String title, String subtitle) {
    final picked = _goal == value;
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radiusCard),
        border: Border.all(color: picked ? Palette.accent : Palette.line, width: picked ? 2 : 1),
      ),
      clipBehavior: Clip.antiAlias,
      child: RowCard(
        key: Key('usSetup.$value'),
        leading: TintTile(tint: picked ? Tint.taxes : Tint.ask, mark: mark),
        title: title,
        subtitle: subtitle,
        trailing: Icon(picked ? Icons.radio_button_checked : Icons.radio_button_off, color: picked ? Palette.accent : Palette.faint),
        onTap: () => setState(() {
          _goal = value;
          _error = '';
        }),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final state = AppScope.of(context);
    final personal = _goal == 'personal';
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
            Text('What would you like to do?', style: text.headlineMedium),
            const SizedBox(height: 6),
            Text('You can add the other one later.', style: text.bodyLarge?.copyWith(color: Palette.muted)),
            const SizedBox(height: 20),
            _choice('personal', Mark.taxes, 'File my personal tax return', 'Form 1040 with your W-2s, 1099s and deductions, e-filed with the IRS'),
            const SizedBox(height: 10),
            _choice('business', Mark.sales, 'Keep books for my US business', 'Invoices, sales tax, payroll, 1099s for contractors and Schedule C'),
            const SizedBox(height: 22),
            if (personal) ...[
              TextField(
                key: const Key('usSetup.first'),
                controller: _first,
                textCapitalization: TextCapitalization.words,
                autofillHints: const [AutofillHints.givenName],
                decoration: const InputDecoration(labelText: 'First name'),
              ),
              const SizedBox(height: 14),
              TextField(
                key: const Key('usSetup.last'),
                controller: _last,
                textCapitalization: TextCapitalization.words,
                autofillHints: const [AutofillHints.familyName],
                decoration: const InputDecoration(labelText: 'Last name', helperText: 'As on your Social Security card'),
              ),
            ] else
              TextField(
                key: const Key('usSetup.business'),
                controller: _business,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Business name', helperText: 'The legal name, as on your EIN letter'),
              ),
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(_error, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
            ],
            const SizedBox(height: 24),
            FilledButton(
              key: const Key('usSetup.continue'),
              onPressed: _busy ? null : _create,
              child: Text(_busy ? 'Setting up…' : 'Continue'),
            ),
            const SizedBox(height: 18),
            Text(
              'Your return is encrypted on our servers, your Social Security number is sealed separately and never shown in full, and nothing is sent to the IRS until you sign.',
              style: text.bodySmall?.copyWith(color: Palette.muted),
            ),
            const SizedBox(height: 12),
            Center(
              child: TextButton(
                key: const Key('usSetup.india'),
                onPressed: () => state.chooseRegion('IN'),
                child: const Text('Filing in India instead?'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
