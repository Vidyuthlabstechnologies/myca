import 'package:flutter/material.dart';

import '../api/myca_api.dart';
import '../app_services.dart';
import '../app_state.dart';
import '../cloud/cloud_session.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../theme.dart';

const _form16Figures = [
  'salaryFromCurrentEmployer',
  'exemptAllowancesSection10',
  'deductionsSection16',
  'incomeUnderSalaries',
  'grossTotalIncome',
  'chapterVIADeductions',
  'totalTaxableIncome',
  'taxOnTotalIncome',
  'netTaxPayable',
];

String _figureLabel(String lang, String key) => switch (key) {
  'salaryFromCurrentEmployer' => inLine(lang, 'Salary from this employer'),
  'exemptAllowancesSection10' => inLine(lang, 'Exempt allowances (section 10)'),
  'deductionsSection16' => inLine(lang, 'Deductions under section 16'),
  'incomeUnderSalaries' => inLine(lang, 'Income under the head salaries'),
  'grossTotalIncome' => inLine(lang, 'Gross total income'),
  'chapterVIADeductions' => inLine(lang, 'Chapter VI-A deductions'),
  'totalTaxableIncome' => inLine(lang, 'Total taxable income'),
  'taxOnTotalIncome' => inLine(lang, 'Tax on total income'),
  'netTaxPayable' => inLine(lang, 'Net tax payable'),
  _ => key,
};

String _label(String key) {
  final spaced = key.replaceAll('_', ' ').replaceAllMapped(RegExp(r'([a-z])([A-Z])'), (m) => '${m[1]} ${m[2]!.toLowerCase()}').trim();
  return spaced.isEmpty ? key : '${spaced[0].toUpperCase()}${spaced.substring(1)}';
}

List<MapEntry<String, String>> plainFields(Object? value) {
  if (value is! Map) return const [];
  return [
    for (final entry in value.entries)
      if (entry.value is String || entry.value is num || entry.value is bool)
        if ('${entry.value}'.isNotEmpty && !'${entry.key}'.startsWith('@')) MapEntry(_label('${entry.key}'), '${entry.value}'),
  ];
}

String _clock(DateTime at) {
  final local = at.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(local.hour)}:${two(local.minute)}';
}

class QuickoScreen extends StatefulWidget {
  const QuickoScreen({super.key});

  @override
  State<QuickoScreen> createState() => _QuickoScreenState();
}

class _QuickoScreenState extends State<QuickoScreen> {
  final _pdfPassword = TextEditingController();
  final _pan = TextEditingController();
  final _panName = TextEditingController();
  final _dob = TextEditingController();
  final _ifsc = TextEditingController();
  final _account = TextEditingController();
  final _accountName = TextEditingController();
  final _itdPan = TextEditingController();
  final _itdPassword = TextEditingController();
  QuickoStatus? _status;
  bool _loaded = false;
  bool _consent = false;
  String _busy = '';
  String _error = '';
  String _resultTitle = '';
  List<MapEntry<String, String>> _rows = const [];
  String _resultNote = '';

