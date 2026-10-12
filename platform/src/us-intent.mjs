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

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const STATE_SAID = /\b(?:in|for|to)\s+([A-Z]{2})\b/;
const FREQUENCY = /\b(monthly|quarterly|annual(?:ly)?|every\s+month|every\s+quarter|every\s+year)\b/i;

function frequencyOf(raw) {
  const found = raw.match(FREQUENCY);
  if (!found) return '';
  const word = found[1].toLowerCase();
  if (word.startsWith('month') || word.endsWith('month')) return 'monthly';
  if (word.startsWith('quarter') || word.endsWith('quarter')) return 'quarterly';
  return 'annual';
}

function salesTaxPeriodOf(raw, today) {
  const iso = raw.match(/\b(20\d{2})-(0[1-9]|1[0-2]|Q[1-4])\b(?!-\d)/i);
  if (iso) return `${iso[1]}-${iso[2].toUpperCase()}`;
  const quarter = raw.match(/\bQ([1-4])(?:\s+(20\d{2}))?\b/i);
  if (quarter) return `${quarter[2] || today.slice(0, 4)}-Q${quarter[1]}`;
  const named = raw.match(new RegExp(`\\b(${MONTHS.map((m) => `${m}|${m.slice(0, 3)}`).join('|')})\\b(?:\\s+(20\\d{2}))?`, 'i'));
  if (named) {
    const month = MONTHS.findIndex((m) => m.startsWith(named[1].toLowerCase().slice(0, 3))) + 1;
    const [y, m] = today.split('-').map(Number);
    const year = named[2] ? Number(named[2]) : (month < m ? y : y - 1);
    return `${year}-${String(month).padStart(2, '0')}`;
  }
  const year = raw.match(/\b(?:for|of)\s+(20\d{2})\b/);
  return year ? year[1] : '';
}

function planSalesTaxFromChat(raw, today) {
  if (!/\bsales\s+tax\b/i.test(raw)) return null;
  const stateSaid = (raw.match(STATE_SAID) || raw.match(/\bsales\s+tax\s+(?:return|review)\s+([A-Z]{2})\b/) || [])[1] || '';
  const period = salesTaxPeriodOf(raw, today);
  if (/\b(?:collect|registered|register|nexus|file)\b/i.test(raw) && FREQUENCY.test(raw) && !isQuestion(raw)) {
    if (!stateSaid) return reply('Say which state, for example "I collect sales tax in TX, quarterly". I have recorded nothing.');
    const from = raw.match(/\b(?:from|since)\s+(\d{4}-\d{2}-\d{2})\b/);
    return { kind: 'tool', name: 'set_sales_tax_nexus', args: { state: stateSaid, frequency: frequencyOf(raw), ...(from ? { from: from[1] } : {}) } };
  }
  if (/\b(?:collect|registered|register)\b/i.test(raw) && stateSaid && !isQuestion(raw)) {
    return reply(`Say how often you file in ${stateSaid}: "I collect sales tax in ${stateSaid}, monthly" (or quarterly, or annual). I have recorded nothing.`);
  }
  if (/\bfiled\b/i.test(raw) && stateSaid && !isQuestion(raw)) {
    const confirmation = (raw.match(/\b(?:confirmation|conf(?:\.|irmation)?\s*(?:no\.?|number|#)?|reference|ref)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,39})\b/i) || [])[1];
    if (!confirmation) return reply(`To record it, say the period and the confirmation number, for example "filed sales tax ${stateSaid} for Q3, confirmation 12345678". I have recorded nothing.`);
    return { kind: 'tool', name: 'record_sales_tax_filing', args: { state: stateSaid, ...(period ? { period } : {}), confirmation: confirmation.toUpperCase(), filedOn: receiptDate(raw, today) } };
  }
  if (/\bpaid\b/i.test(raw) && stateSaid && !isQuestion(raw)) {
    const amount = raw.replace(/\b20\d{2}-\d{2}(?:-\d{2})?\b/g, ' ').match(/\b(\d[\d,]*(?:\.\d{1,2})?)\b/);
    const reference = (raw.match(/\b(?:reference|ref|confirmation)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,39})\b/i) || [])[1];
    return { kind: 'tool', name: 'record_sales_tax_payment', args: { state: stateSaid, ...(period ? { period } : {}), ...(amount ? { amount: Number(amount[1].replace(/,/g, '')) } : {}), date: receiptDate(raw, today), mode: /\bcash\b/i.test(raw) ? 'cash' : 'bank', ...(reference ? { reference: reference.toUpperCase() } : {}) } };
  }
  if (/\breview\b/i.test(raw) && stateSaid) return { kind: 'tool', name: 'sales_tax_review', args: { state: stateSaid, ...(period ? { period } : {}) } };
  if (/\breturn\b|\bowe\b|\bcollected\b/i.test(raw)) {
    if (stateSaid) return { kind: 'tool', name: 'sales_tax_return', args: { state: stateSaid, ...(period ? { period } : {}) } };
    return { kind: 'tool', name: 'sales_tax_overview', args: {} };
  }
  return null;
}

export function planUsFromChat(state, text) {
  const raw = normalizeChat(text);
  if (isNegated(raw)) return null;
  const salesTax = planSalesTaxFromChat(raw, localToday());
  if (salesTax) return salesTax;
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
