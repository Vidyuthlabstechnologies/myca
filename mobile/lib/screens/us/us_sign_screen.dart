import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../api/models.dart';
import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../billing/store_billing.dart';
import '../../format.dart';
import '../../theme.dart';
import '../../us/tin.dart';
import '../../us/us_filing_fee.dart';
import '../../us/us_return.dart';
import '../../widgets.dart';
import '../plan_screen.dart' show buyInApp;
import 'us_fields.dart';

String deviceTypeName() => switch (defaultTargetPlatform) {
  TargetPlatform.android => 'Android',
  TargetPlatform.iOS => 'iOS',
  TargetPlatform.windows => 'Windows',
  TargetPlatform.macOS => 'macOS',
  _ => 'Other',
};

class _SignContext {
  const _SignContext(this.status, this.review, this.efile, this.fee);

  final UsReturnStatus status;
  final UsReview review;
  final UsEfileStatus efile;
  final UsFilingFee fee;
}

class UsSignScreen extends StatefulWidget {
  const UsSignScreen({super.key, required this.taxYear, this.fees, this.store});

  final int taxYear;
  final UsFilingFees? fees;
  final StoreBilling? store;

  @override
  State<UsSignScreen> createState() => _UsSignScreenState();
}

class _UsSignScreenState extends State<UsSignScreen> {
  Future<_SignContext>? _context;
  final _pin = TextEditingController();
  final _spousePin = TextEditingController();
  final _agi = TextEditingController();
  final _spouseAgi = TextEditingController();
  final _ipPin = TextEditingController();
  final _spouseIpPin = TextEditingController();
  final _phone = TextEditingController();
  final _routing = TextEditingController();
  final _account = TextEditingController();
  final _payDate = TextEditingController();
  bool _filedLastYear = true;
  String _accountType = 'checking';
  String _refundMethod = 'direct_deposit';
  String _payMethod = 'direct_debit';
  bool _consent = false;
  final _errors = <String, String>{};
  String _note = '';
  bool _busy = false;
  ChatPreview? _filing;
  String _signedSummary = '';
  UsFilingFee? _paidFee;
  UsFilingFees? _fees;
  StoreBilling? _store;

