import { documentsOf, isSha256 } from './document-store.mjs';
import { matchDocument, matchWords } from './receipt-match.mjs';
import { countryOf } from './country.mjs';
import { extractWithModel, modelConfigured } from './model-adapter.mjs';
import { FORM_SPECS, coerceFields, US_RETURN_YEARS } from './us-return.mjs';
import { FORM_KINDS } from './us-1040.mjs';

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

function extractionSchema() {
  const properties = {};
  for (const kind of FORM_KINDS) for (const item of FORM_SPECS[kind].fields) {
    if (properties[item.key] || item.key === 'box12') continue;
    properties[item.key] = item.type === 'money' ? { type: 'number' } : item.type === 'yesno' ? { type: 'boolean' } : { type: 'string' };
  }
  return { type: 'object', additionalProperties: false, properties: { kind: { type: 'string', enum: [...FORM_KINDS] }, taxYear: { type: 'string' }, fields: { type: 'object', additionalProperties: false, properties }, confidence: { type: 'number' }, notes: { type: 'string' } }, required: ['kind', 'fields'] };
}

export async function readUsTaxDocument(state, args = {}) {
  const sha = String(args.documentId || args.documentSha256 || '').trim().toLowerCase();
  if (!isSha256(sha)) return { ok: false, error: 'INVALID_SHA256' };
  if (!modelConfigured()) return { ok: false, error: 'MODEL_NOT_CONFIGURED', hint: 'Set MYCA_MODEL_API_KEY to let MyCA read tax forms; until then enter the boxes by hand.' };
  const stored = documentsOf(state).readVerified(sha);
  if (!stored.ok) return stored;
  const read = await extractWithModel({
    content: stored.content,
    schema: extractionSchema(),
    name: 'us_tax_form',
    instructions: `The document is a US tax information return: one of ${FORM_KINDS.join(', ')}. Give its kind, the tax year printed on it and each box amount under these keys. Never copy a Social Security number or other taxpayer identification number of the person the form is about.`,
  });
  if (!read.ok) return read;
  const extracted = read.extracted || {};
  const kind = FORM_KINDS.includes(extracted.kind) ? extracted.kind : null;
  if (!kind) return { ok: false, error: 'FORM_KIND_UNREADABLE', hint: 'Choose the form kind and enter the boxes by hand.' };
  const problems = [];
  const raw = { ...(extracted.fields || {}) };
  const payer = String(raw.payer || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80);
  const payerTin = /^\d{2}-?\d{7}$/.test(String(raw.payerTin || '')) ? String(raw.payerTin).replace(/^(\d{2})-?(\d{7})$/, '$1-$2') : '';
  const fields = coerceFields(kind, raw, problems);
  const confidence = Math.max(0, Math.min(1, Number(extracted.confidence ?? 0.5)));
  const taxYear = US_RETURN_YEARS.includes(String(extracted.taxYear || '')) ? String(extracted.taxYear) : (US_RETURN_YEARS.includes(String(args.taxYear || '')) ? String(args.taxYear) : US_RETURN_YEARS[0]);
  return { ok: true, data: { documentId: sha, kind, taxYear, payer, payerTin, fields, confidence, warnings: problems, proposal: { tool: 'add_us_tax_form', args: { taxYear, kind, payer, payerTin, fields, source: 'upload', documentId: sha } }, note: 'A model read the form; nothing is saved until you confirm the boxes.' } };
}

const LETTER_AMOUNT_FIELD = Object.freeze({ 'W-2': 'wages', '1099-INT': 'interest', '1099-DIV': 'ordinaryDividends', '1099-B': 'proceeds', '1099-NEC': 'nonemployeeCompensation', '1099-MISC': 'otherIncome', '1099-G': 'unemployment', '1099-R': 'taxableAmount', 'SSA-1099': 'netBenefits', '1098': 'mortgageInterest', '1098-E': 'studentLoanInterest', '1098-T': 'tuitionPaid' });
const TIN_LIKE = /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g;
const cleanText = (value, limit) => String(value || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').replace(TIN_LIKE, '***-**-****').trim().slice(0, limit);
const isoDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '');
const roundCents = (value) => (Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : null);

function letterSchema() {
  const item = { type: 'object', additionalProperties: false, properties: { kind: { type: 'string' }, payer: { type: 'string' }, amountIrsHas: { type: 'number' }, amountOnReturn: { type: 'number' }, description: { type: 'string' } }, required: ['description'] };
  return { type: 'object', additionalProperties: false, properties: { notice: { type: 'string' }, noticeDate: { type: 'string' }, taxYear: { type: 'string' }, responseDeadline: { type: 'string' }, amountIrsSays: { type: 'number' }, plainEnglish: { type: 'string' }, items: { type: 'array', items: item }, confidence: { type: 'number' } }, required: ['notice', 'plainEnglish'] };
}

