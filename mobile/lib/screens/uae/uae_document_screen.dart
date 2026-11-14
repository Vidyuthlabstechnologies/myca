import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../theme.dart';
import '../../uae/uae_edition.dart';
import '../../uae/uae_emirates.dart';
import '../../uae/uae_format.dart';
import '../../uae/uae_strings.dart';
import 'uae_invoice_screen.dart';
import 'uae_taxes_screen.dart';
import 'uae_widgets.dart';
import 'uae_write.dart';

const uaeSaleTreatments = ['standard', 'zero-rated', 'exempt', 'out-of-scope'];
const uaeBillTreatments = ['standard', 'reverse-charge', 'import', 'import-adjustment', 'zero-rated', 'exempt', 'out-of-scope'];
const uaeCurrencies = ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'OMR', 'KWD', 'BHD', 'QAR'];
const _selfAccounted = {'reverse-charge', 'import', 'import-adjustment'};

class UaeSaleScreen extends StatelessWidget {
  const UaeSaleScreen({super.key, this.partyName = '', this.partyTrn = ''});

  final String partyName;
  final String partyTrn;

  @override
  Widget build(BuildContext context) => UaeDocumentScreen(purchase: false, partyName: partyName, partyTrn: partyTrn);
}

class UaePurchaseScreen extends StatelessWidget {
  const UaePurchaseScreen({super.key, this.partyName = '', this.partyTrn = ''});

  final String partyName;
  final String partyTrn;

  @override
  Widget build(BuildContext context) => UaeDocumentScreen(purchase: true, partyName: partyName, partyTrn: partyTrn);
}

class _Line {
  final description = TextEditingController();
  final qty = TextEditingController(text: '1');
  final price = TextEditingController();
  final vat = TextEditingController();
  String treatment = 'standard';
  bool blocked = false;

  bool get blank => description.text.trim().isEmpty && price.text.trim().isEmpty;

  void dispose() {
    description.dispose();
    qty.dispose();
    price.dispose();
    vat.dispose();
  }
}

class UaeTotals {
  const UaeTotals({this.net = 0, this.vat = 0, this.selfVat = 0, this.recoverable = 0});

  final int net;
  final int vat;
  final int selfVat;
  final int recoverable;

  int get total => net + vat;
}

class UaeDocumentScreen extends StatefulWidget {
  const UaeDocumentScreen({super.key, required this.purchase, this.partyName = '', this.partyTrn = ''});

  final bool purchase;
  final String partyName;
  final String partyTrn;

  @override
  State<UaeDocumentScreen> createState() => _UaeDocumentScreenState();
}

class _UaeDocumentScreenState extends State<UaeDocumentScreen> with UaeWriteFlow {
  late final _party = TextEditingController(text: widget.partyName);
  late final _trn = TextEditingController(text: widget.partyTrn);
  final _billNo = TextEditingController();
  final _date = TextEditingController();
  final _rate = TextEditingController();
  final _terms = TextEditingController();
  final _scroll = ScrollController();
  final _lines = <_Line>[_Line()];
  String? _emirate;
  bool _emirateTouched = false;
  String _currency = 'AED';
  String _note = '';
  Map<String, dynamic>? _done;
  bool _started = false;

  bool get _purchase => widget.purchase;

