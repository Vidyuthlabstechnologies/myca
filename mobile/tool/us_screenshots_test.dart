import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';

import '../test/fake_api.dart';
import '../test/us_return_test.dart' show UsFakeApi, usState;
import 'screenshots_test.dart' show loadFonts, shot;

void main() {
  setUpAll(loadFonts);
  tearDown(() => moneyCountry = 'IN');

  Future<void> phone(WidgetTester tester) async {
    tester.view.physicalSize = const Size(1080, 2280);
    tester.view.devicePixelRatio = 2.75;
    addTearDown(tester.view.reset);
  }

  testWidgets('US filer screens', (tester) async {
    await phone(tester);
    final welcome = AppState(api: UsFakeApi(), store: MemoryOnboardingStore(), pickTextFile: (_) async => null, deviceCountry: 'US');
    await tester.pumpWidget(MycaApp(state: welcome));
    await shot(tester, 'us_01_welcome');

    final api = UsFakeApi()
      ..taxpayer = {
        'filingStatus': 'mfj',
        'taxpayer': {'firstName': 'Jordan', 'lastName': 'Rivera', 'ssnLast4': '6780', 'dateOfBirth': '1990-07-04', 'occupation': 'Nurse'},
        'spouse': {'firstName': 'Sam', 'lastName': 'Rivera', 'ssnLast4': '4320', 'dateOfBirth': '1991-01-02'},
        'address': {'line1': '1 Market St', 'city': 'San Francisco', 'state': 'CA', 'zip': '94105'},
      };
    api.forms.addAll([
      {'id': 'F1', 'kind': 'W-2', 'payer': 'Acme Corp', 'amounts': {'wages': 52000, 'federalWithheld': 6100}},
      {'id': 'F2', 'kind': '1099-INT', 'payer': 'First Bank', 'amounts': {'interest': 42.17}},
    ]);
    await tester.pumpWidget(MycaApp(key: UniqueKey(), state: usState(api)));
    await shot(tester, 'us_02_hub');
    await tester.tap(find.byKey(const Key('usHub.step.profile')));
    await shot(tester, 'us_03_about_you');
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usHub.step.forms')));
    await shot(tester, 'us_04_documents');
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usHub.step.interview')));
    await shot(tester, 'us_05_question');
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usHub.step.review')));
    await shot(tester, 'us_06_review');
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('usHub.step.sign')));
    await shot(tester, 'us_07_sign');
  });
}
