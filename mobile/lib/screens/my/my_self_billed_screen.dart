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
import 'my_einvoice_detail_screen.dart';
import 'my_line_editor.dart';
import 'my_profile_screens.dart';
import 'my_widgets.dart';
import '../../widgets/glass.dart';

const mySelfBilledTypes = ['self-billed-invoice', 'self-billed-credit-note', 'self-billed-debit-note', 'self-billed-refund-note'];

class MySelfBilledScreen extends StatefulWidget {
  const MySelfBilledScreen({super.key, this.type = 'self-billed-invoice', this.original});

  final String type;
  final MyEinvoice? original;

  @override
  State<MySelfBilledScreen> createState() => _MySelfBilledScreenState();
}

class _MySelfBilledScreenState extends State<MySelfBilledScreen> {
  late String _type = mySelfBilledTypes.contains(widget.type) ? widget.type : 'self-billed-invoice';
  final _number = TextEditingController();
  late final _originalUuid = TextEditingController(text: widget.original?.uuid ?? '');
  String _kind = 'foreign';
  late final _name = TextEditingController(text: widget.original?.supplierName ?? '');
  final _tin = TextEditingController();
  final _id = TextEditingController();
  final _country = TextEditingController();
  final _line = TextEditingController();
  final _postcode = TextEditingController();
  final _city = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  String? _state;
  late String _currency = myCommonCurrencies.contains(widget.original?.totals?.currency) ? widget.original!.totals!.currency : 'MYR';
  final _rate = TextEditingController();
  String _payment = '';
  final _lines = <MyLineFields>[MyLineFields()];

