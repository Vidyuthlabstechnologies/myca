import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../theme.dart';
import 'uk_common.dart';

const gbResidences = <(String, String)>[
  ('england', 'England'),
  ('wales', 'Wales'),
  ('northern-ireland', 'Northern Ireland'),
  ('scotland', 'Scotland'),
];

const gbStudentLoanPlans = <(String, String)>[
  ('plan1', 'Plan 1'),
  ('plan2', 'Plan 2'),
  ('plan4', 'Plan 4 (Scotland)'),
  ('plan5', 'Plan 5'),
  ('postgraduate', 'Postgraduate loan'),
];

const gbVatStaggers = <(String, String)>[
  ('1', 'Quarters ending March, June, September, December'),
  ('2', 'Quarters ending January, April, July, October'),
  ('3', 'Quarters ending February, May, August, November'),
  ('monthly', 'Monthly returns'),
];

const gbVatSchemes = <(String, String)>[
  ('standard', 'Standard accounting'),
  ('flat-rate', 'Flat Rate Scheme'),
];

const _identifierKinds = {'utr': 'utr', 'nino': 'nino', 'vrn': 'vrn'};

class UkTaxpayerScreen extends StatefulWidget {
  const UkTaxpayerScreen({super.key});

  @override
  State<UkTaxpayerScreen> createState() => _UkTaxpayerScreenState();
}

class _UkTaxpayerScreenState extends State<UkTaxpayerScreen> {
  final _name = TextEditingController();
  final _fields = {for (final key in _identifierKinds.keys) key: TextEditingController()};
  final _focus = {for (final key in _identifierKinds.keys) key: FocusNode()};
  final _flatRate = TextEditingController();
  final _errors = <String, String>{};
  final _checked = <String, String>{};
  String? _residence;
  Set<String>? _plans;
  bool? _calendarQuarters;
  String? _stagger;
  String? _scheme;
  bool _busy = false;
  bool _gone = false;
  String _problem = '';
  Map<String, dynamic> _saved = const {};

  MycaApi get _api => AppScope.of(context).api;

  @override
  void initState() {
    super.initState();
    for (final entry in _focus.entries) {
      entry.value.addListener(() {
        if (!entry.value.hasFocus) _check(entry.key);
      });
    }
  }

  @override
  void dispose() {
    _gone = true;
    _name.dispose();
    _flatRate.dispose();
    for (final c in _fields.values) {
      c.dispose();
    }
    for (final f in _focus.values) {
      f.dispose();
    }
    super.dispose();
  }

  Future<bool> _check(String key) async {
    if (_gone) return false;
    final value = _fields[key]!.text.trim();
    if (value.isEmpty) {
      setState(() => _errors.remove(key));
      return true;
    }
    if (_checked[key] == value) return !_errors.containsKey(key);
    final result = await ukQuery(_api, 'validate_gb_identifier', {'kind': _identifierKinds[key], 'value': value});
    if (!mounted || _gone) return false;
    final data = toolData(result);
    final valid = data['valid'] == true;
    setState(() {
      _checked[key] = value;
      if (valid) {
        _errors.remove(key);
      } else {
        _errors[key] = ukText(data['why']).isEmpty ? ukErrorWords(result, fallback: 'That number does not look right.') : ukText(data['why']);
      }
    });
    return valid;
  }

  int? _flatRateBasisPoints() {
    final text = _flatRate.text.trim().replaceAll('%', '');
    if (text.isEmpty) return null;
    final value = double.tryParse(text);
    if (value == null || value <= 0 || value > 20) return -1;
    return (value * 100).round();
  }

