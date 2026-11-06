import { localToday, postingDate } from './dates.mjs';
import { createAccounts, createTransfers, paise } from './ledger.mjs';
import { isPeriodLocked } from './period-lock.mjs';
import { outstandingOf } from './credit-notes.mjs';
import { formatMoney } from './country.mjs';
import { marketplaceCredits, quarterOfDate, fyOfPeriod, channelOfDeductor, normalSection } from './marketplace-credits.mjs';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const TAN = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
const MATCH_TOLERANCE = 1;
const MAX_WORDED_ROWS = 8;
const NAME_MIN = 4;

export const TDS_RECEIVABLE_ACCOUNT = { id: 1160, code: '1160', name: 'TDS receivable (customers)', type: 'asset' };
export const CUSTOMER_TDS_SECTIONS = ['194A', '194C', '194H', '194I', '194J', '194Q', '194O', '192', '194D', '194G', '194LA', '206AB'];

export const TDS_CHECK_NOTE = 'Form 26AS lists the TDS deductors reported against your PAN. Rows not in your books usually mean a customer paid you short by TDS and the shortfall was never recorded: record it with "TDS withheld" on that invoice. AIS is not read yet.';

export function isTdsReceipt(receipt) {
  return Boolean(receipt) && receipt.mode === 'tds';
}

export function tdsWithheldOn(invoice) {
  return round2((invoice?.receipts || []).filter(isTdsReceipt).reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0));
}

export function tdsReceiptLabel(state, receipt) {
  return `TDS withheld ${formatMoney(state, receipt.amount)}${receipt.section ? ` (${receipt.section})` : ''}`;
}

export function tdsWithheldInFy(state, fy, today) {
  let total = 0;
  for (const invoice of state.invoices || []) {
    for (const receipt of invoice.receipts || []) {
      if (isTdsReceipt(receipt) && receipt.date >= fy.from && receipt.date <= fy.to && receipt.date <= today) total += Number(receipt.amount || 0);
    }
  }
  return round2(total);
}

function normGstin(gstin) {
  return String(gstin || '').trim().toUpperCase();
}

function partyOf(state, invoice) {
  return (state.parties || []).find((party) => (invoice.partyAccountId ? party.accountId === invoice.partyAccountId : party.name === invoice.partyName && normGstin(party.gstin) === normGstin(invoice.partyGstin)));
}

export function planTdsWithheld(state, args = {}) {
  const invoiceId = String(args.invoiceId || '').trim().toUpperCase();
  const invoice = (state.invoices || []).find((item) => item.id === invoiceId);
  if (!invoice) return { ok: false, error: 'INVOICE_NOT_FOUND', invoiceId };
  if (invoice.status === 'cancelled') return { ok: false, error: 'INVOICE_CANCELLED', invoiceId };
  const date = postingDate(args.date);
  if (!date) return { ok: false, error: 'INVALID_DATE', date: args.date };
  if (isPeriodLocked(state, date)) return { ok: false, error: 'PERIOD_LOCKED', date, lockThrough: state.lockThrough };
  const said = Number(args.amount);
  const amount = round2(said);
  if (!Number.isFinite(said) || !(amount >= 0.01)) return { ok: false, error: 'BAD_AMOUNT', amount: args.amount };
  const section = normalSection(args.section);
  if (!section) return { ok: false, error: 'BAD_SECTION', section: args.section };
  const tan = String(args.tan || '').replace(/\s+/g, '').toUpperCase();
  if (tan && !TAN.test(tan)) return { ok: false, error: 'BAD_TAN', tan };
  const due = outstandingOf(state, invoice);
  if (amount > due + 0.01) return { ok: false, error: 'OVERPAYMENT', invoiceId, due };
  const party = partyOf(state, invoice);
  if (!party) return { ok: false, error: 'PARTY_NOT_FOUND', partyName: invoice.partyName };
  return { ok: true, invoice, party, amount, date, section, tan, remaining: round2(Math.max(0, due - amount)) };
}

function nextTransferId(state) {
  return BigInt(state.transferSeq = (state.transferSeq || 100000) + 1);
}

