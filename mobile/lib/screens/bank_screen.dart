import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../excel.dart';
import '../format.dart';
import '../marks.dart';
import '../proposal_flow.dart';
import '../registers.dart';
import '../theme.dart';
import '../widgets.dart';
import 'head_picker.dart';
import 'party_picker.dart';

const _filters = {'all': 'All', 'unmatched': 'Not matched yet', 'matched': 'Matched', 'booked': 'Booked', 'ignored': 'Ignored'};

const _emptyWords = {
  'all': 'No statement lines yet.',
  'unmatched': 'Nothing waiting to be matched.',
  'matched': 'No matched lines yet.',
  'booked': 'No booked lines yet.',
  'ignored': 'No ignored lines.',
};

const _builtInAccounts = [
  OwnAccount(id: '1001', label: 'Cash', kind: 'cash', maskedNumber: '', ifsc: '', balance: 0, builtIn: true),
  OwnAccount(id: '1002', label: 'Bank', kind: 'bank', maskedNumber: '', ifsc: '', balance: 0, builtIn: true),
];

Color _statusColor(String status) => switch (status) {
  'unmatched' => Palette.warn,
  'matched' || 'booked' => Palette.accent,
  _ => Palette.muted,
};

class BankScreen extends StatefulWidget {
  const BankScreen({super.key});

  @override
  State<BankScreen> createState() => _BankScreenState();
}

