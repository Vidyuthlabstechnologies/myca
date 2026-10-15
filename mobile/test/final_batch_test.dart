import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';
import 'package:myca/notifications.dart';

import 'fake_api.dart';

AppState stateFor(FakeMycaApi api, {Map<String, String>? saved, PickedFile? picked, PickedFile? shared, RecordingNotifications? notifications}) => AppState(
  api: api,
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => null,
  pickAnyFile: () async => picked,
  takeSharedFile: () async {
    final file = shared;
    shared = null;
    return file;
  },
  notifications: notifications ?? const NoNotifications(),
  saveTextFile: (name, content) async {
    saved?[name] = content;
    return true;
  },
  now: () => DateTime(2026, 10, 5, 22, 30),
);

void main() {
  tearDown(() => moneyCountry = 'IN');

  testWidgets('a bill photo is uploaded as a data URL, read into lines, previewed and posted', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    final picked = PickedFile(name: 'bill.jpg', mime: 'image/jpeg', bytes: Uint8List.fromList(utf8.encode('jpeg bytes')));
    await tester.pumpWidget(MycaApp(state: stateFor(api, picked: picked)));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Read a bill from a photo'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Choose a bill'));
    await tester.pumpAndSettle();
    expect(api.uploads['sha-of-bill.jpg'], startsWith('data:image/jpeg;base64,'));
    expect(api.readDocuments, ['sha-of-bill.jpg']);
    expect(find.text('Ganga Mills'), findsOneWidget);
    expect(find.text('Cotton yarn'), findsOneWidget);
    await tester.tap(find.text('Preview the purchase'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'create_purchase');
    expect(api.proposals.last.args['supplierInvoiceNo'], 'GM/221');
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Posted PUR-0002'), findsOneWidget);
  });

  testWidgets('a bill shared into the app from another app opens Read a bill and is read at once', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    final shared = PickedFile(name: 'bill.jpg', mime: 'image/jpeg', bytes: Uint8List.fromList(utf8.encode('jpeg bytes')));
    await tester.pumpWidget(MycaApp(state: stateFor(api, shared: shared)));
    await tester.pumpAndSettle();
    expect(find.text('Read a bill'), findsOneWidget);
    expect(api.uploads['sha-of-bill.jpg'], startsWith('data:image/jpeg;base64,'));
    expect(api.readDocuments, ['sha-of-bill.jpg']);
    expect(find.text('Ganga Mills'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Read a bill'), findsNothing);
    expect(api.readDocuments.length, 1, reason: 'a shared file is read once, not again on every rebuild');
  });

  testWidgets('when the model is off the capture screen says so instead of failing silently', (tester) async {
    final api = FakeMycaApi(signedIn: true)..modelOff = true;
    final picked = PickedFile(name: 'bill.txt', mime: 'text/plain', bytes: Uint8List.fromList(utf8.encode('Ganga Mills bill')));
    await tester.pumpWidget(MycaApp(state: stateFor(api, picked: picked)));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Read a bill from a photo'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Choose a bill'));
    await tester.pumpAndSettle();
    expect(api.uploads['sha-of-bill.txt'], 'Ganga Mills bill');
    expect(find.textContaining('needs the model switched on'), findsOneWidget);
    expect(api.proposals, isEmpty);
  });

  testWidgets('Home hands the week ahead to the notification planner', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    final notifications = RecordingNotifications();
    await tester.pumpWidget(MycaApp(state: stateFor(api, notifications: notifications)));
    await tester.pumpAndSettle();
    expect(notifications.planned, isNotEmpty);
    expect(notifications.planned.first.map((item) => item.title), contains('GSTR-1 (monthly) for 2026-09'));
    expect(notifications.planned.first.where((item) => item.overdue).length, 1);
  });

  testWidgets('a US owner sees Schedule SE and saves the Schedule C document, the CPA pack, a Form 941 and the W-2 file', (tester) async {
    final api = FakeMycaApi(signedIn: true)..country = 'US';
    final saved = <String, String>{};
    await tester.pumpWidget(MycaApp(state: stateFor(api, saved: saved)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('FEDERAL AND OWNER TAXES'));
    await tester.pumpAndSettle();
    expect(find.text('Self-employment tax'), findsOneWidget);
    expect(find.text('\$7,064.78'), findsOneWidget);
    await tester.tap(find.text('Save the Schedule C document'));
    await tester.pumpAndSettle();
    expect(saved['schedule_c_2026.html'], contains('Schedule C'));
    await tester.tap(find.text('Save the CPA pack'));
    await tester.pumpAndSettle();
    expect(saved.keys, contains('cpa_pack_2026.json'));
    expect(jsonDecode(saved['cpa_pack_2026.json']!)['scheduleC']['netProfit'], 50000);
    final q1 = find.text('Form 941 for 2026-Q3');
    await tester.scrollUntilVisible(q1, 200, scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(q1);
    await tester.pumpAndSettle();
    await tester.tap(q1);
    await tester.pumpAndSettle();
    expect(saved['form_941_2026-Q3.csv'], startsWith('line,description,amount'));
    final w2 = find.textContaining('W-2 for ');
    await tester.scrollUntilVisible(w2, 200, scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(w2);
    await tester.pumpAndSettle();
    await tester.tap(w2);
    await tester.pumpAndSettle();
    expect(saved['forms_w2_w3_2026.csv'], contains('Ana Lopez'));
  });

  testWidgets('an Indian invoice can be amended after filing from its screen', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: stateFor(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Sales');
    await tester.tap(find.text('Gujarat Weaves'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('INV-0002').first);
    await tester.pumpAndSettle();
    final amend = find.text('Amend after filing');
    await tester.scrollUntilVisible(amend, 200, scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(amend);
    await tester.pumpAndSettle();
    await tester.tap(amend);
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Reason'), 'Rate was wrong');
    await tester.tap(find.text('Preview the amendment'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'amend_invoice');
    expect(api.proposals.last.args['invoiceId'], 'INV-0002');
    expect(api.proposals.last.args['reason'], 'Rate was wrong');
    expect((api.proposals.last.args['lines'] as List), isNotEmpty);
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(find.textContaining('amended (AMD-0001)'), findsOneWidget);
  });
}