  String get _key => _purchase ? 'uae.bill' : 'uae.sale';

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    _date.text = uaeIsoDay(AppScope.of(context).now());
    _emirate = emirateByCode(uaeText(uaeProfile.value?['emirate']))?.code;
    if (!_purchase && _emirate == null) {
      loadUaeProfile(api).then((_) {
        if (!mounted || _emirateTouched) return;
        setState(() => _emirate = emirateByCode(uaeText(uaeProfile.value?['emirate']))?.code);
      });
    }
  }

  @override
  void dispose() {
    for (final c in [_party, _trn, _billNo, _date, _rate, _terms]) {
      c.dispose();
    }
    for (final line in _lines) {
      line.dispose();
    }
    _scroll.dispose();
    super.dispose();
  }

  num get _fx => _currency == 'AED' ? 1 : (parseUaeNumber(_rate.text) ?? 0);

  UaeTotals get _totals {
    var net = 0;
    var vat = 0;
    var selfVat = 0;
    var recoverable = 0;
    final fx = _fx;
    for (final line in _lines) {
      final qty = parseUaeNumber(line.qty.text) ?? 0;
      final price = parseDirhams(line.price.text) ?? 0;
      final lineNet = (qty * price * fx * 100).round();
      net += lineNet;
      if (line.treatment == 'standard') {
        final given = line.vat.text.trim().isEmpty ? null : parseDirhams(line.vat.text);
        final lineVat = _purchase && given != null ? (given * fx * 100).round() : (lineNet * 5 / 100).round();
        vat += lineVat;
        if (!line.blocked) recoverable += lineVat;
      } else if (_purchase && _selfAccounted.contains(line.treatment)) {
        final lineVat = (lineNet * 5 / 100).round();
        selfVat += lineVat;
        if (!line.blocked) recoverable += lineVat;
      }
    }
    return UaeTotals(net: net, vat: vat, selfVat: selfVat, recoverable: recoverable);
  }

  void _changed() {
    setState(() {
      _note = '';
      writeProblems = const [];
    });
  }

  Map<String, Object?>? _args(UaeStrings s) {
    String? fail;
    final party = _party.text.trim();
    final trn = uaeCleanTrn(_trn.text);
    final date = _date.text.trim();
    final rate = _rate.text.trim();
    final terms = _terms.text.trim();
    if (party.isEmpty) {
      fail = _purchase ? s.needSupplier : s.needCustomer;
    } else if (uaeTrnProblem(trn, length: s.trnLength, digitsOnly: s.trnDigitsOnly) case final problem?) {
      fail = problem;
    } else if (!uaeIsoDate(date)) {
      fail = s.badDate;
    } else if (_currency != 'AED' && rate.isNotEmpty && (parseUaeNumber(rate) ?? 0) <= 0) {
      fail = s.badRate;
    } else if (!_purchase && terms.isNotEmpty && (int.tryParse(terms) == null || int.parse(terms) < 0 || int.parse(terms) > 365)) {
      fail = s.badTerms;
    }
    final lines = <Map<String, Object?>>[];
    for (var at = 0; fail == null && at < _lines.length; at++) {
      final line = _lines[at];
      if (line.blank) continue;
      final qty = parseUaeNumber(line.qty.text);
      final price = parseDirhams(line.price.text);
      final vat = line.vat.text.trim().isEmpty ? null : parseDirhams(line.vat.text);
      if (qty == null || qty <= 0) {
        fail = s.badQuantity(at + 1);
      } else if (price == null || (_purchase && line.treatment == 'standard' && line.vat.text.trim().isNotEmpty && vat == null)) {
        fail = s.badPrice(at + 1);
      } else {
        lines.add({
          'description': line.description.text.trim(),
          'qty': qty,
          'rate': price,
          'treatment': line.treatment,
          if (_purchase && line.treatment == 'standard' && vat != null) 'vat': vat,
          if (_purchase && line.blocked && (line.treatment == 'standard' || _selfAccounted.contains(line.treatment))) 'blocked': true,
        });
      }
    }
    if (fail != null) {
      setState(() => _note = fail!);
      return null;
    }
    return {
      'partyName': party,
      if (trn.isNotEmpty) (_purchase ? 'supplierTrn' : 'buyerTrn'): trn,
      if (_purchase && _billNo.text.trim().isNotEmpty) 'supplierInvoiceNo': _billNo.text.trim(),
      if (!_purchase && _emirate != null) 'emirate': _emirate,
      'date': date,
      'currency': _currency,
      if (_currency != 'AED' && rate.isNotEmpty) 'exchangeRate': parseUaeNumber(rate),
      if (!_purchase && terms.isNotEmpty) 'paymentTermsDays': int.parse(terms),
      'lines': lines,
      'lang': uaeLang(context),
    };
  }

  Future<void> _submit() async {
    final s = UaeStrings.of(context);
    FocusScope.of(context).unfocus();
    final args = _args(s);
    if (args == null) return;
    setState(() => _note = '');
    await writeAe(_purchase ? 'create_ae_purchase' : 'create_ae_invoice', args);
  }

  @override
  Future<void> onWritten(Map<String, dynamic> result, ChatReply reply) async {
    final state = AppScope.of(context);
    if (!mounted) return;
    setState(() => _done = result.isEmpty ? {'invoice': const <String, dynamic>{}, 'reply': reply.reply} : result);
    await state.refresh();
  }

  void _again() {
    setState(() {
      _done = null;
      final old = List.of(_lines);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        for (final line in old) {
          line.dispose();
        }
      });
      _lines
        ..clear()
        ..add(_Line());
      _party.clear();
      _trn.clear();
      _billNo.clear();
      _terms.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    final f = UaeFormat.of(context);
    final text = Theme.of(context).textTheme;
    final totals = _totals;
    final done = _done;
    final preview = held;
    final locked = preview != null || writing;
    String money(int fils) => f.money(fils / 100);
    final trnProblem = uaeTrnProblem(_trn.text, length: s.trnLength, digitsOnly: s.trnDigitsOnly);
    Widget field(String key, TextEditingController c, String label, {TextDirection? direction, TextInputType? keyboard, String? hint, String? helper, String? error}) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        key: ValueKey('$_key.$key'),
        controller: c,
        enabled: !locked,
        textDirection: direction,
        keyboardType: keyboard,
        onChanged: (_) => _changed(),
        decoration: InputDecoration(label: Text(label, maxLines: 2), hintText: hint, helperText: helper, helperMaxLines: 3, errorText: error, errorMaxLines: 3),
      ),
    );
    return Scaffold(
      appBar: AppBar(title: Text(_purchase ? s.newBillTitle : s.newSaleTitle, maxLines: 2)),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
              children: [
                if (done != null)
                  _doneCard(s, done)
                else ...[
                  field('party', _party, _purchase ? s.supplierName : s.customerName),
                  field(
                    'trn',
                    _trn,
                    _purchase ? s.supplierTrn : s.customerTrn,
                    direction: TextDirection.ltr,
                    keyboard: TextInputType.number,
                    helper: _purchase ? s.supplierTrnHint : s.trnFifteen,
                    error: trnProblem,
                  ),
                  if (_purchase) field('billNo', _billNo, s.supplierInvoiceNo, direction: TextDirection.ltr),
                  if (!_purchase)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: DropdownButtonFormField<String>(
                        key: ValueKey('$_key.emirate'),
                        initialValue: _emirate,
                        isExpanded: true,
                        hint: Text(s.chooseEmirate, overflow: TextOverflow.ellipsis),
                        decoration: InputDecoration(labelText: s.saleEmirate),
                        items: [for (final e in emirates) DropdownMenuItem(value: e.code, child: Text(e.name(s.ar), overflow: TextOverflow.ellipsis))],
                        onChanged: locked
                            ? null
                            : (code) => setState(() {
                                _emirateTouched = true;
                                _emirate = code;
                                writeProblems = const [];
                              }),
                      ),
                    ),
                  field('date', _date, s.date, direction: TextDirection.ltr, keyboard: TextInputType.datetime, hint: 'YYYY-MM-DD'),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: DropdownButtonFormField<String>(
                      key: ValueKey('$_key.currency'),
                      initialValue: _currency,
                      isExpanded: true,
                      decoration: InputDecoration(labelText: s.currency),
                      items: [for (final code in uaeCurrencies) DropdownMenuItem(value: code, child: Text(code))],
                      onChanged: locked
                          ? null
                          : (code) => setState(() {
                              _currency = code ?? 'AED';
                              writeProblems = const [];
                            }),
                    ),
                  ),
                  if (_currency != 'AED') field('exchangeRate', _rate, s.exchangeRate(_currency), direction: TextDirection.ltr, keyboard: const TextInputType.numberWithOptions(decimal: true)),
                  if (!_purchase) field('terms', _terms, s.paymentTerms, direction: TextDirection.ltr, keyboard: TextInputType.number),
                  for (var at = 0; at < _lines.length; at++) _lineCard(s, text, at, locked),
                  if (!locked)
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: TextButton.icon(
                        key: ValueKey('$_key.addLine'),
                        onPressed: () => setState(() => _lines.add(_Line())),
                        icon: const Icon(Icons.add, size: 18),
                        label: Text(s.addLine),
                      ),
                    ),
                  const SizedBox(height: 8),
                  UaePanel(
                    key: ValueKey('$_key.totals'),
                    children: [
                      UaeFigure(label: s.net, value: money(totals.net), valueKey: ValueKey('$_key.net')),
                      UaeFigure(label: _purchase ? s.billVat : s.vat5, value: money(totals.vat), valueKey: ValueKey('$_key.vat')),
                      if (_purchase && totals.selfVat != 0) UaeFigure(label: s.selfAccountedVat, value: money(totals.selfVat), valueKey: ValueKey('$_key.selfVat')),
                      if (_purchase) UaeFigure(label: s.recoverableVat, value: money(totals.recoverable), valueKey: ValueKey('$_key.recoverable')),
                      UaeFigure(label: _purchase ? s.payableToSupplier : s.totalAed, value: money(totals.total), strong: true, valueKey: ValueKey('$_key.total')),
                    ],
                  ),
                  if (_note.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(_note, key: ValueKey('$_key.note'), style: text.bodyMedium?.copyWith(color: Palette.danger)),
                  ],
                  if (writeProblems.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    UaeNotes(key: ValueKey('$_key.problems'), title: s.nothingSaved, notes: writeProblems, danger: true),
                  ],
                  if (preview != null) ...[
                    const SizedBox(height: 12),
                    UaeHeldPreview(key: ValueKey('$_key.held'), preview: preview),
                  ],
                  const SizedBox(height: 16),
                  if (preview == null)
                    FilledButton(
                      key: ValueKey('$_key.preview'),
                      onPressed: writing ? null : _submit,
                      child: Text(s.preview),
                    ),
                  if (writing) const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator())),
                ],
              ],
            ),
          ),
          if (preview != null) UaeConfirmBar(busy: writing, onConfirm: confirmAe, onDiscard: discardAe),
        ],
      ),
    );
  }

  Widget _doneCard(UaeStrings s, Map<String, dynamic> done) {
    final invoice = uaeMap(done['invoice']);
    final id = uaeText(invoice['id']);
    final warnings = [for (final w in (done['warnings'] as List? ?? const [])) '$w'];
    final f = UaeFormat.of(context);
    final title = id.isEmpty ? uaeText(done['reply']) : (_purchase ? s.billRecorded(id) : s.saleRecorded(id));
    return UaeDoneCard(
      key: ValueKey('$_key.done'),
      title: title,
      notes: [
        if (invoice['total'] != null) '${_purchase ? s.payableToSupplier : s.totalAed}: ${f.money(uaeNum(invoice['total']))}',
        if (_purchase && invoice['recoverableVat'] != null) '${s.recoverableVat}: ${f.money(uaeNum(invoice['recoverableVat']))}',
        ...warnings,
      ],
      actions: [
        if (!_purchase && id.isNotEmpty)
          FilledButton(
            key: const ValueKey('uae.sale.open'),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => UaeInvoiceScreen(invoiceId: id))),
            child: Text(s.openInvoice),
          ),
        OutlinedButton(key: ValueKey('$_key.again'), onPressed: _again, child: Text(s.another)),
      ],
    );
  }

  Widget _lineCard(UaeStrings s, TextTheme text, int at, bool locked) {
    final line = _lines[at];
    final key = '$_key.line.$at';
    final treatments = _purchase ? uaeBillTreatments : uaeSaleTreatments;
    final canBlock = _purchase && (line.treatment == 'standard' || _selfAccounted.contains(line.treatment));
    Widget input(String part, TextEditingController c, String label, {bool number = false, String? helper}) => Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextField(
        key: ValueKey('$key.$part'),
        controller: c,
        enabled: !locked,
        textDirection: number ? TextDirection.ltr : null,
        keyboardType: number ? const TextInputType.numberWithOptions(decimal: true) : null,
        onChanged: (_) => _changed(),
        decoration: InputDecoration(label: Text(label, maxLines: 2), helperText: helper, helperMaxLines: 2),
      ),
    );
    return Padding(
      key: ValueKey(key),
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: Palette.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(radiusCard), side: const BorderSide(color: Palette.line)),
        child: Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: Text(s.lineTitle(at + 1), style: text.labelLarge)),
              if (_lines.length > 1 && !locked)
                IconButton(
                  key: ValueKey('$key.remove'),
                  tooltip: s.removeLine,
                  icon: const Icon(Icons.close, size: 20),
                  onPressed: () => setState(() {
                    final removed = _lines.removeAt(at);
                    WidgetsBinding.instance.addPostFrameCallback((_) => removed.dispose());
                    writeProblems = const [];
                  }),
                ),
            ],
          ),
          input('description', line.description, _purchase ? s.boughtDescription : s.description),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: input('qty', line.qty, s.quantity, number: true)),
              const SizedBox(width: 10),
              Expanded(flex: 2, child: input('rate', line.price, s.unitPrice, number: true)),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: DropdownButtonFormField<String>(
              key: ValueKey('$key.treatment'),
              initialValue: line.treatment,
              isExpanded: true,
              decoration: InputDecoration(labelText: s.treatment),
              items: [for (final code in treatments) DropdownMenuItem(value: code, child: Text(s.treatmentName(code), overflow: TextOverflow.ellipsis))],
              onChanged: locked
                  ? null
                  : (code) => setState(() {
                      line.treatment = code ?? 'standard';
                      writeProblems = const [];
                    }),
            ),
          ),
          if (_purchase && line.treatment == 'standard') input('vat', line.vat, s.vatOnBill, number: true, helper: s.vatOnBillHint),
          if (canBlock)
            SwitchListTile(
              key: ValueKey('$key.blocked'),
              contentPadding: EdgeInsets.zero,
              value: line.blocked,
              title: Text(s.blockedVat, style: text.bodyMedium),
              onChanged: locked ? null : (value) => setState(() => line.blocked = value),
            ),
        ],
      ),
        ),
      ),
    );
  }
}
