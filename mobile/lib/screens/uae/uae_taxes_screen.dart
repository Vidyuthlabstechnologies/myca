import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../marks.dart';
import '../../theme.dart';
import '../../uae/uae_emirates.dart';
import '../../uae/uae_format.dart';
import '../../uae/uae_strings.dart';
import '../../widgets.dart';
import 'uae_ct_estimate_screen.dart';
import 'uae_einvoice_screen.dart';
import 'uae_profile_screen.dart';
import 'uae_vat_return_screen.dart';

class UaeDeadline {
  const UaeDeadline({required this.id, required this.date, required this.daysLeft, required this.overdue});

  factory UaeDeadline.fromJson(Map<String, dynamic> row) => UaeDeadline(
    id: uaeText(row['id']),
    date: uaeText(row['date']),
    daysLeft: uaeNum(row['daysLeft']).toInt(),
    overdue: row['overdue'] == true,
  );

  final String id;
  final String date;
  final int daysLeft;
  final bool overdue;
}

class UaeDeadlines {
  const UaeDeadlines({required this.items, this.penalty});

  final List<UaeDeadline> items;
  final Map<String, dynamic>? penalty;
}

String _iso(DateTime day) => '${day.year.toString().padLeft(4, '0')}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';

String ctYearEnd(int year, String? financialYearEnd) {
  final match = RegExp(r'^(\d{2})-(\d{2})$').firstMatch(financialYearEnd ?? '');
  if (match == null) return '$year-12-31';
  return '$year-${match.group(1)}-${match.group(2)}';
}

Future<void> loadUaeProfile(MycaApi api) async {
  if (uaeProfile.value != null) return;
  try {
    final data = toolData(await api.query('ae_business_profile'));
    final business = data['business'];
    if (data['saved'] == true && business is Map) uaeProfile.value = Map<String, dynamic>.from(business);
  } catch (_) {}
}

Future<UaeDeadlines> loadUaeDeadlines(MycaApi api, DateTime now) async {
  await loadUaeProfile(api);
  final profile = uaeProfile.value;
  final today = _iso(now);
  final lastQuarter = UaeQuarter.containing(now).previous;
  final yearEnd = profile?['financialYearEnd'] as String?;
  var vatEnd = lastQuarter.end;
  var ctEnd = ctYearEnd(now.year - 1, yearEnd);
  Future<List<UaeDeadline>> ask() async {
    final data = toolData(await api.query('ae_deadlines', {'today': today, 'vatPeriodEnd': vatEnd, 'ctPeriodEnd': ctEnd, 'revenue': uaeNum(profile?['revenue'])}));
    return [for (final row in uaeRows(data['items'])) UaeDeadline.fromJson(row)];
  }

  var items = await ask();
  final vatLate = items.any((item) => item.id == 'vat-return' && item.overdue);
  final ctLate = items.any((item) => item.id == 'ct-return' && item.overdue);
  if (vatLate || ctLate) {
    if (vatLate) vatEnd = lastQuarter.next.end;
    if (ctLate) ctEnd = ctYearEnd(now.year, yearEnd);
    items = await ask();
  }
  return UaeDeadlines(items: items);
}

class UaeTaxesScreen extends StatefulWidget {
  const UaeTaxesScreen({super.key});

  @override
  State<UaeTaxesScreen> createState() => _UaeTaxesScreenState();
}