class _BankScreenState extends State<BankScreen> with ProposalFlow {
  Future<BankReconciliation?>? _recon;
  String _account = '1002';
  String _filter = 'all';
  bool _older = false;
  String _note = '';
  bool _saving = false;

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _recon ??= _load();
  }

  String _twoYearsBack() {
    final today = AppScope.of(context).now();
    return isoDate(DateTime(today.year - 2, today.month, today.day));
  }

  Future<BankReconciliation?> _load() async {
    final args = <String, Object?>{'account': _account, if (_older) 'from': _twoYearsBack()};
    try {
      return BankReconciliation.fromTool(await api.query('bank_reconciliation', args));
    } on MycaApiException {
      return null;
    }
  }

  void _toggleWindow() => setState(() {
    _older = !_older;
    _recon = _load();
  });

  String get _windowWords => _older ? 'Showing two years' : 'Showing the last 90 days';

  @override
  Future<void> onPosted() async {
    HapticFeedback.mediumImpact();
    setState(() {
      _recon = _load();
    });
  }

  void _switchAccount(String id) => setState(() {
    _account = id;
    _filter = 'all';
    _recon = _load();
  });

  Future<List<OwnAccount>> _accounts(BankReconciliation? recon) async {
    if (recon != null && recon.accounts.isNotEmpty) return recon.accounts;
    try {
      final listed = bankAccountsFrom(await api.query('list_bank_accounts'));
      return listed.isEmpty ? _builtInAccounts : listed;
    } on MycaApiException {
      return _builtInAccounts;
    }
  }

  Future<void> _match(BankLine line, String words, Map<String, Object?> args) =>
      propose('${line.id}: $words', 'match_bank_line', {'lineId': line.id, ...args});

  Future<OwnAccount?> _pickAccount(List<OwnAccount> accounts, String title) => showModalBottomSheet<OwnAccount>(
    context: context,
    builder: (sheet) => _ChipSheet(
      title: title,
      children: [
        for (final account in accounts)
          ChoiceChip(label: Text(account.label), selected: false, onSelected: (_) => Navigator.of(sheet).pop(account)),
      ],
    ),
  );

  Future<void> _openLine(BankLine line, BankReconciliation recon) async {
    final choice = await showModalBottomSheet<_LineChoice>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _LineSheet(line: line),
    );
    if (choice == null || !mounted) return;
    if (choice.kind == 'unlink') {
      return propose('Unlink ${line.id}', 'unmatch_bank_line', {'lineId': line.id});
    }
    final remember = {if (choice.remember) 'remember': true};
    final suggestion = choice.suggestion;
    if (suggestion != null && suggestion.kind != 'transfer') {
      return _match(line, suggestion.words, {...suggestion.matchArgs, if (suggestion.kind != 'books') ...remember});
    }
    switch (choice.kind) {
      case 'receipt':
        final party = await showPartyPicker(context, RegisterKind.sales);
        if (party == null || !mounted) return;
        await _match(line, 'Receipt from ${party.name}', {'kind': 'receipt', 'partyName': party.name, ...remember});
      case 'payment':
        final party = await showPartyPicker(context, RegisterKind.purchases);
        if (party == null || !mounted) return;
        await _match(line, 'Payment to ${party.name}', {'kind': 'payment', 'partyName': party.name, ...remember});
      case 'expense':
        final head = await showHeadPicker(context, title: 'Which head is it?');
        if (head == null || !mounted) return;
        await _match(line, 'Expense under ${head.name}', {'kind': 'expense', 'head': head.code, ...remember});
      case 'charge':
        await _match(line, 'Bank charge', {'kind': 'charge', ...remember});
      case 'interest':
        await _match(line, 'Interest earned', {'kind': 'interest', ...remember});
      case 'transfer':
        final others = (recon.accounts.isEmpty ? _builtInAccounts : recon.accounts).where((a) => a.id != _account).toList();
        final other = await _pickAccount(others, line.isIn ? 'Which account did it come from?' : 'Which account did it go to?');
        if (other == null || !mounted) return;
        await _match(line, 'Transfer ${line.isIn ? 'from' : 'to'} ${other.label}', {'kind': 'transfer', 'otherAccount': other.id, ...remember});
      case 'ignore':
        final note = await showModalBottomSheet<String>(context: context, isScrollControlled: true, builder: (_) => const _NoteSheet());
        if (note == null || !mounted) return;
        await _match(line, note.isEmpty ? 'Ignore' : 'Ignore: $note', {'kind': 'ignore', if (note.isNotEmpty) 'note': note, ...remember});
    }
  }

  Future<void> _bringIn() async {
    final state = AppScope.of(context);
    final picked = await state.pickTextFile(const ['csv', 'txt', 'json']);
    if (picked == null || !mounted) return;
    final String sha;
    try {
      sha = await state.api.upload(picked.name, picked.content);
    } on MycaApiException catch (err) {
      if (!mounted) return;
      setState(() => entries.add(ThreadEntry(text: err.message, tone: BubbleTone.problem)));
      return;
    }
    if (!mounted) return;
    final name = picked.name.toLowerCase();
    await propose(picked.name, 'import_bank', {
      'documentSha256': sha,
      'type': name.endsWith('.json') ? 'aa' : name.endsWith('.txt') ? 'text' : 'csv',
      'post': 'hold',
      'account': _account,
    });
  }

  Future<void> _transfer(BankReconciliation? recon) async {
    final accounts = await _accounts(recon);
    if (!mounted) return;
    final today = isoDate(AppScope.of(context).now());
    final draft = await showModalBottomSheet<_TransferDraft>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _TransferSheet(accounts: accounts, from: _account, today: today),
    );
    if (draft == null || !mounted) return;
    await propose('Transfer ${rupees(draft.amount)} from ${draft.from.label} to ${draft.to.label}', 'record_transfer', {
      'fromAccount': draft.from.id,
      'toAccount': draft.to.id,
      'amount': draft.amount,
      'date': draft.date,
      if (draft.reference.isNotEmpty) 'reference': draft.reference,
    });
  }

  Future<void> _bookCharges() => propose('Book the bank charges and interest', 'book_bank_charges', {'account': _account});

  Future<void> _rules(BankReconciliation? recon) async {
    final accounts = await _accounts(recon);
    if (!mounted) return;
    final action = await showModalBottomSheet<_RuleAction>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _RulesSheet(rules: recon?.rules ?? const [], accounts: accounts.where((a) => a.id != _account).toList()),
    );
    if (action == null || !mounted) return;
    final remove = action.remove;
    if (remove != null) return propose('Remove the rule ${remove.id}', 'remove_bank_rule', {'id': remove.id});
    final rule = action.add;
    if (rule != null) await propose('Rule: ${rule.words}', 'add_bank_rule', rule.args);
  }

  Future<void> _addAccount() async {
    final draft = await showModalBottomSheet<Map<String, Object?>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _AccountSheet(),
    );
    if (draft == null || !mounted) return;
    await propose('Add the account ${draft['label']}', 'set_bank_account', draft);
  }

  Future<void> _saveExcel() async {
    final state = AppScope.of(context);
    setState(() {
      _saving = true;
      _note = '';
    });
    var note = '';
    try {
      note = await saveXlsx(state, toolData(await state.api.query('export_xlsx', {'report': 'bank_reconciliation', 'account': _account})));
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() {
      _saving = false;
      _note = note;
    });
  }

  Widget _actions(BankReconciliation? recon) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      ActionChip(label: const Text('Bring in a statement'), onPressed: busy ? null : _bringIn),
      ActionChip(label: const Text('Record a transfer'), onPressed: busy ? null : () => _transfer(recon)),
      ActionChip(label: const Text('Book bank charges'), onPressed: busy ? null : _bookCharges),
      ActionChip(label: const Text('Rules'), onPressed: busy ? null : () => _rules(recon)),
      ActionChip(label: const Text('Add an account'), onPressed: busy ? null : _addAccount),
      ActionChip(label: const Text('Save as Excel'), onPressed: busy || _saving ? null : _saveExcel),
    ],
  );

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Bank')),
      body: FutureBuilder<BankReconciliation?>(
        future: _recon,
        builder: (context, snap) {
          final recon = snap.data;
          final loading = snap.connectionState != ConnectionState.done;
          final lines = recon == null ? const <BankLine>[] : recon.lines.where((line) => _filter == 'all' || line.status == _filter).toList();
          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  children: [
                    if (recon != null && recon.accounts.length > 1) ...[
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final account in recon.accounts)
                            ChoiceChip(
                              label: Text(account.label),
                              selected: account.id == _account,
                              selectedColor: Palette.sunken,
                              showCheckmark: false,
                              onSelected: busy ? null : (_) => _switchAccount(account.id),
                            ),
                        ],
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (loading)
                      const Center(child: CircularProgressIndicator())
                    else if (recon == null || recon.empty)
                      Text('Bring in a bank statement and MyCA shows it next to your books.', style: text.bodyMedium)
                    else ...[
                      _Totals(totals: recon.totals),
                      const SizedBox(height: 6),
                      Text(_windowWords, style: text.bodySmall),
                      const SizedBox(height: 12),
                      Wrap(
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
                      ),
                      const SizedBox(height: 12),
                      if (lines.isEmpty)
                        Text(_emptyWords[_filter]!, style: text.bodyMedium)
                      else
                        Panel(
                          children: [
                            for (final line in lines)
                              RowCard(
                                key: ValueKey('bank.${line.id}'),
                                leading: TintTile(tint: line.isIn ? Tint.sales : Tint.purchases, mark: line.isIn ? Mark.bringIn : Mark.expense),
                                title: line.title,
                                subtitle: line.subtitle,
                                trailing: ConstrainedBox(
                                  constraints: const BoxConstraints(maxWidth: 120),
                                  child: Text(
                                    line.statusWords,
                                    key: ValueKey('bank.status.${line.id}'),
                                    textAlign: TextAlign.end,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(color: _statusColor(line.status), fontSize: 12.5, fontWeight: FontWeight.w600),
                                  ),
                                ),
                                onTap: busy ? null : () => _openLine(line, recon),
                              ),
                          ],
                        ),
                      const SizedBox(height: 4),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(onPressed: busy ? null : _toggleWindow, child: Text(_older ? 'Show recent' : 'Show older')),
                      ),
                      if (recon.books.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        SectionLabel(recon.lines.isEmpty ? 'In the books, not on a statement yet' : 'In the books, not on the statement'),
                        Panel(
                          children: [
                            for (final row in recon.books)
                              RowCard(
                                leading: const TintTile(tint: Tint.ask, mark: Mark.paper),
                                title: row.title,
                                subtitle: row.subtitle,
                              ),
                          ],
                        ),
                      ],
                    ],
                    const SizedBox(height: 16),
                    _actions(recon),
                    if (_note.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(_note, style: text.bodyMedium),
                    ],
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

class _Totals extends StatelessWidget {
  const _Totals({required this.totals});

  final BankTotals totals;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        _Figure(
          label: totals.statementOn.isEmpty ? 'Statement balance' : 'Statement balance on ${longDate(totals.statementOn)}',
          value: totals.statementBalanceWords,
        ),
        _Figure(label: 'In the books', value: rupees(totals.booksBalance)),
        _Figure(label: 'Difference', value: totals.differenceWords),
        _Figure(label: 'Lines', value: totals.unmatchedWords),
      ],
    );
  }
}

