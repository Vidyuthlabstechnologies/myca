import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  tearDown(() => moneyCountry = 'IN');

  for (final (edition, name) in [('US', 'MyCA US'), ('GB', 'MyCA UK'), ('AE', 'MyCA UAE'), ('MY', 'MyCA Malaysia'), ('IN', 'MyCA')]) {
    testWidgets('the $edition app names itself $name in the recent apps list, as its launcher label does', (tester) async {
      final state = AppState(api: FakeMycaApi(), store: MemoryOnboardingStore(), pickTextFile: (_) async => null, edition: edition);
      await tester.pumpWidget(MycaApp(state: state));
      await tester.pump();
      expect(tester.widget<MaterialApp>(find.byType(MaterialApp).first).title, name);
    });
  }
}
