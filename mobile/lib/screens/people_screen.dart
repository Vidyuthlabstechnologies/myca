import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../cloud/cloud_session.dart';
import '../theme.dart';
import '../widgets.dart';
import '../uae/uae_cloud_strings.dart';
import '../uae/uae_edition.dart';
import '../uae/uae_strings.dart';
import '../us/us_share_consent.dart';

const _roleHelp = {
  'staff': 'Records sales, bills, payments and expenses.',
  'accountant': 'Works in the books like staff. For your CA or bookkeeper.',
};

String _roleWords(BuildContext context, String role) => uaeEdition(context)
    ? UaeStrings.of(context).roleHelp(role)
    : AppScope.of(context).edition == 'US' && AppScope.of(context).household
    ? switch (role) {
        'staff' => 'Sees the return and can add forms and answers. Only you sign and file.',
        'accountant' => 'For a tax professional helping you. Sees and edits the return; only you sign and file.',
        _ => 'Can do everything, including deleting the return and inviting others.',
      }
    : switch (role) {
        'staff' => inText(context, 'Records sales, bills, payments and expenses.'),
        'accountant' => inText(context, 'Works in the books like staff. For your CA or bookkeeper.'),
        _ => inText(context, 'Can do everything, including deleting the business and inviting others.'),
      };

const caSyncChoices = [
  ('live', 'As things happen', 'Your accountant sees every entry at once.'),
  ('daily', 'Once a day', 'The books as they stood at midnight.'),
  ('weekly', 'Once a week', 'The books as they stood at midnight on Monday.'),
  ('month_close', 'At month end', 'The books as they stood when the month closed.'),
  ('manual', 'Only when I share', 'The books as they were when you last pressed Share now.'),
];

String _syncTitle(BuildContext context, String mode, String english) => switch (mode) {
  'live' => inText(context, 'As things happen'),
  'daily' => inText(context, 'Once a day'),
  'weekly' => inText(context, 'Once a week'),
  'month_close' => inText(context, 'At month end'),
  'manual' => inText(context, 'Only when I share'),
  _ => english,
};

String _syncHelp(BuildContext context, String mode, String english) => switch (mode) {
  'live' => inText(context, 'Your accountant sees every entry at once.'),
  'daily' => inText(context, 'The books as they stood at midnight.'),
  'weekly' => inText(context, 'The books as they stood at midnight on Monday.'),
  'month_close' => inText(context, 'The books as they stood when the month closed.'),
  'manual' => inText(context, 'The books as they were when you last pressed Share now.'),
  _ => english,
};

String _roleName(BuildContext context, String role) => UaeStrings.of(context).ar
    ? UaeStrings.of(context).role(role)
    : switch (role) {
        'owner' => inText(context, 'Owner'),
        'staff' => inText(context, 'Staff'),
        'accountant' => inText(context, 'Accountant'),
        _ => role,
      };

String _isRole(BuildContext context, String name, String role) => UaeStrings.of(context).ar
    ? UaeStrings.of(context).isRole(name, role)
    : switch (role) {
        'owner' => inFormat(context, '{name} is owner', {'name': name}),
        'staff' => inFormat(context, '{name} is staff', {'name': name}),
        'accountant' => inFormat(context, '{name} is accountant', {'name': name}),
        _ => '$name is $role',
      };

String sharedWhen(String iso) {
  final parsed = DateTime.tryParse(iso);
  final at = parsed == null ? null : businessTime(parsed);
  if (at == null) return '';
  final minutes = at.minute.toString().padLeft(2, '0');
  final hour = at.hour % 12 == 0 ? 12 : at.hour % 12;
  return '${longDate(isoDate(at))}, $hour:$minutes ${at.hour < 12 ? 'am' : 'pm'}';
}

class PeopleScreen extends StatefulWidget {
  const PeopleScreen({super.key});

  @override
  State<PeopleScreen> createState() => _PeopleScreenState();
}

