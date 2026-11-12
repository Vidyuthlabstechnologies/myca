part of '../models.dart';

const salesDocumentKinds = ['quote', 'proforma', 'order', 'challan'];

const salesDocumentLabels = {
  'quote': 'Quote',
  'proforma': 'Proforma invoice',
  'order': 'Sales order',
  'challan': 'Delivery challan',
};

const challanReasonLabels = {
  'job-work': 'Sent for job work',
  'approval': 'Supply on approval',
  'line-sale': 'Line sale',
  'exhibition': 'For an exhibition',
  'own-use': 'Own use',
  'other': 'Other',
};

String salesDocumentLabel(String kind) => salesDocumentLabels[kind] ?? 'Quote';

String salesKindOfId(String id) => switch (id.split('-').first.toUpperCase()) {
      'PI' => 'proforma',
      'SO' => 'order',
      'DC' => 'challan',
      _ => 'quote',
    };

class Quote {
  const Quote({
    required this.id,
    required this.date,
    required this.partyName,
    required this.partyGstin,
    required this.total,
    required this.validUntil,
    required this.status,
    required this.invoiceId,
    this.kind = 'quote',
    this.reason = '',
  });

  factory Quote.fromJson(Object? json) {
    final map = _map(json);
    final kind = _text(map['kind']);
    return Quote(
      id: _text(map['id']),
      date: _text(map['date']),
      partyName: _text(map['partyName']),
      partyGstin: _text(map['partyGstin']),
      total: _num(map['total']),
      validUntil: _text(map['validUntil']),
      status: _text(map['status']),
      invoiceId: _text(map['invoiceId']),
      kind: salesDocumentKinds.contains(kind) ? kind : 'quote',
      reason: _text(map['reason']),
    );
  }

  final String id;
  final String date;
  final String partyName;
  final String partyGstin;
  final num total;
  final String validUntil;
  final String status;
  final String invoiceId;
  final String kind;
  final String reason;

  String get label => salesDocumentLabel(kind);
  bool get expires => kind == 'quote' || kind == 'proforma';

  String stateOn(String today) => status == 'open' && expires && validUntil.compareTo(today) < 0 ? 'expired' : status;
}

class RecurringEntry {
  const RecurringEntry({
    required this.id,
    required this.kind,
    required this.every,
    required this.party,
    required this.amount,
    required this.startDate,
    required this.endDate,
    required this.nextDate,
    required this.status,
    required this.count,
    required this.lastError,
    required this.lastDate,
    required this.lastId,
  });

  factory RecurringEntry.fromJson(Object? json) {
    final map = _map(json);
    final last = _map(map['last']);
    return RecurringEntry(
      id: _text(map['id']),
      kind: _text(map['kind']),
      every: _text(map['every']),
      party: _text(map['party']),
      amount: _num(map['amount']),
      startDate: _text(map['startDate']),
      endDate: _text(map['endDate']),
      nextDate: _text(map['nextDate']),
      status: _text(map['status']),
      count: _num(map['count']).toInt(),
      lastError: _text(map['lastError']),
      lastDate: _text(last['date']),
      lastId: _text(last['id']),
    );
  }

  final String id;
  final String kind;
  final String every;
  final String party;
  final num amount;
  final String startDate;
  final String endDate;
  final String nextDate;
  final String status;
  final int count;
  final String lastError;
  final String lastDate;
  final String lastId;

  bool get active => status == 'active';

  String get kindWords => switch (kind) {
        'invoice' => 'Invoice to',
        'bill' => 'Bill from',
        _ => 'Expense',
      };
}

const repeatEveryLabels = {
  'week': 'Every week',
  'month': 'Every month',
  'quarter': 'Every quarter',
  'half-year': 'Every six months',
  'year': 'Every year',
};

List<RecurringEntry> recurringFrom(Object? json) =>
    _maps(toolData(json)['schedules']).map(RecurringEntry.fromJson).toList();

class Today {
  const Today({
    required this.gst,
    required this.deadlines,
    required this.exceptions,
    this.summary,
    this.reminders = const [],
  });

  final PeriodGst? gst;
  final List<Deadline> deadlines;
  final List<ExceptionItem> exceptions;
  final BusinessSummary? summary;
  final List<Reminder> reminders;
}

class ToolOutcome {
  const ToolOutcome({required this.ok, required this.error});