export function recordTdsWithheld(state, args = {}) {
  const plan = planTdsWithheld(state, args);
  if (!plan.ok) return plan;
  const { invoice, party, amount, date, section, tan } = plan;
  createAccounts(state.ledger, [TDS_RECEIVABLE_ACCOUNT]);
  const posted = createTransfers(state.ledger, [{
    id: nextTransferId(state),
    debitAccountId: TDS_RECEIVABLE_ACCOUNT.id,
    creditAccountId: party.accountId,
    amount: paise(amount),
    invoiceId: invoice.id,
    code: 'TDS_WITHHELD',
    userData: date,
  }]);
  if (!posted[0].ok) return { ok: false, error: posted[0].error };
  const receipt = { amount, date, mode: 'tds', section, ...(tan ? { tan } : {}) };
  invoice.receipts = invoice.receipts || [];
  invoice.receipts.push(receipt);
  const remaining = round2(Math.max(0, outstandingOf(state, invoice)));
  invoice.status = remaining <= 0.01 ? 'paid' : 'partial';
  return { ok: true, invoice, receipt, remaining, posted };
}

function nameKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function gramsOf(key) {
  const grams = new Set();
  for (let at = 0; at + NAME_MIN <= key.length; at += 1) grams.add(key.slice(at, at + NAME_MIN));
  return grams;
}

function nextOpen(list) {
  while (list.at < list.rows.length && list.rows[list.at].claimed) list.at += 1;
  return list.rows[list.at];
}

function listFor(map, key) {
  if (!map.has(key)) map.set(key, { rows: [], at: 0 });
  return map.get(key);
}

function unclaimedIndex(rows) {
  const order = new Map(rows.map((row, at) => [row, at]));
  const quarters = new Map();
  const keyOf = new Map();
  const quarterIndex = (quarter) => {
    if (!quarters.has(quarter)) quarters.set(quarter, { tans: new Map(), exact: new Map(), grams: new Map(), lengths: new Map() });
    return quarters.get(quarter);
  };

  for (const row of rows) {
    if (row.claimed || row.section === '194O' || !(row.in26as > 0)) continue;
    const here = quarterIndex(row.quarter);
    if (row.tan) listFor(here.tans, row.tan).rows.push(row);
    const key = nameKey(row.deductor);
    if (key.length < NAME_MIN) continue;
    if (!here.exact.has(key)) {
      here.exact.set(key, { all: { rows: [], at: 0 }, sections: new Map() });
      for (const gram of gramsOf(key)) {
        if (!here.grams.has(gram)) here.grams.set(gram, new Set());
        here.grams.get(gram).add(key);
      }
      here.lengths.set(key.length, (here.lengths.get(key.length) || 0) + 1);
    }
    const bucket = here.exact.get(key);
    bucket.all.rows.push(row);
    listFor(bucket.sections, row.section).rows.push(row);
    keyOf.set(row, key);
  }

  const retire = (here, key) => {
    here.exact.delete(key);
    for (const gram of gramsOf(key)) {
      const keys = here.grams.get(gram);
      keys.delete(key);
      if (!keys.size) here.grams.delete(gram);
    }
    const left = here.lengths.get(key.length) - 1;
    if (left) here.lengths.set(key.length, left);
    else here.lengths.delete(key.length);
  };

  const agreeingBuckets = (here, wanted) => {
    const found = new Set();
    for (let length = NAME_MIN; length <= wanted.length; length += 1) {
      if (!here.lengths.has(length)) continue;
      for (let at = 0; at + length <= wanted.length; at += 1) {
        const bucket = here.exact.get(wanted.slice(at, at + length));
        if (bucket) found.add(bucket);
      }
    }
    const postings = [...gramsOf(wanted)].map((gram) => here.grams.get(gram));
    if (!postings.includes(undefined)) {
      const rarest = postings.reduce((least, next) => (next.size < least.size ? next : least));
      for (const key of rarest) if (key.includes(wanted)) found.add(here.exact.get(key));
    }
    return found;
  };

  return {
    byTan(quarter, tan) {
      const list = quarters.get(quarter)?.tans.get(tan);
      return list ? nextOpen(list) : undefined;
    },
    byName(quarter, section, customer) {
      const wanted = nameKey(customer);
      const here = quarters.get(quarter);
      if (!here || wanted.length < NAME_MIN) return undefined;
      const buckets = agreeingBuckets(here, wanted);
      let best;
      const consider = (list) => {
        const row = list ? nextOpen(list) : undefined;
        if (row && (!best || order.get(row) < order.get(best))) best = row;
      };
      for (const bucket of buckets) consider(bucket.sections.get(section));
      if (!best) for (const bucket of buckets) consider(bucket.all);
      return best;
    },
    claim(row) {
      row.claimed = true;
      const key = keyOf.get(row);
      if (key === undefined) return;
      const here = quarters.get(row.quarter);
      const bucket = here.exact.get(key);
      if (bucket && !nextOpen(bucket.all)) retire(here, key);
    },
  };
}