class _Figure extends StatelessWidget {
  const _Figure({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Palette.surface,
        borderRadius: BorderRadius.circular(radiusControl),
        border: Border.all(color: Palette.line),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: text.bodySmall),
          const SizedBox(height: 2),
          Amount(value, style: text.titleMedium?.copyWith(fontFeatures: moneyFigures)),
        ],
      ),
    );
  }
}

class _ChipSheet extends StatelessWidget {
  const _ChipSheet({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 4, 22, 22),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: text.headlineSmall),
            const SizedBox(height: 14),
            Wrap(spacing: 8, runSpacing: 8, children: children),
          ],
        ),
      ),
    );
  }
}

class _LineChoice {
  const _LineChoice(this.kind, {this.suggestion, this.remember = false});

  final String kind;
  final BankSuggestion? suggestion;
  final bool remember;
}

class _LineSheet extends StatefulWidget {
  const _LineSheet({required this.line});

  final BankLine line;

  @override
  State<_LineSheet> createState() => _LineSheetState();
}

class _LineSheetState extends State<_LineSheet> {
  bool _remember = false;

  String get _partyHint {
    for (final suggestion in widget.line.suggestions) {
      if (suggestion.partyName.isNotEmpty) return suggestion.partyName;
    }
    return '';
  }

  void _pick(String kind, [BankSuggestion? suggestion]) =>
      Navigator.of(context).pop(_LineChoice(kind, suggestion: suggestion, remember: _remember));

