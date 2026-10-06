import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../invoice_pdf.dart';
import '../proposal_flow.dart';
import '../widgets.dart';
import 'ca_screen.dart';
import 'reminders_screen.dart';
import '../theme.dart';

const _missingWords = {
  'SELLER_GSTIN': 'your GSTIN',
  'SELLER_ADDRESS': 'your business address',
  'HSN': 'an HSN or SAC code on every item',
};

String missingNote(List<String> codes) {
  final words = [
    for (final code in codes)
      _missingWords[code] ?? code.toLowerCase().replaceAll('_', ' '),
  ];
  if (words.isEmpty) return '';
  final list = words.length == 1
      ? words.single
      : '${words.sublist(0, words.length - 1).join(', ')} and ${words.last}';
  return 'This invoice does not carry $list. Check with your CA whether your buyer needs it before you send this.';
}

class InvoiceScreen extends StatefulWidget {
  const InvoiceScreen({super.key, required this.invoiceId});

  final String invoiceId;

  @override
  State<InvoiceScreen> createState() => _InvoiceScreenState();
}

class _InvoiceScreenState extends State<InvoiceScreen> with ProposalFlow {
  final _scroll = ScrollController();
  Future<InvoiceDocument?>? _document;
  bool _busy = false;
  String _note = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _document ??= _load();
  }

  Future<InvoiceDocument?> _load() async {
    final body = await AppScope.of(
      context,
    ).api.query('invoice_document', {'id': widget.invoiceId});
    return InvoiceDocument.fromTool(body);
  }

  void _reload() {
    final next = _load();
    setState(() {
      _document = next;
    });
  }

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  void onThreadChanged() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Future<void> onPosted() async {
    await AppScope.of(context).refresh();
    if (mounted) _reload();
  }

  Future<void> _creditNote(InvoiceDocument doc) async {
    final result = await showModalBottomSheet<(num?, String)>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => _CreditNoteSheet(doc: doc),
    );
    if (result == null || !mounted) return;
    final (amount, reason) = result;
    await propose(
      amount == null
          ? 'Credit note for the whole of ${doc.id}: $reason'
          : 'Credit note of ${rupees(amount)} against ${doc.id}: $reason',
      'create_credit_note',
      {
        'invoiceId': doc.id,
        'date': isoDate(AppScope.of(context).now()),
        'reason': reason,
        'amount': ?amount,
      },
    );
  }

  Future<void> _askCa(InvoiceDocument doc) async {
    final reply = await askMyCa(
      context,
      subject: {'kind': 'invoice', 'id': doc.id},
      about: 'invoice ${doc.id} to ${doc.buyerName}',
    );
    if (!mounted || reply.isEmpty) return;
    setState(() => _note = reply);
  }

  Future<void> _remind(InvoiceDocument doc) async {
    final draft = await showReminderSheet(
      context,
      text: 'Follow up payment from ${doc.buyerName}',
    );
    if (draft == null || !mounted) return;
    await propose('Remind me: ${draft.text}', 'add_reminder', {
      'text': draft.text,
      'due': draft.due,
      'invoiceId': doc.id,
    });
  }

  Future<void> _cancel(InvoiceDocument doc) async {
    final reason = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => _CancelSheet(doc: doc),
    );
    if (reason == null || !mounted) return;
    await propose(
      'Cancel ${doc.id}${reason.isEmpty ? '' : ': $reason'}',
      'cancel_invoice',
      {
        'invoiceId': doc.id,
        'date': isoDate(AppScope.of(context).now()),
        if (reason.isNotEmpty) 'reason': reason,
      },
    );
  }

  Future<void> _send(InvoiceDocument doc, {required bool share}) async {
    final pdf = AppScope.of(context).pdf;
    setState(() {
      _busy = true;
      _note = '';
    });
    var note = '';
    try {
      final bytes = await buildInvoicePdf(
        doc,
        regular: await pdf.loadAsset(invoiceFontRegular),
        bold: await pdf.loadAsset(invoiceFontBold),
      );
      final done = await (share ? pdf.share : pdf.print)(
        invoiceFileName(doc),
        bytes,
      );
      if (share) {
        note = done
            ? 'Handed to the app you chose. MyCA cannot see whether it was delivered.'
            : 'Not sent.';
      }
    } on Object {
      note = 'The PDF could not be prepared on this phone.';
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _note = note;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Invoice ${widget.invoiceId}')),
      body: FutureBuilder<InvoiceDocument?>(
        future: _document,
        builder: (context, state) {
          if (state.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final doc = state.data;
          if (doc == null) {
            final error = state.error;
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      error is MycaApiException
                          ? error.message
                          : 'This invoice could not be opened.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _reload,
                      child: const Text('Try again'),
                    ),
                  ],
                ),
              ),
            );
          }
          return Column(
            children: [
              Expanded(
                child: _InvoiceBody(
                  doc: doc,
                  busy: _busy || busy,
                  note: _note,
                  thread: [for (final entry in entries) entry.toBubble()],
                  scroll: _scroll,
                  onShare: () => _send(doc, share: true),
                  onPrint: () => _send(doc, share: false),
                  onCreditNote: doc.cancelled || doc.balance + doc.received <= 0
                      ? null
                      : () => _creditNote(doc),
                  onCancel: doc.cancelled || doc.credited > 0
                      ? null
                      : () => _cancel(doc),
                  onAskCa: () => _askCa(doc),
                  onRemind: doc.cancelled || doc.balance <= 0
                      ? null
                      : () => _remind(doc),
                ),
              ),
              if (pending != null)
                ProposalBar(
                  busy: busy,
                  onPost: postPending,
                  onDiscard: discardPending,
                ),
            ],
          );
        },
      ),
    );
  }
}

