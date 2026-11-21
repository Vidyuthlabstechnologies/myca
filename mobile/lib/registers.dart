import 'api/models.dart';
import 'format.dart';
import 'india/india_strings.dart' show inFill, inLine;

enum RegisterKind { sales, purchases }

class Party {
  const Party({
    required this.name,
    required this.gstin,
    required this.documents,
  });

  final String name;
  final String gstin;
  final List<Invoice> documents;

  Invoice? get latest => documents.isEmpty ? null : documents.last;

  List<Invoice> get unpaid => documents.where((doc) => doc.open).toList();

  String get initial =>
      name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase();
}

String partyKey(String name) => name.trim().toLowerCase();

List<Party> partiesOf(List<Invoice> documents) {
  final grouped = <String, List<Invoice>>{};
  for (final doc in documents) {
    grouped.putIfAbsent(partyKey(doc.partyName), () => []).add(doc);
  }
  final parties = [
    for (final docs in grouped.values)
      Party(
        name: docs.last.partyName,
        gstin: docs
            .lastWhere((d) => d.partyGstin.isNotEmpty, orElse: () => docs.last)
            .partyGstin,
        documents: docs,
      ),
  ];
  parties.sort((a, b) => b.latest!.date.compareTo(a.latest!.date));
  return parties;
}

Party partyNamed(List<Invoice> documents, String name, String fallbackGstin) {
  final key = partyKey(name);
  final docs = documents
      .where((doc) => partyKey(doc.partyName) == key)
      .toList();
  if (docs.isEmpty) {
    return Party(name: name, gstin: fallbackGstin, documents: const []);
  }
  return partiesOf(docs).single;
}

String lastEntryLine(Invoice doc, RegisterKind kind, [String lang = 'en']) {
  final state = doc.cancelled
      ? inLine(lang, 'cancelled')
      : doc.paid
      ? inLine(lang, 'paid')
      : doc.partial
      ? inLine(lang, 'part paid')
      : inLine(lang, 'unpaid');
  final parts = {'id': doc.id, 'amount': rupees(doc.total), 'state': state};
  return kind == RegisterKind.sales
      ? inFill(inLine(lang, 'Invoice {id}, {amount}, {state}'), parts)
      : inFill(inLine(lang, 'Bill {id}, {amount}, {state}'), parts);
}

String registerSubtitle(List<Invoice> documents, RegisterKind kind, [String lang = 'en']) {
  final sales = kind == RegisterKind.sales;
  if (documents.isEmpty) {
    return sales ? inLine(lang, 'No sales yet') : inLine(lang, 'No purchases yet');
  }
  final parties = partiesOf(documents);
  final latest = parties.first;
  final n = {'n': parties.length};
  final count = parties.length == 1
      ? (sales ? inLine(lang, '1 customer') : inLine(lang, '1 supplier'))
      : (sales ? inFill(inLine(lang, '{n} customers'), n) : inFill(inLine(lang, '{n} suppliers'), n));
  return '$count · ${latest.name}: ${rupees(latest.latest!.total)}';
}

Map<String, Object?> documentArgs({
  required String partyName,
  required String partyGstin,
  required String description,
  required num amount,
  num? gstRate,
  String supplierInvoiceNo = '',
}) => {
  'partyName': partyName.trim(),
  'partyGstin': partyGstin.trim().toUpperCase(),
  if (supplierInvoiceNo.trim().isNotEmpty)
    'supplierInvoiceNo': supplierInvoiceNo.trim(),
  'lines': [
    {
      'description': description.trim().isEmpty ? 'Supply' : description.trim(),
      'qty': 1,
      'rate': amount,
      'gstRate': ?gstRate,
    },
  ],
};

Map<String, Object?> usSaleArgs({
  required String partyName,
  required String description,
  required num amount,
  required String taxJurisdiction,
  required bool taxExempt,
  required String exemptionReason,
}) => {
  ...documentArgs(partyName: partyName, partyGstin: '', description: description, amount: amount),
  if (taxExempt) 'taxExempt': true,
  if (taxExempt) 'exemptionReason': exemptionReason.trim(),
  if (!taxExempt) 'taxJurisdiction': taxJurisdiction.trim().toUpperCase(),
};

