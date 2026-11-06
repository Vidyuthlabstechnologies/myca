import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/ims_screen.dart';
import 'package:myca/widgets.dart';

import 'fake_api.dart';

const _gujarat = '2026-10|24AAACF7856R1ZY|GM77|B2B';
const _boxMart = '2026-10|27AAACB2222B1Z5|BM12|B2B';
const _retail = '2026-10|27AAACH7409R1Z1|RS1|B2B';

class _OfflineIms extends FakeMycaApi {
  _OfflineIms() : super(signedIn: true);

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    if (name == 'ims_review') throw const MycaApiException('Offline');
    return super.query(name, args);
  }
}

Future<void> scrollTo(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 200, scrollable: find.byType(Scrollable).last);
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
}

Future<void> openIms(WidgetTester tester, AppState state) async {
  await tester.pumpWidget(MycaApp(state: state));
  await tester.pumpAndSettle();
  await tester.tap(find.text('3 things need you'));
  await tester.pumpAndSettle();
  final button = find.widgetWithText(OutlinedButton, 'Review in IMS');
  await scrollTo(tester, button);
  await tester.tap(button);
  await tester.pumpAndSettle();
}

Finder rowOf(String key) => find.byKey(ValueKey('ims.$key'));

String tagOf(WidgetTester tester, String key) => tester.widget<StatusTag>(find.byKey(ValueKey('ims.status.$key'))).text;

Finder inSheet(Finder what) => find.descendant(of: find.byType(BottomSheet), matching: what);

Future<void> openRow(WidgetTester tester, String key) async {
  await scrollTo(tester, rowOf(key));
  await tester.tap(rowOf(key));
  await tester.pumpAndSettle();
}

Future<void> decideInSheet(WidgetTester tester, String key, String choice, {String note = ''}) async {
  await openRow(tester, key);
  await tester.tap(inSheet(find.widgetWithText(ChoiceChip, choice)));
  await tester.pumpAndSettle();
  if (note.isNotEmpty) {
    await tester.enterText(inSheet(find.byType(TextField)), note);
    await tester.pumpAndSettle();
  }
  await tester.tap(inSheet(find.text('Save')));
  await tester.pumpAndSettle();
}

