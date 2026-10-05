import 'package:flutter/material.dart';

import '../app_state.dart';
import '../brand.dart';
import '../marks.dart';
import '../theme.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  static const _points = [
    (Mark.sales, 'Log a sale the way you would send a message'),
    (Mark.taxes, 'GST and due dates worked out for you'),
    (Mark.confirm, 'Nothing reaches your books until you say so'),
  ];

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Wordmark(),
              const Spacer(flex: 3),
              Text(
                'Your books,\nkept as easily\nas a conversation.',
                style: text.displaySmall,
              ),
              const SizedBox(height: 14),
              Text(
                'Sales, purchases and GST for your business, kept right without the paperwork.',
                style: text.bodyLarge?.copyWith(color: Palette.muted),
              ),
              const SizedBox(height: 28),
              const Divider(),
              for (final (mark, line) in _points) ...[
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
                  onPressed: AppScope.of(context).finishWelcome,
                  child: const Text('Get started'),
                ),
              ),
              const SizedBox(height: 12),
              Center(
                child: Text(
                  'About two minutes to set up',
                  style: text.bodySmall,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
