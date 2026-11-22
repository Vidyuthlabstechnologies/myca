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
    if (_set == null && !_busy && !_failed) _load(first: true);
  }

  @override
  void dispose() {
    _typed.dispose();
    super.dispose();
  }

  Future<void> _load({bool first = false, String after = ''}) async {
    try {
      final set = await loadStateQuestions(_api, widget.taxYear, _code);
      if (!mounted) return;
      setState(() {
        _set = set;
        final open = set.questions.indexWhere((q) => !q.answered);
        if (first) {
          _at = open < 0 ? set.questions.length : open;
        } else {
          final was = set.questions.indexWhere((q) => q.id == after);
          _at = was < 0 ? (open < 0 ? set.questions.length : open) : was + 1;
        }
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
    _answer = q?.answer;
    _typed.text = q == null ? '' : typedFrom(q, q.answer);
    _note = '';
  }

  Future<void> _move(Object? value) async {
    final q = _current;
    if (q == null) return;
    if (value == null) return setState(() => _note = answerProblem(q, _typed.text));
    if (q.answered && '${q.answer}' == '$value') {
      return setState(() {
        _at += 1;
        _show();
      });
    }
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      final problem = await saveStateAnswers(_api, widget.taxYear, _code, {q.id: value});
      if (!mounted) return;
      if (problem != null) {
        setState(() => _note = problem);
        return;
      }
      await _load(after: q.id);
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
        Text(none ? '$name asks nothing more of you beyond your federal return.' : 'Your answers are saved.', style: text.bodyLarge),
        if ((_set?.skipped ?? 0) > 0) ...[
          const SizedBox(height: 6),
          Text('${_set!.skipped} other ${_set!.skipped == 1 ? 'question doesn\'t' : 'questions don\'t'} apply to you, so we left ${_set!.skipped == 1 ? 'it' : 'them'} out.', key: const Key('usStateQuestions.skipped'), style: text.bodyMedium),
        ],
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
                      _load(first: true);
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
