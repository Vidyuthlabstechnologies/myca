import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../format.dart';
import '../../theme.dart';
import '../../us/tin.dart';
import '../../us/us_return.dart';
import '../../widgets.dart';
import 'us_fields.dart';

Map<String, dynamic> _map(Object? value) => value is Map ? value.cast<String, dynamic>() : const <String, dynamic>{};

String _text(Object? value) => value == null ? '' : '$value';

const relationships = <(String, String)>[
  ('son', 'Son'),
  ('daughter', 'Daughter'),
  ('stepchild', 'Stepchild'),
  ('foster_child', 'Foster child'),
  ('grandchild', 'Grandchild'),
  ('sibling', 'Brother or sister'),
  ('niece_nephew', 'Niece or nephew'),
  ('parent', 'Parent'),
  ('other', 'Other relative'),
];

class _Person {
  _Person();

  factory _Person.from(Object? json) {
    final map = _map(json);
    final person = _Person();
    person.first.text = _text(map['firstName']);
    person.last.text = _text(map['lastName']);
    person.savedMask = maskTin(_text(map['ssn']).isEmpty ? _text(map['ssnLast4']) : _text(map['ssn']));
    final dob = _text(map['dateOfBirth']);
    person.birth.text = dob.isEmpty ? '' : usDate(dob);
    person.occupation.text = _text(map['occupation']);
    person.relationship = _text(map['relationship']).isEmpty ? null : _text(map['relationship']);
    person.months.text = map['months'] == null ? '' : _text(map['months']);
    person.id = _text(map['id']);
    return person;
  }

  final first = TextEditingController();
  final last = TextEditingController();
  final ssn = TextEditingController();
  final birth = TextEditingController();
  final occupation = TextEditingController();
  final months = TextEditingController();
  String savedMask = '';
  String? relationship;
  String id = '';
  final errors = <String, String>{};

  void dispose() {
    for (final c in [first, last, ssn, birth, occupation, months]) {
      c.dispose();
    }
  }

  bool check({bool dependent = false}) {
    errors.clear();
    if (first.text.trim().isEmpty) errors['first'] = 'Enter the first name.';
    if (last.text.trim().isEmpty) errors['last'] = 'Enter the last name.';
    final tin = tinProblem(ssn.text, required: savedMask.isEmpty);
    if (tin != null) errors['ssn'] = tin;
    final birthProblem = usDateProblem(birth.text);
    if (birthProblem != null) errors['birth'] = birthProblem;
    if (dependent) {
      if (relationship == null) errors['relationship'] = 'Choose how they are related to you.';
      final m = int.tryParse(months.text.trim());
      if (m == null || m < 0 || m > 12) errors['months'] = 'Enter 0 to 12.';
    }
    return errors.isEmpty;
  }

  Map<String, Object?> toArgs({bool dependent = false}) => {
    if (id.isNotEmpty) 'id': id,
    'firstName': first.text.trim(),
    'lastName': last.text.trim(),
    if (tinDigits(ssn.text).isNotEmpty) 'ssn': tinDigits(ssn.text),
    'dateOfBirth': isoFromUsDate(birth.text),
    if (!dependent) 'occupation': occupation.text.trim(),
    if (dependent) 'relationship': relationship,
    if (dependent) 'months': int.tryParse(months.text.trim()) ?? 0,
  };
}

class UsProfileScreen extends StatefulWidget {
  const UsProfileScreen({super.key, required this.taxYear});

  final int taxYear;

  @override
  State<UsProfileScreen> createState() => _UsProfileScreenState();
}

class _UsProfileScreenState extends State<UsProfileScreen> {
  Future<void>? _loaded;
  String _status = '';
  _Person _you = _Person();
  _Person _spouse = _Person();
  final _dependents = <_Person>[];
  final _line1 = TextEditingController();
  final _line2 = TextEditingController();
  final _city = TextEditingController();
  final _zip = TextEditingController();
  String? _state;
  final _errors = <String, String>{};
  String _note = '';
  bool _busy = false;

