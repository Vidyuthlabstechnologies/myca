import { gst } from './sprint-load.mjs';
import { isReturnPeriod } from './return-period.mjs';
import { localToday } from './dates.mjs';
import { allRows, documentKey, documentsOf, normGstin, normNumber, supplierNumberOf } from './gstr2b-check.mjs';

const { itcOf } = gst;

export const IMS_DECISIONS = ['accept', 'reject', 'pending'];
export const IMS_SELECTS = ['matched', 'suggested', 'undecided', 'all'];
export const IMS_MAX_ROWS = 500;
export const IMS_MAX_KEY = 120;
export const IMS_MAX_NOTE = 200;
export const IMS_DECISION_WORDS = { accept: 'accepted', reject: 'rejected', pending: 'pending', clear: 'not decided' };
export const IMS_NOTE = 'MyCA keeps these decisions for you but does not send them to the GST portal. Take the same decisions on the portal\'s IMS; the Excel sheet lists every row with its suggestion.';

const HEADS = ['taxableValue', 'cgst', 'sgst', 'igst', 'cess'];
const HEAD_WORDS = { taxableValue: 'taxable value', cgst: 'CGST', sgst: 'SGST', igst: 'IGST', cess: 'CESS' };
const TOLERANCE = 1;
const NOTE_SECTIONS = new Set(['CDNR', 'CDNRA']);
const CREDIT_BUCKET = { accept: 'accepted', reject: 'rejected', pending: 'pending', '': 'undecided' };
const NO_BILL = 'No purchase bill with this number from this supplier.';
const NO_NOTE = 'No debit note to this supplier with this bill number.';
const NO_MATCH_WORDS = {
  matched: 'No invoice in that month is matched to a bill in your books, so nothing was marked.',
  undecided: 'No invoice in that month is undecided, so nothing was marked.',
  all: 'There is no invoice in that month, so nothing was marked.',
};
const WORDS_LISTED = 8;

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const failure = (error, extra = {}) => ({ ok: false, error, ...extra });
const text = (value) => String(value ?? '');

export function imsKey(period, row) {
  return documentKey(period, row);
}

function statementDocuments(state, period) {
  return documentsOf(allRows(state).filter((row) => row.statementPeriod === period));
}

function creditOf(row) {
  const credit = itcOf(row);
  return NOTE_SECTIONS.has(String(row.section || '').toUpperCase()) ? -Math.abs(credit) : credit;
}

function indexBooks(state) {
  const bills = new Map();
  for (const bill of state.purchases || []) {
    const gstin = normGstin(bill.partyGstin);
    const number = normNumber(supplierNumberOf(bill));
    if (!gstin || !number) continue;
    const key = `${gstin}|${number}`;
    if (bills.has(key)) bills.get(key).push(bill);
    else bills.set(key, [bill]);
  }
  const notes = new Map();
  for (const note of state.purchaseNotes || []) {
    const number = normNumber(note.supplierInvoiceNo);
    if (!number) continue;
    if (notes.has(number)) notes.get(number).push(note);
    else notes.set(number, [note]);
  }
  return { bills, notes };
}

function headsOf(doc) {
  return { taxableValue: doc.taxable, cgst: doc.cgst, sgst: doc.sgst, igst: doc.igst, cess: 0 };
}

function differences(books, row) {
  const out = [];
  for (const head of HEADS) {
    const mine = Math.abs(Number(books[head]) || 0);
    const theirs = Math.abs(Number(row[head]) || 0);
    const diff = round2(Math.abs(mine - theirs));
    if (diff > TOLERANCE) out.push({ head, books: round2(mine), twob: round2(theirs), diff });
  }
  return out;
}

function closest(candidates, row) {
  let best = null;
  for (const doc of candidates) {
    const mismatches = differences(headsOf(doc), row);
    const total = round2(mismatches.reduce((sum, item) => sum + item.diff, 0));
    if (!best || total < best.total) best = { doc, mismatches, total };
  }
  return best;
}

function matchOf(row, books) {
  const isNote = NOTE_SECTIONS.has(String(row.section || '').toUpperCase());
  const gstin = normGstin(row.supplierGstin);
  const number = normNumber(row.invoiceNo);
  let candidates = [];
  if (gstin && number) {
    candidates = isNote
      ? (books.notes.get(number) || []).filter((note) => !normGstin(note.partyGstin) || normGstin(note.partyGstin) === gstin)
      : books.bills.get(`${gstin}|${number}`) || [];
  }
  const best = closest(candidates, row);
  if (!best) return { match: 'not in books', billId: '', why: isNote ? NO_NOTE : NO_BILL };
  if (best.mismatches.length) {
    const heads = best.mismatches.map((item) => `${HEAD_WORDS[item.head]} ${item.books} in your books, ${item.twob} in 2B`).join('; ');
    return { match: 'amount differs', billId: best.doc.id, why: `The amounts differ: ${heads}.` };
  }
  if (!isNote && best.doc.date && row.invoiceDate && best.doc.date !== row.invoiceDate) {
    return { match: 'date differs', billId: best.doc.id, why: `Your books have this bill dated ${best.doc.date}; 2B has it dated ${row.invoiceDate}.` };
  }
  return { match: 'matched', billId: best.doc.id, why: isNote ? `Matches debit note ${best.doc.id} in your books.` : `Matches ${best.doc.id} in your books.` };
}

