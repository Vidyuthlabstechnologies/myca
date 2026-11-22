import 'package:myca_design/myca_design.dart' show MycaThemeContext;
import 'package:flutter/material.dart';

import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../us/us_return.dart';
import '../../us/us_state.dart';
import '../../us/us_text_scaler.dart';
import 'us_answer_input.dart';
import 'us_fields.dart';
import 'us_state_return_screen.dart';

class UsStateQuestionsScreen extends StatefulWidget {
  const UsStateQuestionsScreen({super.key, required this.taxYear, required this.state});

  final int taxYear;
  final String state;

  @override
  State<UsStateQuestionsScreen> createState() => _UsStateQuestionsScreenState();
}

class _UsStateQuestionsScreenState extends State<UsStateQuestionsScreen> {
  UsStateQuestionSet? _set;
  List<UsResidency> _residency = const [];
  final _answers = <String, Object?>{};
  int _at = 0;
  Object? _answer;
  final _typed = TextEditingController();
  String _note = '';
  bool _busy = false;
  bool _failed = false;

  MycaApi get _api => AppScope.of(context).api;

  String get _code => widget.state.toUpperCase();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_set == null && !_busy && !_failed) _load();
  }

  @override
  void dispose() {
    _typed.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait<Object>([loadStateQuestions(_api, widget.taxYear, _code), loadStateReturns(_api, widget.taxYear)]);
      if (!mounted) return;
      final set = results[0] as UsStateQuestionSet;
      final returns = results[1] as UsStateReturns;
      setState(() {
        _set = set;
        _residency = returns.residency;
        _answers
          ..clear()
          ..addAll({for (final q in set.questions) if (q.answered) q.id: q.answer});
        final open = set.questions.indexWhere((q) => !q.answered);
        _at = open < 0 ? set.questions.length : open;
        _show();
      });
    } on Object catch (err) {
      if (mounted) {
        setState(() {
          _failed = true;
          _note = err is UsStateProblem ? err.hint : usLoadProblem(err, 'The questions could not be loaded.');
        });
      }
    }
  }

  List<UsQuestion> get _questions => _set?.questions ?? const [];

  UsQuestion? get _current => _at < _questions.length ? _questions[_at] : null;

  void _show() {
    final q = _current;
    _answer = q == null ? null : _answers[q.id];
    _typed.text = q == null ? '' : typedFrom(q, _answers[q.id]);
    _note = '';
  }

  Future<bool> _save(Map<String, Object?> answers) async {
    final entry = _residency.where((r) => r.state == _code).firstOrNull;
    if (entry == null) {
      setState(() => _note = '${usStateName(_code)} is not on your return. Add it under Where you lived.');
      return false;
    }
    final states = [for (final r in _residency) r.state == _code ? r.withAnswers(answers) : r];
    final problem = await saveStateResidency(_api, widget.taxYear, states);
    if (!mounted) return false;
    if (problem != null) {
      setState(() => _note = problem);
      return false;
    }
    _residency = states;
    return true;
  }

  Future<void> _move(Object? value, {bool skip = false}) async {
    final q = _current;
    if (q == null) return;
    if (!skip && value == null) return setState(() => _note = answerProblem(q, _typed.text));
    final next = {..._answers};
    if (skip) {
      next.remove(q.id);
    } else {
      next[q.id] = value;
    }
    final changed = '${_answers[q.id]}' != '${next[q.id]}' || _answers.containsKey(q.id) != next.containsKey(q.id);
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      if (changed && !await _save(next)) return;
      setState(() {
        _answers
          ..clear()
          ..addAll(next);
        _at += 1;
        _show();
      });
    } on MycaApiException catch (err) {
      if (mounted) setState(() => _note = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _back() {
    if (_at == 0) return;
    setState(() {
      _at -= 1;
      _show();
    });
  }

  Widget _finished(TextTheme text) {
    final name = _set?.stateName ?? usStateName(_code);
    final none = _questions.isEmpty;
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Text(wholeWords(none ? 'No $name questions' : 'That is everything for $name'), key: const Key('usStateQuestions.finished'), style: text.headlineMedium),
        const SizedBox(height: 8),
        Text(none ? '$name asks nothing beyond your federal return.' : 'Your answers are saved. Questions you skipped are left off the return.', style: text.bodyLarge),
        const SizedBox(height: 20),
        FilledButton(
          key: const Key('usStateQuestions.see'),
          onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute<void>(builder: (_) => UsStateReturnScreen(taxYear: widget.taxYear, state: _code))),
          child: Text('See my $name return'),
        ),
        if (!none)
          TextButton(
            key: const Key('usStateQuestions.again'),
            onPressed: () => setState(() {
              _at = 0;
              _show();
            }),
            child: const Text('Go through my answers again'),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final set = _set;
    final q = _current;
    final canSayNone = q != null && (q.inputKind == 'amount' || q.inputKind == 'count');
    return Scaffold(
      appBar: AppBar(title: Text(set == null ? 'State questions' : '${set.stateName} questions')),
      body: SafeArea(
        child: set == null
            ? (_failed
                ? UsLoadError(
                    message: _note,
                    onRetry: () {
                      setState(() {
                        _failed = false;
                        _note = '';
                      });
                      _load();
                    },
                  )
                : const Center(child: CircularProgressIndicator()))
            : q == null
                ? _finished(text)
                : ListView(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
                    children: [
                      LinearProgressIndicator(value: (_at + 1) / _questions.length, minHeight: 4, semanticsLabel: 'Question ${_at + 1} of ${_questions.length}'),
                      const SizedBox(height: 8),
                      Text('${set.stateName} · question ${_at + 1} of ${_questions.length}', style: text.bodySmall),
                      const SizedBox(height: 20),
                      Text(wholeWords(q.text), key: const Key('usStateQuestions.question'), style: text.headlineSmall),
                      if (q.help.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(q.help, style: text.bodyMedium?.copyWith(color: context.myca.muted)),
                      ],
                      const SizedBox(height: 20),
                      UsAnswerInput(key: ValueKey(q.id), question: q, controller: _typed, answer: _answer, keyPrefix: 'usStateQuestions', dropdownAfter: 8, onAnswer: (v) => setState(() => _answer = v)),
                      if (_note.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Text(_note, key: const Key('usStateQuestions.note'), style: TextStyle(color: context.myca.danger, fontWeight: FontWeight.w500)),
                      ],
                      const SizedBox(height: 24),
                      Wrap(
                        alignment: WrapAlignment.spaceBetween,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          if (_at > 0) TextButton(key: const Key('usStateQuestions.back'), onPressed: _busy ? null : _back, child: const Text('Back')),
                          TextButton(key: const Key('usStateQuestions.skip'), onPressed: _busy ? null : () => _move(null, skip: true), child: const Text('Doesn\'t apply')),
                          if (canSayNone)
                            OutlinedButton(
                              key: const Key('usStateQuestions.none'),
                              onPressed: _busy
                                  ? null
                                  : () {
                                      _typed.text = '0';
                                      _move(0);
                                    },
                              child: const Text('None'),
                            ),
                          FilledButton(key: const Key('usStateQuestions.next'), onPressed: _busy ? null : () => _move(typedAnswer(q, _typed.text, _answer)), child: Text(_busy ? 'Saving…' : 'Next')),
                        ],
                      ),
                    ],
                  ),
      ),
    );
  }
}
