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
import '../../widgets/glass.dart';

/// Shows a UAE invoice or credit note exactly as the platform engine lays it out
/// (the shared `invoice_document` tool), rather than rebuilding it from the snapshot.
/// [invoiceId] may be an invoice number or a credit note number.
class UaeInvoiceScreen extends StatefulWidget {
  const UaeInvoiceScreen({super.key, required this.invoiceId});

  final String invoiceId;

  @override
  State<UaeInvoiceScreen> createState() => _UaeInvoiceScreenState();
}

const _notFound = {'INVOICE_NOT_FOUND', 'CREDIT_NOTE_NOT_FOUND', 'NOT_A_UAE_INVOICE'};

String _plainNumber(num value) => value == value.roundToDouble() ? value.toInt().toString() : value.toString();

class _UaeInvoiceScreenState extends State<UaeInvoiceScreen> with UaeWriteFlow {
  Map<String, dynamic>? _done;
  Map<String, dynamic>? _doc;
  String _failure = '';
  String _detail = '';
  String? _lang;
  int _ask = 0;

  @override
  MycaApi get api => AppScope.of(context).api;

  bool get _creditNote => _doc == null ? widget.invoiceId.toUpperCase().startsWith('CN') : _doc!['kind'] == 'credit_note';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final lang = UaeStrings.of(context).ar ? 'ar' : 'en';
    if (lang == _lang) return;
    _lang = lang;
    _fetch();
  }

  Future<void> _fetch() async {
    final ask = ++_ask;
    final lang = _lang;
    try {
      final result = await api.query('invoice_document', {'id': widget.invoiceId, if (lang == 'ar') 'lang': 'ar'});
      if (!mounted || ask != _ask) return;
      final data = toolData(result);
      setState(() {
        if (data.isNotEmpty) {
          _doc = data;
          _failure = '';
          _detail = '';
        } else {
          _failure = uaeText(uaeMap(result)['error']).isEmpty ? 'FAILED' : uaeText(uaeMap(result)['error']);
          _detail = uaeFailure(result);
        }
      });
    } on MycaApiException catch (err) {
      if (!mounted || ask != _ask) return;
      setState(() {
        _failure = 'FAILED';
        _detail = err.message;
      });
    }
  }

  void _retry() {
    setState(() {
      _failure = '';
      _detail = '';
    });
    _fetch();
  }

  @override
  Future<void> onWritten(Map<String, dynamic> result, ChatReply reply) async {
    final state = AppScope.of(context);
    setState(() => _done = result.isEmpty ? {'reply': reply.reply} : result);
    await state.refresh();
    await _fetch();
  }

  Future<void> _issueCreditNote(num left) async {
    final s = UaeStrings.of(context);
    final picked = await showMycaSheet<(num?, String)>(
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

  void _open(String id) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => UaeInvoiceScreen(invoiceId: id)));

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final doc = _doc;
    final id = doc == null ? widget.invoiceId : uaeText(doc['id']);
    final preview = held;
    return Scaffold(
      appBar: AppBar(title: Text(_creditNote ? s.creditNoteTitle(id) : s.invoiceTitle(id), maxLines: 2)),
      body: doc != null
          ? Column(
              children: [
                Expanded(child: _body(context, s, doc)),
                if (preview != null) UaeConfirmBar(busy: writing, onConfirm: confirmAe, onDiscard: discardAe),
              ],
            )
          : _notFound.contains(_failure)
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Text(_creditNote ? s.creditNoteNotInBooks : s.notInBooks, key: const ValueKey('uae.invoice.missing'), textAlign: TextAlign.center),
              ),
            )
          : _failure.isNotEmpty
          ? UaeError(key: const ValueKey('uae.invoice.error'), onRetry: _retry, detail: _detail)
          : const Center(child: CircularProgressIndicator(key: ValueKey('uae.invoice.loading'))),
    );
  }

  Widget _body(BuildContext context, UaeStrings s, Map<String, dynamic> doc) {
    final f = UaeFormat.of(context);
    final text = Theme.of(context).textTheme;
    final credit = doc['kind'] == 'credit_note';
    final lang = s.ar ? 'ar' : 'en';
    final titles = uaeMap(doc['documentTitle']);
    final title = uaeText(titles[lang]).isNotEmpty ? uaeText(titles[lang]) : (credit ? s.creditNote : s.taxInvoice);
    final emirateRow = uaeMap(doc['emirate']);
    final emirate = uaeText(emirateRow[lang]).isNotEmpty ? uaeText(emirateRow[lang]) : (emirateByCode(uaeText(emirateRow['code']))?.name(s.ar) ?? '');
    final currency = uaeText(doc['currency']).isEmpty ? 'AED' : uaeText(doc['currency']);
    final date = uaeText(doc['date']);
    final supplied = uaeText(doc['dateOfSupply']);
    final due = uaeText(doc['dueDate']);
    final status = uaeText(doc['status']);
    final missing = [for (final code in (doc['missing'] as List? ?? const [])) '$code'];
    final total = uaeNum(doc['total']);
    final received = uaeNum(doc['received']);
    final credited = uaeNum(doc['credited']);
    final notes = uaeRows(doc['creditNotes']);
    final left = ((total - credited) * 100).round() / 100;
    final preview = held;
    final done = _done;
    final doneId = uaeText(uaeMap(done?['creditNote'])['id']);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        UaePanel(
          key: const ValueKey('uae.invoice.head'),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, key: const ValueKey('uae.invoice.title'), style: text.headlineSmall),
                  if (!credit && status.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(s.status(status), key: const ValueKey('uae.invoice.status'), style: text.labelMedium),
                  ],
                ],
              ),
            ),
            UaeFigure(label: s.documentNumber, value: uaeText(doc['id']), valueKey: const ValueKey('uae.invoice.number')),
            UaeFigure(label: s.issueDate, value: f.date(date), valueKey: const ValueKey('uae.invoice.date')),
            if (!credit && supplied.isNotEmpty && supplied != date) UaeFigure(label: s.dateOfSupply, value: f.date(supplied)),
            if (due.isNotEmpty) UaeFigure(label: s.dueDateLabel, value: f.date(due)),
            if (emirate.isNotEmpty) UaeFigure(label: s.emirate, value: emirate),
            if (currency != 'AED') UaeFigure(label: s.currency, value: s.inCurrency(currency, _plainNumber(uaeNum(doc['exchangeRate']))), valueKey: const ValueKey('uae.invoice.currency')),
          ],
        ),
        if (missing.isNotEmpty) ...[
          const SizedBox(height: 12),
          _MissingNotice(codes: missing, creditNote: credit),
        ],
        const SizedBox(height: 18),
        SectionLabel(s.seller),
        _PartyPanel(role: 'seller', party: uaeMap(doc['seller'])),
        const SizedBox(height: 18),
        SectionLabel(s.buyer),
        _PartyPanel(role: 'buyer', party: uaeMap(doc['buyer'])),
        if (credit) ...[
          const SizedBox(height: 18),
          SectionLabel(s.originalInvoice),
          _original(s, f, text, doc),
        ],
        const SizedBox(height: 18),
        SectionLabel(s.lines),
        UaePanel(
          key: const ValueKey('uae.invoice.lines'),
          children: [
            for (final (at, line) in uaeRows(doc['lines']).indexed) credit ? _creditLine(s, f, at, line) : _InvoiceLine(at: at, line: line),
          ],
        ),
        const SizedBox(height: 18),
        UaePanel(
          key: const ValueKey('uae.invoice.totals'),
          children: [
            UaeFigure(label: s.netAed, value: f.money(uaeNum(doc['net'])), valueKey: const ValueKey('uae.invoice.net')),
            UaeFigure(label: s.vatAed, value: f.money(uaeNum(doc['vat'])), valueKey: const ValueKey('uae.invoice.vat')),
            UaeFigure(label: s.totalAed, value: f.money(total), strong: true, valueKey: const ValueKey('uae.invoice.total')),
            if (!credit && received > 0) UaeFigure(label: s.received, value: f.money(received), valueKey: const ValueKey('uae.invoice.received')),
            if (!credit && credited > 0) UaeFigure(label: s.creditedLabel, value: '−${f.money(credited)}', valueKey: const ValueKey('uae.invoice.credited')),
            if (!credit && notes.isNotEmpty) UaeFigure(label: s.leftOnInvoice, value: f.money(left), valueKey: const ValueKey('uae.invoice.left')),
            if (!credit && (received > 0 || credited > 0)) UaeFigure(label: s.balanceDue, value: f.money(uaeNum(doc['balance'])), valueKey: const ValueKey('uae.invoice.balance')),
          ],
        ),
        if (!credit && notes.isNotEmpty) ...[
          const SizedBox(height: 18),
          SectionLabel(s.creditNotes),
          UaePanel(
            key: const ValueKey('uae.invoice.notes'),
            children: [
              for (final note in notes)
                InkWell(
                  key: ValueKey('uae.invoice.note.${uaeText(note['id'])}'),
                  onTap: () => _open(uaeText(note['id'])),
                  child: UaeFigure(caption: '${uaeText(note['id'])} · ${f.date(uaeText(note['date']))}', label: uaeText(note['reason']), value: '−${f.money(uaeNum(note['total']))}'),
                ),
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
            title: doneId.isEmpty ? uaeText(done['reply']) : s.creditRecorded(doneId),
            notes: [
              if (uaeMap(done['creditNote'])['total'] != null) '${s.totalAed}: ${f.money(uaeNum(uaeMap(done['creditNote'])['total']))}',
              for (final w in (done['warnings'] as List? ?? const [])) '$w',
            ],
            actions: [
              if (doneId.isNotEmpty) FilledButton(key: const ValueKey('uae.credit.open'), onPressed: () => _open(doneId), child: Text(s.openCreditNote)),
            ],
          ),
          const SizedBox(height: 12),
        ],
        if (!credit && preview == null && status != 'cancelled')
          OutlinedButton.icon(
            key: const ValueKey('uae.invoice.credit'),
            onPressed: writing ? null : () => _issueCreditNote(left),
            icon: const Icon(Icons.undo, size: 18),
            label: Text(s.issueCreditNote),
          ),
        if (writing) const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator())),
      ],
    );
  }

  Widget _original(UaeStrings s, UaeFormat f, TextTheme text, Map<String, dynamic> doc) {
    final original = uaeMap(doc['originalInvoice']);
    final id = uaeText(original['id']);
    final reason = uaeText(doc['reason']);
    return UaePanel(
      key: const ValueKey('uae.credit.original'),
      children: [
        UaeFigure(label: s.originalInvoice, value: id, valueKey: const ValueKey('uae.credit.originalId')),
        UaeFigure(label: s.originalInvoiceDate, value: f.date(uaeText(original['date'])), valueKey: const ValueKey('uae.credit.originalDate')),
        if (original['total'] != null) UaeFigure(label: s.originalTotal, value: f.money(uaeNum(original['total'])), valueKey: const ValueKey('uae.credit.originalTotal')),
        if (original['vat'] != null) UaeFigure(label: s.originalVat, value: f.money(uaeNum(original['vat'])), valueKey: const ValueKey('uae.credit.originalVat')),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(s.creditReasonLabel, style: text.labelSmall),
              UaeAutoText(reason.isEmpty ? '—' : reason, key: const ValueKey('uae.credit.why'), style: text.bodyMedium?.copyWith(color: Palette.ink)),
              if (doc['cancels'] == true) ...[
                const SizedBox(height: 4),
                Text(s.cancelsInFull, key: const ValueKey('uae.credit.cancels'), style: text.labelMedium?.copyWith(color: Palette.warn)),
              ],
            ],
          ),
        ),
        if (id.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Align(
              alignment: AlignmentDirectional.centerStart,
              child: OutlinedButton(key: const ValueKey('uae.credit.openInvoice'), onPressed: () => _open(id), child: Text(s.openInvoice)),
            ),
          ),
      ],
    );
  }

  Widget _creditLine(UaeStrings s, UaeFormat f, int at, Map<String, dynamic> line) {
    final net = uaeNum(line['net']);
    final vat = uaeNum(line['vat']);
    return UaeFigure(
      key: ValueKey('uae.invoice.line.$at'),
      caption: _treatmentLabel(s, line),
      label: '${s.net}: ${f.money(net)} · ${s.vat}: ${f.money(vat)}',
      value: f.money(((net + vat) * 100).round() / 100),
      valueKey: ValueKey('uae.invoice.line.$at.amount'),
    );
  }
}

