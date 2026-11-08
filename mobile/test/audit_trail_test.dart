import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';
import 'package:myca/theme.dart';

import 'fake_api.dart';

const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

class SavedBytes {
  final files = <String, Uint8List>{};
  final mimes = <String>[];

  AppState state(FakeMycaApi api) => AppState(
    api: api,
    store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
    pickTextFile: (_) async => null,
    saveBytesFile: (name, bytes, mime) async {
      files[name] = bytes;
      mimes.add(mime);
      return true;
    },
    now: () => DateTime(2026, 10, 5, 22, 30),
  );
}

class NoAuditApi extends FakeMycaApi {
  NoAuditApi() : super(signedIn: true);

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    if (name != 'audit_trail') return super.query(name, args);
    queries.add(name);
    queryArgs.add(QueryCall(name, args));
    return {'ok': false, 'error': 'UNKNOWN_TOOL'};
  }
}

Future<void> openTrail(WidgetTester tester, FakeMycaApi api, {AppState? state}) async {
  await tester.pumpWidget(MycaApp(state: state ?? testState(api)));
  await tester.pumpAndSettle();
  await tapRow(tester, 'Reports');
  await tester.tap(find.text('Audit trail'));
  await tester.pumpAndSettle();
}

List<QueryCall> asked(FakeMycaApi api) => api.queryArgs.where((q) => q.name == 'audit_trail').toList();