function byRow(a, b) {
  return compare(a.supplierName.toUpperCase(), b.supplierName.toUpperCase()) || compare(a.invoiceDate, b.invoiceDate) || compare(a.invoiceNo, b.invoiceNo) || compare(a.key, b.key);
}

export function imsReview(state, args = {}) {
  const period = text(args.period).trim() || localToday().slice(0, 7);
  if (!isReturnPeriod(period)) return failure('INVALID_PERIOD', { hint: 'Use YYYY-MM, for example 2026-09.' });
  const stored = state.gstr2b && typeof state.gstr2b === 'object' && Object.hasOwn(state.gstr2b, period) ? state.gstr2b[period] : null;
  const decisions = state.imsDecisions && typeof state.imsDecisions === 'object' ? state.imsDecisions : {};
  const books = indexBooks(state);
  const rows = stored
    ? statementDocuments(state, period)
      .map(({ key, raw, lines }) => {
        const found = matchOf(raw, books);
        const record = decisions[key] && typeof decisions[key] === 'object' ? decisions[key] : null;
        const decision = record && IMS_DECISIONS.includes(record.decision) ? record.decision : '';
        return {
          key,
          section: String(raw.section || '').toUpperCase(),
          supplierGstin: text(raw.supplierGstin),
          supplierName: text(raw.supplierName),
          invoiceNo: text(raw.invoiceNo),
          invoiceDate: text(raw.invoiceDate),
          taxableValue: Number(raw.taxableValue) || 0,
          cgst: Number(raw.cgst) || 0,
          sgst: Number(raw.sgst) || 0,
          igst: Number(raw.igst) || 0,
          cess: Number(raw.cess) || 0,
          totalValue: Number(raw.totalValue) || 0,
          credit: creditOf(raw),
          itcAvailability: text(raw.itcAvailability),
          billId: found.billId,
          match: found.match,
          why: found.why,
          suggested: found.match === 'matched' || found.match === 'date differs' ? 'accept' : 'pending',
          decision,
          note: decision ? text(record.note) : '',
          decidedBy: decision ? text(record.by) : '',
          decidedOn: decision ? text(record.on) : '',
          lines,
        };
      })
      .sort(byRow)
    : [];
  const counts = { total: rows.length, accept: 0, reject: 0, pending: 0, undecided: 0 };
  const credit = { accepted: 0, rejected: 0, pending: 0, undecided: 0 };
  for (const row of rows) {
    counts[row.decision || 'undecided'] += 1;
    const bucket = CREDIT_BUCKET[row.decision];
    credit[bucket] = round2(credit[bucket] + row.credit);
  }
  const present = new Set(rows.map((row) => row.key));
  const prefix = `${period}|`;
  const orphaned = Object.keys(decisions).filter((key) => key.startsWith(prefix) && !present.has(key)).length;
  return {
    ok: true,
    data: {
      period,
      statement: stored ? { fileName: stored.fileName, importedOn: stored.importedOn, rows: (stored.rows || []).length } : null,
      rows,
      counts,
      credit,
      orphaned,
      note: IMS_NOTE,
    },
  };
}

function pickRows(rows, select, decision) {
  if (select === 'matched') return rows.filter((row) => row.match === 'matched' || row.match === 'date differs');
  if (select === 'suggested') return rows.filter((row) => row.suggested === decision);
  if (select === 'undecided') return rows.filter((row) => !row.decision);
  if (select === 'all') return rows;
  return [];
}

function noMatchWords(select, decision) {
  if (select === 'suggested') return `No invoice in that month has "${decision}" as its suggestion, so nothing was marked.`;
  return NO_MATCH_WORDS[select] || 'No invoice matches what you asked for, so nothing was marked.';
}

function alreadyDecidedWords(decision) {
  return `Every invoice you asked for is already ${IMS_DECISION_WORDS[decision]}, so nothing was marked.`;
}

function nextRound(picked, decision) {
  if (picked.length <= IMS_MAX_ROWS) return { rows: picked, left: 0 };
  const open = picked.filter((row) => (decision === 'clear' ? row.decision : row.decision !== decision));
  return { rows: open.slice(0, IMS_MAX_ROWS), left: Math.max(0, open.length - IMS_MAX_ROWS) };
}

