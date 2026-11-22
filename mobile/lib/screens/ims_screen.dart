import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../excel.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../marks.dart';
import '../proposal_flow.dart';
import '../theme.dart';
import '../widgets.dart';
import '../widgets/utf16_limit.dart';

const _filters = ['all', 'undecided', 'accept', 'reject', 'pending', 'missing'];

String _filterWords(BuildContext context, String filter) => switch (filter) {
  'undecided' => inText(context, 'Not decided'),
  'accept' => inText(context, 'Accept'),
  'reject' => inText(context, 'Reject'),
  'pending' => inText(context, 'Pending'),
  'missing' => inText(context, 'Not in books'),
  _ => inText(context, 'All'),
};

String _emptyWords(BuildContext context, String filter) => switch (filter) {
  'undecided' => inText(context, 'Every invoice has a decision.'),
  'accept' => inText(context, 'Nothing is marked accept.'),
  'reject' => inText(context, 'Nothing is marked reject.'),
  'pending' => inText(context, 'Nothing is marked pending.'),
  'missing' => inText(context, 'Every invoice is in your books.'),
  _ => inText(context, 'No invoices in this GSTR-2B.'),
};

const _choices = ['accept', 'reject', 'pending', 'clear'];

String _choiceWords(BuildContext context, String choice) => switch (choice) {
  'accept' => inText(context, 'Accept'),
  'reject' => inText(context, 'Reject'),
  'pending' => inText(context, 'Pending'),
  _ => inText(context, 'Clear'),
};

String _statusWords(BuildContext context, ImsRow row) => switch (row.decision) {
  'accept' => inText(context, 'Accepted'),
  'reject' => inText(context, 'Rejected'),
  'pending' => inText(context, 'Pending'),
  _ => row.suggested == 'accept' ? inText(context, 'Suggest accept') : inText(context, 'Suggest pending'),
};

String _itcWords(BuildContext context, ImsRow row) => switch (row.itcAvailability) {
  'Y' => inText(context, 'Credit available in 2B'),
  'N' => inText(context, 'Credit not available in 2B'),
  _ => '',
};

String _subtitle(BuildContext context, ImsRow row) => [
  if (row.invoiceDate.isNotEmpty) longDate(row.invoiceDate),
  row.credit < 0 ? inFormat(context, '{amount} less credit', {'amount': rupees(-row.credit)}) : inFormat(context, '{amount} credit', {'amount': rupees(row.credit)}),
  switch (row.match) {
    'matched' => inText(context, 'matched'),
    'amount differs' => inText(context, 'amount differs'),
    'date differs' => inText(context, 'date differs'),
    'not in books' => inText(context, 'not in books'),
    _ => row.match,
  },
  if (row.lines > 1) inFormat(context, '{n} lines', {'n': row.lines}),
].where((part) => part.isNotEmpty).join(' · ');

String _proposeWords(BuildContext context, String who, String decision) => switch (decision) {
  'accept' => inFormat(context, '{who}: accept', {'who': who}),
  'reject' => inFormat(context, '{who}: reject', {'who': who}),
  'pending' => inFormat(context, '{who}: pending', {'who': who}),
  'clear' => inFormat(context, '{who}: clear', {'who': who}),
  _ => '$who: $decision',
};

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

typedef _Numbered = ({ImsRow row, String id});

