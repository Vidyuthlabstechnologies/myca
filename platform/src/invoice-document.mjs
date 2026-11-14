import { gstin } from './sprint-load.mjs';
import { creditedAgainst, debitedAgainst } from './credit-notes.mjs';
import { quoteState, kindOf, kindTitle } from './quotes.mjs';
import { ewayBillStatus, transportWords } from './eway-bill.mjs';
import { countryOf } from './country.mjs';
import { invoiceTemplateOf, bankWords } from './invoice-template.mjs';
import { isTdsReceipt, tdsReceiptLabel, tdsWithheldOn } from './tds-credits.mjs';
import { COMPOSITION_DECLARATION, documentTitleOf, einvoiceProofOf, exportEndorsementOf, hsnShownOn, reverseChargeLineOf } from './invoice-compliance.mjs';

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
  const us = countryOf(state) === 'US';
  const missing = [];
  if (!us && !text(company.gstin)) missing.push('SELLER_GSTIN');
  if (!text(company.address)) missing.push('SELLER_ADDRESS');
  if (!us && !buyerAddress && (text(doc.partyGstin) || round2(doc.total) >= 50000)) missing.push('BUYER_ADDRESS');
  if (!us && doc.lines.some((line) => !text(line.hsn))) missing.push('HSN');
  return {
    id: doc.id,
    date: doc.date,
    seller: {
      name: text(company.name),
      gstin: text(doc.registrationGstin || company.gstin),
      address: text(company.address),
      city: text(company.city),
      pin: text(company.pin),
      state: place(doc.registrationState || company.state),
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
      ...(us ? { taxRate: Number(line.taxRate || 0), salesTax: round2(line.salesTax || 0) } : {}),
    })),
    taxable: round2(doc.taxable),
    cgst: round2(doc.cgst),
    sgst: round2(doc.sgst),
    igst: round2(doc.igst),
    total: round2(doc.total),
    missing,
    template: (() => { const t = invoiceTemplateOf(state); return { ...t, showHsn: hsnShownOn(state, doc, t), bankWords: bankWords(t.bank) }; })(),
    ...(us ? { country: 'US', subtotal: round2(doc.subtotal ?? doc.taxable), salesTax: round2(doc.salesTax ?? doc.salesTaxPaid ?? 0), taxJurisdiction: text(doc.taxJurisdiction), taxRate: Number(doc.taxRate || 0), taxExempt: Boolean(doc.taxExempt), exemptionReason: text(doc.exemptionReason) } : { country: 'IN' }),
  };
}

export function invoiceDocument(state, id) {
  const invoice = (state.invoices || []).find((item) => item.id === text(id).toUpperCase());
  if (!invoice) return { ok: false, error: 'INVOICE_NOT_FOUND' };
  const receipts = (invoice.receipts || []).map((receipt) => ({
    date: text(receipt.date),
    mode: text(receipt.mode),
    amount: round2(receipt.amount),
    ...(isTdsReceipt(receipt) ? { label: tdsReceiptLabel(state, receipt), section: text(receipt.section), ...(receipt.tan ? { tan: text(receipt.tan) } : {}) } : {}),
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
      documentTitle: documentTitleOf(state, invoice),
      reverseChargeLine: reverseChargeLineOf(state, invoice),
      exportEndorsement: exportEndorsementOf(state, invoice),
      ...(state.company?.composition === true ? { compositionDeclaration: COMPOSITION_DECLARATION } : {}),
      receipts,
      received,
      tdsWithheld: tdsWithheldOn(invoice),
      credited,
      creditNotes,
      debited,
      debitNotes,
      shares: (invoice.shares || []).map((share) => ({ on: share.on, by: share.by, channel: share.channel, outcome: share.outcome })),
      ewayBill: ewayBillWords(ewayBillStatus(state, invoice)),
      einvoice: einvoiceWords(state, invoice),
      status: invoice.status,
      paymentTermsDays: invoice.paymentTermsDays ?? null,
      dueDate: invoice.dueDate || '',
      quoteId: invoice.quoteId || '',
      balance: round2(invoice.total + debited - received - credited),
      upiPayment: upiPayment(state, invoice, round2(invoice.total + debited - received - credited)),
    },
  };
}

const UPI_ID = /^[a-z0-9][a-z0-9._-]{1,63}@[a-z][a-z0-9]{1,31}$/;

export function upiPayment(state, invoice, balance) {
  if (countryOf(state) !== 'IN') return null;
  if (invoice.status === 'cancelled' || !(balance > 0)) return null;
  const upi = invoiceTemplateOf(state).bank.upi;
  if (!UPI_ID.test(upi)) return null;
  const payee = text(state.company?.name).slice(0, 50);
  const query = [
    ['pa', upi],
    ['pn', payee],
    ['am', balance.toFixed(2)],
    ['cu', 'INR'],
    ['tn', `${invoice.id} ${payee}`.slice(0, 80)],
  ].map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  return { upi, amount: balance, link: `upi://pay?${query}` };
}

function einvoiceWords(state, invoice) {
  if ((state.company?.country || 'IN') !== 'IN') return null;
  if (invoice.status === 'cancelled') return { status: 'not-applicable', irn: '', why: 'The invoice is cancelled.' };
  if (!invoice.partyGstin && !invoice.export) return { status: 'not-applicable', irn: '', why: 'E-invoicing applies to invoices to registered buyers (B2B); this one is to an unregistered buyer.' };
  if (invoice.irn) return { status: 'issued', irn: invoice.irn, ackNo: invoice.ackNo || '', ...einvoiceProofOf(invoice), why: 'IRN issued by the IRP.' };
  if (invoice.sandboxIrn) return { status: 'sandbox', irn: invoice.sandboxIrn, ackNo: invoice.sandboxAckNo || '', ...einvoiceProofOf(invoice, 'sandbox'), why: 'Sandbox IRN from the NIC test IRP. It is not valid for a real supply; switch e-invoicing to live to issue the real one.' };
  if (invoice.mockIrn) return { status: 'mock', irn: invoice.mockIrn, ackNo: invoice.mockAckNo || '', ...einvoiceProofOf(invoice, 'mock'), why: 'Simulated IRN; nothing reached the IRP.' };
  return { status: 'ready', irn: '', why: 'If your turnover brings you into e-invoicing, generate the IRN; it goes through the action gate and needs a CA approval before anything reaches the IRP.' };
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
    ...(status.sandboxEwbNo ? { sandboxEwbNo: status.sandboxEwbNo } : {}),
    next: {
      'not-needed': '',
      'transport-needed': 'Add the vehicle, distance and transporter, then the e-way bill can be generated.',
      ready: status.hasIrn
        ? 'Ready to generate from the IRN through Sandbox by Quicko (live switch and approval).'
        : 'Ready to generate from the invoice through Sandbox by Quicko (live switch and approval); no e-invoice is needed.',
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
      documentKind: kindOf(quote),
      documentTitle: kindTitle(quote),
      reason: quote.reason || '',
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
