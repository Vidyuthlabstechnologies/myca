import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/cloud/plaid_link.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('in.myca.myca/plaid_link');

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  test('a public token passes through to the opener', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      expect(call.method, 'openLink');
      expect((call.arguments as Map)['token'], 'link-tok');
      return 'public-tok';
    });
    expect(await const ChannelPlaidLink().open('link-tok'), 'public-tok');
  });

  test('a closed Link without a token resolves to null', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async => null);
    expect(await const ChannelPlaidLink().open('link-tok'), isNull);
  });

  test('a build without the native bridge raises PlaidUnavailable', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      throw PlatformException(code: 'UNAVAILABLE');
    });
    expect(
      const ChannelPlaidLink().open('link-tok'),
      throwsA(isA<PlaidUnavailable>()),
    );
  });

  test('other native failures are not mistaken for a missing build', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      throw PlatformException(code: 'CREATE_FAILED');
    });
    expect(
      const ChannelPlaidLink().open('link-tok'),
      throwsA(isA<PlatformException>()),
    );
  });
}
