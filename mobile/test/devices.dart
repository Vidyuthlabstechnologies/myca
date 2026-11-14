import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

class Device {
  const Device(this.name, this.width, this.height, this.ratio);

  final String name;
  final double width;
  final double height;
  final double ratio;

  Size get logical => Size(width, height);
}

const smallPhone = Device('small phone 360x640', 360, 640, 2);
const compactPhone = Device('compact phone 320x640', 320, 640, 2);
const mediumPhone = Device('medium phone 393x851', 393, 851, 2.75);
const largePhone = Device('large phone 430x932', 430, 932, 3);
const foldCover = Device('fold cover 344x882', 344, 882, 2.6);
const foldOpen = Device('fold open 673x841', 673, 841, 2.6);
const tablet = Device('tablet 800x1280', 800, 1280, 2);
const tabletLandscape = Device('tablet landscape 1280x800', 1280, 800, 2);
const phoneLandscape = Device('phone landscape 851x393', 851, 393, 2.75);

const devices = [
  compactPhone,
  smallPhone,
  mediumPhone,
  largePhone,
  foldCover,
  foldOpen,
  tablet,
  tabletLandscape,
  phoneLandscape,
];

void useDevice(WidgetTester tester, Device device, {double textScale = 1.0, Brightness brightness = Brightness.light}) {
  tester.view.physicalSize = device.logical * device.ratio;
  tester.view.devicePixelRatio = device.ratio;
  tester.platformDispatcher.textScaleFactorTestValue = textScale;
  tester.platformDispatcher.platformBrightnessTestValue = brightness;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
}