  @override
  Widget build(BuildContext context) {
    final line = widget.line;
    final text = Theme.of(context).textTheme;
    final match = line.match;
    final hint = _partyHint;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(line.title, style: text.headlineSmall, maxLines: 3, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 4),
            Text(line.detailWords, style: text.bodySmall),
            if (line.tieBreak)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('The running balance does not tie at this line. Check the statement.', style: text.bodySmall?.copyWith(color: Palette.warn)),
              ),
            const SizedBox(height: 10),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  if (!line.open) ...[
                    if (match != null) Text(match.words, style: text.bodyMedium),
                    const SizedBox(height: 12),
                    if (line.linked)
                      FilledButton(onPressed: () => _pick('unlink'), child: const Text('Unlink'))
                    else
                      Text('It was posted to your books from this line. To change it, reverse that entry the normal way.', style: text.bodyMedium),
                  ] else ...[
                    if (line.suggestions.isNotEmpty) ...[
                      const SectionLabel('Likely matches'),
                      for (final suggestion in line.suggestions)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const TintTile(tint: Tint.sales, mark: Mark.confirm),
                          title: Text(suggestion.words),
                          subtitle: suggestion.why.isEmpty ? null : Text(suggestion.why),
                          onTap: () => _pick(suggestion.kind, suggestion),
                        ),
                      const SizedBox(height: 10),
                    ],
                    const SectionLabel('Or record it as'),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (line.isIn) ActionChip(label: const Text('Receipt from a customer…'), onPressed: () => _pick('receipt')),
                        if (!line.isIn) ActionChip(label: const Text('Payment to a supplier…'), onPressed: () => _pick('payment')),
                        if (!line.isIn) ActionChip(label: const Text('Expense…'), onPressed: () => _pick('expense')),
                        if (!line.isIn) ActionChip(label: const Text('Bank charge'), onPressed: () => _pick('charge')),
                        if (line.isIn) ActionChip(label: const Text('Interest earned'), onPressed: () => _pick('interest')),
                        ActionChip(label: const Text('Transfer…'), onPressed: () => _pick('transfer')),
                        ActionChip(label: const Text('Ignore'), onPressed: () => _pick('ignore')),
                      ],
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _remember,
                      onChanged: (value) => setState(() => _remember = value),
                      title: Text(hint.isEmpty ? 'Remember this for similar lines' : 'Remember this for $hint'),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NoteSheet extends StatefulWidget {
  const _NoteSheet();

  @override
  State<_NoteSheet> createState() => _NoteSheetState();
}

