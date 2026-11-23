import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../invoice_pdf.dart';
import '../proposal_flow.dart';
import '../registers.dart';
import '../widgets.dart';
import 'ca_screen.dart';
import 'reminders_screen.dart';
import '../theme.dart';
import '../uae/uae_strings.dart';

String _missingWord(String lang, String code) => switch (code) {
  'SELLER_GSTIN' => inLine(lang, 'your GSTIN'),
  'SELLER_ADDRESS' => inLine(lang, 'your business address'),
  'HSN' => inLine(lang, 'an HSN or SAC code on every item'),
  _ => code.toLowerCase().replaceAll('_', ' '),
};

String missingNote(List<String> codes, [String lang = 'en']) {
  final words = [for (final code in codes) _missingWord(lang, code)];
  if (words.isEmpty) return '';
  final list = words.length == 1
      ? words.single
      : inFill(inLine(lang, '{first} and {last}'), {'first': words.sublist(0, words.length - 1).join(', '), 'last': words.last});
  return inFill(inLine(lang, 'This invoice does not carry {list}. Check with your CA whether your buyer needs it before you send this.'), {'list': list});
}

String _screenTitle(BuildContext context, bool quote, String id) {
  if (!quote) return inFormat(context, 'Invoice {id}', {'id': id});
  return switch (salesKindOfId(id)) {
    'proforma' => inFormat(context, 'Proforma invoice {id}', {'id': id}),
    'order' => inFormat(context, 'Sales order {id}', {'id': id}),
    'challan' => inFormat(context, 'Delivery challan {id}', {'id': id}),
    _ => inFormat(context, 'Quote {id}', {'id': id}),
  };
}

String _documentTitle(BuildContext context, String title) => switch (title) {
  'Tax invoice' => inText(context, 'Tax invoice'),
  'Invoice' => inText(context, 'Invoice'),
  'Quotation' => inText(context, 'Quotation'),
  'Quote' => inText(context, 'Quote'),
  'Proforma invoice' => inText(context, 'Proforma invoice'),
  'Sales order' => inText(context, 'Sales order'),
  'Delivery challan' => inText(context, 'Delivery challan'),
  _ => title,
};

String _termsWords(BuildContext context, int? days) => days == null
    ? ''
    : days == 0
    ? inText(context, 'Due on receipt')
    : inFormat(context, 'Net {days}', {'days': days});

String _overdueWords(BuildContext context, String dueDate, DateTime today) {
  final parts = dueDate.split('-').map(int.parse).toList();
  final days = DateTime(today.year, today.month, today.day).difference(DateTime(parts[0], parts[1], parts[2])).inDays;
  return inCount(context, days, 'Overdue by 1 day', 'Overdue by {n} days');
}

class InvoiceScreen extends StatefulWidget {
  const InvoiceScreen({super.key, required this.invoiceId, this.quote = false});

