import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../offline/offline_billing.dart';
import '../offline/offline_models.dart';
import '../pos/printer.dart';
import '../pos/receipt.dart';
import '../registers.dart';

String offlineProblemWords(String error, String hint) {
  final said = switch (error) {
    'FIGURES_DIFFER' => 'MyCA worked out different GST figures from the ones printed on this bill.',
    'NUMBER_TAKEN' => 'Another bill in your books already has this number.',
    'OVERPAYMENT' => 'This is more than is due on the invoice.',
    'PERIOD_LOCKED' => 'Your books are locked for this date.',
    'INVALID_GSTIN' => 'MyCA did not accept the customer\'s GSTIN.',
    'WRONG_SERIES' => 'This number is not from this phone\'s series.',
    'NOT_OFFLINE' => 'This kind of bill needs a connection.',
    'INVOICE_NOT_FOUND' => 'The invoice is not in your books.',
    _ => error.isEmpty ? 'MyCA did not take this entry.' : 'MyCA did not take this entry ($error).',
  };
  return hint.isEmpty ? said : '$said $hint';
}

String _statusWords(EntryStatus status) => switch (status) {
  EntryStatus.waiting => 'Waiting to sync',
  EntryStatus.synced => 'In your books',
  EntryStatus.conflict => 'Needs you',
  EntryStatus.rejected => 'Not taken',
};

String _time(String iso) {
  final at = DateTime.tryParse(iso)?.toLocal();
  if (at == null) return 'never';
  final hour = at.hour % 12 == 0 ? 12 : at.hour % 12;
  return '${dayMonthYear(isoDate(at))}, $hour:${at.minute.toString().padLeft(2, '0')} ${at.hour < 12 ? 'AM' : 'PM'}';
}

class OfflineBillsScreen extends StatefulWidget {
  const OfflineBillsScreen({super.key, this.printer = const BluetoothReceiptPrinter()});

  final ReceiptPrinter printer;

  @override
  State<OfflineBillsScreen> createState() => _OfflineBillsScreenState();
}

class _OfflineBillsScreenState extends State<OfflineBillsScreen> {
  String _message = '';
  bool _busy = false;

  OfflineBilling get offline => AppScope.of(context).offline!;
  MycaApi get api => AppScope.of(context).api;

