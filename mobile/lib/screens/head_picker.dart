import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../theme.dart';
import '../uae/uae_strings.dart';

Future<ExpenseHead?> showHeadPicker(
  BuildContext context, {
  String? current,
  String? title,
}) async {
  final api = AppScope.of(context).api;
  List<ExpenseHead> heads;
  try {
    heads = expenseHeadsFrom(await api.query('expense_heads'));
  } on MycaApiException {
    heads = const [];
  }
  if (!context.mounted) return null;
  return showModalBottomSheet<ExpenseHead>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) {
      final text = Theme.of(sheet).textTheme;
      final s = UaeStrings.of(sheet);
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(22, 4, 22, 22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title ?? s.whichHead, style: text.headlineSmall),
              const SizedBox(height: 6),
              Text(
                heads.isEmpty
                    ? s.headsNotLoaded
                    : s.headsRemembered,
                style: text.bodySmall,
              ),
              const SizedBox(height: 14),
              Flexible(
                child: SingleChildScrollView(
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final head in heads)
                        ChoiceChip(
                          label: Text(s.accountName(head.name)),
                          selected: head.code == current,
                          selectedColor: Palette.sunken,
                          showCheckmark: false,
                          onSelected: (_) => Navigator.of(sheet).pop(head),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}