  final String invoiceId;
  final bool quote;

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
    final body = await AppScope.of(context).api.query(
      widget.quote ? 'quote_document' : 'invoice_document',
      {'id': widget.invoiceId},
    );
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
    final result = await showModalBottomSheet<(num?, String, bool)>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => _CreditNoteSheet(doc: doc),
    );
    if (result == null || !mounted) return;
    final (amount, reason, restock) = result;
    await propose(
      amount == null
          ? inFormat(context, 'Credit note for the whole of {id}: {reason}', {'id': doc.id, 'reason': reason})
          : inFormat(context, 'Credit note of {amount} against {id}: {reason}', {'amount': rupees(amount), 'id': doc.id, 'reason': reason}),
      'create_credit_note',
      {
        'invoiceId': doc.id,
        'date': isoDate(AppScope.of(context).now()),
        'reason': reason,
        'amount': ?amount,
        if (restock) 'restock': true,
      },
    );
  }

  Future<void> _amend(InvoiceDocument doc) async {
    final result = await showModalBottomSheet<Map<String, Object?>>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => _AmendSheet(doc: doc),
    );
    if (result == null || !mounted) return;
    await propose(inFormat(context, 'Amend {id}: {reason}', {'id': doc.id, 'reason': '${result['reason']}'}), 'amend_invoice', {'invoiceId': doc.id, ...result});
  }

  Future<void> _transport(InvoiceDocument doc) async {
    final result = await showModalBottomSheet<Map<String, Object?>>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => _TransportSheet(doc: doc),
    );
    if (result == null || !mounted) return;
    await propose(
      inFormat(context, 'Transport for {id}: {vehicle} {km} km', {'id': doc.id, 'vehicle': result['vehicleNo'] ?? '', 'km': '${result['distanceKm']}'}),
      'set_transport',
      {'invoiceId': doc.id, ...result},
    );
  }

  Future<void> _einvoice(InvoiceDocument doc) async {
    final cloud = AppScope.of(context).cloud;
    if (cloud == null) {
      await propose(inFormat(context, 'Generate the e-invoice (IRN) for {id}', {'id': doc.id}), 'govt_generate_irn', {
        'invoiceId': doc.id,
      });
      return;
    }
    setState(() => _busy = true);
    try {
      var out = await cloud.generateEinvoice(doc.id);
      if (out.error == 'APPROVAL_REQUIRED') {
        final pending = await cloud.pendingEinvoiceApprovals(doc.id);
        if (pending.isEmpty) {
          await cloud.requestEinvoiceApproval(doc.id);
          if (mounted) setState(() => _note = inText(context, 'This business is in live mode, so a real IRN needs a second person. Asked for approval: an owner or your accountant opens this invoice and taps Generate e-invoice to approve it.'));
          return;
        }
        final decided = await cloud.approve('${pending.first['approvalId']}');
        if (decided['error'] == 'MAKER_CHECKER_VIOLATION') {
          if (mounted) setState(() => _note = inText(context, 'Waiting for an owner or your accountant, other than you, to approve this e-invoice.'));
          return;
        }
        if (decided['ok'] != true) {
          if (mounted) setState(() => _note = cloudMessage('${decided['error'] ?? 'UNKNOWN'}', '${decided['hint'] ?? ''}'));
          return;
        }
        out = await cloud.generateEinvoice(doc.id);
      }
      if (!mounted) return;
      setState(() => _note = out.ok
          ? (out.sandbox ? inText(context, 'Sandbox IRN issued on the NIC test IRP. It is not valid for a real supply.') : inFormat(context, 'IRN issued: {irn}', {'irn': out.irn}))
          : cloudMessage(out.error, out.hint));
      if (out.ok) _reload();
    } on MycaApiException catch (error) {
      if (mounted) setState(() => _note = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _ewayBill(InvoiceDocument doc) async {
    await propose(inFormat(context, 'Generate the e-way bill for {id}', {'id': doc.id}), 'govt_generate_ewb', {
      'invoiceId': doc.id,
    });
  }

  Future<void> _debitNote(InvoiceDocument doc) async {
    final result = await showModalBottomSheet<(num?, String, bool)>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => _CreditNoteSheet(doc: doc, debit: true),
    );
    if (result == null || !mounted) return;
    final (amount, reason, _) = result;
    await propose(
      inFormat(context, 'Debit note of {amount} against {id}: {reason}', {'amount': rupees(amount ?? 0), 'id': doc.id, 'reason': reason}),
      'create_debit_note',
      {
        'invoiceId': doc.id,
        'date': isoDate(AppScope.of(context).now()),
        'reason': reason,
        'amount': amount,
      },
    );
  }

  Future<void> _askCa(InvoiceDocument doc) async {
    final reply = await askMyCa(
      context,
      subject: {'kind': 'invoice', 'id': doc.id},
      about: inFormat(context, 'invoice {id} to {name}', {'id': doc.id, 'name': doc.buyerName}),
    );
    if (!mounted || reply.isEmpty) return;
    setState(() => _note = reply);
  }

  Future<void> _remind(InvoiceDocument doc) async {
    final draft = await showReminderSheet(
      context,
      text: inFormat(context, 'Follow up payment from {name}', {'name': doc.buyerName}),
    );
    if (draft == null || !mounted) return;
    await propose(UaeStrings.of(context).remindSaid(draft.text), 'add_reminder', {
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
      reason.isEmpty ? inFormat(context, 'Cancel {id}', {'id': doc.id}) : inFormat(context, 'Cancel {id}: {reason}', {'id': doc.id, 'reason': reason}),
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
    final api = AppScope.of(context).api;
    final lang = indiaLang(context);
    setState(() {
      _busy = true;
      _note = '';
    });
    var note = '';
    var recorded = false;
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
            ? inLine(lang, 'Handed to the app you chose. MyCA cannot see whether it was delivered.')
            : inLine(lang, 'Not sent.');
      }
      try {
        await api.query('record_share', {
          'invoiceId': doc.id,
          'channel': share ? 'share_sheet' : 'print',
          'outcome': !done ? 'cancelled' : share ? 'shared' : 'printed',
        });
        recorded = done;
      } on Object {
        note = inFill(inLine(lang, '{note} Could not note the share in the audit log.'), {'note': note}).trim();
      }
    } on Object {
      note = inLine(lang, 'The PDF could not be prepared on this phone.');
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _note = note;
    });
    if (recorded) _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_screenTitle(context, widget.quote, widget.invoiceId)),
      ),
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
                          : inText(context, 'This invoice could not be opened.'),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _reload,
                      child: Text(inText(context, 'Try again')),
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
                  onCreditNote:
                      doc.isQuote ||
                          doc.cancelled ||
                          doc.balance + doc.received <= 0
                      ? null
                      : () => _creditNote(doc),
                  onDebitNote: doc.isQuote || doc.cancelled
                      ? null
                      : () => _debitNote(doc),
                  onAmend: doc.isQuote || doc.cancelled || doc.country == 'US'
                      ? null
                      : () => _amend(doc),
                  onTransport: doc.isQuote || doc.cancelled || doc.ewayBill?.needed != true
                      ? null
                      : () => _transport(doc),
                  onEwayBill: doc.ewayBill?.status == 'ready' ? () => _ewayBill(doc) : null,
                  onEinvoice: doc.einvoice?.status == 'ready' || (AppScope.of(context).cloud != null && doc.einvoice?.status == 'sandbox') ? () => _einvoice(doc) : null,
                  onCancel: doc.isQuote || doc.cancelled || doc.credited > 0
                      ? null
                      : () => _cancel(doc),
                  onAskCa: doc.isQuote ? null : () => _askCa(doc),
                  onRemind: doc.isQuote || doc.cancelled || doc.balance <= 0
                      ? null
                      : () => _remind(doc),
                  onAccept:
                      doc.canAccept &&
                          (doc.status == 'open' || doc.status == 'expired')
                      ? () => propose(inFormat(context, '{id} accepted', {'id': doc.id}), 'mark_quote', {
                          'id': doc.id,
                          'outcome': 'accepted',
                        })
                      : null,
                  onDecline:
                      doc.canAccept &&
                          (doc.status == 'open' || doc.status == 'expired')
                      ? () => propose(inFormat(context, '{id} declined', {'id': doc.id}), 'mark_quote', {
                          'id': doc.id,
                          'outcome': 'declined',
                        })
                      : null,
                  onReturned: doc.canReturn && doc.status == 'open'
                      ? () => propose(inFormat(context, '{id} came back', {'id': doc.id}), 'mark_quote', {
                          'id': doc.id,
                          'outcome': 'returned',
                        })
                      : null,
                  onCancelDocument: doc.canCancelOrder && doc.status == 'open'
                      ? () => propose(inFormat(context, 'Cancel {id}', {'id': doc.id}), 'mark_quote', {
                          'id': doc.id,
                          'outcome': 'cancelled',
                        })
                      : null,
                  onMakeInvoice:
                      doc.canInvoice &&
                          doc.status != 'declined' &&
                          doc.status != 'invoiced' &&
                          doc.status != 'cancelled' &&
                          doc.status != 'returned'
                      ? () => propose(
                          inFormat(context, 'Make {id} an invoice', {'id': doc.id}),
                          'convert_quote',
                          {
                            'id': doc.id,
                            'date': isoDate(AppScope.of(context).now()),
                          },
                        )
                      : null,
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
    required this.onDebitNote,
    this.onAmend,
    required this.onTransport,
    required this.onEwayBill,
    this.onEinvoice,
    required this.onCancel,
    required this.onRemind,
    required this.onAskCa,
    this.onAccept,
    this.onDecline,
    this.onMakeInvoice,
    this.onReturned,
    this.onCancelDocument,
  });

  final InvoiceDocument doc;
  final bool busy;
  final String note;
  final List<Widget> thread;
  final ScrollController scroll;
  final VoidCallback onShare;
  final VoidCallback onPrint;
  final VoidCallback? onCreditNote;
  final VoidCallback? onDebitNote;
  final VoidCallback? onAmend;
  final VoidCallback? onTransport;
  final VoidCallback? onEwayBill;
  final VoidCallback? onEinvoice;
  final VoidCallback? onCancel;
  final VoidCallback? onRemind;
  final VoidCallback? onAskCa;
  final VoidCallback? onAccept;
  final VoidCallback? onDecline;
  final VoidCallback? onMakeInvoice;
  final VoidCallback? onReturned;
  final VoidCallback? onCancelDocument;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final money = text.bodyLarge?.copyWith(fontFeatures: moneyFigures);
    final missing = missingNote(doc.missing, indiaLang(context));
    return ListView(
      controller: scroll,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
      children: [
        if (doc.cancelled)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              inText(context, 'This invoice is cancelled by a credit note. It stays in your books and in the return for its month.'),
              style: text.bodyMedium?.copyWith(
                color: Palette.danger,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        _Sheet(
          children: [
            Text(_documentTitle(context, doc.title).toUpperCase(), style: text.labelSmall),
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
                      Text(doc.isQuote ? inText(context, 'QUOTED TO') : inText(context, 'BILL TO'), style: text.labelSmall),
                      const SizedBox(height: 2),
                      Text(doc.buyerName, style: text.titleMedium),
                      if (doc.buyerAddress.isNotEmpty)
                        Text(doc.buyerAddress, style: text.bodySmall),
                      if (doc.buyerGstin.isNotEmpty)
                        Text('GSTIN ${doc.buyerGstin}', style: text.bodySmall),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Flexible(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(inText(context, 'DATED'), style: text.labelSmall),
                      const SizedBox(height: 2),
                      Text(longDate(doc.date), textAlign: TextAlign.end, style: text.bodyMedium),
                    ],
                  ),
                ),
              ],
            ),
            if (doc.isQuote) ...[
              const SizedBox(height: 12),
              Text(inText(context, 'VALID UNTIL'), style: text.labelSmall),
              const SizedBox(height: 2),
              Text(longDate(doc.validUntil), style: text.bodyMedium),
              Text(
                switch (doc.status) {
                  'accepted' => inText(context, 'Accepted by the customer'),
                  'declined' => inText(context, 'Declined by the customer'),
                  'invoiced' => inFormat(context, 'Invoiced as {id}', {'id': doc.linkedId}),
                  'expired' => inText(context, 'Expired'),
                  _ => inText(context, 'Open'),
                },
                style: text.bodyMedium?.copyWith(
                  color: doc.status == 'declined' || doc.status == 'expired'
                      ? Palette.warn
                      : Palette.accent,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
            if (doc.dueDate.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(inText(context, 'PAYMENT DUE'), style: text.labelSmall),
              const SizedBox(height: 2),
              Text(
                '${longDate(doc.dueDate)} (${_termsWords(context, doc.termsDays)})',
                style: text.bodyMedium,
              ),
              if (dueWords(
                doc.dueDate,
                AppScope.of(context).now(),
                open: !doc.cancelled && doc.balance > 0,
              ).startsWith('Overdue'))
                Text(
                  _overdueWords(context, doc.dueDate, AppScope.of(context).now()),
                  style: text.bodyMedium?.copyWith(
                    color: Palette.danger,
                    fontWeight: FontWeight.w500,
                  ),
                ),
            ],
            if (doc.placeOfSupply.label.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(inText(context, 'PLACE OF SUPPLY'), style: text.labelSmall),
              const SizedBox(height: 2),
              Text(doc.placeOfSupply.label, style: text.bodyMedium),
            ],
          ],
        ),
        const SizedBox(height: 12),
        _Sheet(
          children: [
            for (final line in doc.lines) ...[
              AmountRow(
                align: CrossAxisAlignment.start,
                start: Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: Text(
                    line.description.isEmpty ? inText(context, 'Item') : line.description,
                    style: text.titleMedium,
                  ),
                ),
                amount: rupees(line.amount),
                style: text.titleMedium?.copyWith(
                  fontFeatures: moneyFigures,
                ),
              ),
              Text(
                [
                  '${plainNumber(line.qty)} × ${rupees(line.rate)}',
                  if (doc.isUs)
                    (line.taxRate > 0 ? 'tax ${plainNumber(line.taxRate)}%' : 'not taxed')
                  else
                    'GST ${plainNumber(line.gstRate)}%',
                  if (line.hsn.isNotEmpty) 'HSN ${line.hsn}',
                ].join(' · '),
                style: text.bodySmall?.copyWith(fontFeatures: moneyFigures),
              ),
              const SizedBox(height: 12),
            ],
            const Divider(),
            const SizedBox(height: 10),
            _Amount(name: doc.isUs ? doc.subtotalLabel : inText(context, 'Taxable value'), amount: doc.taxable, style: money),
            for (final (name, amount) in doc.taxHeads)
              _Amount(name: name, amount: amount, style: money),
            const SizedBox(height: 6),
            _Amount(
              name: inText(context, 'Total'),
              amount: doc.total,
              style: text.titleLarge?.copyWith(fontFeatures: moneyFigures),
            ),
            if (doc.received > 0 || doc.credited > 0 || doc.debited > 0) ...[
              const SizedBox(height: 6),
              if (doc.debited > 0)
                _Amount(name: inText(context, 'Added by debit note'), amount: doc.debited, style: money),
              if (doc.received > 0)
                _Amount(name: inText(context, 'Received'), amount: doc.received, style: money),
              if (doc.credited > 0)
                _Amount(
                  name: inText(context, 'Credited back'),
                  amount: doc.credited,
                  style: money,
                ),
              _Amount(name: inText(context, 'Balance'), amount: doc.balance, style: money),
            ],
            for (final note in doc.creditNotes) ...[
              const SizedBox(height: 8),
              Text(
                note.cancels
                    ? inFormat(context, 'Cancelled on {date}: {reason}', {'date': longDate(note.date), 'reason': note.reason})
                    : inFormat(context, 'Credit note {id} on {date}: {reason}', {'id': note.id, 'date': longDate(note.date), 'reason': note.reason}),
                style: text.bodySmall,
              ),
            ],
            for (final note in doc.debitNotes) ...[
              const SizedBox(height: 8),
              Text(
                inFormat(context, 'Debit note {id} on {date}: {reason}', {'id': note.id, 'date': longDate(note.date), 'reason': note.reason}),
                style: text.bodySmall,
              ),
            ],
          ],
        ),
        if (missing.isNotEmpty) ...[
          const SizedBox(height: 12),
          Text(missing, style: text.bodyMedium?.copyWith(color: Palette.warn)),
        ],
        if (doc.einvoice case final ei? when ei.status != 'not-applicable') ...[
          const SizedBox(height: 16),
          _Sheet(
            children: [
              Text(inText(context, 'E-INVOICE'), style: text.labelSmall),
              const SizedBox(height: 6),
              Text(
                ei.status == 'issued'
                    ? 'IRN ${ei.irn}'
                    : ei.status == 'mock'
                    ? inFormat(context, 'Simulated IRN {irn}…', {'irn': ei.irn.length > 12 ? ei.irn.substring(0, 12) : ei.irn})
                    : ei.status == 'sandbox'
                    ? inFormat(context, 'Sandbox IRN {irn}…', {'irn': ei.irn.length > 12 ? ei.irn.substring(0, 12) : ei.irn})
                    : inText(context, 'No IRN yet'),
                style: text.titleMedium,
              ),
              const SizedBox(height: 4),
              Text(ei.why, style: text.bodySmall),
              if (onEinvoice != null) ...[
                const SizedBox(height: 10),
                ActionChip(
                  label: Text(inText(context, 'Generate e-invoice')),
                  onPressed: busy ? null : onEinvoice,
                ),
              ],
            ],
          ),
        ],
        if (doc.ewayBill case final ewb? when ewb.needed) ...[
          const SizedBox(height: 16),
          _Sheet(
            children: [
              Text(inText(context, 'E-WAY BILL'), style: text.labelSmall),
              const SizedBox(height: 6),
              Text(
                ewb.ewbNo.isNotEmpty
                    ? ewb.ewbValidity.isEmpty
                          ? inFormat(context, 'E-way bill {number}', {'number': ewb.ewbNo})
                          : inFormat(context, 'E-way bill {number}, valid till {validity}', {'number': ewb.ewbNo, 'validity': ewb.ewbValidity})
                    : inText(context, 'Needed for this invoice'),
                style: text.titleMedium,
              ),
              const SizedBox(height: 4),
              Text(ewb.why, style: text.bodySmall),
              if (ewb.transportWords.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(inFormat(context, 'Transport: {words}', {'words': ewb.transportWords}), style: text.bodyMedium),
              ],
              if (ewb.next.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(ewb.next, style: text.bodySmall),
              ],
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                children: [
                  if (onTransport != null)
                    ActionChip(
                      label: Text(ewb.transportWords.isEmpty ? inText(context, 'Add transport details') : inText(context, 'Change transport')),
                      onPressed: busy ? null : onTransport,
                    ),
                  if (onEwayBill != null)
                    ActionChip(
                      label: Text(inText(context, 'Generate e-way bill')),
                      onPressed: busy ? null : onEwayBill,
                    ),
                ],
              ),
            ],
          ),
        ],
        if (doc.shares.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(
            inCount(context, doc.shares.length, 'Shared once, last on {date}. Delivery is not something MyCA can know.', 'Shared {n} times, last on {date}. Delivery is not something MyCA can know.', {
              'date': longDate(doc.shares.last.on.length >= 10 ? doc.shares.last.on.substring(0, 10) : doc.shares.last.on),
            }),
            style: text.bodySmall,
          ),
        ],
        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: busy || doc.cancelled ? null : onShare,
            child: Text(busy ? inText(context, 'Preparing…') : inFormat(context, 'Send to {name}', {'name': doc.buyerName})),
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: busy ? null : onPrint,
            child: Text(inText(context, 'Print or save as PDF')),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          note.isEmpty
              ? inText(context, 'You choose WhatsApp, email or another app, and it goes from your own account. MyCA sends nothing by itself.')
              : note,
          style: note.isEmpty
              ? text.bodySmall
              : text.bodyMedium?.copyWith(color: Palette.ink),
        ),
        if (onAmend != null) ...[
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: ActionChip(
              label: Text(inText(context, 'Amend after filing')),
              onPressed: busy ? null : onAmend,
            ),
          ),
        ],
        if (onMakeInvoice != null || onAccept != null || onDecline != null || onReturned != null || onCancelDocument != null) ...[
          const SizedBox(height: 20),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (onMakeInvoice != null)
                ActionChip(
                  label: Text(inText(context, 'Make invoice')),
                  onPressed: busy ? null : onMakeInvoice,
                ),
              if (onAccept != null)
                ActionChip(
                  label: Text(inText(context, 'Accepted')),
                  onPressed: busy ? null : onAccept,
                ),
              if (onDecline != null)
                ActionChip(
                  label: Text(inText(context, 'Declined')),
                  onPressed: busy ? null : onDecline,
                ),
              if (onReturned != null)
                ActionChip(
                  label: Text(inText(context, 'Goods came back')),
                  onPressed: busy ? null : onReturned,
                ),
              if (onCancelDocument != null)
                ActionChip(
                  label: Text(inText(context, 'Cancel')),
                  onPressed: busy ? null : onCancelDocument,
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            inText(context, 'This posts nothing to your books. Making the invoice posts it, with the same lines.'),
            style: text.bodySmall,
          ),
        ],
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
                  label: Text(inText(context, 'Remind me')),
                  onPressed: busy ? null : onRemind,
                ),
              if (onAskCa != null)
                ActionChip(
                  label: Text(plainAccountant(context) ? 'Ask my accountant' : inText(context, 'Ask my CA')),
                  onPressed: busy ? null : onAskCa,
                ),
              if (onCreditNote != null)
                ActionChip(
                  label: Text(inText(context, 'Credit note')),
                  onPressed: busy ? null : onCreditNote,
                ),
              if (onDebitNote != null)
                ActionChip(
                  label: Text(inText(context, 'Debit note')),
                  onPressed: busy ? null : onDebitNote,
                ),
              if (onCancel != null)
                ActionChip(
                  label: Text(inText(context, 'Cancel invoice')),
                  onPressed: busy ? null : onCancel,
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            inText(context, 'A credit note, a debit note or a cancellation changes the amount with a new entry; the invoice itself is never changed.'),
            style: text.bodySmall,
          ),
        ],
        ...thread,
      ],
    );
  }
}

