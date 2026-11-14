import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';

import 'uae_fake_api.dart';
import 'uae_walks.dart';

void main() {
  tearDown(() => moneyCountry = 'IN');

  for (final walk in {...uaeWalks, ...uaeEntryWalks}.entries) {
    for (final language in ['en', 'ar']) {
      for (final (label, size) in uaeSizes) {
        testWidgets('${walk.key} $language at $label lays out without overflow', (tester) async {
          await uaeView(tester, size: size, language: language);
          final api = await openUaeApp(tester);
          await walk.value(tester, api);
          expect(tester.takeException(), isNull);
          final direction = Directionality.of(tester.element(find.byType(Scaffold).last));
          expect(direction, language == 'ar' ? TextDirection.rtl : TextDirection.ltr);
        });
      }
      for (final scale in [1.3, 2.0]) {
        for (final (label, size) in [('320x568', const Size(320, 568)), ('390x844', const Size(390, 844))]) {
          testWidgets('${walk.key} $language at $label and ${scale}x text lays out without overflow', (tester) async {
            await uaeView(tester, size: size, language: language, textScale: scale);
            final api = await openUaeApp(tester);
            await walk.value(tester, api);
            expect(tester.takeException(), isNull);
          });
        }
      }
    }
  }
}
