import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../format.dart';
import '../../marks.dart';
import '../../theme.dart';
import '../../us/us_return.dart';
import '../../widgets.dart';
import '../ask_screen.dart';
import '../businesses_screen.dart';
import '../people_screen.dart';
import '../plan_screen.dart';
import '../security_screen.dart';
import 'us_forms_screen.dart';
import 'us_interview_screen.dart';
import 'us_profile_screen.dart';
import 'us_review_screen.dart';
import 'us_sign_screen.dart';

class UsReturnHomeScreen extends StatefulWidget {
  const UsReturnHomeScreen({super.key, required this.snapshot});

  final Snapshot snapshot;

  @override
  State<UsReturnHomeScreen> createState() => _UsReturnHomeScreenState();
}

class _Hub {
  const _Hub(this.status, this.efile);

  final UsReturnStatus status;
  final UsEfileStatus efile;
}

class _UsReturnHomeScreenState extends State<UsReturnHomeScreen> {
  Future<_Hub>? _hub;
  int? _year;

  MycaApi get _api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _year ??= currentTaxYear(AppScope.of(context).now());
    _hub ??= _load();
  }

  String _filingStatus = '';

  Future<_Hub> _load() async {
    final year = _year!;
    final results = await Future.wait<Object>([loadReturnStatus(_api, year), loadEfileStatus(_api, year)]);
    final status = results[0] as UsReturnStatus;
    _filingStatus = status.filingStatus;
    return _Hub(status, results[1] as UsEfileStatus);
  }

  void _reload() => setState(() {
        _hub = _load();
      });

  Future<void> _open(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
    if (mounted) _reload();
  }

  Widget screenFor(String step) {
    final year = _year!;
    switch (step) {
      case 'profile':
        return UsProfileScreen(taxYear: year);
      case 'forms':
        return UsFormsScreen(taxYear: year, joint: _filingStatus == 'mfj');
      case 'interview':
        return UsInterviewScreen(taxYear: year);
      case 'sign':
        return UsSignScreen(taxYear: year);
      default:
        return UsReviewScreen(taxYear: year);
    }
  }

  void _account() {
    final state = AppScope.of(context);
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: const Text('Share with your spouse or tax pro'),
              subtitle: const Text('They see this return; only you can sign it'),
              onTap: () {
                Navigator.of(sheet).pop();
                _open(const PeopleScreen());
              },
            ),
            ListTile(
              title: const Text('Plan and billing'),
              onTap: () {
                Navigator.of(sheet).pop();
                _open(const PlanScreen());
              },
            ),
            ListTile(
              title: const Text('Security'),
              subtitle: const Text('App lock and two-step sign-in'),
              onTap: () {
                Navigator.of(sheet).pop();
                _open(const SecurityScreen());
              },
            ),
            ListTile(
              title: const Text('Switch or add'),
              subtitle: const Text('Another return, or books for a business'),
              onTap: () {
                Navigator.of(sheet).pop();
                _open(const BusinessesScreen());
              },
            ),
            ListTile(
              title: const Text('Sign out'),
              onTap: () {
                Navigator.of(sheet).pop();
                state.signOut();
              },
            ),
          ],
        ),
      ),
    );
  }

  String _statusLine(UsEfileStatus efile) {
    switch (efile.status) {
      case 'accepted':
        return 'The IRS accepted your return${efile.acceptedAt.isEmpty ? '' : ' on ${longDate(efile.acceptedAt.substring(0, 10))}'}.';
      case 'submitted':
        return 'Sent to the IRS. Acceptance usually takes a day or two.';
      case 'rejected':
        return 'The IRS sent your return back. Fix what it found and file again.';
      case 'signed':
        return 'Signed and ready to send.';
      default:
        return '';
    }
  }

  Widget _efileCard(UsEfileStatus efile) {
    final text = Theme.of(context).textTheme;
    final line = _statusLine(efile);
    if (line.isEmpty) return const SizedBox.shrink();
    final rejected = efile.status == 'rejected';
    return Container(
      key: const Key('usHub.efile'),
      padding: const EdgeInsets.all(16),
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: rejected ? Palette.dangerSoft : Palette.accentSoft,
        borderRadius: BorderRadius.circular(radiusCard),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(line, style: text.titleMedium),
          if (efile.submissionId.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text('Submission ID ${efile.submissionId}', style: text.bodySmall),
          ],
          for (final r in efile.rejections) ...[
            const SizedBox(height: 10),
            Text(r.message, style: text.bodyMedium),
            if (r.fix.isNotEmpty) Text(r.fix, style: text.bodySmall?.copyWith(color: Palette.muted)),
            if (r.step.isNotEmpty)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  key: Key('usHub.fix.${r.code}'),
                  onPressed: () => _open(screenFor(r.step)),
                  child: const Text('Fix this'),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _summary(UsReturnStatus status) {
    final text = Theme.of(context).textTheme;
    final String label;
    final String amount;
    if (status.refund > 0) {
      label = 'Estimated federal refund';
      amount = dollars(status.refund);
    } else if (status.owed > 0) {
      label = 'Estimated federal tax due';
      amount = dollars(status.owed);
    } else {
      label = status.done('forms') ? 'You break even with the IRS' : 'Add your tax forms to see your refund';
      amount = status.done('forms') ? dollars(0) : '';
    }
    return Container(
      key: const Key('usHub.summary'),
      padding: const EdgeInsets.all(18),
      margin: const EdgeInsets.only(bottom: 18),
      decoration: BoxDecoration(
        color: Palette.surface,
        borderRadius: BorderRadius.circular(radiusCard),
        border: Border.all(color: Palette.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: text.bodyLarge?.copyWith(color: Palette.muted)),
          if (amount.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(amount, style: text.displaySmall?.copyWith(color: status.owed > 0 ? Palette.warn : Palette.accent, fontFeatures: moneyFigures)),
          ],
          const SizedBox(height: 6),
          Text('Updates as you add forms and answer questions.', style: text.bodySmall),
        ],
      ),
    );
  }

  static const _steps = [
    ('profile', Mark.people, 'About you', 'Filing status, Social Security numbers, dependents and address'),
    ('forms', Mark.paper, 'Tax documents', 'W-2s, 1099s and 1098s: snap a photo or type them in'),
    ('interview', Mark.ask, 'A few questions', 'Plain questions about credits and deductions'),
    ('review', Mark.taxes, 'Review your return', 'Every line of your Form 1040 and where it came from'),
    ('sign', Mark.confirm, 'Sign and e-file', 'Your signature PIN, refund deposit, and filing with the IRS'),
  ];

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final year = _year!;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.snapshot.company.name),
        actions: [
          IconButton(
            tooltip: 'Ask a tax question',
            icon: const MarkIcon(mark: Mark.ask, size: 22),
            onPressed: () => _open(const AskScreen()),
          ),
          IconButton(tooltip: 'Your account', icon: const Icon(Icons.account_circle_outlined), onPressed: _account),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async => _reload(),
          child: FutureBuilder<_Hub>(
            future: _hub,
            builder: (context, loaded) {
              final hub = loaded.data;
              return ListView(
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
                children: [
                  Row(
                    children: [
                      Expanded(child: Text('Your $year federal return', style: text.headlineMedium)),
                      PopupMenuButton<int>(
                        key: const Key('usHub.year'),
                        tooltip: 'Tax year',
                        initialValue: year,
                        onSelected: (picked) => setState(() {
                          _year = picked;
                          _hub = _load();
                        }),
                        itemBuilder: (_) => [
                          for (final y in [currentTaxYear(AppScope.of(context).now()), currentTaxYear(AppScope.of(context).now()) - 1, currentTaxYear(AppScope.of(context).now()) - 2])
                            PopupMenuItem(value: y, child: Text('Tax year $y')),
                        ],
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text('$year', style: text.titleMedium?.copyWith(color: Palette.accent)),
                              const Icon(Icons.arrow_drop_down, color: Palette.accent),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text('Form 1040, prepared from your forms and answers.', style: text.bodyMedium?.copyWith(color: Palette.muted)),
                  const SizedBox(height: 18),
                  if (loaded.hasError)
                    EmptyNote(text: loaded.error is MycaApiException ? (loaded.error as MycaApiException).message : 'Your return could not be loaded. Pull down to try again.')
                  else if (hub == null)
                    const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator()))
                  else ...[
                    if (hub.efile.sandbox && hub.efile.status != 'not_filed')
                      Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: StatusTag(text: 'IRS test system: this return is not really filed', color: Palette.warn),
                      ),
                    _efileCard(hub.efile),
                    _summary(hub.status),
                    Panel(
                      children: [
                        for (final (id, mark, title, subtitle) in _steps)
                          RowCard(
                            key: Key('usHub.step.$id'),
                            leading: TintTile(tint: id == 'sign' ? Tint.taxes : Tint.ask, mark: mark),
                            title: title,
                            subtitle: subtitle,
                            trailing: hub.status.done(id)
                                ? const Icon(Icons.check_circle, color: Palette.accent, semanticLabel: 'Done')
                                : const Chevron(),
                            onTap: () => _open(screenFor(id)),
                          ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'MyCA prepares your federal return. Your state return is not included yet.',
                      style: text.bodySmall?.copyWith(color: Palette.muted),
                    ),
                  ],
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}