class _TransportSheet extends StatefulWidget {
  const _TransportSheet({required this.doc});

  final InvoiceDocument doc;

  @override
  State<_TransportSheet> createState() => _TransportSheetState();
}

class _TransportSheetState extends State<_TransportSheet> {
  final _vehicle = TextEditingController();
  final _distance = TextEditingController();
  final _transporter = TextEditingController();
  String _mode = 'road';
  String _error = '';

  @override
  void dispose() {
    _vehicle.dispose();
    _distance.dispose();
    _transporter.dispose();
    super.dispose();
  }

  void _done() {
    final distance = int.tryParse(_distance.text.trim());
    if (distance == null || distance < 1 || distance > 4000) {
      return setState(() => _error = inText(context, 'Enter the distance in whole kilometres, 1 to 4000.'));
    }
    final vehicle = _vehicle.text.replaceAll(RegExp(r'[\s-]+'), '').toUpperCase();
    if (_mode == 'road' && vehicle.isEmpty) {
      return setState(() => _error = inText(context, 'Enter the vehicle number, for example MH12AB1234.'));
    }
    Navigator.of(context).pop({
      'distanceKm': distance,
      'mode': _mode,
      if (vehicle.isNotEmpty) 'vehicleNo': vehicle,
      if (_transporter.text.trim().isNotEmpty) 'transporterName': _transporter.text.trim(),
    });
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(22, 4, 22, 22 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(inFormat(context, 'Transport for {id}', {'id': widget.doc.id}), style: text.headlineSmall),
          const SizedBox(height: 6),
          Text(inText(context, 'How the goods move. MyCA puts this on the e-way bill request; nothing is sent until you approve it.'), style: text.bodySmall),
          const SizedBox(height: 14),
          Wrap(
            spacing: 8,
            children: [
              for (final mode in const ['road', 'rail', 'air', 'ship'])
                ChoiceChip(
                  label: Text(switch (mode) {
                    'rail' => inText(context, 'Rail'),
                    'air' => inText(context, 'Air'),
                    'ship' => inText(context, 'Ship'),
                    _ => inText(context, 'Road'),
                  }),
                  selected: mode == _mode,
                  selectedColor: Palette.sunken,
                  showCheckmark: false,
                  onSelected: (_) => setState(() => _mode = mode),
                ),
            ],
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _vehicle,
            textCapitalization: TextCapitalization.characters,
            decoration: InputDecoration(labelText: inText(context, 'Vehicle number')),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _distance,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(labelText: inText(context, 'Distance in km')),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _transporter,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(labelText: inText(context, 'Transporter (optional)')),
          ),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(_error, style: TextStyle(color: Palette.danger, fontWeight: FontWeight.w600)),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(onPressed: _done, child: Text(inText(context, 'Preview'))),
          ),
        ],
      ),
    );
  }
}

