class BillLineInput {
  const BillLineInput({required this.qty, required this.rate, required this.gstRate});

  final num qty;
  final num rate;
  final num gstRate;
}

class BillLineFigures {
  const BillLineFigures({required this.taxable, required this.cgst, required this.sgst, required this.igst, required this.tax, required this.amount});

  final double taxable;
  final double cgst;
  final double sgst;
  final double igst;
  final double tax;
  final double amount;

  Map<String, Object?> toJson() => {'taxable': taxable, 'cgst': cgst, 'sgst': sgst, 'igst': igst, 'tax': tax, 'amount': amount};
}

class BillFigures {
  const BillFigures({required this.lines, required this.taxable, required this.cgst, required this.sgst, required this.igst, required this.total});

  final List<BillLineFigures> lines;
  final double taxable;
  final double cgst;
  final double sgst;
  final double igst;
  final double total;

  double get tax => _cents(cgst + sgst + igst);

  Map<String, Object?> totals() => {'taxable': taxable, 'cgst': cgst, 'sgst': sgst, 'igst': igst, 'total': total};
}

double _jsRound(double value) {
  if (value.isNaN || value.isInfinite) return value;
  final nearest = value.roundToDouble();
  return value - nearest == 0.5 ? nearest + 1 : nearest;
}

double _cents(double value) => _jsRound(value * 100) / 100;

double _sum(Iterable<double> values) => _cents(values.fold<double>(0, (sum, value) => sum + value));

BillLineFigures gstLine({required num qty, required num rate, required num gstRate, required String supplierState, required String placeOfSupply}) {
  final taxable = _jsRound(qty.toDouble() * rate.toDouble() * 100) / 100;
  final taxablePaise = _jsRound(taxable * 100);
  final intra = supplierState == placeOfSupply;
  double cgst = 0, sgst = 0, igst = 0, tax;
  if (intra) {
    final half = _jsRound((taxablePaise * gstRate.toDouble()) / 200) / 100;
    cgst = half;
    sgst = half;
    tax = _jsRound(half * 200) / 100;
  } else {
    igst = _jsRound((taxablePaise * gstRate.toDouble()) / 100) / 100;
    tax = igst;
  }
  return BillLineFigures(taxable: taxable, cgst: cgst, sgst: sgst, igst: igst, tax: tax, amount: _cents(taxable + tax));
}

BillFigures billFigures(List<BillLineInput> lines, {required String supplierState, required String placeOfSupply}) {
  final figures = [
    for (final line in lines) gstLine(qty: line.qty, rate: line.rate, gstRate: line.gstRate, supplierState: supplierState, placeOfSupply: placeOfSupply),
  ];
  final taxable = _sum(figures.map((line) => line.taxable));
  final cgst = _sum(figures.map((line) => line.cgst));
  final sgst = _sum(figures.map((line) => line.sgst));
  final igst = _sum(figures.map((line) => line.igst));
  return BillFigures(lines: figures, taxable: taxable, cgst: cgst, sgst: sgst, igst: igst, total: _cents(taxable + cgst + sgst + igst));
}

bool sameFigures(Map<String, Object?> a, Map<String, Object?> b) {
  for (final key in const ['taxable', 'cgst', 'sgst', 'igst', 'total']) {
    final left = a[key], right = b[key];
    if (left is! num || right is! num) return false;
    if ((left * 100).round() != (right * 100).round()) return false;
  }
  return true;
}
