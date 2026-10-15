import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_services.dart';
import 'package:myca/app_state.dart';
import 'package:myca/main.dart';

import 'cloud_test.dart' show signedIn;
import 'fake_api.dart';
import 'fake_cloud.dart';

void main() {
  testWidgets("an owner changes a member's role from People", (tester) async {
    final cloud = FakeCloud()
      ..userName = 'Asha'
      ..members.add({'id': 'u2', 'name': 'Ravi', 'role': 'staff'});
    final session = await signedIn(cloud);
    await session.createBusiness(name: 'Asha Traders', state: '29');
    final state = AppState(cloud: session, store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true), pickTextFile: (_) async => null);
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('People'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ravi'));
    await tester.pumpAndSettle();
    expect(find.text('Ravi is staff'), findsOneWidget);
    await tester.tap(find.widgetWithText(ListTile, 'Accountant'));
    await tester.pumpAndSettle();
    expect(cloud.roleChanges, ['u2:accountant']);
    expect(find.text('Accountant'), findsWidgets);
  });

  testWidgets('an owner deletes the business after confirming, and can delete the account', (tester) async {
    final cloud = FakeCloud()..userName = 'Asha';
    final session = await signedIn(cloud);
    await session.createBusiness(name: 'Asha Traders', state: '29');
    final saved = <String, String>{};
    final state = AppState(cloud: session, store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true), pickTextFile: (_) async => const PickedText(name: 'myca-backup.json', content: '{"version":1,"books":{"invoices":[{"id":"INV-0001"},{"id":"INV-0002"}]},"documents":{}}'), saveTextFile: (name, content) async {
      saved[name] = content;
      return true;
    });
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Your business'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Your businesses'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Download everything about Asha Traders'));
    await tester.pumpAndSettle();
    expect(cloud.exports, 1);
    expect(saved.keys.single, startsWith('myca-asha-traders-'));
    expect(saved.values.single, contains('"exportedAt"'));
    expect(find.textContaining('your books, every uploaded file'), findsOneWidget);
    await tester.tap(find.text('Restore Asha Traders from a file'));
    await tester.pumpAndSettle();
    expect(find.textContaining('2 invoices'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Replace'));
    await tester.pumpAndSettle();
    expect(cloud.replaced.length, 1);
    expect((cloud.replaced.single['books'] as Map)['invoices'], hasLength(2));
    expect(find.textContaining('Replaced from myca-backup.json: 2 invoices, 1 documents'), findsOneWidget);
    await tester.tap(find.text('Delete Asha Traders'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Keep'));
    await tester.pumpAndSettle();
    expect(cloud.deletedBusinesses, isEmpty);
    await tester.tap(find.text('Delete Asha Traders'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(cloud.deletedBusinesses, [FakeCloud.businessId]);
  });
}
