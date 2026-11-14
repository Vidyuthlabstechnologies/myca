part of '../party_screen.dart';

class _ActionChips extends StatelessWidget {
  const _ActionChips({
    required this.busy,
    required this.sales,
    required this.again,
    required this.canReceive,
    required this.onDocument,
    required this.onPayment,
    this.onTdsWithheld,
    this.terms,
    this.onTerms,
    this.onSupplierTerms,
    this.onQuote,
    this.onDebitNote,
  });

  final bool busy;
  final bool sales;
  final bool again;
  final bool canReceive;
  final VoidCallback onDocument;
  final VoidCallback onPayment;
  final VoidCallback? onTdsWithheld;
  final int? terms;
  final VoidCallback? onTerms;
  final VoidCallback? onSupplierTerms;
  final VoidCallback? onQuote;
  final VoidCallback? onDebitNote;

  @override
  Widget build(BuildContext context) {
    final label = sales
        ? (again ? 'Another sale' : 'Sale')
        : (again ? 'Another bill' : 'Bill');
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 14),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              ActionChip(
                avatar: const Icon(Icons.add, size: 18),
                label: Text(label),
                onPressed: busy ? null : onDocument,
              ),
              if (canReceive)
                ActionChip(
                  avatar: Icon(
                    sales ? Icons.south_west : Icons.north_east,
                    size: 18,
                  ),
                  label: Text(sales ? 'Payment received' : 'Paid'),
                  onPressed: busy ? null : onPayment,
                ),
              if (onTdsWithheld != null)
                ActionChip(
                  label: const Text('TDS withheld'),
                  onPressed: busy ? null : onTdsWithheld,
                ),
              if (onQuote != null)
                ActionChip(
                  label: const Text('Quote, order or challan'),
                  onPressed: busy ? null : onQuote,
                ),
              if (onDebitNote != null)
                ActionChip(
                  label: const Text('Debit note'),
                  onPressed: busy ? null : onDebitNote,
                ),
              if (onTerms != null)
                ActionChip(
                  label: Text(
                    terms == null ? 'Set terms' : 'Terms: ${termsLabel(terms)}',
                  ),
                  onPressed: busy ? null : onTerms,
                ),
              if (onSupplierTerms != null)
                ActionChip(
                  label: const Text('Supplier terms'),
                  onPressed: busy ? null : onSupplierTerms,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ComposerCard extends StatelessWidget {
  const _ComposerCard({
    required this.title,
    required this.error,
    required this.onCancel,
    required this.onSubmit,
    required this.children,
    required this.maxHeight,
  });

  final double maxHeight;
  final String title;
  final String error;
  final VoidCallback onCancel;
  final VoidCallback onSubmit;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.fromLTRB(12, 4, 12, 12),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        decoration: BoxDecoration(
          color: Palette.surface,
          borderRadius: BorderRadius.circular(radiusCard),
          border: Border.all(color: Palette.line),
        ),
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Cancel',
                    icon: const Icon(Icons.close),
                    onPressed: onCancel,
                  ),
                ],
              ),
              const SizedBox(height: 4),
              ...children,
              if (error.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  error,
                  style: const TextStyle(
                    color: Palette.danger,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
              const SizedBox(height: 12),
              FilledButton(onPressed: onSubmit, child: const Text('Preview')),
            ],
          ),
        ),
      ),
    );
  }
}
