part of '../models.dart';

String bankDocKindWords(String docKind) => switch (docKind) {
  'receipt' => 'receipt',
  'payment' => 'payment',
  'expense' => 'expense',
  'settlement' => 'payout',
  'transfer' => 'transfer',
  'salary' => 'salary',
  'gst' => 'GST payment',
  _ => 'entry',
};

const ownAccountKinds = {'bank': 'Bank account', 'cash': 'Cash', 'wallet': 'Wallet'};

class OwnAccount {
  const OwnAccount({
    required this.id,
    required this.label,
    required this.kind,
    required this.maskedNumber,
    required this.ifsc,
    required this.balance,
    required this.builtIn,
  });

  factory OwnAccount.fromJson(Object? json) {
    final map = _map(json);
    return OwnAccount(
      id: _text(map['id']),
      label: _text(map['label']),
      kind: _text(map['kind']),
      maskedNumber: _text(map['maskedNumber']),
      ifsc: _text(map['ifsc']),
      balance: _num(map['balance']),
      builtIn: map['builtIn'] == true,
    );
  }

  final String id;
  final String label;
  final String kind;
  final String maskedNumber;
  final String ifsc;
  final num balance;
  final bool builtIn;

  String get kindWords => ownAccountKinds[kind] ?? 'Bank account';

  String get words => [label, if (maskedNumber.isNotEmpty) '••$maskedNumber'].join(' ');
}

List<OwnAccount> bankAccountsFrom(Object? json) => _maps(toolData(json)['accounts']).map(OwnAccount.fromJson).toList();

class BankMatch {
  const BankMatch({required this.kind, required this.id, required this.transferIds, required this.ruleId, required this.note});

  factory BankMatch.fromJson(Object? json) {
    final map = _map(json);
    return BankMatch(
      kind: _text(map['kind']),
      id: _text(map['id']),
      transferIds: _texts(map['transferIds']),
      ruleId: _text(map['ruleId']),
      note: _text(map['note']),
    );
  }

  final String kind;
  final String id;
  final List<String> transferIds;
  final String ruleId;
  final String note;

  String get words {
    final by = ruleId.isEmpty ? '' : ' by rule $ruleId';
    return switch (kind) {
      'books' => 'Already in the books: $id',
      'receipt' => 'Receipt against $id$by',
      'payment' => 'Payment against $id$by',
      'expense' => 'Expense $id$by',
      'charge' => 'Bank charge $id$by'.replaceAll('  ', ' ').trim(),
      'interest' => 'Interest earned$by',
      'transfer' => 'Transfer $id$by',
      'auto' => 'Posted to a guessed head',
      'ignore' => note.isEmpty ? 'Ignored$by' : 'Ignored: $note',
      _ => kind,
    };
  }
}

class BankSuggestion {
  const BankSuggestion({
    required this.kind,
    required this.transferId,
    required this.docId,
    required this.docKind,
    required this.party,
    required this.partyName,
    required this.invoiceIds,
    required this.billIds,
    required this.amount,
    required this.date,
    required this.head,
    required this.why,
  });

  factory BankSuggestion.fromJson(Object? json) {
    final map = _map(json);
    return BankSuggestion(
      kind: _text(map['kind']),
      transferId: _text(map['transferId']),
      docId: _text(map['docId']),
      docKind: _text(map['docKind']),
      party: _text(map['party']),
      partyName: _text(map['partyName']),
      invoiceIds: _texts(map['invoiceIds']),
      billIds: _texts(map['billIds']),
      amount: _num(map['amount']),
      date: _text(map['date']),
      head: _text(map['head']),
      why: _text(map['why']),
    );
  }

  final String kind;
  final String transferId;
  final String docId;
  final String docKind;
  final String party;
  final String partyName;
  final List<String> invoiceIds;
  final List<String> billIds;
  final num amount;
  final String date;
  final String head;
  final String why;

  String get words => switch (kind) {
    'books' => 'Already in the books: ${bankDocKindWords(docKind)} $docId${date.isEmpty ? '' : ' on ${longDate(date)}'}',
    'receipt' => 'Receipt${invoiceIds.isEmpty ? '' : ' ${invoiceIds.join(', ')}'} from $partyName',
    'payment' => 'Payment${billIds.isEmpty ? '' : ' ${billIds.join(', ')}'} to $partyName',
    'charge' => 'Bank charge',
    'interest' => 'Interest earned',
    'transfer' => 'Transfer to another account',
    _ => why.isEmpty ? kind : why,
  };

  Map<String, Object?> get matchArgs => {
    'kind': kind,
    if (kind == 'books' && transferId.isNotEmpty) 'transferId': transferId,
    if (kind == 'receipt' && invoiceIds.length == 1) 'invoiceId': invoiceIds.single else if (kind == 'receipt' && partyName.isNotEmpty) 'partyName': partyName,
    if (kind == 'payment' && billIds.length == 1) 'billId': billIds.single else if (kind == 'payment' && partyName.isNotEmpty) 'partyName': partyName,
    if (kind == 'charge' && head.isNotEmpty) 'head': head,
  };
}

