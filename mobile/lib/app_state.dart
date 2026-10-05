import 'package:flutter/widgets.dart';

import 'api/models.dart';
import 'api/myca_api.dart';
import 'app_services.dart';
import 'cloud/cloud_session.dart';
import 'lock/app_lock.dart';

class AppState extends ChangeNotifier {
  AppState({
    MycaApi? api,
    this.cloud,
    required this.store,
    required this.pickTextFile,
    this.lock = const NoAppLock(),
    this.now = DateTime.now,
  }) : api = api ?? cloud!.api;

  final MycaApi api;
  final CloudSession? cloud;
  final OnboardingStore store;
  final PickTextFile pickTextFile;
  final AppLock lock;
  final DateTime Function() now;

  Snapshot? snapshot;
  String error = '';
  bool loading = true;
  bool welcomed = false;
  bool migrated = false;
  bool lockAvailable = false;
  bool lockEnabled = false;
  bool locked = false;
  DateTime? _leftAt;

  bool get _guards => cloud != null && cloud!.signedIn && lockAvailable && lockEnabled;

  Future<void> start() async {
    welcomed = await store.welcomed();
    migrated = await store.migrated();
    await cloud?.restore();
    lockAvailable = cloud != null && await lock.available();
    lockEnabled = lockAvailable && await store.lockEnabled();
    locked = _guards;
    await refresh();
  }

  Future<void> refresh() async {
    final hosted = cloud;
    if (hosted != null && !hosted.ready) {
      snapshot = null;
      loading = false;
      error = '';
      notifyListeners();
      return;
    }
    if (locked) {
      loading = false;
      notifyListeners();
      return;
    }
    loading = true;
    error = '';
    notifyListeners();
    try {
      snapshot = await api.snapshot();
    } on SignedOutException {
      snapshot = null;
    } on MycaApiException catch (err) {
      error = err.message;
    }
    loading = false;
    notifyListeners();
  }

  Future<bool> unlock() async {
    if (!locked) return true;
    if (!await lock.unlock('Unlock MyCA')) return false;
    locked = false;
    _leftAt = null;
    await refresh();
    return true;
  }

  void leftApp() => _leftAt = now();

  void returnedToApp() {
    final left = _leftAt;
    _leftAt = null;
    if (left == null || locked || !_guards) return;
    if (now().difference(left) < lockAfter) return;
    locked = true;
    notifyListeners();
  }

  Future<bool> setLockEnabled(bool enabled) async {
    if (!lockAvailable || enabled == lockEnabled) return false;
    if (!await lock.unlock(enabled ? 'Turn on app lock' : 'Turn off app lock')) return false;
    lockEnabled = enabled;
    await store.setLockEnabled(enabled);
    notifyListeners();
    return true;
  }

  Future<void> finishWelcome() async {
    await store.markWelcomed();
    welcomed = true;
    notifyListeners();
  }

  Future<void> finishMigration() async {
    await store.markMigrated();
    migrated = true;
    await refresh();
  }

  Future<void> signOut() async {
    try {
      await api.signOut();
    } on MycaApiException catch (err) {
      error = err.message;
    }
    if (cloud != null) snapshot = null;
    locked = false;
    await refresh();
  }
}

class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child}) : super(notifier: state);

  static AppState of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<AppScope>()!.notifier!;
}
