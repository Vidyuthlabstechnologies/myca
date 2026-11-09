import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

const appVersion = String.fromEnvironment(
  'MYCA_APP_VERSION',
  defaultValue: '1.0.0+1',
);

const crashQueueLimit = 20;
const crashBatchSize = 10;
const _maxMessage = 300;
const _maxFrames = 40;
const _maxFrame = 300;

final _scrubs = <(RegExp, String)>[
  (
    RegExp(r'''(https?://[^\s?#"']+)[?#][^\s"')]*''', caseSensitive: false),
    r'$1',
  ),
  (RegExp(r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+'), '[EMAIL]'),
  (RegExp(r'\beyJ[\w-]+\.[\w-]+\.[\w-]+'), '[TOKEN]'),
  (
    RegExp(
      r'\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b',
      caseSensitive: false,
    ),
    '[GSTIN]',
  ),
  (RegExp(r'\b[A-Z]{5}\d{4}[A-Z]\b', caseSensitive: false), '[PAN]'),
  (
    RegExp(
      r'\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b',
      caseSensitive: false,
    ),
    '[ID]',
  ),
  (RegExp(r'\b[A-Za-z0-9_-]{32,}\b'), '[TOKEN]'),
  (RegExp(r'"[^"\n]{0,200}"'), '"[TEXT]"'),
  (RegExp(r"'[^'\n]{0,200}'"), "'[TEXT]'"),
  (RegExp(r'(?:\+?91[\s-]?)?(?<![\w:.])[6-9]\d{9}\b'), '[PHONE]'),
  (
    RegExp(r'(?:₹|\brs\.?|\binr)\s*\d[\d,]*(?:\.\d+)?', caseSensitive: false),
    '[AMOUNT]',
  ),
  (RegExp(r'(?<![\w:.])\d[\d,]{3,}(?:\.\d+)?'), '[NUMBER]'),
];

String scrubCrashText(String text) {
  var out = text;
  for (final (pattern, replacement) in _scrubs) {
    out = out.replaceAllMapped(
      pattern,
      (match) => replacement == r'$1' ? match.group(1)! : replacement,
    );
  }
  return out;
}

String _clip(String text, int max) =>
    text.length > max ? '${text.substring(0, max - 1)}…' : text;

String _typeOf(Object error) {
  final name = error.runtimeType.toString().replaceAll(
    RegExp(r'[^\w<>.,$ ]'),
    '',
  );
  return name.isEmpty ? 'Error' : _clip(name, 100);
}

Map<String, Object?> crashReportOf(
  Object error,
  StackTrace? stack, {
  String kind = 'flutter',
  String version = appVersion,
}) {
  final frames = (stack?.toString() ?? '')
      .split('\n')
      .where((line) => line.trim().isNotEmpty)
      .take(_maxFrames)
      .map((line) => _clip(scrubCrashText(line.trimRight()), _maxFrame))
      .join('\n');
  return {
    'kind': kind,
    'type': _typeOf(error),
    'message': _clip(
      scrubCrashText(error.toString()).replaceAll(RegExp(r'\s+'), ' ').trim(),
      _maxMessage,
    ),
    'stack': frames,
    'appVersion': version,
    'count': 1,
  };
}

abstract class CrashStore {
  Future<bool> enabled();
  Future<void> setEnabled(bool enabled);
  Future<List<Map<String, Object?>>> load();
  Future<void> save(List<Map<String, Object?>> reports);
}

class DeviceCrashStore implements CrashStore {
  static const _enabled = 'crash.enabled';
  static const _queue = 'crash.queue';

  @override
  Future<bool> enabled() async =>
      (await SharedPreferences.getInstance()).getBool(_enabled) ?? false;

  @override
  Future<void> setEnabled(bool enabled) async =>
      (await SharedPreferences.getInstance()).setBool(_enabled, enabled);

  @override
  Future<List<Map<String, Object?>>> load() async {
    final raw = (await SharedPreferences.getInstance()).getString(_queue);
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw);
      return list is List
          ? [
              for (final item in list)
                if (item is Map) Map<String, Object?>.from(item),
            ]
          : [];
    } on FormatException {
      return [];
    }
  }

  @override
  Future<void> save(List<Map<String, Object?>> reports) async {
    final prefs = await SharedPreferences.getInstance();
    if (reports.isEmpty) {
      await prefs.remove(_queue);
    } else {
      await prefs.setString(_queue, jsonEncode(reports));
    }
  }
}

class MemoryCrashStore implements CrashStore {
  MemoryCrashStore({this.on = true});

  bool on;
  List<Map<String, Object?>> queue = [];

  @override
  Future<bool> enabled() async => on;

  @override
  Future<void> setEnabled(bool enabled) async => on = enabled;

  @override
  Future<List<Map<String, Object?>>> load() async => [
    for (final report in queue) Map<String, Object?>.from(report),
  ];

  @override
  Future<void> save(List<Map<String, Object?>> reports) async =>
      queue = reports;
}

typedef SendCrashReports =
    Future<void> Function(List<Map<String, Object?>> reports);

class CrashReporter {
  CrashReporter({required this.store, this.version = appVersion});

  final CrashStore store;
  final String version;
  Future<void> _last = Future.value();

  Future<void> _serial(Future<void> Function() task) {
    final next = _last.then((_) => task()).catchError((Object _) {});
    _last = next;
    return next;
  }

  Future<void> capture(
    Object error,
    StackTrace? stack, {
    String kind = 'flutter',
  }) => _serial(() async {
    if (!await store.enabled()) return;
    final report = crashReportOf(error, stack, kind: kind, version: version);
    final queue = await store.load();
    final same = queue.indexWhere(
      (item) =>
          item['type'] == report['type'] &&
          item['stack'] == report['stack'] &&
          item['kind'] == report['kind'],
    );
    if (same >= 0) {
      final count = queue[same]['count'];
      queue[same]['count'] = (count is int ? count : 1) + 1;
      queue[same]['message'] = report['message'];
    } else {
      queue.add(report);
    }
    while (queue.length > crashQueueLimit) {
      queue.removeAt(0);
    }
    await store.save(queue);
  });

  Future<void> flush(SendCrashReports send) => _serial(() async {
    if (!await store.enabled()) return;
    var queue = await store.load();
    while (queue.isNotEmpty) {
      final batch = queue.take(crashBatchSize).toList();
      try {
        await send(batch);
      } on Object {
        return;
      }
      queue = queue.skip(batch.length).toList();
      await store.save(queue);
    }
  });

  Future<void> setEnabled(bool enabled) => _serial(() async {
    await store.setEnabled(enabled);
    if (!enabled) await store.save([]);
  });

  Future<bool> enabled() => store.enabled();

  Future<void> get idle => _serial(() async {});
}
