import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:myca_design/myca_design.dart' show MycaThemeContext;

import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../format.dart';
import '../../my/my_book.dart';
import '../../my/my_code_tables.dart';
import '../../my/my_codes.dart';
import '../../my/my_strings.dart';
import '../../my/my_tools.dart';
import 'my_consolidated_screen.dart';
import 'my_einvoice_detail_screen.dart';
import 'my_widgets.dart';

class _LineFields {
  _LineFields({String description = '', String price = ''})
    : description = TextEditingController(text: description),
      quantity = TextEditingController(text: '1'),
      price = TextEditingController(text: price),
      rate = TextEditingController(),
      exemption = TextEditingController();

  final TextEditingController description;
  final TextEditingController quantity;
  final TextEditingController price;
  final TextEditingController rate;
  final TextEditingController exemption;
  String classification = '022';
  String unit = 'C62';
  String taxType = '06';

  void dispose() {
    description.dispose();
    quantity.dispose();
    price.dispose();
    rate.dispose();
    exemption.dispose();
  }
}

class MyEinvoiceCreateScreen extends StatefulWidget {
  const MyEinvoiceCreateScreen({super.key, this.type = 'invoice', this.original});

  final String type;
  final MyEinvoice? original;

  @override
  State<MyEinvoiceCreateScreen> createState() => _MyEinvoiceCreateScreenState();
}

class _MyEinvoiceCreateScreenState extends State<MyEinvoiceCreateScreen> {
  late String _type = widget.type;
  final _number = TextEditingController();
  late final _originalUuid = TextEditingController(text: widget.original?.uuid ?? '');
  String _buyerKind = 'business';
  late final _buyerName = TextEditingController(text: widget.original?.buyerName ?? '');
  final _buyerTin = TextEditingController();
  final _buyerId = TextEditingController();
  final _buyerSst = TextEditingController();
  final _buyerPhone = TextEditingController();
  final _buyerEmail = TextEditingController();
  final _buyerLine = TextEditingController();
  final _buyerCity = TextEditingController();
  final _buyerPostcode = TextEditingController();
  final _buyerCountry = TextEditingController();
  String? _buyerState;
  String _currency = 'MYR';
  final _rate = TextEditingController();
  String _payment = '';
  final _lines = <_LineFields>[_LineFields()];

  Map<String, String> _errors = const {};
  MyCheck? _check;
  String _checked = '';
  List<MyProblem> _problems = const [];
  String _error = '';
  bool _busy = false;
  bool _asking = false;
  final _endKey = GlobalKey();
  String _busyLabel = '';
  String _heldToken = '';

  @override
  void dispose() {
    for (final controller in [_number, _originalUuid, _buyerName, _buyerTin, _buyerId, _buyerSst, _buyerPhone, _buyerEmail, _buyerLine, _buyerCity, _buyerPostcode, _buyerCountry, _rate]) {
      controller.dispose();
    }
    for (final line in _lines) {
      line.dispose();
    }
    super.dispose();
  }

  bool get _adjustment => myAdjustmentTypes.contains(_type);

  MyParty _buyer() {
    final address = MyAddress(lines: [_buyerLine.text], postcode: _buyerPostcode.text, city: _buyerCity.text, state: _buyerState ?? '');
    return switch (_buyerKind) {
      'public' => const MyParty(name: 'General Public', tin: myGeneralPublicTin, idValue: 'NA', address: MyAddress(city: 'NA', state: '17')),
      'foreign' => MyParty(
        name: _buyerName.text,
        tin: myForeignBuyerTin,
        idType: 'PASSPORT',
        idValue: _buyerId.text.trim().isEmpty ? 'NA' : _buyerId.text,
        phone: _buyerPhone.text,
        email: _buyerEmail.text,
        address: MyAddress(lines: [_buyerLine.text], city: _buyerCity.text.trim().isEmpty ? 'NA' : _buyerCity.text, state: '17', country: _buyerCountry.text.trim().toUpperCase()),
      ),
      'individual' => MyParty(name: _buyerName.text, tin: _buyerTin.text, idType: 'NRIC', idValue: _buyerId.text, phone: _buyerPhone.text, email: _buyerEmail.text, address: address),
      _ => MyParty(name: _buyerName.text, tin: _buyerTin.text, idType: 'BRN', idValue: _buyerId.text, sst: _buyerSst.text, phone: _buyerPhone.text, email: _buyerEmail.text, address: address),
    };
  }

