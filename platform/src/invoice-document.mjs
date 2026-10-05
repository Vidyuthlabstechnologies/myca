import { gstin } from './sprint-load.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const text = (value) => String(value ?? '').trim();

function place(code) {
  const stateCode = text(code);
  return { code: stateCode, name: gstin.STATE_CODES[stateCode] || '' };
}

export function invoiceDocument(state, id) {
  const invoice = (state.invoices || []).find((item) => item.id === text(id).toUpperCase());
  if (!invoice) return { ok: false, error: 'INVOICE_NOT_FOUND' };
  const company = state.company || {};
  const receipts = (invoice.receipts || []).map((receipt) => ({
    date: text(receipt.date),
    mode: text(receipt.mode),
    amount: round2(receipt.amount),
  }));
  const received = round2(receipts.reduce((sum, receipt) => sum + receipt.amount, 0));
  const missing = [];
  if (!text(company.gstin)) missing.push('SELLER_GSTIN');
  if (!text(company.address)) missing.push('SELLER_ADDRESS');
  if (invoice.lines.some((line) => !text(line.hsn))) missing.push('HSN');
  return {
    ok: true,
    data: {
      id: invoice.id,
      date: invoice.date,
      seller: {
        name: text(company.name),
        gstin: text(company.gstin),
        address: text(company.address),
        city: text(company.city),
        pin: text(company.pin),
        state: place(company.state),
      },
      buyer: { name: text(invoice.partyName), gstin: text(invoice.partyGstin) },
      placeOfSupply: place(invoice.placeOfSupply || invoice.partyState),
      lines: invoice.lines.map((line) => ({
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
      taxable: round2(invoice.taxable),
      cgst: round2(invoice.cgst),
      sgst: round2(invoice.sgst),
      igst: round2(invoice.igst),
      total: round2(invoice.total),
      receipts,
      received,
      balance: round2(invoice.total - received),
      missing,
    },
  };
}
