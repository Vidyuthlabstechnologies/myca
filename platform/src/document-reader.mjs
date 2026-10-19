import { documentsOf, isSha256 } from './document-store.mjs';
import { matchDocument, matchWords } from './receipt-match.mjs';
import { countryOf } from './country.mjs';
import { extractWithModel, modelConfigured } from './model-adapter.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

const INDIAN_BILL = {
  type: 'object',
  additionalProperties: false,
  properties: {
    supplierName: { type: 'string' },
    supplierGstin: { type: 'string' },
    invoiceNo: { type: 'string' },
    date: { type: 'string' },
    lines: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { description: { type: 'string' }, hsn: { type: 'string' }, qty: { type: 'number' }, rate: { type: 'number' }, gstRate: { type: 'number' } }, required: ['description', 'rate'] } },
    total: { type: 'number' },
    confidence: { type: 'number' },
    notes: { type: 'string' },
  },
  required: ['supplierName', 'lines'],
};

const US_BILL = {
  type: 'object',
  additionalProperties: false,
  properties: {
    vendorName: { type: 'string' },
    invoiceNo: { type: 'string' },
    date: { type: 'string' },
    lines: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { description: { type: 'string' }, qty: { type: 'number' }, rate: { type: 'number' } }, required: ['description', 'rate'] } },
    salesTax: { type: 'number' },
    total: { type: 'number' },
    confidence: { type: 'number' },
    notes: { type: 'string' },
  },
  required: ['vendorName', 'lines'],
};

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanLines(lines, country) {
  return (Array.isArray(lines) ? lines : [])
    .filter((line) => line && typeof line === 'object' && Number.isFinite(Number(line.rate)))
    .map((line) => ({
      description: String(line.description || 'Item').slice(0, 120),
      ...(country === 'IN' ? { hsn: String(line.hsn || '').replace(/\D/g, '').slice(0, 8) } : {}),
      qty: Number.isFinite(Number(line.qty)) && Number(line.qty) > 0 ? Number(line.qty) : 1,
      rate: round2(line.rate),
      ...(country === 'IN' && Number.isFinite(Number(line.gstRate)) ? { gstRate: Number(line.gstRate) } : {}),
    }));
}

export function proposalFromExtraction(extracted, country) {
  const warnings = [];
  const lines = cleanLines(extracted.lines, country);
  if (!lines.length) warnings.push('No line with an amount was read; add the lines by hand.');
  const date = DATE.test(String(extracted.date || '')) ? extracted.date : '';
  if (!date) warnings.push('The date was not read; today will be used unless you set it.');
  const args = {
    partyName: String(country === 'IN' ? extracted.supplierName : extracted.vendorName || '').trim().slice(0, 80) || 'Supplier',
    lines,
    ...(date ? { date } : {}),
    ...(String(extracted.invoiceNo || '').trim() ? { supplierInvoiceNo: String(extracted.invoiceNo).trim().slice(0, 16) } : {}),
  };
  if (country === 'IN') {
    const gstin = String(extracted.supplierGstin || '').replace(/\s+/g, '').toUpperCase();
    if (gstin && GSTIN.test(gstin)) args.partyGstin = gstin;
    else if (gstin) warnings.push(`The GSTIN read (${gstin}) is not valid; it was left out.`);
    const unrated = lines.filter((line) => line.gstRate == null).length;
    if (unrated) warnings.push(`${unrated} line${unrated === 1 ? ' has' : 's have'} no GST rate on the page; set the rate before posting.`);
  } else if (Number.isFinite(Number(extracted.salesTax)) && Number(extracted.salesTax) > 0) {
    args.salesTaxPaid = round2(extracted.salesTax);
  }
  const readTotal = Number.isFinite(Number(extracted.total)) ? round2(extracted.total) : null;
  const lineTotal = round2(lines.reduce((sum, line) => sum + line.qty * line.rate, 0));
  if (readTotal != null && lines.length && Math.abs(readTotal - lineTotal) > Math.max(1, lineTotal * 0.2) + (country === 'IN' ? lineTotal * 0.28 : round2(extracted.salesTax || 0))) {
    warnings.push(`The printed total (${readTotal}) is far from the lines read (${lineTotal} before tax); check the lines.`);
  }
  const confidence = Number.isFinite(Number(extracted.confidence)) ? Math.max(0, Math.min(1, Number(extracted.confidence))) : 0;
  if (confidence < 0.6) warnings.push('The document was hard to read; check every figure against the page.');
  return { tool: 'create_purchase', args, warnings, confidence, readTotal, lineTotal };
}

export async function readDocument(state, args = {}) {
  const sha = String(args.documentSha256 || '').trim().toLowerCase();
  if (!isSha256(sha)) return { ok: false, error: 'INVALID_SHA256' };
  if (!modelConfigured()) return { ok: false, error: 'MODEL_NOT_CONFIGURED', hint: 'Set MYCA_MODEL_API_KEY to let MyCA read bills; until then enter the bill by hand.' };
  const stored = documentsOf(state).readVerified(sha);
  if (!stored.ok) return stored;
  const country = countryOf(state);
  const read = await extractWithModel({
    content: stored.content,
    schema: country === 'IN' ? INDIAN_BILL : US_BILL,
    name: 'supplier_bill',
    instructions: country === 'IN' ? 'The document is a supplier tax invoice from India: GSTIN, HSN and GST rate per line when printed.' : 'The document is a vendor invoice from the United States: sales tax as a separate figure when printed.',
  });
  if (!read.ok) return read;
  const proposal = proposalFromExtraction(read.extracted, country);
  return {
    ok: true,
    data: {
      documentSha256: sha,
      kind: 'supplier_bill',
      extracted: read.extracted,
      proposal: { tool: proposal.tool, args: { ...proposal.args, documentSha256: sha } },
      matches: matchDocument(state, { total: proposal.readTotal, date: proposal.args.date, partyName: proposal.args.partyName }),
      confidence: proposal.confidence,
      warnings: proposal.warnings,
      note: 'A model read the page; MyCA computed nothing from it. The purchase is previewed from these figures and posts only when you confirm.',
    },
  };
}

export function readDocumentWords(data) {
  const args = data.proposal.args;
  const lines = args.lines.map((line) => `· ${line.description}: ${line.qty} × ${line.rate}${line.gstRate != null ? ` at ${line.gstRate}% GST` : ''}`);
  return [
    `Read a bill from ${args.partyName}${args.supplierInvoiceNo ? ` (${args.supplierInvoiceNo})` : ''}${args.date ? ` dated ${args.date}` : ''}:`,
    ...lines,
    ...data.warnings.map((warning) => `! ${warning}`),
    ...(data.matches && data.matches.length ? [matchWords(data.matches, (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)] : []),
    'Say "record it" to preview the purchase, or correct anything first.',
  ].join('\n');
}
