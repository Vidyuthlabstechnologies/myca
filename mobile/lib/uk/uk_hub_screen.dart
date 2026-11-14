import 'package:flutter/material.dart';

import '../api/models.dart';
import '../app_state.dart';
import '../format.dart';
import '../marks.dart';
import '../theme.dart';
import '../widgets.dart';
import 'uk_common.dart';
import 'uk_connect_screen.dart';
import 'uk_estimate_screen.dart';
import 'uk_mtd_screen.dart';
import 'uk_taxpayer_screen.dart';
import 'uk_vat_screen.dart';

class UkCalendar {
  const UkCalendar({required this.events, required this.next, this.problem = ''});

  factory UkCalendar.fromTool(Object? result) {
    if (!ukOk(result)) return UkCalendar(events: const [], next: null, problem: ukErrorWords(result, fallback: 'The deadlines could not be loaded.'));
    final data = toolData(result);
    final next = ukMap(data['next']);
    return UkCalendar(events: ukMaps(data['events']), next: next.isEmpty ? null : next);
  }

  final List<Map<String, dynamic>> events;
  final Map<String, dynamic>? next;
  final String problem;

  List<Map<String, dynamic>> get upcoming => [for (final e in events) if (e['past'] != true) e];
}

int daysUntil(String iso, DateTime today) {
  final day = DateTime.tryParse(iso);
  if (day == null) return 0;
  return DateTime(day.year, day.month, day.day).difference(DateTime(today.year, today.month, today.day)).inDays;
}

class UkHubScreen extends StatefulWidget {
  const UkHubScreen({super.key, this.links});

  final Stream<Uri>? links;

  @override
  State<UkHubScreen> createState() => _UkHubScreenState();
}

