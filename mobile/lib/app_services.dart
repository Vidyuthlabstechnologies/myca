import 'dart:convert';
import 'dart:math';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/services.dart';
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

abstract class OnboardingStore {
  Future<bool> welcomed();
  Future<void> markWelcomed();
  Future<bool> migrated();
  Future<void> markMigrated();
  Future<bool> lockEnabled();
  Future<void> setLockEnabled(bool enabled);
  Future<String> region();
  Future<void> setRegion(String region);
}

class DeviceOnboardingStore implements OnboardingStore {
  static const _welcomed = 'onboarding.welcomed';
  static const _migrated = 'onboarding.migrated';
  static const _lock = 'lock.enabled';
  static const _region = 'onboarding.region';

  @override
  Future<bool> welcomed() async =>
      (await SharedPreferences.getInstance()).getBool(_welcomed) ?? false;

  @override
  Future<void> markWelcomed() async =>
      (await SharedPreferences.getInstance()).setBool(_welcomed, true);

  @override
  Future<bool> migrated() async =>
      (await SharedPreferences.getInstance()).getBool(_migrated) ?? false;

  @override
  Future<void> markMigrated() async =>
      (await SharedPreferences.getInstance()).setBool(_migrated, true);

  @override
  Future<bool> lockEnabled() async =>
      (await SharedPreferences.getInstance()).getBool(_lock) ?? true;

  @override
  Future<void> setLockEnabled(bool enabled) async =>
      (await SharedPreferences.getInstance()).setBool(_lock, enabled);

  @override
  Future<String> region() async =>
      (await SharedPreferences.getInstance()).getString(_region) ?? '';

  @override
  Future<void> setRegion(String region) async =>
      (await SharedPreferences.getInstance()).setString(_region, region);
}

class PickedText {
  const PickedText({required this.name, required this.content});

  final String name;
  final String content;
}

typedef PickTextFile = Future<PickedText?> Function(List<String> extensions);

class PickedFile {
  const PickedFile({required this.name, required this.mime, required this.bytes});

  final String name;
  final String mime;
  final Uint8List bytes;
}

typedef PickAnyFile = Future<PickedFile?> Function();

const _mimeByExtension = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp', 'pdf': 'application/pdf', 'txt': 'text/plain', 'csv': 'text/csv'};

String mimeOfName(String name) => _mimeByExtension[name.split('.').last.toLowerCase()] ?? 'application/octet-stream';

String dataUrlOf(PickedFile file) {
  if (file.mime.startsWith('text/')) return utf8.decode(file.bytes, allowMalformed: true);
  return 'data:${file.mime};base64,${base64Encode(file.bytes)}';
}

Future<PickedFile?> pickAnyFileFromDevice() async {
  final files = await FilePicker.pickFiles(type: FileType.custom, allowedExtensions: _mimeByExtension.keys.toList());
  if (files.isEmpty) return null;
  final first = files.first;
  return PickedFile(name: first.name, mime: mimeOfName(first.name), bytes: await first.readAsBytes());
}

typedef SaveTextFile = Future<bool> Function(String name, String content);

typedef ShareText = Future<bool> Function(String text);

Future<bool> shareTextFromDevice(String text) async {
  final result = await SharePlus.instance.share(ShareParams(text: text));
  return result.status != ShareResultStatus.unavailable;
}

Future<bool> saveTextFileOnDevice(String name, String content) async {
  final saved = await FilePicker.saveFile(
    fileName: name,
    bytes: Uint8List.fromList(utf8.encode(content)),
    mimeType: name.endsWith('.csv') ? 'text/csv' : name.endsWith('.html') ? 'text/html' : 'application/json',
  );
  return saved != null;
}

typedef SaveBytesFile = Future<bool> Function(String name, Uint8List bytes, String mime);

Future<bool> saveBytesFileOnDevice(String name, Uint8List bytes, String mime) async {
  final saved = await FilePicker.saveFile(fileName: name, bytes: bytes, mimeType: mime);
  return saved != null;
}

Future<PickedText?> pickTextFileFromDevice(List<String> extensions) async {
  final files = await FilePicker.pickFiles(
    type: FileType.custom,
    allowedExtensions: extensions,
  );
  if (files.isEmpty) return null;
  final bytes = await files.first.readAsBytes();
  return PickedText(
    name: files.first.name,
    content: utf8.decode(bytes, allowMalformed: true),
  );
}

typedef SendPdf = Future<bool> Function(String name, Uint8List bytes);

typedef LoadAsset = Future<ByteData> Function(String key);

Future<bool> _noPdf(String name, Uint8List bytes) async => false;

class PdfActions {
  const PdfActions({
    this.share = _noPdf,
    this.print = _noPdf,
    this.loadAsset = _loadBundled,
  });

  final SendPdf share;
  final SendPdf print;
  final LoadAsset loadAsset;
}

Future<ByteData> _loadBundled(String key) => rootBundle.load(key);

Future<bool> sharePdfFromDevice(String name, Uint8List bytes) =>
    Printing.sharePdf(bytes: bytes, filename: name);

Future<bool> printPdfFromDevice(String name, Uint8List bytes) =>
    Printing.layoutPdf(name: name, onLayout: (_) async => bytes);

String _randomHex40() {
  final random = Random.secure();
  return List.generate(20, (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
}

Future<String> deviceInstallationId() async {
  const key = 'device.installationId';
  final prefs = await SharedPreferences.getInstance();
  final saved = prefs.getString(key) ?? '';
  if (RegExp(r'^[0-9a-f]{40}$').hasMatch(saved)) return saved;
  final made = _randomHex40();
  await prefs.setString(key, made);
  return made;
}

final String _sessionInstallationId = _randomHex40();

Future<String> sessionInstallationId() async => _sessionInstallationId;