function quarterOf(row) {
  return String(row.quarter || quarterOfDate(row.date));
}

function statusOf(inBooks, in26as) {
  if (inBooks < 0.005) return 'not in books';
  if (in26as < 0.005) return 'not in 26AS';
  const gap = inBooks - in26as;
  if (gap > MATCH_TOLERANCE) return 'short in 26AS';
  if (gap < -MATCH_TOLERANCE) return 'more in 26AS';
  return 'matched';
}

export function tdsCreditCheck(state, { fy } = {}) {
  const wanted = String(fy || '').trim() || fyOfPeriod(localToday().slice(0, 7));
  const channels = state.channels && typeof state.channels === 'object' ? state.channels : {};
  const table = new Map();
  const rowFor = (key, seed) => {
    if (!table.has(key)) table.set(key, { section: '', tan: '', deductor: '', customer: '', quarter: '', in26as: 0, inBooks: 0, claimed: false, ...seed });
    return table.get(key);
  };
  const marketplaceRow = (channel, quarter) => rowFor(`194O|channel:${channel}|${quarter}`, { section: '194O', quarter, tan: channels[channel]?.tan || '', deductor: channel });

  const statements = (state.tdsCreditStatements || []).filter((row) => quarterOf(row).split(' ')[1] === wanted);
  for (const statement of statements) {
    const section = statement.section || '194O';
    const quarter = quarterOf(statement);
    if (section === '194O') {
      const channel = statement.channel || 'marketplace';
      const row = marketplaceRow(channel, quarter);
      row.tan = row.tan || statement.tan;
      if (channel === 'marketplace' && !row.deductor.trim().includes(' ') && statement.name) row.deductor = statement.name;
      row.in26as = round2(row.in26as + statement.taxDeducted);
      continue;
    }
    const row = rowFor(`${section}|tan:${statement.tan}|${quarter}`, { section, quarter, tan: statement.tan });
    if (!row.deductor && statement.name) row.deductor = statement.name;
    row.in26as = round2(row.in26as + statement.taxDeducted);
  }

  for (const settled of marketplaceCredits(state, { fy: wanted }).data.tds) {
    if (!(settled.recorded > 0)) continue;
    const row = marketplaceRow(settled.channel, settled.quarter);
    row.inBooks = round2(row.inBooks + settled.recorded);
    row.claimed = true;
  }

  const resolved = new Map();
  const unclaimed = unclaimedIndex([...table.values()]);
  const place = (section, tan, customer, quarter) => {
    if (section === '194O') {
      const row = marketplaceRow(channelOfDeductor(state, { tan, name: customer }) || 'marketplace', quarter);
      row.claimed = true;
      return row;
    }
    const exactKey = tan ? `${section}|tan:${tan}|${quarter}` : `${section}|name:${nameKey(customer)}|${quarter}`;
    const row = table.get(exactKey)
      || (tan ? unclaimed.byTan(quarter, tan) : unclaimed.byName(quarter, section, customer))
      || rowFor(exactKey, { section, quarter, tan, deductor: customer });
    unclaimed.claim(row);
    return row;
  };

  for (const invoice of state.invoices || []) {
    for (const receipt of invoice.receipts || []) {
      if (!isTdsReceipt(receipt) || fyOfPeriod(String(receipt.date).slice(0, 7)) !== wanted) continue;
      const quarter = quarterOfDate(receipt.date);
      const tan = receipt.tan || '';
      const section = receipt.section || '';
      const bookKey = `${section}|${tan || `name:${nameKey(invoice.partyName)}`}|${quarter}`;
      if (!resolved.has(bookKey)) resolved.set(bookKey, place(section, tan, invoice.partyName, quarter));
      const row = resolved.get(bookKey);
      row.inBooks = round2(row.inBooks + Number(receipt.amount || 0));
      if (!row.customer && row.section !== '194O') row.customer = invoice.partyName;
    }
  }

  const rows = [...table.values()].map((row) => {
    const inBooks = round2(row.inBooks);
    const in26as = round2(row.in26as);
    return { section: row.section, tan: row.tan, deductor: row.deductor || row.customer || row.tan, customer: row.customer, quarter: row.quarter, in26as, inBooks, gap: round2(inBooks - in26as), status: statusOf(inBooks, in26as) };
  }).sort((a, b) => a.quarter.localeCompare(b.quarter) || a.deductor.toLowerCase().localeCompare(b.deductor.toLowerCase()) || a.section.localeCompare(b.section) || a.tan.localeCompare(b.tan));

  const sum = (list, pick) => round2(list.reduce((total, row) => total + pick(row), 0));
  const sections = new Map();
  for (const row of rows) {
    const item = sections.get(row.section) || { section: row.section, rows: 0, in26as: 0, inBooks: 0 };
    item.rows += 1;
    item.in26as = round2(item.in26as + row.in26as);
    item.inBooks = round2(item.inBooks + row.inBooks);
    sections.set(row.section, item);
  }
  const imported = statements.map((row) => String(row.importedOn || '')).filter(Boolean).sort().at(-1);
  return {
    ok: true,
    data: {
      fy: wanted,
      source: statements.length ? `26AS imported ${imported || 'earlier'}` : 'no 26AS imported yet',
      rows,
      totals: {
        in26as: sum(rows, (row) => row.in26as),
        inBooks: sum(rows, (row) => row.inBooks),
        gap: sum(rows, (row) => row.gap),
        notInBooks: sum(rows.filter((row) => row.status === 'not in books'), (row) => row.in26as),
        notIn26as: sum(rows.filter((row) => row.status === 'not in 26AS'), (row) => row.inBooks),
      },
      bySection: [...sections.values()].sort((a, b) => a.section.localeCompare(b.section)),
      note: TDS_CHECK_NOTE,
    },
  };
}

