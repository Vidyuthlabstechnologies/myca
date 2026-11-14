import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../theme.dart';
import '../../uae/uae_edition.dart';
import '../../uae/uae_emirates.dart';
import '../../uae/uae_format.dart';
import '../../uae/uae_strings.dart';
import '../../widgets.dart';
import 'uae_widgets.dart';
import 'uae_write.dart';

class UaeInvoiceScreen extends StatefulWidget {
  const UaeInvoiceScreen({super.key, required this.invoiceId});

  final String invoiceId;

  @override
  State<UaeInvoiceScreen> createState() => _UaeInvoiceScreenState();
}

class _UaeInvoiceScreenState extends State<UaeInvoiceScreen> with UaeWriteFlow {
  Map<String, dynamic>? _done;

  @override
  MycaApi get api => AppScope.of(context).api;

  Invoice? _invoice(Snapshot? snapshot) {
    for (final doc in snapshot?.invoices ?? const <Invoice>[]) {
      if (doc.id == widget.invoiceId) return doc;
    }
    return null;
  }

  @override
  Future<void> onWritten(Map<String, dynamic> result, ChatReply reply) async {
    final state = AppScope.of(context);
    setState(() => _done = result.isEmpty ? {'reply': reply.reply} : result);
    await state.refresh();
  }

  Future<void> _creditNote(num left) async {
    final s = UaeStrings.of(context);
    final picked = await showModalBottomSheet<(num?, String)>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _CreditNoteSheet(left: left),
    );
    if (picked == null || !mounted) return;
    final (amount, reason) = picked;
    setState(() => _done = null);
    await writeAe('create_ae_credit_note', {
      'invoiceId': widget.invoiceId,
      'amount': ?amount,
      'date': uaeIsoDay(AppScope.of(context).now()),
      'reason': reason,
      'lang': s.ar ? 'ar' : 'en',
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final f = UaeFormat.of(context);
    final text = Theme.of(context).textTheme;
    final snapshot = AppScope.of(context).snapshot;
    final doc = _invoice(snapshot);
    final preview = held;
    return Scaffold(
      appBar: AppBar(title: Text(s.invoiceTitle(widget.invoiceId), maxLines: 2)),
      body: doc == null
          ? Center(child: Padding(padding: const EdgeInsets.all(28), child: Text(s.notInBooks, key: const ValueKey('uae.invoice.missing'), textAlign: TextAlign.center)))
          : Column(
              children: [
                Expanded(child: _body(context, s, f, text, doc, snapshot)),
                if (preview != null) UaeConfirmBar(busy: writing, onConfirm: confirmAe, onDiscard: discardAe),
              ],
            ),
    );
  }

  Widget _body(BuildContext context, UaeStrings s, UaeFormat f, TextTheme text, Invoice doc, Snapshot? snapshot) {
    final raw = doc.raw;
    final notes = [for (final note in snapshot?.creditNotes ?? const <CreditNote>[]) if (note.invoiceId == doc.id) note];
    final credited = notes.fold<num>(0, (sum, note) => sum + note.total);
    final left = ((doc.total - credited) * 100).round() / 100;
    final emirate = emirateByCode(uaeText(raw['emirate']));
    final currency = uaeText(raw['currency']).isEmpty ? 'AED' : uaeText(raw['currency']);
    final trn = doc.partyTrn;
    final subtotal = raw['subtotal'] ?? raw['taxable'];
    final vat = raw['vat'];
    final received = doc.receipts.fold<num>(0, (sum, r) => sum + r.amount);
    final preview = held;
    final done = _done;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        UaePanel(
          key: const ValueKey('uae.invoice.head'),
          children: [
            UaeFigure(caption: s.taxInvoice, label: doc.partyName, value: s.status(doc.status)),
            UaeFigure(label: trn.isEmpty ? s.noTrn : s.trnOf(trn), value: ''),
            UaeFigure(label: s.issueDate, value: f.date(doc.date)),
            if (doc.dueDate.isNotEmpty) UaeFigure(label: s.dueDateLabel, value: f.date(doc.dueDate)),
            if (emirate != null) UaeFigure(label: s.emirate, value: emirate.name(s.ar)),
            if (currency != 'AED') UaeFigure(label: s.currency, value: s.inCurrency(currency, uaeText(raw['exchangeRate']))),
          ],
        ),
        const SizedBox(height: 18),
        SectionLabel(s.lines),
        UaePanel(
          key: const ValueKey('uae.invoice.lines'),
          children: [
            for (final line in uaeRows(raw['lines']))
              UaeFigure(
                caption: [s.treatmentName(uaeText(line['treatment']).isEmpty ? 'standard' : uaeText(line['treatment'])), '${uaeNum(line['qty'])} × ${uaeNum(line['rate'])}'].join(' · '),
                label: uaeText(line['description']).isEmpty ? '—' : uaeText(line['description']),
                value: f.money(uaeNum(line['amount'] ?? line['subtotal'])),
              ),
          ],
        ),
        const SizedBox(height: 18),
        UaePanel(
          key: const ValueKey('uae.invoice.totals'),
          children: [
            if (subtotal != null) UaeFigure(label: s.net, value: f.money(uaeNum(subtotal)), valueKey: const ValueKey('uae.invoice.net')),
            if (vat != null) UaeFigure(label: s.vat5, value: f.money(uaeNum(vat)), valueKey: const ValueKey('uae.invoice.vat')),
            UaeFigure(label: s.totalAed, value: f.money(doc.total), strong: true, valueKey: const ValueKey('uae.invoice.total')),
            if (received > 0) UaeFigure(label: s.received, value: f.money(received)),
            if (notes.isNotEmpty) UaeFigure(label: s.leftOnInvoice, value: f.money(left), valueKey: const ValueKey('uae.invoice.left')),
          ],
        ),
        if (notes.isNotEmpty) ...[
          const SizedBox(height: 18),
          SectionLabel(s.creditNotes),
          UaePanel(
            key: const ValueKey('uae.invoice.notes'),
            children: [
              for (final note in notes) UaeFigure(caption: '${note.id} · ${f.date(note.date)}', label: note.reason, value: '−${f.money(note.total)}'),
            ],
          ),
        ],
        const SizedBox(height: 18),
        if (writeProblems.isNotEmpty) ...[
          UaeNotes(key: const ValueKey('uae.credit.problems'), title: s.nothingSaved, notes: writeProblems, danger: true),
          const SizedBox(height: 12),
        ],
        if (preview != null) ...[
          UaeHeldPreview(key: const ValueKey('uae.credit.held'), preview: preview),
          const SizedBox(height: 12),
        ],
        if (done != null) ...[
          UaeDoneCard(
            key: const ValueKey('uae.credit.done'),
            title: uaeText(uaeMap(done['creditNote'])['id']).isEmpty ? uaeText(done['reply']) : s.creditRecorded(uaeText(uaeMap(done['creditNote'])['id'])),
            notes: [
              if (uaeMap(done['creditNote'])['total'] != null) '${s.totalAed}: ${f.money(uaeNum(uaeMap(done['creditNote'])['total']))}',
              for (final w in (done['warnings'] as List? ?? const [])) '$w',
            ],
          ),
          const SizedBox(height: 12),
        ],
        if (preview == null && !doc.cancelled)
          OutlinedButton.icon(
            key: const ValueKey('uae.invoice.credit'),
            onPressed: writing ? null : () => _creditNote(left),
            icon: const Icon(Icons.undo, size: 18),
            label: Text(s.issueCreditNote),
          ),
        if (writing) const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator())),
      ],
    );
  }
}

