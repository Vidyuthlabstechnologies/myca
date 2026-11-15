import 'dart:convert';
import 'dart:typed_data';

import 'app_state.dart';
import 'uae/uae_strings.dart';

const xlsxContentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

Future<String> saveXlsx(AppState state, Map<String, Object?> data, [UaeStrings? ae]) async {
  final name = data['fileName'];
  final encoded = data['xlsxBase64'];
  if (name is! String || name.isEmpty || encoded is! String || encoded.isEmpty) return ae?.excelNotPrepared ?? 'The Excel file could not be prepared.';
  final Uint8List bytes;
  try {
    bytes = base64Decode(encoded);
  } on FormatException {
    return ae?.excelNotRead ?? 'The Excel file could not be read.';
  }
  final contentType = data['contentType'];
  final saved = await state.saveBytesFile(name, bytes, contentType is String && contentType.isNotEmpty ? contentType : xlsxContentType);
  if (ae != null) return saved ? ae.excelSaved(name) : ae.notSaved;
  return saved ? 'Saved $name. Open it in Excel or send it to your CA.' : 'Not saved.';
}