  factory ToolOutcome.fromJson(Object? json) {
    final map = _map(json);
    return ToolOutcome(ok: map['ok'] != false, error: _text(map['error']));
  }

  final bool ok;
  final String error;
}

class Place {
  const Place({required this.code, required this.name});

  factory Place.fromJson(Object? json) {
    final map = _map(json);
    return Place(code: _text(map['code']), name: _text(map['name']));
  }

  final String code;
  final String name;

  String get label =>
      name.isEmpty ? code : (code.isEmpty ? name : '$name ($code)');
}

class InvoiceLine {
  const InvoiceLine({
    required this.description,
    required this.hsn,
    required this.qty,
    required this.rate,
    required this.gstRate,
    required this.taxable,
    required this.amount,
    this.taxRate = 0,
  });

  factory InvoiceLine.fromJson(Object? json) {
    final map = _map(json);
    return InvoiceLine(
      description: _text(map['description']),
      hsn: _text(map['hsn']),
      qty: _num(map['qty']),
      rate: _num(map['rate']),
      gstRate: _num(map['gstRate']),
      taxable: _num(map['taxable']),
      amount: _num(map['amount']),
      taxRate: _num(map['taxRate']),
    );
  }

  final String description;
  final String hsn;
  final num qty;
  final num rate;
  final num gstRate;
  final num taxable;
  final num amount;
  final num taxRate;
}

class InvoiceTemplate {
  const InvoiceTemplate({
    this.accent = 0xFFB42318,
    this.layout = 'classic',
    this.signatory = '',
    this.footer = '',
    this.terms = '',
    this.bankWords = '',
    this.showHsn = true,
  });

  factory InvoiceTemplate.fromJson(Object? json) {
    final map = _map(json);
    final hex = _text(map['accent']);
    final parsed = RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(hex)
        ? int.parse(hex.substring(1), radix: 16)
        : 0xB42318;
    return InvoiceTemplate(
      accent: 0xFF000000 | parsed,
      layout: _text(map['layout']) == 'minimal' ? 'minimal' : 'classic',
      signatory: _text(map['signatory']),
      footer: _text(map['footer']),
      terms: _text(map['terms']),
      bankWords: _text(map['bankWords']),
      showHsn: map['showHsn'] != false,
    );
  }

  final int accent;
  final String layout;
  final String signatory;
  final String footer;
  final String terms;
  final String bankWords;
  final bool showHsn;

  bool get minimal => layout == 'minimal';
}

class InvoiceDocument {
  const InvoiceDocument({
    required this.id,
    required this.date,
    required this.sellerName,
    required this.sellerGstin,
    required this.sellerAddress,
    required this.sellerState,
    required this.buyerName,
    required this.buyerGstin,
    required this.placeOfSupply,
    required this.lines,
    required this.taxable,
    required this.cgst,
    required this.sgst,
    required this.igst,
    required this.total,
    required this.receipts,
    required this.received,
    required this.credited,
    required this.creditNotes,
    required this.status,
    required this.balance,
    required this.missing,
    this.debited = 0,
    this.debitNotes = const <CreditNote>[],
    this.buyerAddress = '',
    this.shares = const <InvoiceShare>[],
    this.ewayBill,
    this.einvoice,
    this.dueDate = '',
    this.termsDays,
    this.kind = 'invoice',
    this.validUntil = '',
    this.documentKind = '',
    this.reason = '',
    this.linkedId = '',
    this.country = 'IN',
    this.subtotal = 0,
    this.salesTax = 0,
    this.taxJurisdiction = '',
    this.taxRate = 0,
    this.taxExempt = false,
    this.exemptionReason = '',
    this.template = const InvoiceTemplate(),
    this.upiLink = '',
  });

