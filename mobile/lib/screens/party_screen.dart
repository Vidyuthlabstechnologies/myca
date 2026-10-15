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
import '../widgets.dart';
import 'invoice_screen.dart';

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
  List<SalesTaxRate> _salesTaxRates = const [];
  late _Composer _composer = widget.openComposer
      ? _Composer.document
      : _Composer.none;
  String? _invoiceId;
  String _mode = 'bank';
  String _formError = '';
  bool _postedHere = false;
  Map<String, String> _riskByBill = const {};
  bool _risksLoaded = false;

  bool get _sales => widget.kind == RegisterKind.sales;

  bool get _us => (AppScope.of(context).snapshot?.company.country ?? 'IN') == 'US';

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_us && _sales && _salesTaxRates.isEmpty) _loadSalesTaxRates();
    if (!_sales && !_us && !_risksLoaded) _loadRisks();
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
  Future<void> onPosted() async {
    HapticFeedback.mediumImpact();
    final messenger = ScaffoldMessenger.of(context);
    final confirmation = entries.isEmpty ? 'Posted.' : entries.last.text;
    await AppScope.of(context).refresh();
    if (!mounted) return;
    setState(() {
      entries.clear();
      _postedHere = true;
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

  void _open(_Composer composer, Party party) => setState(() {
    _composer = composer;
    _formError = '';
    _amount.clear();
    if (composer == _Composer.payment) {
      _invoiceId = party.unpaid.first.id;
      if (!_sales) _amount.text = plainNumber(party.unpaid.first.owed);
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
      decoration: const InputDecoration(labelText: 'Reduce the bill by', prefixText: '₹ '),
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
      await propose(_exempt ? 'Quote: ${rupees(amount)}, exempt from sales tax' : 'Quote: ${rupees(amount)} + sales tax (${_jurisdiction.text.trim().toUpperCase()})', 'create_quote', args);
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
    await propose(
      'Quote: ${rupees(amount)} + GST at ${rateLabel(rate)}%',
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
              text: 'Quote ${quote.id}',
              amount: rupees(quote.total),
              tone: BubbleTone.plain,
              label: quote.date,
              stamp: switch (quote.stateOn(today)) {
                'accepted' => 'Accepted',
                'declined' => 'Declined',
                'invoiced' => 'Invoiced',
                'expired' => 'Expired',
                _ => 'Open',
              },
              footnotes: [
                if (quote.stateOn(today) == 'open')
                  'Valid until ${longDate(quote.validUntil)}',
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
                  if (!doc.paid && !doc.cancelled && doc.dueDate.isNotEmpty) 'Pay by ${longDate(doc.dueDate)}${doc.msme ? ' (MSME)' : ''}',
                  if (_riskByBill.containsKey(doc.id)) 'Credit at risk: ${_riskByBill[doc.id]}',
                ],
          onTap: _sales
              ? () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => InvoiceScreen(invoiceId: doc.id),
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
            text: 'Received by ${receipt.mode} against ${doc.id}',
            amount: rupees(receipt.amount),
            tone: BubbleTone.plain,
            label: receipt.date,
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
                    party.gstin.isEmpty
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
              onDocument: () => _open(_Composer.document, party),
              onPayment: () => _open(_Composer.payment, party),
              onQuote: _sales ? () => _open(_Composer.quote, party) : null,
              onDebitNote: !_sales && party.documents.any((d) => !d.cancelled) ? () => _open(_Composer.purchaseNote, party) : null,
              onTerms: _sales ? () => _setTerms(party) : null,
            )
          else
            _ComposerCard(
              title: _composer == _Composer.payment
                  ? (_sales ? 'Payment received' : 'Payment made')
                  : _composer == _Composer.quote
                  ? 'New quote'
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
                  : _composer == _Composer.quote && _us
                  ? _usDocumentFields()
                  : _documentFields(rates),
            ),
        ],
      ),
    );
  }

  List<Widget> _usDocumentFields() => [
    if (!_sales) ...[
      TextField(
        controller: _billNo,
        textCapitalization: TextCapitalization.characters,
        maxLength: 16,
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
        maxLength: 16,
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
      decoration: InputDecoration(
        labelText: _sales ? 'Against invoice' : 'Against bill',
      ),
      items: [
        for (final doc in party.unpaid)
          DropdownMenuItem(
            value: doc.id,
            child: Text(
              _sales
                  ? '${doc.id} · ${rupees(doc.total)}'
                  : '${doc.id} · ${rupees(doc.owed)} owed',
            ),
          ),
      ],
      onChanged: (value) => setState(() {
        _invoiceId = value;
        if (_sales) return;
        final bill = party.unpaid.where((doc) => doc.id == value);
        if (bill.isNotEmpty) _amount.text = plainNumber(bill.first.owed);
      }),
    ),
    const SizedBox(height: 10),
    TextField(
      controller: _amount,
      autofocus: true,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: InputDecoration(
        labelText: _sales ? 'Amount received' : 'Amount paid',
        prefixText: '₹ ',
      ),
    ),
    const SizedBox(height: 10),
    Wrap(
      spacing: 8,
      children: [
        for (final mode in const ['bank', 'cash'])
          ChoiceChip(
            label: Text(mode == 'bank' ? 'Bank or UPI' : 'Cash'),
            selected: _mode == mode,
            selectedColor: Palette.sunken,
            showCheckmark: false,
            onSelected: (_) => setState(() => _mode = mode),
          ),
      ],
    ),
  ];
}

class _ActionChips extends StatelessWidget {
  const _ActionChips({
    required this.busy,
    required this.sales,
    required this.again,
    required this.canReceive,
    required this.onDocument,
    required this.onPayment,
    this.terms,
    this.onTerms,
    this.onQuote,
    this.onDebitNote,
  });

  final bool busy;
  final bool sales;
  final bool again;
  final bool canReceive;
  final VoidCallback onDocument;
  final VoidCallback onPayment;
  final int? terms;
  final VoidCallback? onTerms;
  final VoidCallback? onQuote;
  final VoidCallback? onDebitNote;

  @override
  Widget build(BuildContext context) {
    final label = sales
        ? (again ? 'Another sale' : 'Sale')
        : (again ? 'Another bill' : 'Bill');
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 14),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ActionChip(
                avatar: const Icon(Icons.add, size: 18),
                label: Text(label),
                onPressed: busy ? null : onDocument,
              ),
              if (canReceive)
                ActionChip(
                  avatar: Icon(
                    sales ? Icons.south_west : Icons.north_east,
                    size: 18,
                  ),
                  label: Text(sales ? 'Payment received' : 'Paid'),
                  onPressed: busy ? null : onPayment,
                ),
              if (onQuote != null)
                ActionChip(
                  label: const Text('Quote'),
                  onPressed: busy ? null : onQuote,
                ),
              if (onDebitNote != null)
                ActionChip(
                  label: const Text('Debit note'),
                  onPressed: busy ? null : onDebitNote,
                ),
              if (onTerms != null)
                ActionChip(
                  label: Text(
                    terms == null ? 'Set terms' : 'Terms: ${termsLabel(terms)}',
                  ),
                  onPressed: busy ? null : onTerms,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ComposerCard extends StatelessWidget {
  const _ComposerCard({
    required this.title,
    required this.error,
    required this.onCancel,
    required this.onSubmit,
    required this.children,
  });

  final String title;
  final String error;
  final VoidCallback onCancel;
  final VoidCallback onSubmit;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.fromLTRB(12, 4, 12, 12),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        decoration: BoxDecoration(
          color: Palette.surface,
          borderRadius: BorderRadius.circular(radiusCard),
          border: Border.all(color: Palette.line),
        ),
        constraints: BoxConstraints(
          maxHeight:
              (MediaQuery.sizeOf(context).height -
                  MediaQuery.viewInsetsOf(context).bottom) *
              0.62,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Cancel',
                    icon: const Icon(Icons.close),
                    onPressed: onCancel,
                  ),
                ],
              ),
              const SizedBox(height: 4),
              ...children,
              if (error.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  error,
                  style: const TextStyle(
                    color: Palette.danger,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
              const SizedBox(height: 12),
              FilledButton(onPressed: onSubmit, child: const Text('Preview')),
            ],
          ),
        ),
      ),
    );
  }
}
