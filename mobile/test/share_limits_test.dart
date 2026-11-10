import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/main.dart';
import 'package:myca/shared_file.dart';

import 'fake_api.dart';

AppState stateWith(FakeMycaApi api, TakeSharedFile take) => AppState(
  api: api,
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => null,
  takeSharedFile: take,
  now: () => DateTime(2026, 10, 5, 22, 30),
);

void main() {
  testWidgets('a file over the share limit shows a plain note and opens nothing', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    var asked = 0;
    await tester.pumpWidget(MycaApp(state: stateWith(api, () async {
      asked++;
      if (asked == 1) throw const SharedFileTooLarge();
      return null;
    })));
    await tester.pumpAndSettle();
    expect(find.textContaining('larger than 8 MB'), findsOneWidget);
    expect(api.readDocuments, isEmpty);
  });

  testWidgets('text shared into the app arrives as a text file and opens Read a bill', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    PickedFile? shared = PickedFile(name: 'shared.txt', mime: 'text/plain', bytes: Uint8List.fromList(utf8.encode('Paid 500 to Ravi for packing')));
    await tester.pumpWidget(MycaApp(state: stateWith(api, () async {
      final file = shared;
      shared = null;
      return file;
    })));
    await tester.pumpAndSettle();
    expect(find.text('Read a bill'), findsWidgets);
  });

  test('the share limit matches the Android side', () {
    expect(sharedFileLimitBytes, 8 * 1024 * 1024);
  });

  test('a rate-limited request says how long to wait in plain words', () {
    expect(waitMessage(30), 'That was a lot of requests in a short time. Try again in 30 seconds.');
    expect(waitMessage(45.2), 'That was a lot of requests in a short time. Try again in 46 seconds.');
    expect(waitMessage(90), 'That was a lot of requests in a short time. Try again in 2 minutes.');
    expect(waitMessage(60), 'That was a lot of requests in a short time. Try again in a minute.');
    expect(waitMessage(null), cloudMessage('RATE_LIMITED'));
  });
}