  static InvoiceDocument? fromTool(Object? json) {
    final map = toolData(json);
    if (_text(map['id']).isEmpty) return null;
    final seller = _map(map['seller']);
    final buyer = _map(map['buyer']);
    final address = [
      _text(seller['address']),
      _text(seller['city']),
      _text(seller['pin']),
    ].where((part) => part.isNotEmpty).join(', ');
    return InvoiceDocument(
      id: _text(map['id']),
      date: _text(map['date']),
      sellerName: _text(seller['name']),
      sellerGstin: _text(seller['gstin']),
      sellerAddress: address,
      sellerState: Place.fromJson(seller['state']),
      buyerName: _text(buyer['name']),
      buyerGstin: _text(buyer['gstin']),
      placeOfSupply: Place.fromJson(map['placeOfSupply']),
      lines: _maps(map['lines']).map(InvoiceLine.fromJson).toList(),
      taxable: _num(map['taxable']),
      cgst: _num(map['cgst']),
      sgst: _num(map['sgst']),
      igst: _num(map['igst']),
      total: _num(map['total']),
      receipts: _maps(map['receipts']).map(Receipt.fromJson).toList(),
      received: _num(map['received']),
      credited: _num(map['credited']),
      creditNotes: _maps(map['creditNotes']).map(CreditNote.fromJson).toList(),
      debited: _num(map['debited']),
      debitNotes: _maps(map['debitNotes']).map(CreditNote.fromJson).toList(),
      buyerAddress: _text(buyer['address']),
      shares: _maps(map['shares']).map(InvoiceShare.fromJson).toList(),
      ewayBill: map['ewayBill'] is Map ? EwayBill.fromJson(map['ewayBill']) : null,
      einvoice: map['einvoice'] is Map ? EInvoice.fromJson(map['einvoice']) : null,
      status: _text(map['status']),
      balance: _num(map['balance']),
      dueDate: _text(map['dueDate']),
      termsDays: map['paymentTermsDays'] is num
          ? (map['paymentTermsDays'] as num).toInt()
          : null,
      kind: _text(map['kind']).isEmpty ? 'invoice' : _text(map['kind']),
      documentKind: _text(map['documentKind']).isEmpty ? (_text(map['kind']) == 'quote' ? 'quote' : '') : _text(map['documentKind']),
      reason: _text(map['reason']),
      validUntil: _text(map['validUntil']),
      linkedId: _text(map['kind']) == 'quote' ? _text(map['invoiceId']) : _text(map['quoteId']),
      country: _text(map['country']).isEmpty ? 'IN' : _text(map['country']).toUpperCase(),
      subtotal: _num(map['subtotal']),
      salesTax: _num(map['salesTax']),
      taxJurisdiction: _text(map['taxJurisdiction']),
      taxRate: _num(map['taxRate']),
      taxExempt: map['taxExempt'] == true,
      exemptionReason: _text(map['exemptionReason']),
      template: InvoiceTemplate.fromJson(map['template']),
      upiLink: _text(_map(map['upiPayment'])['link']),
      missing: [
        for (final code in (map['missing'] as List? ?? const [])) _text(code),
      ],
    );
  }

  final String upiLink;
  final String id;
  final String date;
  final String sellerName;
  final String sellerGstin;
  final String sellerAddress;
  final Place sellerState;
  final String buyerName;
  final String buyerGstin;
  final Place placeOfSupply;
  final List<InvoiceLine> lines;
  final num taxable;
  final num cgst;
  final num sgst;
  final num igst;
  final num total;
  final List<Receipt> receipts;
  final num received;
  final num credited;
  final List<CreditNote> creditNotes;
  final num debited;
  final List<CreditNote> debitNotes;
  final String buyerAddress;
  final List<InvoiceShare> shares;
  final EwayBill? ewayBill;
  final EInvoice? einvoice;
  final String status;
  final num balance;
  final List<String> missing;
  final String dueDate;
  final int? termsDays;

  bool get cancelled => status == 'cancelled';

  final String kind;
  final String validUntil;
  final String linkedId;
  final String country;
  final num subtotal;
  final num salesTax;
  final String taxJurisdiction;
  final num taxRate;
  final bool taxExempt;
  final String exemptionReason;
  final InvoiceTemplate template;

  final String documentKind;
  final String reason;

  bool get isQuote => kind == 'quote';
  bool get isChallan => documentKind == 'challan';
  bool get canAccept => isQuote && (documentKind == 'quote' || documentKind == 'proforma');
  bool get canCancelOrder => isQuote && (documentKind == 'order' || documentKind == 'challan');
  bool get canReturn => isChallan;
  bool get canInvoice => isQuote && !(isChallan && reason == 'job-work');

  bool get isUs => country == 'US';

  String get title => isQuote ? (documentKind == 'quote' || documentKind.isEmpty ? 'Quotation' : salesDocumentLabel(documentKind)) : (sellerGstin.isEmpty ? 'Invoice' : 'Tax invoice');