function compareWithReturn(ret, items) {
  if (!ret) return [{ code: 'RETURN_NOT_IN_MYCA', message: 'This tax year\'s return is not in MyCA, so the letter cannot be checked against it.' }];
  const differences = [];
  for (const item of items) {
    const field = LETTER_AMOUNT_FIELD[item.kind];
    if (!field || item.amountIrsHas === null) continue;
    const payer = item.payer.toLowerCase();
    const matches = ret.forms.filter((form) => form.kind === item.kind && (!payer || String(form.payer || '').toLowerCase().includes(payer) || payer.includes(String(form.payer || '').toLowerCase())));
    const onReturn = matches.reduce((total, form) => total + Number(form.fields?.[field] || 0), 0);
    if (!matches.length) differences.push({ code: 'FORM_MISSING_FROM_RETURN', kind: item.kind, payer: item.payer, amountIrsHas: item.amountIrsHas, amountInMyca: 0, message: `The IRS has a ${item.kind}${item.payer ? ` from ${item.payer}` : ''} that is not on the return in MyCA.` });
    else if (Math.abs(onReturn - item.amountIrsHas) >= 1) differences.push({ code: 'AMOUNT_DIFFERS', kind: item.kind, payer: item.payer, amountIrsHas: item.amountIrsHas, amountInMyca: Math.round(onReturn * 100) / 100, message: `The IRS has ${item.amountIrsHas} on the ${item.kind}${item.payer ? ` from ${item.payer}` : ''}; the return in MyCA has ${Math.round(onReturn * 100) / 100}.` });
  }
  return differences;
}

function draftLetterReply(letter, differences) {
  const head = `Re: Notice ${letter.notice || ''}${letter.noticeDate ? ` dated ${letter.noticeDate}` : ''}${letter.taxYear ? `, tax year ${letter.taxYear}` : ''}`;
  const real = differences.filter((item) => item.code !== 'RETURN_NOT_IN_MYCA');
  const body = real.length
    ? ['I have reviewed the notice and do not agree with all of the proposed changes. My records show:', ...real.map((item) => `- ${item.kind}${item.payer ? ` from ${item.payer}` : ''}: ${item.amountInMyca} per my records, ${item.amountIrsHas} per the notice.`), 'Copies of the supporting documents are enclosed. Please correct the proposed amount.']
    : ['I have reviewed the notice and agree with it. I have signed the response form and enclosed it.'];
  return [head, '', ...body, '', 'Sincerely,', '[Your name]', '[Last 4 of SSN only]'].join('\n');
}

export async function readIrsLetter(state, args = {}) {
  const sha = String(args.documentId || '').trim().toLowerCase();
  if (!isSha256(sha)) return { ok: false, error: 'INVALID_SHA256' };
  if (!modelConfigured()) return { ok: false, error: 'MODEL_NOT_CONFIGURED', hint: 'Set MYCA_MODEL_API_KEY to let MyCA read IRS letters.' };
  const stored = documentsOf(state).readVerified(sha);
  if (!stored.ok) return stored;
  const read = await extractWithModel({
    content: stored.content,
    schema: letterSchema(),
    name: 'irs_letter',
    instructions: 'The document is a letter or notice from the IRS. Give the notice number printed on it (such as CP2000, CP14, CP501, LTR 4883C), its date and the response deadline as YYYY-MM-DD, the tax year, the amount the IRS says is due or proposed (negative for a refund), a short plain-English explanation of what it means and what to do, and for each income or payment item it lists, the form kind (W-2, 1099-INT and so on), payer, the amount the IRS has and the amount shown on the return. Never copy a Social Security number or any taxpayer identification number.',
  });
  if (!read.ok) return read;
  const x = read.extracted || {};
  const taxYear = /^20\d{2}$/.test(String(x.taxYear || '')) ? String(x.taxYear) : (/^20\d{2}$/.test(String(args.taxYear || '')) ? String(args.taxYear) : '');
  const items = (Array.isArray(x.items) ? x.items : []).slice(0, 40).map((item) => ({ kind: FORM_KINDS.includes(item.kind) ? item.kind : cleanText(item.kind, 20), payer: cleanText(item.payer, 80), amountIrsHas: roundCents(item.amountIrsHas), amountOnReturn: roundCents(item.amountOnReturn), description: cleanText(item.description, 200) }));
  const letter = { notice: cleanText(x.notice, 20).toUpperCase(), noticeDate: isoDate(x.noticeDate), taxYear };
  const differences = compareWithReturn(taxYear ? state.usReturns?.[taxYear] : null, items);
  return {
    ok: true,
    data: {
      documentId: sha,
      ...letter,
      plainEnglish: cleanText(x.plainEnglish, 1500),
      deadline: isoDate(x.responseDeadline),
      amountIrsSays: roundCents(x.amountIrsSays),
      items,
      matchesReturn: differences.length === 0,
      differences,
      draftReply: draftLetterReply(letter, differences),
      confidence: Math.max(0, Math.min(1, Number(x.confidence ?? 0.5))),
      note: 'A model read the letter and MyCA compared its items with your return. The reply is a draft for you or your CPA; MyCA does not send it. Respond by the deadline.',
    },
  };
}
