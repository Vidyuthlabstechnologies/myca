import 'package:flutter/widgets.dart';

import 'api/models.dart';
import 'api/myca_api.dart';
import 'app_services.dart';
import 'cloud/cloud_session.dart';

class AppState extends ChangeNotifier {
  AppState({
    MycaApi? api,
    this.cloud,
    required this.store,
    required this.pickTextFile,
    this.now = DateTime.now,
  }) : api = api ?? cloud!.api;

  final MycaApi api;
  final CloudSession? cloud;
  final OnboardingStore store;
  final PickTextFile pickTextFile;
  final DateTime Function() now;

  Snapshot? snapshot;
  String error = '';
  bool loading = true;
  bool welcomed = false;
  bool migrated = false;

  Future<void> start() async {
    welcomed = await store.welcomed();
    migrated = await store.migrated();
    await cloud?.restore();
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
    await refresh();
  }
}

class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child}) : super(notifier: state);

  static AppState of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<AppScope>()!.notifier!;
}
