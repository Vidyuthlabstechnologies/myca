import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../excel.dart';
import '../marks.dart';
import '../theme.dart';
import '../widgets.dart';

const _periods = {
  'this-month': 'This month',
  'last-month': 'Last month',
  'this-quarter': 'This quarter',
  'this-year': 'This year',
};

const _views = {'changes': 'Changes', 'all': 'Everything'};

const _longestList = 2000;

class AuditTrailScreen extends StatefulWidget {
  const AuditTrailScreen({super.key});

  @override
  State<AuditTrailScreen> createState() => _AuditTrailScreenState();
}

class _AuditTrailScreenState extends State<AuditTrailScreen> {
  String _period = 'this-month';
  String _view = 'changes';
  bool _longest = false;
  bool _saving = false;
  String _excelNote = '';
  Future<AuditTrail?>? _trail;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _trail ??= _load();
  }

  Future<AuditTrail?> _load() async {
    try {
      return AuditTrail.fromTool(
        await AppScope.of(context).api.query('audit_trail', {
          'period': _period,
          'view': _view,
          if (_longest) 'limit': _longestList,
        }),
      );
    } on MycaApiException {
      return null;
    }
  }

  void _reload({String? period, String? view, bool longest = false}) {
    setState(() {
      _period = period ?? _period;
      _view = view ?? _view;
      _longest = longest;
      _excelNote = '';
      _trail = _load();
    });
  }

  Future<void> _saveExcel() async {
    final state = AppScope.of(context);
    setState(() {
      _saving = true;
      _excelNote = '';
    });
    var note = '';
    try {
      note = await saveXlsx(state, toolData(await state.api.query('export_xlsx', {'report': 'audit_trail', 'period': _period})));
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() {
      _saving = false;
      _excelNote = note;
    });
  }

  Widget _chips(String prefix, Map<String, String> options, String selected, void Function(String) onPick) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      for (final option in options.entries)
        ChoiceChip(
          key: ValueKey('$prefix.${option.key}'),
          label: Text(option.value),
          selected: selected == option.key,
          selectedColor: Palette.sunken,
          showCheckmark: false,
          onSelected: (_) {
            if (selected != option.key) onPick(option.key);
          },
        ),
    ],
  );

  List<Widget> _trailHead(AuditTrail trail, TextTheme text) => [
    Text(
      trail.chainWords,
      key: const ValueKey('audit.chain'),
      style: text.bodyMedium?.copyWith(color: trail.chainOk ? null : Palette.danger, fontWeight: trail.chainOk ? null : FontWeight.w600),
    ),
    if (!trail.ledgerOk) ...[
      const SizedBox(height: 4),
      Text(
        'The record of entries fails its integrity check. Ask your CA before recording more.',
        style: text.bodyMedium?.copyWith(color: Palette.danger, fontWeight: FontWeight.w600),
      ),
    ],
    const SizedBox(height: 12),
    if (trail.events.isEmpty) const EmptyNote(text: 'Nothing changed in this period.'),
  ];

  List<Widget> _trailFoot(AuditTrail trail, TextTheme text) => [
    if (trail.more && !_longest)
      Padding(
        padding: const EdgeInsets.only(top: 8),
        child: TextButton(
          key: const ValueKey('audit.more'),
          onPressed: () => _reload(longest: true),
          child: const Text('Show more'),
        ),
      ),
    if (trail.more && _longest)
      Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Text('The latest $_longestList are shown. Save as Excel for the full list.', style: text.bodySmall),
      ),
  ];

  Widget _row(AuditEvent event) => RowCard(
    key: ValueKey('audit.${event.eventId}'),
    leading: TintTile(tint: event.kind == 'change' ? Tint.taxes : Tint.ask, mark: Mark.paper),
    title: event.summary,
    subtitle: event.subtitle,
  );

  Widget _edged(int index, int count, Widget row) {
    if (index > 0 && index < count - 1) return row;
    const corner = Radius.circular(radiusCard - 1);
    return ClipRRect(
      borderRadius: BorderRadius.vertical(
        top: index == 0 ? corner : Radius.zero,
        bottom: index == count - 1 ? corner : Radius.zero,
      ),
      child: row,
    );
  }

  Widget _rowsSliver(List<AuditEvent> events) => SliverPadding(
    padding: const EdgeInsets.symmetric(horizontal: 16),
    sliver: DecoratedSliver(
      decoration: BoxDecoration(
        color: Palette.surface,
        borderRadius: BorderRadius.circular(radiusCard),
        border: Border.all(color: Palette.line),
      ),
      sliver: SliverPadding(
        padding: const EdgeInsets.all(1),
        sliver: SliverList.separated(
          itemCount: events.length,
          itemBuilder: (context, index) => _edged(index, events.length, _row(events[events.length - 1 - index])),
          separatorBuilder: (context, index) => const Divider(indent: 68),
        ),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Audit trail')),
      body: FutureBuilder<AuditTrail?>(
        future: _trail,
        builder: (context, snap) {
          final loading = snap.connectionState != ConnectionState.done;
          final trail = loading ? null : snap.data;
          return CustomScrollView(
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                sliver: SliverList.list(
                  children: [
                    Text('Who changed what and when. Every change made through MyCA is listed, and the log is checked for edits.', style: text.bodyMedium),
                    const SizedBox(height: 12),
                    _chips('audit.period', _periods, _period, (key) => _reload(period: key)),
                    const SizedBox(height: 8),
                    _chips('audit.view', _views, _view, (key) => _reload(view: key)),
                    const SizedBox(height: 12),
                    if (loading)
                      const Center(child: CircularProgressIndicator())
                    else if (trail == null)
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text('The audit trail could not be loaded.', style: text.bodyMedium),
                          const SizedBox(height: 8),
                          TextButton(onPressed: _reload, child: const Text('Try again')),
                        ],
                      )
                    else
                      ..._trailHead(trail, text),
                  ],
                ),
              ),
              if (trail != null && trail.events.isNotEmpty) _rowsSliver(trail.events),
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                sliver: SliverList.list(
                  children: [
                    if (trail != null) ..._trailFoot(trail, text),
                    const SizedBox(height: 16),
                    OutlinedButton(
                      onPressed: _saving ? null : _saveExcel,
                      child: const Text('Save as Excel'),
                    ),
                    if (_excelNote.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_excelNote, style: text.bodyMedium)),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
