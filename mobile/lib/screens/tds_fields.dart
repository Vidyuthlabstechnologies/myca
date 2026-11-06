import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class TdsOption {
  const TdsOption(
    this.key,
    this.label,
    this.section, {
    this.category = '',
    this.asset = '',
  });

  final String key;
  final String label;
  final String section;
  final String category;
  final String asset;
}

const tdsOptions = [
  TdsOption('none', 'No TDS', ''),
  TdsOption('194C', 'Contractor work (194C)', '194C'),
  TdsOption(
    '194J-professional',
    'Professional fees (194J)',
    '194J',
    category: 'professional',
  ),
  TdsOption(
    '194J-technical',
    'Technical services (194J)',
    '194J',
    category: 'technical',
  ),
  TdsOption(
    '194I-building',
    'Rent of land, building or furniture (194I)',
    '194I',
    asset: 'building',
  ),
  TdsOption(
    '194I-plant',
    'Rent of plant or machinery (194I)',
    '194I',
    asset: 'plant',
  ),
  TdsOption('194A', 'Interest (194A)', '194A'),
];

const customerTdsSections = [
  '194A',
  '194C',
  '194H',
  '194I',
  '194J',
  '194Q',
  '194O',
  '192',
  '194D',
  '194G',
  '194LA',
  '206AB',
];

class TdsChoice {
  TdsOption option = tdsOptions.first;
  final pan = TextEditingController();

  bool get chosen => option.section.isNotEmpty;

  Map<String, Object?> args() => chosen
      ? {
          'tdsSection': option.section,
          if (option.category.isNotEmpty) 'tdsCategory': option.category,
          if (option.asset.isNotEmpty) 'tdsAsset': option.asset,
          'payeePan': pan.text.replaceAll(RegExp(r'\s+'), '').toUpperCase(),
        }
      : const {};

  String? problem() {
    if (!chosen) return null;
    final value = pan.text.replaceAll(RegExp(r'\s+'), '').toUpperCase();
    if (!RegExp(r'^[A-Z]{5}[0-9]{4}[A-Z]$').hasMatch(value)) {
      return 'Enter the payee\'s PAN: five letters, four digits and a letter.';
    }
    return null;
  }

  void reset() {
    option = tdsOptions.first;
    pan.clear();
  }

  void dispose() => pan.dispose();
}

class TdsFields extends StatefulWidget {
  const TdsFields({super.key, required this.choice});

  final TdsChoice choice;

  @override
  State<TdsFields> createState() => _TdsFieldsState();
}

class _TdsFieldsState extends State<TdsFields> {
  @override
  Widget build(BuildContext context) {
    final choice = widget.choice;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DropdownButtonFormField<TdsOption>(
          initialValue: choice.option,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'TDS to deduct'),
          items: [
            for (final option in tdsOptions)
              DropdownMenuItem(
                value: option,
                child: Text(option.label, overflow: TextOverflow.ellipsis),
              ),
          ],
          onChanged: (value) =>
              setState(() => choice.option = value ?? tdsOptions.first),
        ),
        if (choice.chosen) ...[
          const SizedBox(height: 10),
          TextField(
            controller: choice.pan,
            textCapitalization: TextCapitalization.characters,
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9 ]')),
            ],
            maxLength: 12,
            decoration: const InputDecoration(
              labelText: 'Payee\'s PAN',
              helperText:
                  'MyCA works out the TDS and shows it before anything is posted.',
              counterText: '',
            ),
          ),
        ],
      ],
    );
  }
}