class _NoteSheetState extends State<_NoteSheet> {
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Leave this line out of the books', style: text.titleLarge),
          const SizedBox(height: 4),
          Text('It stays on the statement as ignored, so the difference still ties.', style: text.bodySmall),
          const SizedBox(height: 12),
          TextField(
            controller: _note,
            autofocus: true,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(labelText: 'Why (optional)', helperText: 'For example a personal payment, or already in the books by hand'),
          ),
          const SizedBox(height: 14),
          FilledButton(onPressed: () => Navigator.of(context).pop(_note.text.trim()), child: const Text('Ignore this line')),
        ],
      ),
    );
  }
}

class _TransferDraft {
  const _TransferDraft({required this.from, required this.to, required this.amount, required this.date, required this.reference});

  final OwnAccount from;
  final OwnAccount to;
  final num amount;
  final String date;
  final String reference;
}

class _TransferSheet extends StatefulWidget {
  const _TransferSheet({required this.accounts, required this.from, required this.today});

  final List<OwnAccount> accounts;
  final String from;
  final String today;

  @override
  State<_TransferSheet> createState() => _TransferSheetState();
}

class _TransferSheetState extends State<_TransferSheet> {
  final _amount = TextEditingController();
  late final _date = TextEditingController(text: widget.today);
  final _reference = TextEditingController();
  late String _from = widget.from;
  String _to = '';
  String _error = '';

  @override
  void dispose() {
    _amount.dispose();
    _date.dispose();
    _reference.dispose();
    super.dispose();
  }

  void _submit() {
    final amount = parseAmount(_amount.text);
    if (amount == null || amount <= 0) return setState(() => _error = 'Enter the amount moved.');
    final from = widget.accounts.where((a) => a.id == _from).firstOrNull;
    final to = widget.accounts.where((a) => a.id == _to).firstOrNull;
    if (from == null || to == null) return setState(() => _error = 'Pick the account it came from and the account it went to.');
    if (from.id == to.id) return setState(() => _error = 'Pick two different accounts.');
    final date = _date.text.trim();
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(date) || DateTime.tryParse(date) == null) {
      return setState(() => _error = 'That is not a date I can read. Use the form 2026-11-03.');
    }
    Navigator.of(context).pop(_TransferDraft(from: from, to: to, amount: amount, date: date, reference: _reference.text.trim()));
  }

  Widget _chips(String picked, void Function(String id) onPick) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      for (final account in widget.accounts)
        ChoiceChip(
          label: Text(account.label),
          selected: account.id == picked,
          selectedColor: Palette.sunken,
          showCheckmark: false,
          onSelected: (_) => setState(() => onPick(account.id)),
        ),
    ],
  );

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Record a transfer', style: text.titleLarge),
            const SizedBox(height: 4),
            Text('Money moved between your own accounts is recorded once, not as a sale or an expense.', style: text.bodySmall),
            const SizedBox(height: 14),
            const SectionLabel('From'),
            _chips(_from, (id) => _from = id),
            const SizedBox(height: 12),
            const SectionLabel('To'),
            _chips(_to, (id) => _to = id),
            const SizedBox(height: 12),
            TextField(
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Amount', prefixText: '₹ '),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _date,
              keyboardType: TextInputType.datetime,
              decoration: const InputDecoration(labelText: 'Date', helperText: 'Year, month and day, like 2026-11-03'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _reference,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(labelText: 'Reference (optional)', helperText: 'The UTR or cheque number, if you have it'),
            ),
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(_error, style: text.bodyMedium?.copyWith(color: Palette.danger)),
            ],
            const SizedBox(height: 14),
            FilledButton(onPressed: _submit, child: const Text('Preview')),
          ],
        ),
      ),
    );
  }
}

