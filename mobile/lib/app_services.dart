import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/services.dart';
import 'package:printing/printing.dart';
import 'package:shared_preferences/shared_preferences.dart';

abstract class OnboardingStore {
  Future<bool> welcomed();
  Future<void> markWelcomed();
  Future<bool> migrated();
  Future<void> markMigrated();
  Future<bool> lockEnabled();
  Future<void> setLockEnabled(bool enabled);
}

class DeviceOnboardingStore implements OnboardingStore {
  static const _welcomed = 'onboarding.welcomed';
  static const _migrated = 'onboarding.migrated';
  static const _lock = 'lock.enabled';

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
}

class PickedText {
  const PickedText({required this.name, required this.content});

  final String name;
  final String content;
}

typedef PickTextFile = Future<PickedText?> Function(List<String> extensions);

typedef SaveTextFile = Future<bool> Function(String name, String content);

Future<bool> saveTextFileOnDevice(String name, String content) async {
  final saved = await FilePicker.saveFile(
    fileName: name,
    bytes: Uint8List.fromList(utf8.encode(content)),
    mimeType: name.endsWith('.csv') ? 'text/csv' : 'application/json',
  );
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
