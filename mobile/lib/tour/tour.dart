import 'dart:async';

import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_services.dart';
import '../app_state.dart';
import 'package:myca_design/myca_design.dart' show Bahi, BahiMood;
import '../registers.dart';
import '../screens/ask_screen.dart';
import '../screens/books_check_screen.dart';
import '../screens/expenses_screen.dart';
import '../screens/party_screen.dart';
import '../screens/taxes_screen.dart';
import 'sample_books_api.dart';

enum TourWait { next, sale, posted }

enum TourPlace { top, bottom }

class TourStep {
  const TourStep({
    required this.mood,
    required this.say,
    this.wait = TourWait.next,
    this.place = TourPlace.bottom,
    this.open,
    this.showMe,
    this.nextLabel = 'Next',
  });

  final BahiMood mood;
  final String say;
  final TourWait wait;
  final TourPlace place;
  final Widget Function()? open;
  final Widget Function()? showMe;
  final String nextLabel;
}

const sampleCustomer = 'Gujarat Weaves';
const sampleCustomerGstin = '24AAACG1234F1Z5';

Widget _saleComposer() => const PartyScreen(
  kind: RegisterKind.sales,
  partyName: sampleCustomer,
  partyGstin: sampleCustomerGstin,
  openComposer: true,
);

final tourSteps = <TourStep>[
  const TourStep(
    mood: BahiMood.wave,
    say: 'Namaste! I\'m ${Bahi.name}. This is Nalanda Textiles, a sample shop. Everything here is pretend, so tap anything you like. Your own books are not touched.',
    nextLabel: 'Show me around',
  ),
  const TourStep(
    mood: BahiMood.thinking,
    say: 'The top card is your day at a glance: GST you owe this month, and anything that needs you before a filing.',
  ),
  TourStep(
    mood: BahiMood.happy,
    say: 'Let\'s log a sale. Tap New entry, then I sold something, and pick $sampleCustomer.',
    wait: TourWait.sale,
    place: TourPlace.top,
    showMe: _saleComposer,
  ),
  TourStep(
    mood: BahiMood.thinking,
    say: 'Type an amount, say 8000, choose 18% GST, then tap Preview. MyCA works out the tax.',
    wait: TourWait.sale,
    place: TourPlace.top,
    showMe: _saleComposer,
  ),
  const TourStep(
    mood: BahiMood.happy,
    say: 'This is only a preview. Nothing reaches your books until you tap Post it.',
    wait: TourWait.posted,
    place: TourPlace.top,
  ),
  const TourStep(
    mood: BahiMood.celebrate,
    say: 'Posted! The invoice is in the customer\'s thread, and GST is already counted for this month.',
    place: TourPlace.top,
  ),
  TourStep(
    mood: BahiMood.thinking,
    say: 'Here is what you owe. Tax on sales, less credit on purchases, and the due date for each filing.',
    open: () => const TaxesScreen(),
  ),
  TourStep(
    mood: BahiMood.happy,
    say: 'Rent, fuel, tea for the staff: log expenses here. MyCA picks the head and tells you why.',
    open: () => const ExpensesScreen(),
  ),
  TourStep(
    mood: BahiMood.worried,
    say: 'When something looks off, like a bank line that matches nothing, it shows up here with the reason.',
    open: () => const BooksCheckScreen(),
  ),
  TourStep(
    mood: BahiMood.happy,
    say: 'And you can just ask, in English or Hinglish. Try "Who owes me?"',
    open: () => const AskScreen(first: 'How is business?'),
  ),
  const TourStep(
    mood: BahiMood.celebrate,
    say: 'That\'s MyCA! Ready to set up your own books? It takes about two minutes.',
    nextLabel: 'Start my books',
  ),
];

class _TourStore implements OnboardingStore {
  @override
  Future<bool> welcomed() async => true;
  @override
  Future<void> markWelcomed() async {}
  @override
  Future<bool> migrated() async => true;
  @override
  Future<void> markMigrated() async {}
  @override
  Future<bool> lockEnabled() async => false;
  @override
  Future<void> setLockEnabled(bool enabled) async {}
}

class TourApi implements MycaApi {
  TourApi(this.books, this.onEvent);

  final SampleBooksApi books;
  final void Function(String event, String name) onEvent;

