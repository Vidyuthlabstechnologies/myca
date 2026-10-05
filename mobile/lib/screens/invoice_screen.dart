import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../invoice_pdf.dart';
import '../theme.dart';

const _missingWords = {
  'SELLER_GSTIN': 'your GSTIN',
  'SELLER_ADDRESS': 'your business address',
  'HSN': 'an HSN or SAC code on every item',
};

String missingNote(List<String> codes) {
  final words = [for (final code in codes) _missingWords[code] ?? code.toLowerCase().replaceAll('_', ' ')];
  if (words.isEmpty) return '';
  final list = words.length == 1 ? words.single : '${words.sublist(0, words.length - 1).join(', ')} and ${words.last}';
  return 'This invoice does not carry $list. Check with your CA whether your buyer needs it before you send this.';
}

class InvoiceScreen extends StatefulWidget {
  const InvoiceScreen({super.key, required this.invoiceId});

  final String invoiceId;

  @override
  State<InvoiceScreen> createState() => _InvoiceScreenState();
}

class _InvoiceScreenState extends State<InvoiceScreen> {
  Future<InvoiceDocument?>? _document;
  bool _busy = false;
  String _note = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _document ??= _load();
  }

  Future<InvoiceDocument?> _load() async {
    final body = await AppScope.of(context).api.query('invoice_document', {'id': widget.invoiceId});
    return InvoiceDocument.fromTool(body);
  }

  void _reload() {
    final next = _load();
    setState(() {
      _document = next;
    });
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
      final done = await (share ? pdf.share : pdf.print)(invoiceFileName(doc), bytes);
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
                      error is MycaApiException ? error.message : 'This invoice could not be opened.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 16),
                    FilledButton(onPressed: _reload, child: const Text('Try again')),
                  ],
                ),
              ),
            );
          }
          return _InvoiceBody(
            doc: doc,
            busy: _busy,
            note: _note,
            onShare: () => _send(doc, share: true),
            onPrint: () => _send(doc, share: false),
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
    required this.onShare,
    required this.onPrint,
  });

  final InvoiceDocument doc;
  final bool busy;
  final String note;
  final VoidCallback onShare;
  final VoidCallback onPrint;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final money = text.bodyLarge?.copyWith(fontFeatures: moneyFigures);
    final missing = missingNote(doc.missing);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
      children: [
        _Sheet(
          children: [
            Text(doc.title.toUpperCase(), style: text.labelSmall),
            const SizedBox(height: 6),
            Text(doc.sellerName, style: text.titleLarge),
            if (doc.sellerAddress.isNotEmpty) Text(doc.sellerAddress, style: text.bodySmall),
            if (doc.sellerGstin.isNotEmpty) Text('GSTIN ${doc.sellerGstin}', style: text.bodyMedium),
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
                      if (doc.buyerGstin.isNotEmpty) Text('GSTIN ${doc.buyerGstin}', style: text.bodySmall),
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
                  Expanded(child: Text(line.description.isEmpty ? 'Item' : line.description, style: text.titleMedium)),
                  const SizedBox(width: 12),
                  Text(rupees(line.amount), style: text.titleMedium?.copyWith(fontFeatures: moneyFigures)),
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
            for (final (name, amount) in doc.taxHeads) _Amount(name: name, amount: amount, style: money),
            const SizedBox(height: 6),
            _Amount(
              name: 'Total',
              amount: doc.total,
              style: text.titleLarge?.copyWith(fontFeatures: moneyFigures),
            ),
            if (doc.received > 0) ...[
              const SizedBox(height: 6),
              _Amount(name: 'Received', amount: doc.received, style: money),
              _Amount(name: 'Balance', amount: doc.balance, style: money),
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
            onPressed: busy ? null : onShare,
            child: Text(busy ? 'Preparing…' : 'Send to ${doc.buyerName}'),
          ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(onPressed: busy ? null : onPrint, child: const Text('Print or save as PDF')),
        ),
        const SizedBox(height: 10),
        Text(
          note.isEmpty
              ? 'You choose WhatsApp, email or another app, and it goes from your own account. MyCA sends nothing by itself.'
              : note,
          style: note.isEmpty ? text.bodySmall : text.bodyMedium?.copyWith(color: Palette.ink),
        ),
      ],
    );
  }
}

class _Amount extends StatelessWidget {
  const _Amount({required this.name, required this.amount, required this.style});

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
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
    );
  }
}
