import 'package:flutter/material.dart';

import '../api/models.dart';
import '../api/myca_api.dart';
import '../app_state.dart';
import '../attention.dart';
import '../format.dart';
import '../marks.dart';
import '../theme.dart';
import '../widgets.dart';

class TaxesScreen extends StatefulWidget {
  const TaxesScreen({super.key});

  @override
  State<TaxesScreen> createState() => _TaxesScreenState();
}

class _TaxesScreenState extends State<TaxesScreen> {
  Future<Today>? _today;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _today ??= loadToday(AppScope.of(context).api);
  }

  Future<void> _reload() async {
    final next = loadToday(AppScope.of(context).api);
    setState(() => _today = next);
    try {
      await next;
    } on MycaApiException {
      return;
    }
  }

  void _explain(ExceptionItem item) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) {
        final text = Theme.of(sheet).textTheme;
        final urgent = isUrgent(item);
        return SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(22, 0, 22, 22),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                MarkIcon(
                  mark: urgent ? Mark.urgent : Mark.dueSoon,
                  color: urgent ? Palette.danger : Palette.warn,
                  size: 28,
                ),
                const SizedBox(height: 14),
                Text(item.title, style: text.headlineSmall),
                const SizedBox(height: 10),
                Text(item.why, style: text.bodyLarge?.copyWith(height: 1.45)),
                if (item.moneyAtRisk > 0) ...[
                  const SizedBox(height: 16),
                  Text('AT RISK', style: text.labelSmall),
                  Text(
                    rupees(item.moneyAtRisk),
                    style: text.headlineMedium?.copyWith(
                      fontFeatures: moneyFigures,
                    ),
                  ),
                ],
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
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
    return Scaffold(
      appBar: AppBar(title: const Text('Taxes and filings')),
      body: FutureBuilder<Today>(
        future: _today,
        builder: (context, state) {
          if (state.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          final today = state.data;
          if (today == null) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    '${state.error ?? 'Could not load.'}',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: _reload,
                    child: const Text('Try again'),
                  ),
                ],
              ),
            );
          }
          final open = needsYou(today);
          final upcoming = comingUp(today);
          final gst = today.gst;
          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
              children: [
                if (gst != null) _GstCard(gst: gst),
                const SizedBox(height: 26),
                SectionLabel(
                  open.isEmpty
                      ? 'Nothing needs you right now'
                      : 'Needs you (${open.length})',
                ),
                if (open.isNotEmpty)
                  Panel(
                    children: [
                      for (final item in open)
                        RowCard(
                          leading: TintTile(
                            tint: isUrgent(item) ? Tint.urgent : Tint.taxes,
                            mark: isUrgent(item) ? Mark.urgent : Mark.dueSoon,
                          ),
                          title: item.title,
                          subtitle: item.moneyAtRisk > 0
                              ? 'At risk: ${rupees(item.moneyAtRisk)}'
                              : item.why,
                          trailing: const Chevron(),
                          onTap: () => _explain(item),
                        ),
                    ],
                  ),
                if (upcoming.isNotEmpty) ...[
                  const SizedBox(height: 26),
                  const SectionLabel('Coming up'),
                  Panel(
                    children: [
                      for (final deadline in upcoming)
                        RowCard(
                          leading: const TintTile(
                            tint: Tint.ask,
                            mark: Mark.comingUp,
                          ),
                          title: '${deadline.label} for ${deadline.period}',
                          subtitle:
                              '${dueLabel(deadline.daysUntil)} (${deadline.dueDate})',
                        ),
                    ],
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _GstCard extends StatelessWidget {
  const _GstCard({required this.gst});

  final GstPayable gst;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
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
          Text('GST PAYABLE', style: text.labelSmall),
          const SizedBox(height: 6),
          Text(
            rupees(gst.payable),
            style: text.displaySmall?.copyWith(
              fontWeight: FontWeight.w400,
              fontFeatures: moneyFigures,
            ),
          ),
          const SizedBox(height: 14),
          const Divider(),
          const SizedBox(height: 12),
          _GstLeg(label: 'Collected on sales', amount: gst.output),
          const SizedBox(height: 6),
          _GstLeg(label: 'Paid on purchases', amount: gst.input),
        ],
      ),
    );
  }
}

class _GstLeg extends StatelessWidget {
  const _GstLeg({required this.label, required this.amount});

  final String label;
  final num amount;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Row(
      children: [
        Expanded(child: Text(label, style: text.bodyMedium)),
        Text(
          rupees(amount),
          style: text.bodyLarge?.copyWith(fontFeatures: moneyFigures),
        ),
      ],
    );
  }
}
