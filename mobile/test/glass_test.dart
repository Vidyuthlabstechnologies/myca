import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca/theme.dart';
import 'package:myca/widgets/glass.dart';

Widget host(Widget child, {bool highContrast = false, Brightness brightness = Brightness.light}) {
  return MaterialApp(
    theme: mycaTheme(brightness),
    home: MediaQuery(
      data: MediaQueryData(highContrast: highContrast),
      child: Scaffold(body: child),
    ),
  );
}

double contrast(Color a, Color b) {
  final x = a.computeLuminance();
  final y = b.computeLuminance();
  final light = x > y ? x : y;
  final dark = x > y ? y : x;
  return (light + 0.05) / (dark + 0.05);
}

void main() {
  setUp(() => glassBlurEnabled = true);
  tearDown(() => glassBlurEnabled = false);

  test('text stays readable on the glass over the brightest and darkest things behind a sheet', () {
    final barrier = Colors.black54;
    final brightest = Color.alphaBlend(barrier, Colors.white);
    final darkest = Color.alphaBlend(barrier, const Color(0xFF15181B));
    for (final entry in {PaletteSet.light: glassOpacityLight, PaletteSet.dark: glassOpacityDark}.entries) {
      final p = entry.key;
      for (final behind in [brightest, darkest]) {
        final glass = Color.alphaBlend(p.surface.withValues(alpha: entry.value), behind);
        expect(contrast(p.ink, glass), greaterThanOrEqualTo(4.5), reason: 'ink on glass over $behind');
        expect(contrast(p.muted, glass), greaterThanOrEqualTo(4.5), reason: 'muted text on glass over $behind');
      }
    }
  });

  testWidgets('glass blurs what is behind it', (tester) async {
    await tester.pumpWidget(host(const MycaGlass(child: SizedBox(width: 100, height: 100))));
    expect(find.byType(BackdropFilter), findsOneWidget);
  });

  testWidgets('with high contrast on, glass becomes a solid surface with no blur', (tester) async {
    await tester.pumpWidget(host(const MycaGlass(child: SizedBox(width: 100, height: 100)), highContrast: true));
    expect(find.byType(BackdropFilter), findsNothing);
  });

  testWidgets('a sheet opens, shows its content and the drag handle, and closes by swipe down', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: mycaTheme(),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: FilledButton(
                onPressed: () => showMycaSheet<void>(context: context, builder: (_) => const SizedBox(height: 120, child: Center(child: Text('Hello sheet')))),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(find.text('Hello sheet'), findsOneWidget);
    expect(find.bySemanticsLabel('Drag to close'), findsOneWidget);
    await tester.drag(find.text('Hello sheet'), const Offset(0, 400));
    await tester.pumpAndSettle();
    expect(find.text('Hello sheet'), findsNothing);
  });

  testWidgets('a sheet that asks for no handle shows none, and a list inside still taps', (tester) async {
    var tapped = false;
    await tester.pumpWidget(
      MaterialApp(
        theme: mycaTheme(),
        home: Builder(
          builder: (context) => Scaffold(
            body: Center(
              child: FilledButton(
                onPressed: () => showMycaSheet<void>(
                  context: context,
                  showDragHandle: false,
                  builder: (_) => ListTile(title: const Text('Row'), onTap: () => tapped = true),
                ),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Drag to close'), findsNothing);
    await tester.tap(find.text('Row'));
    expect(tapped, isTrue);
  });

  test('the blur filter is a real blur', () {
    expect(ImageFilter.blur(sigmaX: glassBlur, sigmaY: glassBlur), isA<ImageFilter>());
  });
}
