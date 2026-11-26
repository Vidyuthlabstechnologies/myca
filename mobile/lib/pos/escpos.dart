import 'dart:convert';

import 'latinize.dart';

enum PaperWidth { mm58, mm80 }

extension PaperColumns on PaperWidth {
  int get columns => this == PaperWidth.mm58 ? 32 : 48;
}

enum Align { left, center, right }

class EscPos {
  EscPos(this.paper) {
    _bytes.addAll(const [0x1B, 0x40]);
  }

  final PaperWidth paper;
  final List<int> _bytes = [];

  int get columns => paper.columns;

  List<int> get bytes => List.unmodifiable(_bytes);

  static String printable(String text) {
    final swapped = latinizeDevanagari(text).replaceAll('₹', 'Rs.').replaceAll('–', '-').replaceAll('—', '-').replaceAll('’', "'").replaceAll('‘', "'").replaceAll('“', '"').replaceAll('”', '"');
    return String.fromCharCodes(swapped.runes.map((code) => code >= 0x20 && code < 0x7F ? code : 0x3F));
  }

  void align(Align value) => _bytes.addAll([0x1B, 0x61, value.index]);

  void bold(bool on) => _bytes.addAll([0x1B, 0x45, on ? 1 : 0]);

  void size({bool wide = false, bool tall = false}) => _bytes.addAll([0x1D, 0x21, (wide ? 0x10 : 0) | (tall ? 0x01 : 0)]);

  void text(String value, {Align align = Align.left, bool bold = false, bool big = false}) {
    this.align(align);
    if (bold) this.bold(true);
    if (big) size(wide: true, tall: true);
    final width = big ? columns ~/ 2 : columns;
    for (final line in wrap(printable(value), width)) {
      _bytes.addAll(ascii.encode(line));
      _bytes.add(0x0A);
    }
    if (big) size();
    if (bold) this.bold(false);
    if (align != Align.left) this.align(Align.left);
  }

  void row(String left, String right, {bool bold = false}) {
    final cleanRight = printable(right);
    final room = columns - cleanRight.length - 1;
    final lines = wrap(printable(left), room < 8 ? columns : room);
    if (bold) this.bold(true);
    for (var i = 0; i < lines.length; i += 1) {
      final last = i == lines.length - 1;
      final line = last ? '${lines[i].padRight(columns - cleanRight.length)}$cleanRight' : lines[i];
      _bytes.addAll(ascii.encode(line.length > columns ? line.substring(0, columns) : line));
      _bytes.add(0x0A);
    }
    if (bold) this.bold(false);
  }

  void rule() {
    _bytes.addAll(ascii.encode('-' * columns));
    _bytes.add(0x0A);
  }

  void feed(int lines) => _bytes.addAll([0x1B, 0x64, lines.clamp(0, 255)]);

  void cut() => _bytes.addAll(const [0x1D, 0x56, 0x42, 0x00]);

  static List<String> wrap(String text, int width) {
    if (width <= 0) return [text];
    final words = text.split(RegExp(r'\s+')).where((word) => word.isNotEmpty).toList();
    if (words.isEmpty) return [''];
    final lines = <String>[];
    var current = '';
    for (var word in words) {
      while (word.length > width) {
        if (current.isNotEmpty) {
          lines.add(current);
          current = '';
        }
        lines.add(word.substring(0, width));
        word = word.substring(width);
      }
      if (current.isEmpty) {
        current = word;
      } else if (current.length + 1 + word.length <= width) {
        current = '$current $word';
      } else {
        lines.add(current);
        current = word;
      }
    }
    if (current.isNotEmpty) lines.add(current);
    return lines;
  }
}