String _treatmentLabel(UaeStrings s, Map<String, dynamic> line) {
  final note = uaeMap(line['note']);
  final said = uaeText(note[s.ar ? 'ar' : 'en']);
  if (said.isNotEmpty) return said;
  final code = uaeText(line['treatment']);
  return s.treatmentName(code.isEmpty ? 'standard' : code);
}

class _MissingNotice extends StatelessWidget {
  const _MissingNotice({required this.codes, required this.creditNote});

  final List<String> codes;
  final bool creditNote;

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final text = Theme.of(context).textTheme;
    return Container(
      key: const ValueKey('uae.invoice.missingNotes'),
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: Palette.warnSoft,
        borderRadius: BorderRadius.circular(radiusCard),
        border: Border.all(color: Palette.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.warning_amber_rounded, size: 18, color: Palette.warn),
              const SizedBox(width: 8),
              Expanded(child: Text(s.missingTitle, style: text.titleSmall?.copyWith(color: Palette.warn))),
            ],
          ),
          for (final code in codes) ...[
            const SizedBox(height: 6),
            Text(s.missingItem(code, creditNote: creditNote), key: ValueKey('uae.invoice.missing.$code'), style: text.bodyMedium?.copyWith(color: Palette.ink)),
          ],
        ],
      ),
    );
  }
}

