import 'package:myca_design/myca_design.dart' show MycaThemeContext;
import 'package:flutter/material.dart';

import '../../api/models.dart';
import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../format.dart';
import '../../us/us_return.dart';
import '../../us/us_state.dart';
import '../../us/us_text_scaler.dart';
import '../../widgets.dart';
import 'us_fields.dart';

class _Lived {
  _Lived(this.id, {this.state, String from = '', String to = ''}) {
    this.from.text = from.isEmpty ? '' : usDate(from);
    this.to.text = to.isEmpty ? '' : usDate(to);
  }

  final int id;
  String? state;
  final from = TextEditingController();
  final to = TextEditingController();

  void dispose() {
    from.dispose();
    to.dispose();
  }
}

class _Start {
  const _Start({required this.saved, required this.addressState, required this.w2, required this.coverage});

  final List<UsResidency> saved;
  final String addressState;
  final List<String> w2;
  final UsStateCoverage coverage;
}

class UsStateResidencyScreen extends StatefulWidget {
  const UsStateResidencyScreen({super.key, required this.taxYear});

  final int taxYear;

  @override
  State<UsStateResidencyScreen> createState() => _UsStateResidencyScreenState();
}

class _UsStateResidencyScreenState extends State<UsStateResidencyScreen> {
  Future<_Start>? _start;
  String? _home;
  bool? _moved;
  final _lived = <_Lived>[];
  final _worked = <String>[];
  final _workedOn = <String>{};
  List<String> _w2 = const [];
  Map<String, UsResidency> _kept = const {};
  UsStateCoverage _coverage = UsStateCoverage.unknown;
  final _errors = <String, String>{};
  String _note = '';
  bool _busy = false;
  int _rows = 0;

  MycaApi get _api => AppScope.of(context).api;

