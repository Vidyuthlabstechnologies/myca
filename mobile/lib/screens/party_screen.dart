import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'tds_fields.dart';
import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../proposal_flow.dart';
import '../registers.dart';
import '../theme.dart';
import '../uae/uae_edition.dart';
import '../uae/uae_strings.dart';
import '../widgets.dart';
import '../widgets/utf16_limit.dart';
import 'invoice_screen.dart';
import 'remind_customer_screen.dart';
import 'statements_screen.dart';
import 'uae/uae_document_screen.dart';
import 'uae/uae_invoice_screen.dart';

part 'party_screen/composer.dart';
part 'party_screen/supplier_terms_sheet.dart';
part 'party_screen/tds_withheld_sheet.dart';

enum _Composer { none, document, payment, quote, purchaseNote }

class PartyScreen extends StatefulWidget {
  const PartyScreen({
    super.key,
    required this.kind,
    required this.partyName,
    required this.partyGstin,
    this.openComposer = false,
  });

  final RegisterKind kind;
  final String partyName;
  final String partyGstin;
  final bool openComposer;

  @override
  State<PartyScreen> createState() => _PartyScreenState();
}

class _PartyScreenState extends State<PartyScreen> with ProposalFlow {
  final _scroll = ScrollController();
  final _amount = TextEditingController();
  final _rate = TextEditingController();
  final _what = TextEditingController();
  final _billNo = TextEditingController();
  final _noteReason = TextEditingController();
  final _jurisdiction = TextEditingController();
  final _exemptionReason = TextEditingController();
  final _taxPaid = TextEditingController();
  final _tds = TdsChoice();
  bool _exempt = false;
  String _docKind = 'quote';
  String _challanReason = 'job-work';
  String _repeat = '';
  List<SalesTaxRate> _salesTaxRates = const [];
  late _Composer _composer = widget.openComposer && !uaeEdition(context)
      ? _Composer.document
      : _Composer.none;
  String? _invoiceId;
  String _mode = 'bank';
  String _formError = '';
  bool _postedHere = false;
  String _proposedTool = '';
  Map<String, String> _riskByBill = const {};
  bool _risksLoaded = false;
  Map<String, SupplierDueBill>? _dues;
  bool _duesAnswered = false;
  bool _duesAsked = false;
  Snapshot? _duesFor;

  bool get _sales => widget.kind == RegisterKind.sales;

  bool get _us => (AppScope.of(context).snapshot?.company.country ?? 'IN') == 'US';

  bool get _ae => uaeEdition(context);