class _AmendSheet extends StatefulWidget {
  const _AmendSheet({required this.doc});

  final InvoiceDocument doc;

  @override
  State<_AmendSheet> createState() => _AmendSheetState();
}

class _AmendSheetState extends State<_AmendSheet> {
  final _reason = TextEditingController();
  final _gstin = TextEditingController();
  late final List<List<TextEditingController>> _lines;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _gstin.text = widget.doc.buyerGstin;
    _lines = [
      for (final line in widget.doc.lines) [TextEditingController(text: '${line.qty}'), TextEditingController(text: '${line.rate}'), TextEditingController(text: '${line.gstRate}')],
    ];
  }

  @override
  void dispose() {
    _reason.dispose();
    _gstin.dispose();
    for (final line in _lines) {
      for (final field in line) {
        field.dispose();
      }
    }
    super.dispose();
  }

  void _submit() {
    final reason = _reason.text.trim();
    if (reason.isEmpty) return setState(() => _error = inText(context, 'Say why the invoice is being amended.'));
    final lines = <Map<String, Object?>>[];
    for (var i = 0; i < _lines.length; i += 1) {
      final qty = num.tryParse(_lines[i][0].text.trim());
      final rate = parseAmount(_lines[i][1].text);
      final gstRate = parseRate(_lines[i][2].text);
      if (qty == null || qty <= 0 || rate == null || gstRate == null) return setState(() => _error = inFormat(context, 'Line {n} needs a quantity, a rate and a GST rate.', {'n': i + 1}));
      final line = widget.doc.lines[i];
      lines.add({'description': line.description, 'hsn': line.hsn, 'qty': qty, 'rate': rate, 'gstRate': gstRate});
    }
    final gstin = _gstin.text.trim().toUpperCase();
    Navigator.of(context).pop({
      'reason': reason,
      'lines': lines,
      if (gstin != widget.doc.buyerGstin) 'partyGstin': gstin,
    });
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(inFormat(context, 'Amend {id}', {'id': widget.doc.id}), style: text.headlineSmall),
            const SizedBox(height: 6),
            Text(inText(context, 'For an invoice whose GSTR-1 month is already filed. The difference posts to the books and the amendment goes in the next GSTR-1 with the original number and date.'), style: text.bodySmall),
            const SizedBox(height: 12),
            TextField(controller: _gstin, textCapitalization: TextCapitalization.characters, decoration: InputDecoration(labelText: inText(context, 'Buyer GSTIN'))),
            for (var i = 0; i < _lines.length; i += 1) ...[
              const SizedBox(height: 10),
              Text(widget.doc.lines[i].description, style: text.bodyMedium),
              Row(
                children: [
                  Expanded(child: TextField(controller: _lines[i][0], keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: inText(context, 'Qty')))),
                  const SizedBox(width: 8),
                  Expanded(flex: 2, child: TextField(controller: _lines[i][1], keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: inText(context, 'Rate')))),
                  const SizedBox(width: 8),
                  Expanded(child: TextField(controller: _lines[i][2], keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: inText(context, 'GST %')))),
                ],
              ),
            ],
            const SizedBox(height: 10),
            TextField(controller: _reason, decoration: InputDecoration(labelText: inText(context, 'Reason'))),
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(_error, style: text.bodyMedium?.copyWith(color: Palette.danger)),
            ],
            const SizedBox(height: 14),
            FilledButton(onPressed: _submit, child: Text(inText(context, 'Preview the amendment'))),
          ],
        ),
      ),
    );
  }
}

