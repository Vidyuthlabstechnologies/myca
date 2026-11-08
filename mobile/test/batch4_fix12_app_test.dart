import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';
import 'package:myca/widgets/utf16_limit.dart';

import 'fake_api.dart';
import 'ims_test.dart' show inSheet, openIms, openRow;

const _gujarat = '2026-10|24AAACF7856R1ZY|GM77|B2B';

String _hindi() => List.filled(9, 'सही दर, चालान जाँच लिया। ').join().trim();
String _thumbs(int count) => List.filled(count, '👍').join();
String _family(int count) => List.filled(count, '👨‍👩‍👧‍👦').join();
String _accented(int count) => List.filled(count, 'é').join();

bool _wholeCharacters(String source, String kept) {
  for (var count = 0; count <= source.characters.length; count += 1) {
    if (source.characters.take(count).toString() == kept) return true;
  }
  return false;
}

TextEditingValue _typed(String text) => TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));

void main() {
  group('the length the engine counts', () {
    test('the sample notes are longer than 200 units while shorter than 200 characters', () {
      final note = _hindi();
      expect(note.length, greaterThan(200));
      expect(note.characters.length, lessThan(200));
      expect(_thumbs(120).length, 240);
      expect(_family(30).characters.length, 30);
    });

    test('clip keeps at most the limit in UTF-16 units and cuts on a whole character', () {
      const limit = 200;
      final cases = <String, String>{
        'hindi': _hindi(),
        'thumbs up': _thumbs(120),
        'family emoji': _family(30),
        'accented letters': _accented(150),
        'ascii': 'a' * 300,
        'mixed': 'Bill ok ${_thumbs(80)} ${_hindi()}',
      };
      for (final entry in cases.entries) {
        final kept = Utf16LengthLimit.clip(entry.value, limit);
        expect(kept.length, lessThanOrEqualTo(limit), reason: entry.key);
        expect(_wholeCharacters(entry.value, kept), isTrue, reason: entry.key);
        expect(entry.value.startsWith(kept), isTrue, reason: entry.key);
        final next = entry.value.characters.skip(kept.characters.length).first;
        expect(kept.length + next.length, greaterThan(limit), reason: '${entry.key}: the next character would have fitted');
      }
      expect(Utf16LengthLimit.clip(_thumbs(120), limit), _thumbs(100));
      expect(Utf16LengthLimit.clip(_family(30), limit), _family(18));
      expect(Utf16LengthLimit.clip(_accented(150), limit), _accented(100));
    });

    test('clip leaves a text that fits exactly as it is', () {
      expect(Utf16LengthLimit.clip('a' * 200, 200), 'a' * 200);
      expect(Utf16LengthLimit.clip('', 200), '');
      expect(Utf16LengthLimit.clip(_thumbs(100), 200), _thumbs(100));
      expect(Utf16LengthLimit.clip('a' * 199 + '👍', 200), 'a' * 199);
    });

    test('a text pasted into an empty field is kept up to the limit', () {
      const formatter = Utf16LengthLimit(200);
      final pasted = formatter.formatEditUpdate(TextEditingValue.empty, _typed(_hindi()));
      expect(pasted.text.length, lessThanOrEqualTo(200));
      expect(pasted.text, isNotEmpty);
      expect(_wholeCharacters(_hindi(), pasted.text), isTrue);
      expect(pasted.selection, TextSelection.collapsed(offset: pasted.text.length));
    });

    test('200 ASCII letters are kept whole and one more is refused', () {
      const formatter = Utf16LengthLimit(200);
      final full = _typed('a' * 200);
      expect(formatter.formatEditUpdate(TextEditingValue.empty, full).text, 'a' * 200);
      final more = formatter.formatEditUpdate(full, _typed('${'a' * 200}b'));
      expect(more.text, 'a' * 200);
    });

    test('typing in the middle of a full field changes nothing', () {
      const formatter = Utf16LengthLimit(200);
      final full = TextEditingValue(text: 'a' * 200, selection: const TextSelection.collapsed(offset: 100));
      final typed = TextEditingValue(text: '${'a' * 100}b${'a' * 100}', selection: const TextSelection.collapsed(offset: 101));
      final result = formatter.formatEditUpdate(full, typed);
      expect(result.text, 'a' * 200);
    });

    test('a paste into the middle keeps the text on both sides and only as much of the paste as fits', () {
      const formatter = Utf16LengthLimit(200);
      final before = TextEditingValue(text: '${'a' * 90}${'z' * 100}', selection: const TextSelection.collapsed(offset: 90));
      final after = TextEditingValue(text: '${'a' * 90}${'p' * 50}${'z' * 100}', selection: const TextSelection.collapsed(offset: 140));
      final result = formatter.formatEditUpdate(before, after);
      expect(result.text, '${'a' * 90}${'p' * 10}${'z' * 100}');
      expect(result.selection, const TextSelection.collapsed(offset: 100));
    });

    test('an emoji that does not fit whole is left out, not cut in half', () {
      const formatter = Utf16LengthLimit(200);
      final before = TextEditingValue(text: 'a' * 199, selection: const TextSelection.collapsed(offset: 199));
      final result = formatter.formatEditUpdate(before, _typed('${'a' * 199}👍'));
      expect(result.text, 'a' * 199);
      expect(result.text.runes.length, 199);
    });

    test('a replaced selection counts the removed text as room', () {
      const formatter = Utf16LengthLimit(200);
      final before = TextEditingValue(text: 'a' * 200, selection: const TextSelection(baseOffset: 10, extentOffset: 60));
      final after = TextEditingValue(text: '${'a' * 10}${'p' * 80}${'a' * 140}', selection: const TextSelection.collapsed(offset: 90));
      final result = formatter.formatEditUpdate(before, after);
      expect(result.text.length, 200);
      expect(result.text, '${'a' * 10}${'p' * 50}${'a' * 140}');
    });
  });

  group('the IMS note field', () {
    Future<TextField> openNoteField(WidgetTester tester, FakeMycaApi api) async {
      await openIms(tester, testState(api));
      await openRow(tester, _gujarat);
      await tester.tap(inSheet(find.widgetWithText(ChoiceChip, 'Accept')));
      await tester.pumpAndSettle();
      return tester.widget<TextField>(inSheet(find.byType(TextField)));
    }

    String fieldText(WidgetTester tester) => tester.widget<TextField>(inSheet(find.byType(TextField))).controller!.text;

    testWidgets('a long Hindi note is cut so the engine accepts it, and what is sent equals what the field holds', (tester) async {
      final api = FakeMycaApi(signedIn: true)..has2b = true;
      await openNoteField(tester, api);
      final note = _hindi();
      await tester.enterText(inSheet(find.byType(TextField)), note);
      await tester.pumpAndSettle();
      final held = fieldText(tester);
      expect(held.length, lessThanOrEqualTo(200));
      expect(held, isNotEmpty);
      expect(_wholeCharacters(note, held), isTrue);
      await tester.tap(inSheet(find.text('Save')));
      await tester.pumpAndSettle();
      final sent = api.proposals.last.args['note'] as String;
      expect(sent, held.trim());
      expect(sent.length, lessThanOrEqualTo(200));
    });

    testWidgets('120 thumbs-up emoji, joined family emoji and accented letters stay within 200 units', (tester) async {
      final api = FakeMycaApi(signedIn: true)..has2b = true;
      await openNoteField(tester, api);
      for (final note in [_thumbs(120), _family(30), _accented(150)]) {
        await tester.enterText(inSheet(find.byType(TextField)), note);
        await tester.pumpAndSettle();
        final held = fieldText(tester);
        expect(held.length, lessThanOrEqualTo(200));
        expect(held.length, greaterThan(180));
        expect(_wholeCharacters(note, held), isTrue);
        expect(held.runes.every((rune) => rune < 0xD800 || rune > 0xDFFF), isTrue);
      }
    });

    testWidgets('200 ASCII letters are kept whole and 300 are cut to 200', (tester) async {
      final api = FakeMycaApi(signedIn: true)..has2b = true;
      await openNoteField(tester, api);
      await tester.enterText(inSheet(find.byType(TextField)), 'n' * 200);
      await tester.pumpAndSettle();
      expect(fieldText(tester), 'n' * 200);
      await tester.enterText(inSheet(find.byType(TextField)), 'n' * 300);
      await tester.pumpAndSettle();
      expect(fieldText(tester), 'n' * 200);
    });

    testWidgets('the counter shows the units used out of 200', (tester) async {
      final api = FakeMycaApi(signedIn: true)..has2b = true;
      await openNoteField(tester, api);
      expect(inSheet(find.text('0/200')), findsOneWidget);
      await tester.enterText(inSheet(find.byType(TextField)), 'Rate checked');
      await tester.pumpAndSettle();
      expect(inSheet(find.text('12/200')), findsOneWidget);
      await tester.enterText(inSheet(find.byType(TextField)), _thumbs(120));
      await tester.pumpAndSettle();
      expect(inSheet(find.text('200/200')), findsOneWidget);
    });

    testWidgets('a note that fits is sent as typed', (tester) async {
      final api = FakeMycaApi(signedIn: true)..has2b = true;
      await openNoteField(tester, api);
      await tester.enterText(inSheet(find.byType(TextField)), 'सही दर');
      await tester.pumpAndSettle();
      await tester.tap(inSheet(find.text('Save')));
      await tester.pumpAndSettle();
      expect(api.proposals.last.args, {'period': '2026-10', 'keys': [_gujarat], 'decision': 'accept', 'note': 'सही दर'});
    });
  });

  group('the other fields the engine limits in UTF-16 units', () {
    Future<void> openHome(WidgetTester tester, FakeMycaApi api, {AppState? state}) async {
      await tester.pumpWidget(MycaApp(state: state ?? testState(api)));
      await tester.pumpAndSettle();
    }

    String held(WidgetTester tester, Finder field) => tester.widget<TextField>(field).controller!.text;

    testWidgets('a reminder text is cut at 200 units on a whole character and is sent within the engine limit', (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openHome(tester, api);
      await tapRow(tester, 'Reminders');
      await tester.tap(find.widgetWithText(ActionChip, 'Reminder'));
      await tester.pumpAndSettle();
      final field = find.widgetWithText(TextField, 'What about');
      final note = _hindi() + _hindi();
      await tester.enterText(field, note);
      await tester.pumpAndSettle();
      expect(held(tester, field).length, lessThanOrEqualTo(200));
      expect(held(tester, field).length, greaterThan(150));
      expect(_wholeCharacters(note, held(tester, field)), isTrue);
      await tester.tap(find.text('Tomorrow'));
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect((api.proposals.last.args['text'] as String).length, lessThanOrEqualTo(200));
    });

    testWidgets('a question to the CA is cut at 1000 units', (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openHome(tester, api);
      await tapRow(tester, 'Sales');
      await tester.tap(find.text('Gujarat Weaves'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Invoice INV-0002'));
      await tester.pumpAndSettle();
      final ask = find.widgetWithText(ActionChip, 'Ask my CA');
      await tester.scrollUntilVisible(ask, 200, scrollable: find.byType(Scrollable).last);
      await tester.tap(ask);
      await tester.pumpAndSettle();
      final field = find.widgetWithText(TextField, 'Your question');
      final note = _thumbs(700);
      await tester.enterText(field, note);
      await tester.pumpAndSettle();
      expect(held(tester, field).length, 1000);
      expect(_wholeCharacters(note, held(tester, field)), isTrue);
      await tester.tap(find.text('Preview'));
      await tester.pumpAndSettle();
      expect((api.proposals.last.args['note'] as String).length, lessThanOrEqualTo(1000));
    });

    testWidgets('a message to a customer is cut at 2000 units and the counter counts units', (tester) async {
      final api = FakeMycaApi(signedIn: true);
      final state = AppState(
        api: api,
        store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
        pickTextFile: (_) async => null,
        shareText: (text) async => true,
        now: () => DateTime(2026, 10, 5, 22, 30),
      );
      await openHome(tester, api, state: state);
      await tapRow(tester, 'Sales');
      await tester.tap(find.text('Gujarat Weaves'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Remind customer'));
      await tester.pumpAndSettle();
      final field = find.widgetWithText(TextField, 'Message');
      final note = _family(300);
      await tester.enterText(field, note);
      await tester.pumpAndSettle();
      expect(held(tester, field).length, lessThanOrEqualTo(2000));
      expect(held(tester, field).length, greaterThan(1980));
      expect(_wholeCharacters(note, held(tester, field)), isTrue);
      expect(find.text('${held(tester, field).length}/2000'), findsOneWidget);
    });

    testWidgets('a supplier bill number is cut at 16 units', (tester) async {
      final api = FakeMycaApi(signedIn: true);
      await openHome(tester, api);
      await tapRow(tester, 'Purchases');
      await tester.tap(find.text('Fabric Co'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(ActionChip, 'Bill'));
      await tester.pumpAndSettle();
      final field = find.widgetWithText(TextField, "Supplier's bill number");
      await tester.enterText(field, '${_thumbs(20)}A');
      await tester.pumpAndSettle();
      expect(held(tester, field).length, lessThanOrEqualTo(16));
      await tester.enterText(field, 'ABCDEFGHIJKLMNOPQRS');
      await tester.pumpAndSettle();
      expect(held(tester, field), 'ABCDEFGHIJKLMNOP');
    });
  });
}
