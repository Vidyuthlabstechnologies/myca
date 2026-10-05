import 'package:flutter/material.dart';

import '../app_state.dart';
import '../cloud/cloud_session.dart';
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
            ],
          );
        },
      ),
    );
  }
}
