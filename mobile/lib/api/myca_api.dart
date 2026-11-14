import 'models.dart';

class MycaApiException implements Exception {
  const MycaApiException(this.message, {this.code = ''});

  final String message;
  final String code;

  @override
  String toString() => message;
}

abstract class MycaApi {
  Future<Snapshot> snapshot();
  Future<SignInResult> signIn(String userId, String pin);
  Future<void> signOut();
  Future<ChatReply> chat(String message);
  Future<ChatReply> propose(String name, Map<String, Object?> args);
  Future<ChatReply> confirm(String token);
  Future<ChatReply> discard();
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]);
  Future<String> upload(String name, String content);
  Future<ToolOutcome> updateCompany({required String name, String gstin = ''});
}

const maxUploadBytes = 8 * 1024 * 1024;

String uploadedHash(Object? body) {
  if (body is Map && body['ok'] != false && body['sha256'] is String) {
    return body['sha256'] as String;
  }
  final code = body is Map
      ? '${body['error'] ?? 'UPLOAD_FAILED'}'
      : 'UPLOAD_FAILED';
  throw MycaApiException(
    code == 'EMPTY_FILE'
        ? 'That file is empty.'
        : 'The file could not be uploaded ($code).',
  );
}

void checkUploadSize(String content) {
  if (content.length > maxUploadBytes) {
    throw const MycaApiException(
      'That file is larger than 8 MB. Export a shorter period and try again.',
    );
  }
}

Future<Today> loadToday(MycaApi api, {String? period, String? gstin}) async {
  final results = await Future.wait([
    api.query('gst_period_summary', {'period': ?period, if (gstin != null && gstin.isNotEmpty) 'gstin': gstin}),
    api.query('deadlines'),
    api.query('exceptions'),
    api.query('business_summary', {'period': ?period}),
    api.query('list_reminders'),
  ]);
  return Today(
    gst: periodGstFrom(results[0]),
    deadlines: deadlinesFrom(results[1]),
    exceptions: exceptionsFrom(results[2]),
    summary: businessSummaryFrom(results[3]),
    reminders: remindersFrom(results[4]),
  );
}
