import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../proposal_flow.dart';
import '../registers.dart';
import '../theme.dart';
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
    return Scaffold(
      appBar: AppBar(title: const Text('Expenses')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
        children: [
          if (threads.isEmpty)
            const EmptyNote(
              text:
                  'No expenses yet. Add one and MyCA will put it under the right head: rent, salaries, travel and so on.',
            )
          else
            Panel(
              children: [
                for (final thread in threads)
                  RowCard(
                    leading: TintTile(
                      tint: Tint.expense,
                      letter: thread.name[0],
                    ),
                    title: thread.name,
                    subtitle: headSubtitle(thread),
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
              label: const Text('Expense'),
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
      title: 'Move ${expense.title} to',
    );
    if (head == null || !mounted || head.code == expense.head) return;
    await propose('Move ${expense.title} to ${head.name}', 'set_expense_head', {
      'id': expense.id,
      'head': head.code,
    });
  }

  @override
  Widget build(BuildContext context) {
    final expenses =
        AppScope.of(context).snapshot?.expenses ?? const <Expense>[];
    final thread = headThread(expenses, widget.code, widget.name);
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            TintTile(tint: Tint.expense, letter: widget.name[0], size: 34),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    thread.expenses.isEmpty
                        ? 'Expense head'
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
                  EmptyNote(text: 'Nothing under ${widget.name} yet.'),
                for (final expense in thread.expenses)
                  Bubble(
                    text: expense.title,
                    amount: rupees(expense.amount),
                    label: longDate(expense.date),
                    stamp: expense.mode == 'cash' ? 'Cash' : null,
                    footnotes: [
                      if (expense.tagSource == 'default')
                        'Tap to move it to the right head',
                      if (expense.gstRate > 0 && !expense.inputCredit)
                        'GST ${plainNumber(expense.gstRate)}% inside, no credit taken',
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
                      label: const Text('Expense'),
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
