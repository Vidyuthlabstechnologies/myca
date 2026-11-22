import 'package:myca_design/myca_design.dart' show MycaThemeContext;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../us/us_text_scaler.dart';
import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../us/us_return.dart';
import 'us_fields.dart';
import 'us_review_screen.dart';

class UsInterviewScreen extends StatefulWidget {
  const UsInterviewScreen({super.key, required this.taxYear});

  final int taxYear;

  @override
  State<UsInterviewScreen> createState() => _UsInterviewScreenState();
}

class _UsInterviewScreenState extends State<UsInterviewScreen> {
  List<UsQuestion>? _questions;
  int _at = 0;
  Object? _answer;
  final _typed = TextEditingController();
  final _drafts = <String, (String, Object?)>{};
  String _note = '';
  bool _busy = false;
  bool _failed = false;

  MycaApi get _api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_questions == null && !_busy && !_failed) _load(first: true);
  }

  @override
  void dispose() {
    _typed.dispose();
    super.dispose();
  }

  Future<void> _load({bool first = false, String after = ''}) async {
    try {
      final questions = await loadInterview(_api, widget.taxYear);
      if (!mounted) return;
      setState(() {
        _questions = questions;
        if (first) {
          final open = questions.indexWhere((q) => !q.answered);
          _at = open < 0 ? questions.length : open;
        } else {
          final was = questions.indexWhere((q) => q.id == after);
          _at = was < 0 ? _at : was + 1;
        }
        _show();
      });
    } on Object catch (err) {
      if (mounted) {
        setState(() {
          _failed = true;
          _note = usLoadProblem(err, 'Your questions could not be loaded.');
        });
      }
    }
  }

  UsQuestion? get _current {
    final questions = _questions;
    if (questions == null || _at >= questions.length) return null;
    return questions[_at];
  }

  void _keepDraft() {
    final q = _current;
    if (q != null) _drafts[q.id] = (_typed.text, _answer);
  }

  void _show() {
    final q = _current;
    final draft = q == null ? null : _drafts[q.id];
    if (draft != null) {
      _typed.text = draft.$1;
      _answer = draft.$2;
    } else {
      _answer = q?.answer;
      _typed.text = q == null || q.answer == null ? '' : (q.inputKind == 'amount' ? dollarsTyped(q.answer) : '${q.answer}');
    }
    _note = '';
  }

  Object? _value(UsQuestion q) {
    switch (q.inputKind) {
      case 'amount':
        return q.negative ? parseSignedDollars(_typed.text) : parseDollars(_typed.text);
      case 'count':
        final n = int.tryParse(_typed.text.trim());
        return n == null || n < 0 ? null : n;
      case 'text':
        final t = _typed.text.trim();
        return t.isEmpty ? null : t;
      default:
        return _answer;
    }
  }

  Future<void> _none() async {
    _typed.text = '0';
    await _next();
  }

  Future<void> _next() async {
    final q = _current;
    if (q == null) return;
    final value = _value(q);
    if (value == null) {
      return setState(() => _note = switch (q.inputKind) {
        'amount' => _typed.text.trim().isEmpty ? 'Enter an amount, or tap None if you had none.' : 'Enter dollars and cents, like 1234.56.',
        'count' => 'Enter a whole number, or tap None.',
        'text' => 'Type your answer.',
        _ => 'Choose an answer.',
      });
    }
    setState(() {
      _busy = true;
      _note = '';
    });
    try {
      final reply = await saveAndConfirm(_api, 'answer_us_interview', {'taxYear': widget.taxYear, 'id': q.id, 'answer': value});
      if (!mounted) return;
      if (!reply.posted) {
        setState(() => _note = reply.reply.isEmpty ? 'Not saved. Check your connection and tap Next again.' : reply.reply);
        return;
      }
      _drafts.remove(q.id);
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
      _keepDraft();
      _at -= 1;
      _show();
    });
  }

  Widget _choiceButton(String key, String label, Object value) {
    final picked = _answer == value;
    void pick() => setState(() => _answer = value);
    return picked ? FilledButton(key: Key(key), onPressed: pick, child: Text(label)) : OutlinedButton(key: Key(key), onPressed: pick, child: Text(label));
  }

  Widget _input(UsQuestion q) {
    switch (q.inputKind) {
      case 'amount':
        return MoneyField(key: const Key('usInterview.amount'), controller: _typed, label: 'Amount', helper: q.negative ? 'Put a minus sign in front of a loss, like -2500' : null, signed: q.negative);
      case 'count':
        return TextField(
          key: const Key('usInterview.count'),
          controller: _typed,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(labelText: 'How many'),
        );
      case 'text':
        return TextField(key: const Key('usInterview.text'), controller: _typed, decoration: const InputDecoration(labelText: 'Your answer'));
      case 'choice':
        return RadioGroup<String>(
          groupValue: _answer == null ? null : '$_answer',
          onChanged: (v) => setState(() => _answer = v),
          child: Column(
            children: [
              for (final (value, label) in q.options)
                RadioListTile<String>(key: Key('usInterview.option.$value'), contentPadding: EdgeInsets.zero, value: value, title: Text(label)),
            ],
          ),
        );
      default:
        return Row(
          children: [
            Expanded(child: _choiceButton('usInterview.yes', 'Yes', true)),
            const SizedBox(width: 10),
            Expanded(child: _choiceButton('usInterview.no', 'No', false)),
          ],
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final questions = _questions;
    final q = _current;
    final canSayNone = q != null && (q.inputKind == 'amount' || q.inputKind == 'count');
    return Scaffold(
      appBar: AppBar(title: const Text('A few questions')),
      body: SafeArea(
        child: questions == null
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
                ? ListView(
                    padding: const EdgeInsets.all(24),
                    children: [
                      Text(questions.isEmpty ? 'No questions for you' : 'That is everything', key: const Key('usInterview.finished'), style: text.headlineMedium),
                      const SizedBox(height: 8),
                      Text(questions.isEmpty ? 'Nothing else is needed for your return here. Next, review your return.' : 'Your answers are saved. Next, review your return.', style: text.bodyLarge),
                      const SizedBox(height: 20),
                      FilledButton(
                        key: const Key('usInterview.review'),
                        onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute<void>(builder: (_) => UsReviewScreen(taxYear: widget.taxYear))),
                        child: const Text('Review my return'),
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton(key: const Key('usInterview.done'), onPressed: () => Navigator.of(context).pop(), child: const Text('Back to my return')),
                      if (questions.isNotEmpty)
                        TextButton(
                          key: const Key('usInterview.again'),
                          onPressed: () => setState(() {
                            _at = 0;
                            _show();
                          }),
                          child: const Text('Go through my answers again'),
                        ),
                    ],
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
                    children: [
                      LinearProgressIndicator(value: questions.isEmpty ? 1 : (_at + 1) / questions.length, minHeight: 4, semanticsLabel: 'Question ${_at + 1} of ${questions.length}'),
                      const SizedBox(height: 8),
                      Text('Question ${_at + 1} of ${questions.length}', style: text.bodySmall),
                      const SizedBox(height: 20),
                      Text(wholeWords(q.text), key: const Key('usInterview.question'), style: text.headlineSmall),
                      if (q.help.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(q.help, style: text.bodyMedium?.copyWith(color: context.myca.muted)),
                      ],
                      const SizedBox(height: 20),
                      _input(q),
                      if (_note.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Text(_note, key: const Key('usInterview.note'), style: TextStyle(color: context.myca.danger, fontWeight: FontWeight.w500)),
                      ],
                      const SizedBox(height: 24),
                      Wrap(
                        alignment: WrapAlignment.spaceBetween,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          if (_at > 0) TextButton(key: const Key('usInterview.back'), onPressed: _busy ? null : _back, child: const Text('Back')),
                          if (canSayNone) OutlinedButton(key: const Key('usInterview.none'), onPressed: _busy ? null : _none, child: const Text('None')),
                          FilledButton(key: const Key('usInterview.next'), onPressed: _busy ? null : _next, child: Text(_busy ? 'Saving…' : 'Next')),
                        ],
                      ),
                    ],
                  ),
      ),
    );
  }
}