  MycaApi get _api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final cloud = AppScope.of(context).cloud;
    _fees ??= widget.fees ?? (cloud == null ? const NoFilingFees() : CloudFilingFees(cloud));
    _store ??= widget.store ?? (buyInApp && cloud != null ? PlayBilling() : null);
    _context ??= _load();
  }

  Future<UsFilingFee> _loadFee(int year) async {
    try {
      return await _fees!.status(year);
    } on Object {
      return UsFilingFee(taxYear: year, enforced: false, paid: true, priceUsd: usFilingPriceUsd);
    }
  }

  Future<_SignContext> _load() async {
    final year = widget.taxYear;
    final results = await Future.wait<Object>([loadReturnStatus(_api, year), loadReview(_api, year), loadEfileStatus(_api, year), _loadFee(year)]);
    return _SignContext(results[0] as UsReturnStatus, results[1] as UsReview, results[2] as UsEfileStatus, results[3] as UsFilingFee);
  }

  @override
  void dispose() {
    for (final c in [_pin, _spousePin, _agi, _spouseAgi, _ipPin, _spouseIpPin, _phone, _routing, _account, _payDate]) {
      c.dispose();
    }
    super.dispose();
  }

  bool _usesBank(UsReview review) => review.owed > 0 ? _payMethod == 'direct_debit' : _refundMethod == 'direct_deposit';

  Future<void> _sign(_SignContext ctx) async {
    _errors.clear();
    final joint = ctx.status.filingStatus == 'mfj';
    final pin = pinProblem(_pin.text);
    if (pin != null) _errors['pin'] = pin;
    if (joint) {
      final spouse = pinProblem(_spousePin.text);
      if (spouse != null) _errors['spousePin'] = spouse;
    }
    if (_filedLastYear) {
      if (parseDollars(_agi.text) == null) _errors['agi'] = 'Enter line 11 of last year\'s Form 1040. Use 0 if it was zero.';
      if (joint && parseDollars(_spouseAgi.text) == null) _errors['spouseAgi'] = 'Enter your spouse\'s prior-year AGI. If you filed jointly last year it is the same number.';
    }
    final ip = ipPinProblem(_ipPin.text.trim());
    if (ip != null) _errors['ipPin'] = ip;
    final spouseIp = joint ? ipPinProblem(_spouseIpPin.text.trim()) : null;
    if (spouseIp != null) _errors['spouseIpPin'] = spouseIp;
    if (_usesBank(ctx.review)) {
      final routing = routingProblem(_routing.text);
      if (routing != null) _errors['routing'] = routing;
      final account = accountProblem(_account.text);
      if (account != null) _errors['account'] = account;
      if (ctx.review.owed > 0) {
        final date = usDateProblem(_payDate.text);
        if (date != null) _errors['payDate'] = date;
        if (_phone.text.replaceAll(RegExp(r'\D'), '').length != 10) _errors['phone'] = 'Enter your 10-digit US phone number. The IRS asks for it with a bank payment.';
      }
    }
    if (!_consent) _errors['consent'] = 'Check the box to sign.';
    if (_errors.isNotEmpty) return setState(() => _note = 'Some answers need a look.');
    final bank = {
      'routing': _routing.text.replaceAll(RegExp(r'\D'), ''),
      'account': _account.text.replaceAll(RegExp(r'\D'), ''),
      'accountType': _accountType,
    };
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      final agi = parseDollars(_agi.text)?.round() ?? 0;
      final spouseAgi = parseDollars(_spouseAgi.text)?.round() ?? 0;
      final reply = await saveAndConfirm(_api, 'sign_us_return', {
        'taxYear': widget.taxYear,
        'taxpayerPin': _pin.text,
        if (joint) 'spousePin': _spousePin.text,
        'priorYear': {
          'taxpayer': {'agi': _filedLastYear ? agi : 0},
          if (joint) 'spouse': {'agi': _filedLastYear ? spouseAgi : 0},
        },
        if (_ipPin.text.trim().isNotEmpty || (joint && _spouseIpPin.text.trim().isNotEmpty))
          'identityProtectionPin': {
            if (_ipPin.text.trim().isNotEmpty) 'taxpayer': _ipPin.text.trim(),
            if (joint && _spouseIpPin.text.trim().isNotEmpty) 'spouse': _spouseIpPin.text.trim(),
          },
        'consent8879': true,
        if (ctx.review.owed > 0)
          'payment': _payMethod == 'direct_debit'
              ? {'method': 'direct_debit', ...bank, 'date': isoFromUsDate(_payDate.text), 'phone': _phone.text.replaceAll(RegExp(r'\D'), '')}
              : {'method': 'later'}
        else
          'refund': _refundMethod == 'direct_deposit' ? {'method': 'direct_deposit', ...bank} : {'method': 'check'},
        'device': {
          'deviceId': await AppScope.of(context).installationId(),
          'deviceType': deviceTypeName(),
          'at': DateTime.now().toUtc().toIso8601String(),
        },
      });
      if (!mounted) return;
      if (!reply.posted) {
        setState(() => _note = reply.reply.isEmpty ? 'Not signed. Try again.' : reply.reply);
        return;
      }
      _pin.clear();
      _spousePin.clear();
      _ipPin.clear();
      _spouseIpPin.clear();
      _account.clear();
      setState(() {
        _signedSummary = reply.reply;
        _context = _load();
      });
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _prepareFiling() async {
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      final reply = await _api.propose('file_us_return', {'taxYear': widget.taxYear});
      if (!mounted) return;
      setState(() {
        _filing = reply.preview;
        if (reply.preview == null) _note = reply.reply.isEmpty ? 'The return cannot be sent yet.' : reply.reply;
      });
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _send() async {
    final preview = _filing;
    if (preview == null) return;
    setState(() => _busy = true);
    try {
      final reply = await _api.confirm(preview.token);
      if (!mounted) return;
      setState(() {
        _filing = null;
        _note = reply.posted ? '' : (reply.reply.isEmpty ? 'Not sent. Try again.' : reply.reply);
        _context = _load();
      });
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancelFiling() async {
    setState(() => _filing = null);
    try {
      await _api.discard();
    } on MycaApiException {
      return;
    }
  }

  Widget _pinField(TextEditingController c, String key, String label) => TextField(
    key: Key('usSign.$key'),
    controller: c,
    obscureText: true,
    keyboardType: TextInputType.number,
    enableSuggestions: false,
    autocorrect: false,
    inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(5)],
    decoration: InputDecoration(labelText: label, helperText: 'Any five digits you choose. It is your signature.', errorText: _errors[key]),
  );

  List<Widget> _bankFields({required bool debit}) => [
    TextField(
      key: const Key('usSign.routing'),
      controller: _routing,
      keyboardType: TextInputType.number,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(9)],
      decoration: InputDecoration(labelText: 'Routing number', helperText: 'Nine digits, at the bottom left of a check', errorText: _errors['routing']),
    ),
    const SizedBox(height: 12),
    TextField(
      key: const Key('usSign.account'),
      controller: _account,
      keyboardType: TextInputType.number,
      obscureText: true,
      enableSuggestions: false,
      autocorrect: false,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(17)],
      decoration: InputDecoration(labelText: 'Account number', errorText: _errors['account']),
    ),
    const SizedBox(height: 12),
    SegmentedButton<String>(
      key: const Key('usSign.accountType'),
      segments: const [ButtonSegment(value: 'checking', label: Text('Checking')), ButtonSegment(value: 'savings', label: Text('Savings'))],
      selected: {_accountType},
      onSelectionChanged: (picked) => setState(() => _accountType = picked.first),
    ),
    if (debit) ...[
      const SizedBox(height: 12),
      UsDateField(key: const Key('usSign.payDate'), controller: _payDate, label: 'Take the payment on', errorText: _errors['payDate']),
      const SizedBox(height: 12),
      TextField(
        key: const Key('usSign.phone'),
        controller: _phone,
        keyboardType: TextInputType.phone,
        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9() -]')), LengthLimitingTextInputFormatter(14)],
        decoration: InputDecoration(labelText: 'Your phone number', helperText: 'The IRS asks for it with a bank payment', errorText: _errors['phone']),
      ),
    ],
  ];

  Future<void> _continueWithPartner() async {
    final openLink = AppScope.of(context).openLink;
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      final reply = await saveAndConfirm(_api, 'file_us_return', {'taxYear': widget.taxYear});
      final url = reply.toolResult('file_us_return')['handoffUrl'];
      var note = '';
      if (url is String && url.startsWith('https://')) {
        final opened = await openLink(Uri.parse(url));
        if (!opened) note = 'The filing page did not open. Try again.';
      } else if (reply.toolResult('file_us_return').isEmpty) {
        note = reply.reply.isEmpty ? 'E-filing could not start. Try again.' : reply.reply;
      }
      if (!mounted) return;
      setState(() {
        _note = note;
        _context = _load();
      });
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _partnerView(_SignContext ctx) {
    final text = Theme.of(context).textTheme;
    final owed = ctx.review.owed > 0;
    final resuming = ctx.efile.inProgress;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
      children: [
        Text(resuming ? 'Finish e-filing' : 'Ready to e-file', style: text.headlineMedium),
        const SizedBox(height: 8),
        Text(owed ? 'You owe ${dollars(ctx.review.owed)}.' : 'Your refund is ${dollars(ctx.review.refund)}.', style: text.titleMedium),
        const SizedBox(height: 12),
        Text(
          'Your return is e-filed through our IRS-authorized e-file partner. We pass on your name, address, dependents and tax forms, '
          'so there you only add your SSN, check the return and sign Form 8879. The IRS answer shows up here.',
          key: const Key('usSign.partnerIntro'),
          style: text.bodyLarge,
        ),
        for (final r in ctx.efile.rejections) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: Palette.warnSoft, borderRadius: BorderRadius.circular(radiusControl)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('The IRS sent it back: ${r.message}', style: text.bodyMedium),
                if (r.fix.isNotEmpty) ...[const SizedBox(height: 4), Text(r.fix, style: text.bodySmall)],
              ],
            ),
          ),
        ],
        if (ctx.efile.sandbox) ...[const SizedBox(height: 12), const StatusTag(text: 'IRS test system: nothing is really filed', color: Palette.warn)],
        const SizedBox(height: 22),
        if (!ctx.fee.filingOpen)
          _notOpen()
        else if ((_paidFee ?? ctx.fee).due)
          UsFilingFeeCard(fee: ctx.fee, fees: _fees!, store: _store, onPaid: (fee) => setState(() => _paidFee = fee))
        else
          FilledButton(
            key: const Key('usSign.partner'),
            onPressed: _busy ? null : _continueWithPartner,
            child: Text(_busy ? 'Opening…' : resuming ? 'Continue where you left off' : 'Continue to e-file'),
          ),
        if (resuming)
          TextButton(key: const Key('usSign.partnerRefresh'), onPressed: _busy ? null : () => setState(() { _context = _load(); }), child: const Text('I have finished. Check again')),
        if (_note.isNotEmpty) ...[const SizedBox(height: 12), Text(_note, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w500))],
      ],
    );
  }

  Widget _notOpen() => Container(
        key: const Key('usSign.notOpen'),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: Palette.warnSoft, borderRadius: BorderRadius.circular(radiusCard)),
        child: Text(usFilingNotOpenLine, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Palette.ink)),
      );

  Widget _blockedView(UsReview review) {
    final text = Theme.of(context).textTheme;
    return ListView(
      key: const Key('usSign.blocked'),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
      children: [
        Text('A few things to fix first', style: text.headlineMedium),
        const SizedBox(height: 8),
        Text('Your return can be signed once these are fixed. Open Review your return to fix each one.', style: text.bodyLarge),
        for (final c in review.checks.where((c) => c.blocking)) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: Palette.dangerSoft, borderRadius: BorderRadius.circular(radiusControl)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(c.message, style: text.titleSmall),
                if (c.fix.isNotEmpty) ...[const SizedBox(height: 4), Text(c.fix, style: text.bodySmall)],
              ],
            ),
          ),
        ],
        const SizedBox(height: 22),
        FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Back to my return')),
      ],
    );
  }

  Widget _filedView(UsEfileStatus efile) {
    final text = Theme.of(context).textTheme;
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text(efile.status == 'accepted' ? 'Accepted by the IRS' : 'Sent to the IRS', style: text.headlineMedium),
        const SizedBox(height: 8),
        Text(
          efile.status == 'accepted'
              ? 'Your return is filed. Keep the PDF with your records for at least three years.'
              : 'The IRS usually answers within a day or two. We will tell you when it is accepted.',
          style: text.bodyLarge,
        ),
        if (efile.submissionId.isNotEmpty) ...[const SizedBox(height: 12), Text('Submission ID ${efile.submissionId}', style: text.bodySmall)],
        if (efile.sandbox) ...[const SizedBox(height: 12), const StatusTag(text: 'IRS test system: this return is not really filed', color: Palette.warn)],
        const SizedBox(height: 22),
        FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Back to my return')),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Sign and e-file')),
      body: SafeArea(
        child: FutureBuilder<_SignContext>(
          future: _context,
          builder: (context, loaded) {
            if (loaded.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
            if (loaded.hasError) {
              return UsLoadError(message: usLoadProblem(loaded.error, 'Your return could not be loaded.'), onRetry: () => setState(() { _context = _load(); }));
            }
            final ctx = loaded.data!;
            if (ctx.efile.filed) return _filedView(ctx.efile);
            if (ctx.efile.partner) return _partnerView(ctx);
            if (!ctx.review.canFile) {
              return ListView(padding: const EdgeInsets.fromLTRB(20, 12, 20, 32), children: [UsUnsupportedNotice(forms: ctx.review.unsupported)]);
            }
            if (ctx.review.blocked) {
              return _blockedView(ctx.review);
            }
            final joint = ctx.status.filingStatus == 'mfj';
            final owed = ctx.review.owed > 0;
            if (ctx.efile.status == 'signed') {
              return ListView(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
                children: [
                  Text('Signed. Ready to send.', style: text.headlineMedium),
                  const SizedBox(height: 8),
                  if (_signedSummary.isNotEmpty) Text(_signedSummary, style: text.bodyMedium),
                  const SizedBox(height: 8),
                  Text(owed ? 'You owe ${dollars(ctx.review.owed)}.' : 'Your refund is ${dollars(ctx.review.refund)}.', style: text.titleMedium),
                  if (ctx.efile.sandbox) ...[
                    const SizedBox(height: 12),
                    const StatusTag(text: 'IRS test system: nothing is really filed', color: Palette.warn),
                  ],
                  const SizedBox(height: 22),
                  if (!ctx.fee.filingOpen)
                    _notOpen()
                  else if ((_paidFee ?? ctx.fee).due)
                    UsFilingFeeCard(fee: ctx.fee, fees: _fees!, store: _store, onPaid: (fee) => setState(() => _paidFee = fee))
                  else if (_filing == null)
                    FilledButton(key: const Key('usSign.prepare'), onPressed: _busy ? null : _prepareFiling, child: Text(_busy ? 'Checking…' : 'E-file with the IRS'))
                  else ...[
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(color: Palette.warnSoft, borderRadius: BorderRadius.circular(radiusControl)),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(_filing!.summary, key: const Key('usSign.filingSummary'), style: text.bodyMedium),
                          for (final e in _filing!.effects) Text('• $e', style: text.bodySmall),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    FilledButton(key: const Key('usSign.send'), onPressed: _busy ? null : _send, child: Text(_busy ? 'Sending…' : 'Send my return to the IRS')),
                    TextButton(onPressed: _busy ? null : _cancelFiling, child: const Text('Not yet')),
                  ],
                  if (_note.isNotEmpty) ...[const SizedBox(height: 12), Text(_note, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w500))],
                ],
              );
            }
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                Text(
                  'You sign your return with a five-digit PIN. This is your signature on IRS Form 8879, which authorizes MyCA to e-file for you.',
                  style: text.bodyLarge,
                ),
                const SizedBox(height: 18),
                const SectionLabel('Your signature'),
                _pinField(_pin, 'pin', 'Signature PIN'),
                if (joint) ...[const SizedBox(height: 12), _pinField(_spousePin, 'spousePin', 'Spouse\'s signature PIN')],
                const SizedBox(height: 22),
                const SectionLabel('Prove it is you'),
                Text('The IRS checks last year\'s adjusted gross income (AGI) to confirm who is signing.', style: text.bodySmall),
                SwitchListTile(
                  key: const Key('usSign.filedLastYear'),
                  contentPadding: EdgeInsets.zero,
                  title: Text('I filed a return for ${widget.taxYear - 1}'),
                  value: _filedLastYear,
                  onChanged: (v) => setState(() => _filedLastYear = v),
                ),
                if (_filedLastYear) ...[
                  MoneyField(key: const Key('usSign.agi'), controller: _agi, label: '${widget.taxYear - 1} AGI (Form 1040, line 11)', errorText: _errors['agi']),
                  if (joint) ...[const SizedBox(height: 12), MoneyField(key: const Key('usSign.spouseAgi'), controller: _spouseAgi, label: 'Your spouse\'s ${widget.taxYear - 1} AGI', errorText: _errors['spouseAgi'])],
                ],
                const SizedBox(height: 12),
                TextField(
                  key: const Key('usSign.ipPin'),
                  controller: _ipPin,
                  keyboardType: TextInputType.number,
                  obscureText: true,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                  decoration: InputDecoration(labelText: 'Identity Protection PIN (if the IRS sent you one)', errorText: _errors['ipPin']),
                ),
                if (joint) ...[
                  const SizedBox(height: 12),
                  TextField(
                    key: const Key('usSign.spouseIpPin'),
                    controller: _spouseIpPin,
                    keyboardType: TextInputType.number,
                    obscureText: true,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(6)],
                    decoration: InputDecoration(labelText: 'Your spouse\'s Identity Protection PIN (if any)', errorText: _errors['spouseIpPin']),
                  ),
                ],
                const SizedBox(height: 22),
                SectionLabel(owed ? 'Pay ${dollars(ctx.review.owed)}' : 'Get your ${dollars(ctx.review.refund)} refund'),
                if (owed)
                  RadioGroup<String>(
                    groupValue: _payMethod,
                    onChanged: (v) => setState(() => _payMethod = v ?? 'direct_debit'),
                    child: const Column(
                      children: [
                        RadioListTile<String>(key: Key('usSign.pay.debit'), contentPadding: EdgeInsets.zero, value: 'direct_debit', title: Text('Take it from my bank account'), subtitle: Text('Free. Pick a date up to April 15.')),
                        RadioListTile<String>(key: Key('usSign.pay.later'), contentPadding: EdgeInsets.zero, value: 'later', title: Text('I will pay the IRS myself'), subtitle: Text('With IRS Direct Pay or a check, by April 15.')),
                      ],
                    ),
                  )
                else
                  RadioGroup<String>(
                    groupValue: _refundMethod,
                    onChanged: (v) => setState(() => _refundMethod = v ?? 'direct_deposit'),
                    child: const Column(
                      children: [
                        RadioListTile<String>(key: Key('usSign.refund.deposit'), contentPadding: EdgeInsets.zero, value: 'direct_deposit', title: Text('Direct deposit'), subtitle: Text('Fastest. Usually within 21 days.')),
                        RadioListTile<String>(key: Key('usSign.refund.check'), contentPadding: EdgeInsets.zero, value: 'check', title: Text('Paper check by mail'), subtitle: Text('Takes several weeks longer.')),
                      ],
                    ),
                  ),
                if (_usesBank(ctx.review)) ...[const SizedBox(height: 8), ..._bankFields(debit: owed)],
                const SizedBox(height: 22),
                CheckboxListTile(
                  key: const Key('usSign.consent'),
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: _consent,
                  onChanged: (v) => setState(() => _consent = v ?? false),
                  title: const Text(
                    'Under penalties of perjury, I declare that I have examined this return and accompanying schedules and statements, and to the best of my knowledge and belief they are true, correct and complete. I authorize MyCA to send it to the IRS and to receive the IRS acknowledgment.',
                  ),
                  subtitle: _errors['consent'] == null ? null : Text(_errors['consent']!, style: const TextStyle(color: Palette.danger)),
                ),
                if (_note.isNotEmpty) ...[const SizedBox(height: 12), Text(_note, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w500))],
                const SizedBox(height: 18),
                FilledButton(key: const Key('usSign.sign'), onPressed: _busy ? null : () => _sign(ctx), child: Text(_busy ? 'Signing…' : 'Sign my return')),
                const SizedBox(height: 10),
                Text('Signing does not send anything. You get one more look before your return goes to the IRS.', style: text.bodySmall?.copyWith(color: Palette.muted)),
              ],
            );
          },
        ),
      ),
    );
  }
}