class _PeopleScreenState extends State<PeopleScreen> {
  Future<People>? _people;
  Future<CaSync>? _sync;
  String _error = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _people ??= AppScope.of(context).cloud!.people();
    _sync ??= AppScope.of(context).cloud!.caSync();
  }

  Future<void> _setSync(String mode) async {
    final cloud = AppScope.of(context).cloud!;
    final next = cloud.setCaSync(mode);
    setState(() {
      _error = '';
      _sync = next;
    });
    try {
      await next;
    } on MycaApiException catch (err) {
      if (mounted) {
        setState(() {
          _error = err.message;
          _sync = cloud.caSync();
        });
      }
    }
  }

  Future<void> _shareNow() async {
    final cloud = AppScope.of(context).cloud!;
    setState(() => _error = '');
    try {
      await cloud.shareWithCa();
      if (!mounted) return;
      setState(() {
        _sync = cloud.caSync();
      });
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  Widget _syncPanel(CaSync sync) {
    final text = Theme.of(context).textTheme;
    final ae = uaeEdition(context);
    final s = UaeStrings.of(context);
    return Panel(
      children: [
        for (final (mode, title, help) in caSyncChoices)
          RowCard(
            leading: ChoiceDot(selected: sync.mode == mode),
            title: ae ? s.syncTitle(mode) : _syncTitle(context, mode, title),
            subtitle: ae ? s.syncHelp(mode) : _syncHelp(context, mode, help),
            onTap: sync.mode == mode ? null : () => _setSync(mode),
          ),
        if (sync.mode != 'live')
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    sync.sharedAsOf.isEmpty
                        ? (s.ar ? s.notSharedYet : inText(context, 'Not shared yet.'))
                        : s.ar
                        ? s.accountantSeesAsOf(s.gulfTime(sync.sharedAsOf, withTime: true))
                        : inFormat(context, 'Your accountant sees the books as of {when}.', {'when': ae ? s.gulfTime(sync.sharedAsOf, withTime: true) : sharedWhen(sync.sharedAsOf)}),
                    style: text.bodyMedium,
                  ),
                ),
                Flexible(child: TextButton(onPressed: _shareNow, child: Text(s.ar ? s.shareNow : inText(context, 'Share now')))),
              ],
            ),
          ),
      ],
    );
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
    final s = UaeStrings.of(context);
    final answer = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialog).pop(false), child: Text(s.cancel)),
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
    final s = UaeStrings.of(context);
    final name = member.name.isEmpty ? (s.ar ? s.thisPerson : inText(context, 'this person')) : member.name;
    final sure = s.ar
        ? _sure(s.removeWho(name), s.removeBody, s.removePerson)
        : _sure(
            inFormat(context, 'Remove {name}?', {'name': name}),
            inText(context, 'They lose access to these books at once. What they recorded stays.'),
            inText(context, 'Remove'),
          );
    if (!await sure) return;
    await _do(() => cloud.removeMember(member.id));
  }

  Future<void> _changeRole(MemberRef member) async {
    final cloud = AppScope.of(context).cloud!;
    final s = UaeStrings.of(context);
    final chosen = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => SafeArea(
        child: SingleChildScrollView(
          child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 6),
              child: Text(
                _isRole(sheet, member.name.isEmpty ? (s.ar ? s.thisPersonTitle : inText(sheet, 'This person')) : member.name, member.role),
                style: Theme.of(sheet).textTheme.titleMedium,
              ),
            ),
            for (final role in const ['owner', 'staff', 'accountant'])
              ListTile(
                title: Text(_roleName(sheet, role)),
                subtitle: Text(_roleWords(context, role)),
                trailing: role == member.role ? const Icon(Icons.check) : null,
                onTap: () => Navigator.of(sheet).pop(role),
              ),
          ],
          ),
        ),
      ),
    );
    if (chosen == null || chosen == member.role || !mounted) return;
    await _do(() => cloud.changeRole(member.id, chosen));
  }

  Future<void> _leave(String myId) async {
    final state = AppScope.of(context);
    final navigator = Navigator.of(context);
    final s = UaeStrings.of(context);
    final sure = s.ar
        ? _sure(s.leaveBusiness, s.leaveBody, s.leave)
        : _sure(inText(context, 'Leave this business?'), inText(context, 'You lose access to these books at once.'), inText(context, 'Leave'));
    if (!await sure) return;
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
    final s = UaeStrings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s.people)),
      floatingActionButton: owner
          ? FloatingActionButton.extended(
              onPressed: _invite,
              icon: const Icon(Icons.add, size: 20),
              label: Text(s.ar ? s.inviteSomeone : inText(context, 'Invite someone')),
            )
          : null,
      body: FutureBuilder<People>(
        future: _people,
        builder: (context, loaded) {
          final people = loaded.data;
          if (people == null) {
            return Center(
              child: loaded.hasError ? Text(s.cloudSaid('${loaded.error}'), textAlign: TextAlign.center) : const CircularProgressIndicator(),
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 110),
            children: [
              if (_error.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(s.cloudSaid(_error), style: TextStyle(color: paletteOf(context).danger, fontWeight: FontWeight.w500)),
                ),
              SectionLabel(s.ar ? s.inThisBusiness : inText(context, 'In this business')),
              Panel(
                children: [
                  for (final member in people.members)
                    RowCard(
                      leading: TintTile(tint: Tint.ask, letter: member.name.isEmpty ? '?' : member.name[0].toUpperCase()),
                      title: member.id == me?.userId
                          ? (s.ar
                                ? s.you(member.name)
                                : member.name.isEmpty
                                ? inText(context, 'You (you)')
                                : inFormat(context, '{name} (you)', {'name': member.name}))
                          : (member.name.isEmpty ? (s.ar ? s.noNameYet : inText(context, 'No name yet')) : member.name),
                      subtitle: _roleName(context, member.role),
                      onTap: owner && member.id != me?.userId ? () => _changeRole(member) : null,
                      trailing: member.id == me?.userId
                          ? (owner ? null : TextButton(onPressed: () => _leave(member.id), child: Text(s.ar ? s.leave : inText(context, 'Leave'))))
                          : (owner && member.role != 'owner'
                              ? TextButton(onPressed: () => _remove(member), child: Text(s.ar ? s.removePerson : inText(context, 'Remove')))
                              : null),
                    ),
                ],
              ),
              if (owner) ...[
                const SizedBox(height: 26),
                SectionLabel(s.ar ? s.whatAccountantSees : inText(context, 'What your accountant sees')),
                FutureBuilder<CaSync>(
                  future: _sync,
                  builder: (context, sync) => sync.data == null
                      ? const SizedBox(height: 48, child: Center(child: CircularProgressIndicator()))
                      : _syncPanel(sync.data!),
                ),
              ],
              if (people.invites.isNotEmpty) ...[
                const SizedBox(height: 26),
                SectionLabel(s.ar ? s.invitedNotJoined : inText(context, 'Invited, not joined yet')),
                Panel(
                  children: [
                    for (final invite in people.invites)
                      RowCard(
                        leading: const TintTile(tint: Tint.ask, letter: '…'),
                        title: s.ar ? s.numberEnding(invite.phoneHint.replaceAll('x', '')) : inFormat(context, 'Number ending {digits}', {'digits': invite.phoneHint.replaceAll('x', '')}),
                        subtitle: _roleName(context, invite.role),
                        trailing: TextButton(
                          onPressed: () => _do(() => AppScope.of(context).cloud!.revokeInvitation(invite.id)),
                          child: Text(s.cancel),
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
  final _name = TextEditingController();
  String _role = 'staff';
  String _relationship = 'spouse';
  String _error = '';
  bool _busy = false;

  @override
  void dispose() {
    _phone.dispose();
    _name.dispose();
    super.dispose();
  }

  bool get _usReturn => AppScope.of(context).edition == 'US' && AppScope.of(context).household;

  Future<void> _sendUs(NavigatorState navigator) async {
    final phone = _phone.text.trim();
    final name = _name.text.trim();
    if (name.isEmpty) return setState(() => _error = 'Type their name.');
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      if (_relationship == 'spouse') {
        await widget.cloud.invite(phone, _role, relationship: 'spouse', recipientName: name);
        navigator.pop(true);
        return;
      }
      final form = await widget.cloud.usShareConsent(phone, name);
      if (form['signed'] == true) {
        await widget.cloud.invite(phone, _role, relationship: 'other', recipientName: name);
        navigator.pop(true);
        return;
      }
      if (!mounted) return;
      final signedName = await showUsShareConsent(context, '${form['text'] ?? ''}');
      if (signedName == null) {
        if (mounted) setState(() => _error = 'Not invited. Their invitation needs your signed consent.');
        return;
      }
      await widget.cloud.invite(phone, _role, relationship: 'other', recipientName: name, consent: {'recipientName': name, 'signedName': signedName, 'version': form['version']});
      navigator.pop(true);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _send() async {
    final navigator = Navigator.of(context);
    final s = UaeStrings.of(context);
    if (_usReturn) return _sendUs(navigator);
    var phone = _phone.text.trim();
    if (uaeEdition(context)) {
      final number = uaeMobileNumber(phone);
      if (number == null) return setState(() => _error = s.enterUaeMobile);
      phone = number;
    }
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await widget.cloud.invite(phone, _role);
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
    final s = UaeStrings.of(context);
    final ae = uaeEdition(context);
    final us = _usReturn;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(s.ar ? s.inviteSomeone : inText(context, 'Invite someone'), style: text.headlineSmall),
            const SizedBox(height: 4),
            Text(
              s.ar ? s.inviteSheetNote : inText(context, 'They sign in to MyCA with this number and choose to join. No message is sent yet, so tell them.'),
              style: text.bodyMedium,
            ),
            const SizedBox(height: 16),
            if (us) ...[
              TextField(key: const Key('invite.name'), controller: _name, autofocus: true, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Their name')),
              const SizedBox(height: 12),
            ],
            TextField(
              key: const Key('invite.phone'),
              controller: _phone,
              autofocus: !us,
              keyboardType: TextInputType.phone,
              inputFormatters: [FilteringTextInputFormatter.allow(us ? RegExp(r'[0-9+() -]') : RegExp(r'[0-9+ ]'))],
              decoration: InputDecoration(labelText: s.ar ? s.theirMobile : inText(context, 'Their mobile number'), prefixText: ae ? s.uaePrefix : us ? '+1  ' : '+91  '),
            ),
            if (us) ...[
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                children: [
                  for (final (value, label) in const [('spouse', 'My spouse on a joint return'), ('other', 'Someone else')])
                    ChoiceChip(
                      key: Key('invite.relationship.$value'),
                      label: Text(label),
                      selected: _relationship == value,
                      selectedColor: paletteOf(context).sunken,
                      showCheckmark: false,
                      onSelected: (_) => setState(() => _relationship = value),
                    ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                _relationship == 'spouse'
                    ? 'Your spouse is on the same return, so no extra consent is needed.'
                    : 'Federal law needs your signed consent before anyone else, such as a tax professional or a relative, sees your return. You read and sign it next.',
                style: text.bodyMedium,
              ),
            ],
            const SizedBox(height: 14),
            Wrap(
              spacing: 8,
              children: [
                for (final role in _roleHelp.keys)
                  ChoiceChip(
                    label: Text(_roleName(context, role)),
                    selected: _role == role,
                    selectedColor: paletteOf(context).sunken,
                    showCheckmark: false,
                    onSelected: (_) => setState(() => _role = role),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(_roleWords(context, _role), style: text.bodyMedium),
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(s.cloudSaid(_error), style: TextStyle(color: paletteOf(context).danger, fontWeight: FontWeight.w500)),
            ],
            const SizedBox(height: 18),
            FilledButton(
              onPressed: _busy ? null : _send,
              child: Text(
                s.ar
                    ? (_busy ? s.inviting : s.invite)
                    : _busy
                    ? inText(context, 'Inviting…')
                    : inText(context, 'Invite'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