class _RuleAction {
  const _RuleAction({this.remove, this.add});

  final BankRule? remove;
  final BankRule? add;
}

class _RulesSheet extends StatefulWidget {
  const _RulesSheet({required this.rules, required this.accounts});

  final List<BankRule> rules;
  final List<OwnAccount> accounts;

  @override
  State<_RulesSheet> createState() => _RulesSheetState();
}

class _RulesSheetState extends State<_RulesSheet> {
  final _contains = TextEditingController();
  final _party = TextEditingController();
  final _note = TextEditingController();
  String _side = 'any';
  String _kind = 'receipt';
  ExpenseHead? _head;
  String _otherAccount = '';
  bool _adding = false;
  String _error = '';

  @override
  void dispose() {
    _contains.dispose();
    _party.dispose();
    _note.dispose();
    super.dispose();
  }

  bool get _namesParty => _kind == 'receipt' || _kind == 'payment' || _kind == 'charge';

  Future<void> _pickHead() async {
    final head = await showHeadPicker(context, current: _head?.code, title: 'Which head is the expense under?');
    if (head != null && mounted) setState(() => _head = head);
  }

  void _submit() {
    final contains = _contains.text.trim();
    if (contains.isEmpty) return setState(() => _error = 'Enter the words that appear in the narration.');
    final party = _party.text.trim();
    if (_kind == 'receipt' && party.isEmpty) return setState(() => _error = 'Say which customer the money is from.');
    if (_kind == 'payment' && party.isEmpty) return setState(() => _error = 'Say which supplier the money goes to.');
    final head = _head;
    if (_kind == 'expense' && head == null) return setState(() => _error = 'Pick the head for the expense.');
    if (_kind == 'transfer' && _otherAccount.isEmpty) return setState(() => _error = 'Pick the other account.');
    Navigator.of(context).pop(
      _RuleAction(
        add: BankRule(
          id: '',
          side: _side,
          contains: contains,
          pattern: '',
          minAmount: null,
          maxAmount: null,
          kind: _kind,
          partyName: _namesParty ? party : '',
          head: _kind == 'expense' && head != null ? head.code : '',
          otherAccount: _kind == 'transfer' ? _otherAccount : '',
          note: _kind == 'ignore' ? _note.text.trim() : '',
          hits: 0,
          createdOn: '',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Rules', style: text.titleLarge),
            const SizedBox(height: 4),
            Text('A rule books a statement line on its own when the words match. Rules run on every statement you bring in and in the daily run.', style: text.bodySmall),
            const SizedBox(height: 12),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  if (widget.rules.isEmpty)
                    Text('No rules yet.', style: text.bodyMedium)
                  else
                    for (final rule in widget.rules)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(rule.words),
                        subtitle: Text('${rule.id} · ${rule.hitsWords}'),
                        trailing: TextButton(
                          onPressed: () => Navigator.of(context).pop(_RuleAction(remove: rule)),
                          child: const Text('Remove'),
                        ),
                      ),
                  const SizedBox(height: 12),
                  if (!_adding)
                    OutlinedButton(onPressed: () => setState(() => _adding = true), child: const Text('Add a rule'))
                  else ...[
                    const SectionLabel('When'),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final entry in bankRuleSides.entries)
                          ChoiceChip(
                            label: Text(entry.value),
                            selected: _side == entry.key,
                            selectedColor: Palette.sunken,
                            showCheckmark: false,
                            onSelected: (_) => setState(() => _side = entry.key),
                          ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _contains,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(labelText: 'Words in the narration', helperText: 'For example SHARMA TRADERS or SMS CHARGES'),
                    ),
                    const SizedBox(height: 14),
                    const SectionLabel('Then'),
                    DropdownButtonFormField<String>(
                      isExpanded: true,
                      initialValue: _kind,
                      decoration: const InputDecoration(labelText: 'Record it as'),
                      items: [
                        for (final entry in bankRuleKinds.entries) DropdownMenuItem(value: entry.key, child: Text(entry.value)),
                      ],
                      onChanged: (value) => setState(() => _kind = value ?? 'receipt'),
                    ),
                    if (_namesParty) ...[
                      const SizedBox(height: 10),
                      TextField(
                        controller: _party,
                        textCapitalization: TextCapitalization.words,
                        decoration: InputDecoration(
                          labelText: _kind == 'receipt' ? 'Customer' : _kind == 'payment' ? 'Supplier' : 'Paid to (optional)',
                        ),
                      ),
                    ],
                    if (_kind == 'expense') ...[
                      const SizedBox(height: 10),
                      OutlinedButton(onPressed: _pickHead, child: Text(_head == null ? 'Which head?' : 'Head: ${_head!.name}')),
                    ],
                    if (_kind == 'transfer') ...[
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final account in widget.accounts)
                            ChoiceChip(
                              label: Text(account.label),
                              selected: _otherAccount == account.id,
                              selectedColor: Palette.sunken,
                              showCheckmark: false,
                              onSelected: (_) => setState(() => _otherAccount = account.id),
                            ),
                        ],
                      ),
                    ],
                    if (_kind == 'ignore') ...[
                      const SizedBox(height: 10),
                      TextField(
                        controller: _note,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: const InputDecoration(labelText: 'Why it is left out (optional)'),
                      ),
                    ],
                    if (_error.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(_error, style: text.bodyMedium?.copyWith(color: Palette.danger)),
                    ],
                    const SizedBox(height: 14),
                    FilledButton(onPressed: _submit, child: const Text('Preview')),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AccountSheet extends StatefulWidget {
  const _AccountSheet();

  @override
  State<_AccountSheet> createState() => _AccountSheetState();
}

class _AccountSheetState extends State<_AccountSheet> {
  final _label = TextEditingController();
  final _number = TextEditingController();
  final _ifsc = TextEditingController();
  String _kind = 'bank';
  String _error = '';

