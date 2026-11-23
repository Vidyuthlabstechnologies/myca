import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';

import 'fake_api.dart';

void main() {
  tearDown(() => moneyCountry = 'IN');

  test('compact figures use the business currency outside India', () {
    moneyCountry = 'US';
    expect(compactRupees(0), isNot(contains('₹')));
    expect(compactRupees(902600), isNot(contains('₹')));
    expect(compactRupees(902600), startsWith('\$'));
    moneyCountry = 'GB';
    expect(compactRupees(0), startsWith('£'));
    expect(compactRupees(150000), startsWith('£'));
    moneyCountry = 'MY';
    expect(compactRupees(150000), startsWith('RM'));
  });

  test('amount fields carry the business currency and tax name outside India', () {
    moneyCountry = 'US';
    expect(moneyPrefix, '\$ ');
    expect(salesTaxName, 'sales tax');
    moneyCountry = 'MY';
    expect(moneyPrefix, 'RM ');
    expect(salesTaxName, isNot('GST'));
    moneyCountry = 'GB';
    expect(moneyPrefix, '£ ');
    moneyCountry = 'IN';
    expect(moneyPrefix, '₹ ');
    expect(salesTaxName, 'GST');
  });

  testWidgets('a US business home shows dollars in the month summary, never rupees', (tester) async {
    final api = FakeMycaApi(signedIn: true)..country = 'US';
    final state = AppState(
      api: api,
      store: MemoryOnboardingStore(isWelcomed: true, isMigrated: true),
      pickTextFile: (_) async => null,
      now: () => DateTime(2026, 10, 5, 22, 30),
    );
    await tester.pumpWidget(MycaApp(state: state));
    await tester.pumpAndSettle();
    expect(find.text('FEDERAL AND OWNER TAXES'), findsOneWidget);
    expect(find.textContaining('₹'), findsNothing);
  });
}
