part of '../models.dart';

class Receipt {
  const Receipt({
    required this.amount,
    required this.date,
    required this.mode,
    this.section = '',
    this.tan = '',
  });

  factory Receipt.fromJson(Object? json) {
    final map = _map(json);
    return Receipt(
      amount: _num(map['amount']),
      date: _text(map['date']),
      mode: _text(map['mode']),
      section: _text(map['section']),
      tan: _text(map['tan']),
    );
  }

  final num amount;
  final String date;
  final String mode;
  final String section;
  final String tan;

  bool get tds => mode == 'tds';
}

class CreditNote {
  const CreditNote({
    required this.id,
    required this.date,
    required this.invoiceId,
    required this.partyName,
    required this.reason,
    required this.total,
    required this.cancels,
  });

  factory CreditNote.fromJson(Object? json) {
    final map = _map(json);
    return CreditNote(
      id: _text(map['id']),
      date: _text(map['date']),
      invoiceId: _text(map['invoiceId']),
      partyName: _text(map['partyName']),
      reason: _text(map['reason']),
      total: _num(map['total']),
      cancels: map['cancels'] == true,
    );
  }

  final String id;
  final String date;
  final String invoiceId;
  final String partyName;
  final String reason;
  final num total;
  final bool cancels;
}

class Invoice {
  const Invoice({
    required this.id,
    required this.date,
    required this.partyName,
    required this.partyGstin,
    required this.total,
    required this.status,
    required this.receipts,
    required this.gstRates,
    this.payments = const [],
    this.dueDate = '',
    this.termsDays,
    this.msme = false,
  });

  factory Invoice.fromJson(Object? json) {
    final map = _map(json);
    return Invoice(
      id: _text(map['id']),
      date: _text(map['date']),
      partyName: _text(map['partyName']),
      partyGstin: _text(map['partyGstin']),
      total: _num(map['total']),
      status: _text(map['status']),
      receipts: _maps(map['receipts']).map(Receipt.fromJson).toList(),
      payments: _maps(map['payments']).map(Receipt.fromJson).toList(),
      dueDate: _text(map['dueDate']),
      msme: map['msme'] == true,
      termsDays: map['paymentTermsDays'] is num
          ? (map['paymentTermsDays'] as num).toInt()
          : null,
      gstRates: [
        for (final line in _maps(map['lines']))
          if (line['gstRate'] is num) line['gstRate'] as num,
      ],
    );
  }

  final String id;
  final String date;
  final String partyName;
  final String partyGstin;
  final num total;
  final String status;
  final List<Receipt> receipts;
  final List<Receipt> payments;
  final List<num> gstRates;
  final String dueDate;
  final int? termsDays;
  final bool msme;

  bool get paid => status == 'paid';

  bool get partial => status == 'partial';

  num get owed => _stillOpen(total - receipts.fold<num>(0, (sum, r) => sum + r.amount) - payments.fold<num>(0, (sum, p) => sum + p.amount));

  num owedAfter(Iterable<CreditNote> notes) => _stillOpen(owed - notes.where((note) => note.invoiceId == id).fold<num>(0, (sum, note) => sum + note.total));

  bool get cancelled => status == 'cancelled';

  bool get open => !paid && !cancelled && status != 'settled';
}

class HeldInvoice {
  const HeldInvoice({required this.number, required this.code});

  factory HeldInvoice.fromJson(Object? json) {
    final map = _map(json);
    return HeldInvoice(number: _text(map['inum']), code: _text(map['code']));
  }

  final String number;
  final String code;
}

class InvoiceShare {
  const InvoiceShare({required this.on, required this.by, required this.channel, required this.outcome});

  factory InvoiceShare.fromJson(Object? json) {
    final map = _map(json);
    return InvoiceShare(on: _text(map['on']), by: _text(map['by']), channel: _text(map['channel']), outcome: _text(map['outcome']));
  }

  final String on;
  final String by;
  final String channel;
  final String outcome;
}

class EInvoice {
  const EInvoice({required this.status, required this.irn, required this.ackNo, required this.why, this.ackDate = '', this.signedQrCode = ''});

  factory EInvoice.fromJson(Object? json) {
    final map = _map(json);
    return EInvoice(status: _text(map['status']), irn: _text(map['irn']), ackNo: _text(map['ackNo']), why: _text(map['why']), ackDate: _text(map['ackDate']), signedQrCode: _text(map['signedQrCode']));
  }

  final String ackDate;
  final String signedQrCode;

  bool get onPdf => irn.isNotEmpty && (status == 'issued' || status == 'sandbox' || status == 'mock');

  bool get valid => status == 'issued';

  final String status;
  final String irn;
  final String ackNo;
  final String why;
}