  Future<void> _syncNow() async {
    setState(() {
      _busy = true;
      _message = '';
    });
    try {
      if (!offline.ready) await offline.prepare(api);
      final outcome = await offline.sync(api);
      if (!mounted) return;
      setState(() => _message = outcome.message);
      if (outcome.synced > 0) await AppScope.of(context).refresh();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _message = isUnreachable(err) ? 'No connection yet. Everything stays on this phone and syncs by itself when you are back online.' : err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _print(OfflineBill bill) async {
    final printer = await widget.printer.remembered();
    if (!mounted) return;
    if (printer == null) {
      setState(() => _message = 'Print one bill from Counter sale first to choose the receipt printer.');
      return;
    }
    final kit = offline.kit;
    final bytes = receiptBytes(invoice: offline.documentOf(bill), businessName: kit?.businessName ?? '', gstin: kit?.gstin ?? '', paper: await widget.printer.paper());
    final problem = await widget.printer.print(printer, bytes);
    if (problem == null) await offline.markPrinted(bill.ref);
    if (mounted) setState(() => _message = problem ?? 'Receipt for ${bill.id} sent to ${printer.name}.');
  }

  Future<String?> _ask(String title, String label, {String initial = '', TextInputType? keyboard}) {
    final field = TextEditingController(text: initial);
    return showDialog<String>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(title),
        content: TextField(key: const Key('offline-ask'), controller: field, autofocus: true, keyboardType: keyboard, decoration: InputDecoration(labelText: label)),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialog).pop(), child: Text(inText(context, 'Back'))),
          FilledButton(key: const Key('offline-ask-ok'), onPressed: () => Navigator.of(dialog).pop(field.text), child: Text(inText(context, 'Save'))),
        ],
      ),
    ).whenComplete(field.dispose);
  }

  Future<void> _billActions(OfflineBill bill) async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (sheet) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            ListTile(title: Text('${bill.id} · ${rupees(bill.total)}'), subtitle: Text('${bill.partyName} · ${_statusWords(bill.status)}${bill.voided != null ? ' · cancelled' : ''}')),
            if (bill.status == EntryStatus.conflict || bill.status == EntryStatus.rejected) Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Text(offlineProblemWords(bill.error, bill.hint))),
            if (bill.error == 'FIGURES_DIFFER' && bill.engine.isNotEmpty)
              ListTile(
                key: const Key('offline-accept-engine'),
                leading: const Icon(Icons.rule),
                title: Text('Use MyCA\'s figures: ${rupees(offlineNum(bill.engine['total']))}'),
                subtitle: Text('Printed ${rupees(bill.total)}. Give the customer the reprinted bill.'),
                onTap: () => Navigator.of(sheet).pop('accept'),
              ),
            if (bill.error == 'NUMBER_TAKEN') ListTile(key: const Key('offline-renumber'), leading: const Icon(Icons.pin_outlined), title: Text(inText(context, 'Give it the next number on this phone')), subtitle: Text(inText(context, 'Then reprint it for the customer.')), onTap: () => Navigator.of(sheet).pop('renumber')),
            if (bill.error == 'INVALID_GSTIN') ListTile(key: const Key('offline-fix-gstin'), leading: const Icon(Icons.edit_outlined), title: Text(inText(context, 'Correct the customer\'s GSTIN')), onTap: () => Navigator.of(sheet).pop('gstin')),
            if (bill.status == EntryStatus.rejected) ListTile(key: const Key('offline-retry'), leading: const Icon(Icons.refresh), title: Text(inText(context, 'Try again')), subtitle: Text(inText(context, 'After you fix the cause in MyCA, for example unlock the month.')), onTap: () => Navigator.of(sheet).pop('retry')),
            ListTile(key: const Key('offline-print'), leading: const Icon(Icons.print_outlined), title: Text(bill.reprintNeeded ? inText(context, 'Reprint the corrected bill') : inText(context, 'Print receipt')), onTap: () => Navigator.of(sheet).pop('print')),
            if (bill.status != EntryStatus.synced && bill.voided == null) ListTile(key: const Key('offline-void'), leading: const Icon(Icons.block), title: Text(inText(context, 'Cancel this bill')), subtitle: Text(inText(context, 'The number stays used; MyCA records the bill and a credit note.')), onTap: () => Navigator.of(sheet).pop('void')),
          ],
        ),
      ),
    );
    if (choice == null || !mounted) return;
    String? said;
    switch (choice) {
      case 'accept':
        await offline.acceptEngineFigures(bill.ref);
        said = 'MyCA\'s figures will be used for ${bill.id}. Reprint the bill for the customer.';
      case 'renumber':
        await offline.renumber(bill.ref);
        said = 'The bill has a new number. Reprint it for the customer.';
      case 'gstin':
        final typed = await _ask('Customer GSTIN', 'GSTIN', initial: bill.partyGstin);
        if (typed == null) return;
        said = await offline.fixGstin(bill.ref, typed) ?? 'GSTIN corrected. Reprint the bill for the customer.';
      case 'retry':
        await offline.retry(bill.ref);
      case 'print':
        await _print(bill);
        return;
      case 'void':
        final reason = await _ask('Why cancel ${bill.id}?', 'Reason');
        if (reason == null) return;
        said = await offline.voidBill(bill.ref, reason) ?? '${bill.id} is cancelled. It reaches your books with a credit note so the number series has no gap.';
    }
    if (!mounted) return;
    setState(() => _message = said ?? '');
    if (offline.online != false) await _syncNow();
  }

  Future<void> _receiptActions(OfflineReceipt receipt) async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (sheet) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            ListTile(title: Text('${rupees(receipt.amount)} against ${receipt.invoiceId}'), subtitle: Text('${receipt.partyName} · ${_statusWords(receipt.status)}')),
            if (receipt.status != EntryStatus.waiting && receipt.status != EntryStatus.synced) Padding(padding: const EdgeInsets.symmetric(horizontal: 16), child: Text(offlineProblemWords(receipt.error, receipt.hint))),
            if (receipt.error == 'OVERPAYMENT' && receipt.due != null && receipt.due! > 0) ListTile(key: const Key('offline-receipt-due'), leading: const Icon(Icons.edit_outlined), title: Text('Record ${rupees(receipt.due!)}, the amount due'), onTap: () => Navigator.of(sheet).pop('due')),
            if (receipt.status == EntryStatus.rejected) ListTile(leading: const Icon(Icons.refresh), title: Text(inText(context, 'Try again')), onTap: () => Navigator.of(sheet).pop('retry')),
            if (receipt.status != EntryStatus.synced) ListTile(key: const Key('offline-receipt-drop'), leading: const Icon(Icons.delete_outline), title: Text(inText(context, 'Remove this receipt')), subtitle: Text(inText(context, 'Only if the money was not received.')), onTap: () => Navigator.of(sheet).pop('drop')),
          ],
        ),
      ),
    );
    if (choice == null || !mounted) return;
    if (choice == 'due') await offline.changeReceipt(receipt.ref, receipt.due!);
    if (choice == 'retry') await offline.retry(receipt.ref);
    if (choice == 'drop') await offline.dropReceipt(receipt.ref);
    if (mounted && offline.online != false && choice != 'drop') await _syncNow();
  }

  Future<void> _takePayment() async {
    final kit = offline.kit;
    final options = <(String, String, num)>[
      for (final bill in offline.bills)
        if (bill.status != EntryStatus.synced && bill.voided == null && bill.payment == null) (bill.id, bill.partyName, bill.total),
      for (final invoice in kit?.openInvoices ?? const <KitInvoice>[]) (invoice.id, invoice.partyName, invoice.due),
    ];
    if (options.isEmpty) {
      setState(() => _message = 'Nothing on this phone has money due.');
      return;
    }
    final picked = await showModalBottomSheet<(String, String, num)>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            ListTile(title: Text(inText(context, 'Which bill is being paid?'))),
            for (final option in options) ListTile(title: Text('${option.$1} · ${option.$2}'), subtitle: Text('Due ${rupees(option.$3)}'), onTap: () => Navigator.of(sheet).pop(option)),
          ],
        ),
      ),
    );
    if (picked == null || !mounted) return;
    final typed = await _ask('Amount received', 'Amount', initial: picked.$3.toStringAsFixed(2), keyboard: const TextInputType.numberWithOptions(decimal: true));
    if (typed == null || !mounted) return;
    final amount = parseAmount(typed);
    if (amount == null) {
      setState(() => _message = 'Enter the amount received.');
      return;
    }
    setState(() => _busy = true);
    try {
      final proposed = await api.propose('record_receipt', {'invoiceId': picked.$1, 'amount': amount, 'mode': 'cash', 'date': isoDate(AppScope.of(context).now())});
      final preview = proposed.preview;
      if (preview == null) {
        if (mounted) setState(() => _message = proposed.reply);
        return;
      }
      final done = await api.confirm(preview.token);
      if (mounted) setState(() => _message = done.reply);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _message = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final books = AppScope.of(context).offline;
    final text = Theme.of(context).textTheme;
    if (books == null) return Scaffold(appBar: AppBar(title: Text(inText(context, 'Offline bills'))), body: Center(child: Text(inText(context, 'Offline billing is for MyCA India.'))));
    return Scaffold(
      appBar: AppBar(title: Text(inText(context, 'Offline bills'))),
      body: ListenableBuilder(
        listenable: books,
        builder: (context, _) {
          final bills = books.bills.reversed.toList();
          final receipts = books.receipts.reversed.toList();
          final needs = [...bills.where((b) => b.status == EntryStatus.conflict || b.status == EntryStatus.rejected)];
          final needReceipts = [...receipts.where((r) => r.status == EntryStatus.conflict || r.status == EntryStatus.rejected)];
          final waiting = bills.where((b) => b.status == EntryStatus.waiting).toList();
          final waitingReceipts = receipts.where((r) => r.status == EntryStatus.waiting).toList();
          final synced = bills.where((b) => b.status == EntryStatus.synced).take(50).toList();
          final series = books.series;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        key: const Key('offline-status'),
                        books.online == false ? inText(context, 'No connection. You can keep billing; bills are saved on this phone.') : inText(context, 'Connected. Bills made without a connection sync by themselves.'),
                        style: text.titleMedium,
                      ),
                      const SizedBox(height: 4),
                      if (series != null) Text('This phone numbers its offline bills INV-${series.code}${fyCodeOf(isoDate(AppScope.of(context).now()))}-0001 onwards.', style: text.bodyMedium),
                      if (!books.ready) Text(inText(context, 'Not set up yet: open MyCA once with a connection and this phone sets itself up for offline billing.'), style: text.bodyMedium),
                      Text('Items and customers saved ${_time(books.kitAt)}. Last sync ${_time(books.lastSyncAt)}.', style: text.bodySmall),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: [
                          FilledButton.icon(key: const Key('offline-sync'), onPressed: _busy || books.syncing ? null : _syncNow, icon: const Icon(Icons.sync), label: Text(books.syncing ? inText(context, 'Syncing…') : inText(context, 'Sync now'))),
                          OutlinedButton.icon(key: const Key('offline-take-payment'), onPressed: _busy ? null : _takePayment, icon: const Icon(Icons.payments_outlined), label: Text(inText(context, 'Take a payment'))),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              if (_message.isNotEmpty || books.lastSyncMessage.isNotEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Text(_message.isNotEmpty ? _message : books.lastSyncMessage, key: const Key('offline-message'), style: text.bodyMedium)),
              if (needs.isNotEmpty || needReceipts.isNotEmpty) ...[
                _Heading(inText(context, 'Needs you')),
                for (final bill in needs) _BillTile(bill: bill, onTap: () => _billActions(bill)),
                for (final receipt in needReceipts) _ReceiptTile(receipt: receipt, onTap: () => _receiptActions(receipt)),
              ],
              if (waiting.isNotEmpty || waitingReceipts.isNotEmpty) ...[
                _Heading(inText(context, 'Waiting to sync')),
                for (final bill in waiting) _BillTile(bill: bill, onTap: () => _billActions(bill)),
                for (final receipt in waitingReceipts) _ReceiptTile(receipt: receipt, onTap: () => _receiptActions(receipt)),
              ],
              if (synced.isNotEmpty) ...[
                _Heading(inText(context, 'In your books')),
                for (final bill in synced) _BillTile(bill: bill, onTap: () => _billActions(bill)),
              ],
              if (bills.isEmpty && receipts.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: Text(inText(context, 'No offline bills. When there is no connection, Counter sale and sales in a customer\'s thread save bills here.'), textAlign: TextAlign.center)),
            ],
          );
        },
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.fromLTRB(4, 16, 4, 4), child: Text(text, style: Theme.of(context).textTheme.titleSmall));
}

