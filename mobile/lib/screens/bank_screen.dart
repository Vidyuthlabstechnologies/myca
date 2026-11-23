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
import '../registers.dart';
import '../theme.dart';
import '../uae/uae_edition.dart';
import '../uae/uae_strings.dart';
import '../widgets.dart';
import 'head_picker.dart';
import 'party_picker.dart';

const _filters = {'all': 'All', 'unmatched': 'Not matched yet', 'matched': 'Matched', 'booked': 'Booked', 'ignored': 'Ignored'};

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
  String _loadError = '';
  bool _loadFailed = false;

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
      final recon = BankReconciliation.fromTool(loaded(await api.query('bank_reconciliation', args)));
      _loadError = '';
      _loadFailed = false;
      return recon;
    } on MycaApiException catch (err) {
      _loadError = err.message;
      _loadFailed = true;
      return null;
    }
  }

  void _toggleWindow() => setState(() {
    _older = !_older;
    _recon = _load();
  });

  String get _windowWords => UaeStrings.of(context).windowWords(_older);

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
          ChoiceChip(label: Text(UaeStrings.of(context).accountLabel(account.label)), selected: false, onSelected: (_) => Navigator.of(sheet).pop(account)),
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
    final s = UaeStrings.of(context);
    if (choice.kind == 'unlink') {
      return propose(s.unlinkSaid(line.id), 'unmatch_bank_line', {'lineId': line.id});
    }
    final remember = {if (choice.remember) 'remember': true};
    final suggestion = choice.suggestion;
    if (suggestion != null && suggestion.kind != 'transfer') {
      return _match(line, s.bankSuggestionWords(suggestion), {...suggestion.matchArgs, if (suggestion.kind != 'books') ...remember});
    }
    switch (choice.kind) {
      case 'receipt':
        final party = await showPartyPicker(context, RegisterKind.sales);
        if (party == null || !mounted) return;
        await _match(line, s.bankMatchSaid('receipt', party: party.name), {'kind': 'receipt', 'partyName': party.name, ...remember});
      case 'payment':
        final party = await showPartyPicker(context, RegisterKind.purchases);
        if (party == null || !mounted) return;
        await _match(line, s.bankMatchSaid('payment', party: party.name), {'kind': 'payment', 'partyName': party.name, ...remember});
      case 'expense':
        final head = await showHeadPicker(context, title: s.whichHeadIsIt);
        if (head == null || !mounted) return;
        await _match(line, s.bankMatchSaid('expense', head: s.accountName(head.name)), {'kind': 'expense', 'head': head.code, ...remember});
      case 'charge':
        await _match(line, s.bankMatchSaid('charge'), {'kind': 'charge', ...remember});
      case 'interest':
        await _match(line, s.bankMatchSaid('interest'), {'kind': 'interest', ...remember});
      case 'transfer':
        final others = (recon.accounts.isEmpty ? _builtInAccounts : recon.accounts).where((a) => a.id != _account).toList();
        final other = await _pickAccount(others, s.accountFromOrTo(line.isIn));
        if (other == null || !mounted) return;
        await _match(line, s.bankMatchSaid('transfer', account: s.accountLabel(other.label), isIn: line.isIn), {'kind': 'transfer', 'otherAccount': other.id, ...remember});
      case 'ignore':
        final note = await showModalBottomSheet<String>(context: context, isScrollControlled: true, builder: (_) => const _NoteSheet());
        if (note == null || !mounted) return;
        await _match(line, s.bankMatchSaid('ignore', note: note), {'kind': 'ignore', if (note.isNotEmpty) 'note': note, ...remember});
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
    await propose(UaeStrings.of(context).transferSaid(rupees(draft.amount), UaeStrings.of(context).accountLabel(draft.from.label), UaeStrings.of(context).accountLabel(draft.to.label)), 'record_transfer', {
      'fromAccount': draft.from.id,
      'toAccount': draft.to.id,
      'amount': draft.amount,
      'date': draft.date,
      if (draft.reference.isNotEmpty) 'reference': draft.reference,
    });
  }

  Future<void> _bookCharges() => propose(UaeStrings.of(context).bookChargesSaid, 'book_bank_charges', {'account': _account});

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
    if (remove != null) return propose(UaeStrings.of(context).removeRuleSaid(remove.id), 'remove_bank_rule', {'id': remove.id});
    final rule = action.add;
    if (rule != null) await propose(UaeStrings.of(context).ruleSaid(UaeStrings.of(context).ruleWords(rule)), 'add_bank_rule', rule.args);
  }

  Future<void> _addAccount() async {
    final draft = await showModalBottomSheet<Map<String, Object?>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _AccountSheet(),
    );
    if (draft == null || !mounted) return;
    await propose(UaeStrings.of(context).addAccountSaid('${draft['label']}'), 'set_bank_account', draft);
  }

  Future<void> _saveExcel() async {
    final state = AppScope.of(context);
    final aeStrings = uaeEdition(context) ? UaeStrings.of(context) : null;
    setState(() {
      _saving = true;
      _note = '';
    });
    var note = '';
    try {
      note = await saveXlsx(state, toolData(await state.api.query('export_xlsx', {'report': 'bank_reconciliation', 'account': _account})), aeStrings);
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    setState(() {
      _saving = false;
      _note = note;
    });
  }

  Widget _actions(BankReconciliation? recon, UaeStrings s) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      ActionChip(label: Text(s.bringInStatement), onPressed: busy ? null : _bringIn),
      ActionChip(label: Text(s.recordTransfer), onPressed: busy ? null : () => _transfer(recon)),
      ActionChip(label: Text(s.bookBankCharges), onPressed: busy ? null : _bookCharges),
      ActionChip(label: Text(s.rules), onPressed: busy ? null : () => _rules(recon)),
      ActionChip(label: Text(s.addAccount), onPressed: busy ? null : _addAccount),
      ActionChip(label: Text(s.saveAsExcel), onPressed: busy || _saving ? null : _saveExcel),
    ],
  );

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final s = UaeStrings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s.bank)),
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
                              label: Text(s.accountLabel(account.label)),
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
                    else if (recon == null && _loadFailed)
                      LoadFailed(message: _loadError.isEmpty ? null : _loadError, onRetry: () => setState(() => _recon = _load()))
                    else if (recon == null || recon.empty)
                      Text(s.bankEmptyNote, style: text.bodyMedium)
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
                              label: Text(s.bankFilter(entry.key)),
                              selected: _filter == entry.key,
                              selectedColor: Palette.sunken,
                              showCheckmark: false,
                              onSelected: (_) => setState(() => _filter = entry.key),
                            ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      if (lines.isEmpty)
                        Text(s.bankEmpty(_filter), style: text.bodyMedium)
                      else
                        Panel(
                          children: [
                            for (final line in lines)
                              RowCard(
                                key: ValueKey('bank.${line.id}'),
                                leading: TintTile(tint: line.isIn ? Tint.sales : Tint.purchases, mark: line.isIn ? Mark.bringIn : Mark.expense),
                                title: s.bankLineTitle(line),
                                subtitle: s.bankLineSubtitle(line),
                                trailing: ConstrainedBox(
                                  constraints: const BoxConstraints(maxWidth: 120),
                                  child: Text(
                                    s.bankStatus(line.status),
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
                        child: TextButton(onPressed: busy ? null : _toggleWindow, child: Text(s.showOlder(_older))),
                      ),
                      if (recon.books.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        SectionLabel(s.inBooksNotOnStatement(recon.lines.isEmpty)),
                        Panel(
                          children: [
                            for (final row in recon.books)
                              RowCard(
                                leading: const TintTile(tint: Tint.ask, mark: Mark.paper),
                                title: s.bankBooksTitle(row),
                                subtitle: s.bankBooksSubtitle(row),
                              ),
                          ],
                        ),
                      ],
                    ],
                    const SizedBox(height: 16),
                    _actions(recon, s),
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
    final s = UaeStrings.of(context);
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        _Figure(
          label: s.statementBalanceOn(totals.statementOn),
          value: s.statementBalanceWords(totals),
        ),
        _Figure(label: s.inTheBooks, value: rupees(totals.booksBalance)),
        _Figure(label: s.difference, value: totals.differenceWords),
        _Figure(label: s.lines, value: s.unmatchedWords(totals)),
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
    final s = UaeStrings.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(s.bankLineTitle(line), style: text.headlineSmall, maxLines: 3, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 4),
            Text(s.bankLineDetail(line), style: text.bodySmall),
            if (line.tieBreak)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(s.runningBalanceOff, style: text.bodySmall?.copyWith(color: Palette.warn)),
              ),
            const SizedBox(height: 10),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  if (!line.open) ...[
                    if (match != null) Text(s.bankMatchWords(match), style: text.bodyMedium),
                    const SizedBox(height: 12),
                    if (line.linked)
                      FilledButton(onPressed: () => _pick('unlink'), child: Text(s.unlink))
                    else
                      Text(s.postedFromLine, style: text.bodyMedium),
                  ] else ...[
                    if (line.suggestions.isNotEmpty) ...[
                      SectionLabel(s.likelyMatches),
                      for (final suggestion in line.suggestions)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const TintTile(tint: Tint.sales, mark: Mark.confirm),
                          title: Text(s.bankSuggestionWords(suggestion)),
                          subtitle: suggestion.why.isEmpty ? null : Text(suggestion.why),
                          onTap: () => _pick(suggestion.kind, suggestion),
                        ),
                      const SizedBox(height: 10),
                    ],
                    SectionLabel(s.orRecordAs),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        if (line.isIn) ActionChip(label: Text(s.receiptFromCustomer), onPressed: () => _pick('receipt')),
                        if (!line.isIn) ActionChip(label: Text(s.paymentToSupplier), onPressed: () => _pick('payment')),
                        if (!line.isIn) ActionChip(label: Text(s.expenseEllipsis), onPressed: () => _pick('expense')),
                        if (!line.isIn) ActionChip(label: Text(s.bankCharge), onPressed: () => _pick('charge')),
                        if (line.isIn) ActionChip(label: Text(s.interestEarned), onPressed: () => _pick('interest')),
                        ActionChip(label: Text(s.transferEllipsis), onPressed: () => _pick('transfer')),
                        ActionChip(label: Text(s.ignore), onPressed: () => _pick('ignore')),
                      ],
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _remember,
                      onChanged: (value) => setState(() => _remember = value),
                      title: Text(s.rememberFor(hint)),
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
    final s = UaeStrings.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(s.leaveLineOut, style: text.titleLarge),
          const SizedBox(height: 4),
          Text(s.staysIgnored, style: text.bodySmall),
          const SizedBox(height: 12),
          TextField(
            controller: _note,
            autofocus: true,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(labelText: s.whyOptional, helperText: s.whyOptionalHint),
          ),
          const SizedBox(height: 14),
          FilledButton(onPressed: () => Navigator.of(context).pop(_note.text.trim()), child: Text(s.ignoreThisLine)),
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
    if (amount == null || amount <= 0) return setState(() => _error = UaeStrings.of(context).enterAmountMoved);
    final from = widget.accounts.where((a) => a.id == _from).firstOrNull;
    final to = widget.accounts.where((a) => a.id == _to).firstOrNull;
    if (from == null || to == null) return setState(() => _error = UaeStrings.of(context).pickBothAccounts);
    if (from.id == to.id) return setState(() => _error = UaeStrings.of(context).pickTwoAccounts);
    final date = _date.text.trim();
    if (!RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(date) || DateTime.tryParse(date) == null) {
      return setState(() => _error = UaeStrings.of(context).unreadableDate);
    }
    Navigator.of(context).pop(_TransferDraft(from: from, to: to, amount: amount, date: date, reference: _reference.text.trim()));
  }

  Widget _chips(String picked, void Function(String id) onPick) => Wrap(
    spacing: 8,
    runSpacing: 8,
    children: [
      for (final account in widget.accounts)
        ChoiceChip(
          label: Text(UaeStrings.of(context).accountLabel(account.label)),
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
    final s = UaeStrings.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(s.recordTransfer, style: text.titleLarge),
            const SizedBox(height: 4),
            Text(s.transferNote, style: text.bodySmall),
            const SizedBox(height: 14),
            SectionLabel(s.from),
            _chips(_from, (id) => _from = id),
            const SizedBox(height: 12),
            SectionLabel(s.to),
            _chips(_to, (id) => _to = id),
            const SizedBox(height: 12),
            TextField(
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(labelText: s.amount, prefixText: moneyPrefix),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _date,
              keyboardType: TextInputType.datetime,
              decoration: InputDecoration(labelText: s.date, helperText: s.dateHint),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _reference,
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(labelText: s.referenceOptional, helperText: s.referenceHint),
            ),
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(_error, style: text.bodyMedium?.copyWith(color: Palette.danger)),
            ],
            const SizedBox(height: 14),
            FilledButton(onPressed: _submit, child: Text(s.preview)),
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
    final head = await showHeadPicker(context, current: _head?.code, title: UaeStrings.of(context).whichHeadExpense);
    if (head != null && mounted) setState(() => _head = head);
  }

  void _submit() {
    final s = UaeStrings.of(context);
    final contains = _contains.text.trim();
    if (contains.isEmpty) return setState(() => _error = s.enterNarrationWords);
    final party = _party.text.trim();
    if (_kind == 'receipt' && party.isEmpty) return setState(() => _error = s.sayWhichCustomer);
    if (_kind == 'payment' && party.isEmpty) return setState(() => _error = s.sayWhichSupplier);
    final head = _head;
    if (_kind == 'expense' && head == null) return setState(() => _error = s.pickHeadExpense);
    if (_kind == 'transfer' && _otherAccount.isEmpty) return setState(() => _error = s.pickOtherAccount);
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
    final s = UaeStrings.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.85),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(s.rules, style: text.titleLarge),
            const SizedBox(height: 4),
            Text(s.rulesNote, style: text.bodySmall),
            const SizedBox(height: 12),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  if (widget.rules.isEmpty)
                    Text(s.noRulesYet, style: text.bodyMedium)
                  else
                    for (final rule in widget.rules)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(s.ruleWords(rule)),
                        subtitle: Text('${rule.id} · ${s.ruleHits(rule)}'),
                        trailing: TextButton(
                          onPressed: () => Navigator.of(context).pop(_RuleAction(remove: rule)),
                          child: Text(s.remove),
                        ),
                      ),
                  const SizedBox(height: 12),
                  if (!_adding)
                    OutlinedButton(onPressed: () => setState(() => _adding = true), child: Text(s.addRule))
                  else ...[
                    SectionLabel(s.when),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final entry in bankRuleSides.entries)
                          ChoiceChip(
                            label: Text(s.ruleSide(entry.key)),
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
                      decoration: InputDecoration(labelText: s.narrationWords, helperText: s.narrationWordsHint),
                    ),
                    const SizedBox(height: 14),
                    SectionLabel(s.then),
                    DropdownButtonFormField<String>(
                      isExpanded: true,
                      initialValue: _kind,
                      decoration: InputDecoration(labelText: s.recordItAs),
                      items: [
                        for (final entry in bankRuleKinds.entries) DropdownMenuItem(value: entry.key, child: Text(s.ruleKind(entry.key))),
                      ],
                      onChanged: (value) => setState(() => _kind = value ?? 'receipt'),
                    ),
                    if (_namesParty) ...[
                      const SizedBox(height: 10),
                      TextField(
                        controller: _party,
                        textCapitalization: TextCapitalization.words,
                        decoration: InputDecoration(
                          labelText: s.ruleParty(_kind),
                        ),
                      ),
                    ],
                    if (_kind == 'expense') ...[
                      const SizedBox(height: 10),
                      OutlinedButton(onPressed: _pickHead, child: Text(_head == null ? s.whichHead : s.headChip(s.accountName(_head!.name)))),
                    ],
                    if (_kind == 'transfer') ...[
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final account in widget.accounts)
                            ChoiceChip(
                              label: Text(s.accountLabel(account.label)),
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
                        decoration: InputDecoration(labelText: s.whyLeftOut),
                      ),
                    ],
                    if (_error.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(_error, style: text.bodyMedium?.copyWith(color: Palette.danger)),
                    ],
                    const SizedBox(height: 14),
                    FilledButton(onPressed: _submit, child: Text(s.preview)),
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
    if (label.isEmpty) return setState(() => _error = UaeStrings.of(context).accountNameNeeded);
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
    final s = UaeStrings.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(s.addAccount, style: text.titleLarge),
            const SizedBox(height: 4),
            Text(s.addAccountNote, style: text.bodySmall),
            const SizedBox(height: 12),
            TextField(
              controller: _label,
              autofocus: true,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(labelText: s.name, helperText: s.accountNameHint),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final entry in ownAccountKinds.entries)
                  ChoiceChip(
                    label: Text(s.accountKind(entry.key)),
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
              decoration: InputDecoration(labelText: s.lastFourDigits),
            ),
            if (_kind == 'bank' && moneyCountry != 'AE') ...[
              const SizedBox(height: 10),
              TextField(
                controller: _ifsc,
                textCapitalization: TextCapitalization.characters,
                decoration: InputDecoration(labelText: inText(context, 'IFSC (optional)')),
              ),
            ],
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(_error, style: text.bodyMedium?.copyWith(color: Palette.danger)),
            ],
            const SizedBox(height: 14),
            FilledButton(onPressed: _submit, child: Text(s.preview)),
          ],
        ),
      ),
    );
  }
}