export function pinImsRows(args, plan) {
  const keys = plan.rows.map((row) => row.key);
  if (keys.some((key) => key.length > IMS_MAX_KEY)) return args;
  const pinned = { ...args, keys };
  delete pinned.select;
  return pinned;
}

export function planImsDecision(state, args = {}) {
  const period = text(args.period).trim();
  if (!isReturnPeriod(period)) return failure('INVALID_PERIOD', { hint: 'Use YYYY-MM, for example 2026-09.' });
  const review = imsReview(state, { period }).data;
  if (!review.statement) return failure('NO_STATEMENT', { period });
  const decision = text(args.decision).trim().toLowerCase();
  if (!IMS_DECISIONS.includes(decision) && decision !== 'clear') return failure('BAD_DECISION');
  const note = text(args.note).trim();
  if (note.length > IMS_MAX_NOTE) return failure('NOTE_TOO_LONG', { limit: IMS_MAX_NOTE });
  const keys = [...new Set((Array.isArray(args.keys) ? args.keys : []).map((key) => text(key).trim()).filter(Boolean))];
  let picked = [];
  let left = 0;
  if (keys.length) {
    if (keys.length > IMS_MAX_ROWS) return failure('TOO_MANY_ROWS', { limit: IMS_MAX_ROWS });
    const byKey = new Map();
    for (const row of review.rows) if (!byKey.has(row.key)) byKey.set(row.key, row);
    for (const key of keys) {
      const row = byKey.get(key);
      if (!row) return failure('ROW_NOT_FOUND', { key });
      picked.push(row);
    }
  } else {
    const seen = new Set();
    const select = text(args.select).trim();
    picked = pickRows(review.rows, select, decision).filter((row) => !seen.has(row.key) && seen.add(row.key));
    if (!picked.length) return IMS_SELECTS.includes(select) ? failure('NO_MATCH', { hint: noMatchWords(select, decision) }) : failure('NO_ROWS', { period });
    const round = nextRound(picked, decision);
    if (!round.rows.length) return failure('NO_MATCH', { hint: alreadyDecidedWords(decision) });
    picked = round.rows;
    left = round.left;
  }
  return {
    ok: true,
    period,
    decision,
    rows: picked.map((row) => ({ key: row.key, supplierName: row.supplierName, invoiceNo: row.invoiceNo, credit: row.credit })),
    credit: round2(picked.reduce((sum, row) => sum + row.credit, 0)),
    note,
    ...(left ? { left } : {}),
  };
}

export function decideIms(state, args = {}) {
  const plan = planImsDecision(state, args);
  if (!plan.ok) return plan;
  if (!state.imsDecisions || typeof state.imsDecisions !== 'object') state.imsDecisions = {};
  const by = text(state.__actor?.userId || 'renderer').slice(0, 80);
  const on = localToday();
  for (const row of plan.rows) {
    if (plan.decision === 'clear') delete state.imsDecisions[row.key];
    else state.imsDecisions[row.key] = { decision: plan.decision, note: plan.note, by, on };
  }
  return { ok: true, period: plan.period, decision: plan.decision, count: plan.rows.length, credit: plan.credit, keys: plan.rows.map((row) => row.key) };
}

export function imsWords(data, money = String) {
  if (!data.statement) return `Add the GSTR-2B for ${data.period} first. IMS decisions are made on its rows.`;
  const { counts, credit } = data;
  const head = `IMS for ${data.period}: ${counts.total} ${counts.total === 1 ? 'row' : 'rows'}, ${counts.accept} accepted, ${counts.reject} rejected, ${counts.pending} pending, ${counts.undecided} not decided; credit accepted ${money(credit.accepted)}, undecided ${money(credit.undecided)}.`;
  const open = data.rows.filter((row) => !row.decision);
  const lines = open.slice(0, WORDS_LISTED).map((row) => `· ${[row.supplierName, row.invoiceNo].filter(Boolean).join(' ')} ${money(row.credit)}: ${row.match}, suggest ${row.suggested}`);
  if (open.length > WORDS_LISTED) lines.push(`… and ${open.length - WORDS_LISTED} more.`);
  return [head, ...lines].join('\n');
}

export function imsDecidedWords(result) {
  const rows = result.count === 1 ? '1 row' : `${result.count} rows`;
  if (result.decision === 'clear') return `Cleared the decision on ${rows} in IMS for ${result.period}; ${result.count === 1 ? 'it is' : 'they are'} not decided again.`;
  return `Marked ${rows} ${IMS_DECISION_WORDS[result.decision]} in IMS for ${result.period}.`;
}
