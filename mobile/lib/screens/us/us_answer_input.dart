import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../us/us_return.dart';
import 'us_fields.dart';

Object? typedAnswer(UsQuestion q, String typed, Object? picked) {
  switch (q.inputKind) {
    case 'amount':
      return q.negative ? parseSignedDollars(typed) : parseDollars(typed);
    case 'count':
      final n = int.tryParse(typed.trim());
      return n == null || n < 0 ? null : n;
    case 'text':
      final t = typed.trim();
      return t.isEmpty ? null : t;
    default:
      return picked;
  }
}

String answerProblem(UsQuestion q, String typed) => switch (q.inputKind) {
      'amount' => typed.trim().isEmpty ? 'Enter an amount, or tap None if you had none.' : 'Enter dollars and cents, like 1234.56.',
      'count' => 'Enter a whole number, or tap None.',
      'text' => 'Type your answer.',
      _ => 'Choose an answer.',
    };

String typedFrom(UsQuestion q, Object? answer) => answer == null ? '' : (q.inputKind == 'amount' ? dollarsTyped(answer) : '$answer');

class UsAnswerInput extends StatelessWidget {
  const UsAnswerInput({super.key, required this.question, required this.controller, required this.answer, required this.onAnswer, this.keyPrefix = 'usInterview', this.dropdownAfter});

  final UsQuestion question;
  final TextEditingController controller;
  final Object? answer;
  final ValueChanged<Object?> onAnswer;
  final String keyPrefix;
  final int? dropdownAfter;

  Widget _choiceButton(String key, String label, Object value) {
    final picked = answer == value;
    void pick() => onAnswer(value);
    return picked ? FilledButton(key: Key(key), onPressed: pick, child: Text(label)) : OutlinedButton(key: Key(key), onPressed: pick, child: Text(label));
  }

  @override
  Widget build(BuildContext context) {
    final q = question;
    switch (q.inputKind) {
      case 'amount':
        return MoneyField(key: Key('$keyPrefix.amount'), controller: controller, label: 'Amount', helper: q.negative ? 'Put a minus sign in front of a loss, like -2500' : null, signed: q.negative);
      case 'count':
        return TextField(
          key: Key('$keyPrefix.count'),
          controller: controller,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(labelText: 'How many'),
        );
      case 'text':
        return TextField(key: Key('$keyPrefix.text'), controller: controller, decoration: const InputDecoration(labelText: 'Your answer'));
      case 'choice':
        if (dropdownAfter != null && q.options.length > dropdownAfter!) {
          final known = q.options.any((o) => o.$1 == '$answer');
          return DropdownButtonFormField<String>(
            key: Key('$keyPrefix.pick.${q.id}'),
            initialValue: known ? '$answer' : null,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Choose one'),
            items: [for (final (value, label) in q.options) DropdownMenuItem(value: value, child: Text(label, overflow: TextOverflow.ellipsis))],
            onChanged: onAnswer,
          );
        }
        return RadioGroup<String>(
          groupValue: answer == null ? null : '$answer',
          onChanged: onAnswer,
          child: Column(
            children: [
              for (final (value, label) in q.options)
                RadioListTile<String>(key: Key('$keyPrefix.option.$value'), contentPadding: EdgeInsets.zero, value: value, title: Text(label)),
            ],
          ),
        );
      default:
        return Row(
          children: [
            Expanded(child: _choiceButton('$keyPrefix.yes', 'Yes', true)),
            const SizedBox(width: 10),
            Expanded(child: _choiceButton('$keyPrefix.no', 'No', false)),
          ],
        );
    }
  }
}