class _BillTile extends StatelessWidget {
  const _BillTile({required this.bill, required this.onTap});

  final OfflineBill bill;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final problem = bill.status == EntryStatus.conflict || bill.status == EntryStatus.rejected;
    return Card(
      child: ListTile(
        key: Key('offline-bill-${bill.id}'),
        onTap: onTap,
        leading: Icon(problem ? Icons.error_outline : bill.status == EntryStatus.synced ? Icons.cloud_done_outlined : Icons.cloud_upload_outlined, color: problem ? Theme.of(context).colorScheme.error : null),
        title: Text('${bill.id} · ${rupees(bill.total)}'),
        subtitle: Text([bill.partyName, bill.date, if (bill.voided != null) 'cancelled', if (bill.payment != null) 'paid by ${bill.payment!['mode']}', if (bill.reprintNeeded) 'reprint needed', if (problem) offlineProblemWords(bill.error, '')].join(' · ')),
      ),
    );
  }
}

class _ReceiptTile extends StatelessWidget {
  const _ReceiptTile({required this.receipt, required this.onTap});

  final OfflineReceipt receipt;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      onTap: onTap,
      leading: const Icon(Icons.payments_outlined),
      title: Text('${rupees(receipt.amount)} received against ${receipt.invoiceId}'),
      subtitle: Text([receipt.partyName, receipt.date, receipt.mode, if (receipt.status != EntryStatus.waiting) offlineProblemWords(receipt.error, '')].join(' · ')),
    ),
  );
}