  MyDraft _draft() => MyDraft(
    type: _type,
    number: _number.text,
    currency: _currency,
    exchangeRate: _currency == 'MYR' ? null : parseMyAmount(_rate.text),
    buyer: _buyer(),
    lines: [
      for (final line in _lines)
        MyLine(
          description: line.description.text,
          classification: line.classification,
          quantity: parseMyAmount(line.quantity.text) ?? 0,
          unitCode: line.unit,
          unitPrice: parseMyAmount(line.price.text) ?? 0,
          taxType: line.taxType,
          ratePercent: parseMyAmount(line.rate.text) ?? 0,
          exemptionReason: line.exemption.text,
        ),
    ],
    originalUuid: _originalUuid.text,
    originalNumber: widget.original?.number ?? '',
    paymentMethod: _payment,
  );

  Map<String, String> _validate(MyStrings t) {
    final errors = <String, String>{};
    final number = _number.text.trim();
    if (number.isEmpty) errors['number'] = t.numberMissing;
    if (number.length > 50) errors['number'] = t.numberTooLong;
    if (_adjustment && !RegExp(r'^[A-Z0-9]{26}$').hasMatch(_originalUuid.text.trim().toUpperCase())) errors['original'] = t.originalUuidBad;
    if (_buyerKind != 'public') {
      if (_buyerName.text.trim().isEmpty) errors['buyerName'] = t.buyerNameMissing;
    }
    if (_buyerKind == 'business' || _buyerKind == 'individual') {
      if (_buyerTin.text.trim().isEmpty) {
        errors['buyerTin'] = t.buyerTinMissing;
      } else if (!isMyTinShape(_buyerTin.text)) {
        errors['buyerTin'] = t.tinBad;
      }
      if (_buyerId.text.trim().isEmpty) {
        errors['buyerId'] = t.idValueMissing;
      } else if (_buyerKind == 'individual' && !isMyNricShape(_buyerId.text)) {
        errors['buyerId'] = t.nricBad;
      }
      if (_buyerCity.text.trim().isEmpty) errors['buyerCity'] = t.cityMissing;
      if (_buyerState == null) errors['buyerState'] = t.stateMissing;
      if (_buyerPostcode.text.trim().isNotEmpty && !isMyPostcodeShape(_buyerPostcode.text)) errors['buyerPostcode'] = t.postcodeBad;
      if (_buyerSst.text.trim().isNotEmpty && !isMySstShape(_buyerSst.text)) errors['buyerSst'] = t.sstBad;
    }
    if (_buyerKind == 'foreign' && !myCountries.contains(_buyerCountry.text.trim().toUpperCase())) errors['buyerCountry'] = t.buyerCountryBad;
    if (_buyerKind != 'public' && _buyerPhone.text.trim().isNotEmpty && !isMyPhoneShape(_buyerPhone.text)) errors['buyerPhone'] = t.phoneBad;
    if (_currency != 'MYR') {
      final rate = parseMyAmount(_rate.text);
      if (rate == null || rate <= 0 || rate > 100000) errors['rate'] = t.exchangeRateBad;
    }
    for (final (index, line) in _lines.indexed) {
      if (line.description.text.trim().isEmpty) errors['line$index.description'] = t.descriptionMissing;
      final quantity = parseMyAmount(line.quantity.text);
      if (quantity == null || quantity <= 0) {
        errors['line$index.quantity'] = t.quantityBad;
      } else if (quantity > myLargestAmount) {
        errors['line$index.quantity'] = t.amountTooLarge;
      }
      final price = parseMyAmount(line.price.text);
      if (price == null || price < 0) {
        errors['line$index.price'] = t.amountBad;
      } else if (price > myLargestAmount || (quantity != null && quantity * price > myLargestAmount)) {
        errors['line$index.price'] = t.amountTooLarge;
      }
      if (line.taxType != '06' && line.taxType != 'E') {
        final rate = parseMyAmount(line.rate.text);
        if (rate == null || rate < 0 || rate > 100) errors['line$index.rate'] = t.taxRateBad;
      }
      if (line.taxType == 'E' && line.exemption.text.trim().isEmpty) errors['line$index.exemption'] = t.exemptionMissing;
    }
    return errors;
  }

  void _changed() {
    if (_check != null || _problems.isNotEmpty || _error.isNotEmpty || _heldToken.isNotEmpty) {
      setState(() {
        _check = null;
        _problems = const [];
        _error = '';
        _heldToken = '';
      });
    }
  }

