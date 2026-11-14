import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../format.dart';
import '../theme.dart';
import '../widgets.dart';
import 'ims_screen.dart';
import 'remind_supplier_screen.dart';

class CreditCard extends StatefulWidget {
  const CreditCard({super.key, required this.period});

  final String period;

  @override
  State<CreditCard> createState() => _CreditCardState();
}

class _CreditCardState extends State<CreditCard> {
  Future<CreditCheck?>? _check;
  bool _busy = false;
  String _note = '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _check ??= _load();
  }

  @override
  void didUpdateWidget(CreditCard old) {
    super.didUpdateWidget(old);
    if (old.period != widget.period) {
      final next = _load();
      setState(() {
        _check = next;
        _note = '';
      });
    }
  }

  Future<CreditCheck?> _load() async => CreditCheck.fromTool(
    await AppScope.of(
      context,
    ).api.query('credit_at_risk', {'period': widget.period}),
  );

  Future<void> _add2b() async {
    final state = AppScope.of(context);
    final picked = await state.pickTextFile(const ['csv']);
    if (picked == null || !mounted) return;
    setState(() {
      _busy = true;
      _note = '';
    });
    var note = '';
    try {
      final sha = await state.api.upload(picked.name, picked.content);
      final held = await state.api.propose('import_gstr2b', {
        'documentSha256': sha,
        'period': widget.period,
        'fileName': shortFileName(picked.name),
      });
      final preview = held.preview;
      if (preview == null) {
        note = held.reply;
      } else if (mounted && await _confirm(preview)) {
        final done = await state.api.confirm(preview.token);
        note = done.posted
            ? 'Added. Your bills are checked against it below.'
            : done.reply;
      } else {
        await state.api.discard();
        note = 'Not added.';
      }
    } on MycaApiException catch (err) {
      note = err.message;
    }
    if (!mounted) return;
    final next = _load();
    setState(() {
      _busy = false;
      _note = note;
      _check = next;
    });
  }

  Future<bool> _confirm(ChatPreview preview) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Add this GSTR-2B?'),
        content: Text([preview.summary, ...preview.effects].join('\n\n')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialog).pop(true),
            child: const Text('Add'),
          ),
        ],
      ),
    );
    return yes ?? false;
  }

  void _showSupplier(CreditCheck check, SupplierRisk supplier) {
    final risks = check.risks
        .where(
          (r) =>
              (r.gstin.isEmpty ? r.supplier : r.gstin) ==
              (supplier.gstin.isEmpty ? supplier.supplier : supplier.gstin),
        )
        .toList();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) {
        final text = Theme.of(sheet).textTheme;
        return SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(22, 4, 22, 22),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(supplier.supplier, style: text.headlineSmall),
                if (supplier.gstin.isNotEmpty)
                  Text(supplier.gstin, style: text.bodySmall),
                const SizedBox(height: 14),
                for (final risk in risks) ...[
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          risk.supplierInvoiceNo.isEmpty
                              ? risk.billId
                              : 'Bill ${risk.supplierInvoiceNo}',
                          style: text.titleMedium,
                        ),
                      ),
                      Text(
                        rupees(risk.credit),
                        style: text.titleMedium?.copyWith(
                          fontFeatures: moneyFigures,
                        ),
                      ),
                    ],
                  ),
                  Text(longDate(risk.date), style: text.bodySmall),
                  const SizedBox(height: 4),
                  Text(risk.why, style: text.bodyMedium),
                  const SizedBox(height: 14),
                ],
                if (check.hasStatement &&
                    risks.any((r) => r.reason != 'NO_SUPPLIER_NUMBER')) ...[
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: () {
                        final navigator = Navigator.of(context);
                        Navigator.of(sheet).pop();
                        navigator.push(
                          MaterialPageRoute<void>(
                            builder: (_) => RemindSupplierScreen(
                              supplier: supplier.gstin.isEmpty
                                  ? supplier.supplier
                                  : supplier.gstin,
                              period: check.period,
                            ),
                          ),
                        );
                      },
                      child: const Text('Remind supplier'),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(sheet).pop(),
                    child: const Text('Got it'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return FutureBuilder<CreditCheck?>(
      future: _check,
      builder: (context, state) {
        final check = state.data;
        return Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: Palette.surface,
            borderRadius: BorderRadius.circular(radiusCard),
            border: Border.all(color: Palette.line),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'INPUT CREDIT AGAINST GSTR-2B, ${monthLabel(widget.period).toUpperCase()}',
                style: text.labelSmall,
              ),
              const SizedBox(height: 8),
              if (check == null)
                Text(
                  state.connectionState == ConnectionState.done
                      ? 'Could not check.'
                      : 'Checking…',
                  style: text.bodyMedium,
                )
              else if (check.bills == 0)
                Text(
                  'No purchase bills with GST in this month.',
                  style: text.bodyLarge,
                )
              else ...[
                AmountRow(
                  start: Text('Matched in 2B', style: text.bodyMedium),
                  amount: rupees(check.creditMatched),
                  style: text.bodyMedium?.copyWith(fontFeatures: moneyFigures),
                ),
                const SizedBox(height: 2),
                AmountRow(
                  start: Text(
                    'At risk',
                    style: text.titleMedium?.copyWith(
                      color: check.creditAtRisk > 0 ? Palette.warn : Palette.ink,
                    ),
                  ),
                  amount: rupees(check.creditAtRisk),
                  style: text.titleMedium?.copyWith(
                    fontFeatures: moneyFigures,
                    color: check.creditAtRisk > 0 ? Palette.warn : Palette.ink,
                  ),
                ),
                if (!check.hasStatement) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Add the GSTR-2B for this month to see which bills your suppliers have reported.',
                    style: text.bodySmall,
                  ),
                ] else if (check.bySupplier.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  const Divider(),
                  for (final supplier in check.bySupplier)
                    InkWell(
                      onTap: () => _showSupplier(check, supplier),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: AmountRow(
                          start: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                supplier.supplier,
                                style: text.titleMedium,
                              ),
                              Text(
                                supplier.bills == 1
                                    ? '1 bill'
                                    : '${supplier.bills} bills',
                                style: text.bodySmall,
                              ),
                            ],
                          ),
                          amount: rupees(supplier.credit),
                          style: text.titleMedium?.copyWith(
                            fontFeatures: moneyFigures,
                          ),
                          after: Padding(
                            padding: EdgeInsets.only(left: 6),
                            child: Icon(
                              Icons.chevron_right,
                              size: 18,
                              color: Palette.muted,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
                if (check.notBooked > 0) ...[
                  const SizedBox(height: 6),
                  Text(
                    '${check.notBooked == 1 ? '1 bill' : '${check.notBooked} bills'} in 2B ${check.notBooked == 1 ? 'is' : 'are'} not in your books.',
                    style: text.bodySmall,
                  ),
                ],
              ],
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: _busy ? null : _add2b,
                  child: Text(
                    _busy
                        ? 'Adding…'
                        : check?.hasStatement == true
                        ? 'Replace GSTR-2B'
                        : 'Add GSTR-2B for ${monthLabel(widget.period)}',
                  ),
                ),
              ),
              if (check?.hasStatement == true) ...[
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton(
                    key: const ValueKey('credit.ims'),
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (_) => ImsScreen(period: widget.period),
                      ),
                    ),
                    child: const Text('Review in IMS'),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    'Using ${check!.statementFile}, added ${longDate(check.statementOn)}.',
                    style: text.bodySmall,
                  ),
                ),
              ],
              if (_note.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(_note, style: text.bodyMedium),
                ),
            ],
          ),
        );
      },
    );
  }
}
