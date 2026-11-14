import 'package:flutter/material.dart';
import 'package:myca_design/myca_design.dart' show MycaThemeContext;

import '../../app_state.dart';
import '../../format.dart';
import '../../my/my_book.dart';
import '../../my/my_strings.dart';
import '../../my/my_tools.dart';
import 'my_consolidated_screen.dart';
import 'my_einvoice_create_screen.dart';
import 'my_einvoice_detail_screen.dart';
import 'my_widgets.dart';

Future<(List<MyEinvoice>, bool)> loadMyEinvoices(AppState state) async {
  final server = await MyTools(state.api).list();
  if (server == null) return ([for (final row in myLocalBook(state)) if (!row.received) row], false);
  return (server, true);
}

Future<(List<MyEinvoice>, bool)> loadReceivedEinvoices(AppState state) async {
  final server = await MyTools(state.api).received();
  if (server == null) return (const <MyEinvoice>[], false);
  return (server, true);
}

Future<void> openNewEinvoice(BuildContext context) async {
  final t = MyStrings.of(context);
  final picked = await showModalBottomSheet<String>(
    context: context,
    showDragHandle: true,
    builder: (sheet) => SafeArea(
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(padding: const EdgeInsets.fromLTRB(20, 0, 20, 8), child: Text(t.newWhich, style: Theme.of(sheet).textTheme.titleLarge)),
            ListTile(
              key: const Key('myNew.invoice'),
              leading: const Icon(Icons.receipt_long_outlined),
              title: Text(t.einvoiceToBuyer),
              subtitle: Text(t.einvoiceToBuyerNote),
              onTap: () => Navigator.of(sheet).pop('invoice'),
            ),
            ListTile(
              key: const Key('myNew.consolidated'),
              leading: const Icon(Icons.calendar_month_outlined),
              title: Text(t.consolidatedTitle),
              subtitle: Text(t.consolidatedNoteShort),
              onTap: () => Navigator.of(sheet).pop('consolidated'),
            ),
            ListTile(
              key: const Key('myNew.selfBilled'),
              enabled: false,
              leading: const Icon(Icons.assignment_return_outlined),
              title: Text(t.selfBilled),
              subtitle: Text(t.comingSoon),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    ),
  );
  if (picked == null || !context.mounted) return;
  await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => picked == 'consolidated' ? const MyConsolidatedScreen() : const MyEinvoiceCreateScreen()));
}

class MyEinvoiceTile extends StatelessWidget {
  const MyEinvoiceTile({super.key, required this.record, required this.onOpen});

  final MyEinvoice record;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    final text = Theme.of(context).textTheme;
    final who = record.received ? record.supplierName : record.buyerName;
    final totals = record.totals;
    return InkWell(
      key: Key('myList.${record.number}'),
      onTap: onOpen,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(record.number, style: text.titleSmall, maxLines: 2, overflow: TextOverflow.ellipsis),
                  if (who.isNotEmpty) Text(who, style: text.bodyMedium?.copyWith(color: context.myca.muted), maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      MyStatusChip(record.status),
                      if (record.at.isNotEmpty) Text(myDateTime(record.at).split(' ').first, style: text.bodySmall),
                    ],
                  ),
                ],
              ),
            ),
            if (totals != null) ...[
              const SizedBox(width: 12),
              Flexible(child: Text(totals.currency == 'MYR' ? ringgit(totals.payable) : '${totals.currency} ${totals.payable.toStringAsFixed(2)}', textAlign: TextAlign.end, style: text.titleSmall)),
            ],
            const SizedBox(width: 4),
            Icon(Icons.chevron_right, color: context.myca.faint, semanticLabel: t.detailTitle(record.number)),
          ],
        ),
      ),
    );
  }
}

class MyEinvoiceListScreen extends StatefulWidget {
  const MyEinvoiceListScreen({super.key});

  @override
  State<MyEinvoiceListScreen> createState() => _MyEinvoiceListScreenState();
}

class _MyEinvoiceListScreenState extends State<MyEinvoiceListScreen> {
  Future<(List<MyEinvoice>, bool)>? _issued;
  Future<(List<MyEinvoice>, bool)>? _received;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final state = AppScope.of(context);
    _issued ??= loadMyEinvoices(state);
    _received ??= loadReceivedEinvoices(state);
  }

  void _reload() {
    final state = AppScope.of(context);
    setState(() {
      _issued = loadMyEinvoices(state);
      _received = loadReceivedEinvoices(state);
    });
  }

  Future<void> _open(Widget screen) async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => screen));
    if (mounted) _reload();
  }

  Widget _tab(MyStrings t, Future<(List<MyEinvoice>, bool)>? rows, String empty, {required bool received}) {
    return FutureBuilder<(List<MyEinvoice>, bool)>(
      future: rows,
      builder: (context, loaded) {
        if (loaded.hasError) {
          return ListView(padding: const EdgeInsets.all(16), children: [MyErrorBox(message: myErrorMessage(t, loaded.error!), onRetry: _reload)]);
        }
        final data = loaded.data;
        if (data == null) return const Center(child: CircularProgressIndicator());
        final (list, full) = data;
        return RefreshIndicator(
          onRefresh: () async => _reload(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
            children: [
              if (!full) ...[MyNote(received ? t.notAvailableYet : t.localListNote), const SizedBox(height: 8)],
              if (received && full) ...[MyNote(t.receivedNote), const SizedBox(height: 8)],
              if (list.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 32), child: Text(empty, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyLarge)),
              for (final record in list) ...[
                MyEinvoiceTile(record: record, onOpen: () => _open(MyEinvoiceDetailScreen(record: record))),
                const Divider(height: 1),
              ],
            ],
          ),
        );
      },
    );
  }

  Future<void> _new() async {
    await openNewEinvoice(context);
    if (mounted) _reload();
  }

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: Text(t.listTitle),
          bottom: TabBar(tabs: [Tab(key: const Key('myList.issuedTab'), text: t.issued), Tab(key: const Key('myList.receivedTab'), text: t.received)]),
        ),
        floatingActionButton: FloatingActionButton.extended(
          key: const Key('myList.new'),
          onPressed: _new,
          icon: const Icon(Icons.add),
          label: Text(t.newEinvoice),
        ),
        body: TabBarView(
          children: [
            _tab(t, _issued, t.issuedEmpty, received: false),
            _tab(t, _received, t.receivedEmpty, received: true),
          ],
        ),
      ),
    );
  }
}
