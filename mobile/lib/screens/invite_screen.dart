import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../growth.dart';
import '../theme.dart';
import '../widgets.dart';

class InviteScreen extends StatefulWidget {
  const InviteScreen({super.key});

  @override
  State<InviteScreen> createState() => _InviteScreenState();
}

class _InviteScreenState extends State<InviteScreen> {
  Future<ReferralInfo>? _info;
  final _code = TextEditingController();
  String _claimNote = '';
  bool _claimed = false;
  bool _claiming = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _info ??= AppScope.of(context).cloud!.referral();
  }

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _share(ReferralInfo info) async {
    final state = AppScope.of(context);
    final shared = await state.shareText(info.shareText(us: state.edition == 'US'));
    if (shared) state.reachSteps(['referral_shared']);
  }

  Future<void> _copy(ReferralInfo info) async {
    await Clipboard.setData(ClipboardData(text: info.code));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Code copied')));
  }

  Future<void> _claim() async {
    final cloud = AppScope.of(context).cloud!;
    setState(() {
      _claiming = true;
      _claimNote = '';
    });
    try {
      final problem = await cloud.claimReferral(_code.text);
      if (!mounted) return;
      setState(() {
        _claimed = problem == null;
        _claimNote = problem ?? 'Thank you. The person who invited you will see that you joined.';
      });
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _claimNote = err.message);
    } finally {
      if (mounted) setState(() => _claiming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final us = AppScope.of(context).edition == 'US';
    return Scaffold(
      appBar: AppBar(title: const Text('Invite')),
      body: FutureBuilder<ReferralInfo>(
        future: _info,
        builder: (context, loaded) {
          final info = loaded.data;
          if (info == null) {
            return Center(child: loaded.hasError ? Text('${loaded.error}', textAlign: TextAlign.center) : const CircularProgressIndicator());
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
            children: [
              Text(us ? 'Know someone who dreads tax season?' : 'Know a business owner who still keeps books by hand?', style: text.titleMedium),
              const SizedBox(height: 6),
              Text('Send them your code. When they join with it, you see it here.', style: text.bodyMedium),
              const SizedBox(height: 16),
              Panel(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 16, 14, 8),
                    child: Row(
                      children: [
                        Expanded(child: SelectableText(info.code, key: const Key('invite-code'), style: text.headlineSmall?.copyWith(letterSpacing: 3, fontWeight: FontWeight.w600))),
                        TextButton(onPressed: () => _copy(info), child: const Text('Copy')),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                    child: Text('${info.invited} joined with your code, ${info.converted} of them on a paid plan.', key: const Key('invite-counts'), style: text.bodyMedium),
                  ),
                ],
              ),
              if (info.firmLine != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(info.firmLine!, key: const Key('invite-firm-credits'), style: text.bodyMedium),
                ),
              const SizedBox(height: 12),
              FilledButton.icon(onPressed: () => _share(info), icon: const Icon(Icons.share_outlined, size: 18), label: const Text('Share your invite')),
              const SizedBox(height: 28),
              const SectionLabel('Were you invited?'),
              const SizedBox(height: 6),
              TextField(
                key: const Key('claim-code'),
                controller: _code,
                enabled: !_claimed,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(labelText: 'Invite code', hintText: '8 letters and numbers'),
              ),
              const SizedBox(height: 10),
              OutlinedButton(onPressed: _claimed || _claiming ? null : _claim, child: const Text('Use this code')),
              if (_claimNote.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(_claimNote, key: const Key('claim-note'), style: TextStyle(color: _claimed ? Palette.ink : Palette.danger, fontWeight: FontWeight.w500)),
                ),
            ],
          );
        },
      ),
    );
  }
}
