import 'package:flutter/material.dart';
import 'package:myca_design/myca_design.dart' show Bahi, MycaThemeContext, Wordmark;

import '../../app_state.dart';
import '../../my/my_strings.dart';
import '../../tour/tour.dart';
import 'my_widgets.dart';

class MyWelcomeScreen extends StatelessWidget {
  const MyWelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    final text = Theme.of(context).textTheme;
    final state = AppScope.of(context);
    final tour = TourScope.maybeOf(context);
    final palette = context.myca;
    final points = [
      (Icons.receipt_long_outlined, t.welcomePointEinvoice),
      (Icons.event_available_outlined, t.welcomePointSst),
      (Icons.calculate_outlined, t.welcomePointTax),
      (Icons.verified_user_outlined, t.welcomePointConfirm),
    ];
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
          children: [
            Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Expanded(child: Align(alignment: Alignment.centerLeft, child: FittedBox(fit: BoxFit.scaleDown, child: Wordmark(showCountry: true)))),
                        const MyLanguageButton(),
                      ],
                    ),
                    const SizedBox(height: 20),
                    const Bahi(size: 96),
                    const SizedBox(height: 12),
                    Text(t.welcomeTitle, style: text.displaySmall),
                    const SizedBox(height: 14),
                    Text(t.welcomeBody, style: text.bodyLarge?.copyWith(color: palette.muted)),
                    const SizedBox(height: 24),
                    const Divider(),
                    for (final (icon, line) in points) ...[
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(icon, size: 22, color: palette.accent),
                            const SizedBox(width: 16),
                            Expanded(child: Text(line, style: text.bodyLarge)),
                          ],
                        ),
                      ),
                      const Divider(),
                    ],
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(key: const Key('my.getStarted'), onPressed: state.finishWelcome, child: Text(t.getStarted)),
                    ),
                    if (tour != null) ...[
                      const SizedBox(height: 10),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(key: const Key('my.trySandbox'), onPressed: () => tour.startSandbox(country: 'MY', languageChoice: state.languageChoice), child: Text(t.trySandbox, textAlign: TextAlign.center)),
                      ),
                    ],
                    const SizedBox(height: 12),
                    Center(child: Text(t.setupTime, textAlign: TextAlign.center, style: text.bodySmall)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
