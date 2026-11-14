import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../marks.dart';
import '../../proposal_flow.dart';
import '../../theme.dart';
import '../../uae/uae_emirates.dart';
import '../../uae/uae_format.dart';
import '../../uae/uae_strings.dart';
import '../../widgets.dart';
import 'uae_widgets.dart';

class UaeEinvoiceScreen extends StatefulWidget {
  const UaeEinvoiceScreen({super.key});

  @override
  State<UaeEinvoiceScreen> createState() => _UaeEinvoiceScreenState();
}

class _UaeEinvoiceScreenState extends State<UaeEinvoiceScreen> with ProposalFlow {
  final _number = TextEditingController();
  final _date = TextEditingController();
  final _buyer = TextEditingController();
  final _buyerTrn = TextEditingController();
  final _buyerAddress = TextEditingController();
  final _buyerCity = TextEditingController();
  final _item = TextEditingController();
  final _quantity = TextEditingController(text: '1');
  final _price = TextEditingController();
  String _buyerEmirate = 'DXB';
  String _category = 'S';
  String _note = '';
  bool _checking = false;
  Map<String, dynamic>? _ready;
  List<String> _problems = const [];
  Future<List<Map<String, dynamic>>>? _issued;

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  Future<void> onPosted() async {
    if (!mounted) return;
    setState(() {
      _ready = null;
      _issued = _loadIssued();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_issued != null) return;
    final now = AppScope.of(context).now();
    _date.text = '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    _issued = _loadIssued();
  }

  Future<List<Map<String, dynamic>>> _loadIssued() async {
    try {
      return uaeRows(toolData(await api.query('ae_einvoice_list'))['einvoices']);
    } on MycaApiException {
      return const [];
    }
  }

  @override
  void dispose() {
    for (final c in [_number, _date, _buyer, _buyerTrn, _buyerAddress, _buyerCity, _item, _quantity, _price]) {
      c.dispose();
    }
    super.dispose();
  }

  Map<String, Object?>? _invoice() {
    final quantity = num.tryParse(_quantity.text.trim());
    final price = parseDirhams(_price.text);
    if (quantity == null || price == null) return null;
    return {
      'type': 'invoice',
      'number': _number.text.trim(),
      'issueDate': _date.text.trim(),
      'currency': 'AED',
      'buyer': {
        'name': _buyer.text.trim(),
        if (_buyerTrn.text.trim().isNotEmpty) 'trn': _buyerTrn.text.replaceAll(RegExp(r'[\s-]'), ''),
        'country': 'AE',
        'addressLine': _buyerAddress.text.trim(),
        'city': _buyerCity.text.trim(),
        'emirate': _buyerEmirate,
        'vatRegistered': _buyerTrn.text.trim().isNotEmpty,
      },
      'lines': [
        {
          'name': _item.text.trim(),
          'quantity': quantity,
          'unitPrice': price,
          'taxCategory': _category,
          'itemType': 'S',
          if (_category == 'Z') 'exemptionReason': 'Zero rated supply',
          if (_category == 'E') 'exemptionReason': 'Exempt supply',
        },
      ],
    };
  }

  Future<void> _check() async {
    final s = UaeStrings.of(context);
    final invoice = _invoice();
    if (invoice == null) return setState(() => _note = s.badAmount);
    setState(() {
      _note = '';
      _checking = true;
    });
    Map<String, dynamic>? ready;
    var problems = const <String>[];
    try {
      final result = await api.query('ae_einvoice_check', invoice);
      final data = toolData(result);
      if (data['ready'] == true) {
        ready = data;
      } else {
        problems = uaeProblems(result, label: (field) => _fieldLabel(s, field));
        if (problems.isEmpty) problems = [uaeFailure(result).isEmpty ? s.couldNotWorkOut : uaeFailure(result)];
      }
    } on MycaApiException catch (err) {
      problems = [err.message];
    }
    if (!mounted) return;
    setState(() {
      _checking = false;
      _ready = ready;
      _problems = problems;
    });
  }

  String _fieldLabel(UaeStrings s, String field) {
    final key = field.replaceAll(RegExp(r'^lines\[\d+\]\.'), 'line.');
    return switch (key) {
      'number' => s.invoiceNumber,
      'issueDate' => s.issueDate,
      'seller' || 'seller.name' || 'seller.trn' || 'seller.legalId' || 'seller.addressLine' || 'seller.city' || 'seller.emirate' => s.profileTitle,
      'buyer' || 'buyer.name' => s.buyerName,
      'buyer.trn' => s.buyerTrn,
      'buyer.addressLine' => s.ar ? 'عنوان المشتري' : 'Buyer\'s address',
      'buyer.city' => s.ar ? 'مدينة المشتري' : 'Buyer\'s city',
      'buyer.emirate' => s.emirate,
      'lines' || 'line.name' => s.description,
      'line.quantity' => s.quantity,
      'line.unitPrice' => s.unitPrice,
      'line.taxCategory' || 'line.exemptionReason' => s.vatRate,
      _ => field,
    };
  }

  Future<void> _issue() async {
    final s = UaeStrings.of(context);
    final invoice = _invoice();
    if (invoice == null) return;
    await propose('${s.issueSandbox} ${_number.text.trim()}', 'issue_ae_einvoice', invoice);
  }

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final f = UaeFormat.of(context);
    final text = Theme.of(context).textTheme;
    Widget field(String key, TextEditingController c, String label, {TextDirection? direction, TextInputType? keyboard, String? hint}) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        key: ValueKey(key),
        controller: c,
        textDirection: direction,
        keyboardType: keyboard,
        onChanged: (_) {
          if (_ready == null && _problems.isEmpty) return;
          setState(() {
            _ready = null;
            _problems = const [];
          });
        },
        decoration: InputDecoration(label: Text(label, maxLines: 2), hintText: hint),
      ),
    );
    final ready = _ready;
    final totals = uaeMap(ready?['totals']);
    return Scaffold(
      appBar: AppBar(title: Text(s.einvoiceTitle)),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                Container(
                  key: const ValueKey('uae.einvoice.sandbox'),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: Palette.warnSoft, borderRadius: BorderRadius.circular(radiusControl)),
                  child: Text(s.sandboxNote, style: text.bodyMedium?.copyWith(color: Palette.ink)),
                ),
                const SizedBox(height: 16),
                field('uae.einvoice.number', _number, s.invoiceNumber, direction: TextDirection.ltr),
                field('uae.einvoice.date', _date, s.issueDate, direction: TextDirection.ltr, keyboard: TextInputType.datetime, hint: 'YYYY-MM-DD'),
                field('uae.einvoice.buyer', _buyer, s.buyerName),
                field('uae.einvoice.buyerTrn', _buyerTrn, s.buyerTrn, direction: TextDirection.ltr, keyboard: TextInputType.number),
                field('uae.einvoice.buyerAddress', _buyerAddress, s.ar ? 'عنوان المشتري' : 'Buyer\'s address'),
                field('uae.einvoice.buyerCity', _buyerCity, s.ar ? 'مدينة المشتري' : 'Buyer\'s city'),
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: DropdownButtonFormField<String>(
                    key: const ValueKey('uae.einvoice.emirate'),
                    initialValue: _buyerEmirate,
                    isExpanded: true,
                    decoration: InputDecoration(labelText: s.emirate),
                    items: [for (final e in emirates) DropdownMenuItem(value: e.code, child: Text(e.name(s.ar), overflow: TextOverflow.ellipsis))],
                    onChanged: (code) => setState(() => _buyerEmirate = code ?? 'DXB'),
                  ),
                ),
                field('uae.einvoice.item', _item, s.description),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: field('uae.einvoice.quantity', _quantity, s.quantity, direction: TextDirection.ltr, keyboard: const TextInputType.numberWithOptions(decimal: true))),
                    const SizedBox(width: 12),
                    Expanded(flex: 2, child: field('uae.einvoice.price', _price, s.unitPrice, direction: TextDirection.ltr, keyboard: const TextInputType.numberWithOptions(decimal: true))),
                  ],
                ),
                Text(s.vatRate, style: text.labelLarge),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final (code, label) in [('S', s.standard5), ('Z', s.zeroRated), ('E', s.exempt)])
                      ChoiceChip(
                        key: ValueKey('uae.einvoice.category.$code'),
                        label: Text(label),
                        selected: _category == code,
                        onSelected: (_) => setState(() {
                          _category = code;
                          _ready = null;
                        }),
                      ),
                  ],
                ),
                const SizedBox(height: 16),
                if (pending == null)
                  Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      OutlinedButton(key: const ValueKey('uae.einvoice.check'), onPressed: _checking || busy ? null : _check, child: Text(s.check)),
                      if (ready != null) FilledButton(key: const ValueKey('uae.einvoice.issue'), onPressed: busy ? null : _issue, child: Text(s.issueSandbox)),
                    ],
                  ),
                if (_note.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(_note, style: text.bodyMedium?.copyWith(color: Palette.danger)),
                ],
                if (_checking) const Padding(padding: EdgeInsets.all(20), child: Center(child: CircularProgressIndicator())),
                if (_problems.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  UaeNotes(key: const ValueKey('uae.einvoice.problems'), title: s.problemsToFix, notes: _problems, danger: true),
                ],
                if (ready != null) ...[
                  const SizedBox(height: 14),
                  Text(s.readyToIssue, key: const ValueKey('uae.einvoice.ready'), style: text.titleSmall?.copyWith(color: Palette.accent)),
                  const SizedBox(height: 8),
                  UaePanel(children: [
                    UaeFigure(label: s.ar ? 'المبلغ قبل الضريبة' : 'Before VAT', value: f.money(uaeNum(totals['net']))),
                    UaeFigure(label: s.vat, value: f.money(uaeNum(totals['taxAed'] ?? totals['tax'])), valueKey: const ValueKey('uae.einvoice.tax')),
                    UaeFigure(label: s.totalWithVat, value: f.money(uaeNum(totals['payableAed'] ?? totals['payable'])), strong: true, valueKey: const ValueKey('uae.einvoice.total')),
                  ]),
                  for (final w in (ready['warnings'] as List? ?? const [])) ...[
                    const SizedBox(height: 6),
                    UaeAutoText('$w', style: text.bodySmall),
                  ],
                ],
                UaeThread(entries: entries),
                const SizedBox(height: 22),
                FutureBuilder<List<Map<String, dynamic>>>(
                  future: _issued,
                  builder: (context, snap) {
                    final rows = snap.data ?? const <Map<String, dynamic>>[];
                    if (rows.isEmpty) return const SizedBox.shrink();
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SectionLabel(s.issued),
                        Panel(
                          key: const ValueKey('uae.einvoice.issued'),
                          children: [
                            for (final row in rows)
                              RowCard(
                                leading: const TintTile(tint: Tint.taxes, mark: Mark.confirm),
                                title: '${uaeText(row['number'])} · ${f.money(uaeNum(uaeMap(row['totals'])['payableAed'] ?? uaeMap(row['totals'])['payable']))}',
                                subtitle: '${f.date(uaeText(row['issueDate']))} · UUID ${uaeText(row['uuid']).length > 13 ? uaeText(row['uuid']).substring(0, 13) : uaeText(row['uuid'])}…',
                              ),
                          ],
                        ),
                      ],
                    );
                  },
                ),
              ],
            ),
          ),
          if (pending != null) UaeConfirmBar(busy: busy, onConfirm: postPending, onDiscard: discardPending),
        ],
      ),
    );
  }
}
