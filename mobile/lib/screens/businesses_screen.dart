import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../marks.dart';
import '../theme.dart';
import '../widgets.dart';
import 'invitation_cards.dart';

class BusinessesScreen extends StatefulWidget {
  const BusinessesScreen({super.key});

  @override
  State<BusinessesScreen> createState() => _BusinessesScreenState();
}

class _BusinessesScreenState extends State<BusinessesScreen> {
  Future<Me>? _me;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _me ??= AppScope.of(context).cloud!.me();
  }

  Future<void> _open(String businessId) async {
    final state = AppScope.of(context);
    final navigator = Navigator.of(context);
    await state.cloud!.switchBusiness(businessId);
    await state.refresh();
    navigator.pop();
  }

  Future<void> _answered({required bool joined}) async {
    final state = AppScope.of(context);
    final navigator = Navigator.of(context);
    if (joined) {
      await state.refresh();
      navigator.pop();
      return;
    }
    setState(() {
      _me = state.cloud!.me();
    });
  }

  Future<bool> _sure(String title, String body, String action) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialog).pop(false), child: const Text('Keep')),
          FilledButton(onPressed: () => Navigator.of(dialog).pop(true), child: Text(action)),
        ],
      ),
    );
    return yes == true;
  }

  Future<void> _deleteBusiness(String name) async {
    final state = AppScope.of(context);
    final navigator = Navigator.of(context);
    if (!await _sure('Delete $name?', 'Its books, documents and members go with it. Backups are kept for fourteen days, after which it cannot be recovered.', 'Delete')) return;
    try {
      await state.cloud!.deleteBusiness();
      await state.refresh();
      navigator.popUntil((route) => route.isFirst);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  Future<void> _deleteAccount() async {
    final state = AppScope.of(context);
    if (!await _sure('Delete your account?', 'You are signed out everywhere. A business where you are the only owner is deleted with you; one with another owner stays with them.', 'Delete account')) return;
    try {
      await state.cloud!.deleteAccount();
      await state.signOut();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  String _error = '';

  @override
  Widget build(BuildContext context) {
    final current = AppScope.of(context).cloud!.businessId;
    return Scaffold(
      appBar: AppBar(title: const Text('Your businesses')),
      body: FutureBuilder<Me>(
        future: _me,
        builder: (context, loaded) {
          final me = loaded.data;
          if (me == null) {
            return Center(
              child: loaded.hasError ? Text('${loaded.error}', textAlign: TextAlign.center) : const CircularProgressIndicator(),
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              if (me.invitations.isNotEmpty) ...[
                const SectionLabel('Invitations'),
                InvitationCards(invitations: me.invitations, onChanged: _answered),
                const SizedBox(height: 14),
              ],
              const SectionLabel('Businesses'),
              Panel(
                children: [
                  for (final business in me.businesses)
                    RowCard(
                      leading: TintTile(tint: Tint.ask, letter: business.name.isEmpty ? '?' : business.name[0].toUpperCase()),
                      title: business.name,
                      subtitle: roleLabel(business.role),
                      trailing: business.id == current ? const StatusTag(text: 'Open', color: Palette.accent) : const Chevron(),
                      onTap: business.id == current ? null : () => _open(business.id),
                    ),
                ],
              ),
              if (_error.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(_error, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
              ],
              const SizedBox(height: 26),
              const SectionLabel('Leaving'),
              Panel(
                children: [
                  for (final business in me.businesses.where((b) => b.id == current && b.role == 'owner'))
                    RowCard(
                      leading: const TintTile(tint: Tint.urgent, mark: Mark.urgent),
                      title: 'Delete ${business.name}',
                      subtitle: 'Removes its books and documents for everyone',
                      onTap: () => _deleteBusiness(business.name),
                    ),
                  RowCard(
                    leading: const TintTile(tint: Tint.urgent, mark: Mark.urgent),
                    title: 'Delete my account',
                    subtitle: 'Signs you out everywhere; businesses you alone own go with it',
                    onTap: _deleteAccount,
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}
