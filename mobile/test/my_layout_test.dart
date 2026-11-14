import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/api/models.dart';
import 'package:myca/format.dart';
import 'package:myca/my/my_codes.dart';
import 'package:myca/my/my_tools.dart';
import 'package:myca/screens/my/my_consolidated_screen.dart';
import 'package:myca/screens/my/my_einvoice_create_screen.dart';
import 'package:myca/screens/my/my_einvoice_detail_screen.dart';
import 'package:myca/screens/my/my_einvoice_list_screen.dart';
import 'package:myca/screens/my/my_home_screen.dart';
import 'package:myca/screens/my/my_plan_screen.dart';
import 'package:myca/screens/my/my_profile_screens.dart';
import 'package:myca/screens/my/my_sst_screen.dart';
import 'package:myca/screens/my/my_tax_screen.dart';
import 'package:myca/screens/my/my_welcome_screen.dart';

import 'my_support.dart';

const sizes = [Size(320, 568), Size(360, 640), Size(375, 667), Size(390, 844), Size(412, 915), Size(430, 932), Size(600, 960), Size(800, 1280)];

typedef Screen = Widget Function(MyTestApi api, Snapshot snapshot);

final Map<String, Screen> screens = {
  'welcome': (_, _) => const MyWelcomeScreen(),
  'home': (_, snapshot) => MyHomeScreen(snapshot: snapshot),
  'profile': (_, _) => const MyProfileScreen(),
  'msic': (_, _) => const MsicPickerScreen(),
  'create': (_, _) => const MyEinvoiceCreateScreen(),
  'creditNote': (api, _) => MyEinvoiceCreateScreen(type: 'credit-note', original: MyEinvoice.fromJson(api.books.malaysia.einvoices.first)),
  'detailValid': (api, _) => MyEinvoiceDetailScreen(record: MyEinvoice.fromJson(api.books.malaysia.einvoices.first)),
  'detailInvalid': (api, _) => MyEinvoiceDetailScreen(record: MyEinvoice.fromJson(api.books.malaysia.einvoices[1])),
  'detailReceived': (api, _) => MyEinvoiceDetailScreen(record: MyEinvoice.fromJson(api.books.malaysia.einvoices.last)),
  'list': (_, _) => const MyEinvoiceListScreen(),
  'consolidated': (_, _) => const MyConsolidatedScreen(),
  'sstReturn': (_, _) => const MySstScreen(),
  'sstRegistration': (_, _) => const MySstScreen(startOnRegistration: true),
  'tax': (_, _) => const MyTaxScreen(),
  'plan': (_, _) => const MyPlanScreen(),
};

Future<void> scrollThrough(WidgetTester tester) async {
  final scrollables = find.byWidgetPredicate((widget) => widget is Scrollable && axisDirectionToAxis(widget.axisDirection) == Axis.vertical).evaluate().toList();
  for (final element in scrollables) {
    final position = ((element as StatefulElement).state as ScrollableState).position;
    if (!position.hasContentDimensions) continue;
    var steps = 0;
    while (position.pixels < position.maxScrollExtent && steps < 40) {
      position.jumpTo((position.pixels + position.viewportDimension * 0.8).clamp(0, position.maxScrollExtent));
      await tester.pump();
      steps += 1;
    }
  }
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => moneyCountry = 'MY');
  tearDown(() => moneyCountry = 'IN');

  for (final entry in screens.entries) {
    for (final dark in [false, true]) {
      for (final scale in [1.0, 2.0]) {
        testWidgets('${entry.key} lays out at every phone and tablet size, ${dark ? 'dark' : 'light'}, text ×$scale', (tester) async {
          await tester.runAsync(loadMsicCodes);
          addTearDown(tester.view.reset);
          tester.view.devicePixelRatio = 1;
          for (final size in sizes) {
            tester.view.physicalSize = size;
            final api = MyTestApi();
            final snapshot = await api.snapshot();
            await tester.pumpWidget(myApp(myState(api), entry.value(api, snapshot), dark: dark, textScale: scale));
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull, reason: '${entry.key} at ${size.width.toInt()}x${size.height.toInt()}');
            await scrollThrough(tester);
            expect(tester.takeException(), isNull, reason: '${entry.key} scrolled at ${size.width.toInt()}x${size.height.toInt()}');
            await tester.pumpWidget(const SizedBox());
          }
        });
      }
    }
  }
}
