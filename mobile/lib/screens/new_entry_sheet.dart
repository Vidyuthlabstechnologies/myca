import 'package:flutter/material.dart';

import '../marks.dart';
import '../registers.dart';
import '../theme.dart';
import '../uae/uae_edition.dart';
import '../widgets.dart';
import 'ask_screen.dart';
import 'bill_capture_screen.dart';
import 'expense_screen.dart';
import 'party_picker.dart';

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
  return showModalBottomSheet<void>(
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
                'What happened?',
                style: Theme.of(sheet).textTheme.headlineSmall,
              ),
            ),
            _SheetRow(
              tint: Tint.sales,
              mark: Mark.sales,
              title: 'I sold something',
              subtitle: 'Raise an invoice for a customer',
              onTap: () => entry(RegisterKind.sales),
            ),
            _SheetRow(
              tint: Tint.purchases,
              mark: Mark.purchases,
              title: 'I bought something',
              subtitle: 'Add a supplier bill',
              onTap: () => entry(RegisterKind.purchases),
            ),
            if (!ae)
            _SheetRow(
              tint: Tint.purchases,
              mark: Mark.comingUp,
              title: 'Read a bill from a photo',
              subtitle: 'A photo, PDF or text of a supplier bill, previewed before it posts',
              onTap: () => go(const BillCaptureScreen()),
            ),
            _SheetRow(
              tint: Tint.expense,
              mark: Mark.expense,
              title: 'I paid an expense',
              subtitle: 'Rent, fuel, anything without a supplier bill',
              onTap: () => go(const ExpenseScreen()),
            ),
            _SheetRow(
              tint: Tint.ask,
              mark: Mark.ask,
              title: 'Just ask',
              subtitle: 'Type anything, MyCA will sort it',
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
