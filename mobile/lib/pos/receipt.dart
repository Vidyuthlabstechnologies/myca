import 'escpos.dart';

String _money(num value) {
  final fixed = value.toStringAsFixed(2);
  final parts = fixed.split('.');
  final whole = parts[0].replaceFirst('-', '');
  final sign = value < 0 ? '-' : '';
  if (whole.length <= 3) return '${sign}Rs.$whole.${parts[1]}';
  final last3 = whole.substring(whole.length - 3);
  var rest = whole.substring(0, whole.length - 3);
  final groups = <String>[];
  while (rest.length > 2) {
    groups.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) groups.insert(0, rest);
  return '${sign}Rs.${groups.join(',')},$last3.${parts[1]}';
}

num _num(Object? value) => value is num ? value : num.tryParse('$value') ?? 0;

String _qty(num value) => value == value.roundToDouble() ? value.toInt().toString() : value.toString();

Map<String, dynamic> _mapOf(Object? value) => value is Map ? Map<String, dynamic>.from(value) : const <String, dynamic>{};

String _textOf(Object? value) => value == null ? '' : '$value'.trim();

List<int> receiptBytes({
  required Map<String, dynamic> invoice,
  required String businessName,
  String gstin = '',
  String footer = 'Thank you! Visit again.',
  PaperWidth paper = PaperWidth.mm58,
}) {
  final out = EscPos(paper);
  final seller = _mapOf(invoice['seller']);
  final sellerName = _textOf(seller['name']).isNotEmpty ? _textOf(seller['name']) : businessName;
  final sellerGstin = _textOf(seller['gstin']).isNotEmpty ? _textOf(seller['gstin']) : gstin;
  final sellerState = _mapOf(seller['state']);
  final address = [_textOf(seller['address']), _textOf(seller['city']), _textOf(seller['pin'])].where((part) => part.isNotEmpty).join(', ');
  out.text(sellerName.isEmpty ? 'Receipt' : sellerName, align: Align.center, bold: true, big: true);
  if (address.isNotEmpty) out.text(address, align: Align.center);
  if (_textOf(sellerState['name']).isNotEmpty) out.text('${sellerState['name']} (${sellerState['code']})', align: Align.center);
  if (sellerGstin.isNotEmpty) out.text('GSTIN $sellerGstin', align: Align.center);
  final title = _textOf(invoice['documentTitle']);
  out.text((title.isEmpty ? 'Invoice' : title).toUpperCase(), align: Align.center, bold: true);
  final declaration = _textOf(invoice['compositionDeclaration']);
  if (declaration.isNotEmpty) out.text(declaration, align: Align.center);
  out.row('Bill ${invoice['id'] ?? ''}', '${invoice['date'] ?? ''}');
  final buyer = _mapOf(invoice['buyer']);
  final party = _textOf(buyer['name']).isNotEmpty ? _textOf(buyer['name']) : _textOf(invoice['partyName']);
  final partyGstin = _textOf(buyer['gstin']).isNotEmpty ? _textOf(buyer['gstin']) : _textOf(invoice['partyGstin']);
  if (party.isNotEmpty) out.text('To: $party');
  if (_textOf(buyer['address']).isNotEmpty) out.text(_textOf(buyer['address']));
  if (partyGstin.isNotEmpty) out.text('GSTIN $partyGstin');
  final place = _mapOf(invoice['placeOfSupply']);
  if (_textOf(place['name']).isNotEmpty && (partyGstin.isNotEmpty || _num(invoice['igst']) > 0)) out.text('Place of supply: ${place['name']} (${place['code']})');
  out.rule();
  final lines = invoice['lines'] is List ? invoice['lines'] as List : const [];
  for (final raw in lines) {
    final line = raw is Map ? raw : const {};
    out.text('${line['description'] ?? 'Item'}');
    if (_textOf(line['hsn']).isNotEmpty) out.text('  HSN ${line['hsn']}');
    final gst = _num(line['gstRate']);
    out.row('  ${_qty(_num(line['qty']))} x ${_money(_num(line['rate']))}${gst > 0 ? ' +${_qty(gst)}%' : ''}', _money(_num(line['grossTaxable'] ?? line['taxable'])));
  }
  out.rule();
  final discounts = invoice['discounts'] is List ? invoice['discounts'] as List : const [];
  for (final raw in discounts) {
    final discount = raw is Map ? raw : const {};
    out.row(discount['points'] == null ? 'Points redeemed' : 'Points redeemed (${discount['points']})', '-${_money(_num(discount['amount']))}');
  }
  out.row('Taxable value', _money(_num(invoice['taxable'])));
  if (_num(invoice['cgst']) > 0) out.row('CGST', _money(_num(invoice['cgst'])));
  if (_num(invoice['sgst']) > 0) out.row('SGST', _money(_num(invoice['sgst'])));
  if (_num(invoice['igst']) > 0) out.row('IGST', _money(_num(invoice['igst'])));
  if (_num(invoice['cess']) > 0) out.row('Cess', _money(_num(invoice['cess'])));
  out.row('TOTAL', _money(_num(invoice['total'])), bold: true);
  out.rule();
  out.text(footer, align: Align.center);
  out.feed(3);
  out.cut();
  return out.bytes;
}
