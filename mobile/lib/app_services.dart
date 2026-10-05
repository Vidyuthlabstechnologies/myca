import 'dart:convert';

import 'package:file_picker/file_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

abstract class OnboardingStore {
  Future<bool> welcomed();
  Future<void> markWelcomed();
  Future<bool> migrated();
  Future<void> markMigrated();
}

class DeviceOnboardingStore implements OnboardingStore {
  static const _welcomed = 'onboarding.welcomed';
  static const _migrated = 'onboarding.migrated';

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