class _InvoiceBody extends StatelessWidget {
  const _InvoiceBody({
    required this.doc,
    required this.busy,
    required this.note,
    required this.thread,
    required this.scroll,
    required this.onShare,
    required this.onPrint,
    required this.onCreditNote,
    required this.onCancel,
    required this.onRemind,
    required this.onAskCa,
  });

  final InvoiceDocument doc;
  final bool busy;
  final String note;
  final List<Widget> thread;
  final ScrollController scroll;
  final VoidCallback onShare;
  final VoidCallback onPrint;
  final VoidCallback? onCreditNote;
  final VoidCallback? onCancel;
  final VoidCallback? onRemind;
  final VoidCallback? onAskCa;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final money = text.bodyLarge?.copyWith(fontFeatures: moneyFigures);
    final missing = missingNote(doc.missing);
    return ListView(
      controller: scroll,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
      children: [
        if (doc.cancelled)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              'This invoice is cancelled by a credit note. It stays in your books and in the return for its month.',
              style: text.bodyMedium?.copyWith(
                color: Palette.danger,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        _Sheet(
          children: [
            Text(doc.title.toUpperCase(), style: text.labelSmall),
            const SizedBox(height: 6),
            Text(doc.sellerName, style: text.titleLarge),
            if (doc.sellerAddress.isNotEmpty)
              Text(doc.sellerAddress, style: text.bodySmall),
            if (doc.sellerGstin.isNotEmpty)
              Text('GSTIN ${doc.sellerGstin}', style: text.bodyMedium),
            const SizedBox(height: 14),
            const Divider(),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('BILL TO', style: text.labelSmall),
                      const SizedBox(height: 2),
                      Text(doc.buyerName, style: text.titleMedium),
                      if (doc.buyerGstin.isNotEmpty)
                        Text('GSTIN ${doc.buyerGstin}', style: text.bodySmall),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('DATED', style: text.labelSmall),
                    const SizedBox(height: 2),
                    Text(longDate(doc.date), style: text.bodyMedium),
                  ],
                ),
              ],
            ),
            if (doc.dueDate.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text('PAYMENT DUE', style: text.labelSmall),
              const SizedBox(height: 2),
              Text(
                '${longDate(doc.dueDate)} (${termsLabel(doc.termsDays)})',
                style: text.bodyMedium,
              ),
              if (dueWords(
                doc.dueDate,
                AppScope.of(context).now(),
                open: !doc.cancelled && doc.balance > 0,
              ).startsWith('Overdue'))
                Text(
                  dueWords(doc.dueDate, AppScope.of(context).now(), open: true),
                  style: text.bodyMedium?.copyWith(
                    color: Palette.danger,
                    fontWeight: FontWeight.w500,
                  ),
                ),
            ],
            if (doc.placeOfSupply.label.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text('PLACE OF SUPPLY', style: text.labelSmall),
              const SizedBox(height: 2),
              Text(doc.placeOfSupply.label, style: text.bodyMedium),
            ],
          ],
        ),
        const SizedBox(height: 12),
        _Sheet(
          children: [
            for (final line in doc.lines) ...[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      line.description.isEmpty ? 'Item' : line.description,
                      style: text.titleMedium,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    rupees(line.amount),
                    style: text.titleMedium?.copyWith(
                      fontFeatures: moneyFigures,
                    ),
                  ),
                ],
              ),
              Text(
                [
                  '${plainNumber(line.qty)} × ${rupees(line.rate)}',
                  'GST ${plainNumber(line.gstRate)}%',
                  if (line.hsn.isNotEmpty) 'HSN ${line.hsn}',
                ].join(' · '),
                style: text.bodySmall?.copyWith(fontFeatures: moneyFigures),
              ),
              const SizedBox(height: 12),
            ],
            const Divider(),
            const SizedBox(height: 10),
            _Amount(name: 'Taxable value', amount: doc.taxable, style: money),
            for (final (name, amount) in doc.taxHeads)
              _Amount(name: name, amount: amount, style: money),
            const SizedBox(height: 6),
            _Amount(
              name: 'Total',
              amount: doc.total,
              style: text.titleLarge?.copyWith(fontFeatures: moneyFigures),
            ),
            if (doc.received > 0 || doc.credited > 0) ...[
              const SizedBox(height: 6),
              if (doc.received > 0)
                _Amount(name: 'Received', amount: doc.received, style: money),
              if (doc.credited > 0)
                _Amount(
                  name: 'Credited back',
                  amount: doc.credited,
                  style: money,
                ),
              _Amount(name: 'Balance', amount: doc.balance, style: money),
            ],
            for (final note in doc.creditNotes) ...[
              const SizedBox(height: 8),
              Text(
                '${note.cancels ? 'Cancelled' : 'Credit note ${note.id}'} on ${longDate(note.date)}: ${note.reason}',
                style: text.bodySmall,
              ),
            ],
          ],
        ),
        if (missing.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(missing, style: text.bodyMedium?.copyWith(color: Palette.warn)),
        ],
        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: busy || doc.cancelled ? null : onShare,
            child: Text(busy ? 'Preparing…' : 'Send to ${doc.buyerName}'),
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: busy ? null : onPrint,
            child: const Text('Print or save as PDF'),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          note.isEmpty
              ? 'You choose WhatsApp, email or another app, and it goes from your own account. MyCA sends nothing by itself.'
              : note,
          style: note.isEmpty
              ? text.bodySmall
              : text.bodyMedium?.copyWith(color: Palette.ink),
        ),
        if (onCreditNote != null ||
            onCancel != null ||
            onRemind != null ||
            onAskCa != null) ...[
          const SizedBox(height: 20),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (onRemind != null)
                ActionChip(
                  label: const Text('Remind me'),
                  onPressed: busy ? null : onRemind,
                ),
              if (onAskCa != null)
                ActionChip(
                  label: const Text('Ask my CA'),
                  onPressed: busy ? null : onAskCa,
                ),
              if (onCreditNote != null)
                ActionChip(
                  label: const Text('Credit note'),
                  onPressed: busy ? null : onCreditNote,
                ),
              if (onCancel != null)
                ActionChip(
                  label: const Text('Cancel invoice'),
                  onPressed: busy ? null : onCancel,
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'A credit note or a cancellation reverses the amount with a new entry; the invoice itself is never changed.',
            style: text.bodySmall,
          ),
        ],
        ...thread,
      ],
    );
  }
}

