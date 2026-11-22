import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../format.dart';
import '../marks.dart';
import '../theme.dart';
import '../uae/uae_cloud_strings.dart';
import '../uae/uae_edition.dart';
import '../uae/uae_strings.dart';
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
    final s = UaeStrings.of(context);
    final yes = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        contentTextStyle: _dialogText(dialog),
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialog).pop(false), child: Text(s.keep)),
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
        _error = UaeStrings.of(context).unlockToContinue;
      });
    }
    return false;
  }

  Future<bool> _allowSignOut() async {
    final s = UaeStrings.of(context);
    if (!await _sure(s.signOutDevice, s.signOutDeviceBody, s.signOut)) return false;
    if (!mounted) return false;
    return _stepUp(s.signOutDeviceReason);
  }

  Future<void> _turnOn() async {
    final navigator = Navigator.of(context);
    await navigator.push(MaterialPageRoute<void>(builder: (_) => const TwoStepSetupScreen()));
    if (mounted) _reload();
  }

  Future<void> _turnOff() async {
    final cloud = AppScope.of(context).cloud!;
    final s = UaeStrings.of(context);
    final code = await _askCode(s.turnOffTwoStep, s.turnOff);
    if (code == null) return;
    await _do(() async {
      await cloud.disableSecondStep(code);
      return s.twoStepIsOff;
    });
  }

  Future<void> _newCodes() async {
    final cloud = AppScope.of(context).cloud!;
    final navigator = Navigator.of(context);
    final s = UaeStrings.of(context);
    final code = await _askCode(s.makeNewCodes, s.makeNew);
    if (code == null) return;
    await _do(() async {
      final codes = await cloud.newRecoveryCodes(code);
      await navigator.push(MaterialPageRoute<void>(builder: (_) => RecoveryCodesScreen(codes)));
      return '';
    });
  }

  Future<void> _signOutDevice(SignedInDevice device) async {
    final cloud = AppScope.of(context).cloud!;
    final s = UaeStrings.of(context);
    if (!await _allowSignOut()) return;
    await _do(() async {
      await cloud.signOutDevice(device.id);
      return s.signedOut;
    });
  }

  Future<void> _signOutOthers() async {
    final cloud = AppScope.of(context).cloud!;
    final s = UaeStrings.of(context);
    if (!await _allowSignOut()) return;
    await _do(() async {
      final revoked = await cloud.signOutOtherDevices();
      return s.signedOutDevices(revoked);
    });
  }

  String _day(String stamp) {
    if (!uaeEdition(context)) return stamp.length == 10 ? longDate(stamp) : sharedOn(stamp);
    final s = UaeStrings.of(context);
    return stamp.length == 10 ? s.longDate(stamp) : s.gulfTime(stamp);
  }

  String _when(SignedInDevice device) {
    final s = UaeStrings.of(context);
    final signedIn = _day(device.signedInOn);
    final active = _day(device.lastActive);
    return [
      if (signedIn.isNotEmpty) s.signedInWhen(signedIn),
      if (active.isNotEmpty) s.lastActiveWhen(active),
    ].join(' · ');
  }

  Widget _loading(AsyncSnapshot<Object?> loaded) => loaded.hasError
      ? Text(UaeStrings.of(context).cloudSaid('${loaded.error}'), style: TextStyle(color: paletteOf(context).danger, fontWeight: FontWeight.w500))
      : const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final s = UaeStrings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s.security)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          SectionLabel(s.twoStep),
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
                    title: s.twoStep,
                    subtitle: status.enabled ? s.twoStepOn(left) : s.twoStepOff,
                    trailing: TextButton(
                      onPressed: _busy ? null : (status.enabled ? _turnOff : _turnOn),
                      child: Text(status.enabled ? s.turnOff : s.turnOn),
                    ),
                  ),
                  if (status.enabled)
                    RowCard(
                      leading: const TintTile(tint: Tint.ask, mark: Mark.paper),
                      title: s.newRecoveryCodes,
                      subtitle: s.replacesCodes,
                      trailing: TextButton(onPressed: _busy ? null : _newCodes, child: Text(s.makeNew)),
                    ),
                ],
              );
            },
          ),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(s.cloudSaid(_error), style: TextStyle(color: paletteOf(context).danger, fontWeight: FontWeight.w500)),
          ],
          if (_note.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(s.cloudSaid(_note), style: text.bodyMedium),
          ],
          const SizedBox(height: 26),
          SectionLabel(s.whereSignedIn),
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
                          title: s.deviceLabel(device.label),
                          subtitle: _when(device),
                          trailing: device.current
                              ? StatusTag(text: s.thisPhone, color: paletteOf(context).accent)
                              : TextButton(onPressed: _busy ? null : () => _signOutDevice(device), child: Text(s.signOut)),
                        ),
                    ],
                  ),
                  if (devices.length > 1) ...[
                    const SizedBox(height: 12),
                    OutlinedButton(onPressed: _busy ? null : _signOutOthers, child: Text(s.signOutOthers)),
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

TextStyle? _dialogText(BuildContext context) => Theme.of(context).textTheme.bodyMedium?.copyWith(color: paletteOf(context).ink);

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
    final s = UaeStrings.of(context);
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
          labelText: s.code,
          helperText: s.codeHelper,
          helperMaxLines: 3,
          helperStyle: Theme.of(context).textTheme.bodySmall?.copyWith(color: paletteOf(context).ink),
          counterText: '',
        ),
        onChanged: (_) => setState(() {}),
        onSubmitted: (_) => _done(),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text(s.cancel)),
        FilledButton(onPressed: _code.text.trim().isEmpty ? null : _done, child: Text(widget.action)),
      ],
    );
  }
}