class _PartyPanel extends StatelessWidget {
  const _PartyPanel({required this.role, required this.party});

  final String role;
  final Map<String, dynamic> party;

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final text = Theme.of(context).textTheme;
    final name = uaeText(party['name']);
    final nameAr = uaeText(party['nameAr']);
    final trn = uaeText(party['trn']);
    final address = uaeText(party['address']);
    final body = text.bodyMedium?.copyWith(color: Palette.ink);
    Widget row(String key, String value, {TextStyle? style, bool auto = true}) => Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      child: auto ? UaeAutoText(value, key: ValueKey('uae.invoice.$role.$key'), style: style ?? body) : Text(value, key: ValueKey('uae.invoice.$role.$key'), style: style ?? body),
    );
    return UaePanel(
      key: ValueKey('uae.invoice.$role'),
      children: [
        row('name', name.isEmpty ? '—' : name, style: text.titleSmall),
        if (nameAr.isNotEmpty && nameAr != name) row('nameAr', nameAr),
        row('trn', trn.isEmpty ? s.noTrn : s.trnOf(trn), auto: false),
        row('address', address.isEmpty ? s.noAddress : address, style: address.isEmpty ? text.bodyMedium?.copyWith(color: Palette.warn) : null, auto: address.isNotEmpty),
      ],
    );
  }
}

