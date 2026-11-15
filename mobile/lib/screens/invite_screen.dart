import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../growth.dart';
import '../theme.dart';
import '../uae/uae_cloud_strings.dart';
import '../uae/uae_edition.dart';
import '../uae/uae_strings.dart';
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
    final shared = await state.shareText(uaeEdition(context) ? UaeStrings.of(context).shareInvite(info.link, info.code) : info.shareText(us: state.edition == 'US', uk: state.edition == 'GB'));
    if (shared) state.reachSteps(['referral_shared']);
  }

  Future<void> _copy(ReferralInfo info) async {
    await Clipboard.setData(ClipboardData(text: info.code));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(UaeStrings.of(context).codeCopied)));
  }

  Future<void> _claim() async {
    final cloud = AppScope.of(context).cloud!;
    final s = UaeStrings.of(context);
    setState(() {
      _claiming = true;
      _claimNote = '';
    });
    try {
      final problem = await cloud.claimReferral(_code.text);
      if (!mounted) return;
      setState(() {
        _claimed = problem == null;
        _claimNote = problem ?? s.claimThanks;
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
    final ae = uaeEdition(context);
    final s = UaeStrings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s.inviteTitle)),
      body: FutureBuilder<ReferralInfo>(
        future: _info,
        builder: (context, loaded) {
          final info = loaded.data;
          if (info == null) {
            return Center(child: loaded.hasError ? Text(s.cloudSaid('${loaded.error}'), textAlign: TextAlign.center) : const CircularProgressIndicator());
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
            children: [
              Text(us ? 'Know someone who dreads tax season?' : s.knowAnOwner, style: text.titleMedium),
              const SizedBox(height: 6),
              Text(s.sendYourCode, style: text.bodyMedium),
              const SizedBox(height: 16),
              Panel(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 16, 14, 8),
                    child: Row(
                      children: [
                        Expanded(child: SelectableText(info.code, key: const Key('invite-code'), style: text.headlineSmall?.copyWith(letterSpacing: 3, fontWeight: FontWeight.w600))),
                        TextButton(onPressed: () => _copy(info), child: Text(s.copy)),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                    child: Text(s.joinedWithCode(info.invited, info.converted), key: const Key('invite-counts'), style: text.bodyMedium),
                  ),
                ],
              ),
              if (info.firmLine != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(ae && s.ar ? s.firmCredits(info.creditsEarned) : info.firmLine!, key: const Key('invite-firm-credits'), style: text.bodyMedium),
                ),
              const SizedBox(height: 12),
              FilledButton.icon(onPressed: () => _share(info), icon: const Icon(Icons.share_outlined, size: 18), label: Text(s.shareYourInvite)),
              const SizedBox(height: 28),
              SectionLabel(s.wereYouInvited),
              const SizedBox(height: 6),
              TextField(
                key: const Key('claim-code'),
                controller: _code,
                enabled: !_claimed,
                textCapitalization: TextCapitalization.characters,
                decoration: InputDecoration(labelText: s.inviteCode, hintText: s.inviteCodeHint),
              ),
              const SizedBox(height: 10),
              OutlinedButton(onPressed: _claimed || _claiming ? null : _claim, child: Text(s.useThisCode)),
              if (_claimNote.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: Text(s.cloudSaid(_claimNote), key: const Key('claim-note'), style: TextStyle(color: _claimed ? paletteOf(context).ink : paletteOf(context).danger, fontWeight: FontWeight.w500)),
                ),
            ],
          );
        },
      ),
    );
  }
}
