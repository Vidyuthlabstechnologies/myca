import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/crash_reports.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';
import 'fake_cloud.dart';

const _stack =
    '#0      _InvoiceScreenState.build (package:myca/screens/invoice_screen.dart:212:18)\n'
    '#1      StatelessElement.build (package:flutter/src/widgets/framework.dart:5799:49)';

Future<CloudSession> _ready(FakeCloud cloud) async {
  cloud.userName = 'Asha';
  final session = CloudSession(
    baseUrl: 'https://api.example.test',
    tokens: MemoryTokenStore(),
    client: cloud.client,
  );
  await session.requestCode('9876543210');
  await session.verifyCode(FakeCloud.code);
  await session.createBusiness(name: 'Asha Traders', state: '29');
  return session;
}

AppState _hosted(CloudSession session, CrashReporter crashes) => AppState(
  cloud: session,
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => null,
  now: () => DateTime(2026, 10, 6, 10),
  crashes: crashes,
);

void main() {
  test(
    'scrubbing removes people, businesses and amounts, and keeps file and line numbers',
    () {
      final clean = scrubCrashText(
        'Bad state: "Fabric Co" owes ₹42,000.00 to 27AABCT1332L1ZE (PAN AABCT1332L), call +91 9876543210 or asha@example.com; '
        "'Retail Mart' total 59000 at https://api.example.in/v1/x?phone=9876543210",
      );
      for (final leak in [
        'Fabric',
        '42,000',
        '27AABCT1332L1ZE',
        'AABCT1332L',
        '9876543210',
        'asha@',
        'Retail',
        '59000',
        'phone=',
      ]) {
        expect(clean.contains(leak), isFalse, reason: '$leak leaked: $clean');
      }
      expect(
        clean,
        'Bad state: "[TEXT]" owes [AMOUNT] to [GSTIN] (PAN [PAN]), call [PHONE] or [EMAIL]; '
        "'[TEXT]' total [NUMBER] at https://api.example.in/v1/x",
      );
      expect(scrubCrashText(_stack), _stack);
    },
  );

  test(
    'a report carries the error type, a scrubbed message and the stack only',
    () {
      final report = crashReportOf(
        StateError('no invoice for "Kiran Stores"'),
        StackTrace.fromString(_stack),
        version: '1.0.0+1',
      );
      expect(report, {
        'kind': 'flutter',
        'type': 'StateError',
        'message': 'Bad state: no invoice for "[TEXT]"',
        'stack': _stack,
        'appVersion': '1.0.0+1',
        'count': 1,
      });
    },
  );

  test(
    'the same crash is counted once in the queue, and the queue keeps the latest twenty',
    () async {
      final store = MemoryCrashStore();
      final crashes = CrashReporter(store: store);
      await crashes.capture(StateError('a'), StackTrace.fromString(_stack));
      await crashes.capture(StateError('a'), StackTrace.fromString(_stack));
      expect(store.queue.single['count'], 2);
      for (var i = 0; i < 25; i++) {
        await crashes.capture(
          FormatException('f'),
          StackTrace.fromString('#0 f$i (package:myca/a.dart:$i:1)'),
        );
      }
      expect(store.queue.length, crashQueueLimit);
      expect(store.queue.last['stack'], '#0 f24 (package:myca/a.dart:24:1)');
    },
  );

  test(
    'switched off, nothing is kept and what was queued is dropped',
    () async {
      final store = MemoryCrashStore();
      final crashes = CrashReporter(store: store);
      await crashes.capture(StateError('a'), StackTrace.fromString(_stack));
      await crashes.setEnabled(false);
      expect(store.queue, isEmpty);
      await crashes.capture(StateError('b'), StackTrace.fromString(_stack));
      expect(store.queue, isEmpty);
    },
  );

  test(
    'queued reports go to the hosted API once signed in, ten at a time, and stay queued if sending fails',
    () async {
      final cloud = FakeCloud();
      final store = MemoryCrashStore();
      final crashes = CrashReporter(store: store);
      for (var i = 0; i < 12; i++) {
        await crashes.capture(
          StateError('e'),
          StackTrace.fromString('#0 f$i (package:myca/a.dart:$i:1)'),
        );
      }
      final session = await _ready(cloud);
      cloud.crashServerDown = true;
      final state = _hosted(session, crashes);
      await state.start();
      await crashes.idle;
      expect(store.queue.length, 12, reason: 'kept when the server fails');

      cloud.crashServerDown = false;
      await state.refresh();
      await crashes.idle;
      expect(cloud.crashReports.length, 12);
      expect(
        cloud.requests.where((r) => r == 'POST /v1/crash-reports').length,
        3,
      );
      expect(store.queue, isEmpty);
    },
  );

  testWidgets('the business sheet has a switch that turns crash reports off', (
    tester,
  ) async {
    final cloud = FakeCloud();
    final store = MemoryCrashStore();
    final crashes = CrashReporter(store: store);
    final session = await _ready(cloud);
    final state = _hosted(session, crashes);
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    final toggle = find.widgetWithText(SwitchListTile, 'Send crash reports');
    await tester.ensureVisible(toggle);
    await tester.pumpAndSettle();
    expect(tester.widget<SwitchListTile>(toggle).value, isTrue);
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(state.crashReportsOn, isFalse);
    expect(store.on, isFalse);
  });
}