  @override
  Future<Snapshot> snapshot() => books.snapshot();
  @override
  Future<SignInResult> signIn(String userId, String pin) => books.signIn(userId, pin);
  @override
  Future<void> signOut() async {}
  @override
  Future<ChatReply> chat(String message) => books.chat(message);
  @override
  Future<ChatReply> propose(String name, Map<String, Object?> args) async {
    final reply = await books.propose(name, args);
    onEvent('propose', name);
    return reply;
  }

  @override
  Future<ChatReply> confirm(String token) async {
    final reply = await books.confirm(token);
    onEvent('confirm', books.proposals.isEmpty ? '' : books.proposals.last.tool);
    return reply;
  }

  @override
  Future<ChatReply> discard() => books.discard();
  @override
  Future<Object?> query(String name, [Map<String, Object?> args = const {}]) => books.query(name, args);
  @override
  Future<String> upload(String name, String content) => books.upload(name, content);
  @override
  Future<ToolOutcome> updateCompany({required String name, String gstin = ''}) async =>
      ToolOutcome.fromJson({'ok': false, 'error': 'The sample business cannot be renamed.'});
}

class TourController extends ChangeNotifier {
  TourController({required this.navigator, this.onFinished, DateTime Function()? now})
    : _now = now ?? (() => DateTime(2026, 10, 5, 10, 30));

  final GlobalKey<NavigatorState> navigator;
  final Future<void> Function(bool startBooks)? onFinished;
  final DateTime Function() _now;
  late final observer = _TourObserver(this);

  AppState? sample;
  int index = 0;
  int _routes = 0;

  bool get active => sample != null;
  TourStep get step => tourSteps[index];
  int get count => tourSteps.length;

  Future<void> start() async {
    if (active) return;
    navigator.currentState?.popUntil((route) => route.isFirst);
    index = 0;
    _routes = 0;
    final books = SampleBooksApi(signedIn: true);
    final state = AppState(
      api: TourApi(books, _onApi),
      store: _TourStore(),
      pickTextFile: (_) async => null,
      now: _now,
    );
    sample = state;
    notifyListeners();
    await state.start();
  }

  void _onApi(String event, String name) {
    if (event == 'propose' && name == 'create_invoice' && step.wait == TourWait.sale) {
      _go(tourSteps.indexWhere((s) => s.wait == TourWait.posted));
    } else if (event == 'confirm' && name == 'create_invoice' && step.wait == TourWait.posted) {
      _go(index + 1);
    }
  }

  void _routeChanged(int depth) {
    _routes = depth;
    if (!active) return;
    if (index == 2 && depth > 0) _go(3);
  }

  void _go(int to) {
    if (to < 0 || to >= count) return;
    index = to;
    notifyListeners();
  }

  Future<void> next() async {
    if (index == count - 1) return finish(startBooks: true);
    final target = step.wait == TourWait.next ? index + 1 : tourSteps.indexWhere((s) => s.open != null);
    final open = tourSteps[target].open;
    if (open != null) {
      final nav = navigator.currentState;
      nav?.popUntil((route) => route.isFirst);
      _go(target);
      unawaited(nav?.push(MaterialPageRoute<void>(builder: (_) => open())));
      return;
    }
    if (tourSteps[target].wait == TourWait.next && step.wait != TourWait.next) {
      navigator.currentState?.popUntil((route) => route.isFirst);
    }
    _go(target);
  }

  void showMe() {
    final build = step.showMe;
    if (build == null) return;
    navigator.currentState?.popUntil((route) => route.isFirst);
    unawaited(navigator.currentState?.push(MaterialPageRoute<void>(builder: (_) => build())));
  }

  Future<void> finish({bool startBooks = false}) async {
    if (!active) return;
    navigator.currentState?.popUntil((route) => route.isFirst);
    sample = null;
    _routes = 0;
    notifyListeners();
    await onFinished?.call(startBooks);
  }

  int get openScreens => _routes;
}

class _TourObserver extends NavigatorObserver {
  _TourObserver(this.tour);

  final TourController tour;
  int _depth = 0;

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (route is PageRoute && previousRoute != null) _depth++;
    _notify();
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (route is PageRoute && _depth > 0) _depth--;
    _notify();
  }

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) {
    if (route is PageRoute && _depth > 0) _depth--;
    _notify();
  }

  void _notify() {
    final depth = _depth;
    WidgetsBinding.instance.addPostFrameCallback((_) => tour._routeChanged(depth));
  }
}

class TourScope extends InheritedNotifier<TourController> {
  const TourScope({super.key, required TourController tour, required super.child}) : super(notifier: tour);

  static TourController? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<TourScope>()?.notifier;
}