class EwayBill {
  const EwayBill({
    required this.needed,
    required this.why,
    required this.status,
    required this.transportWords,
    required this.ewbNo,
    required this.ewbValidity,
    required this.next,
  });

  factory EwayBill.fromJson(Object? json) {
    final map = _map(json);
    final transport = map['transport'];
    return EwayBill(
      needed: map['needed'] == true,
      why: _text(map['why']),
      status: _text(map['status']),
      transportWords: transport is Map ? _text(transport['words']) : '',
      ewbNo: _text(map['ewbNo']),
      ewbValidity: _text(map['ewbValidity']),
      next: _text(map['next']),
    );
  }

  final bool needed;
  final String why;
  final String status;
  final String transportWords;
  final String ewbNo;
  final String ewbValidity;
  final String next;
}

class OwedCustomer {
  const OwedCustomer({
    required this.name,
    required this.due,
    required this.invoices,
  });

  factory OwedCustomer.fromJson(Object? json) {
    final map = _map(json);
    return OwedCustomer(
      name: _text(map['name']),
      due: _num(map['due']),
      invoices: _num(map['invoices']).toInt(),
    );
  }

  final String name;
  final num due;
  final int invoices;
}

class CollectionDraft {
  const CollectionDraft({
    required this.customer,
    required this.total,
    required this.invoices,
    required this.oldestDaysLate,
    required this.tone,
    required this.scoreWords,
    required this.message,
    required this.lastSent,
    required this.timesSent,
  });

  static CollectionDraft? fromTool(Object? json) {
    final data = toolData(json);
    final rows = _maps(data['customers']);
    if (rows.isEmpty) return null;
    final map = rows.first;
    if (_text(map['message']).isEmpty) return null;
    return CollectionDraft(
      customer: _text(map['customer']),
      total: _num(map['total']),
      invoices: _maps(map['invoices']).length,
      oldestDaysLate: _num(map['oldestDaysLate']).toInt(),
      tone: _text(map['tone']),
      scoreWords: _text(map['scoreWords']),
      message: _text(map['message']),
      lastSent: _text(map['lastSent']),
      timesSent: _num(map['timesSent']).toInt(),
    );
  }

  final String customer;
  final num total;
  final int invoices;
  final int oldestDaysLate;
  final String tone;
  final String scoreWords;
  final String message;
  final String lastSent;
  final int timesSent;
}

class Reminder {
  const Reminder({
    required this.id,
    required this.text,
    required this.due,
    required this.inDays,
    required this.state,
    required this.aboutLabel,
    this.documentSha256 = '',
    this.documentName = '',
  });

  factory Reminder.fromJson(Object? json) {
    final map = _map(json);
    final about = _map(map['about']);
    final id = _text(about['id']);
    final name = _text(about['name']);
    return Reminder(
      id: _text(map['id']),
      text: _text(map['text']),
      due: _text(map['due']),
      inDays: _num(map['inDays']).toInt(),
      state: _text(map['state']),
      aboutLabel: _text(about['kind']) == 'document'
          ? name
          : [id, name].where((part) => part.isNotEmpty).join(', '),
      documentSha256: _text(map['documentSha256']),
      documentName: _text(map['documentName']),
    );
  }

  final String id;
  final String text;
  final String due;
  final int inDays;
  final String state;
  final String aboutLabel;
  final String documentSha256;
  final String documentName;

  bool get hasDocument => documentSha256.isNotEmpty;
  bool get isDue => state == 'overdue' || state == 'today';
}

List<Reminder> remindersFrom(Object? json) =>
    _maps(toolData(json)['reminders']).map(Reminder.fromJson).toList();

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
    this.documentTitle = '',
    this.reverseChargeLine = '',
    this.exportEndorsement = '',
    this.compositionDeclaration = '',
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
      documentTitle: _text(map['documentTitle']),
      reverseChargeLine: _text(map['reverseChargeLine']),
      exportEndorsement: _text(map['exportEndorsement']),
      compositionDeclaration: _text(map['compositionDeclaration']),
      missing: [
        for (final code in (map['missing'] as List? ?? const [])) _text(code),
      ],
    );
  }

  final String upiLink;
  final String documentTitle;
  final String reverseChargeLine;
  final String exportEndorsement;
  final String compositionDeclaration;
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

  String get title => isQuote ? (documentKind == 'quote' || documentKind.isEmpty ? 'Quotation' : salesDocumentLabel(documentKind)) : documentTitle.isNotEmpty ? documentTitle : (sellerGstin.isEmpty ? 'Invoice' : 'Tax invoice');

  List<String> get statutoryLines => [
        if (!isQuote) ...[
          if (reverseChargeLine.isNotEmpty) reverseChargeLine,
          if (exportEndorsement.isNotEmpty) exportEndorsement,
          if (compositionDeclaration.isNotEmpty) compositionDeclaration,
        ],
      ];

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
