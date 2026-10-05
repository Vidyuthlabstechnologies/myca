import 'dart:convert';

import 'package:file_picker/file_picker.dart';
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
  Future<bool> lockEnabled() async => (await SharedPreferences.getInstance()).getBool(_lock) ?? true;

  @override
  Future<void> setLockEnabled(bool enabled) async => (await SharedPreferences.getInstance()).setBool(_lock, enabled);
}

class PickedText {
  const PickedText({required this.name, required this.content});

  final String name;
  final String content;
}

typedef PickTextFile = Future<PickedText?> Function(List<String> extensions);

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