  String get _year => '${widget.taxYear}';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _start ??= _load();
  }

  @override
  void dispose() {
    for (final row in _lived) {
      row.dispose();
    }
    super.dispose();
  }

  Future<_Start> _load() async {
    final year = widget.taxYear;
    final results = await Future.wait<Object?>([
      _api.query('us_taxpayer', {'taxYear': year}),
      loadTaxForms(_api, year),
      loadStateReturns(_api, year).then<Object?>((r) => r).catchError((_) => null),
      loadStateCoverage(_api),
    ]);
    final address = toolData(results[0])['address'];
    final returns = results[2] as UsStateReturns?;
    final start = _Start(
      saved: returns == null || returns.assumed ? const [] : returns.residency,
      addressState: address is Map ? '${address['state'] ?? ''}'.toUpperCase() : '',
      w2: w2States(results[1] as List<UsTaxForm>),
      coverage: results[3] as UsStateCoverage,
    );
    _begin(start);
    return start;
  }

  _Lived _row({String? state, String from = '', String to = ''}) => _Lived(_rows++, state: state, from: from, to: to);

  void _begin(_Start start) {
    _coverage = start.coverage;
    _w2 = start.w2;
    _kept = {for (final r in start.saved) r.state: r};
    for (final row in _lived) {
      row.dispose();
    }
    _lived.clear();
    _worked.clear();
    _workedOn.clear();
    final saved = start.saved;
    if (saved.isNotEmpty) {
      final full = saved.where((r) => r.residency == 'full-year').firstOrNull;
      final parts = saved.where((r) => r.residency == 'part-year').toList()..sort((a, b) => a.from.compareTo(b.from));
      if (full != null) {
        _home = full.state;
        _moved = false;
      } else if (parts.isNotEmpty) {
        _moved = true;
        _home = parts.last.state;
        _lived.addAll([for (final p in parts) _row(state: p.state, from: p.from, to: p.to)]);
      }
      for (final r in saved.where((r) => r.residency == 'nonresident')) {
        _worked.add(r.state);
        _workedOn.add(r.state);
      }
    } else {
      _home = start.addressState.isNotEmpty ? start.addressState : start.w2.firstOrNull;
      _moved = null;
    }
    for (final s in start.w2) {
      if (!_worked.contains(s) && !_livedStates.contains(s)) {
        _worked.add(s);
        if (saved.isEmpty) _workedOn.add(s);
      }
    }
  }

  Set<String> get _livedStates => _moved == true ? {for (final r in _lived) ?r.state} : {?_home};

  void _answerMoved(bool moved) {
    setState(() {
      _moved = moved;
      _errors.remove('moved');
      if (moved && _lived.isEmpty) {
        _lived.add(_row(from: '$_year-01-01'));
        _lived.add(_row(state: _home, to: '$_year-12-31'));
      }
    });
  }

  Future<void> _addWorked(String? state) async {
    if (state == null) return;
    setState(() {
      if (!_worked.contains(state)) _worked.add(state);
      _workedOn.add(state);
    });
  }

  List<UsResidency>? _plan() {
    _errors.clear();
    final out = <UsResidency>[];
    UsResidency keep(String state, String residency, {String from = '', String to = ''}) {
      final was = _kept[state];
      return was == null ? UsResidency(state: state, residency: residency, from: from, to: to) : was.moved(residency: residency, from: from, to: to);
    }

    if (_moved == null) _errors['moved'] = 'Choose yes or no.';
    if (_moved != true) {
      if (_home == null) {
        _errors['home'] = 'Choose the state you lived in.';
      } else {
        out.add(keep(_home!, 'full-year'));
      }
    } else {
      final seen = <String>{};
      for (final row in _lived) {
        final from = isoFromUsDate(row.from.text);
        final to = isoFromUsDate(row.to.text);
        if (row.state == null) _errors['lived${row.id}.state'] = 'Choose the state.';
        if (row.state != null && !seen.add(row.state!)) _errors['lived${row.id}.state'] = 'This state is listed twice.';
        if (from == null) _errors['lived${row.id}.from'] = 'Enter the date as MM/DD/YYYY.';
        if (to == null) _errors['lived${row.id}.to'] = 'Enter the date as MM/DD/YYYY.';
        if (row.state != null && from != null && to != null) out.add(keep(row.state!, 'part-year', from: from, to: to));
      }
    }
    final lived = {for (final r in out) r.state};
    for (final s in _worked) {
      if (_workedOn.contains(s) && !lived.contains(s)) out.add(keep(s, 'nonresident'));
    }
    return _errors.isEmpty ? out : null;
  }

  Future<void> _save() async {
    final plan = _plan();
    if (plan == null) {
      setState(() => _note = 'Check the highlighted answers.');
      return;
    }
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      final problem = await saveStateResidency(_api, widget.taxYear, plan);
      if (!mounted) return;
      if (problem == null) {
        Navigator.of(context).pop(true);
        return;
      }
      setState(() => _note = problem);
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _choice(String key, String label, bool value) {
    final picked = _moved == value;
    void pick() => _answerMoved(value);
    return picked ? FilledButton(key: Key(key), onPressed: pick, child: Text(label)) : OutlinedButton(key: Key(key), onPressed: pick, child: Text(label));
  }

  Widget? _coverageLine(String? state) {
    final line = state == null ? null : _coverage.message(state);
    if (line == null) return null;
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Text(line, key: Key('usResidency.coverage.$state'), style: Theme.of(context).textTheme.bodySmall?.copyWith(color: context.myca.muted)),
    );
  }

  List<Widget> _livedRows() {
    final text = Theme.of(context).textTheme;
    return [
      for (var i = 0; i < _lived.length; i++) ...[
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(child: Text('State ${i + 1}', style: text.titleMedium)),
            if (_lived.length > 2)
              TextButton(
                key: Key('usResidency.removeLived$i'),
                onPressed: () => setState(() => _lived.removeAt(i).dispose()),
                child: const Text('Remove'),
              ),
          ],
        ),
        UsStateField(
          key: Key('usResidency.lived$i.state.${_lived[i].id}'),
          value: _lived[i].state,
          errorText: _errors['lived${_lived[i].id}.state'],
          onChanged: (value) => setState(() => _lived[i].state = value),
        ),
        ?_coverageLine(_lived[i].state),
        const SizedBox(height: 10),
        KeyedSubtree(key: Key('usResidency.lived$i.from'), child: UsDateField(controller: _lived[i].from, label: 'Lived there from', errorText: _errors['lived${_lived[i].id}.from'])),
        const SizedBox(height: 10),
        KeyedSubtree(key: Key('usResidency.lived$i.to'), child: UsDateField(controller: _lived[i].to, label: 'Lived there until', errorText: _errors['lived${_lived[i].id}.to'])),
      ],
      const SizedBox(height: 8),
      Align(
        alignment: Alignment.centerLeft,
        child: OutlinedButton(key: const Key('usResidency.addLived'), onPressed: () => setState(() => _lived.add(_row())), child: const Text('Add another state you lived in')),
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Where you lived')),
      body: SafeArea(
        child: FutureBuilder<_Start>(
          future: _start,
          builder: (context, loaded) {
            if (loaded.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
            if (loaded.hasError) {
              return UsLoadError(message: usLoadProblem(loaded.error, 'Your states could not be loaded.'), onRetry: () => setState(() { _start = _load(); }));
            }
            final others = [for (final s in _worked) if (!_livedStates.contains(s)) s];
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                Text(wholeWords('Where you lived in ${widget.taxYear}'), style: text.headlineMedium),
                const SizedBox(height: 6),
                Text('Each state return is worked out from this. We started from your address and the states on your W-2s.', style: text.bodyMedium?.copyWith(color: context.myca.muted)),
                const SizedBox(height: 18),
                if (_moved != true) ...[
                  UsStateField(
                    key: const Key('usResidency.home'),
                    label: 'State you lived in',
                    value: _home,
                    errorText: _errors['home'],
                    helperText: loaded.data!.addressState.isNotEmpty && _home == loaded.data!.addressState ? 'From your home address' : null,
                    onChanged: (value) => setState(() => _home = value),
                  ),
                  ?_coverageLine(_home),
                  const SizedBox(height: 22),
                ],
                Text('Did you live in another state this year?', key: const Key('usResidency.movedQuestion'), style: text.titleMedium),
                const SizedBox(height: 4),
                Text('For example, you moved in or out of a state during ${widget.taxYear}.', style: text.bodySmall),
                if (_errors['moved'] != null) Text(_errors['moved']!, style: TextStyle(color: context.myca.danger)),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(child: _choice('usResidency.movedYes', 'Yes', true)),
                    const SizedBox(width: 10),
                    Expanded(child: _choice('usResidency.movedNo', 'No', false)),
                  ],
                ),
                if (_moved == true) ..._livedRows(),
                const SizedBox(height: 24),
                const SectionLabel('States where you worked but did not live'),
                Text(
                  others.isEmpty ? 'Add a state if you earned wages or other income there without living there.' : 'A nonresident return reports the income you earned there. Untick a state if you did not work there.',
                  style: text.bodySmall,
                ),
                for (final s in others)
                  CheckboxListTile(
                    key: Key('usResidency.worked.$s'),
                    contentPadding: EdgeInsets.zero,
                    value: _workedOn.contains(s),
                    title: Text(usStateName(s)),
                    subtitle: Text(_w2.contains(s) ? 'Wages on your W-2 (box 15)' : 'Added by you'),
                    onChanged: (on) => setState(() => on == true ? _workedOn.add(s) : _workedOn.remove(s)),
                  ),
                const SizedBox(height: 8),
                KeyedSubtree(key: const Key('usResidency.addWorked'), child: UsStateField(key: ValueKey(_worked.length), label: 'Add a state where you earned income', value: null, onChanged: _addWorked)),
                if (_note.isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Text(_note, key: const Key('usResidency.note'), style: TextStyle(color: context.myca.danger, fontWeight: FontWeight.w500)),
                ],
                const SizedBox(height: 22),
                FilledButton(key: const Key('usResidency.save'), onPressed: _busy ? null : _save, child: Text(_busy ? 'Saving…' : 'Save')),
              ],
            );
          },
        ),
      ),
    );
  }
}