  Future<MyParty?>? _profile;
  MyParty? _buyer;
  Map<String, String> _errors = const {};
  MyCheck? _check;
  String _checked = '';
  List<MyProblem> _problems = const [];
  String _error = '';
  bool _busy = false;
  bool _asking = false;
  String _busyLabel = '';
  String _heldToken = '';
  final _endKey = GlobalKey();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _profile ??= _loadProfile();
  }

  Future<MyParty?> _loadProfile() async {
    final found = await MyTools(AppScope.of(context).api).profile();
    if (mounted) setState(() => _buyer = found);
    return found;
  }

  @override
  void dispose() {
    for (final controller in [_number, _originalUuid, _name, _tin, _id, _country, _line, _postcode, _city, _phone, _email, _rate]) {
      controller.dispose();
    }
    for (final line in _lines) {
      line.dispose();
    }
    super.dispose();
  }

  bool get _adjustment => myAdjustmentTypes.contains(_type);
  bool get _foreign => _kind == 'foreign';

  MyParty _supplier() {
    if (_foreign) {
      final tin = _tin.text.trim();
      return MyParty(
        name: _name.text,
        tin: tin.isEmpty ? myForeignSupplierTin : tin,
        idType: 'PASSPORT',
        idValue: _id.text.trim().isEmpty ? 'NA' : _id.text,
        msic: '00000',
        phone: _phone.text,
        email: _email.text,
        address: MyAddress(lines: [_line.text], city: _city.text, state: '17', country: _country.text.trim().toUpperCase()),
      );
    }
    return MyParty(
      name: _name.text,
      tin: _tin.text,
      idType: _kind == 'individual' ? 'NRIC' : 'BRN',
      idValue: _id.text,
      msic: '00000',
      phone: _phone.text,
      email: _email.text,
      address: MyAddress(lines: [_line.text], postcode: _postcode.text, city: _city.text, state: _state ?? ''),
    );
  }

  MyDraft _draft(MyParty buyer) => MyDraft(
    type: _type,
    number: _number.text,
    currency: _currency,
    exchangeRate: _currency == 'MYR' ? null : parseMyAmount(_rate.text),
    buyer: buyer,
    supplier: _supplier(),
    lines: [for (final line in _lines) line.toLine()],
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
    if (_name.text.trim().isEmpty) errors['name'] = t.supplierNameMissing;
    final tin = _tin.text.trim();
    if (_foreign) {
      if (tin.isNotEmpty && !isMyTinShape(tin)) errors['tin'] = t.tinBad;
      final country = _country.text.trim().toUpperCase();
      if (!myCountries.contains(country) || country == 'MYS') errors['country'] = t.supplierCountryBad;
    } else {
      if (tin.isEmpty) {
        errors['tin'] = t.supplierTinMissing;
      } else if (!isMyTinShape(tin)) {
        errors['tin'] = t.tinBad;
      }
      if (_id.text.trim().isEmpty) {
        errors['id'] = t.idValueMissing;
      } else if (_kind == 'individual' && !isMyNricShape(_id.text)) {
        errors['id'] = t.nricBad;
      }
      if (_state == null) errors['state'] = t.stateMissing;
      if (_postcode.text.trim().isNotEmpty && !isMyPostcodeShape(_postcode.text)) errors['postcode'] = t.postcodeBad;
    }
    if (_city.text.trim().isEmpty) errors['city'] = t.cityMissing;
    if (_phone.text.trim().isEmpty) {
      errors['phone'] = t.supplierPhoneMissing;
    } else if (!isMyPhoneShape(_phone.text)) {
      errors['phone'] = t.phoneBad;
    }
    if (_currency != 'MYR') {
      final rate = parseMyAmount(_rate.text);
      if (rate == null || rate <= 0 || rate > 100000) errors['rate'] = t.exchangeRateBad;
    }
    errors.addAll(validateMyLines(t, _lines));
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
    final buyer = _buyer ?? await _profile;
    if (!mounted) return null;
    if (buyer == null) {
      setState(() => _error = t.selfBilledProfileNeeded);
      _reveal();
      return null;
    }
    final draft = _draft(buyer);
    final check = await MyTools(AppScope.of(context).api).check(draft);
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
      var check = _check;
      final buyer = _buyer;
      if (_heldToken.isEmpty || buyer == null) {
        if (check == null || buyer == null || _checked != jsonEncode(_draft(buyer).toJson())) check = await _runCheck(t);
        if (check == null || !check.ready || !mounted || _buyer == null) return;
        setState(() => _asking = true);
        final sure = await _confirmSheet(t, check);
        if (mounted) setState(() => _asking = false);
        if (sure != true || !mounted) return;
        setState(() => _busyLabel = t.sending);
        final held = await tools.proposeSelfBilled(_draft(_buyer!));
        _heldToken = held.token;
      } else {
        setState(() => _busyLabel = t.sending);
      }
      final draft = _draft(_buyer!);
      final record = await tools.confirmSelfBilled(_heldToken, draft);
      _heldToken = '';
      if (!mounted) return;
      final saved = record ?? MyEinvoice(number: draft.number, buyerName: draft.buyer.name, supplierName: draft.supplier?.name ?? '', status: 'submitted', type: draft.type, kind: 'self-billed', at: state.now().toUtc().toIso8601String());
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

  String Function(num) get _money => (num value) => currencyAmount(_currency, value);

  Future<bool?> _confirmSheet(MyStrings t, MyCheck check) {
    final totals = check.totals;
    final money = _money;
    final rate = parseMyAmount(_rate.text);
    return showMycaSheet<bool>(
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
                  Text(t.confirmSelfBilledTitle, style: text.titleLarge),
                  const SizedBox(height: 8),
                  Text('${t.documentTypeName(_type)} ${_number.text.trim()}', style: text.bodyLarge),
                  const SizedBox(height: 4),
                  Text(t.onBehalfOf(_name.text.trim()), style: text.bodyMedium),
                  if (totals != null) ...[
                    const SizedBox(height: 8),
                    MyAmountLine(label: t.net, amount: money(totals.net)),
                    MyAmountLine(label: t.tax, amount: money(totals.tax)),
                    MyAmountLine(label: t.payable, amount: money(totals.payable), strong: true),
                    if (_currency != 'MYR' && rate != null) MyAmountLine(label: t.exchangeRateHelp(_currency), amount: ringgit(rate)),
                  ],
                  if (_foreign && _tin.text.trim().isEmpty) ...[const SizedBox(height: 8), MyNote(t.foreignSupplierNote)],
                  const SizedBox(height: 8),
                  MyNote(t.cancelWindow(72, 0), tone: MyTone.warn),
                  if (mySandbox(this.context)) ...[const SizedBox(height: 8), MyNote(t.sandboxBanner)],
                  const SizedBox(height: 16),
                  FilledButton(key: const Key('mySelf.confirm'), onPressed: () => Navigator.of(context).pop(true), child: Text(t.confirmSend)),
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
        key: Key('mySelf.$key'),
        controller: controller,
        keyboardType: keyboard,
        textCapitalization: caps,
        maxLength: maxLength > 0 ? maxLength : null,
        onChanged: (_) => _changed(),
        decoration: InputDecoration(labelText: label, helperText: helper, helperMaxLines: 3, errorText: _errors[key], errorMaxLines: 3, counterText: ''),
      ),
    );
  }

  Widget _picker(String key, String label, String? value, List<(String, String)> items, ValueChanged<String?> changed) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: MyPicker<String>(
      key: Key('mySelf.$key'),
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

  Future<void> _openProfile() async {
    await Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const MyProfileScreen()));
    if (mounted) setState(() => _profile = _loadProfile());
  }

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    final text = Theme.of(context).textTheme;
    final check = _check;
    final totals = check?.totals;
    final palette = context.myca;
    final optional = t.optional.toLowerCase();
    return Scaffold(
      appBar: AppBar(title: Text(t.documentTypeName(_type), maxLines: 1, overflow: TextOverflow.ellipsis)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
          children: [
            if (mySandbox(context)) ...[MyNote(t.sandboxBanner), const SizedBox(height: 12)],
            MyNote(t.selfBilledIntro, key: const Key('mySelf.intro')),
            const SizedBox(height: 12),
            FutureBuilder<MyParty?>(
              future: _profile,
              builder: (context, loaded) {
                if (loaded.connectionState != ConnectionState.done || loaded.data != null) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: MyPanel(
                    key: const Key('mySelf.profileMissing'),
                    tone: palette.warnSoft,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(t.selfBilledProfileNeeded, style: text.bodyLarge),
                        const SizedBox(height: 8),
                        FilledButton(key: const Key('mySelf.addDetails'), onPressed: _openProfile, child: Text(t.addDetails)),
                      ],
                    ),
                  ),
                );
              },
            ),
            _picker('type', t.documentType, _type, [for (final type in mySelfBilledTypes) (type, t.documentTypeName(type))], (value) => setState(() => _type = value ?? 'self-billed-invoice')),
            _field('number', _number, t.number, caps: TextCapitalization.characters, maxLength: 60),
            if (_adjustment) _field('original', _originalUuid, t.originalUuid, caps: TextCapitalization.characters, maxLength: 26),
            MySection(t.supplier),
            MyChoices<String>(
              keyPrefix: 'mySelf.kind',
              value: _kind,
              items: [for (final kind in const ['foreign', 'individual', 'business']) (kind, t.supplierKindName(kind))],
              onChanged: (kind) {
                setState(() {
                  _kind = kind;
                  _errors = const {};
                });
                _changed();
              },
            ),
            const SizedBox(height: 12),
            if (_foreign) ...[MyNote(t.foreignSupplierNote), const SizedBox(height: 12)],
            _field('name', _name, t.buyerName, caps: TextCapitalization.words, maxLength: 300),
            if (_foreign) ...[
              _field('tin', _tin, t.foreignSupplierTin, helper: t.foreignSupplierTinHelp, caps: TextCapitalization.characters, maxLength: 14),
              _field('id', _id, '${t.idTypeName('PASSPORT')} ($optional)', caps: TextCapitalization.characters, maxLength: 20),
              _field('country', _country, t.buyerCountry, caps: TextCapitalization.characters, maxLength: 3),
            ] else ...[
              _field('tin', _tin, t.buyerTin, helper: t.tinHelp, caps: TextCapitalization.characters, maxLength: 14),
              _field('id', _id, _kind == 'individual' ? t.idTypeName('NRIC') : t.idTypeName('BRN'), caps: TextCapitalization.characters, maxLength: 20),
            ],
            _field('line', _line, t.addressLine, caps: TextCapitalization.words, maxLength: 150),
            if (!_foreign) _field('postcode', _postcode, t.postcode, keyboard: TextInputType.number, maxLength: 5),
            _field('city', _city, t.city, caps: TextCapitalization.words, maxLength: 50),
            if (!_foreign) _picker('state', t.state, _state, [for (final (code, name) in myStates) (code, name)], (value) => setState(() => _state = value)),
            _field('phone', _phone, t.phone, helper: t.phoneHelp, keyboard: TextInputType.phone, maxLength: 20),
            _field('email', _email, '${t.email} ($optional)', keyboard: TextInputType.emailAddress, maxLength: 320),
            MySection(t.currency),
            _picker('currency', t.currency, _currency, [for (final code in myCommonCurrencies) (code, code)], (value) => setState(() => _currency = value ?? 'MYR')),
            if (_currency != 'MYR') _field('rate', _rate, t.exchangeRate, helper: t.exchangeRateHelp(_currency), keyboard: const TextInputType.numberWithOptions(decimal: true), maxLength: 12),
            _picker('payment', t.paymentMethod, _payment, [('', t.none), for (final code in myPaymentMethods) (code, t.paymentMethodName(code))], (value) => setState(() => _payment = value ?? '')),
            MySection(t.lines),
            for (final (index, line) in _lines.indexed)
              MyLineEditor(
                keyPrefix: 'mySelf',
                index: index,
                line: line,
                currency: _currency,
                errors: _errors,
                onChanged: () {
                  setState(() {});
                  _changed();
                },
                onRemove: _lines.length > 1
                    ? () {
                        setState(() => _lines.removeAt(index).dispose());
                        _changed();
                      }
                    : null,
              ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                key: const Key('mySelf.addLine'),
                onPressed: _lines.length >= 100
                    ? null
                    : () {
                        setState(() => _lines.add(MyLineFields()));
                        _changed();
                      },
                icon: const Icon(Icons.add),
                label: Text(t.addLine),
              ),
            ),
            const SizedBox(height: 12),
            if (check != null && check.ready && totals != null) ...[
              MyPanel(
                key: const Key('mySelf.ready'),
                tone: palette.accentSoft,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(t.ready, style: text.titleSmall?.copyWith(color: palette.accent, fontWeight: FontWeight.w600)),
                    MyAmountLine(label: t.net, amount: _money(totals.net)),
                    MyAmountLine(label: t.tax, amount: _money(totals.tax)),
                    MyAmountLine(label: t.payable, amount: _money(totals.payable), strong: true),
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],
            if (_problems.isNotEmpty) ...[
              MyProblems(key: const Key('mySelf.problems'), title: t.fixCount(_problems.length), problems: _problems),
              const SizedBox(height: 12),
            ],
            if (_error.isNotEmpty && _problems.isEmpty) ...[
              MyErrorBox(key: const Key('mySelf.error'), message: _error),
              const SizedBox(height: 12),
            ],
            MyBusyButton(key: const Key('mySelf.check'), label: t.check, busyLabel: _busyLabel, busy: _busy && !_asking && _busyLabel == t.checking && _heldToken.isEmpty, onPressed: _busy ? null : _onCheck, outlined: true),
            const SizedBox(height: 10),
            KeyedSubtree(key: _endKey, child: MyBusyButton(key: const Key('mySelf.send'), label: _heldToken.isEmpty ? t.send : t.tryAgain, busyLabel: _busyLabel, busy: _busy && !_asking, onPressed: _busy ? null : _onSend)),
          ],
        ),
      ),
    );
  }
}
