import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../india/india_strings.dart';
import '../proposal_flow.dart';
import '../theme.dart';
import '../widgets.dart';

class PayBillsScreen extends StatefulWidget {
  const PayBillsScreen({super.key});

  @override
  State<PayBillsScreen> createState() => _PayBillsScreenState();
}

class _PayBillsScreenState extends State<PayBillsScreen> with ProposalFlow {
  Future<PaymentRun?>? _run;
  final _chosen = <String>{};
  String _doneNote = '';

  @override
  MycaApi get api => AppScope.of(context).api;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _run ??= _load();
  }

  Future<PaymentRun?> _load() async {
    final run = PaymentRun.fromTool(await api.query('payment_run'));
    if (run != null) _chosen.addAll(run.proposed.map((b) => b.billId));
    return run;
  }

  @override
  Future<void> onPosted() async {
    HapticFeedback.mediumImpact();
    setState(() => _doneNote = inText(context, 'Recorded. Make the transfers from your bank app; MyCA has posted the payments against each bill.'));
  }

  Future<void> _pay() => propose(inText(context, 'Pay the chosen bills from the bank'), 'record_payment_run', {
    'billIds': _chosen.toList()..sort(),
    'mode': 'bank',
  });

  Widget _bill(PaymentRunBill b, TextTheme text, {required bool choosable}) {
    final on = _chosen.contains(b.billId);
    return CheckboxListTile(
      value: choosable ? on : false,
      onChanged: !choosable || pending != null || _doneNote.isNotEmpty
          ? null
          : (v) => setState(() => v == true ? _chosen.add(b.billId) : _chosen.remove(b.billId)),
      contentPadding: EdgeInsets.zero,
      controlAffinity: ListTileControlAffinity.leading,
      title: Text('${b.supplier} · ${rupees(b.outstanding)}', style: text.bodyLarge?.copyWith(fontFeatures: moneyFigures)),
      subtitle: Text(
        b.supplierInvoiceNo.isEmpty
            ? '${b.billId} · ${b.whenWords}'
            : inFormat(context, '{bill} (their {theirs}) · {when}', {'bill': b.billId, 'theirs': b.supplierInvoiceNo, 'when': b.whenWords}),
        style: text.bodySmall?.copyWith(color: b.urgent ? Palette.warn : Palette.muted),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(inText(context, 'Who to pay'))),
      body: FutureBuilder<PaymentRun?>(
        future: _run,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final run = snap.data;
          if (run == null) {
            return EmptyNote(text: inText(context, 'The payment run could not be worked out.'));
          }
          final chosenTotal = run.proposed.where((b) => _chosen.contains(b.billId)).fold<num>(0, (s, b) => s + b.outstanding)
              + run.consider.where((b) => _chosen.contains(b.billId)).fold<num>(0, (s, b) => s + b.outstanding);
          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                  children: [
                    if (run.proposed.isEmpty && run.consider.isEmpty)
                      Text(inFormat(context, 'Nothing needs paying in the next {days} days.', {'days': run.windowDays}), style: text.bodyLarge)
                    else ...[
                      Text(inText(context, 'Pay now'), style: text.titleMedium),
                      Text(
                        inText(context, 'MSMED pay-by dates first, then bills near the 180-day credit limit, then agreed terms.'),
                        style: text.bodySmall?.copyWith(color: Palette.muted),
                      ),
                      for (final b in run.proposed) _bill(b, text, choosable: true),
                      if (run.consider.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Text(inText(context, 'Consider'), style: text.titleMedium),
                        Text(inText(context, 'Older than 45 days with no agreed terms.'), style: text.bodySmall?.copyWith(color: Palette.muted)),
                        for (final b in run.consider) _bill(b, text, choosable: true),
                      ],
                    ],
                    if (run.held.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(inText(context, 'Held back'), style: text.titleMedium),
                      for (final b in run.held)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Text(
                            inFormat(context, '{supplier} {amount} on {bill}: {reason}', {'supplier': b.supplier, 'amount': rupees(b.outstanding), 'bill': b.billId, 'reason': b.reason}),
                            style: text.bodySmall?.copyWith(color: Palette.warn),
                          ),
                        ),
                    ],
                    if (run.later.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Text(
                        inCount(context, run.later.length, '1 bill ({amount}) can wait.', '{n} bills ({amount}) can wait.', {'amount': rupees(run.laterTotal)}),
                        style: text.bodySmall?.copyWith(color: Palette.muted),
                      ),
                    ],
                    const SizedBox(height: 16),
                    Text(
                      run.fromReading
                          ? inFormat(context, 'Bank and cash {balance} now, {after} after paying {chosen}.', {
                              'balance': rupees(run.balance),
                              'after': rupees(run.balance - chosenTotal),
                              'chosen': rupees(chosenTotal),
                            })
                          : inFormat(context, 'MyCA has only the recorded figures for bank and cash ({balance}). Give your balance on the Cash screen for a true picture.', {'balance': rupees(run.balance)}),
                      style: text.bodyMedium?.copyWith(fontFeatures: moneyFigures, color: run.fromReading ? null : Palette.warn),
                    ),
                    if (run.verdictWords.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(run.verdictWords, style: text.bodySmall?.copyWith(color: run.verdict == 'no' ? Palette.warn : Palette.muted)),
                      ),
                    const SizedBox(height: 12),
                    if (pending == null && _doneNote.isEmpty && (run.proposed.isNotEmpty || run.consider.isNotEmpty))
                      FilledButton(
                        onPressed: busy || _chosen.isEmpty ? null : _pay,
                        child: Text(inFormat(context, 'Pay {amount} from the bank', {'amount': rupees(chosenTotal)})),
                      ),
                    for (final entry in entries) entry.toBubble(),
                    if (_doneNote.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(_doneNote, style: text.bodyMedium),
                    ],
                  ],
                ),
              ),
              if (pending != null)
                ProposalBar(
                  busy: busy,
                  onPost: postPending,
                  onDiscard: discardPending,
                  postLabel: inText(context, 'Yes, pay them'),
                ),
            ],
          );
        },
      ),
    );
  }
}