  String get subtotalLabel => isUs ? 'Subtotal' : 'Taxable value';

  List<(String, num)> get taxHeads => isUs
      ? [
          if (taxExempt)
            ('Sales tax: exempt ($exemptionReason)', 0)
          else if (taxJurisdiction.isNotEmpty)
            ('Sales tax ($taxJurisdiction ${_plainRate(taxRate)}%)', salesTax),
        ]
      : [
          if (cgst > 0) ('CGST', cgst),
          if (sgst > 0) ('SGST', sgst),
          if (igst > 0) ('IGST', igst),
        ];
}

String _plainRate(num value) => value == value.roundToDouble() ? value.toInt().toString() : value.toString();

class RulesStatus {
  const RulesStatus({required this.asOf, required this.records, required this.attested, required this.attention, required this.notes});

  static RulesStatus? fromTool(Object? json) {
    final map = _map(json);
    if (map['ok'] == false) return null;
    final data = toolData(json);
    final totals = _map(data['totals']);
    return RulesStatus(
      asOf: _text(data['asOf']),
      records: totals['records'] is num ? (totals['records'] as num).toInt() : 0,
      attested: totals['attested'] is num ? (totals['attested'] as num).toInt() : 0,
      attention: [for (final row in _maps(data['families'])) if (row['attention'] == true) _text(row['title'])],
      notes: [for (final note in (data['notes'] as List? ?? const [])) _text(note)],
    );
  }

  final String asOf;
  final int records;
  final int attested;
  final List<String> attention;
  final List<String> notes;

  String get summary => '$records dated records, $attested reviewed by your accountant.';
}

class SalesTaxFiled {
  const SalesTaxFiled({required this.confirmation, required this.filedOn, required this.late});

  final String confirmation;
  final String filedOn;
  final bool late;
}

class SalesTaxPeriod {
  const SalesTaxPeriod({
    required this.period,
    required this.taxCollected,
    required this.toPay,
    required this.dueDate,
    required this.filed,
    required this.approved,
    required this.empty,
    required this.ended,
  });

  factory SalesTaxPeriod.fromJson(Object? json) {
    final map = _map(json);
    final filed = map['filed'] is Map ? _map(map['filed']) : null;
    return SalesTaxPeriod(
      period: _text(map['period']),
      taxCollected: _num(map['taxCollected']),
      toPay: _num(map['toPay']),
      dueDate: _text(map['dueDate']),
      filed: filed == null ? null : SalesTaxFiled(confirmation: _text(filed['confirmation']), filedOn: _text(filed['filedOn']), late: filed['late'] == true),
      approved: map['approved'] == true,
      empty: map['empty'] == true,
      ended: map['ended'] != false,
    );
  }

  final String period;
  final num taxCollected;
  final num toPay;
  final String dueDate;
  final SalesTaxFiled? filed;
  final bool approved;
  final bool empty;
  final bool ended;
}

class SalesTaxStateRow {
  const SalesTaxStateRow({
    required this.state,
    required this.frequency,
    required this.permitNo,
    required this.lastPeriod,
    required this.overdue,
    required this.notes,
  });

  factory SalesTaxStateRow.fromJson(Object? json) {
    final map = _map(json);
    return SalesTaxStateRow(
      state: _text(map['state']),
      frequency: _text(map['frequency']),
      permitNo: _text(map['permitNo']),
      lastPeriod: map['lastPeriod'] is Map ? SalesTaxPeriod.fromJson(map['lastPeriod']) : null,
      overdue: map['overdue'] == true,
      notes: [for (final note in (map['notes'] as List? ?? const [])) _text(note)],
    );
  }

  final String state;
  final String frequency;
  final String permitNo;
  final SalesTaxPeriod? lastPeriod;
  final bool overdue;
  final List<String> notes;
}

class SalesTaxOverview {
  const SalesTaxOverview({required this.states, required this.overdue});

  static SalesTaxOverview? fromTool(Object? json) {
    final map = _map(json);
    if (map['ok'] == false) return null;
    final data = toolData(json);
    return SalesTaxOverview(
      states: _maps(data['states']).map(SalesTaxStateRow.fromJson).toList(),
      overdue: data['overdue'] is num ? (data['overdue'] as num).toInt() : 0,
    );
  }

  final List<SalesTaxStateRow> states;
  final int overdue;

  bool get hasNexus => states.isNotEmpty;
}