class _CreditNoteSheet extends StatefulWidget {
  const _CreditNoteSheet({required this.left});

  final num left;

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

  void _submit() {
    final s = UaeStrings.of(context);
    final typed = _amount.text.trim();
    final amount = typed.isEmpty ? null : parseDirhams(typed);
    if (typed.isNotEmpty && (amount == null || amount <= 0)) return setState(() => _error = s.writeError('BAD_AMOUNT'));
    Navigator.of(context).pop((amount, _reason.text.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final f = UaeFormat.of(context);
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(s.creditNote, style: text.headlineSmall),
            const SizedBox(height: 14),
            TextField(
              key: const ValueKey('uae.credit.amount'),
              controller: _amount,
              textDirection: TextDirection.ltr,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                label: Text(s.creditAmount, maxLines: 2),
                helperText: s.creditAmountHint(f.money(widget.left)),
                helperMaxLines: 3,
                prefixText: 'AED ',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const ValueKey('uae.credit.reason'),
              controller: _reason,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(label: Text(s.creditReason, maxLines: 2), helperText: s.creditReasonHint, helperMaxLines: 2),
            ),
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(_error, key: const ValueKey('uae.credit.note'), style: text.bodyMedium?.copyWith(color: Palette.danger)),
            ],
            const SizedBox(height: 16),
            FilledButton(key: const ValueKey('uae.credit.preview'), onPressed: _submit, child: Text(s.preview)),
          ],
        ),
      ),
    );
  }
}
