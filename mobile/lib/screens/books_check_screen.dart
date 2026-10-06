import 'package:flutter/material.dart';

import '../api/models.dart';
import '../app_state.dart';
import '../format.dart';
import '../marks.dart';
import '../registers.dart';
import '../theme.dart';
import '../widgets.dart';
import 'business_sheet.dart';
import 'register_screen.dart';
import 'taxes_screen.dart';

class BooksCheckScreen extends StatefulWidget {
  const BooksCheckScreen({super.key});

  @override
  State<BooksCheckScreen> createState() => _BooksCheckScreenState();
}

class _BooksCheckScreenState extends State<BooksCheckScreen> {
  Future<BooksCheck?>? _check;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _check ??= _load();
  }

  Future<BooksCheck?> _load() async =>
      BooksCheck.fromTool(await AppScope.of(context).api.query('books_check'));

  Future<void> _reload() async {
    final next = _load();
    setState(() {
      _check = next;
    });
    await next;
  }

  void _open(CheckFinding finding) {
    final snapshot = AppScope.of(context).snapshot;
    final Widget? screen = switch (finding.action) {
      'taxes' => const TaxesScreen(),
      'sales' => const RegisterScreen(kind: RegisterKind.sales),
      'purchases' => const RegisterScreen(kind: RegisterKind.purchases),
      _ => null,
    };
    if (screen != null) {
      Navigator.of(
        context,
      ).push(MaterialPageRoute<void>(builder: (_) => screen));
    } else if (finding.action == 'business' && snapshot != null) {
      showBusinessSheet(context, snapshot);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Your books check')),
      body: FutureBuilder<BooksCheck?>(
        future: _check,
        builder: (context, state) {
          if (state.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final check = state.data;
          if (check == null) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('The check could not be run.'),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _reload,
                    child: const Text('Try again'),
                  ),
                ],
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
              children: [
                Text(
                  'AS OF ${longDate(check.asOfDate).toUpperCase()}',
                  style: text.labelSmall,
                ),
                const SizedBox(height: 4),
                Text(check.headline, style: text.headlineSmall),
                const SizedBox(height: 4),
                Text(
                  'Everything below is worked out from your books. Nothing has been changed or filed.',
                  style: text.bodyMedium,
                ),
                const SizedBox(height: 18),
                Panel(
                  children: [
                    for (final finding in check.findings)
                      RowCard(
                        leading: TintTile(
                          tint: switch (finding.severity) {
                            'act' => Tint.urgent,
                            'check' => Tint.taxes,
                            _ => Tint.sales,
                          },
                          mark: switch (finding.severity) {
                            'act' => Mark.urgent,
                            'check' => Mark.dueSoon,
                            _ => Mark.confirm,
                          },
                        ),
                        title: finding.title,
                        subtitle: finding.detail,
                        trailing:
                            finding.action.isEmpty ||
                                finding.action == 'migrate'
                            ? null
                            : const Chevron(),
                        onTap:
                            finding.action.isEmpty ||
                                finding.action == 'migrate'
                            ? null
                            : () => _open(finding),
                      ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
