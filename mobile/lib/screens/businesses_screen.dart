import 'dart:convert';

import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../crash_reports.dart';
import '../marks.dart';
import '../theme.dart';
import '../widgets.dart';
import 'invitation_cards.dart';
import 'privacy_rights_screen.dart';

String aboutLine(ServerInfo? server) {
  final where = server == null
      ? 'server not reached'
      : server.isTestServer
          ? 'test environment (${server.environment})'
          : server.isSandbox
              ? 'sandbox mode (${server.providerMode})'
              : 'live service';
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

  Future<void> _download(String name) async {
    final state = AppScope.of(context);
    setState(() {
      _error = '';
      _note = '';
    });
    try {
      final data = await state.cloud!.exportBusiness();
      final file = 'myca-${name.replaceAll(RegExp(r'[^A-Za-z0-9]+'), '-').toLowerCase()}-${DateTime.now().toIso8601String().substring(0, 10)}.json';
      final saved = await state.saveTextFile(file, const JsonEncoder.withIndent('  ').convert(data));
      if (mounted) setState(() => _note = saved ? 'Saved $file: your books, every uploaded file, members, connections and the audit trail.' : 'Not saved.');
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  Future<void> _restoreFromFile(String name) async {
    final state = AppScope.of(context);
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
      setState(() => _error = 'That file is not a MyCA export or backup.');
      return;
    }
    final invoices = ((payload['books'] ?? payload['state']) as Map?)?['invoices'];
    final count = invoices is List ? invoices.length : 0;
    if (!await _sure('Replace $name with ${picked.name}?', 'The books on MyCA become the ones in this file (${count == 1 ? '1 invoice' : '$count invoices'}). What is on MyCA now is kept in the audit trail and the fourteen-day backups, but the screens will show the file.', 'Replace')) return;
    try {
      final out = await state.cloud!.replaceBooks(payload);
      await state.refresh();
      if (mounted) setState(() => _note = 'Replaced from ${picked.name}: ${out['restored'] is Map ? '${(out['restored'] as Map)['invoices']} invoices, ${(out['restored'] as Map)['documents']} documents' : 'done'}.');
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  Future<void> _deleteAccount() async {
    final state = AppScope.of(context);
    if (!await _sure('Delete your account?', 'You are signed out everywhere. Your name, number, email and Google link are erased after 30 days; signing in again before then cancels it. A business where you are the only owner is deleted with you; one with another owner stays with them.', 'Delete account')) return;
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
                      subtitle: business.demo ? '${roleLabel(business.role)} · Demo business, made-up figures' : roleLabel(business.role),
                      trailing: business.id == current ? StatusTag(text: 'Open', color: Palette.accent) : (business.demo ? StatusTag(text: 'Demo', color: Palette.warn) : const Chevron()),
                      onTap: business.id == current ? null : () => _open(business.id),
                    ),
                ],
              ),
              if (_error.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(_error, style: TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
              ],
              if (_note.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(_note, style: Theme.of(context).textTheme.bodyMedium),
              ],
              const SizedBox(height: 26),
              const SectionLabel('Your data'),
              Panel(
                children: [
                  for (final business in me.businesses.where((b) => b.id == current && b.role == 'owner'))
                    RowCard(
                      leading: const TintTile(tint: Tint.ask, mark: Mark.spreadsheet),
                      title: 'Download everything about ${business.name}',
                      subtitle: 'One file with the books, documents, members and audit trail',
                      onTap: () => _download(business.name),
                    ),
                  for (final business in me.businesses.where((b) => b.id == current && b.role == 'owner'))
                    RowCard(
                      leading: const TintTile(tint: Tint.ask, mark: Mark.bringIn),
                      title: 'Restore ${business.name} from a file',
                      subtitle: 'A download from here, or a backup from the Windows app',
                      onTap: () => _restoreFromFile(business.name),
                    ),
                ],
              ),
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
              const SizedBox(height: 26),
              const SectionLabel('Privacy and legal'),
              Panel(
                children: [
                  RowCard(
                    key: const Key('legal.rights'),
                    leading: const TintTile(tint: Tint.ask, mark: Mark.confirm),
                    title: 'Your privacy rights',
                    subtitle: 'Privacy notice, terms, Grievance Officer, and requests to see, correct or erase your data',
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PrivacyRightsScreen())),
                  ),
                ],
              ),
              const SizedBox(height: 26),
              const SectionLabel('About this app'),
              Text(
                aboutLine(AppScope.of(context).server),
                key: const Key('about.version'),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Palette.muted),
              ),
            ],
          );
        },
      ),
    );
  }
}