  CloudSession get _cloud => AppScope.of(context).cloud!;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_loaded) {
      _loaded = true;
      _reload();
    }
  }

  @override
  void dispose() {
    for (final c in [_pdfPassword, _pan, _panName, _dob, _ifsc, _account, _accountName, _itdPan, _itdPassword]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _reload() async {
    try {
      final status = await _cloud.quickoStatus();
      if (mounted) setState(() => _status = status);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    }
  }

  Future<T?> _run<T>(String doing, Future<T> Function() action) async {
    setState(() {
      _busy = doing;
      _error = '';
    });
    try {
      return await action();
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
      return null;
    } finally {
      if (mounted) setState(() => _busy = '');
    }
  }

  void _show(String title, List<MapEntry<String, String>> rows, QuickoResult out, [String note = '']) {
    final lead = out.simulated
        ? '${inText(context, 'Practice mode: no real lookup was made.')} '
        : out.mode == 'test'
        ? '${inText(context, 'Test service: these are Sandbox test figures, not the real record.')} '
        : '';
    setState(() {
      _resultTitle = title;
      _rows = rows;
      _resultNote = '$lead$note'.trim();
    });
  }

  Future<void> _readForm(String tool) async {
    final state = AppScope.of(context);
    final lang = indiaLang(context);
    final picked = await state.pickAnyFile();
    if (picked == null || !mounted) return;
    if (picked.mime != 'application/pdf') {
      setState(() => _error = cloudMessage('PDF_REQUIRED'));
      return;
    }
    final name = tool == 'read_form16' ? 'Form 16' : 'Form 26AS';
    final out = await _run(inFill(inLine(lang, 'Reading {form}…'), {'form': name}), () async {
      final sha = await state.api.upload(picked.name, dataUrlOf(picked));
      return _cloud.quickoTool(tool, {'documentSha256': sha, if (_pdfPassword.text.trim().isNotEmpty) 'password': _pdfPassword.text.trim()});
    });
    if (out == null || !mounted) return;
    final summary = out.data['summary'] is Map ? (out.data['summary'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
    final note = '${out.data['note'] ?? ''}';
    if (tool == 'read_form16') {
      final employer = summary['employer'] is Map ? summary['employer'] as Map : const {};
      final employee = summary['employee'] is Map ? summary['employee'] as Map : const {};
      final figures = summary['figuresAsPrinted'] is Map ? summary['figuresAsPrinted'] as Map : const {};
      _show('Form 16, ${summary['assessmentYear'] ?? ''}'.trim(), [
        if ('${employer['name'] ?? ''}'.isNotEmpty) MapEntry(inLine(lang, 'Employer'), '${employer['name']}${'${employer['tan'] ?? ''}'.isEmpty ? '' : ' · TAN ${employer['tan']}'}'),
        if ('${employee['pan'] ?? ''}'.isNotEmpty) MapEntry(inLine(lang, 'Employee'), '${employee['name'] ?? ''} · PAN ${employee['pan']}'.trim()),
        for (final key in _form16Figures)
          if (figures[key] is num) MapEntry(_figureLabel(lang, key), rupees(figures[key] as num)),
      ], out, note);
    } else {
      final deductors = summary['deductors'] is List ? summary['deductors'] as List : const [];
      _show('Form 26AS, ${summary['financialYear'] ?? ''}'.trim(), [
        if ('${summary['pan'] ?? ''}'.isNotEmpty) MapEntry('PAN', '${summary['name'] ?? ''} · ${summary['pan']}'.trim()),
        for (final row in deductors)
          if (row is Map) MapEntry('${row['deductor']} (${row['tan']})', inFill(inLine(lang, 'TDS {tax} on {paid}'), {'tax': rupees((row['taxDeducted'] as num?) ?? 0), 'paid': rupees((row['amountPaidOrCredited'] as num?) ?? 0)})),
        if (deductors.isEmpty) MapEntry(inLine(lang, 'Deductors'), inLine(lang, 'None in Part I')),
      ], out, note);
    }
  }

  bool _consented() {
    if (_consent) return true;
    setState(() => _error = inText(context, 'Tick the box once the person has agreed to this check.'));
    return false;
  }

  Future<void> _verifyPan() async {
    if (!_consented()) return;
    final out = await _run(inText(context, 'Checking the PAN…'), () => _cloud.quickoTool('verify_pan', {
          'pan': _pan.text.trim().toUpperCase(),
          if (_panName.text.trim().isNotEmpty) 'name': _panName.text.trim(),
          if (_dob.text.trim().isNotEmpty) 'dateOfBirth': _dob.text.trim(),
          'consent': true,
          'reason': 'KYC of a customer, supplier or employee',
        }));
    if (out == null || !mounted) return;
    _show('PAN ${out.data['pan'] ?? ''}', plainFields(out.data['result']), out);
  }

  Future<void> _check206ab() async {
    if (!_consented()) return;
    final lang = indiaLang(context);
    final out = await _run(inLine(lang, 'Checking section 206AB…'), () => _cloud.quickoTool('check_206ab', {'pan': _pan.text.trim().toUpperCase(), 'consent': true, 'reason': 'Higher TDS check under section 206AB'}));
    if (out == null || !mounted) return;
    final specified = '${out.data['specifiedPerson'] ?? ''}'.toLowerCase();
    _show(inFill(inLine(lang, 'Section 206AB for {pan}'), {'pan': out.data['pan'] ?? ''}), [
      if ('${out.data['name'] ?? ''}'.isNotEmpty) MapEntry(inLine(lang, 'Name'), '${out.data['name']}'),
      MapEntry(
        inLine(lang, 'Specified person'),
        specified == 'yes'
            ? inLine(lang, 'Yes: deduct TDS at the higher rate')
            : specified == 'no'
            ? inLine(lang, 'No: the normal TDS rate applies')
            : specified,
      ),
      if ('${out.data['panStatus'] ?? ''}'.isNotEmpty) MapEntry(inLine(lang, 'PAN status'), '${out.data['panStatus']}'),
      if ('${out.data['financialYear'] ?? ''}'.isNotEmpty) MapEntry(inLine(lang, 'Financial year'), '${out.data['financialYear']}'),
    ], out);
  }

  Future<void> _verifyBank() async {
    final lang = indiaLang(context);
    final out = await _run(inLine(lang, 'Checking the bank account…'), () => _cloud.quickoTool('verify_bank_account', {
          'ifsc': _ifsc.text.trim().toUpperCase(),
          'accountNumber': _account.text.trim(),
          if (_accountName.text.trim().isNotEmpty) 'name': _accountName.text.trim(),
        }));
    if (out == null || !mounted) return;
    _show(
      inFill(inLine(lang, 'Account ending {digits}'), {'digits': out.data['accountEndsWith'] ?? ''}),
      plainFields(out.data['result']),
      out,
      inLine(lang, 'No money was sent: this check does not use a penny drop.'),
    );
  }

  Future<void> _signIn() async {
    final out = await _run(inText(context, 'Signing in to the income tax portal…'), () => _cloud.quickoSignIn('itd', pan: _itdPan.text.trim().toUpperCase(), password: _itdPassword.text));
    _itdPassword.clear();
    if (out == null || !mounted) return;
    await _reload();
  }

  Future<void> _signOut() async {
    final out = await _run(inText(context, 'Signing out…'), () => _cloud.quickoSignOut('itd'));
    if (out == null || !mounted) return;
    await _reload();
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final status = _status;
    final busy = _busy.isNotEmpty;
    Widget button(String label, VoidCallback onPressed, {bool primary = false}) => Padding(
          padding: const EdgeInsets.only(top: 8),
          child: SizedBox(
            width: double.infinity,
            child: primary ? FilledButton(onPressed: busy ? null : onPressed, child: Text(label)) : OutlinedButton(onPressed: busy ? null : onPressed, child: Text(label)),
          ),
        );
    Widget field(String key, TextEditingController controller, String label, {bool secret = false, TextCapitalization caps = TextCapitalization.none, TextInputType? keyboard}) => Padding(
          padding: const EdgeInsets.only(top: 8),
          child: TextField(
            key: ValueKey('quicko.$key'),
            controller: controller,
            obscureText: secret,
            textCapitalization: caps,
            keyboardType: keyboard,
            decoration: InputDecoration(labelText: label),
          ),
        );
    Widget heading(String title, String body) => Padding(
          padding: const EdgeInsets.only(top: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: text.titleMedium),
              const SizedBox(height: 4),
              Text(body, style: text.bodySmall),
            ],
          ),
        );
    final itd = status?.sessionFor('itd');
    return Scaffold(
      appBar: AppBar(title: Text(inText(context, 'Income tax checks'))),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Text(inText(context, 'Sandbox by Quicko reads the forms and runs the checks. MyCA shows what comes back and works nothing out from it.'), style: text.bodyMedium),
          if (status?.simulated == true)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(inText(context, 'Practice mode: nothing is sent to Quicko.'), style: text.bodySmall?.copyWith(color: Palette.danger)),
            ),
          if (_resultTitle.isNotEmpty) ...[
            const SizedBox(height: 16),
            Container(
              key: const ValueKey('quicko.result'),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: Palette.surface, borderRadius: BorderRadius.circular(radiusCard), border: Border.all(color: Palette.line)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_resultTitle, style: text.titleSmall),
                  for (final row in _rows)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text('${row.key}: ${row.value}', style: text.bodyMedium),
                    ),
                  if (_rows.isEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(inText(context, 'Quicko sent nothing back to show.'), style: text.bodyMedium)),
                  if (_resultNote.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_resultNote, style: text.bodySmall)),
                ],
              ),
            ),
          ],
          if (_busy.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_busy, style: text.bodyMedium)),
          if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error, style: TextStyle(color: Palette.danger, fontWeight: FontWeight.w500))),
          heading(inText(context, 'Read Form 16 or Form 26AS'), inText(context, 'Choose the PDF from TRACES or your employer. Every figure is shown as printed; check it against the page before using it in a return.')),
          field('pdfPassword', _pdfPassword, inText(context, 'PDF password, if it has one'), secret: true),
          button(inText(context, 'Read Form 16'), () => _readForm('read_form16')),
          button(inText(context, 'Read Form 26AS'), () => _readForm('read_form26as')),
          heading(inText(context, 'Check a PAN'), inText(context, 'Confirms the PAN with the income tax department, or whether section 206AB asks for TDS at the higher rate.')),
          field('pan', _pan, 'PAN', caps: TextCapitalization.characters),
          field('panName', _panName, inText(context, 'Name as on the PAN (optional)')),
          field('dob', _dob, inText(context, 'Date of birth, DD/MM/YYYY (optional)'), keyboard: TextInputType.datetime),
          CheckboxListTile(
            key: const ValueKey('quicko.consent'),
            contentPadding: EdgeInsets.zero,
            value: _consent,
            onChanged: busy ? null : (value) => setState(() => _consent = value == true),
            title: Text(inText(context, 'The person agreed to this check'), style: text.bodyMedium),
            controlAffinity: ListTileControlAffinity.leading,
          ),
          button(inText(context, 'Verify PAN'), _verifyPan),
          button(inText(context, 'Check section 206AB'), _check206ab),
          heading(inText(context, 'Check a bank account'), inText(context, 'Confirms the account and the name at the bank before you pay a supplier.')),
          field('ifsc', _ifsc, 'IFSC', caps: TextCapitalization.characters),
          field('account', _account, inText(context, 'Account number'), keyboard: TextInputType.number),
          field('accountName', _accountName, inText(context, 'Name of the account holder (optional)')),
          button(inText(context, 'Verify account'), _verifyBank),
          heading(inText(context, 'Income tax portal'), inText(context, 'Sign in once so MyCA can read your AIS and filed returns. The session is kept locked for this business and the password is not stored.')),
          if (itd != null) ...[
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                itd.expiresAt == null
                    ? inFormat(context, 'Signed in as {user}.', {'user': itd.subject})
                    : inFormat(context, 'Signed in as {user} until {time}.', {'user': itd.subject, 'time': _clock(itd.expiresAt!)}),
                style: text.bodyMedium,
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: TextButton(onPressed: busy ? null : _signOut, child: Text(inText(context, 'Sign out of the income tax portal'))),
            ),
          ] else if (status != null && !status.available)
            Padding(padding: const EdgeInsets.only(top: 8), child: Text(cloudMessage('QUICKO_SESSIONS_UNAVAILABLE'), style: text.bodyMedium))
          else ...[
            field('itdPan', _itdPan, inText(context, 'PAN used to sign in'), caps: TextCapitalization.characters),
            field('itdPassword', _itdPassword, inText(context, 'Income tax portal password'), secret: true),
            button(inText(context, 'Sign in'), _signIn, primary: true),
          ],
        ],
      ),
    );
  }
}
