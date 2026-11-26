import 'package:flutter/material.dart';

import '../format.dart';
import '../india/india_strings.dart';
import '../registers.dart';

const maxCounterQty = 100000;

class ItemHit {
  const ItemHit({required this.sku, required this.name, this.barcode = '', this.hsn = '', this.gstRate, this.price, this.unit = '', this.tracked = false, this.onHand, this.lowStock = false});

  factory ItemHit.fromJson(Map<dynamic, dynamic> map) {
    String text(Object? value) => value == null ? '' : '$value'.trim();
    final sku = text(map['sku']);
    return ItemHit(
      sku: sku,
      name: text(map['name']).isEmpty ? sku : text(map['name']),
      barcode: text(map['barcode']),
      hsn: text(map['hsn']),
      gstRate: map['gstRate'] is num ? map['gstRate'] as num : null,
      price: map['price'] is num ? map['price'] as num : null,
      unit: text(map['unit']),
      tracked: map['tracked'] == true,
      onHand: map['onHand'] is num ? map['onHand'] as num : null,
      lowStock: map['lowStock'] == true,
    );
  }

  final String sku;
  final String name;
  final String barcode;
  final String hsn;
  final num? gstRate;
  final num? price;
  final String unit;
  final bool tracked;
  final num? onHand;
  final bool lowStock;

  bool get billable => sku.isNotEmpty && price != null && gstRate != null;
}

List<ItemHit> parseItemHits(Object? result) {
  if (result is! Map || result['ok'] == false) return const [];
  final data = result['data'];
  final items = data is Map ? data['items'] : null;
  if (items is! List) return const [];
  return [
    for (final item in items)
      if (item is Map && '${item['sku'] ?? ''}'.trim().isNotEmpty) ItemHit.fromJson(item),
  ];
}

String qtyText(num qty) {
  final fixed = qty.toStringAsFixed(3);
  return fixed.replaceFirst(RegExp(r'\.?0+$'), '');
}

String itemPriceLine(BuildContext context, ItemHit hit) {
  final price = hit.price;
  return [
    if (price != null) '${rupees(price)}${hit.unit.isEmpty ? '' : ' / ${hit.unit}'}' else inText(context, 'Price not set'),
    if (hit.lowStock) inText(context, 'Low stock'),
  ].join(' · ');
}

bool looksLikeItemCode(String text) => RegExp(r'^[0-9A-Za-z-]{4,32}$').hasMatch(text) && RegExp(r'[0-9]').hasMatch(text);

String quickItemSku(DateTime now) => 'ITM-${now.millisecondsSinceEpoch.toRadixString(36).toUpperCase()}';

class LineEdit {
  const LineEdit(this.qty, this.price);

  final num qty;
  final num price;
}

bool _within(num value, int places) {
  final scaled = value * _pow10(places);
  return (scaled - scaled.round()).abs() < 1e-6;
}

num _pow10(int places) => places == 0 ? 1 : 10 * _pow10(places - 1);

String? lineEditProblem(BuildContext context, String qtyField, String priceField) {
  final qty = parseAmount(qtyField);
  if (qty == null || qty > maxCounterQty || !_within(qty, 3)) return inText(context, 'Enter the quantity as a number, for example 0.5 or 12.');
  final price = parseAmount(priceField);
  if (price == null || !_within(price, 2)) return inText(context, 'Enter the price as a number, for example 45 or 45.50.');
  return null;
}

class LineEditSheet extends StatefulWidget {
  const LineEditSheet({super.key, required this.name, required this.unit, required this.qty, required this.price, required this.listPrice});

  final String name;
  final String unit;
  final num qty;
  final num price;
  final num listPrice;

  @override
  State<LineEditSheet> createState() => _LineEditSheetState();
}

class _LineEditSheetState extends State<LineEditSheet> {
  late final _qty = TextEditingController(text: qtyText(widget.qty));
  late final _price = TextEditingController(text: qtyText(widget.price));
  String _error = '';

  @override
  void dispose() {
    _qty.dispose();
    _price.dispose();
    super.dispose();
  }

  void _save() {
    final problem = lineEditProblem(context, _qty.text, _price.text);
    if (problem != null) return setState(() => _error = problem);
    Navigator.of(context).pop(LineEdit(parseAmount(_qty.text)!, parseAmount(_price.text)!));
  }

  @override
  Widget build(BuildContext context) {
    final unit = widget.unit.isEmpty ? '' : ' (${widget.unit})';
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 8, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.name, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          TextField(
            key: const Key('line-qty'),
            controller: _qty,
            autofocus: true,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            onSubmitted: (_) => _save(),
            decoration: InputDecoration(labelText: '${inText(context, 'Quantity')}$unit'),
          ),
          const SizedBox(height: 8),
          TextField(
            key: const Key('line-price'),
            controller: _price,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            onSubmitted: (_) => _save(),
            decoration: InputDecoration(labelText: inText(context, 'Price before GST'), helperText: widget.listPrice == widget.price ? null : inFormat(context, 'Shelf price {amount}', {'amount': rupees(widget.listPrice)})),
          ),
          if (_error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error, key: const Key('line-error'), style: TextStyle(color: Theme.of(context).colorScheme.error))),
          const SizedBox(height: 12),
          FilledButton(key: const Key('line-save'), onPressed: _save, child: Text(inText(context, 'Done'))),
        ],
      ),
    );
  }
}