Map<String, Object?> usBillArgs({
  required String partyName,
  required String description,
  required num amount,
  required num salesTaxPaid,
  String supplierInvoiceNo = '',
}) => {
  ...documentArgs(partyName: partyName, partyGstin: '', description: description, amount: amount, supplierInvoiceNo: supplierInvoiceNo),
  if (salesTaxPaid > 0) 'salesTaxPaid': salesTaxPaid,
};

class SalesTaxRate {
  const SalesTaxRate({required this.code, required this.name, required this.ratePercent});

  factory SalesTaxRate.fromJson(Object? json) {
    final map = json is Map ? json : const {};
    return SalesTaxRate(
      code: '${map['code'] ?? ''}',
      name: '${map['name'] ?? ''}',
      ratePercent: map['ratePercent'] is num ? map['ratePercent'] as num : 0,
    );
  }

  static List<SalesTaxRate> listFromTool(Object? json) {
    final data = toolData(json);
    return [for (final row in (data['rates'] as List? ?? const [])) SalesTaxRate.fromJson(row)];
  }

  final String code;
  final String name;
  final num ratePercent;
}

const rateSuggestionLimit = 4;

List<num> ratesUsedBefore(List<Invoice> documents) {
  final seen = <num>[];
  for (final doc in documents.reversed) {
    for (final rate in doc.gstRates) {
      if (!seen.contains(rate)) seen.add(rate);
    }
  }
  return seen.take(rateSuggestionLimit).toList();
}

String rateLabel(num rate) =>
    rate == rate.roundToDouble() ? '${rate.round()}' : '$rate';

List<Party> searchParties(List<Party> parties, String query) {
  final needle = partyKey(query);
  if (needle.isEmpty) return parties;
  return parties
      .where((party) => partyKey(party.name).contains(needle))
      .toList();
}

bool hasPartyNamed(List<Party> parties, String name) =>
    parties.any((party) => partyKey(party.name) == partyKey(name));

num? parseAmount(String text) {
  final cleaned = text.replaceAll(',', '').replaceAll('₹', '').trim();
  final value = num.tryParse(cleaned);
  return value == null || value <= 0 ? null : value;
}

num? parseRate(String text) {
  final value = num.tryParse(text.replaceAll('%', '').trim());
  return value == null || value < 0 ? null : value;
}

class HeadThread {
  const HeadThread({
    required this.code,
    required this.name,
    required this.expenses,
  });

  final String code;
  final String name;
  final List<Expense> expenses;

  Expense get latest => expenses.last;

  num get total =>
      expenses.fold<num>(0, (sum, expense) => sum + expense.amount);
}

List<HeadThread> headThreadsOf(List<Expense> expenses) {
  final grouped = <String, List<Expense>>{};
  for (final expense in expenses) {
    grouped.putIfAbsent(expense.head, () => []).add(expense);
  }
  final threads = [
    for (final group in grouped.values)
      HeadThread(
        code: group.last.head,
        name: group.last.headName,
        expenses: group,
      ),
  ];
  threads.sort((a, b) => b.latest.date.compareTo(a.latest.date));
  return threads;
}

HeadThread headThread(List<Expense> expenses, String code, String name) {
  final own = expenses.where((expense) => expense.head == code).toList();
  return HeadThread(code: code, name: name, expenses: own);
}

String expensesSubtitle(List<Expense> expenses, [String lang = 'en']) {
  if (expenses.isEmpty) return inLine(lang, 'No expenses yet');
  final threads = headThreadsOf(expenses);
  final latest = threads.first;
  final heads = threads.length == 1 ? inLine(lang, '1 head') : inFill(inLine(lang, '{n} heads'), {'n': threads.length});
  return '$heads · ${latest.name}: ${rupees(latest.latest.amount)}';
}

String headSubtitle(HeadThread thread, [String lang = 'en']) {
  final count = thread.expenses.length == 1
      ? inLine(lang, '1 entry')
      : inFill(inLine(lang, '{n} entries'), {'n': thread.expenses.length});
  return inFill(inLine(lang, '{count} · {amount} · last {date}'), {'count': count, 'amount': rupees(thread.total), 'date': longDate(thread.latest.date)});
}
