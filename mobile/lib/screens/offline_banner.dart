import 'package:flutter/material.dart';

import '../india/india_strings.dart';
import '../offline/offline_billing.dart';
import 'offline_bills_screen.dart';

class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key, required this.offline});

  final OfflineBilling offline;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: offline,
    builder: (context, _) {
      final waiting = offline.waitingCount;
      final needs = offline.needsYouCount;
      if (offline.online != false && waiting == 0 && needs == 0) return const SizedBox.shrink();
      final scheme = Theme.of(context).colorScheme;
      final words = [
        if (offline.online == false) inText(context, 'No connection. You can keep billing; bills are saved on this phone.'),
        if (waiting > 0) waiting == 1 ? '1 entry waiting to sync.' : '$waiting entries waiting to sync.',
        if (needs > 0) needs == 1 ? '1 offline entry needs you.' : '$needs offline entries need you.',
      ].join(' ');
      return Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Material(
          color: needs > 0 ? scheme.errorContainer : scheme.secondaryContainer,
          borderRadius: BorderRadius.circular(12),
          child: ListTile(
            key: const Key('offline-banner'),
            leading: Icon(offline.online == false ? Icons.cloud_off_outlined : Icons.cloud_sync_outlined),
            title: Text(words),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const OfflineBillsScreen())),
          ),
        ),
      );
    },
  );
}
