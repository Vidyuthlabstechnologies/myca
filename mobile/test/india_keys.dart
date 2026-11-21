import 'dart:io';

/// The English lines the India app shows, found in the source.
///
/// [used] are lines given to inText, inFormat or inCount; [shared] are lines of the shared screen wording
/// (lib/uae/uae_strings.dart) that an India table may translate. A call must get its English as one plain
/// single-quoted text so it can be found here.
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

    collect('inText', text, 1);
    collect('inFormat', format, 1);
    collect('inCount', count, 2);
    if (!definitions && !entity.path.contains('/uae/uae_')) collect('inLine', line, 1);
  }
  final sharedSource = ['$root/uae/uae_strings.dart', '$root/uae/uae_cloud_strings.dart'].map((path) => File(path).readAsLinesSync().where((line) => !line.trimLeft().startsWith('//')).join('\n')).join('\n');
  final shared = RegExp('\\b_t?\\(\\s*$_plain').allMatches(sharedSource).map((hit) => _unescape(hit.group(1)!)).toSet();
  return IndiaKeys(used, shared, bad);
}

Set<String> placeholders(String line) => RegExp(r'\{(\w+)\}').allMatches(line).map((hit) => hit.group(1)!).toSet();
