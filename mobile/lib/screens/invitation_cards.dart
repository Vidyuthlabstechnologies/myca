import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../theme.dart';

const roleLabels = {'owner': 'Owner', 'staff': 'Staff', 'accountant': 'Accountant'};

String roleLabel(String role) => roleLabels[role] ?? role;

class InvitationCards extends StatefulWidget {
  const InvitationCards({super.key, required this.invitations, required this.onChanged});

  final List<InvitationRef> invitations;
  final Future<void> Function({required bool joined}) onChanged;

  @override
  State<InvitationCards> createState() => _InvitationCardsState();
}

class _InvitationCardsState extends State<InvitationCards> {
  String _error = '';
  bool _busy = false;

  Future<void> _answer(InvitationRef invitation, bool accept) async {
    final cloud = AppScope.of(context).cloud!;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await cloud.respondToInvitation(invitation.id, accept: accept);
      await widget.onChanged(joined: accept);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final invitation in widget.invitations)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Palette.accentSoft,
              borderRadius: BorderRadius.circular(radiusCard),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(invitation.businessName, style: text.titleLarge),
                const SizedBox(height: 2),
                Text(
                  invitation.invitedBy.isEmpty
                      ? 'You are invited as ${roleLabel(invitation.role).toLowerCase()}.'
                      : '${invitation.invitedBy} invited you as ${roleLabel(invitation.role).toLowerCase()}.',
                  style: text.bodyMedium?.copyWith(color: Palette.ink),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _busy ? null : () => _answer(invitation, false),
                        child: const Text('Decline'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 2,
                      child: FilledButton(
                        onPressed: _busy ? null : () => _answer(invitation, true),
                        child: const Text('Join'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        if (_error.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(_error, style: TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
          ),
      ],
    );
  }
}
