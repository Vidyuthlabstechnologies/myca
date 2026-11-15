import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';
import 'package:myca/uae/uae_emirates.dart';
import 'package:myca/uae/uae_strings.dart';

import 'fake_api.dart';
import 'uae_fake_api.dart';
import 'uae_walks.dart';

final _india = RegExp(r'GST|HSN|₹|\bTDS\b|\bIFSC\b|\bUPI\b|GSTR|\bIGST\b|\bCGST\b|\bSGST\b|MSME|Udyam|place of supply', caseSensitive: false);

void main() {
  tearDown(() {
    moneyCountry = 'IN';
    uaeProfile.value = null;
  });

  for (final language in ['en', 'ar']) {
    for (final screen in uaeScreenWalks.entries) {
      testWidgets('$language: ${screen.key} in the UAE edition shows no India wording', (tester) async {
        await uaeView(tester, language: language);
        final api = await openUaeApp(tester);
        await screen.value(tester, api);
        expect(tester.takeException(), isNull);
        final shown = await uaeEveryText(tester);
        final india = shown.where(_india.hasMatch).toList();
        expect(india, isEmpty, reason: '${screen.key} shows: ${india.join(' | ')}');
      });
    }
  }

  for (final language in ['en', 'ar']) {
    testWidgets('$language: the UAE welcome speaks of VAT and corporate tax and offers no India sample tour', (tester) async {
      await uaeView(tester, language: language);
      final s = UaeStrings(language == 'ar');
      await tester.pumpWidget(MycaApp(
        state: AppState(
          api: UaeFakeApi(),
          store: MemoryOnboardingStore(isWelcomed: false, isMigrated: true),
          pickTextFile: (_) async => null,
          now: () => DateTime(2026, 11, 14, 10, 30),
          edition: 'AE',
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.text(s.welcomeLine), findsOneWidget);
      expect(find.text(s.welcomeTaxes), findsOneWidget);
      expect(find.text('Take a 2-minute tour first'), findsNothing);
      final india = (await uaeEveryText(tester)).where(_india.hasMatch).toList();
      expect(india, isEmpty, reason: india.join(' | '));
    });
  }
}