void main() {
  test('the review reads rows, counts and credit from the tool result, and each row has plain words', () async {
    final api = FakeMycaApi(signedIn: true)..has2b = true;
    final review = ImsReview.fromTool(await api.query('ims_review', {'period': '2026-10'}))!;
    expect(review.period, '2026-10');
    expect(review.hasStatement, isTrue);
    expect(review.statementRows, 3);
    expect(review.rows.map((row) => row.invoiceNo).toList(), ['BM-12', 'GM/77', 'RS-1']);
    expect(review.counts.total, 3);
    expect(review.counts.undecided, 3);
    expect(review.counts.accept, 0);
    expect(review.creditUndecided, 4080);
    expect(review.creditAccepted, 0);
    expect(review.matchedRows, 1);
    expect(review.orphaned, 0);
    expect(review.note, contains('does not send them to the GST portal'));
    final row = review.rows[1];
    expect(row.key, _gujarat);
    expect(row.title, 'GUJARAT MILLS · GM/77');
    expect(row.subtitle, '8 October 2026 · ₹3,600.00 credit · matched');
    expect(row.statusWords, 'Suggest accept');
    expect(row.itcWords, 'Credit not available in 2B');
    expect(row.inBooks, isTrue);
    expect(row.decided, isFalse);
    expect(review.rows[0].statusWords, 'Suggest pending');
    expect(review.rows[0].itcWords, 'Credit available in 2B');
    expect(review.rows[2].inBooks, isFalse);
  });

  test('a refusal reads as nothing, a month with no statement has no rows, and odd words are tamed', () async {
    expect(ImsReview.fromTool({'ok': false, 'error': 'INVALID_PERIOD'}), isNull);
    final empty = ImsReview.fromTool(await FakeMycaApi(signedIn: true).query('ims_review', {'period': '2026-10'}))!;
    expect(empty.hasStatement, isFalse);
    expect(empty.rows, isEmpty);
    expect(empty.counts.total, 0);
    final odd = ImsRow.fromJson({
      'key': 'k',
      'supplierName': 'A',
      'invoiceNo': '',
      'credit': -120,
      'decision': 'maybe',
      'suggested': 'whatever',
      'itcAvailability': 'A',
    });
    expect(odd.decision, '');
    expect(odd.decided, isFalse);
    expect(odd.suggested, 'pending');
    expect(odd.title, 'A');
    expect(odd.creditWords, '₹120.00 less credit');
    expect(odd.itcWords, '');
    expect(odd.subtitle, '₹120.00 less credit');
    expect(ImsRow.fromJson({'decision': 'reject'}).statusWords, 'Rejected');
    expect(ImsRow.fromJson({'decision': 'accept'}).decisionWords, 'Accepted');
    expect(ImsRow.fromJson({'decision': 'pending'}).decisionWords, 'Pending');
  });

  testWidgets('Review in IMS opens from the credit card and lists every invoice with its suggestion', (tester) async {
    final api = FakeMycaApi(signedIn: true)..has2b = true;
    await openIms(tester, testState(api));
    expect(find.text('IMS · October 2026'), findsOneWidget);
    expect(api.queryArgs.any((q) => q.name == 'ims_review' && q.args['period'] == '2026-10'), isTrue);
    expect(find.text('3 invoices · 0 accepted · 0 rejected · 0 pending · 3 not decided'), findsOneWidget);
    expect(find.text('Credit not decided ₹4,080.00 · accepted ₹0.00'), findsOneWidget);
    expect(find.text('BOX MART · BM-12'), findsOneWidget);
    expect(find.text('GUJARAT MILLS · GM/77'), findsOneWidget);
    expect(find.text('RETAIL SUPPLY · RS-1'), findsOneWidget);
    expect(find.text('8 October 2026 · ₹3,600.00 credit · matched'), findsOneWidget);
    expect(find.text('16 October 2026 · ₹300.00 credit · amount differs'), findsOneWidget);
    expect(find.text('15 October 2026 · ₹180.00 credit · not in books'), findsOneWidget);
    expect(tagOf(tester, _gujarat), 'Suggest accept');
    expect(tagOf(tester, _boxMart), 'Suggest pending');
    expect(tagOf(tester, _retail), 'Suggest pending');
    expect(find.textContaining('does not send them to the GST portal'), findsOneWidget);
    expect(find.widgetWithText(ActionChip, 'Accept all matched'), findsOneWidget);
    expect(find.widgetWithText(ActionChip, 'Save as Excel'), findsOneWidget);
    for (final label in ['All', 'Not decided', 'Accept', 'Reject', 'Pending', 'Not in books']) {
      expect(find.widgetWithText(ChoiceChip, label), findsOneWidget);
    }
  });

  testWidgets('the credit card offers the IMS review only once a GSTR-2B is in', (tester) async {
    await tester.pumpWidget(MycaApp(state: testState(FakeMycaApi(signedIn: true))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('3 things need you'));
    await tester.pumpAndSettle();
    await scrollTo(tester, find.text('Add GSTR-2B for October 2026'));
    expect(find.text('Review in IMS'), findsNothing);
  });

  testWidgets('an invoice opens with its details; rejecting it with a note is previewed, posted, and the status changes', (tester) async {
    final api = FakeMycaApi(signedIn: true)..has2b = true;
    await openIms(tester, testState(api));
    await openRow(tester, _boxMart);
    expect(inSheet(find.text('BOX MART · BM-12')), findsOneWidget);
    expect(inSheet(find.text('27AAACB2222B1Z5 · B2B')), findsOneWidget);
    expect(inSheet(find.text('16 October 2026')), findsOneWidget);
    expect(inSheet(find.text('₹6,000.00')), findsOneWidget);
    expect(inSheet(find.text('₹6,300.00')), findsOneWidget);
    expect(inSheet(find.text('BILL-0003')), findsOneWidget);
    expect(
      inSheet(find.text('The amounts differ: taxable value 5000 in your books, 6000 in 2B; IGST 250 in your books, 300 in 2B.')),
      findsOneWidget,
    );
    expect(inSheet(find.text('MyCA suggests leaving it pending until you have checked it.')), findsOneWidget);
    expect(tester.widget<FilledButton>(inSheet(find.byType(FilledButton))).onPressed, isNull);
    expect(tester.widget<ChoiceChip>(inSheet(find.widgetWithText(ChoiceChip, 'Clear'))).onSelected, isNull);
    expect(tester.widget<TextField>(inSheet(find.byType(TextField))).maxLength, 200);

    await tester.tap(inSheet(find.widgetWithText(ChoiceChip, 'Reject')));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(inSheet(find.byType(FilledButton))).onPressed, isNotNull);
    await tester.enterText(inSheet(find.byType(TextField)), 'Goods came back');
    await tester.pumpAndSettle();
    await tester.tap(inSheet(find.text('Save')));
    await tester.pumpAndSettle();

    expect(api.proposals.single.tool, 'ims_decide');
    expect(api.proposals.single.args, {'period': '2026-10', 'keys': [_boxMart], 'decision': 'reject', 'note': 'Goods came back'});
    expect(find.byType(BottomSheet), findsNothing);
    expect(find.text('BOX MART BM-12: reject'), findsOneWidget);
    expect(find.text('Mark BOX MART BM-12 as rejected in IMS for 2026-10.'), findsOneWidget);
    expect(find.text('Post it'), findsOneWidget);
    expect(tagOf(tester, _boxMart), 'Suggest pending');
    expect(api.confirmed, isEmpty);

    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(api.confirmed, [FakeMycaApi.token]);
    expect(api.imsDecisions[_boxMart], {'decision': 'reject', 'note': 'Goods came back', 'by': 'USR-ADMIN', 'on': '2026-10-05'});
    expect(tagOf(tester, _boxMart), 'Rejected');
    expect(tagOf(tester, _gujarat), 'Suggest accept');
    expect(find.text('3 invoices · 0 accepted · 1 rejected · 0 pending · 2 not decided'), findsOneWidget);
    expect(find.text('Credit not decided ₹3,780.00 · accepted ₹0.00'), findsOneWidget);
    expect(find.text('Marked 1 row rejected in IMS for 2026-10.'), findsOneWidget);
    expect(find.text('Post it'), findsNothing);
  });

  testWidgets('Accept all matched is previewed, and posting marks the matched invoice accepted and no other', (tester) async {
    final api = FakeMycaApi(signedIn: true)..has2b = true;
    await openIms(tester, testState(api));
    await tester.tap(find.widgetWithText(ActionChip, 'Accept all matched'));
    await tester.pumpAndSettle();
    expect(api.proposals.single.tool, 'ims_decide');
    expect(api.proposals.single.args, {'period': '2026-10', 'select': 'matched', 'decision': 'accept'});
    expect(find.text('Accept all matched invoices'), findsOneWidget);
    expect(find.text('Mark GUJARAT MILLS GM/77 as accepted in IMS for 2026-10.'), findsOneWidget);
    expect(tagOf(tester, _gujarat), 'Suggest accept');

    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(tagOf(tester, _gujarat), 'Accepted');
    expect(tagOf(tester, _boxMart), 'Suggest pending');
    expect(tagOf(tester, _retail), 'Suggest pending');
    expect(find.text('3 invoices · 1 accepted · 0 rejected · 0 pending · 2 not decided'), findsOneWidget);
    expect(find.text('Credit not decided ₹480.00 · accepted ₹3,600.00'), findsOneWidget);
    expect(api.imsDecisions.keys.toList(), [_gujarat]);
  });

  testWidgets('Accept all matched is off when no invoice matches the books', (tester) async {
    final api = FakeMycaApi(signedIn: true)..has2b = true;
    api.imsRows.removeWhere((row) => row['match'] == 'matched');
    await openIms(tester, testState(api));
    expect(tester.widget<ActionChip>(find.widgetWithText(ActionChip, 'Accept all matched')).onPressed, isNull);
  });

  testWidgets('discarding the preview changes nothing', (tester) async {
    final api = FakeMycaApi(signedIn: true)..has2b = true;
    await openIms(tester, testState(api));
    await tester.tap(find.widgetWithText(ActionChip, 'Accept all matched'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Discard'));
    await tester.pumpAndSettle();
    expect(api.discards, 1);
    expect(api.confirmed, isEmpty);
    expect(api.imsDecisions, isEmpty);
    expect(tagOf(tester, _gujarat), 'Suggest accept');
    expect(find.text('Post it'), findsNothing);
  });

  testWidgets('the filters narrow the list, and an empty filter says so', (tester) async {
    final api = FakeMycaApi(signedIn: true)..has2b = true;
    api.imsRows[1]['decision'] = 'accept';
    api.imsRows[0]['decision'] = 'pending';
    await openIms(tester, testState(api));
    expect(tagOf(tester, _gujarat), 'Accepted');
    expect(tagOf(tester, _boxMart), 'Pending');
    expect(tagOf(tester, _retail), 'Suggest pending');

    await tester.tap(find.widgetWithText(ChoiceChip, 'Not decided'));
    await tester.pumpAndSettle();
    expect(rowOf(_retail), findsOneWidget);
    expect(rowOf(_gujarat), findsNothing);
    expect(rowOf(_boxMart), findsNothing);

    await tester.tap(find.widgetWithText(ChoiceChip, 'Accept'));
    await tester.pumpAndSettle();
    expect(rowOf(_gujarat), findsOneWidget);
    expect(rowOf(_retail), findsNothing);

    await tester.tap(find.widgetWithText(ChoiceChip, 'Pending'));
    await tester.pumpAndSettle();
    expect(rowOf(_boxMart), findsOneWidget);
    expect(rowOf(_gujarat), findsNothing);

    await tester.tap(find.widgetWithText(ChoiceChip, 'Reject'));
    await tester.pumpAndSettle();
    expect(find.text('Nothing is marked reject.'), findsOneWidget);
    expect(find.byType(Panel), findsNothing);

    await tester.tap(find.widgetWithText(ChoiceChip, 'Not in books'));
    await tester.pumpAndSettle();
    expect(rowOf(_retail), findsOneWidget);
    expect(rowOf(_boxMart), findsNothing);
    expect(rowOf(_gujarat), findsNothing);

    await tester.tap(find.widgetWithText(ChoiceChip, 'All'));
    await tester.pumpAndSettle();
    expect(rowOf(_retail), findsOneWidget);
    expect(rowOf(_boxMart), findsOneWidget);
    expect(rowOf(_gujarat), findsOneWidget);
  });

  testWidgets('deciding an invoice moves it out of the Not decided filter', (tester) async {
    final api = FakeMycaApi(signedIn: true)..has2b = true;
    await openIms(tester, testState(api));
    await tester.tap(find.widgetWithText(ChoiceChip, 'Not decided'));
    await tester.pumpAndSettle();
    expect(find.byType(RowCard), findsNWidgets(3));
    await decideInSheet(tester, _retail, 'Pending');
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(rowOf(_retail), findsNothing);
    expect(find.byType(RowCard), findsNWidgets(2));
    await tester.tap(find.widgetWithText(ChoiceChip, 'Pending'));
    await tester.pumpAndSettle();
    expect(rowOf(_retail), findsOneWidget);
    expect(tagOf(tester, _retail), 'Pending');
  });

  testWidgets('a decided invoice can be cleared, which sends no note', (tester) async {
    final api = FakeMycaApi(signedIn: true)..has2b = true;
    await openIms(tester, testState(api));
    await decideInSheet(tester, _gujarat, 'Accept');
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(tagOf(tester, _gujarat), 'Accepted');

    await openRow(tester, _gujarat);
    expect(inSheet(find.text('Your decision so far: accepted.')), findsOneWidget);
    expect(tester.widget<FilledButton>(inSheet(find.byType(FilledButton))).onPressed, isNull);
    expect(tester.widget<ChoiceChip>(inSheet(find.widgetWithText(ChoiceChip, 'Clear'))).onSelected, isNotNull);
    await tester.tap(inSheet(find.widgetWithText(ChoiceChip, 'Clear')));
    await tester.pumpAndSettle();
    await tester.tap(inSheet(find.text('Save')));
    await tester.pumpAndSettle();
    expect(api.proposals.last.args, {'period': '2026-10', 'keys': [_gujarat], 'decision': 'clear'});
    expect(find.text('Mark GUJARAT MILLS GM/77 as not decided in IMS for 2026-10.'), findsOneWidget);
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(tagOf(tester, _gujarat), 'Suggest accept');
    expect(api.imsDecisions, isEmpty);
  });

  testWidgets('a decided invoice keeps its note in the sheet, and changing only the note can be saved', (tester) async {
    final api = FakeMycaApi(signedIn: true)..has2b = true;
    api.imsRows[2]['decision'] = 'reject';
    api.imsRows[2]['note'] = 'Not ours';
    await openIms(tester, testState(api));
    await openRow(tester, _retail);
    expect(tester.widget<TextField>(inSheet(find.byType(TextField))).controller!.text, 'Not ours');
    expect(tester.widget<FilledButton>(inSheet(find.byType(FilledButton))).onPressed, isNull);
    await tester.enterText(inSheet(find.byType(TextField)), 'Not ours, ask the supplier');
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(inSheet(find.byType(FilledButton))).onPressed, isNotNull);
    await tester.tap(inSheet(find.text('Save')));
    await tester.pumpAndSettle();
    expect(api.proposals.single.args, {'period': '2026-10', 'keys': [_retail], 'decision': 'reject', 'note': 'Not ours, ask the supplier'});
  });

  testWidgets('Save as Excel asks for the IMS sheet of the month and saves what the engine returns', (tester) async {
    final api = FakeMycaApi(signedIn: true)..has2b = true;
    final saved = <String, Uint8List>{};
    final state = AppState(
      api: api,
      store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
      pickTextFile: (_) async => null,
      saveBytesFile: (name, bytes, mime) async {
        saved[name] = bytes;
        return true;
      },
      now: () => DateTime(2026, 10, 5, 22, 30),
    );
    await openIms(tester, state);
    await tester.tap(find.widgetWithText(ActionChip, 'Save as Excel'));
    await tester.pumpAndSettle();
    expect(api.queryArgs.any((q) => q.name == 'export_xlsx' && q.args['report'] == 'ims_review' && q.args['period'] == '2026-10'), isTrue);
    expect(saved.keys.single, 'myca-ims-review-2026-10.xlsx');
    expect(find.text('Saved myca-ims-review-2026-10.xlsx. Open it in Excel or send it to your CA.'), findsOneWidget);
  });

  testWidgets('decisions whose invoice left the statement are mentioned', (tester) async {
    final api = FakeMycaApi(signedIn: true)
      ..has2b = true
      ..imsOrphaned = 2;
    await openIms(tester, testState(api));
    expect(find.text('2 earlier decisions are for invoices that are no longer in this GSTR-2B.'), findsOneWidget);
    api.imsOrphaned = 1;
    await tester.tap(find.widgetWithText(ActionChip, 'Accept all matched'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Post it'));
    await tester.pumpAndSettle();
    expect(find.text('1 earlier decision is for an invoice that is no longer in this GSTR-2B.'), findsOneWidget);
  });

  testWidgets('without a statement the screen says to add the GSTR-2B first and offers no decisions', (tester) async {
    final api = FakeMycaApi(signedIn: true);
    await tester.pumpWidget(MycaApp(state: testState(api)));
    await tester.pumpAndSettle();
    tester
        .state<NavigatorState>(find.byType(Navigator).first)
        .push(MaterialPageRoute<void>(builder: (_) => const ImsScreen(period: '2026-10')));
    await tester.pumpAndSettle();
    expect(find.text('IMS · October 2026'), findsOneWidget);
    expect(find.text('Add the GSTR-2B for this month first (Taxes → GST → Add 2B).'), findsOneWidget);
    expect(find.widgetWithText(ActionChip, 'Accept all matched'), findsNothing);
    expect(find.byType(Panel), findsNothing);
  });

  testWidgets('when the decisions cannot be read the screen says so', (tester) async {
    final api = _OfflineIms()..has2b = true;
    await openIms(tester, testState(api));
    expect(find.text('Could not load the IMS decisions. Try again in a moment.'), findsOneWidget);
    expect(find.byType(Panel), findsNothing);
  });
}
