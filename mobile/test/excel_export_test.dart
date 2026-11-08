import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';

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

void main() {
  testWidgets('Taxes saves the entries and the trial balance as Excel', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    final saved = SavedBytes();
    await tester.pumpWidget(MycaApp(state: saved.state(api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('3 things need you'));
    await tester.pumpAndSettle();
    final entries = find.text('Save entries as Excel');
    await tester.scrollUntilVisible(entries, 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(entries);
    await tester.pumpAndSettle();
    expect(api.queryArgs.any((q) => q.name == 'export_xlsx' && q.args['report'] == 'entries' && q.args['period'] == '2026-10'), isTrue);
    expect(saved.files.keys.toList(), ['myca-entries-2026-10.xlsx']);
    expect(String.fromCharCodes(saved.files.values.single), 'PK\u0003\u0004test');
    expect(find.text('Saved myca-entries-2026-10.xlsx. Open it in Excel or send it to your CA.'), findsOneWidget);
    final trial = find.text('Save as Excel');
    await tester.scrollUntilVisible(trial, 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(trial);
    await tester.pumpAndSettle();
    expect(api.queryArgs.any((q) => q.name == 'export_xlsx' && q.args['report'] == 'trial_balance'), isTrue);
    expect(saved.files.keys, contains('myca-trial-balance-2026-10-05.xlsx'));
    expect(saved.mimes.toSet(), {xlsxMime});
    expect(find.text('Saved myca-trial-balance-2026-10-05.xlsx. Open it in Excel or send it to your CA.'), findsOneWidget);
  });

  testWidgets('when the phone cannot save bytes the Taxes screen says so', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('3 things need you'));
    await tester.pumpAndSettle();
    final trial = find.text('Save as Excel');
    await tester.scrollUntilVisible(trial, 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(trial);
    await tester.pumpAndSettle();
    expect(api.queries, contains('export_xlsx'));
    expect(find.text('Not saved.'), findsOneWidget);
  });

  testWidgets('a saved report is saved as Excel with every row, and the cut list points there', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    final saved = SavedBytes();
    await tester.pumpWidget(MycaApp(state: saved.state(api)));
    await tester.pumpAndSettle();
    await tapRow(tester, 'Reports');
    await tester.tap(find.text('Expenses this quarter'));
    await tester.pumpAndSettle();
    expect(find.text('3 more'), findsOneWidget);
    expect(find.text('Save as Excel for the full list'), findsOneWidget);
    expect(find.textContaining('desktop'), findsNothing);
    await tester.tap(find.text('Save as Excel'));
    await tester.pumpAndSettle();
    expect(api.queryArgs.any((q) => q.name == 'export_xlsx' && q.args['report'] == 'saved_report' && q.args['name'] == 'Expenses this quarter'), isTrue);
    expect(saved.files.keys.single, 'myca-saved-report-expenses-this-quarter.xlsx');
    expect(saved.mimes.single, xlsxMime);
    expect(find.text('Saved myca-saved-report-expenses-this-quarter.xlsx. Open it in Excel or send it to your CA.'), findsOneWidget);
  });
}
