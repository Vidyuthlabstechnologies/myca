import 'package:flutter/widgets.dart';

class UsTextScaler extends TextScaler {
  const UsTextScaler(this.inner);

  static const headingFrom = 18.0;
  static const headingGrowth = 1.15;
  static const headingFloor = 32.0;

  final TextScaler inner;

  static TextScaler wrap(TextScaler inner) => inner is UsTextScaler ? inner : UsTextScaler(inner);

  @override
  double scale(double fontSize) {
    final full = inner.scale(fontSize);
    if (fontSize < headingFrom) return full;
    final grown = fontSize * headingGrowth;
    final limit = grown > headingFloor ? grown : headingFloor;
    if (full <= limit) return full;
    return limit < fontSize ? fontSize : limit;
  }

  @override
  double get textScaleFactor => inner.scale(14) / 14;

  @override
  TextScaler clamp({double minScaleFactor = 0, double maxScaleFactor = double.infinity}) => UsTextScaler(inner.clamp(minScaleFactor: minScaleFactor, maxScaleFactor: maxScaleFactor));

  @override
  bool operator ==(Object other) => other is UsTextScaler && other.inner == inner;

  @override
  int get hashCode => Object.hash(UsTextScaler, inner);
}

String wholeWords(String text) => text.replaceAll('-', '\u2011');