List<_Numbered> _numbered(List<ImsRow> rows) {
  final seen = <String, int>{};
  return [
    for (final row in rows)
      (row: row, id: switch (seen.update(row.key, (count) => count + 1, ifAbsent: () => 1)) {
        1 => row.key,
        final count => '${row.key}#$count',
      }),
  ];
}

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

  void _toEnd(int tries) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      final position = _scroll.position;
      final before = position.pixels;
      position.jumpTo(position.maxScrollExtent);
      if (tries > 0 && position.pixels != before) _toEnd(tries - 1);
    });
  }

  @override
  void onThreadChanged() {
    _toEnd(8);
  }

  Future<void> _acceptMatched() => propose(inText(context, 'Accept all matched invoices'), 'ims_decide', {
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
    await propose(_proposeWords(context, who, choice.decision), 'ims_decide', {
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
          inCount(
            context,
            counts.total,
            '{n} invoice · {accept} accepted · {reject} rejected · {pending} pending · {undecided} not decided',
            '{n} invoices · {accept} accepted · {reject} rejected · {pending} pending · {undecided} not decided',
            {'accept': counts.accept, 'reject': counts.reject, 'pending': counts.pending, 'undecided': counts.undecided},
          ),
          key: const ValueKey('ims.counts'),
          style: text.bodyMedium,
        ),
        const SizedBox(height: 4),
        Text(
          inFormat(context, 'Credit not decided {undecided} · accepted {accepted}', {'undecided': rupees(review.creditUndecided), 'accepted': rupees(review.creditAccepted)}),
          key: const ValueKey('ims.credit'),
          style: text.bodySmall,
        ),
        if (review.orphaned > 0) ...[
          const SizedBox(height: 4),
          Text(
            inCount(context, review.orphaned, '1 earlier decision is for an invoice that is no longer in this GSTR-2B.', '{n} earlier decisions are for invoices that are no longer in this GSTR-2B.'),
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
        label: Text(inText(context, 'Accept all matched')),
        onPressed: busy || review.acceptableRows == 0 ? null : _acceptMatched,
      ),
      ActionChip(
        label: Text(inText(context, 'Save as Excel')),
        onPressed: busy || _saving ? null : _saveExcel,
      ),
    ],
  );

  Widget _filterChips() => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      for (final filter in _filters)
        ChoiceChip(
          label: Text(_filterWords(context, filter)),
          selected: _filter == filter,
          selectedColor: Palette.sunken,
          showCheckmark: false,
          onSelected: (_) => setState(() => _filter = filter),
        ),
    ],
  );

  Widget _row(_Numbered item) => RowCard(
    key: ValueKey('ims.${item.id}'),
    leading: _tile(item.row),
    title: item.row.title,
    subtitle: _subtitle(context, item.row),
    trailing: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 124),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        alignment: Alignment.centerRight,
        child: StatusTag(key: ValueKey('ims.status.${item.id}'), text: _statusWords(context, item.row), color: _decisionColor(item.row)),
      ),
    ),
    onTap: busy ? null : () => _openRow(item.row),
  );

  List<Widget> _head(ImsReview review, bool noRows, TextTheme text) => [
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
    if (noRows) Text(_emptyWords(context, _filter), style: text.bodyMedium),
  ];

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

  Widget _rowsSliver(List<_Numbered> rows) => SliverPadding(
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
          itemCount: rows.length,
          itemBuilder: (context, index) => _edged(index, rows.length, _row(rows[index])),
          separatorBuilder: (context, index) => const Divider(indent: 68),
        ),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(inFormat(context, 'IMS · {month}', {'month': monthLabel(widget.period)}))),
      body: FutureBuilder<ImsReview?>(
        future: _review,
        builder: (context, snap) {
          final review = snap.data;
          final loading = review == null && snap.connectionState != ConnectionState.done;
          final rows = review != null && review.hasStatement ? _numbered(review.rows).where((item) => _shown(item.row, _filter)).toList() : const <_Numbered>[];
          return Column(
            children: [
              Expanded(
                child: CustomScrollView(
                  controller: _scroll,
                  slivers: [
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                      sliver: SliverList.list(
                        children: [
                          if (loading)
                            const Center(child: CircularProgressIndicator())
                          else if (review == null)
                            EmptyNote(text: inText(context, 'Could not load the IMS decisions. Try again in a moment.'))
                          else if (!review.hasStatement)
                            EmptyNote(text: inText(context, 'Add the GSTR-2B for this month first (Taxes → GST → Add 2B).'))
                          else
                            ..._head(review, rows.isEmpty, text),
                        ],
                      ),
                    ),
                    if (rows.isNotEmpty) _rowsSliver(rows),
                    SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      sliver: SliverList.list(
                        children: [
                          if (review != null && review.hasStatement && review.note.isNotEmpty) ...[
                            const SizedBox(height: 16),
                            Text(review.note, style: text.bodySmall),
                          ],
                          for (final entry in entries) entry.toBubble(),
                        ],
                      ),
                    ),
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
                  if (row.invoiceDate.isNotEmpty) _Fact(label: inText(context, 'Invoice date'), value: longDate(row.invoiceDate)),
                  _Fact(label: inText(context, 'Taxable value'), value: rupees(row.taxableValue)),
                  _Fact(label: inText(context, 'Invoice total'), value: rupees(row.totalValue)),
                  _Fact(label: row.credit < 0 ? inText(context, 'Credit taken back') : inText(context, 'Input credit'), value: rupees(row.credit.abs())),
                  _Fact(label: inText(context, 'In your books'), value: row.inBooks ? row.billId : inText(context, 'Not found')),
                  if (_itcWords(context, row).isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(_itcWords(context, row), style: text.bodySmall),
                  ],
                  const SizedBox(height: 10),
                  if (row.why.isNotEmpty) Text(row.why, style: text.bodyMedium),
                  const SizedBox(height: 6),
                  Text(
                    row.suggested == 'accept' ? inText(context, 'MyCA suggests accepting it.') : inText(context, 'MyCA suggests leaving it pending until you have checked it.'),
                    style: text.bodyMedium,
                  ),
                  if (row.decided) ...[
                    const SizedBox(height: 6),
                    Text(
                      switch (row.decision) {
                        'accept' => inText(context, 'Your decision so far: accepted.'),
                        'reject' => inText(context, 'Your decision so far: rejected.'),
                        _ => inText(context, 'Your decision so far: pending.'),
                      },
                      style: text.bodyMedium,
                    ),
                  ],
                  const SizedBox(height: 14),
                  SectionLabel(inText(context, 'Your decision')),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final choice in _choices)
                        ChoiceChip(
                          label: Text(_choiceWords(context, choice)),
                          selected: _decision == choice,
                          selectedColor: Palette.sunken,
                          showCheckmark: false,
                          onSelected: choice == 'clear' && !row.decided ? null : (_) => setState(() => _decision = choice),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _note,
                    inputFormatters: const [Utf16LengthLimit(200)],
                    textCapitalization: TextCapitalization.sentences,
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      labelText: inText(context, 'Note (optional)'),
                      helperText: inText(context, 'Kept with the decision and listed in the Excel sheet'),
                      counterText: '${_note.text.length}/200',
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            FilledButton(onPressed: _changed ? _save : null, child: Text(inText(context, 'Save'))),
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
            child: value.contains('₹') && !value.contains(' ')
                ? Amount(value, alignment: Alignment.centerRight, style: text.bodyMedium?.copyWith(fontFeatures: moneyFigures))
                : Text(value, textAlign: TextAlign.end, style: text.bodyMedium?.copyWith(fontFeatures: moneyFigures)),
          ),
        ],
      ),
    );
  }
}
