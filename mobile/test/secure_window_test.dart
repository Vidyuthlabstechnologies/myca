import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/screens/recovery_codes_screen.dart';
import 'package:myca/secure_window.dart';

void main() {
  late List<Object?> calls;

  setUp(() {
    calls = [];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(secureWindowChannel, (call) async {
      calls.add('${call.method}:${call.arguments}');
      return null;
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(secureWindowChannel, null);
  });

  testWidgets('recovery codes keep the window out of screenshots and the recent apps view while shown', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: RecoveryCodesScreen(['aaaa-bbbb', 'cccc-dddd'])));
    expect(calls, ['set:true']);
    expect(SecureWindow.holds, 1);

    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    expect(calls, ['set:true', 'set:false']);
    expect(SecureWindow.holds, 0);
  });

  testWidgets('a secure screen pushed over another keeps the window secure until both are gone', (tester) async {
    final navigator = GlobalKey<NavigatorState>();
    await tester.pumpWidget(MaterialApp(navigatorKey: navigator, home: const RecoveryCodesScreen(['aaaa-bbbb'])));
    navigator.currentState!.push(MaterialPageRoute<void>(builder: (_) => const RecoveryCodesScreen(['eeee-ffff'])));
    await tester.pumpAndSettle();
    expect(calls, ['set:true']);
    expect(SecureWindow.holds, 2);

    navigator.currentState!.pop();
    await tester.pumpAndSettle();
    expect(calls, ['set:true']);

    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    expect(calls, ['set:true', 'set:false']);
  });

  testWidgets('without the Android channel, as on desktop and iOS, the screen still opens', (tester) async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(secureWindowChannel, null);
    await tester.pumpWidget(const MaterialApp(home: RecoveryCodesScreen(['aaaa-bbbb'])));
    expect(find.text('Recovery codes'), findsOneWidget);
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    expect(SecureWindow.holds, 0);
  });

  test('the sign-in code, two-step setup and recovery code screens all hold the secure window', () {
    for (final name in ['phone_sign_in_screen', 'two_step_setup_screen', 'recovery_codes_screen']) {
      final source = File('lib/screens/$name.dart').readAsStringSync();
      expect(source, contains('with SecureWindowWhileShown'), reason: name);
    }
    final activity = File('android/app/src/main/kotlin/in/myca/myca/MainActivity.kt').readAsStringSync();
    expect(activity, contains('"in.myca/secure"'));
    expect(activity, contains('FLAG_SECURE'));
  });
}
