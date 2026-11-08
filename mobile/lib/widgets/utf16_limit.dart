import 'dart:math' as math;

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

class Utf16LengthLimit extends TextInputFormatter {
  const Utf16LengthLimit(this.maxUnits);

  final int maxUnits;

  static String clip(String text, int maxUnits) {
    if (text.length <= maxUnits) return text;
    final kept = StringBuffer();
    var used = 0;
    for (final piece in text.characters) {
      if (used + piece.length > maxUnits) break;
      kept.write(piece);
      used += piece.length;
    }
    return kept.toString();
  }

  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    if (newValue.text.length <= maxUnits) return newValue;
    final inserted = _insertion(oldValue, newValue);
    if (inserted != null) return inserted;
    final text = clip(newValue.text, maxUnits);
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }

  TextEditingValue? _insertion(TextEditingValue oldValue, TextEditingValue newValue) {
    final selection = oldValue.selection;
    final caret = newValue.selection;
    if (!selection.isValid || !caret.isValid) return null;
    final oldText = oldValue.text;
    final newText = newValue.text;
    final from = math.min(selection.start, selection.end);
    final to = math.max(selection.start, selection.end);
    if (from < 0 || to > oldText.length) return null;
    final head = oldText.substring(0, from);
    final tail = oldText.substring(to);
    if (newText.length < head.length + tail.length || !newText.startsWith(head) || !newText.endsWith(tail)) return null;
    if (caret.end != newText.length - tail.length) return null;
    final inserted = newText.substring(head.length, newText.length - tail.length);
    final room = maxUnits - head.length - tail.length;
    final kept = room > 0 ? clip(inserted, room) : '';
    final text = head + kept + tail;
    if (text.length > maxUnits) return null;
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: head.length + kept.length));
  }
}
