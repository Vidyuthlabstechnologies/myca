import 'package:flutter/material.dart';

import '../../api/myca_api.dart';
import '../../app_state.dart';
import '../../theme.dart';
import '../../us/us_return.dart';
import '../../widgets.dart';
import 'us_fields.dart';

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
    } on MycaApiException catch (err) {
      if (mounted) {
        setState(() {
          _failed = true;
          _note = err.message;
        });
      }
    }
  }

  UsQuestion? get _current {
    final questions = _questions;
    if (questions == null || _at >= questions.length) return null;
    return questions[_at];
  }

  void _show() {
    final q = _current;
    _answer = q?.answer;
    _typed.text = q == null || q.answer == null ? '' : (q.kind == 'amount' ? dollarsTyped(q.answer) : '${q.answer}');
    _note = '';
  }

  Object? _value(UsQuestion q) {
    switch (q.kind) {
      case 'amount':
        return parseDollars(_typed.text);
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

  Future<void> _next() async {
    final q = _current;
    if (q == null) return;
    final value = _value(q);
    if (value == null) {
      return setState(() => _note = switch (q.kind) {
        'amount' => 'Enter an amount. Use 0 if none.',
        'count' => 'Enter a whole number. Use 0 if none.',
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
        setState(() => _note = reply.reply.isEmpty ? 'Not saved. Try again.' : reply.reply);
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

  Widget _input(UsQuestion q) {
    switch (q.kind) {
      case 'amount':
        return MoneyField(key: const Key('usInterview.amount'), controller: _typed, label: 'Amount');
      case 'count':
        return TextField(key: const Key('usInterview.count'), controller: _typed, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'How many'));
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
            Expanded(
              child: _answer == true
                  ? FilledButton(key: const Key('usInterview.yes'), onPressed: () => setState(() => _answer = true), child: const Text('Yes'))
                  : OutlinedButton(key: const Key('usInterview.yes'), onPressed: () => setState(() => _answer = true), child: const Text('Yes')),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _answer == false
                  ? FilledButton(key: const Key('usInterview.no'), onPressed: () => setState(() => _answer = false), child: const Text('No'))
                  : OutlinedButton(key: const Key('usInterview.no'), onPressed: () => setState(() => _answer = false), child: const Text('No')),
            ),
          ],
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final questions = _questions;
    final q = _current;
    return Scaffold(
      appBar: AppBar(title: const Text('A few questions')),
      body: SafeArea(
        child: questions == null
            ? (_failed ? EmptyNote(text: _note) : const Center(child: CircularProgressIndicator()))
            : q == null
                ? ListView(
                    padding: const EdgeInsets.all(24),
                    children: [
                      Text('That is everything', style: text.headlineMedium),
                      const SizedBox(height: 8),
                      Text('Your answers are saved. Next, review your return.', style: text.bodyLarge),
                      const SizedBox(height: 20),
                      FilledButton(key: const Key('usInterview.done'), onPressed: () => Navigator.of(context).pop(), child: const Text('Back to my return')),
                      if (questions.isNotEmpty)
                        TextButton(
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
                      LinearProgressIndicator(value: questions.isEmpty ? 1 : (_at + 1) / questions.length, minHeight: 4),
                      const SizedBox(height: 8),
                      Text('Question ${_at + 1} of ${questions.length}', style: text.bodySmall),
                      const SizedBox(height: 20),
                      Text(q.text, key: const Key('usInterview.question'), style: text.headlineSmall),
                      if (q.help.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(q.help, style: text.bodyMedium?.copyWith(color: Palette.muted)),
                      ],
                      const SizedBox(height: 20),
                      _input(q),
                      if (_note.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Text(_note, style: TextStyle(color: Palette.danger, fontWeight: FontWeight.w500)),
                      ],
                      const SizedBox(height: 24),
                      Row(
                        children: [
                          if (_at > 0) TextButton(key: const Key('usInterview.back'), onPressed: _busy ? null : _back, child: const Text('Back')),
                          const Spacer(),
                          FilledButton(key: const Key('usInterview.next'), onPressed: _busy ? null : _next, child: Text(_busy ? 'Saving…' : 'Next')),
                        ],
                      ),
                    ],
                  ),
      ),
    );
  }
}
