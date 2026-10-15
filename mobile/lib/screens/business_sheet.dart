import 'package:flutter/material.dart';

import '../api/models.dart';
import '../app_state.dart';
import '../marks.dart';
import '../theme.dart';
import '../widgets.dart';
import 'businesses_screen.dart';
import 'connections_screen.dart';
import 'migration_flow.dart';
import 'people_screen.dart';

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
              if (state.cloud != null) ...[
                Panel(
                  children: [
                    RowCard(
                      leading: const TintTile(tint: Tint.ask, mark: Mark.people),
                      title: 'People',
                      subtitle: 'Who can work in these books',
                      trailing: const Chevron(),
                      onTap: () {
                        navigator.pop();
                        navigator.push(MaterialPageRoute<void>(builder: (_) => const PeopleScreen()));
                      },
                    ),
                    if (user?.role == 'owner')
                      RowCard(
                        leading: const TintTile(tint: Tint.ask, mark: Mark.otherApp),
                        title: 'Connections',
                        subtitle: 'A POS or an inbox that feeds these books',
                        trailing: const Chevron(),
                        onTap: () {
                          navigator.pop();
                          navigator.push(MaterialPageRoute<void>(builder: (_) => const ConnectionsScreen()));
                        },
                      ),
                    RowCard(
                      leading: const TintTile(tint: Tint.ask, mark: Mark.switchBooks),
                      title: 'Your businesses',
                      subtitle: 'Switch business or answer an invitation',
                      trailing: const Chevron(),
                      onTap: () {
                        navigator.pop();
                        navigator.push(MaterialPageRoute<void>(builder: (_) => const BusinessesScreen()));
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 12),
              ],
              if (state.cloud != null && state.crashes != null)
                _CrashSwitch(state: state),
              if (state.lockAvailable)
                _LockSwitch(state: state)
              else if (state.cloud != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    'Set a screen lock on this phone to protect MyCA with it.',
                    style: text.bodyMedium,
                  ),
                ),
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

class _CrashSwitch extends StatelessWidget {
  const _CrashSwitch({required this.state});

  final AppState state;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: state,
      builder: (context, _) => SwitchListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 4),
        title: Text(
          'Send crash reports',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        subtitle: const Text(
          'Only what went wrong in the app. Names, amounts, GSTINs and phone numbers are removed before it leaves the phone.',
        ),
        value: state.crashReportsOn,
        activeTrackColor: Palette.ink,
        onChanged: (enabled) => state.setCrashReports(enabled),
      ),
    );
  }
}

class _LockSwitch extends StatelessWidget {
  const _LockSwitch({required this.state});

  final AppState state;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: state,
      builder: (context, _) => SwitchListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 4),
        title: Text('App lock', style: Theme.of(context).textTheme.titleMedium),
        subtitle: const Text('Ask for your fingerprint, face or screen lock to open MyCA'),
        value: state.lockEnabled,
        activeTrackColor: Palette.ink,
        onChanged: (enabled) => state.setLockEnabled(enabled),
      ),
    );
  }
}
