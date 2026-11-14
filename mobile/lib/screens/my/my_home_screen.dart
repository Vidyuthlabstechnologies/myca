import 'package:flutter/material.dart';
import 'package:myca_design/myca_design.dart' show MycaThemeContext;

import '../../api/models.dart';
import '../../app_state.dart';
import '../../format.dart';
import '../../my/my_strings.dart';
import '../../my/my_tools.dart';
import '../../tour/tour.dart';
import 'my_einvoice_detail_screen.dart';
import 'my_einvoice_list_screen.dart';
import 'my_plan_screen.dart';
import 'my_profile_screens.dart';
import 'my_sst_screen.dart';
import 'my_tax_screen.dart';
import 'my_widgets.dart';

class MyHomeScreen extends StatefulWidget {
  const MyHomeScreen({super.key, required this.snapshot});

  final Snapshot snapshot;

  @override
  State<MyHomeScreen> createState() => _MyHomeScreenState();
}

class _MyHomeScreenState extends State<MyHomeScreen> {
  Future<MyParty?>? _profile;
  Future<(List<MyEinvoice>, bool)>? _einvoices;
  Future<MySstReturn?>? _sst;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_profile == null) _load();
  }

  void _load() {
    final state = AppScope.of(context);
    final tools = MyTools(state.api);
    _profile = tools.profile();
    _einvoices = loadMyEinvoices(state);
    _sst = tools.sstReturn(period: dueSoonPeriod(state.now()), lines: const []).then<MySstReturn?>((value) => value.$1).catchError((Object _) => null);
  }

  Future<void> _reload() async {
    setState(_load);
    await Future.wait<Object?>([_profile!, _einvoices!.catchError((Object _) => (const <MyEinvoice>[], false)), _sst!]);
  }

  Future<void> _open(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
    if (mounted) setState(_load);
  }

  Future<void> _newEinvoice() async {
    await openNewEinvoice(context);
    if (mounted) setState(_load);
  }

  Future<void> _menu(String choice) async {
    final state = AppScope.of(context);
    switch (choice) {
      case 'profile':
        await _open(const MyProfileScreen());
      case 'plan':
        await _open(const MyPlanScreen());
      case 'language':
        await showLanguageSheet(context);
      case 'sandbox':
        await TourScope.maybeOf(context)?.finish();
      case 'signOut':
        await state.signOut();
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    final text = Theme.of(context).textTheme;
    final palette = context.myca;
    final state = AppScope.of(context);
    final sandbox = mySandbox(context);
    final today = DateTime(state.now().year, state.now().month, state.now().day);
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.snapshot.company.name, maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          const MyLanguageButton(),
          PopupMenuButton<String>(
            key: const Key('myHome.menu'),
            tooltip: t.menu,
            onSelected: _menu,
            itemBuilder: (context) => [
              PopupMenuItem(value: 'profile', child: Text(t.profileTitle)),
              PopupMenuItem(value: 'plan', child: Text(t.plan)),
              if (sandbox) PopupMenuItem(key: const Key('myHome.leaveSandbox'), value: 'sandbox', child: Text(t.leaveSandbox)),
              if (!sandbox && state.cloud != null) PopupMenuItem(value: 'signOut', child: Text(t.signOut)),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          if (sandbox) const MySandboxBanner(),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _reload,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  FutureBuilder<MyParty?>(
                    future: _profile,
                    builder: (context, loaded) {
                      if (loaded.connectionState != ConnectionState.done) return const SizedBox.shrink();
                      if (loaded.data != null) {
                        return Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Row(
                            children: [
                              Icon(Icons.verified_outlined, size: 18, color: palette.accent),
                              const SizedBox(width: 6),
                              Expanded(child: Text('${t.profileReady} · TIN ${loaded.data!.tin}', style: text.bodyMedium?.copyWith(color: palette.muted))),
                            ],
                          ),
                        );
                      }
                      return Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: MyPanel(
                          key: const Key('myHome.profileMissing'),
                          tone: palette.warnSoft,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(t.profileMissing, style: text.bodyLarge),
                              const SizedBox(height: 8),
                              FilledButton(key: const Key('myHome.addDetails'), onPressed: () => _open(const MyProfileScreen()), child: Text(t.addDetails)),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                  MySection(t.homeEinvoice),
                  MyPanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        FilledButton.icon(key: const Key('myHome.newEinvoice'), onPressed: _newEinvoice, icon: const Icon(Icons.add), label: Text(t.newEinvoice)),
                        const SizedBox(height: 8),
                        FutureBuilder<(List<MyEinvoice>, bool)>(
                          future: _einvoices,
                          builder: (context, loaded) {
                            if (loaded.hasError) return MyErrorBox(message: myErrorMessage(t, loaded.error!), onRetry: () => setState(_load));
                            final data = loaded.data;
                            if (data == null) return const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator()));
                            final rows = [for (final row in data.$1) if (!row.received) row];
                            if (rows.isEmpty) return Padding(padding: const EdgeInsets.symmetric(vertical: 12), child: Text(t.noEinvoices, key: const Key('myHome.noEinvoices'), style: text.bodyMedium?.copyWith(color: palette.muted)));
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                for (final record in rows.take(3)) MyEinvoiceTile(record: record, onOpen: () => _open(MyEinvoiceDetailScreen(record: record))),
                                TextButton(key: const Key('myHome.allEinvoices'), onPressed: () => _open(const MyEinvoiceListScreen()), child: Text('${t.allEinvoices} (${t.einvoiceCount(data.$1.length)})')),
                              ],
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(2, 8, 2, 0),
                    child: Text(t.exemptionNote, key: const Key('myHome.exemption'), style: text.bodySmall?.copyWith(color: palette.muted)),
                  ),
                  MySection(t.homeSst),
                  MyPanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        FutureBuilder<MySstReturn?>(
                          future: _sst,
                          builder: (context, loaded) {
                            final sst = loaded.data;
                            if (sst == null || sst.due.isEmpty || sst.period.isEmpty) return const SizedBox.shrink();
                            final due = DateTime.tryParse(sst.due);
                            final (from, to) = periodBounds(sst.period);
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(t.sstDue(t.periodLabel(from, to), dayMonthYear(sst.due)), key: const Key('myHome.sstDue'), style: text.titleSmall),
                                  if (due != null) Text(t.daysLeft(due.difference(today).inDays), style: text.bodyMedium?.copyWith(color: due.isBefore(today) ? palette.danger : palette.muted)),
                                ],
                              ),
                            );
                          },
                        ),
                        OutlinedButton(key: const Key('myHome.sst'), onPressed: () => _open(const MySstScreen()), child: Text(t.prepareSst)),
                        TextButton(key: const Key('myHome.sstRegistration'), onPressed: () => _open(const MySstScreen(startOnRegistration: true)), child: Text(t.mustIRegister, textAlign: TextAlign.center)),
                      ],
                    ),
                  ),
                  MySection(t.homeTax),
                  MyPanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(t.homeTaxBody, style: text.bodyMedium),
                        const SizedBox(height: 8),
                        OutlinedButton(key: const Key('myHome.tax'), onPressed: () => _open(const MyTaxScreen()), child: Text(t.estimateTax)),
                      ],
                    ),
                  ),
                  MySection(t.homeBusiness),
                  MyPanel(
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
                        ListTile(key: const Key('myHome.profile'), title: Text(t.profileTitle), trailing: const Icon(Icons.chevron_right), onTap: () => _open(const MyProfileScreen())),
                        const Divider(height: 1),
                        ListTile(key: const Key('myHome.plan'), title: Text(t.plan), trailing: const Icon(Icons.chevron_right), onTap: () => _open(const MyPlanScreen())),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