  @override
  void dispose() {
    _label.dispose();
    _number.dispose();
    _ifsc.dispose();
    super.dispose();
  }

  void _submit() {
    final label = _label.text.trim();
    if (label.isEmpty) return setState(() => _error = 'Give the account a name, for example HDFC current.');
    final digits = _number.text.replaceAll(RegExp(r'\D'), '');
    final ifsc = _ifsc.text.trim().toUpperCase();
    Navigator.of(context).pop(<String, Object?>{
      'label': label,
      'kind': _kind,
      if (digits.isNotEmpty) 'maskedNumber': digits.length > 4 ? digits.substring(digits.length - 4) : digits,
      if (_kind == 'bank' && ifsc.isNotEmpty) 'ifsc': ifsc,
    });
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Add an account', style: text.titleLarge),
            const SizedBox(height: 4),
            Text('Another bank account, a cash box or a wallet. Money moved between your accounts is then recorded once.', style: text.bodySmall),
            const SizedBox(height: 12),
            TextField(
              controller: _label,
              autofocus: true,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Name', helperText: 'For example HDFC current or Paytm wallet'),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final entry in ownAccountKinds.entries)
                  ChoiceChip(
                    label: Text(entry.value),
                    selected: _kind == entry.key,
                    selectedColor: Palette.sunken,
                    showCheckmark: false,
                    onSelected: (_) => setState(() => _kind = entry.key),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _number,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Last 4 digits of the account number (optional)'),
            ),
            if (_kind == 'bank') ...[
              const SizedBox(height: 10),
              TextField(
                controller: _ifsc,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(labelText: 'IFSC (optional)'),
              ),
            ],
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(_error, style: text.bodyMedium?.copyWith(color: Palette.danger)),
            ],
            const SizedBox(height: 14),
            FilledButton(onPressed: _submit, child: const Text('Preview')),
          ],
        ),
      ),
    );
  }
}