void main() {
  testWidgets('Reports offers the audit trail as a built-in report beside the saved ones, and it lists what changed newest first with who, when and which records', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Reports');
    expect(find.text('BUILT-IN'), findsOneWidget);
    expect(find.text('Who changed what and when, with a check for edits to the log'), findsOneWidget);
    expect(find.text('Sales by customer'), findsOneWidget);
    expect(find.text('Expenses this quarter'), findsOneWidget);

    await tester.tap(find.text('Audit trail'));
    await tester.pumpAndSettle();
    expect(find.descendant(of: find.byType(AppBar), matching: find.text('Audit trail')), findsOneWidget);
    expect(asked(api).single.args, {'period': 'this-month', 'view': 'changes'});
    expect(find.text('Posted Create invoice (INV-0001)'), findsOneWidget);
    expect(find.text('Locked the books through 2026-09-30: September closed'), findsOneWidget);
    expect(find.text('2026-10-05 10:30 UTC · Asha · INV-0001'), findsOneWidget);
    expect(find.text('2026-10-05 11:15 UTC · Asha'), findsOneWidget);
    expect(find.text('Log chain verified (2 events; the client an event is filed under is not sealed)'), findsOneWidget);
    expect(find.text('Nothing changed in this period.'), findsNothing);
    final lock = tester.getTopLeft(find.byKey(const ValueKey('audit.AUD-000002'))).dy;
    final invoice = tester.getTopLeft(find.byKey(const ValueKey('audit.AUD-000001'))).dy;
    expect(lock, lessThan(invoice), reason: 'the newest change is first');
    expect(find.text('This month'), findsOneWidget);
    expect(find.text('Changes'), findsOneWidget);
    expect(find.text('Everything'), findsOneWidget);
    expect(find.text('Show more'), findsNothing);
  });

  testWidgets('the period and view chips ask the engine again with the period and view they stand for', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openTrail(tester, api);
    await tester.tap(find.text('Last month'));
    await tester.pumpAndSettle();
    expect(asked(api).last.args, {'period': 'last-month', 'view': 'changes'});
    await tester.tap(find.text('Everything'));
    await tester.pumpAndSettle();
    expect(asked(api).last.args, {'period': 'last-month', 'view': 'all'});
    await tester.tap(find.text('This quarter'));
    await tester.pumpAndSettle();
    expect(asked(api).last.args, {'period': 'this-quarter', 'view': 'all'});
    await tester.tap(find.text('This year'));
    await tester.pumpAndSettle();
    expect(asked(api).last.args, {'period': 'this-year', 'view': 'all'});
    await tester.tap(find.text('Changes'));
    await tester.pumpAndSettle();
    expect(asked(api).last.args, {'period': 'this-year', 'view': 'changes'});
    final count = asked(api).length;
    await tester.tap(find.text('Changes'));
    await tester.pumpAndSettle();
    expect(asked(api).length, count, reason: 'the chip that is already chosen asks nothing');
    expect(find.text('Posted Create invoice (INV-0001)'), findsOneWidget);
  });

  testWidgets('Save as Excel asks for the audit trail workbook of the chosen period and says where it went', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    final saved = SavedBytes();
    await openTrail(tester, api, state: saved.state(api));
    await tester.tap(find.text('Last month'));
    await tester.pumpAndSettle();
    final button = find.text('Save as Excel');
    await tester.scrollUntilVisible(button, 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(api.queryArgs.any((q) => q.name == 'export_xlsx' && q.args['report'] == 'audit_trail' && q.args['period'] == 'last-month'), isTrue);
    expect(saved.files.keys.single, 'myca-audit-trail-last-month.xlsx');
    expect(saved.mimes.single, xlsxMime);
    expect(find.text('Saved myca-audit-trail-last-month.xlsx. Open it in Excel or send it to your CA.'), findsOneWidget);
  });

  testWidgets('when the phone cannot save the file the screen says so', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await openTrail(tester, api);
    final button = find.text('Save as Excel');
    await tester.scrollUntilVisible(button, 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(api.queries, contains('export_xlsx'));
    expect(find.text('Not saved.'), findsOneWidget);
  });

  testWidgets('a broken log chain and a broken ledger are said plainly in the warning colour', (tester) async {
    final api = FakeMycaApi(signedIn: true)
      ..auditChain = {'ok': false, 'error': 'HASH_MISMATCH', 'at': 'AUD-000002', 'chained': 1, 'unchained': 0}
      ..auditLedgerOk = false;
    await openTrail(tester, api);
    expect(find.text('Log chain broken at AUD-000002'), findsOneWidget);
    expect(find.textContaining('HASH_MISMATCH'), findsNothing);
    expect(tester.widget<Text>(find.byKey(const ValueKey('audit.chain'))).style?.color, Palette.danger);
    expect(find.text('The record of entries fails its integrity check. Ask your CA before recording more.'), findsOneWidget);
  });

  testWidgets('a period with nothing in it says so, and a long list can be asked for in full', (tester) async {
    final api = FakeMycaApi(signedIn: true)..auditEvents.clear();
    await openTrail(tester, api);
    expect(find.text('Nothing changed in this period.'), findsOneWidget);

    final longer = FakeMycaApi(signedIn: true)..auditMore = true;
    await tester.pumpWidget(MycaApp(key: UniqueKey(), state: testState(longer)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Reports');
    await tester.tap(find.text('Audit trail'));
    await tester.pumpAndSettle();
    final more = find.text('Show more');
    await tester.scrollUntilVisible(more, 200, scrollable: find.byType(Scrollable).first);
    expect(asked(longer).single.args.containsKey('limit'), isFalse);
    await tester.tap(more);
    await tester.pumpAndSettle();
    expect(asked(longer).last.args, {'period': 'this-month', 'view': 'changes', 'limit': 2000});
    expect(find.text('Show more'), findsNothing);
  });

  testWidgets('when the engine cannot answer the screen says so and Try again asks once more', (tester) async {
    final api = NoAuditApi();
    await openTrail(tester, api);
    expect(find.text('The audit trail could not be loaded.'), findsOneWidget);
    expect(find.text('Log chain verified (0 events)'), findsNothing);
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(asked(api).length, 2);
  });

  test('the audit trail reads the engine answer: records, chain words and the ledger verdict', () {
    final trail = AuditTrail.fromTool({
      'ok': true,
      'data': {
        'from': '2026-10-01',
        'to': '2026-10-31',
        'label': '2026-10',
        'view': 'all',
        'events': [
          {'eventId': 'AUD-000009', 'at': '2026-10-05T17:00:30.000Z', 'actorId': 'USR-1', 'actorName': '', 'action': 'tool.list_invoices', 'kind': 'read', 'summary': 'List invoices', 'ids': <String>[], 'transfers': ['4', '5'], 'chained': false},
          {'eventId': 'AUD-000010', 'at': 'not a time', 'actorId': 'USR-2', 'actorName': 'Ravi', 'action': 'chat.confirm', 'kind': 'change', 'summary': 'Posted Create invoice (INV-0002, 9)', 'ids': ['INV-0002', 9], 'transfers': <String>[], 'chained': true},
        ],
        'count': 2,
        'total': 5,
        'more': true,
        'chain': {'ok': true, 'chained': 1, 'unchained': 4},
        'ledger': {'ok': true, 'last': 99},
      },
    })!;
    expect(trail.view, 'all');
    expect(trail.count, 2);
    expect(trail.total, 5);
    expect(trail.more, isTrue);
    expect(trail.chainOk, isTrue);
    expect(trail.chainWords, 'Log chain verified (1 event; the client an event is filed under is not sealed; 4 earlier events were recorded before sealing and are not covered)');
    expect(trail.ledgerOk, isTrue);
    expect(trail.events.first.actor, 'USR-1');
    expect(trail.events.first.when, '2026-10-05 17:00 UTC');
    expect(trail.events.first.transfers, ['4', '5']);
    expect(trail.events.first.chained, isFalse);
    expect(trail.events.first.subtitle, '2026-10-05 17:00 UTC · USR-1');
    expect(trail.events.last.actor, 'Ravi');
    expect(trail.events.last.at, isNull);
    expect(trail.events.last.when, '');
    expect(trail.events.last.ids, ['INV-0002', '9']);
    expect(trail.events.last.subtitle, 'Ravi · INV-0002, 9');
    expect(AuditTrail.fromTool({'ok': false, 'error': 'UNKNOWN_TOOL'}), isNull);
    expect(AuditTrail.fromTool(null), isNull);
    final broken = AuditTrail.fromTool({'ok': true, 'data': {'chain': {'ok': false, 'error': 'LINK_BROKEN', 'at': 'AUD-000004'}, 'ledger': {'ok': false}, 'events': <Object?>[]}})!;
    expect(broken.chainOk, isFalse);
    expect(broken.chainWords, 'Log chain broken at AUD-000004');
    expect(broken.ledgerOk, isFalse);
    expect(broken.events, isEmpty);
  });
}
