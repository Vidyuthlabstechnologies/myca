import 'dart:convert';

import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../crash_reports.dart';
import '../india/india_strings.dart';
import '../marks.dart';
import '../theme.dart';
import '../uae/uae_cloud_strings.dart';
import '../uae/uae_edition.dart';
import '../uae/uae_strings.dart';
import '../widgets.dart';
import 'invitation_cards.dart';
import 'privacy_rights_screen.dart';

String aboutLine(ServerInfo? server, [UaeStrings s = const UaeStrings(false)]) {
  final where = server == null
      ? s.aboutWhere('none', '')
      : server.isTestServer
          ? s.aboutWhere('test', server.environment)
          : server.isSandbox
              ? s.aboutWhere('sandbox', server.providerMode)
              : s.aboutWhere('live', '');
  return 'MyCA $appVersion · $where';
}

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
    final s = UaeStrings.of(context);
    final yes = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
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

  Future<void> _deleteBusiness(String name) async {
    final state = AppScope.of(context);
    final navigator = Navigator.of(context);
    final s = UaeStrings.of(context);
    final body = uaeEdition(context) ? s.deleteBusinessBody : inText(context, 'Its books, documents and members go with it. Backups are kept for fourteen days, after which it cannot be recovered.');
    if (!await _sure(s.deleteWho(name), body, s.delete)) return;
    try {
      await state.cloud!.deleteBusiness();
      await state.refresh();
      navigator.popUntil((route) => route.isFirst);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  Future<void> _download(String name) async {
    final state = AppScope.of(context);
    final s = UaeStrings.of(context);
    setState(() {
      _error = '';
      _note = '';
    });
    try {
      final data = await state.cloud!.exportBusiness();
      final file = 'myca-${name.replaceAll(RegExp(r'[^A-Za-z0-9]+'), '-').toLowerCase()}-${DateTime.now().toIso8601String().substring(0, 10)}.json';
      final saved = await state.saveTextFile(file, const JsonEncoder.withIndent('  ').convert(data));
      if (mounted) setState(() => _note = saved ? s.savedExport(file) : s.notSaved);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  Future<void> _restoreFromFile(String name) async {
    final state = AppScope.of(context);
    final s = UaeStrings.of(context);
    setState(() {
      _error = '';
      _note = '';
    });
    final picked = await state.pickTextFile(const ['json']);
    if (picked == null || !mounted) return;
    Map<String, Object?> payload;
    try {
      final decoded = jsonDecode(picked.content);
      if (decoded is! Map) throw const FormatException();
      payload = decoded.cast<String, Object?>();
    } on FormatException {
      setState(() => _error = s.notAnExport);
      return;
    }
    final invoices = ((payload['books'] ?? payload['state']) as Map?)?['invoices'];
    final count = invoices is List ? invoices.length : 0;
    if (!await _sure(s.replaceWith(name, picked.name), s.replaceBody(count), s.replace)) return;
    try {
      final out = await state.cloud!.replaceBooks(payload);
      await state.refresh();
      if (mounted) setState(() => _note = out['restored'] is Map ? s.replacedFrom(picked.name, (out['restored'] as Map)['invoices'], (out['restored'] as Map)['documents']) : s.replacedFrom(picked.name, null, null));
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  Future<void> _deleteAccount() async {
    final state = AppScope.of(context);
    final s = UaeStrings.of(context);
    if (!await _sure(s.deleteAccountTitle, s.deleteAccountBody, s.deleteAccount)) return;
    try {
      await state.cloud!.deleteAccount();
      await state.signOut();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  String _error = '';
  String _note = '';

  @override
  Widget build(BuildContext context) {
    final current = AppScope.of(context).cloud!.businessId;
    final s = UaeStrings.of(context);
    final ae = uaeEdition(context);
    return Scaffold(
      appBar: AppBar(title: Text(s.yourBusinesses)),
      body: FutureBuilder<Me>(
        future: _me,
        builder: (context, loaded) {
          final me = loaded.data;
          if (me == null) {
            return Center(
              child: loaded.hasError ? Text(s.cloudSaid('${loaded.error}'), textAlign: TextAlign.center) : const CircularProgressIndicator(),
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              if (me.invitations.isNotEmpty) ...[
                SectionLabel(s.invitations),
                InvitationCards(invitations: me.invitations, onChanged: _answered),
                const SizedBox(height: 14),
              ],
              SectionLabel(s.businesses),
              Panel(
                children: [
                  for (final business in me.businesses)
                    RowCard(
                      leading: TintTile(tint: Tint.ask, letter: business.name.isEmpty ? '?' : business.name[0].toUpperCase()),
                      title: business.name,
                      subtitle: business.demo ? s.demoRole(business.role) : s.role(business.role),
                      trailing: business.id == current ? StatusTag(text: s.openTag, color: paletteOf(context).accent) : (business.demo ? StatusTag(text: s.demoTag, color: paletteOf(context).warn) : const Chevron()),
                      onTap: business.id == current ? null : () => _open(business.id),
                    ),
                ],
              ),
              if (_error.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(s.cloudSaid(_error), style: TextStyle(color: paletteOf(context).danger, fontWeight: FontWeight.w500)),
              ],
              if (_note.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(s.cloudSaid(_note), style: Theme.of(context).textTheme.bodyMedium),
              ],
              const SizedBox(height: 26),
              SectionLabel(s.yourData),
              Panel(
                children: [
                  for (final business in me.businesses.where((b) => b.id == current && b.role == 'owner'))
                    RowCard(
                      leading: const TintTile(tint: Tint.ask, mark: Mark.spreadsheet),
                      title: s.downloadEverything(business.name),
                      subtitle: s.downloadEverythingSubtitle,
                      onTap: () => _download(business.name),
                    ),
                  for (final business in me.businesses.where((b) => b.id == current && b.role == 'owner'))
                    RowCard(
                      leading: const TintTile(tint: Tint.ask, mark: Mark.bringIn),
                      title: s.restoreFrom(business.name),
                      subtitle: s.restoreSubtitle,
                      onTap: () => _restoreFromFile(business.name),
                    ),
                ],
              ),
              const SizedBox(height: 26),
              SectionLabel(s.leaving),
              Panel(
                children: [
                  for (final business in me.businesses.where((b) => b.id == current && b.role == 'owner'))
                    RowCard(
                      leading: const TintTile(tint: Tint.urgent, mark: Mark.urgent),
                      title: s.deleteBusinessTitle(business.name),
                      subtitle: s.deleteBusinessSubtitle,
                      onTap: () => _deleteBusiness(business.name),
                    ),
                  RowCard(
                    leading: const TintTile(tint: Tint.urgent, mark: Mark.urgent),
                    title: s.deleteMyAccount,
                    subtitle: s.deleteMyAccountSubtitle,
                    onTap: _deleteAccount,
                  ),
                ],
              ),
              const SizedBox(height: 26),
              SectionLabel(s.privacyAndLegal),
              Panel(
                children: [
                  RowCard(
                    key: const Key('legal.rights'),
                    leading: const TintTile(tint: Tint.ask, mark: Mark.confirm),
                    title: s.yourPrivacyRights,
                    subtitle: ae ? s.privacyRightsSubtitle : inText(context, 'Privacy notice, terms, Grievance Officer, and requests to see, correct or erase your data'),
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PrivacyRightsScreen())),
                  ),
                ],
              ),
              const SizedBox(height: 26),
              SectionLabel(s.aboutThisApp),
              Text(
                aboutLine(AppScope.of(context).server, s),
                key: const Key('about.version'),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: paletteOf(context).muted),
              ),
            ],
          );
        },
      ),
    );
  }
}
