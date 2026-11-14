import 'package:flutter/material.dart';

import '../api/models.dart';
import '../cloud/cloud_session.dart';
import '../app_state.dart';
import '../marks.dart';
import '../theme.dart';
import '../uae/uae_edition.dart';
import '../uae/uae_emirates.dart';
import '../uae/uae_strings.dart';
import '../uk/uk_plan_screen.dart';
import '../widgets.dart';
import 'businesses_screen.dart';
import 'connections_screen.dart';
import 'connectors_screen.dart';
import 'invite_screen.dart';
import 'migration_flow.dart';
import 'people_screen.dart';
import 'plan_screen.dart';
import 'security_screen.dart';

Future<void> showBusinessSheet(BuildContext context, Snapshot snapshot) {
  final navigator = Navigator.of(context);
  final state = AppScope.of(context);
  final company = snapshot.company;
  final user = snapshot.activeUser;
  final ae = uaeEdition(context) ? UaeStrings.of(context) : null;
  final aeTrn = '${uaeProfile.value?['trn'] ?? ''}';
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) {
      final text = Theme.of(sheet).textTheme;
      final s = UaeStrings.of(sheet);
      return SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(company.name, style: text.headlineSmall),
              const SizedBox(height: 4),
              if (ae == null && state.edition != 'GB')
                Text(
                  company.gstin.isEmpty
                      ? 'Not registered for GST'
                      : 'GSTIN ${company.gstin}',
                  style: text.bodyMedium,
                )
              else if (ae != null && aeTrn.isNotEmpty)
                Text(ae.trnOf(aeTrn), style: text.bodyMedium),
              if (user != null)
                Text(s.signedInAs(user.name), style: text.bodyMedium),
              const SizedBox(height: 18),
              if (state.cloud != null) ...[
                if (user?.role != 'accountant') ...[
                  _BriefSwitch(cloud: state.cloud!),
                  const SizedBox(height: 12),
                ],
                Panel(
                  children: [
                    RowCard(
                      leading: const TintTile(tint: Tint.ask, mark: Mark.people),
                      title: s.people,
                      subtitle: s.peopleSubtitle,
                      trailing: const Chevron(),
                      onTap: () {
                        navigator.pop();
                        navigator.push(MaterialPageRoute<void>(builder: (_) => const PeopleScreen()));
                      },
                    ),
                    if (ae == null)
                    RowCard(
                      leading: const TintTile(tint: Tint.ask, mark: Mark.confirm),
                      title: 'Plan and billing',
                      subtitle: 'Your plan, trial and what it includes',
                      trailing: const Chevron(),
                      onTap: () {
                        navigator.pop();
                        navigator.push(MaterialPageRoute<void>(builder: (_) => state.edition == 'GB' ? const UkPlanScreen() : const PlanScreen()));
                      },
                    ),
                    RowCard(
                      leading: const TintTile(tint: Tint.ask, mark: Mark.people),
                      title: s.inviteOwner,
                      subtitle: s.inviteOwnerSubtitle,
                      trailing: const Chevron(),
                      onTap: () {
                        navigator.pop();
                        navigator.push(MaterialPageRoute<void>(builder: (_) => const InviteScreen()));
                      },
                    ),
                    RowCard(
                      leading: const TintTile(tint: Tint.ask, mark: Mark.confirm),
                      title: s.security,
                      subtitle: s.securitySubtitle,
                      trailing: const Chevron(),
                      onTap: () {
                        navigator.pop();
                        navigator.push(MaterialPageRoute<void>(builder: (_) => const SecurityScreen()));
                      },
                    ),
                    if (user?.role == 'owner')
                      RowCard(
                        leading: const TintTile(tint: Tint.ask, mark: Mark.otherApp),
                        title: s.connections,
                        subtitle: s.connectionsSubtitle,
                        trailing: const Chevron(),
                        onTap: () {
                          navigator.pop();
                          navigator.push(MaterialPageRoute<void>(builder: (_) => const ConnectionsScreen()));
                        },
                      ),
                    if (user?.role == 'owner' && ae == null && state.edition != 'GB')
                      RowCard(
                        leading: const TintTile(tint: Tint.ask, mark: Mark.cloudBooks),
                        title: 'Connections to banks and apps',
                        subtitle: company.country == 'US' ? 'Plaid, TaxJar, Gusto and Track1099' : 'Amazon, Shopify, Razorpay and Zoho',
                        trailing: const Chevron(),
                        onTap: () {
                          navigator.pop();
                          navigator.push(MaterialPageRoute<void>(builder: (_) => const ConnectorsScreen()));
                        },
                      ),
                    RowCard(
                      leading: const TintTile(tint: Tint.ask, mark: Mark.switchBooks),
                      title: s.yourBusinesses,
                      subtitle: s.yourBusinessesSubtitle,
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
                    s.setScreenLock,
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
                                  s.bringInMore,
                                  style: text.titleMedium,
                                ),
                                Text(
                                  s.bringInMoreSubtitle,
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
                child: Text(s.signOut),
              ),
            ],
          ),
        ),
      );
    },
  );
}

class _BriefSwitch extends StatefulWidget {
  const _BriefSwitch({required this.cloud});

  final CloudSession cloud;

  @override
  State<_BriefSwitch> createState() => _BriefSwitchState();
}

class _BriefSwitchState extends State<_BriefSwitch> {
  bool? _on;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    widget.cloud.weeklyBrief().then((on) {
      if (mounted) setState(() => _on = on);
    }).catchError((_) {
      if (mounted) setState(() => _on = false);
    });
  }

  Future<void> _set(bool on) async {
    setState(() => _busy = true);
    try {
      final now = await widget.cloud.setWeeklyBrief(on);
      if (mounted) setState(() => _on = now);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.maybeOf(context)?.showSnackBar(
          SnackBar(content: Text(UaeStrings.of(context).briefFailed)),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = UaeStrings.of(context);
    return Material(
      color: Palette.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radiusCard),
        side: const BorderSide(color: Palette.line),
      ),
      child: SwitchListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14),
        title: Text(
          s.mondayBrief,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        subtitle: Text(s.mondayBriefSubtitle),
        value: _on ?? false,
        activeTrackColor: Palette.ink,
        onChanged: _on == null || _busy ? null : _set,
      ),
    );
  }
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
          UaeStrings.of(context).crashReports,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        subtitle: Text(
          uaeEdition(context)
              ? UaeStrings.of(context).crashReportsAe
              : 'Only what went wrong in the app. Names, amounts, GSTINs and phone numbers are removed before it leaves the phone.',
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
        title: Text(UaeStrings.of(context).appLock, style: Theme.of(context).textTheme.titleMedium),
        subtitle: Text(UaeStrings.of(context).appLockSubtitle),
        value: state.lockEnabled,
        activeTrackColor: Palette.ink,
        onChanged: (enabled) => state.setLockEnabled(enabled),
      ),
    );
  }
}
