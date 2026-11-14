import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/app_state.dart';
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
import 'package:myca_design/myca_design.dart' show Bahi;

import '../test/my_support.dart';
import 'fonts.dart';
import 'rgb_png.dart';

const _frame = Key('my.frame');

Future<void> _loadInterForPackage() async {
  final inter = FontLoader('packages/myca_design/Inter');
  for (final file in ['Inter-Regular.ttf', 'Inter-Medium.ttf', 'Inter-SemiBold.ttf']) {
    inter.addFont(File('assets/fonts/$file').readAsBytes().then((data) => ByteData.view(data.buffer)));
  }
  await inter.load();
}

Future<void> save(WidgetTester tester, String name) async {
  await tester.pumpAndSettle();
  final size = tester.view.physicalSize;
  final boundary = tester.renderObject<RenderRepaintBoundary>(find.byKey(_frame));
  await tester.runAsync(() async {
    final image = await boundary.toImage(pixelRatio: 2);
    final data = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
    final file = File('build/my_screens/${size.width.toInt()}x${size.height.toInt()}/$name.png')..createSync(recursive: true);
    file.writeAsBytesSync(rgbPngFromRgba(data!.buffer.asUint8List(), image.width, image.height));
    image.dispose();
  });
}

Widget framed(AppState state, Widget home, {String language = 'en', bool dark = false}) => RepaintBoundary(key: _frame, child: KeyedSubtree(key: UniqueKey(), child: myApp(state, home, language: language, dark: dark)));

void main() {
  Bahi.live = false;
  setUpAll(() async {
    await loadFonts();
    await _loadInterForPackage();
  });
  setUp(() => moneyCountry = 'MY');
  tearDown(() => moneyCountry = 'IN');

  for (final size in const [Size(390, 844), Size(360, 640)]) {
    testWidgets('Malaysia screens at ${size.width.toInt()}x${size.height.toInt()}', (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.runAsync(loadMsicCodes);

      Future<MyTestApi> show(String name, Widget Function(MyTestApi api) screen, {String language = 'en', bool dark = false}) async {
        final api = MyTestApi();
        await tester.pumpWidget(framed(myState(api), screen(api), language: language, dark: dark));
        await save(tester, name);
        return api;
      }

      await show('01_welcome', (_) => const MyWelcomeScreen());
      await show('02_welcome_ms', (_) => const MyWelcomeScreen(), language: 'ms');
      final snapshot = await MyTestApi().snapshot();
      await show('03_home', (_) => MyHomeScreen(snapshot: snapshot));
      await show('04_home_dark', (_) => MyHomeScreen(snapshot: snapshot), dark: true);
      await show('05_home_ms', (_) => MyHomeScreen(snapshot: snapshot), language: 'ms');
      await show('06_business_details', (_) => const MyProfileScreen());
      await show('07_msic_picker', (_) => const MsicPickerScreen());

      await show('08_einvoice_new', (_) => const MyEinvoiceCreateScreen());
      await typeKey(tester, 'myCreate.number', 'INV-2026-0200');
      await typeKey(tester, 'myCreate.buyerName', 'Syarikat Maju Jaya Sdn Bhd');
      await typeKey(tester, 'myCreate.buyerTin', 'C20880050010');
      await typeKey(tester, 'myCreate.buyerId', '201901000005');
      await typeKey(tester, 'myCreate.buyerLine', '12 Jalan Tun Razak');
      await typeKey(tester, 'myCreate.buyerPostcode', '50400');
      await typeKey(tester, 'myCreate.buyerCity', 'Kuala Lumpur');
      await pickOption(tester, 'myCreate.buyerState', 'Wilayah Persekutuan Kuala Lumpur');
      await typeKey(tester, 'myCreate.line0.description', 'Website maintenance, October');
      await typeKey(tester, 'myCreate.line0.quantity', '2');
      await typeKey(tester, 'myCreate.line0.price', '500');
      await pickOption(tester, 'myCreate.line0.taxType', 'Service tax');
      await typeKey(tester, 'myCreate.line0.rate', '8');
      await tapKey(tester, 'myCreate.check');
      await save(tester, '09_einvoice_checked');
      await tapKey(tester, 'myCreate.send');
      await save(tester, '10_einvoice_confirm');
      await tester.tap(find.byKey(const Key('myCreate.confirm')));
      await save(tester, '11_einvoice_validated_qr');

      await show('12_einvoice_invalid', (api) => MyEinvoiceDetailScreen(record: MyEinvoice.fromJson(api.books.malaysia.einvoices[1])));
      await show('13_einvoice_received', (api) => MyEinvoiceDetailScreen(record: MyEinvoice.fromJson(api.books.malaysia.einvoices.last)));
      await show('14_einvoice_list', (_) => const MyEinvoiceListScreen());
      await tester.tap(find.byKey(const Key('myList.receivedTab')));
      await save(tester, '15_einvoice_list_received');
      await tester.tap(find.byKey(const Key('myList.new')));
      await save(tester, '16_einvoice_new_choice');

      await show('17_consolidated', (_) => const MyConsolidatedScreen());
      await typeKey(tester, 'myCons.line0.amount', '8640.50');
      await typeKey(tester, 'myCons.line0.largest', '1250');
      await tapKey(tester, 'myCons.send');
      await save(tester, '18_consolidated_confirm');

      await show('19_sst_return', (_) => const MySstScreen());
      await typeKey(tester, 'mySst.line0.value', '10000');
      await tapKey(tester, 'mySst.prepare');
      await save(tester, '20_sst_return_prepared');
      await show('21_sst_registration', (_) => const MySstScreen(startOnRegistration: true));
      await typeKey(tester, 'mySstReg.value', '600000');
      await tapKey(tester, 'mySstReg.check');
      await save(tester, '22_sst_registration_result');

      await show('23_tax', (_) => const MyTaxScreen());
      await typeKey(tester, 'myTax.employment', '80000');
      await typeKey(tester, 'myTax.pcb', '3000');
      await tapKey(tester, 'myTax.estimate');
      await save(tester, '24_tax_estimate');

      await show('25_plans', (_) => const MyPlanScreen());
      await show('26_plans_dark', (_) => const MyPlanScreen(), dark: true);
    });
  }
}
