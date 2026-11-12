import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/brand.dart';
import 'package:myca/main.dart';
import 'package:myca/theme.dart';
import 'package:myca_design/myca_design.dart' show Bahi, BahiMood;

import '../test/fake_api.dart';
import 'fonts.dart';
import 'rgb_png.dart';

const playAssets = '../docs/release/assets/play';
const shortDescription = 'Books, GST returns and payroll by chat.';
const approvalLine = 'You approve every entry and filing.';

Future<void> savePlayImage(WidgetTester tester, String name, {required Finder of}) async {
  await tester.pumpAndSettle();
  final element = of.evaluate().single;
  final png = await tester.runAsync(() async {
    final image = await captureImage(element);
    final rgba = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
    final bytes = rgbPngFromRgba(rgba!.buffer.asUint8List(), image.width, image.height, background: Palette.canvas.toARGB32() & 0xFFFFFF);
    image.dispose();
    return bytes;
  });
  File('$playAssets/$name.png')
    ..createSync(recursive: true)
    ..writeAsBytesSync(png!);
}

Future<void> phone(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1080, 2160);
  tester.view.devicePixelRatio = 2.75;
  addTearDown(tester.view.reset);
}

Future<void> openBooks(WidgetTester tester, {FakeMycaApi? api}) async {
  await phone(tester);
  await tester.pumpWidget(MycaApp(state: testState(api ?? FakeMycaApi(signedIn: true))));
  await tester.pumpAndSettle();
}

Future<void> shoot(WidgetTester tester, String name) => savePlayImage(tester, name, of: find.byType(MaterialApp));

class FeatureGraphic extends StatelessWidget {
  const FeatureGraphic({super.key});

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return ColoredBox(
      color: Palette.sunken,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(72, 48, 56, 48),
        child: Row(
          children: [
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Wordmark(size: 56),
                  const SizedBox(height: 28),
                  Text(shortDescription, style: text.headlineSmall?.copyWith(color: Palette.ink, fontSize: 30, height: 1.25, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 12),
                  Text(approvalLine, style: text.titleMedium?.copyWith(color: Palette.muted, fontSize: 22)),
                ],
              ),
            ),
            const SizedBox(width: 24),
            const Bahi(mood: BahiMood.wave, size: 300),
          ],
        ),
      ),
    );
  }
}

void main() {
  Bahi.live = false;
  setUpAll(loadFonts);

  testWidgets('feature graphic, 1024 by 500', (tester) async {
    tester.view.physicalSize = const Size(1024, 500);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(debugShowCheckedModeBanner: false, theme: mycaTheme(), home: const FeatureGraphic()));
    final graphic = tester.element(find.byType(FeatureGraphic));
    await tester.runAsync(() => precacheImage(AssetImage('assets/mascot/${BahiMood.wave.name}.png', package: Bahi.package), graphic));
    await tester.pump();
    await savePlayImage(tester, 'feature-graphic', of: find.byType(FeatureGraphic));
  });

  testWidgets('phone screenshots, 1080 by 2160', (tester) async {
    await openBooks(tester);
    await shoot(tester, 'phone-01-home');

    await tester.tap(find.byTooltip('New entry'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('I sold something'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'guj');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Gujarat Weaves'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Amount before GST'), '8000');
    await tester.tap(find.widgetWithText(ActionChip, '18%'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Preview'));
    await shoot(tester, 'phone-02-sale-preview');
  });

  testWidgets('phone screenshots: customer and invoice', (tester) async {
    await openBooks(tester);
    await tapRow(tester, 'Sales');
    await tester.tap(find.text('Gujarat Weaves'));
    await shoot(tester, 'phone-03-customer');
    await tester.tap(find.text('Invoice INV-0002'));
    await shoot(tester, 'phone-04-invoice');
  });

  testWidgets('phone screenshots: taxes and the GST review', (tester) async {
    await openBooks(tester);
    await tester.tap(find.text('3 things need you'));
    await shoot(tester, 'phone-05-taxes');
    final review = find.text('Review the October 2026 return');
    await tester.scrollUntilVisible(review, 200, scrollable: find.byType(Scrollable).last);
    await tester.ensureVisible(review);
    await tester.pumpAndSettle();
    await tester.tap(review);
    await shoot(tester, 'phone-06-gst-review');
  });

  testWidgets('phone screenshots: reports and books check', (tester) async {
    await openBooks(tester);
    await tapRow(tester, 'Reports');
    await shoot(tester, 'phone-07-reports');
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tapRow(tester, 'Books check');
    await shoot(tester, 'phone-08-books-check');
  });
}
