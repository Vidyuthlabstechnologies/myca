import 'package:myca_design/myca_design.dart' show MycaThemeContext;
import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../format.dart';
import '../../marks.dart';
import '../../theme.dart';
import '../../us/us_filing_fee.dart';
import '../../us/us_return.dart';
import '../../widgets.dart';
import '../ask_screen.dart';
import '../businesses_screen.dart';
import '../invite_screen.dart';
import '../people_screen.dart';
import '../plan_screen.dart';
import '../security_screen.dart';
import 'us_fields.dart';
import 'us_forms_screen.dart';
import 'us_interview_screen.dart';
import 'us_profile_screen.dart';
import 'us_review_screen.dart';
import 'us_plus_screen.dart';
import 'us_sign_screen.dart';
import 'us_state_sheet_screen.dart';

class UsReturnHomeScreen extends StatefulWidget {
  const UsReturnHomeScreen({super.key, required this.snapshot});

  final Snapshot snapshot;

  @override
  State<UsReturnHomeScreen> createState() => _UsReturnHomeScreenState();
}

class _Hub {
  const _Hub(this.status, this.efile, {this.review, this.state = '', this.fee});

  final UsReturnStatus status;
  final UsEfileStatus efile;
  final UsReview? review;
  final String state;
  final UsFilingFee? fee;
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
    final cloud = AppScope.of(context).cloud;
    final fees = cloud == null ? const NoFilingFees() : CloudFilingFees(cloud);
    final results = await Future.wait<Object>([loadReturnStatus(_api, year), loadEfileStatus(_api, year)]);
    final status = results[0] as UsReturnStatus;
    _filingStatus = status.filingStatus;
    final extras = await Future.wait<Object?>([
      loadReview(_api, year).then<Object?>((r) => r).catchError((_) => null),
      _api.query('us_taxpayer', {'taxYear': year}).then<Object?>((t) => t).catchError((_) => null),
      fees.status(year).then<Object?>((f) => f).catchError((_) => null),
    ]);
    final address = toolData(extras[1])['address'];
    final state = address is Map ? '${address['state'] ?? ''}' : '';
    return _Hub(status, results[1] as UsEfileStatus, review: extras[0] as UsReview?, state: state, fee: extras[2] as UsFilingFee?);
  }

  Widget _priceLine(_Hub hub) {
    final text = Theme.of(context).textTheme;
    final fee = hub.fee;
    final line = fee == null ? usPriceLine(usFilingPriceUsd) : fee.line;
    final paid = fee != null && fee.enforced && fee.paid;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        children: [
          Icon(paid ? Icons.check_circle : Icons.sell_outlined, size: 18, color: context.myca.accent),
          const SizedBox(width: 8),
          Expanded(child: Text(paid ? 'Your ${fee.taxYear} filing is paid. One price, no upgrade fees.' : line, key: const Key('usHub.priceLine'), style: text.bodyMedium?.copyWith(color: Palette.ink))),
        ],
      ),
    );
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
    Widget item(String key, String title, String subtitle, Widget screen) => ListTile(
          key: Key('usAccount.$key'),
          title: Text(title),
          subtitle: subtitle.isEmpty ? null : Text(subtitle),
          onTap: () {
            Navigator.of(context).pop();
            _open(screen);
          },
        );
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheet) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(sheet).height * 0.85),
          child: ListView(
            key: const Key('usHub.accountMenu'),
            shrinkWrap: true,
            children: [
              item('people', 'Share with your spouse or tax pro', 'They see this return; only you can sign it', const PeopleScreen()),
              item('plan', 'Plan and billing', '', const PlanScreen()),
              item('invite', 'Invite a friend', 'Share your invite code, or use one you were sent', const InviteScreen()),
              item('security', 'Security', 'App lock and two-step sign-in', const SecurityScreen()),
              item('switch', 'Switch or add', 'Another return, or books for a business', const BusinessesScreen()),
              if (state.cloud != null && state.crashes != null)
                ListenableBuilder(
                  listenable: state,
                  builder: (context, _) => SwitchListTile(
                    key: const Key('usAccount.crashReports'),
                    title: const Text('Send crash reports'),
                    subtitle: const Text('Only what went wrong in the app. Names, amounts, Social Security numbers and phone numbers are removed first.'),
                    value: state.crashReportsOn,
                    onChanged: (enabled) => state.setCrashReports(enabled),
                  ),
                ),
              ListTile(
                key: const Key('usAccount.signOut'),
                title: const Text('Sign out'),
                onTap: () {
                  Navigator.of(sheet).pop();
                  state.signOut();
                },
              ),
            ],
          ),
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
        color: rejected ? Palette.dangerSoft : context.myca.accentSoft,
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
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(amount, key: const Key('usHub.amount'), maxLines: 1, style: text.displaySmall?.copyWith(color: status.owed > 0 ? Palette.warn : context.myca.accent, fontFeatures: moneyFigures)),
            ),
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
                  Text('Your $year federal return', style: text.headlineMedium),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: PopupMenuButton<int>(
                      key: const Key('usHub.year'),
                      tooltip: 'Change tax year',
                      initialValue: year,
                      onSelected: (picked) => setState(() {
                        _year = picked;
                        _hub = _load();
                      }),
                      itemBuilder: (_) => [
                        for (final y in [currentTaxYear(AppScope.of(context).now()), currentTaxYear(AppScope.of(context).now()) - 1, currentTaxYear(AppScope.of(context).now()) - 2])
                          PopupMenuItem(value: y, child: Text('Tax year $y')),
                      ],
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(minHeight: 48),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text('Tax year $year', style: text.titleMedium?.copyWith(color: context.myca.accent)),
                            Icon(Icons.arrow_drop_down, color: context.myca.accent),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Text('Form 1040, prepared from your forms and answers.', style: text.bodyMedium?.copyWith(color: Palette.muted)),
                  const SizedBox(height: 18),
                  if (loaded.hasError)
                    UsLoadError(inline: true, message: usLoadProblem(loaded.error, 'Your return could not be loaded.'), onRetry: _reload)
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
                    if (hub.review != null && !hub.review!.canFile) ...[UsUnsupportedNotice(forms: hub.review!.unsupported), const SizedBox(height: 14)],
                    _priceLine(hub),
                    Panel(
                      children: [
                        for (final (id, mark, title, subtitle) in _steps)
                          RowCard(
                            key: Key('usHub.step.$id'),
                            leading: TintTile(tint: id == 'sign' ? Tint.taxes : Tint.ask, mark: mark),
                            title: title,
                            subtitle: subtitle,
                            trailing: hub.status.done(id)
                                ? Icon(Icons.check_circle, color: context.myca.accent, semanticLabel: 'Done')
                                : const Chevron(),
                            onTap: () => _open(screenFor(id)),
                          ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Panel(
                      children: [
                        if (stateHasIncomeTax(hub.state))
                          RowCard(
                            key: const Key('usHub.state'),
                            leading: const TintTile(tint: Tint.ask, mark: Mark.paper),
                            title: 'Your state return',
                            subtitle: stateReturnNote,
                            trailing: const Chevron(),
                            onTap: () => _open(UsStateSheetScreen(taxYear: year, state: hub.state)),
                          ),
                        RowCard(
                          key: const Key('usHub.plus'),
                          leading: const TintTile(tint: Tint.taxes, mark: Mark.ask),
                          title: 'MyCA Plus',
                          subtitle: 'IRS letters, withholding checks and quarterly estimates, all year',
                          trailing: const Chevron(),
                          onTap: () => _open(UsPlusScreen(taxYear: year)),
                        ),
                      ],
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
