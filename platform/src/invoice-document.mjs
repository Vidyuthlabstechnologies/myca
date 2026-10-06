import { gstin } from './sprint-load.mjs';
import { creditedAgainst } from './credit-notes.mjs';
import { quoteState } from './quotes.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const text = (value) => String(value ?? '').trim();

function place(code) {
  const stateCode = text(code);
  return { code: stateCode, name: gstin.STATE_CODES[stateCode] || '' };
}

function common(state, doc) {
  const company = state.company || {};
  const missing = [];
  if (!text(company.gstin)) missing.push('SELLER_GSTIN');
  if (!text(company.address)) missing.push('SELLER_ADDRESS');
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
    buyer: { name: text(doc.partyName), gstin: text(doc.partyGstin) },
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
  return {
    ok: true,
    data: {
      ...common(state, invoice),
      kind: 'invoice',
      receipts,
      received,
      credited,
      creditNotes,
      status: invoice.status,
      paymentTermsDays: invoice.paymentTermsDays ?? null,
      dueDate: invoice.dueDate || '',
      quoteId: invoice.quoteId || '',
      balance: round2(invoice.total - received - credited),
    },
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
