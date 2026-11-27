import 'dart:io';

class IndiaKeys {
  IndiaKeys(this.used, this.shared, this.badCalls);

  final Set<String> used;
  final Set<String> shared;
  final List<String> badCalls;
}

String _unescape(String text) => text.replaceAll(r"\'", "'").replaceAll(r'\n', '\n').replaceAll(r'\\', r'\');

final _plain = r"'((?:[^'\\]|\\.)*)'";

IndiaKeys indiaKeys([String root = 'lib']) {
  final used = <String>{};
  final bad = <String>[];
  final text = RegExp('inText\\(\\s*\\w+,\\s*$_plain\\s*\\)');
  final format = RegExp('inFormat\\(\\s*\\w+,\\s*$_plain\\s*,');
  final count = RegExp('inCount\\(\\s*\\w+,\\s*[^,]+,\\s*$_plain\\s*,\\s*$_plain\\s*[,)]');
  final line = RegExp('inLine\\(\\s*[\\w.]+,\\s*$_plain\\s*\\)');
  final dynamic = RegExp('inDynamic\\(\\s*[\\w.]+,\\s*$_plain\\s*\\)');
  final offline = RegExp('(?<![\\w.])off\\(\\s*$_plain\\s*[,)]');
  for (final entity in Directory(root).listSync(recursive: true)) {
    if (entity is! File || !entity.path.endsWith('.dart') || entity.path.contains('/india/lang/')) continue;
    final source = entity.readAsLinesSync().where((line) => !line.trimLeft().startsWith('//')).join('\n');
    final definitions = entity.path.endsWith('india_strings.dart');
    void collect(String name, RegExp call, int groups) {
      final all = RegExp('\\b$name\\(').allMatches(source).length;
      final found = call.allMatches(source).toList();
      for (final hit in found) {
        for (var group = 1; group <= groups; group++) {
          used.add(_unescape(hit.group(group)!));
        }
      }
      if (!definitions && all != found.length) bad.add('${entity.path}: give $name plain single-quoted text ($all calls, ${found.length} readable)');
    }

    for (final hit in dynamic.allMatches(source)) {
      used.add(_unescape(hit.group(1)!));
    }
    for (final hit in offline.allMatches(source)) {
      used.add(_unescape(hit.group(1)!));
    }
    collect('inText', text, 1);
    collect('inFormat', format, 1);
    collect('inCount', count, 2);
    if (!definitions && !entity.path.contains('/uae/uae_')) collect('inLine', line, 1);
  }
  used.addAll(_serverLines('$root/cloud/cloud_session.dart'));
  final sharedSource = ['$root/uae/uae_strings.dart', '$root/uae/uae_cloud_strings.dart'].map((path) => File(path).readAsLinesSync().where((line) => !line.trimLeft().startsWith('//')).join('\n')).join('\n');
  final shared = RegExp('\\b_[tf]?\\(\\s*$_plain').allMatches(sharedSource).map((hit) => _unescape(hit.group(1)!)).toSet();
  return IndiaKeys(used, shared, bad);
}

// The codes whose server message only ever shows in a US, UK or Apple sign-in flow, never in the
// India app, so they need no Hindi or Marathi.
const _notShownInIndia = {
  'HOUSEHOLD_US_ONLY', 'UNKNOWN_KIND', 'INVALID_EIN', 'US_RETURN_UNPAID', 'US_EFILE_NOT_OPEN', 'PURCHASE_ALREADY_USED',
  'CARD_CHECKOUT_NOT_CONFIGURED', 'UNKNOWN_CHECKOUT', 'ALREADY_SUBSCRIBED', 'NOT_SUBSCRIBED', 'ALREADY_PAID',
  'NOT_A_PERSONAL_RETURN', 'APPLE_SIGN_IN_UNAVAILABLE', 'INVALID_APPLE_TOKEN', 'APPLE_WRONG_AUDIENCE',
  'APPLE_TOKEN_EXPIRED', 'APPLE_UNREACHABLE', 'APPLE_NONCE_MISMATCH',
};

String _joined(String literals) => RegExp(_plain).allMatches(literals).map((hit) => _unescape(hit.group(1)!)).join();

Set<String> _serverLines(String path) {
  final source = File(path).readAsStringSync();
  final out = <String>{};
  final start = source.indexOf('const _messages = {');
  final end = source.indexOf('String waitMessage');
  final table = source.substring(start, end);
  for (final hit in RegExp("'([A-Z0-9_]+)':\\s*((?:$_plain\\s*)+),").allMatches(table)) {
    if (!_notShownInIndia.contains(hit.group(1))) out.add(_joined(hit.group(2)!));
  }
  for (final name in ['_secondStepOver', '_changeLocked']) {
    final hit = RegExp('const $name = ($_plain);').firstMatch(source);
    if (hit != null) out.add(_joined(hit.group(1)!));
  }
  final used = RegExp("'CODE_USED': ($_plain),").allMatches(source.substring(source.indexOf('const _secondStepMessages')));
  if (used.isNotEmpty) out.add(_joined(used.first.group(1)!));
  return out;
}

Set<String> placeholders(String line) => RegExp(r'\{(\w+)\}').allMatches(line).map((hit) => hit.group(1)!).toSet();
