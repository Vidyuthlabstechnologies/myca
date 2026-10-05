import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'invitation_cards.dart';

const _roleHelp = {
  'staff': 'Records sales, bills, payments and expenses.',
  'accountant': 'Works in the books like staff. For your CA or bookkeeper.',
};

class PeopleScreen extends StatefulWidget {
  const PeopleScreen({super.key});

  @override
  State<PeopleScreen> createState() => _PeopleScreenState();
}

class _PeopleScreenState extends State<PeopleScreen> {
  Future<People>? _people;
  String _error = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _people ??= AppScope.of(context).cloud!.people();
  }

  void _reload() {
    final next = AppScope.of(context).cloud!.people();
    setState(() {
      _people = next;
    });
  }

  Future<void> _do(Future<void> Function() action) async {
    setState(() => _error = '');
    try {
      await action();
      if (mounted) _reload();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  Future<bool> _sure(String title, String body, String action) async {
    final answer = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialog).pop(false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.of(dialog).pop(true), child: Text(action)),
        ],
      ),
    );
    return answer == true;
  }

  Future<void> _invite() async {
    final cloud = AppScope.of(context).cloud!;
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _InviteSheet(cloud: cloud),
    );
    if (sent == true && mounted) _reload();
  }

  Future<void> _remove(MemberRef member) async {
    final cloud = AppScope.of(context).cloud!;
    final name = member.name.isEmpty ? 'this person' : member.name;
    if (!await _sure('Remove $name?', 'They lose access to these books at once. What they recorded stays.', 'Remove')) return;
    await _do(() => cloud.removeMember(member.id));
  }

  Future<void> _leave(String myId) async {
    final state = AppScope.of(context);
    final navigator = Navigator.of(context);
    if (!await _sure('Leave this business?', 'You lose access to these books at once.', 'Leave')) return;
    try {
      await state.cloud!.leaveBusiness(myId);
      await state.refresh();
      navigator.popUntil((route) => route.isFirst);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final me = state.snapshot?.activeUser;
    final owner = me?.role == 'owner';
    return Scaffold(
      appBar: AppBar(title: const Text('People')),
      floatingActionButton: owner
          ? FloatingActionButton.extended(
              onPressed: _invite,
              icon: const Icon(Icons.add, size: 20),
              label: const Text('Invite someone'),
            )
          : null,
      body: FutureBuilder<People>(
        future: _people,
        builder: (context, loaded) {
          final people = loaded.data;
          if (people == null) {
            return Center(
              child: loaded.hasError ? Text('${loaded.error}', textAlign: TextAlign.center) : const CircularProgressIndicator(),
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
            children: [
              if (_error.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(_error, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
                ),
              const SectionLabel('In this business'),
              Panel(
                children: [
                  for (final member in people.members)
                    RowCard(
                      leading: TintTile(tint: Tint.ask, letter: member.name.isEmpty ? '?' : member.name[0].toUpperCase()),
                      title: member.id == me?.userId ? '${member.name.isEmpty ? 'You' : member.name} (you)' : (member.name.isEmpty ? 'No name yet' : member.name),
                      subtitle: roleLabel(member.role),
                      trailing: member.id == me?.userId
                          ? (owner ? null : TextButton(onPressed: () => _leave(member.id), child: const Text('Leave')))
                          : (owner && member.role != 'owner'
                              ? TextButton(onPressed: () => _remove(member), child: const Text('Remove'))
                              : null),
                    ),
                ],
              ),
              if (people.invites.isNotEmpty) ...[
                const SizedBox(height: 26),
                const SectionLabel('Invited, not joined yet'),
                Panel(
                  children: [
                    for (final invite in people.invites)
                      RowCard(
                        leading: const TintTile(tint: Tint.ask, letter: '…'),
                        title: 'Number ending ${invite.phoneHint.replaceAll('x', '')}',
                        subtitle: roleLabel(invite.role),
                        trailing: TextButton(
                          onPressed: () => _do(() => AppScope.of(context).cloud!.revokeInvitation(invite.id)),
                          child: const Text('Cancel'),
                        ),
                      ),
                  ],
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _InviteSheet extends StatefulWidget {
  const _InviteSheet({required this.cloud});

  final CloudSession cloud;

  @override
  State<_InviteSheet> createState() => _InviteSheetState();
}

class _InviteSheetState extends State<_InviteSheet> {
  final _phone = TextEditingController();
  String _role = 'staff';
  String _error = '';
  bool _busy = false;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final navigator = Navigator.of(context);
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await widget.cloud.invite(_phone.text.trim(), _role);
      navigator.pop(true);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Invite someone', style: text.headlineSmall),
            const SizedBox(height: 4),
            Text(
              'They sign in to MyCA with this number and choose to join. No message is sent yet, so tell them.',
              style: text.bodyMedium,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _phone,
              autofocus: true,
              keyboardType: TextInputType.phone,
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9+ ]'))],
              decoration: const InputDecoration(labelText: 'Their mobile number', prefixText: '+91  '),
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              children: [
                for (final role in _roleHelp.keys)
                  ChoiceChip(
                    label: Text(roleLabel(role)),
                    selected: _role == role,
                    selectedColor: Palette.sunken,
                    showCheckmark: false,
                    onSelected: (_) => setState(() => _role = role),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(_roleHelp[_role]!, style: text.bodyMedium),
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(_error, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
            ],
            const SizedBox(height: 18),
            FilledButton(onPressed: _busy ? null : _send, child: Text(_busy ? 'Inviting…' : 'Invite')),
          ],
        ),
      ),
    );
  }
}
