import 'package:flutter/material.dart';

import '../api/models.dart';
import '../app_state.dart';
import '../marks.dart';
import '../theme.dart';
import '../widgets.dart';
import 'migration_flow.dart';

Future<void> showBusinessSheet(BuildContext context, Snapshot snapshot) {
  final navigator = Navigator.of(context);
  final state = AppScope.of(context);
  final company = snapshot.company;
  final user = snapshot.activeUser;
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) {
      final text = Theme.of(sheet).textTheme;
      return SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(company.name, style: text.headlineSmall),
              const SizedBox(height: 4),
              Text(
                company.gstin.isEmpty
                    ? 'Not registered for GST'
                    : 'GSTIN ${company.gstin}',
                style: text.bodyMedium,
              ),
              if (user != null)
                Text('Signed in as ${user.name}', style: text.bodyMedium),
              const SizedBox(height: 18),
                Material(
                  color: Palette.surface,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(radiusCard),
                    side: const BorderSide(color: Palette.line),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () {
                      navigator.pop();
                      navigator.push(
                        MaterialPageRoute<void>(
                          builder: (_) => MigrationFlow(
                            snapshot: snapshot,
                            bringMore: true,
                          ),
                        ),
                      );
                    },
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Row(
                        children: [
                          const TintTile(
                            tint: Tint.purchases,
                            mark: Mark.bringIn,
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Bring in more books',
                                  style: text.titleMedium,
                                ),
                                Text(
                                  'Tally, Zoho or a bank statement',
                                  style: text.bodyMedium,
                                ),
                              ],
                            ),
                          ),
                          const Chevron(),
                        ],
                      ),
                    ),
                  ),
                ),
              const SizedBox(height: 14),
              OutlinedButton(
                onPressed: () {
                  navigator.pop();
                  state.signOut();
                },
                child: const Text('Sign out'),
              ),
            ],
          ),
        ),
      );
    },
  );
}
