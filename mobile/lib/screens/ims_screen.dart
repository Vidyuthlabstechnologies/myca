import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../excel.dart';
import '../format.dart';
import '../marks.dart';
import '../proposal_flow.dart';
import '../theme.dart';
import '../widgets.dart';

const _filters = {
  'all': 'All',
  'undecided': 'Not decided',
  'accept': 'Accept',
  'reject': 'Reject',
  'pending': 'Pending',
  'missing': 'Not in books',
};

const _emptyWords = {
  'all': 'No invoices in this GSTR-2B.',
  'undecided': 'Every invoice has a decision.',
  'accept': 'Nothing is marked accept.',
  'reject': 'Nothing is marked reject.',
  'pending': 'Nothing is marked pending.',
  'missing': 'Every invoice is in your books.',
};

const _choices = {'accept': 'Accept', 'reject': 'Reject', 'pending': 'Pending', 'clear': 'Clear'};

bool _shown(ImsRow row, String filter) => switch (filter) {
  'undecided' => !row.decided,
  'accept' || 'reject' || 'pending' => row.decision == filter,
  'missing' => row.match == 'not in books',
  _ => true,
};

Color _decisionColor(ImsRow row) => switch (row.decision) {
  'accept' => Palette.accent,
  'reject' => Palette.danger,
  'pending' => Palette.warn,
  _ => Palette.muted,
};

TintTile _tile(ImsRow row) => switch (row.decision) {
  'accept' => const TintTile(tint: Tint.sales, mark: Mark.confirm),
  'reject' => const TintTile(tint: Tint.urgent, mark: Mark.urgent),
  'pending' => const TintTile(tint: Tint.taxes, mark: Mark.dueSoon),
  _ => const TintTile(tint: Tint.purchases, mark: Mark.paper),
};

String _countWords(int count, String one, String many) => '$count ${count == 1 ? one : many}';

class ImsScreen extends StatefulWidget {
  const ImsScreen({super.key, required this.period});

  final String period;

  @override
  State<ImsScreen> createState() => _ImsScreenState();
}

class _ImsScreenState extends State<ImsScreen> with ProposalFlow {
  final _scroll = ScrollController();
  Future<ImsReview?>? _review;
  String _filter = 'all';
  String _note = '';
  bool _saving = false;

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _review ??= _load();
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<ImsReview?> _load() async {
    try {
      return ImsReview.fromTool(await api.query('ims_review', {'period': widget.period}));
    } on MycaApiException {
      return null;
    }
  }

  @override
  Future<void> onPosted() async {
    HapticFeedback.mediumImpact();
    setState(() {
      _review = _load();
    });
  }

  @override
  void onThreadChanged() {
    if (pending == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  Future<void> _acceptMatched() => propose('Accept all matched invoices', 'ims_decide', {
    'period': widget.period,
    'select': 'matched',
    'decision': 'accept',
  });

  Future<void> _openRow(ImsRow row) async {
    final choice = await showModalBottomSheet<_ImsChoice>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ImsSheet(row: row),
    );
    if (choice == null || !mounted) return;
    final who = [row.supplierName, row.invoiceNo].where((part) => part.isNotEmpty).join(' ');
    await propose('$who: ${choice.decision}', 'ims_decide', {
      'period': widget.period,
      'keys': [row.key],
      'decision': choice.decision,
      if (choice.note.isNotEmpty) 'note': choice.note,
    });
  }

  Future<void> _saveExcel() async {
    final state = AppScope.of(context);
    setState(() {
      _saving = true;
      _note = '';
    });
    var note = '';
    try {
      note = await saveXlsx(state, toolData(await state.api.query('export_xlsx', {'report': 'ims_review', 'period': widget.period})));
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() {
      _saving = false;
      _note = note;
    });
  }

  Widget _summary(ImsReview review, TextTheme text) {
    final counts = review.counts;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '${_countWords(counts.total, 'invoice', 'invoices')} · ${counts.accept} accepted · ${counts.reject} rejected · ${counts.pending} pending · ${counts.undecided} not decided',
          key: const ValueKey('ims.counts'),
          style: text.bodyMedium,
        ),
        const SizedBox(height: 4),
        Text(
          'Credit not decided ${rupees(review.creditUndecided)} · accepted ${rupees(review.creditAccepted)}',
          key: const ValueKey('ims.credit'),
          style: text.bodySmall,
        ),
        if (review.orphaned > 0) ...[
          const SizedBox(height: 4),
          Text(
            review.orphaned == 1
                ? '1 earlier decision is for an invoice that is no longer in this GSTR-2B.'
                : '${review.orphaned} earlier decisions are for invoices that are no longer in this GSTR-2B.',
            style: text.bodySmall,
          ),
        ],
      ],
    );
  }

  Widget _actions(ImsReview review) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      ActionChip(
        label: const Text('Accept all matched'),
        onPressed: busy || review.matchedRows == 0 ? null : _acceptMatched,
      ),
      ActionChip(
        label: const Text('Save as Excel'),
        onPressed: busy || _saving ? null : _saveExcel,
      ),
    ],
  );

  Widget _filterChips() => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      for (final entry in _filters.entries)
        ChoiceChip(
          label: Text(entry.value),
          selected: _filter == entry.key,
          selectedColor: Palette.sunken,
          showCheckmark: false,
          onSelected: (_) => setState(() => _filter = entry.key),
        ),
    ],
  );

  Widget _row(ImsRow row) => RowCard(
    key: ValueKey('ims.${row.key}'),
    leading: _tile(row),
    title: row.title,
    subtitle: row.subtitle,
    trailing: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 124),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerRight,
        child: StatusTag(key: ValueKey('ims.status.${row.key}'), text: row.statusWords, color: _decisionColor(row)),
      ),
    ),
    onTap: busy ? null : () => _openRow(row),
  );

  List<Widget> _content(ImsReview review, TextTheme text) {
    final rows = review.rows.where((row) => _shown(row, _filter)).toList();
    return [
      _summary(review, text),
      const SizedBox(height: 12),
      _actions(review),
      if (_note.isNotEmpty) ...[
        const SizedBox(height: 8),
        Text(_note, style: text.bodyMedium),
      ],
      const SizedBox(height: 16),
      _filterChips(),
      const SizedBox(height: 12),
      if (rows.isEmpty) Text(_emptyWords[_filter]!, style: text.bodyMedium) else Panel(children: [for (final row in rows) _row(row)]),
      if (review.note.isNotEmpty) ...[
        const SizedBox(height: 16),
        Text(review.note, style: text.bodySmall),
      ],
    ];
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text('IMS · ${monthLabel(widget.period)}')),
      body: FutureBuilder<ImsReview?>(
        future: _review,
        builder: (context, snap) {
          final review = snap.data;
          final loading = review == null && snap.connectionState != ConnectionState.done;
          return Column(
            children: [
              Expanded(
                child: ListView(
                  controller: _scroll,
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  children: [
                    if (loading)
                      const Center(child: CircularProgressIndicator())
                    else if (review == null)
                      const EmptyNote(text: 'Could not load the IMS decisions. Try again in a moment.')
                    else if (!review.hasStatement)
                      const EmptyNote(text: 'Add the GSTR-2B for this month first (Taxes → GST → Add 2B).')
                    else
                      ..._content(review, text),
                    for (final entry in entries) entry.toBubble(),
                  ],
                ),
              ),
              if (pending != null) ProposalBar(busy: busy, onPost: postPending, onDiscard: discardPending),
            ],
          );
        },
      ),
    );
  }
}

