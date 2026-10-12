import { gstin } from './sprint-load.mjs';
import { creditedAgainst, debitedAgainst } from './credit-notes.mjs';
import { quoteState } from './quotes.mjs';
import { ewayBillStatus, transportWords } from './eway-bill.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const text = (value) => String(value ?? '').trim();

function place(code) {
  const stateCode = text(code);
  return { code: stateCode, name: gstin.STATE_CODES[stateCode] || '' };
}

function partyOf(state, doc) {
  return (state.parties || []).find((p) => (doc.partyAccountId ? p.accountId === doc.partyAccountId : p.name === doc.partyName && text(p.gstin) === text(doc.partyGstin))) || null;
}

function common(state, doc) {
  const company = state.company || {};
  const party = partyOf(state, doc);
  const buyerAddress = text(doc.partyAddress || party?.address);
  const missing = [];
  if (!text(company.gstin)) missing.push('SELLER_GSTIN');
  if (!text(company.address)) missing.push('SELLER_ADDRESS');
  if (!buyerAddress && (text(doc.partyGstin) || round2(doc.total) >= 50000)) missing.push('BUYER_ADDRESS');
  if (doc.lines.some((line) => !text(line.hsn))) missing.push('HSN');
  return {
    id: doc.id,
    date: doc.date,
    seller: {
      name: text(company.name),
      gstin: text(company.gstin),
      address: text(company.address),
      city: text(company.city),
      pin: text(company.pin),
      state: place(company.state),
    },
    buyer: { name: text(doc.partyName), gstin: text(doc.partyGstin), address: buyerAddress },
    placeOfSupply: place(doc.placeOfSupply || doc.partyState),
    lines: doc.lines.map((line) => ({
      description: text(line.description),
      hsn: text(line.hsn),
      qty: line.qty,
      rate: round2(line.rate),
      gstRate: line.gstRate,
      taxable: round2(line.taxable),
      cgst: round2(line.cgst),
      sgst: round2(line.sgst),
      igst: round2(line.igst),
      amount: round2(line.amount),
    })),
    taxable: round2(doc.taxable),
    cgst: round2(doc.cgst),
    sgst: round2(doc.sgst),
    igst: round2(doc.igst),
    total: round2(doc.total),
    missing,
  };
}

export function invoiceDocument(state, id) {
  const invoice = (state.invoices || []).find((item) => item.id === text(id).toUpperCase());
  if (!invoice) return { ok: false, error: 'INVOICE_NOT_FOUND' };
  const receipts = (invoice.receipts || []).map((receipt) => ({
    date: text(receipt.date),
    mode: text(receipt.mode),
    amount: round2(receipt.amount),
  }));
  const received = round2(receipts.reduce((sum, receipt) => sum + receipt.amount, 0));
  const credited = creditedAgainst(state, invoice.id);
  const creditNotes = (state.creditNotes || []).filter((note) => note.invoiceId === invoice.id).map((note) => ({ id: note.id, date: note.date, reason: note.reason, total: note.total, cancels: Boolean(note.cancels) }));
  const debited = debitedAgainst(state, invoice.id);
  const debitNotes = (state.debitNotes || []).filter((note) => note.invoiceId === invoice.id).map((note) => ({ id: note.id, date: note.date, reason: note.reason, total: note.total }));
  return {
    ok: true,
    data: {
      ...common(state, invoice),
      kind: 'invoice',
      receipts,
      received,
      credited,
      creditNotes,
      debited,
      debitNotes,
      shares: (invoice.shares || []).map((share) => ({ on: share.on, by: share.by, channel: share.channel, outcome: share.outcome })),
      ewayBill: ewayBillWords(ewayBillStatus(state, invoice)),
      status: invoice.status,
      paymentTermsDays: invoice.paymentTermsDays ?? null,
      dueDate: invoice.dueDate || '',
      quoteId: invoice.quoteId || '',
      balance: round2(invoice.total - received - credited),
    },
  };
}

function ewayBillWords(status) {
  return {
    needed: Boolean(status.needed),
    why: status.why || '',
    status: status.status,
    threshold: status.threshold ?? null,
    interState: Boolean(status.interState),
    transport: status.transport ? { ...status.transport, words: transportWords(status.transport) } : null,
    ewbNo: status.ewbNo || '',
    ewbValidity: status.ewbValidity || '',
    hasIrn: Boolean(status.hasIrn),
    next: {
      'not-needed': '',
      'transport-needed': 'Add the vehicle, distance and transporter, then the e-way bill can be generated.',
      'irn-needed': 'Generate the e-invoice (IRN) first; the e-way bill is generated from it through the action gate.',
      ready: 'Ready to generate through the action gate (live switch and approval).',
      generated: '',
    }[status.status] || '',
  };
}

export function quoteDocument(state, id) {
  const quote = (state.quotes || []).find((item) => item.id === text(id).toUpperCase());
  if (!quote) return { ok: false, error: 'QUOTE_NOT_FOUND' };
  return {
    ok: true,
    data: {
      ...common(state, quote),
      kind: 'quote',
      validUntil: quote.validUntil,
      status: quoteState(quote),
      invoiceId: quote.invoiceId || '',
      receipts: [],
      received: 0,
      credited: 0,
      creditNotes: [],
      balance: round2(quote.total),
    },
  };
}
