import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../marks.dart';
import '../proposal_flow.dart';
import '../theme.dart';
import '../widgets.dart';

class YearCloseScreen extends StatefulWidget {
  const YearCloseScreen({super.key});

  @override
  State<YearCloseScreen> createState() => _YearCloseScreenState();
}

class _YearCloseScreenState extends State<YearCloseScreen> with ProposalFlow {
  Future<Map<String, dynamic>>? _closings;
  final _year = TextEditingController();
  bool _posted = false;

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _closings ??= _load();
  }

  Future<Map<String, dynamic>> _load() async {
    try {
      final data = toolData(await api.query('list_year_closings'));
      if (_year.text.isEmpty && data['nextYear'] is String) _year.text = data['nextYear'] as String;
      return data;
    } on MycaApiException {
      return const <String, dynamic>{};
    }
  }

  @override
  Future<void> onPosted() async {
    HapticFeedback.mediumImpact();
    setState(() {
      _posted = true;
      _closings = _load();
    });
  }

  @override
  void dispose() {
    _year.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Close the year')),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _closings,
        builder: (context, snap) {
          final closings = [for (final row in (snap.data?['closings'] as List? ?? const [])) if (row is Map) Map<String, dynamic>.from(row)];
          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  children: [
                    Text(
                      'Closing a year moves its income and expenses to capital as new entries and locks the books through its last day. Do it once your CA has signed the year off; nothing already posted changes.',
                      style: text.bodyMedium,
                    ),
                    const SizedBox(height: 16),
                    if (closings.isNotEmpty) ...[
                      const SectionLabel('Closed'),
                      Panel(
                        children: [
                          for (final row in closings)
                            RowCard(
                              leading: const TintTile(tint: Tint.taxes, mark: Mark.confirm),
                              title: 'Year ${row['year']}',
                              subtitle: '${(row['profit'] as num? ?? 0) >= 0 ? 'Profit' : 'Loss'} ${rupees(((row['profit'] as num?) ?? 0).abs())} · closed ${longDate('${row['closedOn'] ?? ''}')}',
                            ),
                        ],
                      ),
                      const SizedBox(height: 16),
                    ],
                    if (pending == null && !_posted) ...[
                      TextField(
                        controller: _year,
                        decoration: const InputDecoration(labelText: 'Year to close', helperText: 'The financial year as 2025-26, or the calendar year as 2025 for a US business'),
                      ),
                      const SizedBox(height: 14),
                      FilledButton(
                        onPressed: busy ? null : () => propose('Close the year ${_year.text.trim()}', 'close_year', {'year': _year.text.trim()}),
                        child: const Text('Preview the closing'),
                      ),
                    ],
                    for (final entry in entries) entry.toBubble(),
                    if (_posted) ...[
                      const SizedBox(height: 16),
                      FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Done')),
                    ],
                  ],
                ),
              ),
              if (pending != null) ProposalBar(busy: busy, onPost: postPending, onDiscard: discardPending, postLabel: 'Close it'),
            ],
          );
        },
      ),
    );
  }
}
