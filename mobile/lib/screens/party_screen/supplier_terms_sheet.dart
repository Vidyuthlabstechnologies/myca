part of '../party_screen.dart';

class _SupplierTermsDraft {
  const _SupplierTermsDraft({
    required this.msme,
    required this.udyam,
    required this.category,
    required this.days,
  });

  final bool msme;
  final String udyam;
  final String category;
  final int? days;
}

class _SupplierTermsSheet extends StatefulWidget {
  const _SupplierTermsSheet({required this.name});

  final String name;

  @override
  State<_SupplierTermsSheet> createState() => _SupplierTermsSheetState();
}

class _SupplierTermsSheetState extends State<_SupplierTermsSheet> {
  final _udyam = TextEditingController();
  final _days = TextEditingController();
  bool _msme = false;
  String _category = '';
  String _error = '';

  @override
  void dispose() {
    _udyam.dispose();
    _days.dispose();
    super.dispose();
  }

  void _save() {
    final udyam = _udyam.text.replaceAll(RegExp(r'\s+'), '').toUpperCase();
    final daysText = _days.text.trim();
    final days = daysText.isEmpty ? null : int.tryParse(daysText);
    if (_msme && udyam.isNotEmpty && !RegExp(r'^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$').hasMatch(udyam)) {
      return setState(() => _error = 'A Udyam number looks like UDYAM-XX-00-0000000.');
    }
    if (daysText.isNotEmpty && (days == null || days > 365)) {
      return setState(() => _error = 'Agreed days must be a whole number from 0 to 365.');
    }
    if (_msme && days != null && days > 45) {
      return setState(() => _error = 'An MSME supplier must be paid within 45 days, so the agreed days cannot be more than 45.');
    }
    if (!_msme && days == null) {
      return setState(() => _error = 'Switch on MSME supplier, or give the agreed days.');
    }
    Navigator.of(context).pop(
      _SupplierTermsDraft(
        msme: _msme,
        udyam: _msme ? udyam : '',
        category: _msme ? _category : '',
        days: days,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(22, 4, 22, 22 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Terms for ${widget.name}', style: text.headlineSmall),
            const SizedBox(height: 6),
            Text(
              'A micro or small supplier has to be paid within 45 days of the bill. MyCA reminds you a week before.',
              style: text.bodySmall,
            ),
            const SizedBox(height: 6),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('MSME supplier'),
              value: _msme,
              onChanged: (value) => setState(() => _msme = value),
            ),
            if (_msme) ...[
              TextField(
                controller: _udyam,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(labelText: 'Udyam number', hintText: 'UDYAM-XX-00-0000000'),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final choice in const ['micro', 'small', 'medium'])
                    ChoiceChip(
                      label: Text('${choice[0].toUpperCase()}${choice.substring(1)}'),
                      selected: _category == choice,
                      selectedColor: Palette.sunken,
                      showCheckmark: false,
                      onSelected: (_) => setState(() => _category = _category == choice ? '' : choice),
                    ),
                ],
              ),
              const SizedBox(height: 8),
              Text('The 45-day rule covers micro and small suppliers only.', style: text.bodySmall),
              const SizedBox(height: 12),
            ],
            TextField(
              controller: _days,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              maxLength: 3,
              decoration: InputDecoration(
                labelText: 'Agreed days',
                counterText: '',
                helperText: _msme ? 'Up to 45. Leave it empty for the 15 days the law gives without a written agreement.' : 'How many days you have to pay their bills.',
                helperMaxLines: 3,
              ),
            ),
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(_error, style: const TextStyle(color: Palette.danger, fontWeight: FontWeight.w600)),
            ],
            const SizedBox(height: 14),
            FilledButton(onPressed: _save, child: const Text('Save')),
          ],
        ),
      ),
    );
  }
}