class _UkHubScreenState extends State<UkHubScreen> {
  Future<UkCalendar>? _calendar;
  Future<HmrcStatus>? _status;
  String _taxYear = '';
  String _note = '';
  bool _busy = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_taxYear.isEmpty) _taxYear = gbTaxYearOn(AppScope.of(context).now());
    _calendar ??= _loadCalendar();
    _status ??= loadHmrcStatus(AppScope.of(context).api);
  }

  Future<UkCalendar> _loadCalendar() async => UkCalendar.fromTool(await ukQuery(AppScope.of(context).api, 'gb_tax_calendar', {'taxYear': _taxYear}));

  void _reload() {
    setState(() {
      _calendar = _loadCalendar();
      _status = loadHmrcStatus(AppScope.of(context).api);
    });
  }

  Future<void> _open(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
    if (mounted) _reload();
  }

  Future<void> _sync() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      final words = await syncWithHmrc(context, AppScope.of(context).api, _taxYear);
      if (!mounted) return;
      setState(() => _note = words);
      _reload();
    } on Object catch (err) {
      if (mounted) setState(() => _note = '$err');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final today = AppScope.of(context).now();
    return Scaffold(
      appBar: AppBar(title: const Text('UK taxes')),
      body: RefreshIndicator(
        onRefresh: () async => _reload(),
        child: ListView(
          padding: ukPagePadding,
          children: [
            Text('Tax year $_taxYear', style: text.labelSmall),
            const SizedBox(height: 4),
            Text(gbTaxYearWords(_taxYear), style: text.bodyMedium),
            const SizedBox(height: 14),
            FutureBuilder<UkCalendar>(
              future: _calendar,
              builder: (context, snap) {
                final calendar = snap.data;
                if (calendar == null) return const UkCard(children: [LinearProgressIndicator()]);
                final next = calendar.next;
                return UkCard(
                  children: [
                    Text('NEXT DEADLINE', style: text.labelSmall),
                    const SizedBox(height: 6),
                    if (calendar.problem.isNotEmpty)
                      UkNote(calendar.problem, warn: true)
                    else if (next == null)
                      Text('No deadlines left in this tax year.', style: text.titleMedium)
                    else ...[
                      Text(gbDay(ukText(next['date'])), key: const Key('uk.hub.nextDate'), style: text.headlineSmall),
                      const SizedBox(height: 2),
                      Text(gbDatesIn(ukText(next['what'])), style: text.bodyLarge),
                      const SizedBox(height: 4),
                      StatusTag(text: dueLabel(daysUntil(ukText(next['date']), today)), color: daysUntil(ukText(next['date']), today) <= 14 ? Palette.warn : Palette.muted),
                    ],
                    if (calendar.upcoming.length > 1) ...[
                      const SizedBox(height: 12),
                      Text('Coming up', style: text.titleSmall),
                      for (final event in calendar.upcoming.skip(1).take(3))
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text('${gbDay(ukText(event['date']))}: ${gbDatesIn(ukText(event['what']))}', style: text.bodyMedium),
                        ),
                    ],
                  ],
                );
              },
            ),
            FutureBuilder<HmrcStatus>(
              future: _status,
              builder: (context, snap) {
                final status = snap.data;
                if (status == null) return const UkCard(children: [LinearProgressIndicator()]);
                return UkCard(
                  children: [
                    Text('HMRC', style: text.labelSmall),
                    const SizedBox(height: 6),
                    Text(hmrcStatusWords(status), key: const Key('uk.hub.hmrc'), style: text.titleMedium),
                    UkNote(syncWords(status)),
                    if (status.missingSettings.isNotEmpty) const UkNote('The connection to HMRC is not set up on this MyCA service yet.', warn: true),
                    if (_note.isNotEmpty) UkNote(_note),
                    const SizedBox(height: 6),
                    if (status.connected)
                      UkWideButton(label: _busy ? 'Syncing…' : 'Sync with HMRC', outlined: true, onPressed: _busy ? null : _sync)
                    else
                      UkWideButton(label: 'Connect to HMRC', onPressed: () => _open(UkConnectScreen(taxYear: _taxYear, links: widget.links))),
                  ],
                );
              },
            ),
            const SizedBox(height: 8),
            const SectionLabel('Your UK tax'),
            Panel(
              children: [
                RowCard(
                  leading: const TintTile(tint: Tint.ask, mark: Mark.people),
                  title: 'Your details',
                  subtitle: 'UTR, National Insurance and VAT numbers, where you live',
                  trailing: const Chevron(),
                  onTap: () => _open(const UkTaxpayerScreen()),
                ),
                RowCard(
                  leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
                  title: 'Self Assessment estimate',
                  subtitle: 'Income tax, National Insurance and what to pay by 31 January',
                  trailing: const Chevron(),
                  onTap: () => _open(UkEstimateScreen(taxYear: _taxYear)),
                ),
                RowCard(
                  leading: const TintTile(tint: Tint.taxes, mark: Mark.sales),
                  title: 'VAT returns',
                  subtitle: 'Your VAT periods, the nine boxes, and sending to HMRC',
                  trailing: const Chevron(),
                  onTap: () => _open(UkVatScreen(taxYear: _taxYear)),
                ),
                RowCard(
                  leading: const TintTile(tint: Tint.taxes, mark: Mark.comingUp),
                  title: 'Making Tax Digital for Income Tax',
                  subtitle: 'Quarterly updates, HMRC\'s calculation and the final declaration',
                  trailing: const Chevron(),
                  onTap: () => _open(UkMtdScreen(taxYear: _taxYear)),
                ),
                RowCard(
                  leading: const TintTile(tint: Tint.ask, mark: Mark.switchBooks),
                  title: 'Connect to HMRC',
                  subtitle: 'Sign in with your Government Gateway account',
                  trailing: const Chevron(),
                  onTap: () => _open(UkConnectScreen(taxYear: _taxYear, links: widget.links)),
                ),
              ],
            ),
            const UkFooter(),
          ],
        ),
      ),
    );
  }
}

class UkHomePanel extends StatelessWidget {
  const UkHomePanel({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Material(
      key: const ValueKey('home.uk'),
      color: Palette.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusCard), side: const BorderSide(color: Palette.line)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 16, 14, 16),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('UK TAXES', style: text.labelSmall),
                    const SizedBox(height: 6),
                    Text('VAT returns, Self Assessment and Making Tax Digital', style: text.titleMedium),
                  ],
                ),
              ),
              const Chevron(),
            ],
          ),
        ),
      ),
    );
  }
}