  MycaApi get _api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _loaded ??= _load();
  }

  Future<void> _load() async {
    Map<String, dynamic> data = const {};
    try {
      data = toolData(await _api.query('us_taxpayer', {'taxYear': widget.taxYear}));
    } on MycaApiException {
      data = const {};
    }
    if (!mounted) return;
    setState(() {
      _status = _text(data['filingStatus']);
      if (data['taxpayer'] is Map) _you = _Person.from(data['taxpayer']);
      if (data['spouse'] is Map) _spouse = _Person.from(data['spouse']);
      for (final d in (data['dependents'] as List? ?? const [])) {
        _dependents.add(_Person.from(d));
      }
      final address = _map(data['address']);
      _line1.text = _text(address['line1']);
      _line2.text = _text(address['line2']);
      _city.text = _text(address['city']);
      _zip.text = _text(address['zip']);
      _state = _text(address['state']).isEmpty ? null : _text(address['state']);
    });
  }

  @override
  void dispose() {
    _you.dispose();
    _spouse.dispose();
    for (final d in _dependents) {
      d.dispose();
    }
    for (final c in [_line1, _line2, _city, _zip]) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _withSpouse => filingWithSpouse(_status);

  Future<void> _save() async {
    _errors.clear();
    if (_status.isEmpty) _errors['status'] = 'Choose your filing status.';
    final youOk = _you.check();
    final spouseOk = !_withSpouse || _spouse.check();
    var dependentsOk = true;
    for (final d in _dependents) {
      dependentsOk = d.check(dependent: true) && dependentsOk;
    }
    if (_line1.text.trim().isEmpty) _errors['line1'] = 'Enter your street address.';
    if (_city.text.trim().isEmpty) _errors['city'] = 'Enter your city.';
    if (_state == null) _errors['state'] = 'Choose your state.';
    final zip = zipProblem(_zip.text);
    if (zip != null) _errors['zip'] = zip;
    if (_errors.isNotEmpty || !youOk || !spouseOk || !dependentsOk) {
      return setState(() => _note = 'Some answers need a look. They are marked in red.');
    }
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      final reply = await saveAndConfirm(_api, 'set_us_taxpayer', {
        'taxYear': widget.taxYear,
        'filingStatus': _status,
        'taxpayer': _you.toArgs(),
        if (_withSpouse) 'spouse': _spouse.toArgs(),
        'dependents': [for (final d in _dependents) d.toArgs(dependent: true)],
        'address': {
          'line1': _line1.text.trim(),
          if (_line2.text.trim().isNotEmpty) 'line2': _line2.text.trim(),
          'city': _city.text.trim(),
          'state': _state,
          'zip': _zip.text.trim(),
        },
      });
      if (!mounted) return;
      if (reply.posted) {
        for (final p in [_you, _spouse, ..._dependents]) {
          p.ssn.clear();
        }
        Navigator.of(context).pop();
        return;
      }
      setState(() => _note = reply.reply.isEmpty ? 'Not saved. Try again.' : reply.reply);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  List<Widget> _personFields(_Person p, String who, {bool dependent = false}) => [
    TextField(
      key: Key('usProfile.$who.first'),
      controller: p.first,
      textCapitalization: TextCapitalization.words,
      decoration: InputDecoration(labelText: 'First name', errorText: p.errors['first']),
    ),
    const SizedBox(height: 12),
    TextField(
      key: Key('usProfile.$who.last'),
      controller: p.last,
      textCapitalization: TextCapitalization.words,
      decoration: InputDecoration(labelText: 'Last name', errorText: p.errors['last']),
    ),
    const SizedBox(height: 12),
    SsnField(key: Key('usProfile.$who.ssn'), controller: p.ssn, label: 'Social Security number', savedMask: p.savedMask, errorText: p.errors['ssn']),
    const SizedBox(height: 12),
    UsDateField(key: Key('usProfile.$who.birth'), controller: p.birth, label: 'Date of birth', errorText: p.errors['birth']),
    const SizedBox(height: 12),
    if (!dependent)
      TextField(
        key: Key('usProfile.$who.occupation'),
        controller: p.occupation,
        textCapitalization: TextCapitalization.sentences,
        decoration: const InputDecoration(labelText: 'Occupation'),
      )
    else ...[
      DropdownButtonFormField<String>(
        key: Key('usProfile.$who.relationship'),
        initialValue: p.relationship,
        isExpanded: true,
        decoration: InputDecoration(labelText: 'Relationship to you', errorText: p.errors['relationship']),
        items: [for (final (value, label) in relationships) DropdownMenuItem(value: value, child: Text(label))],
        onChanged: (value) => setState(() => p.relationship = value),
      ),
      const SizedBox(height: 12),
      TextField(
        key: Key('usProfile.$who.months'),
        controller: p.months,
        keyboardType: TextInputType.number,
        decoration: InputDecoration(labelText: 'Months they lived with you in ${widget.taxYear}', errorText: p.errors['months']),
      ),
    ],
  ];

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('About you')),
      body: SafeArea(
        child: FutureBuilder<void>(
          future: _loaded,
          builder: (context, loaded) {
            if (loaded.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                const SectionLabel('Filing status'),
                if (_errors['status'] != null) Text(_errors['status']!, style: const TextStyle(color: Palette.danger)),
                RadioGroup<String>(
                  groupValue: _status.isEmpty ? null : _status,
                  onChanged: (value) => setState(() => _status = value ?? ''),
                  child: Column(
                    children: [
                      for (final (code, label, help) in filingStatuses)
                        RadioListTile<String>(
                          key: Key('usProfile.status.$code'),
                          contentPadding: EdgeInsets.zero,
                          value: code,
                          title: Text(label),
                          subtitle: Text(help),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                const SectionLabel('You'),
                ..._personFields(_you, 'you'),
                if (_withSpouse) ...[
                  const SizedBox(height: 22),
                  const SectionLabel('Your spouse'),
                  ..._personFields(_spouse, 'spouse'),
                ],
                const SizedBox(height: 22),
                const SectionLabel('Home address'),
                TextField(key: const Key('usProfile.line1'), controller: _line1, decoration: InputDecoration(labelText: 'Street address', errorText: _errors['line1'])),
                const SizedBox(height: 12),
                TextField(controller: _line2, decoration: const InputDecoration(labelText: 'Apartment, suite (optional)')),
                const SizedBox(height: 12),
                TextField(key: const Key('usProfile.city'), controller: _city, textCapitalization: TextCapitalization.words, decoration: InputDecoration(labelText: 'City', errorText: _errors['city'])),
                const SizedBox(height: 12),
                UsStateField(key: const Key('usProfile.state'), value: _state, errorText: _errors['state'], onChanged: (value) => setState(() => _state = value)),
                if (stateHasIncomeTax(_state ?? ''))
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(stateReturnNote, key: const Key('usProfile.stateNote'), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Palette.muted)),
                  ),
                const SizedBox(height: 12),
                TextField(key: const Key('usProfile.zip'), controller: _zip, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: 'ZIP code', errorText: _errors['zip'])),
                const SizedBox(height: 22),
                const SectionLabel('Dependents'),
                Text('Children or relatives you support. Each needs a Social Security number.', style: text.bodySmall),
                for (var i = 0; i < _dependents.length; i++) ...[
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(child: Text('Dependent ${i + 1}', style: text.titleMedium)),
                      TextButton(
                        onPressed: () => setState(() => _dependents.removeAt(i).dispose()),
                        child: const Text('Remove'),
                      ),
                    ],
                  ),
                  ..._personFields(_dependents[i], 'dependent$i', dependent: true),
                ],
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerLeft,
                  child: OutlinedButton(
                    key: const Key('usProfile.addDependent'),
                    onPressed: () => setState(() => _dependents.add(_Person())),
                    child: const Text('Add a dependent'),
                  ),
                ),
                if (_note.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text(_note, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
                ],
                const SizedBox(height: 22),
                FilledButton(key: const Key('usProfile.save'), onPressed: _busy ? null : _save, child: Text(_busy ? 'Saving…' : 'Save')),
                const SizedBox(height: 10),
                Text(
                  'Social Security numbers are sealed with their own key the moment they reach us. The app, your tax pro and our AI assistant only ever see the last four digits.',
                  style: text.bodySmall?.copyWith(color: Palette.muted),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}
