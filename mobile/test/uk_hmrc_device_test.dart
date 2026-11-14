import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/uk/hmrc_device.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('device ids are random version 4 UUIDs', () {
    final one = uuidV4(Random(1));
    final two = uuidV4(Random(2));
    expect(isUuidV4(one), isTrue, reason: one);
    expect(isUuidV4(two), isTrue, reason: two);
    expect(one, isNot(two));
    expect(isUuidV4(uuidV4()), isTrue);
    expect(isUuidV4('null'), isFalse);
    expect(isUuidV4('3f2b8c1a-1d2e-1f5a-9b6c-7d8e9f0a1b2c'), isFalse);
  });

  test('the device id is made once per install and kept', () async {
    SharedPreferences.setMockInitialValues({});
    final first = await hmrcDeviceId();
    final again = await hmrcDeviceId();
    expect(isUuidV4(first), isTrue);
    expect(again, first);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(hmrcDeviceIdKey), first);
    await prefs.setString(hmrcDeviceIdKey, 'not-a-uuid');
    final replaced = await hmrcDeviceId();
    expect(isUuidV4(replaced), isTrue);
    expect(replaced, isNot('not-a-uuid'));
  });

  test('the time zone is written as UTC plus or minus hours and minutes', () {
    expect(utcOffsetLabel(Duration.zero), 'UTC+00:00');
    expect(utcOffsetLabel(const Duration(hours: 1)), 'UTC+01:00');
    expect(utcOffsetLabel(const Duration(hours: 5, minutes: 30)), 'UTC+05:30');
    expect(utcOffsetLabel(const Duration(hours: -3, minutes: -30)), 'UTC-03:30');
    expect(utcOffsetLabel(const Duration(hours: -10)), 'UTC-10:00');
  });

  test('timestamps carry milliseconds in UTC', () {
    expect(isoWithMillis(DateTime.utc(2026, 11, 14, 10, 0, 0, 7)), '2026-11-14T10:00:00.007Z');
    expect(isoWithMillis(DateTime.utc(2026, 1, 2, 3, 4, 5)), '2026-01-02T03:04:05.000Z');
  });

  test('the device map has every field HMRC asks for, and leaves out what is not known', () {
    final map = HmrcDeviceFacts(
      deviceId: '3f2b8c1a-1d2e-4f5a-9b6c-7d8e9f0a1b2c',
      offset: const Duration(hours: 1),
      screen: screenOf(const Size(1080, 2400), 2.75),
      windowWidth: 393,
      windowHeight: 873,
      localIps: const ['10.0.0.12', 'fe80::1'],
      localIpsAt: DateTime.utc(2026, 11, 14, 10),
      osFamily: osFamilyName('android'),
      osVersion: '15',
      manufacturer: 'Google',
      model: 'Pixel 8',
      appVersion: '1.0.0+1',
    ).toJson();
    expect(map, {
      'deviceId': '3f2b8c1a-1d2e-4f5a-9b6c-7d8e9f0a1b2c',
      'timezone': 'UTC+01:00',
      'screens': [
        {'width': 1080, 'height': 2400, 'scalingFactor': 2.75, 'colourDepth': 24},
      ],
      'windowWidth': 393,
      'windowHeight': 873,
      'osFamily': 'Android',
      'osVersion': '15',
      'manufacturer': 'Google',
      'model': 'Pixel 8',
      'localIps': ['10.0.0.12', 'fe80::1'],
      'localIpsTimestamp': '2026-11-14T10:00:00.000Z',
      'appVersion': '1.0.0+1',
    });
    final bare = HmrcDeviceFacts(
      deviceId: 'x',
      offset: Duration.zero,
      screen: screenOf(const Size(800, 1280), 1),
      windowWidth: 800,
      windowHeight: 1280,
      localIps: const [],
      localIpsAt: DateTime.utc(2026),
      osFamily: 'Android',
      manufacturer: '  ',
    ).toJson();
    expect(bare.containsKey('manufacturer'), isFalse);
    expect(bare.containsKey('model'), isFalse);
    expect(bare.containsKey('osVersion'), isFalse);
    expect(bare.containsKey('appVersion'), isFalse);
    expect(bare.values.any((v) => v == null || '$v' == 'null'), isFalse);
  });

  test('operating systems get HMRC family names', () {
    expect(osFamilyName('android'), 'Android');
    expect(osFamilyName('ios'), 'iOS');
    expect(osFamilyName('windows'), 'Windows');
  });

  testWidgets('reading the device uses the real screen, window, clock, addresses and stored id', (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);
    late BuildContext captured;
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) {
      captured = context;
      return const SizedBox();
    })));
    final map = (await tester.runAsync(() => readHmrcDevice(captured)))!;
    expect(isUuidV4('${map['deviceId']}'), isTrue);
    expect('${map['timezone']}', matches(RegExp(r'^UTC[+-]\d{2}:\d{2}$')));
    expect(map['timezone'], utcOffsetLabel(DateTime.now().timeZoneOffset));
    expect(map['screens'], [
      {'width': 1080, 'height': 2340, 'scalingFactor': 2.75, 'colourDepth': 24},
    ]);
    expect(map['windowWidth'], 393);
    expect(map['windowHeight'], 851);
    expect(map['localIps'], isA<List<String>>());
    expect((map['localIps'] as List).every((ip) => '$ip'.isNotEmpty && !'$ip'.contains('%') && '$ip' != '127.0.0.1'), isTrue);
    expect('${map['localIpsTimestamp']}', matches(RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$')));
    expect(map['osFamily'], isNotEmpty);
    expect(map['appVersion'], isNotEmpty);
    final again = (await tester.runAsync(() => readHmrcDevice(captured)))!;
    expect(again['deviceId'], map['deviceId']);
  });
}