class _CreditNoteSheet extends StatefulWidget {
  const _CreditNoteSheet({required this.doc, this.debit = false});

  final InvoiceDocument doc;
  final bool debit;

  @override
  State<_CreditNoteSheet> createState() => _CreditNoteSheetState();
}

class _CreditNoteSheetState extends State<_CreditNoteSheet> {
  final _amount = TextEditingController();
  final _reason = TextEditingController();
  String _error = '';
  bool _restock = false;

  @override
  void dispose() {
    _amount.dispose();
    _reason.dispose();
    super.dispose();
  }

  void _done() {
    final reason = _reason.text.trim();
    if (reason.isEmpty) {
      return setState(
        () => _error = widget.debit
            ? inText(context, 'Say why: price revised, extra charge…')
            : inText(context, 'Say why: goods returned, price reduced…'),
      );
    }
    final raw = _amount.text.trim();
    num? amount;
    if (raw.isNotEmpty || widget.debit) {
      amount = num.tryParse(raw.replaceAll(',', ''));
      if (amount == null || amount <= 0) {
        return setState(
          () => _error = widget.debit
              ? inText(context, 'Enter the amount to add, with GST.')
              : inText(context, 'Enter the amount, or leave it blank for the whole invoice.'),
        );
      }
    }
    if (_restock && amount != null) {
      return setState(() => _error = inText(context, 'Only a credit note for the whole invoice puts goods back in stock. Leave the amount blank, or record a part return with Stock in.'));
    }
    Navigator.of(context).pop((amount, reason, _restock && !widget.debit));
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
      child: SingleChildScrollView(child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.debit
                ? inFormat(context, 'Debit note against {id}', {'id': widget.doc.id})
                : inFormat(context, 'Credit note against {id}', {'id': widget.doc.id}),
            style: text.headlineSmall,
          ),
          const SizedBox(height: 6),
          Text(
            widget.debit
                ? inFormat(context, 'Adds to what {name} owes, with GST at the invoice rates. The note goes into the GSTR-1 of its own month.', {'name': widget.doc.buyerName})
                : inFormat(context, 'Up to {amount} including GST. Leave the amount blank to credit the whole invoice.', {'amount': rupees(left)}),
            style: text.bodySmall,
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: InputDecoration(
              labelText: widget.debit
                  ? inText(context, 'Amount to add, with GST')
                  : inText(context, 'Amount, with GST (optional)'),
              prefixText: '₹ ',
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _reason,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(labelText: inText(context, 'Reason')),
          ),
          if (!widget.debit && widget.doc.country == 'IN')
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _restock,
              onChanged: (value) => setState(() => _restock = value),
              title: Text(inText(context, 'Goods came back into stock')),
              subtitle: Text(inText(context, 'For the whole invoice only: the stock items sold on it go back into stock.')),
            ),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(
              _error,
              style: TextStyle(
                color: Palette.danger,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(onPressed: _done, child: Text(inText(context, 'Preview'))),
          ),
        ],
      )),
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
          Text(inFormat(context, 'Cancel {id}?', {'id': widget.doc.id}), style: text.headlineSmall),
          const SizedBox(height: 6),
          Text(
            widget.doc.received > 0
                ? inFormat(context, '{name} has paid {amount}; that becomes due back to them.', {'name': widget.doc.buyerName, 'amount': rupees(widget.doc.received)})
                : inFormat(context, 'A credit note for the full {amount} will be posted. You will see it before anything changes.', {'amount': rupees(widget.doc.total)}),
            style: text.bodySmall,
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _reason,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(labelText: inText(context, 'Reason (optional)')),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () => Navigator.of(context).pop(_reason.text.trim()),
              child: Text(inText(context, 'Preview')),
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
      child: AmountRow(
        start: Padding(padding: const EdgeInsets.only(right: 12), child: Text(name, style: style)),
        amount: rupees(amount),
        style: style,
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