class BankLine {
  const BankLine({
    required this.id,
    required this.account,
    required this.date,
    required this.narration,
    required this.refNo,
    required this.moneyIn,
    required this.moneyOut,
    required this.balance,
    required this.status,
    required this.category,
    required this.tieBreak,
    required this.match,
    required this.suggestions,
  });

  factory BankLine.fromJson(Object? json) {
    final map = _map(json);
    return BankLine(
      id: _text(map['id']),
      account: _text(map['account']),
      date: _text(map['date']),
      narration: _text(map['narration']),
      refNo: _text(map['refNo']),
      moneyIn: _num(map['in']),
      moneyOut: _num(map['out']),
      balance: _numOrNull(map['balance']),
      status: _text(map['status']),
      category: _text(map['category']),
      tieBreak: map['tieBreak'] == true,
      match: map['match'] is Map ? BankMatch.fromJson(map['match']) : null,
      suggestions: _maps(map['suggestions']).map(BankSuggestion.fromJson).toList(),
    );
  }

  final String id;
  final String account;
  final String date;
  final String narration;
  final String refNo;
  final num moneyIn;
  final num moneyOut;
  final num? balance;
  final String status;
  final String category;
  final bool tieBreak;
  final BankMatch? match;
  final List<BankSuggestion> suggestions;

  bool get open => status == 'unmatched';

  bool get linked => status == 'matched' || status == 'ignored';

  bool get isIn => moneyIn > 0;

  num get amount => isIn ? moneyIn : moneyOut;

  String get title {
    final words = narration.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (words.isNotEmpty) return words;
    return refNo.isEmpty ? 'Statement line' : refNo;
  }

  String get sideWords => isIn ? 'in ${rupees(moneyIn)}' : 'out ${rupees(moneyOut)}';

  String get statusWords => switch (status) {
    'unmatched' => 'Not matched yet',
    'matched' => 'Matched',
    'booked' => 'Booked',
    'ignored' => 'Ignored',
    _ => status,
  };

  String get subtitle => '${longDate(date)} · $sideWords · $statusWords';

  String get detailWords => [longDate(date), sideWords, if (refNo.isNotEmpty) 'ref $refNo'].join(' · ');
}

class BankBooksRow {
  const BankBooksRow({
    required this.transferId,
    required this.date,
    required this.docKind,
    required this.docId,
    required this.party,
    required this.moneyIn,
    required this.moneyOut,
  });

  factory BankBooksRow.fromJson(Object? json) {
    final map = _map(json);
    return BankBooksRow(
      transferId: _text(map['transferId']),
      date: _text(map['date']),
      docKind: _text(map['docKind']),
      docId: _text(map['docId']),
      party: _text(map['party']),
      moneyIn: _num(map['in']),
      moneyOut: _num(map['out']),
    );
  }

  final String transferId;
  final String date;
  final String docKind;
  final String docId;
  final String party;
  final num moneyIn;
  final num moneyOut;

  String get title => [_capitalised(bankDocKindWords(docKind)), if (docId.isNotEmpty) docId, if (party.isNotEmpty) '· $party'].join(' ');

  String get subtitle => '${longDate(date)} · ${moneyIn > 0 ? 'in ${rupees(moneyIn)}' : 'out ${rupees(moneyOut)}'}';
}

class BankTotals {
  const BankTotals({
    required this.statementBalance,
    required this.statementOn,
    required this.booksBalance,
    required this.difference,
    required this.unmatched,
    required this.matched,
    required this.booked,
    required this.ignored,
    required this.unmatchedIn,
    required this.unmatchedOut,
  });

  factory BankTotals.fromJson(Object? json) {
    final map = _map(json);
    final lines = _map(map['lines']);
    return BankTotals(
      statementBalance: _numOrNull(map['statementBalance']),
      statementOn: _text(map['statementOn']),
      booksBalance: _num(map['booksBalance']),
      difference: _numOrNull(map['difference']),
      unmatched: _num(lines['unmatched']).toInt(),
      matched: _num(lines['matched']).toInt(),
      booked: _num(lines['booked']).toInt(),
      ignored: _num(lines['ignored']).toInt(),
      unmatchedIn: _num(map['unmatchedIn']),
      unmatchedOut: _num(map['unmatchedOut']),
    );
  }

  final num? statementBalance;
  final String statementOn;
  final num booksBalance;
  final num? difference;
  final int unmatched;
  final int matched;
  final int booked;
  final int ignored;
  final num unmatchedIn;
  final num unmatchedOut;

  int get lines => unmatched + matched + booked + ignored;

  String get statementBalanceWords => _rupeesOr(statementBalance, 'No statement yet');

  String get differenceWords => _rupeesOr(difference, '–');

  String get unmatchedWords => unmatched > 0 ? '$unmatched not matched yet' : lines == 0 ? 'Nothing to match yet' : 'All matched';
}

