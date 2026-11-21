import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../proposal_flow.dart';
import '../registers.dart';
import '../theme.dart';
import '../uae/uae_strings.dart';
import '../widgets.dart';
import 'expense_screen.dart';
import 'head_picker.dart';

class ExpensesScreen extends StatelessWidget {
  const ExpensesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final expenses =
        AppScope.of(context).snapshot?.expenses ?? const <Expense>[];
    final threads = headThreadsOf(expenses);
    final s = UaeStrings.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(s.expenses)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
        children: [
          if (threads.isEmpty)
            EmptyNote(text: s.noExpensesYet)
          else
            Panel(
              children: [
                for (final thread in threads)
                  RowCard(
                    leading: TintTile(
                      tint: Tint.expense,
                      letter: s.accountName(thread.name).characters.first,
                    ),
                    title: s.accountName(thread.name),
                    subtitle: s.headSubtitle(thread),
                    trailing: const Chevron(),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => ExpenseHeadScreen(
                          code: thread.code,
                          name: thread.name,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          const SizedBox(height: 16),
          Align(
            alignment: Alignment.centerLeft,
            child: ActionChip(
              avatar: const Icon(Icons.add, size: 18),
              label: Text(s.expense),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(builder: (_) => const ExpenseScreen()),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class ExpenseHeadScreen extends StatefulWidget {
  const ExpenseHeadScreen({super.key, required this.code, required this.name});

  final String code;
  final String name;

  @override
  State<ExpenseHeadScreen> createState() => _ExpenseHeadScreenState();
}

class _ExpenseHeadScreenState extends State<ExpenseHeadScreen>
    with ProposalFlow {
  final _scroll = ScrollController();
  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  Future<void> onPosted() => AppScope.of(context).refresh();

  @override
  void onThreadChanged() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _move(Expense expense) async {
    final head = await showHeadPicker(
      context,
      current: expense.head,
      title: UaeStrings.of(context).moveTo(expense.title),
    );
    if (head == null || !mounted || head.code == expense.head) return;
    await propose(UaeStrings.of(context).moveSaid(expense.title, UaeStrings.of(context).accountName(head.name)), 'set_expense_head', {
      'id': expense.id,
      'head': head.code,
    });
  }

  @override
  Widget build(BuildContext context) {
    final expenses =
        AppScope.of(context).snapshot?.expenses ?? const <Expense>[];
    final thread = headThread(expenses, widget.code, widget.name);
    final s = UaeStrings.of(context);
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            TintTile(tint: Tint.expense, letter: s.accountName(widget.name).characters.first, size: 34),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    s.accountName(widget.name),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    thread.expenses.isEmpty
                        ? s.expenseHead
                        : rupees(thread.total),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Palette.muted,
                      fontFeatures: moneyFigures,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              controller: _scroll,
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              children: [
                if (thread.expenses.isEmpty && entries.isEmpty)
                  EmptyNote(text: s.nothingUnder(s.accountName(widget.name))),
                for (final expense in thread.expenses)
                  Bubble(
                    text: expense.title,
                    amount: rupees(expense.amount),
                    label: s.longDate(expense.date),
                    stamp: expense.mode == 'cash' ? inText(context, 'Cash') : null,
                    footnotes: [
                      if (expense.tagSource == 'default')
                        s.tapToMoveHead,
                      if (expense.gstRate > 0 && !expense.inputCredit && moneyCountry != 'AE')
                        inFormat(context, '{tax} {rate}% inside, no credit taken', {'tax': salesTaxName, 'rate': plainNumber(expense.gstRate)}),
                    ],
                    onTap: busy ? null : () => _move(expense),
                  ),
                for (final entry in entries) entry.toBubble(),
              ],
            ),
          ),
          if (pending != null)
            ProposalBar(
              busy: busy,
              onPost: postPending,
              onDiscard: discardPending,
            )
          else
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Row(
                  children: [
                    ActionChip(
                      avatar: const Icon(Icons.add, size: 18),
                      label: Text(s.expense),
                      onPressed: busy
                          ? null
                          : () => Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (_) => ExpenseScreen(
                                  head: ExpenseHead(
                                    code: widget.code,
                                    name: widget.name,
                                  ),
                                ),
                              ),
                            ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
