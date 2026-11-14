import 'package:flutter/material.dart';
import 'package:myca_design/myca_design.dart' show Bahi;

import '../app_state.dart';
import '../brand.dart';
import '../marks.dart';
import '../theme.dart';
import '../tour/tour.dart';
import '../uae/uae_strings.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  static const _points = [
    (Mark.sales, 'Log a sale the way you would send a message'),
    (Mark.taxes, 'GST and due dates worked out for you'),
    (Mark.confirm, 'Nothing reaches your books until you say so'),
  ];

  static const _usPoints = [
    (Mark.taxes, 'Snap your W-2 and 1099s, and we read them for you'),
    (Mark.sales, 'Plain questions instead of IRS forms'),
    (Mark.confirm, 'Review every line, then sign and e-file with the IRS'),
  ];

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final state = AppScope.of(context);
    final us = state.edition == 'US';
    final ae = state.edition == 'AE' ? UaeStrings.of(context) : null;
    final points = us
        ? _usPoints
        : ae != null
        ? [(Mark.sales, ae.welcomeSale), (Mark.taxes, ae.welcomeTaxes), (Mark.confirm, ae.welcomeConfirm)]
        : _points;
    final tour = us || ae != null ? null : TourScope.maybeOf(context);
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, box) => SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: box.maxHeight - 44),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 520),
                  child: IntrinsicHeight(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Wordmark(),
                        const Spacer(flex: 2),
                        const Align(
                          alignment: Alignment.centerLeft,
                          child: Bahi(size: 112),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          us ? 'Your taxes,\ndone as easily\nas a conversation.' : ae?.welcomeTitle ?? 'Your books,\nkept as easily\nas a conversation.',
                          style: text.displaySmall,
                        ),
                        const SizedBox(height: 14),
                        Text(
                          us
                              ? 'Your federal return, Form 1040, prepared from your forms and your answers, and e-filed with the IRS.'
                              : ae?.welcomeLine ?? 'Sales, purchases and GST for your business, kept right without the paperwork.',
                          style: text.bodyLarge?.copyWith(color: Palette.muted),
                        ),
                        const SizedBox(height: 28),
                        const Divider(),
                        for (final (mark, line) in points) ...[
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            child: Row(
                              children: [
                                MarkIcon(mark: mark, size: 22),
                                const SizedBox(width: 16),
                                Expanded(child: Text(line, style: text.bodyLarge)),
                              ],
                            ),
                          ),
                          const Divider(),
                        ],
                        const Spacer(flex: 2),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            onPressed: state.finishWelcome,
                            child: Text(ae?.getStarted ?? 'Get started'),
                          ),
                        ),
                        if (tour != null) ...[
                          const SizedBox(height: 10),
                          SizedBox(
                            width: double.infinity,
                            child: OutlinedButton(
                              onPressed: tour.start,
                              child: const Text('Take a 2-minute tour first'),
                            ),
                          ),
                        ],
                        const SizedBox(height: 12),
                        Center(
                          child: Text(
                            us ? 'Most returns take about 20 minutes' : ae?.setupMinutes ?? 'About two minutes to set up',
                            style: text.bodySmall,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
