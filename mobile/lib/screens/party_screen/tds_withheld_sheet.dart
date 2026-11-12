part of '../party_screen.dart';

class _TdsWithheldDraft {
  const _TdsWithheldDraft({
    required this.invoiceId,
    required this.amount,
    required this.section,
    required this.date,
    required this.tan,
  });

  final String invoiceId;
  final num amount;
  final String section;
  final String date;
  final String tan;
}

class _TdsWithheldSheet extends StatefulWidget {
  const _TdsWithheldSheet({
    required this.partyName,
    required this.invoices,
    required this.today,
  });

  final String partyName;
  final List<Invoice> invoices;
  final DateTime today;

  @override
  State<_TdsWithheldSheet> createState() => _TdsWithheldSheetState();
}

class _TdsWithheldSheetState extends State<_TdsWithheldSheet> {
  final _amount = TextEditingController();
  final _tan = TextEditingController();
  late String _invoiceId = widget.invoices.first.id;
  late DateTime _date = widget.today;
  String _section = '194C';
  String _error = '';

  @override
  void initState() {
    super.initState();
    _amount.text = _suggested(widget.invoices.first);
  }

  @override
  void dispose() {
    _amount.dispose();
    _tan.dispose();
    super.dispose();
  }

  String _suggested(Invoice doc) =>
      plainNumber((doc.total * 0.02 * 100).round() / 100);

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(widget.today.year - 2),
      lastDate: widget.today,
    );
    if (picked != null) setState(() => _date = picked);
  }

  void _done() {
    final amount = parseAmount(_amount.text);
    if (amount == null) {
      return setState(() => _error = 'Enter how much TDS the customer withheld.');
    }
    final tan = _tan.text.replaceAll(RegExp(r'\s+'), '').toUpperCase();
    if (tan.isNotEmpty && !RegExp(r'^[A-Z]{4}[0-9]{5}[A-Z]$').hasMatch(tan)) {
      return setState(() => _error = 'A TAN looks like MUMA12345B.');
    }
    Navigator.of(context).pop(
      _TdsWithheldDraft(
        invoiceId: _invoiceId,
        amount: amount,
        section: _section,
        date: isoDate(_date),
        tan: tan,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        22,
        4,
        22,
        22 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('TDS withheld by ${widget.partyName}', style: text.headlineSmall),
            const SizedBox(height: 6),
            Text(
              'The customer paid you less because they deducted TDS. The invoice settles by this amount, and the credit waits in TDS receivable until Form 26AS confirms it.',
              style: text.bodySmall,
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              initialValue: _invoiceId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Against invoice'),
              items: [
                for (final doc in widget.invoices)
                  DropdownMenuItem(
                    value: doc.id,
                    child: Text(
                      '${doc.id} · ${rupees(doc.total)}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
              ],
              onChanged: (value) => setState(() {
                final doc = widget.invoices.where((d) => d.id == value);
                if (doc.isEmpty) return;
                _invoiceId = doc.first.id;
                _amount.text = _suggested(doc.first);
              }),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'TDS withheld',
                prefixText: '₹ ',
                helperText: 'Filled in at 2% of the invoice. Change it to what the customer deducted.',
                helperMaxLines: 2,
              ),
            ),
            const SizedBox(height: 14),
            Text('Section', style: text.bodyMedium),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                for (final section in customerTdsSections)
                  ChoiceChip(
                    key: ValueKey('tds.section.$section'),
                    label: Text(section),
                    selected: _section == section,
                    selectedColor: Palette.sunken,
                    showCheckmark: false,
                    onSelected: (_) => setState(() => _section = section),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text('Withheld on', style: text.bodyMedium),
                ActionChip(
                  label: Text(longDate(isoDate(_date))),
                  onPressed: _pickDate,
                ),
              ],
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _tan,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(
                labelText: 'Customer\'s TAN (optional)',
                helperText: 'On the TDS certificate, like MUMA12345B. It lets Form 26AS match this row.',
                helperMaxLines: 2,
              ),
            ),
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                _error,
                style: const TextStyle(
                  color: Palette.danger,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(onPressed: _done, child: const Text('Preview')),
            ),
          ],
        ),
      ),
    );
  }
}
