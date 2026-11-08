import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/google_auth.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';
import 'fake_cloud.dart';

class _Google implements GoogleAuth {
  @override
  Future<String?> idToken() async => 'google-id-token';

  @override
  Future<void> signOut() async {}
}

class _BrokenStore implements TokenStore {
  final values = <String, String>{};
  bool broken = true;
  int cleared = 0;

  @override
  Future<String?> read(String key) async {
    if (broken) throw StateError('the key that sealed this value is gone');
    return values[key];
  }

  @override
  Future<void> write(String key, String value) async {
    if (broken) throw StateError('the key that sealed this value is gone');
    values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    if (broken) throw StateError('the key that sealed this value is gone');
    values.remove(key);
  }

  Future<void> clear() async {
    cleared += 1;
    values.clear();
    broken = false;
  }
}

FakeCloud _returningOwner({bool withEntries = true}) {
  final cloud = FakeCloud()
    ..phoneOn = false
    ..userName = 'Asha Rao'
    ..company = {'name': 'Kiran Traders', 'gstin': '', 'state': '29'};
  cloud.businesses.add({'id': FakeCloud.businessId, 'name': 'Kiran Traders', 'gstin': '', 'role': 'owner'});
  if (withEntries) {
    cloud.invoices.add({'id': 'INV-0001', 'date': '2026-10-01', 'partyName': 'Kiran Stores', 'partyGstin': '', 'total': 9440, 'status': 'posted'});
  }
  return cloud;
}

AppState _freshInstall(FakeCloud cloud, MemoryOnboardingStore store, TokenStore tokens) => AppState(
  cloud: CloudSession(baseUrl: 'https://api.example.test', tokens: tokens, client: cloud.client),
  store: store,
  pickTextFile: (_) async => null,
  now: () => DateTime(2026, 11, 8, 10),
  google: _Google(),
);

void main() {
  testWidgets(
    'after a reinstall, signing in with the same Google account opens the books that were kept, without asking where they are',
    (tester) async {
      final cloud = _returningOwner();
      final store = MemoryOnboardingStore(isWelcomed: true);
      await tester.pumpWidget(MycaApp(state: _freshInstall(cloud, store, MemoryTokenStore())));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue with Google'));
      await tester.pumpAndSettle();

      expect(cloud.requests, contains('POST /v1/auth/google'));
      expect(find.text('Tell us about the business'), findsNothing);
      expect(find.text('Where are your books today?'), findsNothing);
      expect(store.isMigrated, isTrue);
    },
  );

  testWidgets(
    'a business with no entries yet still gets the question about where the books are',
    (tester) async {
      final cloud = _returningOwner(withEntries: false);
      final store = MemoryOnboardingStore(isWelcomed: true);
      await tester.pumpWidget(MycaApp(state: _freshInstall(cloud, store, MemoryTokenStore())));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue with Google'));
      await tester.pumpAndSettle();

      expect(find.text('Where are your books today?'), findsOneWidget);
      expect(store.isMigrated, isFalse);
    },
  );

  test('a sign-in restored from a backup that can no longer be read is wiped, so the app starts signed out', () async {
    final broken = _BrokenStore();
    final tokens = RecoveringTokenStore(broken, clear: broken.clear);
    expect(await tokens.read('refresh'), isNull);
    expect(broken.cleared, 1);
    await tokens.write('refresh', 'r1');
    expect(await tokens.read('refresh'), 'r1');
    await tokens.delete('refresh');
    expect(await tokens.read('refresh'), isNull);
  });

  test('a store that stays broken after the wipe still lets a write fail loudly', () async {
    final broken = _BrokenStore();
    final tokens = RecoveringTokenStore(broken, clear: () async => broken.cleared += 1);
    expect(await tokens.read('refresh'), isNull);
    await expectLater(tokens.write('refresh', 'r1'), throwsStateError);
    await tokens.delete('refresh');
    expect(broken.cleared, 3);
  });
}
