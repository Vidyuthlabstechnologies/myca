import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:myca_design/myca_design.dart';

double _luminance(Color c) => c.computeLuminance();

double contrast(Color a, Color b) {
  final x = _luminance(a);
  final y = _luminance(b);
  final hi = x > y ? x : y;
  final lo = x > y ? y : x;
  return (hi + 0.05) / (lo + 0.05);
}

void main() {
  setUpAll(MycaFormat.ensureInitialized);

  test('India keeps the palette the app ships today', () {
    final p = MycaPalette.of(MycaCountry.of('IN'), Brightness.light);
    expect(p.canvas, const Color(0xFFFAFAF7));
    expect(p.surface, const Color(0xFFFFFFFF));
    expect(p.sunken, const Color(0xFFF2F1EC));
    expect(p.ink, const Color(0xFF15181B));
    expect(p.muted, const Color(0xFF6C7075));
    expect(p.faint, const Color(0xFF9A9DA1));
    expect(p.line, const Color(0xFFE6E4DE));
    expect(p.accent, const Color(0xFF1B5E3F));
    expect(p.accentSoft, const Color(0xFFEAF2ED));
    expect(p.warn, const Color(0xFF94570A));
    expect(p.danger, const Color(0xFFB3261E));
  });

  test('every country accent reads at WCAG AA on its surfaces in both themes', () {
    for (final country in MycaCountry.all) {
      for (final brightness in Brightness.values) {
        final p = MycaPalette.of(country, brightness);
        expect(contrast(p.accent, p.surface), greaterThanOrEqualTo(4.5), reason: '${country.code} $brightness accent on surface');
        expect(contrast(p.accent, p.canvas), greaterThanOrEqualTo(4.5), reason: '${country.code} $brightness accent on canvas');
        expect(contrast(p.accent, p.accentSoft), greaterThanOrEqualTo(4.5), reason: '${country.code} $brightness accent on its tint');
        expect(contrast(p.ink, p.canvas), greaterThanOrEqualTo(7), reason: '${country.code} $brightness ink on canvas');
        expect(contrast(p.muted, p.surface), greaterThanOrEqualTo(4.5), reason: '${country.code} $brightness muted on surface');
        expect(contrast(p.warn, p.warnSoft), greaterThanOrEqualTo(4.5), reason: '${country.code} $brightness warn');
        expect(contrast(p.danger, p.dangerSoft), greaterThanOrEqualTo(4.5), reason: '${country.code} $brightness danger');
      }
    }
  });

  test('money follows each country', () {
    String money(String code, num amount, [Locale? locale]) => MycaFormat(MycaCountry.of(code), locale).money(amount);
    expect(money('IN', 1234567.5), '₹12,34,567.50');
    expect(money('IN', -99), '-₹99.00');
    expect(money('US', 1234567.5), r'$1,234,567.50');
    expect(money('MY', 1234567.5), 'RM 1,234,567.50');
    expect(money('GB', 1234.5), '£1,234.50');
    expect(money('AE', 1234.5), 'AED 1,234.50');
    expect(money('AU', 1234.5), r'$1,234.50');
    expect(MycaFormat(MycaCountry.of('IN')).moneyMinor(1050), '₹10.50');
  });

  test('dates follow each country', () {
    final day = DateTime(2026, 11, 11);
    String date(String code, MycaDateStyle style, [Locale? locale]) => MycaFormat(MycaCountry.of(code), locale).date(day, style: style);
    expect(date('IN', MycaDateStyle.medium), '11 Nov 2026');
    expect(date('US', MycaDateStyle.medium), 'Nov 11, 2026');
    expect(date('US', MycaDateStyle.short), '11/11/2026');
    expect(date('MY', MycaDateStyle.medium), '11 Nov 2026');
    expect(date('MY', MycaDateStyle.long, const Locale('ms')), '11 November 2026');
    expect(date('GB', MycaDateStyle.short), '11/11/2026');
    expect(date('AE', MycaDateStyle.medium), '11 Nov 2026');
    expect(MycaFormat(MycaCountry.of('US')).isoDate('2026-02-03', style: MycaDateStyle.short), '02/03/2026');
    expect(MycaFormat(MycaCountry.of('IN')).isoDate('2026-02-03', style: MycaDateStyle.short), '03/02/2026');
    expect(MycaFormat(MycaCountry.of('IN')).isoDate('not a date'), 'not a date');
  });

  test('tax years start where each country says', () {
    final india = MycaCountry.of('IN');
    expect(india.taxYearStarting(DateTime(2026, 3, 31)), 2025);
    expect(india.taxYearStarting(DateTime(2026, 4, 1)), 2026);
    expect(india.yearLabel(2026), 'Financial year 2026-27');
    expect(MycaCountry.of('US').yearLabel(2026), 'Calendar year 2026');
    expect(MycaCountry.of('GB').taxYearStarting(DateTime(2026, 4, 5)), 2025);
    expect(MycaCountry.of('AU').yearLabel(2026), 'Financial year 2026-27');
  });

  test('flavors, locales and direction', () {
    expect(MycaCountry.forFlavor('my')?.code, 'MY');
    expect(MycaCountry.forFlavor('india')?.code, 'IN');
    expect(MycaCountry.forFlavor('nope'), isNull);
    expect(MycaCountry.of('zz').code, 'IN');
    expect(MycaCountry.of('MY').resolve(const Locale('ms')), const Locale('ms', 'MY'));
    expect(MycaCountry.of('MY').resolve(const Locale('fr')), const Locale('en', 'MY'));
    expect(MycaCountry.directionOf(const Locale('ar', 'AE')), TextDirection.rtl);
    expect(MycaCountry.directionOf(const Locale('en', 'AE')), TextDirection.ltr);
    expect(MycaDesign(MycaCountry.of('AE')).fontFallback, ['packages/myca_fonts_arabic/Noto Sans Arabic']);
    expect(MycaDesign(MycaCountry.of('US')).fontFallback, isEmpty);
  });

  testWidgets('every country builds a light and dark theme and renders shared parts', (tester) async {
    Bahi.live = false;
    for (final country in MycaCountry.all) {
      final design = MycaDesign(country);
      for (final theme in [design.light, design.dark]) {
        await tester.pumpWidget(MaterialApp(
          theme: theme,
          localizationsDelegates: MycaDesign.localizationsDelegates,
          supportedLocales: design.supportedLocales,
          locale: design.supportedLocales.last,
          home: Builder(builder: (context) {
            final l = MycaLocalizations.of(context);
            return Scaffold(
              body: ListView(children: [
                const Wordmark(showCountry: true),
                MycaSectionLabel(l.balance),
                MycaPanel(children: [
                  MycaAmountRow(start: Text(l.moneyIn), amount: const MycaMoney(1250.5)),
                  MycaAmountRow(start: Text(l.moneyOut), amount: const MycaMoney(-80, signed: true)),
                ]),
                MycaStatusTag(text: l.statusOverdue, tone: MycaTone.danger, filled: true),
                MycaNotice(text: l.approvalPromise),
                Text(l.taxDueOn(country.facts.taxName, '20 Nov')),
                BahiNote(text: l.nothingYet, mood: BahiMood.wave),
                const MycaChevron(),
              ]),
            );
          }),
        ));
        await tester.pump(const Duration(milliseconds: 300));
        expect(tester.takeException(), isNull, reason: country.code);
        expect(theme.extension<MycaCountryTheme>()?.country.code, country.code);
      }
    }
  });

  testWidgets('Arabic lays out right to left', (tester) async {
    Bahi.live = false;
    final design = MycaDesign(MycaCountry.of('AE'));
    late TextDirection seen;
    await tester.pumpWidget(MaterialApp(
      theme: design.light,
      localizationsDelegates: MycaDesign.localizationsDelegates,
      supportedLocales: design.supportedLocales,
      locale: const Locale('ar', 'AE'),
      home: Builder(builder: (context) {
        seen = Directionality.of(context);
        return Text(MycaLocalizations.of(context).actionContinue);
      }),
    ));
    await tester.pumpAndSettle();
    expect(seen, TextDirection.rtl);
    expect(find.text('متابعة'), findsOneWidget);
  });
}
