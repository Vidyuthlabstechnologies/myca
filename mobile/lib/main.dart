import 'dart:ui';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api/http_myca_api.dart';
import 'app_config.dart';
import 'app_services.dart';
import 'app_state.dart';
import 'brand.dart';
import 'cloud/cloud_session.dart';
import 'cloud/google_auth.dart';
import 'cloud/keystore_token_store.dart';
import 'cloud/oidc_auth.dart';
import 'crash_reports.dart';
import 'lock/app_lock.dart';
import 'notifications.dart';
import 'lock/device_app_lock.dart';
import 'screens/bill_capture_screen.dart';
import 'screens/business_setup_screen.dart';
import 'screens/lock_screen.dart';
import 'screens/name_screen.dart';
import 'screens/phone_sign_in_screen.dart';
import 'screens/privacy_notice_screen.dart';
import 'screens/home_screen.dart';
import 'screens/migration_flow.dart';
import 'screens/sign_in_screen.dart';
import 'screens/welcome_screen.dart';
import 'shared_file.dart';
import 'theme.dart';

void main() {
  LicenseRegistry.addLicense(() async* {
    yield LicenseEntryWithLineBreaks([
      'Inter',
    ], await rootBundle.loadString('assets/fonts/Inter-LICENSE.txt'));
  });
  const config = AppConfig.fromEnvironment;
  final crashes = config.hosted
      ? CrashReporter(store: DeviceCrashStore())
      : null;
  if (crashes != null) {
    final shown = FlutterError.onError;
    FlutterError.onError = (details) {
      shown?.call(details);
      crashes.capture(details.exception, details.stack);
    };
    PlatformDispatcher.instance.onError = (error, stack) {
      crashes.capture(error, stack, kind: 'async');
      return true;
    };
  }
  runApp(
    MycaApp(
      state: AppState(
        api: config.hosted ? null : HttpMycaApi(config),
        cloud: config.hosted
            ? CloudSession(
                baseUrl: config.cloudUrl,
                tokens: const KeystoreTokenStore(),
              )
            : null,
        store: DeviceOnboardingStore(),
        lock: config.hosted ? DeviceAppLock() : const NoAppLock(),
        pickTextFile: pickTextFileFromDevice,
        pickAnyFile: pickAnyFileFromDevice,
        takeSharedFile: takeSharedFileFromDevice,
        notifications: DeviceNotifications(),
        saveTextFile: saveTextFileOnDevice,
        shareText: shareTextFromDevice,
        pdf: const PdfActions(share: sharePdfFromDevice, print: printPdfFromDevice),
        crashes: crashes,
        google: config.hosted && config.googleServerClientId.isNotEmpty
            ? DeviceGoogleAuth(config.googleServerClientId)
            : null,
        oidc: config.hosted && config.oidcClientId.isNotEmpty
            ? OidcAuth(
                clientId: config.oidcClientId,
                open: (url) => launchUrl(url, mode: LaunchMode.externalApplication),
                links: AppLinks().uriLinkStream,
              )
            : null,
      ),
    ),
  );
}

class MycaApp extends StatefulWidget {
  const MycaApp({super.key, required this.state});

  final AppState state;

  @override
  State<MycaApp> createState() => _MycaAppState();
}

class _MycaAppState extends State<MycaApp> with WidgetsBindingObserver {
  final _navigator = GlobalKey<NavigatorState>();
  bool _openingShared = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.state.addListener(_openSharedFile);
    widget.state.start().then((_) => widget.state.checkSharedFile());
  }

  @override
  void dispose() {
    widget.state.removeListener(_openSharedFile);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _openSharedFile() {
    final state = widget.state;
    if (state.sharedFile == null || !state.readyForEntries || _openingShared) return;
    final navigator = _navigator.currentState;
    if (navigator == null) return;
    _openingShared = true;
    final file = state.takeSharedFileForEntry()!;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await navigator.push(MaterialPageRoute<void>(builder: (_) => BillCaptureScreen(initial: file)));
      _openingShared = false;
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState lifecycle) {
    if (lifecycle == AppLifecycleState.paused || lifecycle == AppLifecycleState.hidden) widget.state.leftApp();
    if (lifecycle == AppLifecycleState.resumed) {
      widget.state.returnedToApp();
      widget.state.checkSharedFile();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScope(
      state: widget.state,
      child: MaterialApp(
        navigatorKey: _navigator,
        title: 'MyCA',
        debugShowCheckedModeBanner: false,
        theme: mycaTheme(),
        builder: (context, child) => ListenableBuilder(
          listenable: widget.state,
          builder: (context, _) => Stack(
            children: [
              ?child,
              if (widget.state.locked) const LockScreen(),
            ],
          ),
        ),
        home: const AppGate(),
      ),
    );
  }
}

class AppGate extends StatelessWidget {
  const AppGate({super.key});

  @override
  Widget build(BuildContext context) {
    final state = AppScope.of(context);
    final snapshot = state.snapshot;
    if (state.loading && snapshot == null) {
      return const Scaffold(body: Center(child: BrandMark(size: 72)));
    }
    if (!state.welcomed) return const WelcomeScreen();
    final cloud = state.cloud;
    if (cloud != null && !cloud.signedIn) return const PhoneSignInScreen();
    if (cloud != null && cloud.needsConsent) return const PrivacyNoticeScreen();
    if (cloud != null && cloud.needsName) return const NameScreen();
    if (cloud != null && !cloud.ready) return const BusinessSetupScreen();
    if (snapshot == null) {
      return Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const BrandMark(size: 56),
                const SizedBox(height: 24),
                Text(
                  'MyCA is out of reach',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                Text(state.error, textAlign: TextAlign.center),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: state.refresh,
                  child: const Text('Try again'),
                ),
              ],
            ),
          ),
        ),
      );
    }
    if (snapshot.activeUser == null) return SignInScreen(snapshot: snapshot);
    if (!state.migrated) return MigrationFlow(snapshot: snapshot);
    return HomeScreen(snapshot: snapshot);
  }
}
