import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

AppState _withPicked(FakeMycaApi api, PickedFile picked) => AppState(
  api: api,
  store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
  pickTextFile: (_) async => null,
  pickAnyFile: () async => picked,
  now: () => DateTime(2026, 10, 5, 22, 30),
);

PickedFile _receipt() => PickedFile(name: 'receipt.jpg', mime: 'image/jpeg', bytes: Uint8List.fromList(utf8.encode('jpeg bytes')));

Future<void> _readBill(WidgetTester tester) async {
  await tester.tap(find.byType(FloatingActionButton));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Read a bill from a photo'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Choose a bill'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a photographed receipt that matches a posted expense offers to attach it instead of posting it twice', (tester) async {
    final api = FakeMycaApi(signedIn: true)
      ..documentMatches.add({'kind': 'expense', 'id': 'EXP-0003', 'date': '2026-10-17', 'amount': 2500, 'party': 'HP Petrol Pump', 'daysApart': 0, 'sameParty': true});
    await tester.pumpWidget(MycaApp(state: _withPicked(api, _receipt())));
    await tester.pumpAndSettle();
    await _readBill(tester);

    expect(find.text('This looks like expense EXP-0003 already in the books: ₹2,500.00 to HP Petrol Pump on 2026-10-17'), findsOneWidget);
    expect(find.text('Preview the purchase'), findsNothing);
    await tester.tap(find.text('Attach to EXP-0003'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'attach_document');
    expect(api.proposals.last.args, {'documentSha256': 'sha-of-receipt.jpg', 'id': 'EXP-0003'});
    expect(find.text('Attach to EXP-0003'), findsNothing);
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(api.attachments.single['id'], 'EXP-0003');
    expect(find.text('Attached the document to EXP-0003.'), findsOneWidget);
  });

  testWidgets('saying it is a new bill dismisses the match and the purchase can be previewed as usual', (tester) async {
    final api = FakeMycaApi(signedIn: true)
      ..documentMatches.add({'kind': 'bill', 'id': 'PUR-0001', 'date': '2026-10-03', 'amount': 12600, 'party': 'Ganga Mills', 'daysApart': 0, 'sameParty': true});
    await tester.pumpWidget(MycaApp(state: _withPicked(api, _receipt())));
    await tester.pumpAndSettle();
    await _readBill(tester);
    expect(find.textContaining('This looks like bill PUR-0001 already in the books'), findsOneWidget);
    await tester.tap(find.text('It is a new bill'));
    await tester.pumpAndSettle();
    expect(find.textContaining('already in the books'), findsNothing);
    await tester.tap(find.text('Preview the purchase'));
    await tester.pumpAndSettle();
    expect(api.proposals.last.tool, 'create_purchase');
  });

  testWidgets('with no match the card does not appear', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: _withPicked(api, _receipt())));
    await tester.pumpAndSettle();
    await _readBill(tester);
    expect(find.textContaining('already in the books'), findsNothing);
    expect(find.text('Preview the purchase'), findsOneWidget);
  });
}
