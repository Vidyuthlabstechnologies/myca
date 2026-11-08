import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../format.dart';
import '../marks.dart';
import '../theme.dart';
import '../widgets.dart';
import 'recovery_codes_screen.dart';
import 'two_step_setup_screen.dart';

class SecurityScreen extends StatefulWidget {
  const SecurityScreen({super.key});

  @override
  State<SecurityScreen> createState() => _SecurityScreenState();
}

class _SecurityScreenState extends State<SecurityScreen> {
  Future<SecondStepStatus>? _status;
  Future<List<SignedInDevice>>? _devices;
  String _error = '';
  String _note = '';
  bool _busy = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final cloud = AppScope.of(context).cloud!;
    _status ??= cloud.secondStepStatus();
    _devices ??= cloud.devices();
  }

  void _reload() {
    final cloud = AppScope.of(context).cloud!;
    setState(() {
      _status = cloud.secondStepStatus();
      _devices = cloud.devices();
    });
  }

  Future<void> _do(Future<String> Function() action) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = '';
      _note = '';
    });
    var reload = true;
    try {
      final note = await action();
      if (mounted) setState(() => _note = note);
    } on SignedOutException catch (err) {
      reload = false;
      if (mounted) setState(() => _error = err.message);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
    if (mounted && reload) _reload();
  }

  Future<bool> _sure(String title, String body, String action) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        contentTextStyle: _dialogText(dialog),
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

  Future<String?> _askCode(String title, String action) => showDialog<String>(
        context: context,
        builder: (dialog) => _CodeDialog(title: title, action: action),
      );

  Future<bool> _stepUp(String reason) async {
    final state = AppScope.of(context);
    if (!state.lockAvailable) return true;
    if (await state.lock.unlock(reason)) return true;
    if (mounted) {
      setState(() {
        _note = '';
        _error = 'Unlock to continue.';
      });
    }
    return false;
  }

  Future<bool> _allowSignOut() async {
    if (!await _sure('Sign out that device?', 'It stops working at once. Anyone holding it has to sign in again.', 'Sign out')) return false;
    if (!mounted) return false;
    return _stepUp('Sign out that device');
  }

  Future<void> _turnOn() async {
    final navigator = Navigator.of(context);
    await navigator.push(MaterialPageRoute<void>(builder: (_) => const TwoStepSetupScreen()));
    if (mounted) _reload();
  }

  Future<void> _turnOff() async {
    final cloud = AppScope.of(context).cloud!;
    final code = await _askCode('Turn off two-step sign-in?', 'Turn off');
    if (code == null) return;
    await _do(() async {
      await cloud.disableSecondStep(code);
      return 'Two-step sign-in is off.';
    });
  }

  Future<void> _newCodes() async {
    final cloud = AppScope.of(context).cloud!;
    final navigator = Navigator.of(context);
    final code = await _askCode('Make new recovery codes?', 'Make new');
    if (code == null) return;
    await _do(() async {
      final codes = await cloud.newRecoveryCodes(code);
      await navigator.push(MaterialPageRoute<void>(builder: (_) => RecoveryCodesScreen(codes)));
      return '';
    });
  }

  Future<void> _signOutDevice(SignedInDevice device) async {
    final cloud = AppScope.of(context).cloud!;
    if (!await _allowSignOut()) return;
    await _do(() async {
      await cloud.signOutDevice(device.id);
      return 'Signed out.';
    });
  }

  Future<void> _signOutOthers() async {
    final cloud = AppScope.of(context).cloud!;
    if (!await _allowSignOut()) return;
    await _do(() async {
      final revoked = await cloud.signOutOtherDevices();
      return 'Signed out $revoked ${revoked == 1 ? 'device' : 'devices'}.';
    });
  }

  String _day(String stamp) => stamp.length == 10 ? longDate(stamp) : sharedOn(stamp);

  String _when(SignedInDevice device) {
    final signedIn = _day(device.signedInOn);
    final active = _day(device.lastActive);
    return [
      if (signedIn.isNotEmpty) 'Signed in $signedIn',
      if (active.isNotEmpty) 'last active $active',
    ].join(' · ');
  }

  Widget _loading(AsyncSnapshot<Object?> loaded) => loaded.hasError
      ? Text('${loaded.error}', style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w500))
      : const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Security')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          const SectionLabel('Two-step sign-in'),
          FutureBuilder<SecondStepStatus>(
            future: _status,
            builder: (context, loaded) {
              final status = loaded.data;
              if (status == null) return _loading(loaded);
              final left = status.recoveryCodesLeft;
              return Panel(
                children: [
                  RowCard(
                    leading: const TintTile(tint: Tint.ask, mark: Mark.confirm),
                    title: 'Two-step sign-in',
                    subtitle: status.enabled
                        ? 'On · $left recovery ${left == 1 ? 'code' : 'codes'} left'
                        : 'Off · ask for an authenticator code at every sign-in',
                    trailing: TextButton(
                      onPressed: _busy ? null : (status.enabled ? _turnOff : _turnOn),
                      child: Text(status.enabled ? 'Turn off' : 'Turn on'),
                    ),
                  ),
                  if (status.enabled)
                    RowCard(
                      leading: const TintTile(tint: Tint.ask, mark: Mark.paper),
                      title: 'New recovery codes',
                      subtitle: 'Replaces the ones you have',
                      trailing: TextButton(onPressed: _busy ? null : _newCodes, child: const Text('Make new')),
                    ),
                ],
              );
            },
          ),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(_error, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
          ],
          if (_note.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(_note, style: text.bodyMedium),
          ],
          const SizedBox(height: 26),
          const SectionLabel('Where you are signed in'),
          FutureBuilder<List<SignedInDevice>>(
            future: _devices,
            builder: (context, loaded) {
              final devices = loaded.data;
              if (devices == null) return _loading(loaded);
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Panel(
                    children: [
                      for (final device in devices)
                        RowCard(
                          key: ValueKey('device.${device.id}'),
                          leading: const TintTile(tint: Tint.ask, mark: Mark.people),
                          title: device.label,
                          subtitle: _when(device),
                          trailing: device.current
                              ? const StatusTag(text: 'This phone', color: Palette.accent)
                              : TextButton(onPressed: _busy ? null : () => _signOutDevice(device), child: const Text('Sign out')),
                        ),
                    ],
                  ),
                  if (devices.length > 1) ...[
                    const SizedBox(height: 12),
                    OutlinedButton(onPressed: _busy ? null : _signOutOthers, child: const Text('Sign out other devices')),
                  ],
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

TextStyle? _dialogText(BuildContext context) => Theme.of(context).textTheme.bodyMedium?.copyWith(color: Palette.ink);

class _CodeDialog extends StatefulWidget {
  const _CodeDialog({required this.title, required this.action});

  final String title;
  final String action;

  @override
  State<_CodeDialog> createState() => _CodeDialogState();
}

class _CodeDialogState extends State<_CodeDialog> {
  final _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  void _done() {
    final code = _code.text.trim();
    if (code.isNotEmpty) Navigator.of(context).pop(code);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      scrollable: true,
      contentTextStyle: _dialogText(context),
      title: Text(widget.title),
      content: TextField(
        controller: _code,
        autofocus: true,
        autocorrect: false,
        enableSuggestions: false,
        maxLength: 11,
        decoration: InputDecoration(
          labelText: 'Code',
          helperText: 'Code from your authenticator app or a recovery code',
          helperMaxLines: 3,
          helperStyle: Theme.of(context).textTheme.bodySmall?.copyWith(color: Palette.ink),
          counterText: '',
        ),
        onChanged: (_) => setState(() {}),
        onSubmitted: (_) => _done(),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        FilledButton(onPressed: _code.text.trim().isEmpty ? null : _done, child: Text(widget.action)),
      ],
    );
  }
}