  bool get _ownsBooks {
    final role = AppScope.of(context).snapshot?.activeUser?.role;
    return role == 'owner' || role == 'admin';
  }

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_us && _sales && _salesTaxRates.isEmpty) _loadSalesTaxRates();
    if (!_sales && !_us && !_ae && !_risksLoaded) _loadRisks();
    final snapshot = AppScope.of(context).snapshot;
    if (!_sales && !_us && !_ae && (!_duesAsked || !identical(snapshot, _duesFor))) _loadDues(snapshot);
  }

  Future<void> _loadDues(Snapshot? snapshot) async {
    _duesAsked = true;
    _duesFor = snapshot;
    Map<String, SupplierDueBill>? found;
    try {
      final answer = await api.query('supplier_dues');
      if (toolData(answer)['bills'] is List) {
        found = {for (final bill in SupplierDues.fromTool(answer).bills) bill.billId: bill};
      }
    } on MycaApiException {
      found = null;
    }
    if (!mounted || !identical(snapshot, _duesFor)) return;
    setState(() {
      _dues = found;
      _duesAnswered = true;
    });
  }

  ({String date, bool msme})? _payBy(Invoice doc) {
    if (_sales || doc.paid || doc.cancelled) return null;
    final dues = _dues;
    if (dues != null) {
      final row = dues[doc.id];
      return row == null ? null : (date: row.payBy, msme: row.msme);
    }
    if (!_us && !_duesAnswered) return null;
    return doc.dueDate.isEmpty ? null : (date: doc.dueDate, msme: doc.msme);
  }

  Future<void> _loadRisks() async {
    _risksLoaded = true;
    final snapshot = AppScope.of(context).snapshot;
    final months = <String>{
      for (final doc in snapshot?.purchases ?? const <Invoice>[])
        if (partyKey(doc.partyName) == partyKey(widget.partyName) && doc.date.length >= 7) doc.date.substring(0, 7),
    };
    final found = <String, String>{};
    for (final month in months) {
      try {
        final check = CreditCheck.fromTool(await api.query('credit_at_risk', {'period': month}));
        for (final risk in check?.risks ?? const <CreditRisk>[]) {
          found[risk.billId] = risk.why;
        }
      } on MycaApiException {
        return;
      }
    }
    if (mounted) setState(() => _riskByBill = found);
  }

  Future<void> _loadSalesTaxRates() async {
    final rates = SalesTaxRate.listFromTool(await api.query('list_sales_tax_rates'));
    if (!mounted) return;
    setState(() => _salesTaxRates = rates);
  }

  @override
  Future<void> propose(String said, String tool, Map<String, Object?> args) {
    _proposedTool = tool;
    return super.propose(said, tool, args);
  }

  @override
  Future<void> onPosted() async {
    HapticFeedback.mediumImpact();
    final messenger = ScaffoldMessenger.of(context);
    final confirmation = entries.isEmpty ? 'Posted.' : entries.last.text;
    await AppScope.of(context).refresh();
    if (!mounted) return;
    setState(() {
      entries.clear();
      if (_proposedTool != 'set_supplier_terms') _postedHere = true;
    });
    messenger.showSnackBar(SnackBar(content: Text(confirmation)));
  }

  @override
  void onThreadChanged() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    _amount.dispose();
    _rate.dispose();
    _what.dispose();
    _billNo.dispose();
    _noteReason.dispose();
    _jurisdiction.dispose();
    _exemptionReason.dispose();
    _taxPaid.dispose();
    _tds.dispose();
    super.dispose();
  }

  String _aeSubtitle(Party party) {
    final s = UaeStrings.of(context);
    String trn = '';
    for (final doc in party.documents.reversed) {
      if (doc.partyTrn.isNotEmpty) {
        trn = doc.partyTrn;
        break;
      }
    }
    if (trn.isEmpty && party.gstin.isNotEmpty) trn = party.gstin;
    return trn.isEmpty ? (_sales ? s.customer : s.supplier) : s.trnOf(trn);
  }

  void _openAe(Party party) {
    String trn = '';
    for (final doc in party.documents.reversed) {
      if (doc.partyTrn.isNotEmpty) {
        trn = doc.partyTrn;
        break;
      }
    }
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _sales ? UaeSaleScreen(partyName: party.name, partyTrn: trn) : UaePurchaseScreen(partyName: party.name, partyTrn: trn),
      ),
    );
  }

  num _stillOwed(Invoice doc) => _sales
      ? doc.owedAfter(AppScope.of(context).snapshot?.creditNotes ?? const <CreditNote>[])
      : doc.owed;

  void _open(_Composer composer, Party party) => setState(() {
    _composer = composer;
    _formError = '';
    _amount.clear();
    if (composer == _Composer.payment) {
      _invoiceId = party.unpaid.first.id;
      _amount.text = plainNumber(_stillOwed(party.unpaid.first));
    }
    if (composer == _Composer.document) _repeat = '';
    if (composer == _Composer.quote) _docKind = 'quote';
    if (composer == _Composer.document || composer == _Composer.quote) {
      final before = ratesUsedBefore(party.documents);
      if (_rate.text.trim().isEmpty && before.isNotEmpty) _rate.text = rateLabel(before.first);
    }
    if (composer == _Composer.purchaseNote) {
      final open = party.documents.where((d) => !d.cancelled).toList();
      _invoiceId = open.isEmpty ? null : open.last.id;
      _noteReason.clear();
    }
  });

  Future<void> _submitPurchaseNote() async {
    final amount = parseAmount(_amount.text);
    final billId = _invoiceId;
    final reason = _noteReason.text.trim();
    if (billId == null) return setState(() => _formError = 'Choose the bill.');
    if (amount == null || amount <= 0) return setState(() => _formError = 'Enter how much less you owe.');
    if (reason.isEmpty) return setState(() => _formError = 'Say why: goods returned, price reduced.');
    setState(() => _composer = _Composer.none);
    await propose(
      'Debit note of ${rupees(amount)} against $billId: $reason',
      'create_purchase_note',
      {'billId': billId, 'amount': amount, 'date': isoDate(AppScope.of(context).now()), 'reason': reason},
    );
  }

  List<Widget> _purchaseNoteFields(Party party) => [
    DropdownButtonFormField<String>(
      initialValue: _invoiceId,
      decoration: const InputDecoration(labelText: 'Against bill'),
      items: [
        for (final doc in party.documents.where((d) => !d.cancelled))
          DropdownMenuItem(value: doc.id, child: Text('${doc.id} · ${rupees(doc.total)}')),
      ],
      onChanged: (value) => setState(() => _invoiceId = value),
    ),
    const SizedBox(height: 10),
    TextField(
      controller: _amount,
      autofocus: true,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: InputDecoration(labelText: 'Reduce the bill by', prefixText: moneyPrefix),
    ),
    const SizedBox(height: 10),
    TextField(
      controller: _noteReason,
      textCapitalization: TextCapitalization.sentences,
      decoration: const InputDecoration(labelText: 'Reason', hintText: 'Goods returned, price reduced'),
    ),
  ];

  Future<void> _submitUsDocument(num? amount) async {
    if (amount == null) {
      return setState(() => _formError = 'Enter the amount before sales tax.');
    }
    if (_sales && !_exempt && _jurisdiction.text.trim().isEmpty) {
      return setState(() => _formError = 'Say which sales tax applies, for example TX or TX-AUSTIN, or mark the sale exempt. No rate is ever guessed.');
    }
    if (_sales && _exempt && _exemptionReason.text.trim().isEmpty) {
      return setState(() => _formError = 'Say why this sale is exempt, for example a resale certificate on file.');
    }
    final taxPaid = _taxPaid.text.trim().isEmpty ? 0 : parseAmount(_taxPaid.text);
    if (!_sales && taxPaid == null) {
      return setState(() => _formError = 'Enter the sales tax paid as an amount, or leave it blank.');
    }
    setState(() => _composer = _Composer.none);
    if (_sales) {
      await propose(
        _exempt
            ? 'Sale: ${rupees(amount)}, exempt from sales tax'
            : 'Sale: ${rupees(amount)} + sales tax (${_jurisdiction.text.trim().toUpperCase()})',
        'create_invoice',
        usSaleArgs(
          partyName: widget.partyName,
          description: _what.text,
          amount: amount,
          taxJurisdiction: _jurisdiction.text,
          taxExempt: _exempt,
          exemptionReason: _exemptionReason.text,
        ),
      );
    } else {
      await propose(
        'Bill: ${rupees(amount)}${taxPaid! > 0 ? ' + ${rupees(taxPaid)} sales tax' : ''}',
        'create_purchase',
        usBillArgs(
          partyName: widget.partyName,
          description: _what.text,
          amount: amount,
          salesTaxPaid: taxPaid,
          supplierInvoiceNo: _billNo.text,
        ),
      );
    }
    _billNo.clear();
    _taxPaid.clear();
    _exemptionReason.clear();
    setState(() => _exempt = false);
  }

  Future<void> _submitDocument() async {
    final amount = parseAmount(_amount.text);
    if (_us) return _submitUsDocument(amount);
    final rate = parseRate(_rate.text);
    if (amount == null) {
      return setState(() => _formError = 'Enter the amount before GST.');
    }
    if (rate == null) {
      return setState(
        () => _formError =
            'Enter the GST rate, for example 5 or 18. Use 0 if there is none.',
      );
    }
    final tdsProblem = _sales ? null : _tds.problem();
    if (tdsProblem != null) return setState(() => _formError = tdsProblem);
    setState(() => _composer = _Composer.none);
    final what = _sales ? 'Sale' : 'Bill';
    if (_repeat.isNotEmpty) {
      final args = documentArgs(
        partyName: widget.partyName,
        partyGstin: widget.partyGstin,
        description: _what.text,
        amount: amount,
        gstRate: rate,
      );
      if ((args['partyGstin'] as String).isEmpty) args.remove('partyGstin');
      args.remove('supplierInvoiceNo');
      await propose(
        '$what: ${rupees(amount)} + GST at ${rateLabel(rate)}%, ${(repeatEveryLabels[_repeat] ?? _repeat).toLowerCase()}',
        'add_recurring',
        {
          ...args,
          'kind': _sales ? 'invoice' : 'bill',
          'every': _repeat,
          'startDate': isoDate(AppScope.of(context).now()),
        },
      );
      setState(() => _repeat = '');
      _billNo.clear();
      return;
    }
    await propose(
      '$what: ${rupees(amount)} + GST at ${rateLabel(rate)}%${!_sales && _tds.chosen ? ', TDS ${_tds.option.section}' : ''}',
      _sales ? 'create_invoice' : 'create_purchase',
      {
        ...documentArgs(
          partyName: widget.partyName,
          partyGstin: widget.partyGstin,
          description: _what.text,
          amount: amount,
          gstRate: rate,
          supplierInvoiceNo: _sales ? '' : _billNo.text,
        ),
        if (!_sales) ..._tds.args(),
      },
    );
    _billNo.clear();
    _tds.reset();
  }

  Future<void> _submitQuote() async {
    final amount = parseAmount(_amount.text);
    if (_us) {
      if (amount == null) {
        return setState(() => _formError = 'Enter the amount before sales tax.');
      }
      if (!_exempt && _jurisdiction.text.trim().isEmpty) {
        return setState(() => _formError = 'Say which sales tax applies, for example TX or TX-AUSTIN, or mark the quote exempt.');
      }
      if (_exempt && _exemptionReason.text.trim().isEmpty) {
        return setState(() => _formError = 'Say why this quote is exempt.');
      }
      setState(() => _composer = _Composer.none);
      final args = usSaleArgs(partyName: widget.partyName, description: _what.text, amount: amount, taxJurisdiction: _jurisdiction.text, taxExempt: _exempt, exemptionReason: _exemptionReason.text);
      args.remove('partyGstin');
      if (_docKind != 'quote') args['kind'] = _docKind;
      if (_docKind == 'challan') args['reason'] = _challanReason;
      final label = salesDocumentLabel(_docKind);
      await propose(_exempt ? '$label: ${rupees(amount)}, exempt from sales tax' : '$label: ${rupees(amount)} + sales tax (${_jurisdiction.text.trim().toUpperCase()})', 'create_quote', args);
      setState(() => _exempt = false);
      return;
    }
    final rate = parseRate(_rate.text);
    if (amount == null) {
      return setState(() => _formError = 'Enter the amount before GST.');
    }
    if (rate == null) {
      return setState(
        () => _formError =
            'Enter the GST rate, for example 5 or 18. Use 0 if there is none.',
      );
    }
    setState(() => _composer = _Composer.none);
    final args = documentArgs(
      partyName: widget.partyName,
      partyGstin: widget.partyGstin,
      description: _what.text,
      amount: amount,
      gstRate: rate,
    );
    if ((args['partyGstin'] as String).isEmpty) args.remove('partyGstin');
    if (_docKind != 'quote') args['kind'] = _docKind;
    if (_docKind == 'challan') args['reason'] = _challanReason;
    await propose(
      '${salesDocumentLabel(_docKind)}: ${rupees(amount)} + GST at ${rateLabel(rate)}%${_docKind == 'challan' ? ' (${(challanReasonLabels[_challanReason] ?? _challanReason).toLowerCase()})' : ''}',
      'create_quote',
      args,
    );
  }

  Future<void> _submitPayment() async {
    final amount = parseAmount(_amount.text);
    final invoiceId = _invoiceId;
    if (amount == null || invoiceId == null) {
      return setState(
        () => _formError = _sales
            ? 'Enter the amount received.'
            : 'Enter the amount paid.',
      );
    }
    final received = isoDate(AppScope.of(context).now());
    setState(() => _composer = _Composer.none);
    if (!_sales) {
      await propose(
        'Paid ${rupees(amount)} by $_mode against $invoiceId',
        'record_payment',
        {
          'billId': invoiceId,
          'amount': amount,
          'mode': _mode,
          'date': received,
        },
      );
      return;
    }
    await propose(
      'Received ${rupees(amount)} by $_mode against $invoiceId',
      'record_receipt',
      {
        'invoiceId': invoiceId,
        'amount': amount,
        'mode': _mode,
        'date': received,
      },
    );
  }

  Future<void> _tdsWithheld(Party party) async {
    final today = AppScope.of(context).now();
    final draft = await showModalBottomSheet<_TdsWithheldDraft>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => _TdsWithheldSheet(
        partyName: party.name,
        invoices: party.unpaid,
        today: today,
      ),
    );
    if (draft == null || !mounted) return;
    await propose(
      'TDS withheld ${rupees(draft.amount)} against ${draft.invoiceId} (section ${draft.section})',
      'record_tds_withheld',
      {
        'invoiceId': draft.invoiceId,
        'amount': draft.amount,
        'date': draft.date,
        'section': draft.section,
        if (draft.tan.isNotEmpty) 'tan': draft.tan,
      },
    );
  }

  Future<void> _setTerms(Party party) async {
    final current = AppScope.of(
      context,
    ).snapshot?.termsFor(party.name, party.gstin);
    final days = await showModalBottomSheet<int>(
      context: context,
      builder: (sheet) {
        final text = Theme.of(sheet).textTheme;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(22, 4, 22, 22),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'How long does ${party.name} have to pay?',
                  style: text.headlineSmall,
                ),
                const SizedBox(height: 6),
                Text(
                  'New invoices get a due date. Invoices already raised keep theirs.',
                  style: text.bodySmall,
                ),
                const SizedBox(height: 14),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final choice in const [0, 7, 15, 30, 45, 60, 90])
                      ChoiceChip(
                        label: Text(termsLabel(choice)),
                        selected: choice == current,
                        selectedColor: Palette.sunken,
                        showCheckmark: false,
                        onSelected: (_) => Navigator.of(sheet).pop(choice),
                      ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
    if (days == null || !mounted || days == current) return;
    await propose('${party.name}: ${termsLabel(days)}', 'set_payment_terms', {
      'partyName': party.name,
      if (party.gstin.isNotEmpty) 'partyGstin': party.gstin,
      'days': days,
    });
  }

  Future<void> _setSupplierTerms(Party party) async {
    final draft = await showModalBottomSheet<_SupplierTermsDraft>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _SupplierTermsSheet(name: party.name),
    );
    if (draft == null || !mounted) return;
    final days = draft.days;
    final said = [
      draft.msme ? 'MSME supplier' : 'Not MSME',
      if (draft.category.isNotEmpty) draft.category,
      if (days != null) termsLabel(days),
    ].join(', ');
    await propose(
      '${party.name}: $said',
      'set_supplier_terms',
      {
        'partyName': party.name,
        if (party.gstin.isNotEmpty) 'partyGstin': party.gstin,
        'msme': draft.msme,
        if (draft.udyam.isNotEmpty) 'udyam': draft.udyam,
        if (draft.category.isNotEmpty) 'category': draft.category,
        'days': ?days,
      },
    );
  }

  List<Widget> _history(Party party) {
    final what = _sales ? 'Invoice' : 'Bill';
    final notes =
        AppScope.of(context).snapshot?.creditNotes ?? const <CreditNote>[];
    List<CreditNote> notesFor(String id) =>
        notes.where((note) => note.invoiceId == id).toList();
    final today = isoDate(AppScope.of(context).now());
    final quotes = _sales
        ? (AppScope.of(context).snapshot?.quotes ?? const <Quote>[])
              .where(
                (quote) => partyKey(quote.partyName) == partyKey(party.name),
              )
              .toList()
        : const <Quote>[];
    final groups = <(String, List<Widget>)>[
      for (final quote in quotes)
        (
          quote.date,
          [
            Bubble(
              text: '${quote.label} ${quote.id}',
              amount: rupees(quote.total),
              tone: BubbleTone.plain,
              label: quote.date,
              stamp: switch (quote.stateOn(today)) {
                'accepted' => 'Accepted',
                'declined' => 'Declined',
                'invoiced' => 'Invoiced',
                'expired' => 'Expired',
                'cancelled' => 'Cancelled',
                'returned' => 'Came back',
                _ => 'Open',
              },
              footnotes: [
                if (quote.stateOn(today) == 'open' && quote.expires)
                  'Valid until ${longDate(quote.validUntil)}',
                if (quote.kind == 'challan' && quote.reason.isNotEmpty)
                  challanReasonLabels[quote.reason] ?? quote.reason,
                if (quote.invoiceId.isNotEmpty) 'Became ${quote.invoiceId}',
                'Tap to view or send',
              ],
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) =>
                      InvoiceScreen(invoiceId: quote.id, quote: true),
                ),
              ),
            ),
          ],
        ),
      for (final doc in party.documents)
        (doc.date, _documentBubbles(doc, what, notesFor)),
    ]..sort((a, b) => a.$1.compareTo(b.$1));
    return [for (final group in groups) ...group.$2];
  }

  List<Widget> _documentBubbles(
    Invoice doc,
    String what,
    List<CreditNote> Function(String) notesFor,
  ) {
    final payBy = _payBy(doc);
    return [
      ...[
        Bubble(
          text: '$what ${doc.id}',
          amount: rupees(doc.total),
          tone: BubbleTone.plain,
          label: doc.date,
          stamp: doc.cancelled
              ? 'Cancelled'
              : doc.paid
              ? 'Paid'
              : (!_sales && doc.partial)
              ? 'Part paid'
              : 'Unpaid',
          footnotes: _sales
              ? [
                  if (dueWords(
                    doc.dueDate,
                    AppScope.of(context).now(),
                    open: doc.open,
                  ).isNotEmpty)
                    dueWords(
                      doc.dueDate,
                      AppScope.of(context).now(),
                      open: doc.open,
                    ),
                  'Tap to view or send',
                ]
              : [
                  if (doc.partial) '${rupees(doc.owed)} still owed',
                  if (payBy != null) 'Pay by ${longDate(payBy.date)}${payBy.msme ? ' (MSME)' : ''}',
                  if (_riskByBill.containsKey(doc.id)) 'Credit at risk: ${_riskByBill[doc.id]}',
                ],
          onTap: _sales
              ? () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => _ae ? UaeInvoiceScreen(invoiceId: doc.id) : InvoiceScreen(invoiceId: doc.id),
                  ),
                )
              : null,
        ),
        for (final note in notesFor(doc.id))
          Bubble(
            text: note.cancels
                ? 'Cancelled ${doc.id}: ${note.reason}'
                : 'Credit note ${note.id} against ${doc.id}: ${note.reason}',
            amount: '−${rupees(note.total)}',
            tone: BubbleTone.plain,
            label: note.date,
          ),
        for (final receipt in doc.receipts)
          Bubble(
            text: receipt.tds
                ? 'TDS withheld${receipt.section.isEmpty ? '' : ' (${receipt.section})'} against ${doc.id}'
                : 'Received by ${receipt.mode} against ${doc.id}',
            amount: rupees(receipt.amount),
            tone: BubbleTone.plain,
            label: receipt.date,
            footnotes: [
              if (receipt.tds && receipt.tan.isNotEmpty) 'TAN ${receipt.tan}',
            ],
          ),
        for (final payment in doc.payments)
          Bubble(
            text: 'Paid by ${payment.mode} against ${doc.id}',
            amount: rupees(payment.amount),
            tone: BubbleTone.plain,
            label: payment.date,
          ),

      ],
    ];
  }

  @override
  Widget build(BuildContext context) {
    final snapshot = AppScope.of(context).snapshot;
    final documents = snapshot == null
        ? const <Invoice>[]
        : (_sales ? snapshot.invoices : snapshot.purchases);
    final party = partyNamed(documents, widget.partyName, widget.partyGstin);
    final tint = _sales ? Tint.sales : Tint.purchases;
    final history = _history(party);
    final rates = ratesUsedBefore(
      party.documents.isEmpty ? documents : party.documents,
    );
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            TintTile(tint: tint, letter: party.initial, size: 34),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    party.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    _ae
                        ? _aeSubtitle(party)
                        : party.gstin.isEmpty
                        ? (_sales ? 'Customer' : 'Supplier')
                        : party.gstin,
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: Palette.muted),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          if (_sales)
            IconButton(
              tooltip: 'Statement of account',
              icon: const Icon(Icons.receipt_long_outlined),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => StatementsScreen(
                    initial: StatementKind.customer,
                    customer: party.name,
                  ),
                ),
              ),
            ),
          if (_sales && !_us && !_ae)
            IconButton(
              tooltip: 'Remind customer',
              icon: const Icon(Icons.notifications_active_outlined),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => RemindCustomerScreen(customer: party.name),
                ),
              ),
            ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              children: [
                if (history.isEmpty && entries.isEmpty)
                  EmptyNote(
                    text: _sales
                        ? 'Nothing logged for ${party.name} yet. Enter the sale below and you will see it before it is posted.'
                        : 'Nothing logged for ${party.name} yet. Enter the bill below and you will see it before it is posted.',
                  ),
                ...history,
                for (final entry in entries) entry.toBubble(),
              ],
            ),
          ),
          if (pending != null)
            ProposalBar(
              busy: busy,
              onPost: postPending,
              onDiscard: discardPending,
              postLabel: _proposedTool == 'set_supplier_terms' ? 'Yes' : 'Post it',
            )
          else if (_composer == _Composer.none)
            _ActionChips(
              busy: busy,
              sales: _sales,
              again: _postedHere,
              canReceive: party.unpaid.isNotEmpty,
              terms: _sales
                  ? (snapshot?.termsFor(party.name, party.gstin))
                  : null,
              onDocument: _ae ? () => _openAe(party) : () => _open(_Composer.document, party),
              onPayment: () => _open(_Composer.payment, party),
              onTdsWithheld: _sales && !_us && !_ae && party.unpaid.isNotEmpty
                  ? () => _tdsWithheld(party)
                  : null,
              onQuote: _sales && !_ae ? () => _open(_Composer.quote, party) : null,
              onDebitNote: !_sales && !_ae && party.documents.any((d) => !d.cancelled) ? () => _open(_Composer.purchaseNote, party) : null,
              onTerms: _sales ? () => _setTerms(party) : null,
              onSupplierTerms: !_sales && !_us && !_ae && _ownsBooks ? () => _setSupplierTerms(party) : null,
            )
          else
            _ComposerCard(
              title: _composer == _Composer.payment
                  ? (_sales ? 'Payment received' : 'Payment made')
                  : _composer == _Composer.quote
                  ? 'New ${salesDocumentLabel(_docKind).toLowerCase()}'
                  : _composer == _Composer.purchaseNote
                  ? 'Debit note to supplier'
                  : (_sales ? 'New sale' : 'New bill'),
              error: _formError,
              onCancel: () => setState(() => _composer = _Composer.none),
              onSubmit: _composer == _Composer.payment
                  ? _submitPayment
                  : _composer == _Composer.quote
                  ? _submitQuote
                  : _composer == _Composer.purchaseNote
                  ? _submitPurchaseNote
                  : _submitDocument,
              children: _composer == _Composer.payment
                  ? _paymentFields(party)
                  : _composer == _Composer.purchaseNote
                  ? _purchaseNoteFields(party)
                  : _composer == _Composer.quote
                  ? [..._salesKindFields(), ...(_us ? _usDocumentFields() : _documentFields(rates))]
                  : [..._documentFields(rates), if (!_us) ..._repeatFields()],
            ),
        ],
      ),
    );
  }

  List<Widget> _salesKindFields() => [
    Wrap(
      spacing: 8,
      runSpacing: 4,
      children: [
        for (final kind in salesDocumentKinds)
          ChoiceChip(
            key: ValueKey('kind.$kind'),
            label: Text(salesDocumentLabel(kind)),
            selected: _docKind == kind,
            onSelected: (_) => setState(() => _docKind = kind),
          ),
      ],
    ),
    if (_docKind == 'challan') ...[
      const SizedBox(height: 10),
      DropdownButtonFormField<String>(
        key: const ValueKey('challan.reason'),
        isExpanded: true,
        initialValue: _challanReason,
        decoration: const InputDecoration(labelText: 'Why the goods are moving'),
        items: [
          for (final entry in challanReasonLabels.entries)
            DropdownMenuItem(value: entry.key, child: Text(entry.value)),
        ],
        onChanged: (value) => setState(() => _challanReason = value ?? 'other'),
      ),
    ],
    const SizedBox(height: 10),
  ];

  List<Widget> _repeatFields() => [
    const SizedBox(height: 10),
    DropdownButtonFormField<String>(
      key: const ValueKey('repeat.every'),
      isExpanded: true,
      initialValue: _repeat,
      decoration: const InputDecoration(
        labelText: 'Repeat',
        helperText: 'From today, posted on each date',
        helperMaxLines: 2,
      ),
      items: [
        const DropdownMenuItem(value: '', child: Text('Does not repeat')),
        for (final entry in repeatEveryLabels.entries)
          DropdownMenuItem(value: entry.key, child: Text(entry.value)),
      ],
      onChanged: (value) => setState(() => _repeat = value ?? ''),
    ),
  ];

  List<Widget> _usDocumentFields() => [
    if (!_sales) ...[
      TextField(
        controller: _billNo,
        textCapitalization: TextCapitalization.characters,
        inputFormatters: const [Utf16LengthLimit(16)],
        decoration: const InputDecoration(
          labelText: 'Supplier\'s bill number',
          helperText: 'As printed on the bill.',
          counterText: '',
        ),
      ),
      const SizedBox(height: 10),
    ],
    TextField(
      controller: _amount,
      autofocus: true,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      textInputAction: TextInputAction.next,
      decoration: const InputDecoration(
        labelText: 'Amount before sales tax',
        prefixText: '\$ ',
      ),
    ),
    const SizedBox(height: 10),
    if (_sales) ...[
      Row(
        children: [
          const Expanded(child: Text('Exempt from sales tax')),
          Switch(
            value: _exempt,
            onChanged: (value) => setState(() => _exempt = value),
          ),
        ],
      ),
      if (_exempt)
        TextField(
          controller: _exemptionReason,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(
            labelText: 'Why it is exempt',
            helperText: 'For example a resale certificate on file. It is printed on the invoice.',
          ),
        )
      else ...[
        TextField(
          controller: _jurisdiction,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(
            labelText: 'Sales tax jurisdiction',
            helperText: 'A code you have recorded a rate for, such as TX or TX-AUSTIN. The rate on the invoice date is used.',
          ),
        ),
        if (_salesTaxRates.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              for (final rate in _salesTaxRates)
                ActionChip(
                  label: Text('${rate.code} ${plainNumber(rate.ratePercent)}%'),
                  visualDensity: VisualDensity.compact,
                  onPressed: () => setState(() => _jurisdiction.text = rate.code),
                ),
            ],
          ),
        ],
      ],
    ] else
      TextField(
        controller: _taxPaid,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: const InputDecoration(
          labelText: 'Sales tax paid (optional)',
          prefixText: '\$ ',
          helperText: 'Part of the cost; there is no credit for it.',
        ),
      ),
    const SizedBox(height: 10),
    TextField(
      controller: _what,
      textCapitalization: TextCapitalization.sentences,
      decoration: InputDecoration(
        labelText: _sales ? 'What was sold (optional)' : 'What was bought (optional)',
      ),
    ),
  ];

  List<Widget> _documentFields(List<num> rates) => [
    if (_us) ..._usDocumentFields() else ..._indianDocumentFields(rates),
  ];

  List<Widget> _indianDocumentFields(List<num> rates) => [
    if (!_sales &&
        (AppScope.of(context).snapshot?.company.tdsDeductor ?? false)) ...[
      TdsFields(choice: _tds),
      const SizedBox(height: 10),
    ],
    if (!_sales) ...[
      TextField(
        controller: _billNo,
        textCapitalization: TextCapitalization.characters,
        inputFormatters: const [Utf16LengthLimit(16)],
        decoration: const InputDecoration(
          labelText: 'Supplier\'s bill number',
          helperText:
              'As printed on the bill. It is how the bill is found in GSTR-2B.',
          counterText: '',
        ),
      ),
      const SizedBox(height: 10),
    ],
    Row(
      children: [
        Expanded(
          flex: 3,
          child: TextField(
            controller: _amount,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Amount before GST',
              prefixText: '₹ ',
            ),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          flex: 2,
          child: TextField(
            controller: _rate,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'GST',
              suffixText: '%',
            ),
          ),
        ),
      ],
    ),
    if (rates.isNotEmpty) ...[
      const SizedBox(height: 8),
      Wrap(
        spacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text(
            'Used before',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: Palette.muted),
          ),
          for (final rate in rates)
            ActionChip(
              label: Text('${rateLabel(rate)}%'),
              visualDensity: VisualDensity.compact,
              onPressed: () => setState(() => _rate.text = rateLabel(rate)),
            ),
        ],
      ),
    ],
    const SizedBox(height: 10),
    TextField(
      controller: _what,
      textCapitalization: TextCapitalization.sentences,
      decoration: InputDecoration(
        labelText: _sales
            ? 'What was sold (optional)'
            : 'What was bought (optional)',
      ),
    ),
  ];

  List<Widget> _paymentFields(Party party) => [
    DropdownButtonFormField<String>(
      initialValue: _invoiceId,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: _sales ? 'Against invoice' : 'Against bill',
      ),
      items: [
        for (final doc in party.unpaid)
          DropdownMenuItem(
            value: doc.id,
            child: Text(
              '${doc.id} · ${rupees(_stillOwed(doc))} owed',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
      ],
      onChanged: (value) => setState(() {
        _invoiceId = value;
        final chosen = party.unpaid.where((doc) => doc.id == value);
        if (chosen.isNotEmpty) _amount.text = plainNumber(_stillOwed(chosen.first));
      }),
    ),
    const SizedBox(height: 10),
    TextField(
      controller: _amount,
      autofocus: true,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: InputDecoration(
        labelText: _sales ? 'Amount received' : 'Amount paid',
        prefixText: moneyPrefix,
      ),
    ),
    const SizedBox(height: 10),
    Wrap(
      spacing: 8,
      children: [
        for (final mode in const ['bank', 'cash'])
          ChoiceChip(
            label: Text(mode == 'bank' ? (_ae ? UaeStrings.of(context).bank : 'Bank or UPI') : 'Cash'),
            selected: _mode == mode,
            selectedColor: Palette.sunken,
            showCheckmark: false,
            onSelected: (_) => setState(() => _mode = mode),
          ),
      ],
    ),
  ];
}
