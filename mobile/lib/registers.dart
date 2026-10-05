import 'api/models.dart';
import 'format.dart';

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

  List<Invoice> get unpaid => documents.where((doc) => !doc.paid).toList();

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

String lastEntryLine(Invoice doc, RegisterKind kind) {
  final what = kind == RegisterKind.sales ? 'Invoice' : 'Bill';
  final state = doc.paid ? 'paid' : 'unpaid';
  return '$what ${doc.id}, ${rupees(doc.total)}, $state';
}

String registerSubtitle(List<Invoice> documents, RegisterKind kind) {
  if (documents.isEmpty) {
    return kind == RegisterKind.sales ? 'No sales yet' : 'No purchases yet';
  }
  final parties = partiesOf(documents);
  final latest = parties.first;
  final people = kind == RegisterKind.sales ? 'customers' : 'suppliers';
  final single = kind == RegisterKind.sales ? 'customer' : 'supplier';
  final count = parties.length == 1 ? '1 $single' : '${parties.length} $people';
  return '$count · ${latest.name}: ${rupees(latest.latest!.total)}';
}

Map<String, Object?> documentArgs({
  required String partyName,
  required String partyGstin,
  required String description,
  required num amount,
  required num gstRate,
}) => {
  'partyName': partyName.trim(),
  'partyGstin': partyGstin.trim().toUpperCase(),
  'lines': [
    {
      'description': description.trim().isEmpty ? 'Supply' : description.trim(),
      'qty': 1,
      'rate': amount,
      'gstRate': gstRate,
    },
  ],
};

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

String expensesSubtitle(List<Expense> expenses) {
  if (expenses.isEmpty) return 'No expenses yet';
  final threads = headThreadsOf(expenses);
  final latest = threads.first;
  final heads = threads.length == 1 ? '1 head' : '${threads.length} heads';
  return '$heads · ${latest.name}: ${rupees(latest.latest.amount)}';
}

String headSubtitle(HeadThread thread) {
  final count = thread.expenses.length == 1
      ? '1 entry'
      : '${thread.expenses.length} entries';
  return '$count · ${rupees(thread.total)} · last ${longDate(thread.latest.date)}';
}
