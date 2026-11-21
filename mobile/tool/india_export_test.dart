import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:myca/india/india_strings.dart';
import 'package:myca/india/lang/hi.dart';

void main() {
  test('export India keys', () {
    final out = <String, Object?>{
      'hindi': hindi,
      'missing': {for (final language in indiaLanguages) if (language.code != 'en' && language.code != 'hi') language.code: [for (final key in hindi.keys) if (!language.table.containsKey(key)) key]},
    };
    File('build/india_keys.json')
      ..createSync(recursive: true)
      ..writeAsStringSync(const JsonEncoder.withIndent(' ').convert(out));
  });
}
