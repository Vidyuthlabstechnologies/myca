import { isNegated, isQuestion, normalizeChat, receiptDate, parseDocument, isSaleIntent, isPurchaseIntent } from './intent.mjs';
import { localToday } from './dates.mjs';
import { normalizeJurisdiction } from './us-sales.mjs';

const RATE_SAID = /\b(?:sales\s+)?tax\s*(?:rate\s*)?(?:for\s+|in\s+)?([A-Z]{2}(?:-[A-Z0-9]{2,20})?)\s*(?:is|at|:|=)?\s*(\d{1,2}(?:\.\d{1,4})?)\s*%/i;
const TAX_ON_DOC = /\b(?:sales\s+)?tax\s+(?:in\s+|for\s+|at\s+)?([A-Z]{2}(?:-[A-Z0-9]{2,20})?)\b(?:\s*\d{1,2}(?:\.\d{1,4})?\s*%)?/;
const TAX_PAID = /\b(?:plus|with|incl(?:uding)?)\s+(?:sales\s+)?tax\s+(?:of\s+)?\$?\s*(\d[\d,]*(?:\.\d{1,2})?)\b/i;
const DESCRIBED = /\bfor\s+([a-z][a-z0-9 '-]{1,40}?)(?=\s*,|\s+(?:tax|plus|with|no|incl)\b|\s*$)/i;
const EXEMPT = /\b(?:tax[\s-]*exempt|no\s+(?:sales\s+)?tax|exempt)\b(?:\s*[-:(]\s*([^)]+?)\)?)?\s*$/i;

function reply(text) {
  return { kind: 'reply', reply: text, tools: [] };
}

function withoutTax(text) {
  return text.replace(TAX_PAID, ' ').replace(TAX_ON_DOC, ' ').replace(EXEMPT, ' ').replace(/\s{2,}/g, ' ').trim();
}

export function planUsFromChat(state, text) {
  const raw = normalizeChat(text);
  if (isNegated(raw)) return null;
  if (/\b(?:who|which)\b.*\b1099\b|\b1099s?\b.*\b(?:due|needed|list|report)\b|\bcontractor\s+payments?\b/i.test(raw)) {
    const year = (raw.match(/\b(20\d{2})\b/) || [])[1];
    return { kind: 'tool', name: 'contractor_payments', args: year ? { year } : {} };
  }
  if (isQuestion(raw)) return null;
  const today = localToday();
  const rate = raw.match(RATE_SAID);
  if (rate && /\brate\b|\bsales\s+tax\b/i.test(raw) && !isSaleIntent(raw.toLowerCase()) && !isPurchaseIntent(raw.toLowerCase())) {
    return { kind: 'tool', name: 'set_sales_tax_rate', args: { code: normalizeJurisdiction(rate[1]), ratePercent: Number(rate[2]), from: receiptDate(raw, today) } };
  }
  const contractor = raw.match(/^(.+?)\s+is\s+(?:a\s+|an\s+)?(?:1099\s+)?contractor\b(?:\s*,?\s*(?:w-?9\s+received|w-?9\s+on\s+file))?\s*[.!]?$/i);
  if (contractor) {
    return { kind: 'tool', name: 'set_contractor', args: { partyName: contractor[1].trim(), contractor: true, ...(/w-?9\s+(?:received|on\s+file)/i.test(raw) ? { w9Received: true } : {}) } };
  }
  const lower = raw.toLowerCase();
  const sale = isSaleIntent(lower);
  const purchase = isPurchaseIntent(lower);
  if (!sale && !purchase) return null;
  const taxSaid = raw.match(TAX_ON_DOC);
  const exempt = raw.match(EXEMPT);
  const doc = parseDocument(withoutTax(raw).replace(/\$/g, ' '));
  if (!doc) return null;
  const described = raw.match(DESCRIBED);
  const lines = doc.lines.map((line) => ({ description: described ? described[1].trim() : line.description, qty: line.qty, rate: line.rate }));
  const base = { partyName: doc.partyName, lines, date: receiptDate(raw, today) };
  if (purchase) {
    const paid = raw.match(TAX_PAID);
    return { kind: 'tool', name: 'create_purchase', args: { ...base, ...(paid ? { salesTaxPaid: Number(paid[1].replace(/,/g, '')) } : {}) } };
  }
  if (exempt) return { kind: 'tool', name: 'create_invoice', args: { ...base, taxExempt: true, exemptionReason: (exempt[1] || 'exempt as stated').trim() } };
  const jurisdiction = taxSaid ? normalizeJurisdiction(taxSaid[1]) : '';
  if (!jurisdiction) return reply(`Say which sales tax applies, for example "invoice ${doc.partyName} ${doc.lines[0].rate} for ${lines[0].description === 'Supply' ? 'services' : lines[0].description}, tax TX" or "... no tax (resale certificate)". I have recorded nothing.`);
  return { kind: 'tool', name: 'create_invoice', args: { ...base, taxJurisdiction: jurisdiction } };
}