  void _reveal() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final target = _endKey.currentContext;
      if (target != null && target.mounted) Scrollable.ensureVisible(target, alignment: 1, duration: const Duration(milliseconds: 200));
    });
  }

  Future<MyCheck?> _runCheck(MyStrings t) async {
    final errors = _validate(t);
    setState(() {
      _errors = errors;
      _error = '';
      _problems = const [];
    });
    if (errors.isNotEmpty) return null;
    final draft = _draft();
    final tools = MyTools(AppScope.of(context).api);
    final check = await tools.check(draft);
    if (!mounted) return null;
    setState(() {
      _check = check;
      _checked = jsonEncode(draft.toJson());
      _problems = check.problems;
    });
    _reveal();
    return check;
  }

  Future<void> _onCheck() async {
    if (_busy) return;
    final t = MyStrings.of(context);
    setState(() {
      _busy = true;
      _busyLabel = t.checking;
    });
    try {
      await _runCheck(t);
    } catch (error) {
      if (mounted) {
        setState(() => _error = myErrorMessage(t, error));
        _reveal();
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _onSend() async {
    if (_busy) return;
    final t = MyStrings.of(context);
    final state = AppScope.of(context);
    final tools = MyTools(state.api);
    setState(() {
      _busy = true;
      _busyLabel = t.checking;
      _error = '';
    });
    try {
      final draft = _draft();
      var check = _check;
      if (_heldToken.isEmpty) {
        if (check == null || _checked != jsonEncode(draft.toJson())) check = await _runCheck(t);
        if (check == null || !check.ready || !mounted) return;
        setState(() => _asking = true);
        final sure = await _confirmSheet(t, check);
        if (mounted) setState(() => _asking = false);
        if (sure != true || !mounted) return;
        setState(() => _busyLabel = t.sending);
        final held = await tools.proposeIssue(draft);
        _heldToken = held.token;
      } else {
        setState(() => _busyLabel = t.sending);
      }
      final record = await tools.confirmIssue(_heldToken, draft);
      _heldToken = '';
      if (!mounted) return;
      final saved = record ?? MyEinvoice(number: draft.number, buyerName: draft.buyer.name, status: 'submitted', type: draft.type, at: state.now().toUtc().toIso8601String());
      rememberEinvoice(state, saved);
      await Navigator.of(context).pushReplacement(MaterialPageRoute<void>(builder: (_) => MyEinvoiceDetailScreen(record: saved)));
    } on MyToolFailure catch (failure) {
      _heldToken = '';
      if (mounted) {
        setState(() {
          _problems = failure.problems;
          _error = t.errorText(failure.code);
        });
        _reveal();
      }
    } on MycaApiException catch (error) {
      if (mounted) {
        setState(() => _error = myErrorMessage(t, error));
        _reveal();
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool?> _confirmSheet(MyStrings t, MyCheck check) {
    final totals = check.totals;
    final money = _currency == 'MYR' ? ringgit : (num value) => '$_currency ${value.toStringAsFixed(2)}';
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) {
        final text = Theme.of(context).textTheme;
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(t.confirmSendTitle, style: text.titleLarge),
                  const SizedBox(height: 8),
                  Text('${t.documentTypeName(_type)} ${_number.text.trim()} · ${_buyer().name}', style: text.bodyLarge),
                  if (totals != null) ...[
                    const SizedBox(height: 8),
                    MyAmountLine(label: t.net, amount: money(totals.net)),
                    MyAmountLine(label: t.tax, amount: money(totals.tax)),
                    MyAmountLine(label: t.payable, amount: money(totals.payable), strong: true),
                  ],
                  const SizedBox(height: 8),
                  MyNote(t.cancelWindow(72, 0), tone: MyTone.warn),
                  if (mySandbox(this.context)) ...[const SizedBox(height: 8), MyNote(t.sandboxBanner)],
                  const SizedBox(height: 16),
                  FilledButton(key: const Key('myCreate.confirm'), onPressed: () => Navigator.of(context).pop(true), child: Text(t.confirmSend)),
                  const SizedBox(height: 8),
                  OutlinedButton(onPressed: () => Navigator.of(context).pop(false), child: Text(t.notYet)),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _field(String key, TextEditingController controller, String label, {String? helper, TextInputType? keyboard, TextCapitalization caps = TextCapitalization.none, int maxLength = 0}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        key: Key('myCreate.$key'),
        controller: controller,
        keyboardType: keyboard,
        textCapitalization: caps,
        maxLength: maxLength > 0 ? maxLength : null,
        onChanged: (_) => _changed(),
        decoration: InputDecoration(labelText: label, helperText: helper, helperMaxLines: 3, errorText: _errors[key], errorMaxLines: 3, counterText: ''),
      ),
    );
  }

  Widget _picker<T>(String key, String label, T? value, List<(T, String)> items, ValueChanged<T?> changed) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: MyPicker<T>(
      key: Key('myCreate.$key'),
      label: label,
      value: value,
      error: _errors[key],
      items: items,
      onChanged: (picked) {
        changed(picked);
        _changed();
      },
    ),
  );

  Widget _lineEditor(MyStrings t, int index, _LineFields line) {
    final taxed = line.taxType != '06' && line.taxType != 'E';
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: MyPanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text(t.lineN(index + 1), style: Theme.of(context).textTheme.titleSmall)),
                if (_lines.length > 1)
                  IconButton(
                    key: Key('myCreate.line$index.remove'),
                    tooltip: t.removeLine,
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () {
                      setState(() => _lines.removeAt(index).dispose());
                      _changed();
                    },
                  ),
              ],
            ),
            const SizedBox(height: 8),
            _field('line$index.description', line.description, t.description, caps: TextCapitalization.sentences, maxLength: 300),
            _picker<String>('line$index.classification', t.classification, line.classification, [for (final (code, name) in myClassifications) (code, '$code · $name')], (value) => setState(() => line.classification = value ?? '022')),
            _field('line$index.quantity', line.quantity, t.quantity, keyboard: const TextInputType.numberWithOptions(decimal: true), maxLength: 18),
            _picker<String>('line$index.unit', t.unit, line.unit, [for (final code in myUnitCodes) (code, '${t.unitName(code)} ($code)')], (value) => setState(() => line.unit = value ?? 'C62')),
            _field('line$index.price', line.price, '${t.unitPrice} ($_currency)', keyboard: const TextInputType.numberWithOptions(decimal: true), maxLength: 18),
            _picker<String>('line$index.taxType', t.taxType, line.taxType, [for (final code in myTaxTypes) (code, t.taxTypeName(code))], (value) => setState(() => line.taxType = value ?? '06')),
            if (taxed) _field('line$index.rate', line.rate, t.taxRate, keyboard: const TextInputType.numberWithOptions(decimal: true), maxLength: 6),
            if (line.taxType == 'E') _field('line$index.exemption', line.exemption, t.exemptionReason, caps: TextCapitalization.sentences, maxLength: 300),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    final text = Theme.of(context).textTheme;
    final check = _check;
    final totals = check?.totals;
    final money = _currency == 'MYR' ? ringgit : (num value) => '$_currency ${value.toStringAsFixed(2)}';
    final palette = context.myca;
    return Scaffold(
      appBar: AppBar(title: Text(_type == 'invoice' ? t.createTitle : t.documentTypeName(_type))),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
          children: [
            if (mySandbox(context)) ...[MyNote(t.sandboxBanner), const SizedBox(height: 12)],
            _picker<String>('type', t.documentType, _type, [for (final type in myDocumentTypes) (type, t.documentTypeName(type))], (value) => setState(() => _type = value ?? 'invoice')),
            _field('number', _number, t.number, caps: TextCapitalization.characters, maxLength: 60),
            if (_adjustment) _field('original', _originalUuid, t.originalUuid, caps: TextCapitalization.characters, maxLength: 26),
            MySection(t.buyer),
            MyChoices<String>(
              keyPrefix: 'myCreate.buyerKind',
              value: _buyerKind,
              items: [for (final kind in const ['business', 'individual', 'public', 'foreign']) (kind, t.buyerKindName(kind))],
              onChanged: (kind) {
                setState(() {
                  _buyerKind = kind;
                  _errors = const {};
                });
                _changed();
              },
            ),
            const SizedBox(height: 12),
            if (_buyerKind == 'public') ...[
              MyNote(t.publicNote),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  key: const Key('myCreate.useConsolidated'),
                  onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute<void>(builder: (_) => const MyConsolidatedScreen())),
                  icon: const Icon(Icons.calendar_month_outlined),
                  label: Text(t.useConsolidated),
                ),
              ),
              const SizedBox(height: 8),
            ] else ...[
              if (_buyerKind == 'foreign') ...[MyNote(t.foreignNote), const SizedBox(height: 12)],
              _field('buyerName', _buyerName, t.buyerName, caps: TextCapitalization.words, maxLength: 300),
              if (_buyerKind == 'business' || _buyerKind == 'individual') ...[
                _field('buyerTin', _buyerTin, t.buyerTin, helper: t.tinHelp, caps: TextCapitalization.characters, maxLength: 14),
                _field('buyerId', _buyerId, _buyerKind == 'individual' ? t.idTypeName('NRIC') : t.idTypeName('BRN'), keyboard: TextInputType.text, caps: TextCapitalization.characters, maxLength: 20),
                if (_buyerKind == 'business') _field('buyerSst', _buyerSst, '${t.sst} (${t.optional.toLowerCase()})', caps: TextCapitalization.characters, maxLength: 40),
              ],
              if (_buyerKind == 'foreign') ...[
                _field('buyerId', _buyerId, '${t.idTypeName('PASSPORT')} (${t.optional.toLowerCase()})', caps: TextCapitalization.characters, maxLength: 20),
                _field('buyerCountry', _buyerCountry, t.buyerCountry, caps: TextCapitalization.characters, maxLength: 3),
              ],
              _field('buyerLine', _buyerLine, t.addressLine, caps: TextCapitalization.words, maxLength: 150),
              if (_buyerKind != 'foreign') _field('buyerPostcode', _buyerPostcode, t.postcode, keyboard: TextInputType.number, maxLength: 5),
              _field('buyerCity', _buyerCity, t.city, caps: TextCapitalization.words, maxLength: 50),
              if (_buyerKind != 'foreign') _picker<String>('buyerState', t.state, _buyerState, [for (final (code, name) in myStates) (code, name)], (value) => setState(() => _buyerState = value)),
              _field('buyerPhone', _buyerPhone, '${t.phone} (${t.optional.toLowerCase()})', keyboard: TextInputType.phone, maxLength: 20),
              _field('buyerEmail', _buyerEmail, '${t.email} (${t.optional.toLowerCase()})', keyboard: TextInputType.emailAddress, maxLength: 320),
            ],
            MySection(t.currency),
            _picker<String>('currency', t.currency, _currency, [for (final code in myCommonCurrencies) (code, code)], (value) => setState(() => _currency = value ?? 'MYR')),
            if (_currency != 'MYR') _field('rate', _rate, t.exchangeRate, helper: t.exchangeRateHelp(_currency), keyboard: const TextInputType.numberWithOptions(decimal: true), maxLength: 12),
            _picker<String>('payment', t.paymentMethod, _payment, [('', t.none), for (final code in myPaymentMethods) (code, t.paymentMethodName(code))], (value) => setState(() => _payment = value ?? '')),
            MySection(t.lines),
            for (final (index, line) in _lines.indexed) _lineEditor(t, index, line),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                key: const Key('myCreate.addLine'),
                onPressed: _lines.length >= 100
                    ? null
                    : () {
                        setState(() => _lines.add(_LineFields()));
                        _changed();
                      },
                icon: const Icon(Icons.add),
                label: Text(t.addLine),
              ),
            ),
            const SizedBox(height: 12),
            if (check != null && check.ready && totals != null) ...[
              MyPanel(
                tone: palette.accentSoft,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(t.ready, style: text.titleSmall?.copyWith(color: palette.accent, fontWeight: FontWeight.w600)),
                    MyAmountLine(label: t.net, amount: money(totals.net)),
                    MyAmountLine(label: t.tax, amount: money(totals.tax)),
                    MyAmountLine(label: t.payable, amount: money(totals.payable), strong: true),
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
            if (_problems.isNotEmpty) ...[
              MyProblems(key: const Key('myCreate.problems'), title: t.fixCount(_problems.length), problems: _problems),
              const SizedBox(height: 12),
            ],
            if (_error.isNotEmpty && _problems.isEmpty) ...[
              MyErrorBox(message: _error),
              const SizedBox(height: 12),
            ],
            MyBusyButton(key: const Key('myCreate.check'), label: t.check, busyLabel: _busyLabel, busy: _busy && !_asking && _busyLabel == t.checking && _heldToken.isEmpty, onPressed: _busy ? null : _onCheck, outlined: true),
            const SizedBox(height: 10),
            KeyedSubtree(key: _endKey, child: MyBusyButton(key: const Key('myCreate.send'), label: _heldToken.isEmpty ? t.send : t.tryAgain, busyLabel: _busyLabel, busy: _busy && !_asking, onPressed: _busy ? null : _onSend)),
          ],
        ),
      ),
    );
  }
}
