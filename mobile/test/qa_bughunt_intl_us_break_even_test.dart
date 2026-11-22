import 'package:flutter_test/flutter_test.dart';
import 'package:myca/format.dart';
import 'package:myca/main.dart';
import 'package:myca/screens/us/us_sign_screen.dart';
import 'package:myca/us/us_filing_fee.dart';

import 'us_edges_test.dart' show openOn;
import 'us_return_test.dart' show usState;
import 'us_walk.dart' show WalkFees, filledApi, walkYear;

void main() {
  setUp(() => moneyCountry = 'US');
  tearDown(() => moneyCountry = 'IN');

  testWidgets('a signed return with no refund and nothing owed does not promise a \$0.00 refund', (tester) async {
    final api = filledApi()
      ..efile = 'signed'
      ..refund = 0
      ..owed = 0;
    await tester.pumpWidget(MycaApp(state: usState(api)));
    await tester.pumpAndSettle();
    await openOn(tester, UsSignScreen(taxYear: walkYear, fees: WalkFees(const UsFilingFee(taxYear: walkYear, enforced: false, paid: true, priceUsd: 129))));
    expect(find.text('Signed. Ready to send.'), findsOneWidget);
    expect(find.textContaining('Your refund is'), findsNothing);
    expect(find.text('You break even with the IRS.'), findsOneWidget);
  });
}
