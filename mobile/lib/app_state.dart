import 'dart:async';

import 'package:flutter/widgets.dart';

import 'api/models.dart';
import 'api/myca_api.dart';
import 'app_services.dart';
import 'cloud/cloud_session.dart';
import 'cloud/google_auth.dart';
import 'crash_reports.dart';
import 'lock/app_lock.dart';

Future<bool> _cannotSave(String name, String content) async => false;

class AppState extends ChangeNotifier {
  AppState({
    MycaApi? api,
    this.cloud,
    required this.store,
    required this.pickTextFile,
    this.saveTextFile = _cannotSave,
    this.pdf = const PdfActions(),
    this.lock = const NoAppLock(),
    this.now = DateTime.now,
    this.crashes,
    this.google,
  }) : api = api ?? cloud!.api;

  final MycaApi api;
  final CloudSession? cloud;
  final OnboardingStore store;
  final PickTextFile pickTextFile;
  final SaveTextFile saveTextFile;
  final PdfActions pdf;
  final AppLock lock;
  final DateTime Function() now;
  final CrashReporter? crashes;
  final GoogleAuth? google;

  Snapshot? snapshot;
  String error = '';
  bool loading = true;
  bool welcomed = false;
  bool migrated = false;
  bool lockAvailable = false;
  bool lockEnabled = false;
  bool locked = false;
  bool showBooksCheck = false;
  bool crashReportsOn = false;
  DateTime? _leftAt;

  bool get _guards => cloud != null && cloud!.signedIn && lockAvailable && lockEnabled;

  Future<void> start() async {
    welcomed = await store.welcomed();
    migrated = await store.migrated();
    await cloud?.restore();
    lockAvailable = cloud != null && await lock.available();
    lockEnabled = lockAvailable && await store.lockEnabled();
    locked = _guards;
    if (!locked) await cloud?.checkConsent();
    crashReportsOn = await crashes?.enabled() ?? false;
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
      _sendCrashReports();
    } on SignedOutException {
      snapshot = null;
    } on MycaApiException catch (err) {
      error = err.message;
    }
    loading = false;
    notifyListeners();
  }

  void _sendCrashReports() {
    final reporter = crashes;
    final hosted = cloud;
    if (reporter == null || hosted == null || !hosted.signedIn) return;
    unawaited(reporter.flush(hosted.sendCrashReports));
  }

  Future<void> setCrashReports(bool enabled) async {
    final reporter = crashes;
    if (reporter == null || enabled == crashReportsOn) return;
    await reporter.setEnabled(enabled);
    crashReportsOn = enabled;
    notifyListeners();
  }

  Future<bool> unlock() async {
    if (!locked) return true;
    if (!await lock.unlock('Unlock MyCA')) return false;
    locked = false;
    _leftAt = null;
    await cloud?.checkConsent();
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
    showBooksCheck = true;
    await refresh();
  }

  Future<void> signOut() async {
    try {
      await api.signOut();
    } on MycaApiException catch (err) {
      error = err.message;
    }
    await google?.signOut().catchError((Object _) {});
    if (cloud != null) snapshot = null;
    locked = false;
    await refresh();
  }
}

class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child}) : super(notifier: state);

  static AppState of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<AppScope>()!.notifier!;
}