export function tdsCreditWords(data, money) {
  const waiting = data.pendingFile ? `The Form 26AS file you attached (${data.pendingFile}) has not been imported` : '';
  if (!data.rows.length) {
    if (waiting) return `No TDS credit is on record for FY ${data.fy} yet. ${waiting}: say "import 26AS" to read it, or record TDS a customer withheld on an invoice.\n${data.source}`;
    return `No TDS credit is on record for FY ${data.fy} yet. Import Form 26AS (CSV or text from the income-tax portal) or record TDS a customer withheld on an invoice.\n${data.source}`;
  }
  const lines = [`26AS vs books for FY ${data.fy}: ${money(data.totals.in26as)} in 26AS, ${money(data.totals.inBooks)} in your books, gap ${money(data.totals.gap)}.`];
  for (const row of data.rows.slice(0, MAX_WORDED_ROWS)) lines.push(`· ${row.deductor} ${row.quarter} (${row.section}): ${row.status}, 26AS ${money(row.in26as)}, books ${money(row.inBooks)}`);
  if (data.rows.length > MAX_WORDED_ROWS) lines.push(`… and ${data.rows.length - MAX_WORDED_ROWS} more`);
  lines.push(data.source);
  if (waiting) lines.push(`${waiting}, so it is not in this comparison; say "import 26AS" to read it.`);
  return lines.join('\n');
}
