import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../theme.dart';
import 'privacy_notice_screen.dart';

const privacyRequestKinds = <String, (String, String)>{
  'access': ('See what MyCA holds about me', 'A summary of your personal data and who it was shared with'),
  'correction': ('Correct or complete my information', 'Tell us what is wrong'),
  'erasure': ('Erase my information', 'Something you cannot delete yourself in the app'),
  'withdraw': ('Withdraw my consent', 'We stop using your information; your account is closed'),
  'nominate': ('Nominate someone to act for me', 'If you die or cannot act yourself'),
  'grievance': ('Make a complaint', 'Goes to the Grievance Officer'),
};

const notTaxAdvice = 'MyCA is software by ML Dynamic Solutions Private Limited. It is not a firm of chartered accountants and does not give tax or legal advice. You approve every return before it is filed.';

String grievanceEmail(String line) => RegExp(r'[\w.+-]+@[\w-]+\.[\w.-]+').firstMatch(line)?.group(0) ?? '';

String requestStatusWords(PrivacyRequest r) {
  final due = r.dueAt.length >= 10 ? r.dueAt.substring(0, 10) : '';
  if (r.status == 'open') return due.isEmpty ? 'Open' : 'Open, answer due by $due';
  if (r.status == 'answered') return 'Answered';
  return 'Closed';
}

class PrivacyRightsScreen extends StatefulWidget {
  const PrivacyRightsScreen({super.key});

  @override
  State<PrivacyRightsScreen> createState() => _PrivacyRightsScreenState();
}

class _PrivacyRightsScreenState extends State<PrivacyRightsScreen> {
  Future<List<PrivacyRequest>>? _requests;
  Future<PrivacyNotice>? _notice;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final cloud = AppScope.of(context).cloud;
    _requests ??= cloud?.privacyRequests();
    _notice ??= cloud?.privacyNotice(region: AppScope.of(context).edition);
  }

  void _reload() {
    final next = AppScope.of(context).cloud?.privacyRequests();
    setState(() {
      _requests = next;
    });
  }

  Future<void> _ask(String kind) async {
    final message = TextEditingController();
    final nomineeName = TextEditingController();
    final nomineeContact = TextEditingController();
    final (title, _) = privacyRequestKinds[kind]!;
    final send = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (kind == 'nominate') ...[
                TextField(key: const ValueKey('rights.nomineeName'), controller: nomineeName, decoration: const InputDecoration(labelText: 'Their name')),
                const SizedBox(height: 8),
                TextField(key: const ValueKey('rights.nomineeContact'), controller: nomineeContact, decoration: const InputDecoration(labelText: 'Their phone number or email')),
                const SizedBox(height: 8),
              ],
              TextField(
                key: const ValueKey('rights.message'),
                controller: message,
                minLines: 3,
                maxLines: 6,
                maxLength: 2000,
                decoration: InputDecoration(labelText: kind == 'grievance' || kind == 'correction' ? 'What happened' : 'Anything we should know (optional)'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(key: const ValueKey('rights.send'), onPressed: () => Navigator.pop(context, true), child: const Text('Send')),
        ],
      ),
    );
    if (send != true || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final (request, selfService) = await AppScope.of(context).cloud!.sendPrivacyRequest(kind, message: message.text, nomineeName: nomineeName.text, nomineeContact: nomineeContact.text);
      messenger.showSnackBar(SnackBar(content: Text('Sent. Your reference is ${request.reference}. We reply within 30 days.${selfService.isEmpty ? '' : ' $selfService'}')));
      _reload();
    } on MycaApiException catch (err) {
      messenger.showSnackBar(SnackBar(content: Text(err.message)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final state = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Your privacy rights')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Text('Under the Digital Personal Data Protection Act, 2023. Every request gets a reference number and an answer within 30 days. If you are not satisfied, you can complain to the Data Protection Board of India.', style: text.bodyMedium),
          const SizedBox(height: 12),
          FutureBuilder<PrivacyNotice>(
            future: _notice,
            builder: (context, snap) {
              final notice = snap.data;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (notice != null && notice.grievance.isNotEmpty)
                    ListTile(
                      key: const ValueKey('rights.grievance'),
                      contentPadding: EdgeInsets.zero,
                      title: Text(notice.grievance),
                      subtitle: grievanceEmail(notice.grievance).isEmpty ? null : const Text('Tap to write to them'),
                      onTap: grievanceEmail(notice.grievance).isEmpty ? null : () => state.openLink(Uri(scheme: 'mailto', path: grievanceEmail(notice.grievance))),
                    ),
                  ListTile(
                    key: const ValueKey('rights.notice'),
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Read the privacy notice'),
                    trailing: const Icon(Icons.chevron_right, semanticLabel: 'Open'),
                    onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PrivacyNoticeScreen(readOnly: true))),
                  ),
                  for (final (key, label) in const [('terms', 'Terms of service'), ('refunds', 'Refunds and cancellation'), ('grievance', 'Grievance redressal')])
                    if (notice != null && (notice.links[key] ?? '').isNotEmpty)
                      ListTile(
                        key: ValueKey('rights.link.$key'),
                        contentPadding: EdgeInsets.zero,
                        title: Text(label),
                        trailing: const Icon(Icons.open_in_new, semanticLabel: 'Opens in the browser'),
                        onTap: () => state.openLink(Uri.parse(notice.links[key]!)),
                      ),
                ],
              );
            },
          ),
          const SizedBox(height: 16),
          Semantics(header: true, child: Text('Ask us', style: text.titleMedium)),
          for (final entry in privacyRequestKinds.entries)
            ListTile(
              key: ValueKey('rights.ask.${entry.key}'),
              contentPadding: EdgeInsets.zero,
              title: Text(entry.value.$1),
              subtitle: Text(entry.value.$2),
              onTap: () => _ask(entry.key),
            ),
          const SizedBox(height: 16),
          Semantics(header: true, child: Text('Your requests', style: text.titleMedium)),
          FutureBuilder<List<PrivacyRequest>>(
            future: _requests,
            builder: (context, snap) {
              if (snap.hasError) return Text('Your requests could not be loaded.', style: text.bodyMedium?.copyWith(color: Palette.danger));
              final rows = snap.data;
              if (rows == null) return const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator()));
              if (rows.isEmpty) return Text('None yet.', style: text.bodyMedium);
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final r in rows)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('${privacyRequestKinds[r.kind]?.$1 ?? r.kind} · ${r.reference}'),
                      subtitle: Text([requestStatusWords(r), if (r.reply.isNotEmpty) r.reply].join('\n')),
                    ),
                ],
              );
            },
          ),
          const SizedBox(height: 16),
          Text(notTaxAdvice, style: text.bodySmall?.copyWith(color: Palette.muted)),
        ],
      ),
    );
  }
}
