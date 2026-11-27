import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/theme.dart';
import 'package:myca/widgets/glass.dart';
import 'package:myca_design/myca_design.dart' show Bahi;

Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  Bahi.live = false;
  setUp(() {
    glassBlurEnabled = false;
    Palette.brightness = Brightness.light;
    final view = TestWidgetsFlutterBinding.ensureInitialized()
        .platformDispatcher
        .views
        .first;
    view.physicalSize = const Size(800, 1800);
    view.devicePixelRatio = 1;
  });
  tearDown(() => Palette.brightness = Brightness.light);
  await testMain();
}