class _CreditNoteSheet extends StatefulWidget {
  const _CreditNoteSheet({required this.doc});

  final InvoiceDocument doc;

  @override
  State<_CreditNoteSheet> createState() => _CreditNoteSheetState();
}

class _CreditNoteSheetState extends State<_CreditNoteSheet> {
  final _amount = TextEditingController();
  final _reason = TextEditingController();
  String _error = '';

  @override
  void dispose() {
    _amount.dispose();
    _reason.dispose();
    super.dispose();
  }

  void _done() {
    final reason = _reason.text.trim();
    if (reason.isEmpty) {
      return setState(() => _error = 'Say why: goods returned, price reduced…');
    }
    final raw = _amount.text.trim();
    num? amount;
    if (raw.isNotEmpty) {
      amount = num.tryParse(raw.replaceAll(',', ''));
      if (amount == null || amount <= 0) {
        return setState(
          () => _error =
              'Enter the amount, or leave it blank for the whole invoice.',
        );
      }
    }
    Navigator.of(context).pop((amount, reason));
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final left = widget.doc.total - widget.doc.credited;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        22,
        4,
        22,
        22 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Credit note against ${widget.doc.id}',
            style: text.headlineSmall,
          ),
          const SizedBox(height: 6),
          Text(
            'Up to ${rupees(left)} including GST. Leave the amount blank to credit the whole invoice.',
            style: text.bodySmall,
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Amount, with GST (optional)',
              prefixText: '₹ ',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _reason,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(labelText: 'Reason'),
          ),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              _error,
              style: const TextStyle(
                color: Palette.danger,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(onPressed: _done, child: const Text('Preview')),
          ),
        ],
      ),
    );
  }
}

class _CancelSheet extends StatefulWidget {
  const _CancelSheet({required this.doc});

  final InvoiceDocument doc;

  @override
  State<_CancelSheet> createState() => _CancelSheetState();
}

class _CancelSheetState extends State<_CancelSheet> {
  final _reason = TextEditingController();

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        22,
        4,
        22,
        22 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Cancel ${widget.doc.id}?', style: text.headlineSmall),
          const SizedBox(height: 6),
          Text(
            widget.doc.received > 0
                ? '${widget.doc.buyerName} has paid ${rupees(widget.doc.received)}; that becomes due back to them.'
                : 'A credit note for the full ${rupees(widget.doc.total)} will be posted. You will see it before anything changes.',
            style: text.bodySmall,
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _reason,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(labelText: 'Reason (optional)'),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () => Navigator.of(context).pop(_reason.text.trim()),
              child: const Text('Preview'),
            ),
          ),
        ],
      ),
    );
  }
}

class _Amount extends StatelessWidget {
  const _Amount({
    required this.name,
    required this.amount,
    required this.style,
  });

  final String name;
  final num amount;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(child: Text(name, style: style)),
          Text(rupees(amount), style: style),
        ],
      ),
    );
  }
}

class _Sheet extends StatelessWidget {
  const _Sheet({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Palette.surface,
        borderRadius: BorderRadius.circular(radiusCard),
        border: Border.all(color: Palette.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: children,
      ),
    );
  }
}
