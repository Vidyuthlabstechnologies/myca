import 'dart:async';
import 'dart:typed_data';
import 'format.dart';

import 'package:flutter/widgets.dart';

import 'api/models.dart';
import 'app_config.dart';
import 'shared_file.dart';
import 'api/myca_api.dart';
import 'app_services.dart';
import 'cloud/cloud_session.dart';
import 'cloud/google_auth.dart';
import 'cloud/oidc_auth.dart';
import 'cloud/plaid_link.dart';
import 'crash_reports.dart';
import 'growth.dart';
import 'lock/app_lock.dart';
import 'notifications.dart';

Future<bool> _cannotSave(String name, String content) async => false;

Future<bool> _cannotSaveBytes(String name, Uint8List bytes, String mime) async => false;

Future<bool> _cannotShare(String text) async => false;

Future<bool> _cannotOpen(Uri url) async => false;

Future<PickedFile?> _cannotPickAny() async => null;

class AppState extends ChangeNotifier {
  AppState({
    MycaApi? api,
    this.cloud,
    required this.store,
    required this.pickTextFile,
    this.pickAnyFile = _cannotPickAny,
    this.takeSharedFile = noSharedFile,
    this.notifications = const NoNotifications(),
    this.saveTextFile = _cannotSave,
    this.saveBytesFile = _cannotSaveBytes,
    this.shareText = _cannotShare,
    this.pdf = const PdfActions(),
    this.lock = const NoAppLock(),
    this.now = DateTime.now,
    this.crashes,
    this.funnel,
    this.google,
    this.oidc,
    this.plaidLink = const NoPlaidLink(),
    this.openLink = _cannotOpen,
    String edition = 'IN',
    this.installationId = sessionInstallationId,
  })  : api = api ?? cloud!.api,
        edition = editionFor(null, defined: edition);

  final String edition;
  final Future<String> Function() installationId;

  final MycaApi api;
  final CloudSession? cloud;
  final OnboardingStore store;
  final PickTextFile pickTextFile;
  final PickAnyFile pickAnyFile;
  final TakeSharedFile takeSharedFile;
  PickedFile? sharedFile;
  String sharedNote = '';
  ServerInfo? server;
  bool _serverAsked = false;

  bool get testServer => server?.isTest ?? false;
  bool get sandboxServer => server?.isSandbox ?? false;
  final NotificationPlanner notifications;
  final SaveTextFile saveTextFile;
  final SaveBytesFile saveBytesFile;
  final ShareText shareText;
  final PdfActions pdf;
  final AppLock lock;
  final DateTime Function() now;
  final CrashReporter? crashes;
  final FunnelTracker? funnel;
  final GoogleAuth? google;
  final OidcAuth? oidc;
  final PlaidLinkOpener plaidLink;
  final Future<bool> Function(Uri url) openLink;

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
  String recoveryNote = '';
  DateTime? _leftAt;

  bool get _guards => cloud != null && cloud!.signedIn && lockAvailable && lockEnabled;

  Future<void> checkSharedFile() async {
    final PickedFile? file;
    try {
      file = await takeSharedFile();
    } on SharedFileTooLarge {
      sharedNote = 'That file is larger than 8 MB, so MyCA could not open it. Share a smaller file or a photo of the page.';
      notifyListeners();
      return;
    }
    if (file == null) return;
    sharedFile = file;
    notifyListeners();
  }

  bool get readyForEntries => snapshot?.activeUser != null && welcomed && migrated && !locked && (cloud == null || cloud!.ready);

  PickedFile? takeSharedFileForEntry() {
    final file = sharedFile;
    sharedFile = null;
    return file;
  }

  bool get household => snapshot?.company.household ?? false;

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
    if (hosted != null && !locked && !_serverAsked) {
      _serverAsked = true;
      server = await hosted.serverInfo();
    }
    if (hosted != null && !hosted.ready) {
      snapshot = null;
      if (!hosted.signedIn) recoveryNote = '';
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
      moneyCountry = snapshot?.company.country ?? 'IN';
      await _skipMigrationForKeptBooks();
      _sendCrashReports();
      _reachFunnel();
    } on SignedOutException {
      snapshot = null;
      recoveryNote = '';
    } on MycaApiException catch (err) {
      error = err.message;
    }
    loading = false;
    notifyListeners();
  }

  Future<void> _skipMigrationForKeptBooks() async {
    final books = snapshot;
    if (cloud == null || migrated || books == null) return;
    if (books.company.household) {
      await store.markMigrated();
      migrated = true;
      return;
    }
    final kept = books.invoices.isNotEmpty || books.purchases.isNotEmpty || books.expenses.isNotEmpty || books.creditNotes.isNotEmpty || books.quotes.isNotEmpty;
    if (!kept) return;
    await store.markMigrated();
    migrated = true;
  }

  void _sendCrashReports() {
    final reporter = crashes;
    final hosted = cloud;
    if (reporter == null || hosted == null || !hosted.signedIn) return;
    unawaited(reporter.flush(hosted.sendCrashReports));
  }

  void _reachFunnel() {
    final books = snapshot;
    if (books == null) return;
    final india = edition == 'IN';
    final kept = books.invoices.isNotEmpty || books.purchases.isNotEmpty || books.expenses.isNotEmpty;
    reachSteps(['signed_in', if (india) 'business_created', if (india && kept) 'first_entry']);
  }

  void reachSteps(List<String> steps) {
    final tracker = funnel;
    final hosted = cloud;
    if (tracker == null || hosted == null || !hosted.ready || hosted.needsConsent) return;
    unawaited(tracker.reach(steps, hosted.sendFunnelSteps));
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

  void noteSecondStep(SecondStepResult result) => recoveryNote = result.recoveryNote;

  void dismissRecoveryNote() {
    if (recoveryNote.isEmpty) return;
    recoveryNote = '';
    notifyListeners();
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
