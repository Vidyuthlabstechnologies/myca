import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../proposal_flow.dart';
import '../registers.dart';
import '../theme.dart';
import '../widgets.dart';
import 'invoice_screen.dart';

enum _Composer { none, document, payment }

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
  late _Composer _composer = widget.openComposer
      ? _Composer.document
      : _Composer.none;
  String? _invoiceId;
  String _mode = 'bank';
  String _formError = '';
  bool _postedHere = false;

  bool get _sales => widget.kind == RegisterKind.sales;

  @override
  MycaApi get api => AppScope.of(context).api;

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
    super.dispose();
  }

  void _open(_Composer composer, Party party) => setState(() {
    _composer = composer;
    _formError = '';
    _amount.clear();
    if (composer == _Composer.payment) _invoiceId = party.unpaid.first.id;
  });

  Future<void> _submitDocument() async {
    final amount = parseAmount(_amount.text);
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
    final what = _sales ? 'Sale' : 'Bill';
    await propose(
      '$what: ${rupees(amount)} + GST at ${rateLabel(rate)}%',
      _sales ? 'create_invoice' : 'create_purchase',
      documentArgs(
        partyName: widget.partyName,
        partyGstin: widget.partyGstin,
        description: _what.text,
        amount: amount,
        gstRate: rate,
        supplierInvoiceNo: _sales ? '' : _billNo.text,
      ),
    );
    _billNo.clear();
  }

  Future<void> _submitPayment() async {
    final amount = parseAmount(_amount.text);
    final invoiceId = _invoiceId;
    if (amount == null || invoiceId == null) {
      return setState(() => _formError = 'Enter the amount received.');
    }
    final received = isoDate(AppScope.of(context).now());
    setState(() => _composer = _Composer.none);
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

  List<Widget> _history(Party party) {
    final what = _sales ? 'Invoice' : 'Bill';
    final notes =
        AppScope.of(context).snapshot?.creditNotes ?? const <CreditNote>[];
    List<CreditNote> notesFor(String id) =>
        notes.where((note) => note.invoiceId == id).toList();
    return [
      for (final doc in party.documents) ...[
        Bubble(
          text: '$what ${doc.id}',
          amount: rupees(doc.total),
          tone: BubbleTone.plain,
          label: doc.date,
          stamp: _sales
              ? (doc.cancelled ? 'Cancelled' : (doc.paid ? 'Paid' : 'Unpaid'))
              : null,
          footnotes: _sales ? const ['Tap to view or send'] : const [],
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
              canReceive: _sales && party.unpaid.isNotEmpty,
              onDocument: () => _open(_Composer.document, party),
              onPayment: () => _open(_Composer.payment, party),
            )
          else
            _ComposerCard(
              title: _composer == _Composer.payment
                  ? 'Payment received'
                  : (_sales ? 'New sale' : 'New bill'),
              error: _formError,
              onCancel: () => setState(() => _composer = _Composer.none),
              onSubmit: _composer == _Composer.payment
                  ? _submitPayment
                  : _submitDocument,
              children: _composer == _Composer.payment
                  ? _paymentFields(party)
                  : _documentFields(rates),
            ),
        ],
      ),
    );
  }

  List<Widget> _documentFields(List<num> rates) => [
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
      decoration: const InputDecoration(labelText: 'Against invoice'),
      items: [
        for (final doc in party.unpaid)
          DropdownMenuItem(
            value: doc.id,
            child: Text('${doc.id} · ${rupees(doc.total)}'),
          ),
      ],
      onChanged: (value) => setState(() => _invoiceId = value),
    ),
    const SizedBox(height: 10),
    TextField(
      controller: _amount,
      autofocus: true,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      decoration: const InputDecoration(
        labelText: 'Amount received',
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
  });

  final bool busy;
  final bool sales;
  final bool again;
  final bool canReceive;
  final VoidCallback onDocument;
  final VoidCallback onPayment;

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
                  avatar: const Icon(Icons.south_west, size: 18),
                  label: const Text('Payment received'),
                  onPressed: busy ? null : onPayment,
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
