import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/cloud/cloud_session.dart';
import 'package:myca/cloud/token_store.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';
import 'fake_cloud.dart';

Future<AppState> hostedAs(FakeCloud cloud, String role) async {
  cloud.userName = 'Asha';
  final tokens = MemoryTokenStore();
  final first = CloudSession(
    baseUrl: 'https://api.example.test',
    tokens: tokens,
    client: cloud.client,
  );
  await first.requestCode('9876543210');
  await first.verifyCode(FakeCloud.code);
  await first.createBusiness(name: 'Asha Traders', state: '29');
  cloud.role = role;
  return AppState(
    cloud: CloudSession(
      baseUrl: 'https://api.example.test',
      tokens: tokens,
      client: cloud.client,
    ),
    store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
    pickTextFile: (_) async => null,
  );
}

Future<void> openPeople(WidgetTester tester) async {
  await tester.tap(find.byTooltip('Your business'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('People'));
  await tester.pumpAndSettle();
}

void main() {
  test('a sync time reads as the date in India', () {
    expect(sharedOn('2026-10-07T18:30:00.000Z'), '8 October 2026');
    expect(sharedOn('2026-10-07T09:30:00.000Z'), '7 October 2026');
    expect(sharedOn(''), '');
  });

  testWidgets('the owner chooses what the accountant sees and can share now', (
    tester,
  ) async {
    final cloud = FakeCloud();
    await tester.pumpWidget(MycaApp(state: await hostedAs(cloud, 'owner')));
    await tester.pumpAndSettle();
    await openPeople(tester);

    final section = find.text('WHAT YOUR ACCOUNTANT SEES');
    await tester.scrollUntilVisible(
      section,
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('As things happen'), findsOneWidget);
    expect(
      find.text('Share now'),
      findsNothing,
      reason: 'live needs no sharing',
    );

    final daily = find.text('Once a day');
    await tester.ensureVisible(daily);
    await tester.tap(daily);
    await tester.pumpAndSettle();
    expect(cloud.caMode, 'daily');
    final note = find.text(
      'Your accountant sees the books as of 7 October 2026, 3:00 pm.',
    );
    await tester.ensureVisible(note);
    expect(note, findsOneWidget);

    await tester.tap(find.text('Share now'));
    await tester.pumpAndSettle();
    expect(cloud.shares, 1);
    expect(
      find.text(
        'Your accountant sees the books as of 7 October 2026, 6:15 pm.',
      ),
      findsOneWidget,
    );
  });

  testWidgets(
    'an accountant on a shared view is told the date, and has no sync setting',
    (tester) async {
      final cloud = FakeCloud()
        ..caMode = 'daily'
        ..sharedAsOf = '2026-10-06T18:30:00.000Z';
      await tester.pumpWidget(
        MycaApp(state: await hostedAs(cloud, 'accountant')),
      );
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Shared by the owner as of 7 October 2026. Entries after that are not shown, and changes are made by the owner.',
        ),
        findsOneWidget,
      );
      await openPeople(tester);
      expect(find.text('WHAT YOUR ACCOUNTANT SEES'), findsNothing);
    },
  );
}