  Future<void> _save() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _problem = '';
    });
    try {
      final results = await Future.wait([for (final key in _fields.keys) _check(key)]);
      if (!mounted) return;
      final flat = _scheme == 'flat-rate' ? _flatRateBasisPoints() : null;
      if (flat == -1) _errors['flatRate'] = 'A flat rate is a percentage between 0.01 and 20, such as 12.5.';
      if (flat != -1) _errors.remove('flatRate');
      if (results.contains(false) || _errors.isNotEmpty) {
        setState(() => _problem = 'Some numbers need a look.');
        return;
      }
      final args = <String, Object?>{
        if (_name.text.trim().isNotEmpty) 'name': _name.text.trim(),
        for (final entry in _fields.entries)
          if (entry.value.text.trim().isNotEmpty) entry.key: entry.value.text.trim(),
        'residence': ?_residence,
        if (_plans != null) 'studentLoans': [for (final p in gbStudentLoanPlans) if (_plans!.contains(p.$1)) p.$1],
        'calendarQuarters': ?_calendarQuarters,
        'vatStagger': ?_stagger,
        'vatScheme': ?_scheme,
        'flatRateBasisPoints': ?flat,
      };
      if (args.isEmpty) {
        setState(() => _problem = 'Nothing has changed yet.');
        return;
      }
      final reply = await proposeAndConfirm(_api, 'set_gb_taxpayer', args);
      if (!mounted) return;
      if (!reply.posted) {
        setState(() => _problem = replyProblem(reply, 'set_gb_taxpayer', fallback: 'Your details were not saved.'));
        return;
      }
      for (final c in _fields.values) {
        c.clear();
      }
      setState(() {
        _saved = reply.toolResult('set_gb_taxpayer');
        _checked.clear();
      });
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _problem = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _idField(String key, String label, String helper, {TextCapitalization caps = TextCapitalization.characters}) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: TextField(
      key: Key('uk.taxpayer.$key'),
      controller: _fields[key],
      focusNode: _focus[key],
      autocorrect: false,
      enableSuggestions: false,
      textCapitalization: caps,
      inputFormatters: [LengthLimitingTextInputFormatter(16)],
      onChanged: (_) {
        if (_errors.containsKey(key)) setState(() => _errors.remove(key));
      },
      decoration: InputDecoration(labelText: label, helperText: helper, helperMaxLines: 3, errorText: _errors[key], errorMaxLines: 3),
    ),
  );

  Widget _dropdown(String key, String label, String hint, String? value, List<(String, String)> options, ValueChanged<String?> changed) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: DropdownButtonFormField<String>(
      key: Key('uk.taxpayer.$key'),
      initialValue: value,
      isExpanded: true,
      hint: Text(hint, overflow: TextOverflow.ellipsis),
      decoration: InputDecoration(labelText: label),
      items: [for (final o in options) DropdownMenuItem(value: o.$1, child: Text(o.$2, overflow: TextOverflow.ellipsis, maxLines: 2))],
      onChanged: changed,
    ),
  );

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Your UK tax details')),
      body: ListView(
        padding: ukPagePadding,
        children: [
          const UkNote('Only what you fill in or change is saved. Leave a number blank to keep the one already saved.'),
          if (_saved.isNotEmpty)
            UkCard(
              tone: Palette.accentSoft,
              children: [
                Text('Saved', key: const Key('uk.taxpayer.saved'), style: text.titleMedium),
                if (ukText(_saved['utr']).isNotEmpty) UkNote('UTR ${ukText(_saved['utr'])}'),
                if (ukText(_saved['nino']).isNotEmpty) UkNote('National Insurance number ${ukText(_saved['nino'])}'),
                if (ukText(_saved['vrn']).isNotEmpty) UkNote('VAT number ${ukText(_saved['vrn'])}'),
                UkNote('Lives in ${gbResidences.firstWhere((r) => r.$1 == ukText(_saved['residence']), orElse: () => ('', ukText(_saved['residence']))).$2}'),
              ],
            ),
          TextField(
            key: const Key('uk.taxpayer.name'),
            controller: _name,
            textCapitalization: TextCapitalization.words,
            inputFormatters: [LengthLimitingTextInputFormatter(160)],
            decoration: const InputDecoration(labelText: 'Your name', helperText: 'As HMRC has it'),
          ),
          const SizedBox(height: 12),
          _idField('utr', 'Unique Taxpayer Reference (UTR)', '10 digits, on letters from HMRC and your Self Assessment account'),
          _idField('nino', 'National Insurance number', 'Two letters, six numbers and a letter, like QQ 12 34 56 C'),
          _idField('vrn', 'VAT registration number', '9 digits, on your VAT registration certificate. Leave blank if you are not VAT registered'),
          _dropdown('residence', 'Where you live', 'Keep the saved choice', _residence, gbResidences, (v) => setState(() => _residence = v)),
          const UkNote('Scottish taxpayers pay Scottish income tax rates.'),
          const SizedBox(height: 8),
          Text('Student loans', style: text.titleMedium),
          UkNote(_plans == null ? 'Tick each plan you repay. Leave them all alone to keep what is saved.' : 'Saved as ticked, including none.'),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final plan in gbStudentLoanPlans)
                FilterChip(
                  key: Key('uk.taxpayer.plan.${plan.$1}'),
                  label: Text(plan.$2),
                  selected: _plans?.contains(plan.$1) ?? false,
                  onSelected: (on) => setState(() {
                    final next = {...?_plans};
                    on ? next.add(plan.$1) : next.remove(plan.$1);
                    _plans = next;
                  }),
                ),
            ],
          ),
          const SizedBox(height: 16),
          Text('Making Tax Digital quarters', style: text.titleMedium),
          SwitchListTile(
            key: const Key('uk.taxpayer.calendarQuarters'),
            contentPadding: EdgeInsets.zero,
            value: _calendarQuarters ?? false,
            onChanged: (v) => setState(() => _calendarQuarters = v),
            title: const Text('Use calendar quarters'),
            subtitle: const Text('Quarters ending 30 June, 30 September, 31 December and 31 March, instead of the 5th of the month'),
          ),
          const SizedBox(height: 8),
          Text('VAT', style: text.titleMedium),
          const SizedBox(height: 8),
          _dropdown('stagger', 'VAT return periods', 'Keep the saved choice', _stagger, gbVatStaggers, (v) => setState(() => _stagger = v)),
          _dropdown('scheme', 'VAT accounting scheme', 'Keep the saved choice', _scheme, gbVatSchemes, (v) => setState(() => _scheme = v)),
          if (_scheme == 'flat-rate')
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: TextField(
                key: const Key('uk.taxpayer.flatRate'),
                controller: _flatRate,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.%]')), LengthLimitingTextInputFormatter(6)],
                decoration: InputDecoration(labelText: 'Flat rate for your trade', suffixText: '%', helperText: 'From HMRC\'s list of flat rate percentages, such as 12.5', helperMaxLines: 2, errorText: _errors['flatRate'], errorMaxLines: 2),
              ),
            ),
          if (_problem.isNotEmpty) UkProblem(_problem),
          const SizedBox(height: 4),
          UkWideButton(label: _busy ? 'Saving…' : 'Save details', onPressed: _busy ? null : _save),
          const UkFooter(),
        ],
      ),
    );
  }
}
