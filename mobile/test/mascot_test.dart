import 'dart:io' as io;

import 'package:flutter_test/flutter_test.dart';
import 'package:myca_design/myca_design.dart' show BahiMood;
import 'package:rive/rive.dart';

const designMascot = '../design/flutter/myca_design/assets/mascot';
const riveSetupHint = 'Rive native libraries are not set up: dart run rive_native:setup --platform <yours>';

bool riveNativeLibraryPresent() {
  const roots = ['', '../', '../../packages/rive_native/', 'build/rive_native/'];
  final libraries = switch (io.Platform.operatingSystem) {
    'macos' => ['native/build/macosx/bin/debug_shared/librive_native.dylib'],
    'linux' => ['linux/bin/lib/debug_shared/librive_native.so', 'native/build/linux/bin/lib/debug_shared/librive_native.so'],
    'windows' => ['windows/bin/lib/debug/rive_native.dll', 'native/build/windows/bin/lib/debug/rive_native.dll'],
    _ => const <String>[],
  };
  return libraries.any((library) => roots.any((root) => io.File('$root$library').existsSync()));
}

void main() {
  testWidgets('the Bahi file has every mood and a talking switch', (tester) async {
    if (!riveNativeLibraryPresent()) {
      markTestSkipped(riveSetupHint);
      return;
    }
    await tester.runAsync(() async {
      var ready = false;
      try {
        ready = await RiveNative.init();
      } on Object {
        ready = false;
      }
      if (!ready) {
        markTestSkipped(riveSetupHint);
        return;
      }
      final file = await File.decode(io.File('$designMascot/bahi.riv').readAsBytesSync(), riveFactory: Factory.flutter);
      final controller = RiveWidgetController(file!);
      final data = controller.dataBind(DataBind.auto());
      expect(controller.artboard.name, 'Bahi');
      expect(data.boolean('talking'), isNotNull);
      for (final mood in BahiMood.values) {
        data.number('mood')!.value = mood.index.toDouble();
        controller.stateMachine.advanceAndApply(0.4);
        expect(data.number('mood')!.value, mood.index);
      }
      data.dispose();
      controller.dispose();
    });
  });

  test('every mood has a still picture', () {
    for (final mood in BahiMood.values) {
      expect(io.File('$designMascot/${mood.name}.png').existsSync(), isTrue, reason: mood.name);
    }
  });
}
