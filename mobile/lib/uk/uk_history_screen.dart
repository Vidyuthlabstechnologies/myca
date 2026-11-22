import 'package:flutter/material.dart';

import '../api/models.dart';
import '../app_state.dart';
import '../format.dart';
import '../marks.dart';
import '../theme.dart';
import '../widgets.dart';
import 'uk_common.dart';

const historyKinds = <(String, String)>[
  ('all', 'Everything'),
  ('vat', 'VAT returns'),
  ('itsa-update', 'Quarterly updates'),
  ('final-declaration', 'Final declarations'),
];

String historyTitle(Map<String, dynamic> row) => switch (ukText(row['kind'])) {
  'vat' => 'VAT return ${ukText(row['period'])}',
  'itsa-update' => 'Quarterly update ${gbDatesIn(ukText(row['period']))}',
  'final-declaration' => ukText(row['type']) == 'confirm-amendment' ? 'Amended return ${ukText(row['period'])}' : 'Final declaration ${ukText(row['period'])}',
  _ => 'Sent to HMRC',
};

String historySubtitle(Map<String, dynamic> row) => [
  if (ukText(row['at']).isNotEmpty) 'Sent ${gbDay(ukText(row['at']))}',
  if (ukText(row['declaredBy']) == 'agent') 'by the agent',
  if (hmrcEnvironmentLabel(ukText(row['environment'])).isNotEmpty) 'to ${hmrcEnvironmentLabel(ukText(row['environment']))}',
  if (ukText(row['reference']).isNotEmpty) 'reference ${ukText(row['reference'])}',
].join(', ');

class UkHistoryScreen extends StatefulWidget {
  const UkHistoryScreen({super.key});

  @override
  State<UkHistoryScreen> createState() => _UkHistoryScreenState();
}

class _UkHistoryScreenState extends State<UkHistoryScreen> {
  String _kind = 'all';
  Future<Object?>? _history;

  Future<Object?> _load() => ukQuery(AppScope.of(context).api, 'gb_hmrc_history', {if (_kind != 'all') 'kind': _kind});

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _history ??= _load();
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Sent to HMRC')),
      body: ListView(
        padding: ukPagePadding,
        children: [
          DropdownButtonFormField<String>(
            key: const Key('uk.history.kind'),
            initialValue: _kind,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Show'),
            items: [for (final k in historyKinds) DropdownMenuItem(value: k.$1, child: Text(k.$2, overflow: TextOverflow.ellipsis))],
            onChanged: (v) => setState(() {
              _kind = v ?? _kind;
              _history = _load();
            }),
          ),
          const SizedBox(height: 16),
          FutureBuilder<Object?>(
            future: _history,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) return const UkCard(children: [LinearProgressIndicator()]);
              if (!ukOk(snap.data)) return UkCard(children: [UkNote(ukErrorWords(snap.data, fallback: 'The history could not be loaded.'), warn: true)]);
              final rows = ukMaps(toolData(snap.data)['submissions']);
              if (rows.isEmpty) return const UkCard(key: Key('uk.history.empty'), children: [UkNote('Nothing sent to HMRC yet.')]);
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(rows.length == 1 ? '1 submission' : '${rows.length} submissions', key: const Key('uk.history.count'), style: text.titleMedium),
                  const SizedBox(height: 8),
                  Panel(
                    children: [
                      for (final (i, row) in rows.indexed)
                        RowCard(
                          key: Key('uk.history.$i'),
                          leading: const TintTile(tint: Tint.ask, mark: Mark.confirm),
                          title: historyTitle(row),
                          subtitle: [
                            historySubtitle(row),
                            if (ukNumOrNull(row['amount']) != null) pounds(ukNum(row['amount'])),
                          ].where((s) => s.isNotEmpty).join('. '),
                        ),
                    ],
                  ),
                  const UkNote('Keep your records for at least 5 years after the 31 January Self Assessment deadline, and 6 years for VAT.'),
                ],
              );
            },
          ),
          const UkFooter(),
        ],
      ),
    );
  }
}