class _UaeTaxesScreenState extends State<UaeTaxesScreen> {
  Future<UaeDeadlines>? _deadlines;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _deadlines ??= _load();
  }

  Future<UaeDeadlines> _load() {
    final state = AppScope.of(context);
    return loadUaeDeadlines(state.api, state.now());
  }

  Future<void> _open(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
    if (mounted) setState(() { _deadlines = _load(); });
  }

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(s.taxesTitle)),
      body: RefreshIndicator(
        onRefresh: () async {
          final next = _load();
          setState(() { _deadlines = next; });
          await next.catchError((_) => const UaeDeadlines(items: []));
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            Text(s.taxesIntro, style: text.bodyMedium),
            const SizedBox(height: 18),
            SectionLabel(s.comingUp),
            FutureBuilder<UaeDeadlines>(
              future: _deadlines,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
                }
                if (snap.hasError) {
                  return Panel(children: [
                    RowCard(
                      leading: const TintTile(tint: Tint.urgent, mark: Mark.urgent),
                      title: s.couldNotWorkOut,
                      subtitle: s.tryAgain,
                      onTap: () => setState(() { _deadlines = _load(); }),
                    ),
                  ]);
                }
                return UaeDeadlinesCard(items: snap.data?.items ?? const []);
              },
            ),
            const SizedBox(height: 22),
            Panel(
              children: [
                RowCard(
                  key: const ValueKey('uae.open.vat'),
                  leading: const TintTile(tint: Tint.taxes, mark: Mark.taxes),
                  title: s.vatReturnTitle,
                  subtitle: s.vatReturnSubtitle,
                  trailing: const Chevron(),
                  onTap: () => _open(const UaeVatReturnScreen()),
                ),
                RowCard(
                  key: const ValueKey('uae.open.ct'),
                  leading: const TintTile(tint: Tint.taxes, mark: Mark.sales),
                  title: s.ctTitle,
                  subtitle: s.ctSubtitle,
                  trailing: const Chevron(),
                  onTap: () => _open(const UaeCtEstimateScreen()),
                ),
                RowCard(
                  key: const ValueKey('uae.open.einvoice'),
                  leading: const TintTile(tint: Tint.ask, mark: Mark.confirm),
                  title: s.einvoiceTitle,
                  subtitle: s.einvoiceSubtitle,
                  trailing: const Chevron(),
                  onTap: () => _open(const UaeEinvoiceScreen()),
                ),
                RowCard(
                  key: const ValueKey('uae.open.profile'),
                  leading: const TintTile(tint: Tint.ask, mark: Mark.people),
                  title: s.profileTitle,
                  subtitle: s.profileSubtitle,
                  trailing: const Chevron(),
                  onTap: () => _open(const UaeProfileScreen()),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class UaeDeadlinesCard extends StatelessWidget {
  const UaeDeadlinesCard({super.key, required this.items});

  final List<UaeDeadline> items;

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final f = UaeFormat.of(context);
    if (items.isEmpty) return Panel(children: [RowCard(leading: const TintTile(tint: Tint.taxes, mark: Mark.comingUp), title: s.comingUp, subtitle: s.noDates)]);
    String what(String id) => switch (id) {
      'vat-return' => s.vatReturnDue,
      'ct-return' => s.ctReturnDue,
      'einvoice-asp' => s.einvoiceAsp,
      'einvoice-live' => s.einvoiceLive,
      _ => id,
    };
    String when(UaeDeadline item) {
      final left = item.overdue ? s.datePassed : item.daysLeft == 0 ? s.dueToday : s.daysLeft(item.daysLeft);
      final wave = item.id.startsWith('einvoice') ? ' · ${s.einvoiceWave}' : '';
      return '${f.date(item.date, short: false)} · $left$wave';
    }
    return Panel(
      key: const ValueKey('uae.deadlines'),
      children: [
        for (final item in items)
          RowCard(
            key: ValueKey('uae.deadline.${item.id}'),
            leading: TintTile(tint: item.overdue ? Tint.urgent : Tint.taxes, mark: item.overdue ? Mark.urgent : Mark.comingUp),
            title: what(item.id),
            subtitle: when(item),
          ),
      ],
    );
  }
}

class UaeTaxesPanel extends StatelessWidget {
  const UaeTaxesPanel({super.key, required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final text = Theme.of(context).textTheme;
    return Material(
      key: const ValueKey('home.uae'),
      color: Palette.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusCard), side: BorderSide(color: Palette.line)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(18, 16, 14, 16),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.taxesKicker, style: text.labelSmall),
                    const SizedBox(height: 6),
                    Text(s.taxesPanel, style: text.titleMedium),
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