class _ImsChoice {
  const _ImsChoice(this.decision, this.note);

  final String decision;
  final String note;
}

class _ImsSheet extends StatefulWidget {
  const _ImsSheet({required this.row});

  final ImsRow row;

  @override
  State<_ImsSheet> createState() => _ImsSheetState();
}

class _ImsSheetState extends State<_ImsSheet> {
  late final _note = TextEditingController(text: widget.row.note);
  late String _decision = widget.row.decision;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  bool get _changed {
    if (_decision.isEmpty) return false;
    if (_decision == 'clear') return widget.row.decided;
    return _decision != widget.row.decision || _note.text.trim() != widget.row.note;
  }

  void _save() => Navigator.of(context).pop(_ImsChoice(_decision, _decision == 'clear' ? '' : _note.text.trim()));

  String get _identity => [
    if (widget.row.supplierGstin.isNotEmpty) widget.row.supplierGstin,
    if (widget.row.section.isNotEmpty) widget.row.section,
  ].join(' · ');

  @override
  Widget build(BuildContext context) {
    final row = widget.row;
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(row.title, style: text.headlineSmall, maxLines: 3, overflow: TextOverflow.ellipsis),
            if (_identity.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(_identity, style: text.bodySmall),
            ],
            const SizedBox(height: 10),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  if (row.invoiceDate.isNotEmpty) _Fact(label: 'Invoice date', value: longDate(row.invoiceDate)),
                  _Fact(label: 'Taxable value', value: rupees(row.taxableValue)),
                  _Fact(label: 'Invoice total', value: rupees(row.totalValue)),
                  _Fact(label: row.credit < 0 ? 'Credit taken back' : 'Input credit', value: rupees(row.credit.abs())),
                  _Fact(label: 'In your books', value: row.inBooks ? row.billId : 'Not found'),
                  if (row.itcWords.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(row.itcWords, style: text.bodySmall),
                  ],
                  const SizedBox(height: 10),
                  if (row.why.isNotEmpty) Text(row.why, style: text.bodyMedium),
                  const SizedBox(height: 6),
                  Text(
                    row.suggested == 'accept' ? 'MyCA suggests accepting it.' : 'MyCA suggests leaving it pending until you have checked it.',
                    style: text.bodyMedium,
                  ),
                  if (row.decided) ...[
                    const SizedBox(height: 6),
                    Text('Your decision so far: ${row.decisionWords.toLowerCase()}.', style: text.bodyMedium),
                  ],
                  const SizedBox(height: 14),
                  const SectionLabel('Your decision'),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final entry in _choices.entries)
                        ChoiceChip(
                          label: Text(entry.value),
                          selected: _decision == entry.key,
                          selectedColor: Palette.sunken,
                          showCheckmark: false,
                          onSelected: entry.key == 'clear' && !row.decided ? null : (_) => setState(() => _decision = entry.key),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _note,
                    maxLength: 200,
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(
                      labelText: 'Note (optional)',
                      helperText: 'Kept with the decision and listed in the Excel sheet',
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            FilledButton(onPressed: _changed ? _save : null, child: const Text('Save')),
          ],
        ),
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(flex: 2, child: Text(label, style: text.bodySmall)),
          const SizedBox(width: 12),
          Expanded(
            flex: 3,
            child: Text(value, textAlign: TextAlign.end, style: text.bodyMedium?.copyWith(fontFeatures: moneyFigures)),
          ),
        ],
      ),
    );
  }
}