class _InvoiceLine extends StatelessWidget {
  const _InvoiceLine({required this.at, required this.line});

  final int at;
  final Map<String, dynamic> line;

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final f = UaeFormat.of(context);
    final text = Theme.of(context).textTheme;
    final currency = uaeText(line['rateCurrency']).isEmpty ? 'AED' : uaeText(line['rateCurrency']);
    final description = uaeText(line['description']);
    final small = text.bodySmall;
    final vatRate = uaeNum(line['vatRate']);
    return Padding(
      key: ValueKey('uae.invoice.line.$at'),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: LayoutBuilder(
        builder: (context, box) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: UaeAutoText(description.isEmpty ? '—' : description, style: text.bodyMedium?.copyWith(color: Palette.ink))),
                const SizedBox(width: 12),
                ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: box.maxWidth * 0.5),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: AlignmentDirectional.centerEnd,
                    child: Text(f.money(uaeNum(line['amount'])), key: ValueKey('uae.invoice.line.$at.amount'), style: text.bodyMedium?.copyWith(color: Palette.ink, fontFeatures: moneyFigures)),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(s.quantityTimes(_plainNumber(uaeNum(line['qty'])), f.moneyIn(currency, uaeNum(line['rate']))), key: ValueKey('uae.invoice.line.$at.unit'), style: small),
            if (currency != 'AED') Text(s.unitPriceAed(f.money(uaeNum(line['unitPriceAed']))), key: ValueKey('uae.invoice.line.$at.aed'), style: small),
            Text(
              [if (vatRate > 0 && uaeText(line['note']).isEmpty) s.vatRateOf(_plainNumber(vatRate)) else _treatmentLabel(s, line), '${s.vat}: ${f.money(uaeNum(line['vat']))}'].join(' · '),
              key: ValueKey('uae.invoice.line.$at.vat'),
              style: text.labelSmall,
            ),
          ],
        ),
      ),
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