const bankRuleSides = {'any': 'Money in or out', 'in': 'Money in', 'out': 'Money out'};

const bankRuleKinds = {
  'receipt': 'Receipt from a customer',
  'payment': 'Payment to a supplier',
  'expense': 'Expense',
  'charge': 'Bank charge',
  'interest': 'Interest earned',
  'transfer': 'Transfer to another account',
  'ignore': 'Ignore',
};

class BankRule {
  const BankRule({
    required this.id,
    required this.side,
    required this.contains,
    required this.pattern,
    required this.minAmount,
    required this.maxAmount,
    required this.kind,
    required this.partyName,
    required this.head,
    required this.otherAccount,
    required this.note,
    required this.hits,
    required this.createdOn,
  });

  factory BankRule.fromJson(Object? json) {
    final map = _map(json);
    final then = _map(map['then']);
    return BankRule(
      id: _text(map['id']),
      side: _text(map['side']),
      contains: _text(map['contains']),
      pattern: _text(map['pattern']),
      minAmount: _numOrNull(map['minAmount']),
      maxAmount: _numOrNull(map['maxAmount']),
      kind: _text(then['kind']),
      partyName: _text(then['partyName']),
      head: _text(then['head']),
      otherAccount: _text(then['otherAccount']),
      note: _text(then['note']),
      hits: _num(map['hits']).toInt(),
      createdOn: _text(map['createdOn']),
    );
  }

  final String id;
  final String side;
  final String contains;
  final String pattern;
  final num? minAmount;
  final num? maxAmount;
  final String kind;
  final String partyName;
  final String head;
  final String otherAccount;
  final String note;
  final int hits;
  final String createdOn;

  String get whenWords {
    final low = minAmount;
    final high = maxAmount;
    return [
      if (contains.isNotEmpty) 'containing “$contains”' else if (pattern.isNotEmpty) 'matching $pattern',
      if (low != null && high != null) 'between ${rupees(low)} and ${rupees(high)}' else if (low != null) 'of ${rupees(low)} or more' else if (high != null) 'up to ${rupees(high)}',
    ].join(' ');
  }

  String get thenWords => switch (kind) {
    'receipt' => 'a receipt from $partyName',
    'payment' => 'a payment to $partyName',
    'expense' => head.isEmpty ? 'an expense' : 'an expense under head $head',
    'charge' => 'a bank charge',
    'interest' => 'interest earned',
    'transfer' => otherAccount.isEmpty ? 'a transfer' : 'a transfer with account $otherAccount',
    'ignore' => note.isEmpty ? 'ignored' : 'ignored ($note)',
    _ => kind,
  };

  String get words => [bankRuleSides[side] ?? 'Any line', if (whenWords.isNotEmpty) whenWords, 'is $thenWords'].join(' ');

  String get hitsWords => '$hits ${hits == 1 ? 'line' : 'lines'} so far';

  Map<String, Object?> get args => {
    'side': side,
    if (contains.isNotEmpty) 'contains': contains,
    if (pattern.isNotEmpty) 'pattern': pattern,
    if (minAmount != null) 'minAmount': minAmount,
    if (maxAmount != null) 'maxAmount': maxAmount,
    'kind': kind,
    if (partyName.isNotEmpty) 'partyName': partyName,
    if (head.isNotEmpty) 'head': head,
    if (otherAccount.isNotEmpty) 'otherAccount': otherAccount,
    if (note.isNotEmpty) 'note': note,
  };
}

List<BankRule> bankRulesFrom(Object? json) => _maps(toolData(json)['rules']).map(BankRule.fromJson).toList();

class BankReconciliation {
  const BankReconciliation({
    required this.account,
    required this.from,
    required this.to,
    required this.lines,
    required this.books,
    required this.totals,
    required this.reconciledThrough,
    required this.rules,
    required this.accounts,
  });

  static BankReconciliation? fromTool(Object? json) {
    final data = toolData(json);
    if (data.isEmpty) return null;
    return BankReconciliation(
      account: OwnAccount.fromJson(data['account']),
      from: _text(data['from']),
      to: _text(data['to']),
      lines: _maps(data['lines']).map(BankLine.fromJson).toList(),
      books: _maps(data['books']).map(BankBooksRow.fromJson).toList(),
      totals: BankTotals.fromJson(data['totals']),
      reconciledThrough: _text(data['reconciledThrough']),
      rules: _maps(data['rules']).map(BankRule.fromJson).toList(),
      accounts: _maps(data['accounts']).map(OwnAccount.fromJson).toList(),
    );
  }

  final OwnAccount account;
  final String from;
  final String to;
  final List<BankLine> lines;
  final List<BankBooksRow> books;
  final BankTotals totals;
  final String reconciledThrough;
  final List<BankRule> rules;
  final List<OwnAccount> accounts;

  bool get empty => lines.isEmpty && books.isEmpty;
}
