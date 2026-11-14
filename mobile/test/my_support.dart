import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/api/myca_api.dart';
import 'package:myca/app_state.dart';
import 'package:myca/my/my_strings.dart';
import 'package:myca/tour/sample_books_api.dart';
import 'package:myca_design/myca_design.dart' show MycaDesign;

import 'fake_api.dart';

final myNow = DateTime(2026, 10, 5, 10, 30);

class MyTestApi implements MycaApi {
  MyTestApi({SampleBooksApi? books}) : books = books ?? (SampleBooksApi(signedIn: true)..country = 'MY');

  final SampleBooksApi books;
  final failNext = <String, int>{};
  final calls = <String>[];
  final args = <String, Map<String, Object?>>{};
  Map<String, Object?>? Function(String name, Map<String, Object?> args)? answer;
  int confirms = 0;

  void _maybeFail(String name) {
    final left = failNext[name] ?? 0;
    if (left <= 0) return;
    failNext[name] = left - 1;
    throw const MycaApiException('Cannot reach MyCA. Check your connection and try again.');
  }

  @override
  Future<Snapshot> snapshot() async {
    _maybeFail('snapshot');
    return books.snapshot();
  }

  @override
  Future<SignInResult> signIn(String userId, String pin) => books.signIn(userId, pin);

  @override
  Future<void> signOut() => books.signOut();

  @override
  Future<ChatReply> chat(String message) => books.chat(message);

  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async {
    calls.add('propose:$name');
    this.args['propose:$name'] = args;
    _maybeFail('propose:$name');
    return books.propose(name, args);
  }

  @override
  Future<ChatReply> confirm(String token) async {
    confirms += 1;
    calls.add('confirm');
    _maybeFail('confirm');
    return books.confirm(token);
  }

  @override
  Future<ChatReply> discard() => books.discard();

  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) async {
    calls.add(name);
    this.args[name] = args;
    _maybeFail(name);
    final custom = answer?.call(name, args);
    if (custom != null) return custom;
    return books.query(name, args);
  }

  @override
  Future<String> upload(String name, String content) => books.upload(name, content);

  @override
  Future<ToolOutcome> updateCompany({required String name, String gstin = ''}) => books.updateCompany(name: name, gstin: gstin);
}

class MemoryLanguageStore implements LanguageStore {
  MemoryLanguageStore([this.code = '']);

  String code;

  @override
  Future<String> load() async => code;

  @override
  Future<void> save(String code) async => this.code = code;
}

AppState myState(MycaApi api, {bool welcomed = true, String language = '', DateTime? now, Future<bool> Function(String text)? share}) => AppState(
  api: api,
  store: MemoryOnboardingStore(isWelcomed: welcomed, isMigrated: welcomed),
  pickTextFile: (_) async => null,
  now: () => now ?? myNow,
  edition: 'MY',
  languages: MemoryLanguageStore(language),
  shareText: share ?? (_) async => true,
);

Widget myApp(AppState state, Widget home, {String language = 'en', bool dark = false}) => AppScope(
  state: state,
  child: MaterialApp(
    theme: MycaDesign.forFlavor('my').light,
    darkTheme: MycaDesign.forFlavor('my').dark,
    themeMode: dark ? ThemeMode.dark : ThemeMode.light,
    localizationsDelegates: const [MyStrings.delegate, ...MycaDesign.localizationsDelegates],
    supportedLocales: const [Locale('en', 'MY'), Locale('ms', 'MY')],
    locale: Locale(language, 'MY'),
    home: home,
  ),
);

Future<void> settle(WidgetTester tester) async {
  await tester.pumpAndSettle();
}

Future<void> reveal(WidgetTester tester, Finder finder) async {
  if (finder.evaluate().isEmpty) {
    final scrollables = find.byWidgetPredicate((widget) => widget is Scrollable && axisDirectionToAxis(widget.axisDirection) == Axis.vertical).evaluate().toList().reversed;
    for (final element in scrollables) {
      final position = (element as StatefulElement).state as ScrollableState;
      for (final delta in [300.0, -300.0]) {
        var steps = 0;
        while (finder.evaluate().isEmpty && steps < 60) {
          final before = position.position.pixels;
          position.position.jumpTo((before + delta).clamp(position.position.minScrollExtent, position.position.maxScrollExtent));
          await tester.pump();
          if (position.position.pixels == before) break;
          steps += 1;
        }
        if (finder.evaluate().isNotEmpty) break;
      }
      if (finder.evaluate().isNotEmpty) break;
    }
  }
  await tester.ensureVisible(finder.first);
  await tester.pumpAndSettle();
}

Future<void> tapKey(WidgetTester tester, String key) async {
  final finder = find.byKey(Key(key));
  await reveal(tester, finder);
  await tester.tap(finder.first);
  await tester.pumpAndSettle();
}

Future<void> typeKey(WidgetTester tester, String key, String text) async {
  final finder = find.byKey(Key(key));
  await reveal(tester, finder);
  await tester.enterText(finder.first, text);
  await tester.pump();
}

Future<void> pickOption(WidgetTester tester, String key, String label) async {
  await tapKey(tester, key);
  if (find.text(label).evaluate().isEmpty) await reveal(tester, find.text(label));
  await tester.tap(find.text(label).last);
  await tester.pumpAndSettle();
}
