import 'package:flutter/material.dart';

import '../../my/my_code_tables.dart';
import '../../my/my_codes.dart';
import '../../my/my_strings.dart';
import '../../my/my_tools.dart';
import 'my_widgets.dart';

class MyLineFields {
  MyLineFields({String description = '', String price = ''})
    : description = TextEditingController(text: description),
      quantity = TextEditingController(text: '1'),
      price = TextEditingController(text: price),
      rate = TextEditingController(),
      exemption = TextEditingController();

  final TextEditingController description;
  final TextEditingController quantity;
  final TextEditingController price;
  final TextEditingController rate;
  final TextEditingController exemption;
  String classification = '022';
  String unit = 'C62';
  String taxType = '06';

  bool get taxed => taxType != '06' && taxType != 'E';

  MyLine toLine() => MyLine(
    description: description.text,
    classification: classification,
    quantity: parseMyAmount(quantity.text) ?? 0,
    unitCode: unit,
    unitPrice: parseMyAmount(price.text) ?? 0,
    taxType: taxType,
    ratePercent: parseMyAmount(rate.text) ?? 0,
    exemptionReason: exemption.text,
  );

  void dispose() {
    description.dispose();
    quantity.dispose();
    price.dispose();
    rate.dispose();
    exemption.dispose();
  }
}

Map<String, String> validateMyLines(MyStrings t, List<MyLineFields> lines) {
  final errors = <String, String>{};
  for (final (index, line) in lines.indexed) {
    if (line.description.text.trim().isEmpty) errors['line$index.description'] = t.descriptionMissing;
    final quantity = parseMyAmount(line.quantity.text);
    if (quantity == null || quantity <= 0) {
      errors['line$index.quantity'] = t.quantityBad;
    } else if (quantity > myLargestAmount) {
      errors['line$index.quantity'] = t.amountTooLarge;
    }
    final price = parseMyAmount(line.price.text);
    if (price == null || price < 0) {
      errors['line$index.price'] = t.amountBad;
    } else if (price > myLargestAmount || (quantity != null && quantity * price > myLargestAmount)) {
      errors['line$index.price'] = t.amountTooLarge;
    }
    if (line.taxed) {
      final rate = parseMyAmount(line.rate.text);
      if (rate == null || rate < 0 || rate > 100) errors['line$index.rate'] = t.taxRateBad;
    }
    if (line.taxType == 'E' && line.exemption.text.trim().isEmpty) errors['line$index.exemption'] = t.exemptionMissing;
  }
  return errors;
}

class MyLineEditor extends StatelessWidget {
  const MyLineEditor({
    super.key,
    required this.keyPrefix,
    required this.index,
    required this.line,
    required this.currency,
    required this.errors,
    required this.onChanged,
    this.onRemove,
  });

  final String keyPrefix;
  final int index;
  final MyLineFields line;
  final String currency;
  final Map<String, String> errors;
  final VoidCallback onChanged;
  final VoidCallback? onRemove;

  Widget _field(String name, TextEditingController controller, String label, {TextInputType? keyboard, TextCapitalization caps = TextCapitalization.none, int maxLength = 0}) {
    final key = 'line$index.$name';
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        key: Key('$keyPrefix.$key'),
        controller: controller,
        keyboardType: keyboard,
        textCapitalization: caps,
        maxLength: maxLength > 0 ? maxLength : null,
        onChanged: (_) => onChanged(),
        decoration: InputDecoration(labelText: label, errorText: errors[key], errorMaxLines: 3, counterText: ''),
      ),
    );
  }

  Widget _picker(String name, String label, String value, List<(String, String)> items, void Function(String? picked) changed) {
    final key = 'line$index.$name';
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: MyPicker<String>(
        key: Key('$keyPrefix.$key'),
        label: label,
        value: value,
        error: errors[key],
        items: items,
        onChanged: (picked) {
          changed(picked);
          onChanged();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = MyStrings.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: MyPanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text(t.lineN(index + 1), style: Theme.of(context).textTheme.titleSmall)),
                if (onRemove != null) IconButton(key: Key('$keyPrefix.line$index.remove'), tooltip: t.removeLine, icon: const Icon(Icons.delete_outline), onPressed: onRemove),
              ],
            ),
            const SizedBox(height: 8),
            _field('description', line.description, t.description, caps: TextCapitalization.sentences, maxLength: 300),
            _picker('classification', t.classification, line.classification, [for (final (code, name) in myClassifications) (code, '$code · $name')], (value) => line.classification = value ?? '022'),
            _field('quantity', line.quantity, t.quantity, keyboard: const TextInputType.numberWithOptions(decimal: true), maxLength: 18),
            _picker('unit', t.unit, line.unit, [for (final code in myUnitCodes) (code, '${t.unitName(code)} ($code)')], (value) => line.unit = value ?? 'C62'),
            _field('price', line.price, '${t.unitPrice} ($currency)', keyboard: const TextInputType.numberWithOptions(decimal: true), maxLength: 18),
            _picker('taxType', t.taxType, line.taxType, [for (final code in myTaxTypes) (code, t.taxTypeName(code))], (value) => line.taxType = value ?? '06'),
            if (line.taxed) _field('rate', line.rate, t.taxRate, keyboard: const TextInputType.numberWithOptions(decimal: true), maxLength: 6),
            if (line.taxType == 'E') _field('exemption', line.exemption, t.exemptionReason, caps: TextCapitalization.sentences, maxLength: 300),
          ],
        ),
      ),
    );
  }
}
