import 'dart:io';
import 'dart:math';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../crash_reports.dart' show appVersion;

const hmrcDeviceChannel = MethodChannel('in.myca/device');

const hmrcDeviceIdKey = 'device.hmrcDeviceId';

final _uuidV4 = RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

bool isUuidV4(String value) => _uuidV4.hasMatch(value);

String uuidV4([Random? random]) {
  final source = random ?? Random.secure();
  final bytes = List<int>.generate(16, (_) => source.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = [for (final b in bytes) b.toRadixString(16).padLeft(2, '0')].join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

Future<String> hmrcDeviceId() async {
  final prefs = await SharedPreferences.getInstance();
  final saved = prefs.getString(hmrcDeviceIdKey) ?? '';
  if (isUuidV4(saved)) return saved;
  final made = uuidV4();
  await prefs.setString(hmrcDeviceIdKey, made);
  return made;
}

String utcOffsetLabel(Duration offset) {
  final minutes = offset.inMinutes;
  final sign = minutes < 0 ? '-' : '+';
  final whole = minutes.abs();
  final hours = (whole ~/ 60).toString().padLeft(2, '0');
  final rest = (whole % 60).toString().padLeft(2, '0');
  return 'UTC$sign$hours:$rest';
}

String isoWithMillis(DateTime at) {
  final utc = at.toUtc();
  String two(int n) => n.toString().padLeft(2, '0');
  final ms = utc.millisecond.toString().padLeft(3, '0');
  return '${utc.year.toString().padLeft(4, '0')}-${two(utc.month)}-${two(utc.day)}T${two(utc.hour)}:${two(utc.minute)}:${two(utc.second)}.${ms}Z';
}

String osFamilyName([String? os]) => switch (os ?? Platform.operatingSystem) {
  'android' => 'Android',
  'ios' => 'iOS',
  'windows' => 'Windows',
  'macos' => 'macOS',
  'linux' => 'Linux',
  final other => other,
};

class HmrcScreen {
  const HmrcScreen({required this.width, required this.height, required this.scalingFactor});

  final int width;
  final int height;
  final double scalingFactor;

  Map<String, Object?> toJson() => {'width': width, 'height': height, 'scalingFactor': scalingFactor, 'colourDepth': 24};
}

class HmrcDeviceFacts {
  const HmrcDeviceFacts({
    required this.deviceId,
    required this.offset,
    required this.screen,
    required this.windowWidth,
    required this.windowHeight,
    required this.localIps,
    required this.localIpsAt,
    required this.osFamily,
    this.osVersion = '',
    this.manufacturer = '',
    this.model = '',
    this.appVersion = '',
  });

  final String deviceId;
  final Duration offset;
  final HmrcScreen screen;
  final int windowWidth;
  final int windowHeight;
  final List<String> localIps;
  final DateTime localIpsAt;
  final String osFamily;
  final String osVersion;
  final String manufacturer;
  final String model;
  final String appVersion;

  Map<String, Object?> toJson() => {
    'deviceId': deviceId,
    'timezone': utcOffsetLabel(offset),
    'screens': [screen.toJson()],
    'windowWidth': windowWidth,
    'windowHeight': windowHeight,
    'osFamily': osFamily,
    if (osVersion.trim().isNotEmpty) 'osVersion': osVersion.trim(),
    if (manufacturer.trim().isNotEmpty) 'manufacturer': manufacturer.trim(),
    if (model.trim().isNotEmpty) 'model': model.trim(),
    'localIps': localIps,
    'localIpsTimestamp': isoWithMillis(localIpsAt),
    if (appVersion.trim().isNotEmpty) 'appVersion': appVersion.trim(),
  };
}

HmrcScreen screenOf(Size physical, double ratio) => HmrcScreen(width: physical.width.round(), height: physical.height.round(), scalingFactor: double.parse(ratio.toStringAsFixed(2)));

Future<List<String>> localIpAddresses() async {
  try {
    final interfaces = await NetworkInterface.list(includeLoopback: false, includeLinkLocal: true);
    return [
      for (final face in interfaces)
        for (final address in face.addresses)
          if (!address.isLoopback) address.address.split('%').first,
    ];
  } on Object {
    return const [];
  }
}

Future<Map<String, String>> nativeDeviceFacts() async {
  if (!Platform.isAndroid) return {'osVersion': Platform.operatingSystemVersion};
  try {
    final facts = await hmrcDeviceChannel.invokeMapMethod<String, Object?>('facts');
    return {for (final entry in (facts ?? const <String, Object?>{}).entries) entry.key: '${entry.value ?? ''}'};
  } on Object {
    return const {};
  }
}

typedef HmrcDeviceReader = Future<Map<String, Object?>> Function(BuildContext context);

HmrcDeviceReader hmrcDeviceReader = readHmrcDevice;

Future<Map<String, Object?>> readHmrcDevice(BuildContext context) async {
  final view = View.of(context);
  final logical = MediaQuery.sizeOf(context);
  final screen = screenOf(view.physicalSize, view.devicePixelRatio);
  final results = await Future.wait<Object>([hmrcDeviceId(), localIpAddresses(), nativeDeviceFacts()]);
  final native = results[2] as Map<String, String>;
  return HmrcDeviceFacts(
    deviceId: results[0] as String,
    offset: DateTime.now().timeZoneOffset,
    screen: screen,
    windowWidth: logical.width.round(),
    windowHeight: logical.height.round(),
    localIps: results[1] as List<String>,
    localIpsAt: DateTime.now(),
    osFamily: osFamilyName(),
    osVersion: native['osVersion'] ?? '',
    manufacturer: native['manufacturer'] ?? '',
    model: native['model'] ?? '',
    appVersion: appVersion,
  ).toJson();
}
