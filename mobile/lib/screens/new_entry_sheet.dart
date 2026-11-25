import 'package:flutter/material.dart';

import '../app_state.dart';
import '../india/india_strings.dart';
import '../marks.dart';
import '../registers.dart';
import '../theme.dart';
import '../uae/uae_edition.dart';
import '../uae/uae_strings.dart';
import '../widgets.dart';
import 'ask_screen.dart';
import 'bill_capture_screen.dart';
import 'counter_sale_screen.dart';
import 'expense_screen.dart';
import 'party_picker.dart';
import '../widgets/glass.dart';

Future<void> showNewEntrySheet(BuildContext context) {
  final navigator = Navigator.of(context);
  void go(Widget screen) {
    navigator.pop();
    navigator.push(MaterialPageRoute<void>(builder: (_) => screen));
  }

  void entry(RegisterKind kind) {
    navigator.pop();
    startEntry(context, kind);
  }

  final ae = uaeEdition(context);
  final s = UaeStrings.of(context);
  final scope = AppScope.of(context);
  final india = scope.edition == 'IN' && (scope.snapshot?.company.country ?? 'IN') == 'IN';
  return showMycaSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(6, 0, 0, 10),
              child: Text(
                s.whatHappened,
                style: Theme.of(sheet).textTheme.headlineSmall,
              ),
            ),
            _SheetRow(
              tint: Tint.sales,
              mark: Mark.sales,
              title: s.iSold,
              subtitle: s.iSoldSubtitle,
              onTap: () => entry(RegisterKind.sales),
            ),
            if (india)
            _SheetRow(
              tint: Tint.sales,
              mark: Mark.sales,
              title: inText(context, 'Counter sale'),
              subtitle: inText(context, 'Scan barcodes, bill at the counter and print a receipt'),
              onTap: () => go(const CounterSaleScreen()),
            ),
            _SheetRow(
              tint: Tint.purchases,
              mark: Mark.purchases,
              title: s.iBought,
              subtitle: s.iBoughtSubtitle,
              onTap: () => entry(RegisterKind.purchases),
            ),
            if (!ae)
            _SheetRow(
              tint: Tint.purchases,
              mark: Mark.comingUp,
              title: inText(context, 'Read a bill from a photo'),
              subtitle: inText(context, 'A photo, PDF or text of a supplier bill, previewed before it posts'),
              onTap: () => go(const BillCaptureScreen()),
            ),
            _SheetRow(
              tint: Tint.expense,
              mark: Mark.expense,
              title: s.iPaidExpense,
              subtitle: s.iPaidExpenseSubtitle,
              onTap: () => go(const ExpenseScreen()),
            ),
            _SheetRow(
              tint: Tint.ask,
              mark: Mark.ask,
              title: s.justAsk,
              subtitle: s.justAskSubtitle,
              onTap: () => go(const AskScreen()),
            ),
          ],
        ),
      ),
    ),
  );
}

class _SheetRow extends StatelessWidget {
  const _SheetRow({
    required this.tint,
    required this.mark,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final Tint tint;
  final Mark mark;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
        child: Row(
          children: [
            TintTile(tint: tint, mark: mark),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.titleMedium),
                  Text(subtitle, style: Theme.of(context).textTheme.bodyMedium),
                ],
              ),
            ),
            const Chevron(),
          ],
        ),
      ),
    );
  }
}
