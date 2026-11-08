import { csvRows } from './text-safe.mjs';
import { localToday } from './dates.mjs';
import { countryInfo, formatMoney } from './country.mjs';
import { inWords } from './words.mjs';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const CASH_ACCOUNT_IDS = new Set(['1001', '1002']);

const ENTRY_LABELS = {
  SALE: 'Invoice',
  SALES: 'Invoice',
  RECEIPT: 'Payment received',
  CREDIT_NOTE: 'Credit note',
  DEBIT_NOTE: 'Debit note',
  PURCHASE: 'Bill',
  PURCHASE_NOTE: 'Supplier note',
  PAYMENT: 'Payment made',
  EXPENSE: 'Expense',
};

const DATED_DOCUMENTS = ['invoices', 'purchases', 'creditNotes', 'debitNotes', 'purchaseNotes', 'expenses'];

const toRupees = (paise) => Number(paise) / 100;

function documentDates(state) {
  const dates = new Map();
  for (const key of DATED_DOCUMENTS) {
    for (const doc of state[key] || []) {
      if (doc && doc.id != null && ISO.test(String(doc.date || ''))) dates.set(String(doc.id), String(doc.date));
    }
  }
  return dates;
}

function dater(state) {
  const dates = documentDates(state);
  return (transfer) => {
    const own = String(transfer.userData || '');
    if (ISO.test(own)) return own;
    return transfer.invoiceId != null ? dates.get(String(transfer.invoiceId)) || '' : '';
  };
}
const isPosted = (transfer) => transfer.pendingId == null && transfer.posted && !transfer.voided;
const fail = (error, hint, extra = {}) => ({ ok: false, error, hint, ...extra });

function yearStart(state, isoDate) {
  const startMonth = countryInfo(state).yearStartMonth || 1;
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const startYear = month >= startMonth ? year : year - 1;
  return `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
}

function period(state, args = {}) {
  const to = args.to ? String(args.to) : localToday();
  if (!ISO.test(to)) return { error: fail('INVALID_DATE', 'Give dates as YYYY-MM-DD.', { field: 'to', value: to }) };
  const from = args.from ? String(args.from) : yearStart(state, to);
  if (!ISO.test(from)) return { error: fail('INVALID_DATE', 'Give dates as YYYY-MM-DD.', { field: 'from', value: from }) };
  if (from > to) return { error: fail('INVALID_PERIOD', 'The start date is after the end date.', { from, to }) };
  return { from, to };
}

function asOfDate(args = {}) {
  const asOf = args.asOf ? String(args.asOf) : localToday();
  if (!ISO.test(asOf)) return { error: fail('INVALID_DATE', 'Give dates as YYYY-MM-DD.', { field: 'asOf', value: asOf }) };
  return { asOf };
}

function movements(state, include) {
  const ledger = state.ledger;
  const dateOf = dater(state);
  const byAccount = new Map();
  let undated = 0;
  for (const transfer of ledger.transfers) {
    if (!isPosted(transfer)) continue;
    const date = dateOf(transfer);
    if (!date) undated += 1;
    if (!include(date)) continue;
    const debit = transfer.debitAccountId.toString();
    const credit = transfer.creditAccountId.toString();
    const d = byAccount.get(debit) || { debit: 0n, credit: 0n };
    d.debit += transfer.amount;
    byAccount.set(debit, d);
    const c = byAccount.get(credit) || { debit: 0n, credit: 0n };
    c.credit += transfer.amount;
    byAccount.set(credit, c);
  }
  return { byAccount, undated };
}

function accountsOf(ledger) {
  return [...ledger.accounts.values()].sort((a, b) => String(a.code).localeCompare(String(b.code)));
}

function linesFor(ledger, byAccount, type, sign) {
  const lines = [];
  let total = 0n;
  for (const account of accountsOf(ledger)) {
    if (account.type !== type) continue;
    const m = byAccount.get(account.id.toString());
    if (!m) continue;
    const amount = sign === 'debit' ? m.debit - m.credit : m.credit - m.debit;
    if (amount === 0n) continue;
    total += amount;
    lines.push({ code: String(account.code), account: account.name, amount: toRupees(amount) });
  }
  return { lines, total };
}

function money(state, value) {
  return formatMoney(state, value);
}

function tag(state) {
  return String(state.company?.gstin || state.company?.ein || 'books').replace(/[^A-Za-z0-9-]/g, '');
}

export function profitAndLoss(state, args = {}) {
  const span = period(state, args);
  if (span.error) return span.error;
  const { from, to } = span;
  const { byAccount, undated } = movements(state, (date) => Boolean(date) && date >= from && date <= to);
  const income = linesFor(state.ledger, byAccount, 'income', 'credit');
  const expenses = linesFor(state.ledger, byAccount, 'expense', 'debit');
  const net = income.total - expenses.total;
  const csv = csvRows([
    ['section', 'code', 'account', 'amount'],
    ...income.lines.map((l) => ['Income', l.code, l.account, l.amount]),
    ['Income', '', 'Total income', toRupees(income.total)],
    ...expenses.lines.map((l) => ['Expenses', l.code, l.account, l.amount]),
    ['Expenses', '', 'Total expenses', toRupees(expenses.total)],
    ['Result', '', net >= 0n ? 'Net profit' : 'Net loss', toRupees(net)],
  ]);
  const verdict = net >= 0n ? `profit of ${money(state, toRupees(net))}` : `loss of ${money(state, toRupees(-net))}`;
  return {
    ok: true,
    data: {
      from,
      to,
      currency: countryInfo(state).currency,
      income: income.lines,
      totalIncome: toRupees(income.total),
      expenses: expenses.lines,
      totalExpenses: toRupees(expenses.total),
      netProfit: toRupees(net),
      undatedEntries: undated,
      fileName: `profit_and_loss_${tag(state)}_${from}_${to}.csv`,
      csv,
      text: inWords(`From ${from} to ${to}: income ${money(state, toRupees(income.total))}, expenses ${money(state, toRupees(expenses.total))}, a ${verdict}.`),
    },
  };
}

export function balanceSheet(state, args = {}) {
  const at = asOfDate(args);
  if (at.error) return at.error;
  const { asOf } = at;
  const { byAccount, undated } = movements(state, (date) => !date || date <= asOf);
  const assets = linesFor(state.ledger, byAccount, 'asset', 'debit');
  const liabilities = linesFor(state.ledger, byAccount, 'liability', 'credit');
  const equity = linesFor(state.ledger, byAccount, 'equity', 'credit');
  const income = linesFor(state.ledger, byAccount, 'income', 'credit');
  const expenses = linesFor(state.ledger, byAccount, 'expense', 'debit');
  const profit = income.total - expenses.total;
  const equityTotal = equity.total + profit;
  const claims = liabilities.total + equityTotal;
  const csv = csvRows([
    ['section', 'code', 'account', 'amount'],
    ...assets.lines.map((l) => ['Assets', l.code, l.account, l.amount]),
    ['Assets', '', 'Total assets', toRupees(assets.total)],
    ...liabilities.lines.map((l) => ['Liabilities', l.code, l.account, l.amount]),
    ['Liabilities', '', 'Total liabilities', toRupees(liabilities.total)],
    ...equity.lines.map((l) => ['Equity', l.code, l.account, l.amount]),
    ['Equity', '', 'Profit to date', toRupees(profit)],
    ['Equity', '', 'Total equity', toRupees(equityTotal)],
    ['Check', '', 'Liabilities and equity', toRupees(claims)],
  ]);
  return {
    ok: true,
    data: {
      asOf,
      currency: countryInfo(state).currency,
      assets: assets.lines,
      totalAssets: toRupees(assets.total),
      liabilities: liabilities.lines,
      totalLiabilities: toRupees(liabilities.total),
      equity: [...equity.lines, { code: '', account: 'Profit to date', amount: toRupees(profit) }],
      totalEquity: toRupees(equityTotal),
      balanced: assets.total === claims,
      undatedEntries: undated,
      fileName: `balance_sheet_${tag(state)}_${asOf}.csv`,
      csv,
      text: inWords(`As at ${asOf}: assets ${money(state, toRupees(assets.total))}; liabilities ${money(state, toRupees(liabilities.total))} and equity ${money(state, toRupees(equityTotal))}. ${assets.total === claims ? 'It balances.' : 'It does not balance; check the books.'}`),
    },
  };
}

function cashAccountIds(ledger) {
  const ids = new Set();
  for (const account of ledger.accounts.values()) {
    const id = account.id.toString();
    if (account.type === 'asset' && (CASH_ACCOUNT_IDS.has(id) || /^(cash|bank)\b/i.test(account.name))) ids.add(id);
  }
  return ids;
}

const FLOW_GROUPS = [
  { key: 'customers', section: 'operating', label: 'Received from customers' },
  { key: 'income', section: 'operating', label: 'Other income and cash sales' },
  { key: 'suppliers', section: 'operating', label: 'Paid to suppliers' },
  { key: 'expenses', section: 'operating', label: 'Expenses paid' },
  { key: 'dues', section: 'operating', label: 'Taxes, salaries and other dues' },
  { key: 'assets', section: 'investing', label: 'Deposits, advances and assets' },
  { key: 'owner', section: 'financing', label: 'Owner\'s money in and out' },
];

function flowGroup(account, customers, suppliers) {
  const id = account.id.toString();
  if (customers.has(id)) return 'customers';
  if (suppliers.has(id)) return 'suppliers';
  if (account.type === 'income') return 'income';
  if (account.type === 'expense') return 'expenses';
  if (account.type === 'equity') return 'owner';
  if (account.type === 'liability') return 'dues';
  return 'assets';
}

export function cashFlow(state, args = {}) {
  const span = period(state, args);
  if (span.error) return span.error;
  const { from, to } = span;
  const ledger = state.ledger;
  const dateOf = dater(state);
  const cash = cashAccountIds(ledger);
  const customers = new Set((state.parties || []).map((p) => String(p.accountId)));
  const suppliers = new Set((state.vendors || []).map((p) => String(p.accountId)));
  const totals = new Map(FLOW_GROUPS.map((g) => [g.key, { in: 0n, out: 0n }]));
  let opening = 0n;
  let closing = 0n;
  for (const transfer of ledger.transfers) {
    if (!isPosted(transfer)) continue;
    const debit = transfer.debitAccountId.toString();
    const credit = transfer.creditAccountId.toString();
    const intoCash = cash.has(debit);
    const outOfCash = cash.has(credit);
    if (intoCash === outOfCash) continue;
    const date = dateOf(transfer);
    const signed = intoCash ? transfer.amount : -transfer.amount;
    if (!date || date <= to) closing += signed;
    if (!date || date < from) {
      opening += signed;
      continue;
    }
    if (date > to) continue;
    const other = ledger.accounts.get(intoCash ? transfer.creditAccountId : transfer.debitAccountId);
    const bucket = totals.get(other ? flowGroup(other, customers, suppliers) : 'assets');
    if (intoCash) bucket.in += transfer.amount;
    else bucket.out += transfer.amount;
  }
  const sectionNet = new Map();
  const sections = {};
  let net = 0n;
  for (const group of FLOW_GROUPS) {
    const t = totals.get(group.key);
    if (t.in === 0n && t.out === 0n) continue;
    const line = { label: group.label, in: toRupees(t.in), out: toRupees(t.out), net: toRupees(t.in - t.out) };
    sections[group.section] = sections[group.section] || { lines: [], net: 0 };
    sections[group.section].lines.push(line);
    sectionNet.set(group.section, (sectionNet.get(group.section) || 0n) + t.in - t.out);
    sections[group.section].net = toRupees(sectionNet.get(group.section));
    net += t.in - t.out;
  }
  const csv = csvRows([
    ['section', 'line', 'in', 'out', 'net'],
    ['Opening', 'Cash and bank at the start', '', '', toRupees(opening)],
    ...Object.entries(sections).flatMap(([name, s]) => s.lines.map((l) => [name, l.label, l.in, l.out, l.net])),
    ['Closing', 'Cash and bank at the end', '', '', toRupees(closing)],
  ]);
  return {
    ok: true,
    data: {
      from,
      to,
      currency: countryInfo(state).currency,
      opening: toRupees(opening),
      operating: sections.operating || { lines: [], net: 0 },
      investing: sections.investing || { lines: [], net: 0 },
      financing: sections.financing || { lines: [], net: 0 },
      netChange: toRupees(net),
      closing: toRupees(closing),
      ties: opening + net === closing,
      fileName: `cash_flow_${tag(state)}_${from}_${to}.csv`,
      csv,
      text: inWords(`From ${from} to ${to}: cash and bank went from ${money(state, toRupees(opening))} to ${money(state, toRupees(closing))}, a change of ${money(state, toRupees(net))}.`),
    },
  };
}

function entryFromReference(reference) {
  if (/^INV-/i.test(reference)) return 'Invoice';
  if (/^CN-/i.test(reference)) return 'Credit note';
  if (/^DN-/i.test(reference)) return 'Debit note';
  return '';
}

function findCustomer(state, args) {
  const parties = state.parties || [];
  const gstin = String(args.gstin || '').trim().toUpperCase();
  if (gstin) return parties.find((p) => String(p.gstin || '').toUpperCase() === gstin) || null;
  const name = String(args.party || args.partyName || '').trim().toLowerCase();
  if (!name) return null;
  return parties.find((p) => p.name.toLowerCase() === name)
    || (parties.filter((p) => p.name.toLowerCase().includes(name)).length === 1 ? parties.find((p) => p.name.toLowerCase().includes(name)) : null);
}

export function customerStatement(state, args = {}) {
  const party = findCustomer(state, args);
  if (!party) {
    const names = (state.parties || []).map((p) => p.name).slice(0, 10);
    return fail('PARTY_NOT_FOUND', names.length ? `No single customer matches. Customers include: ${names.join(', ')}.` : 'There are no customers yet.', { customers: names });
  }
  const span = period(state, args);
  if (span.error) return span.error;
  const { from, to } = span;
  const accountId = String(party.accountId);
  const dateOf = dater(state);
  let opening = 0n;
  const grouped = new Map();
  for (const transfer of state.ledger.transfers) {
    if (!isPosted(transfer)) continue;
    const debit = transfer.debitAccountId.toString() === accountId;
    const credit = transfer.creditAccountId.toString() === accountId;
    if (!debit && !credit) continue;
    const date = dateOf(transfer);
    const signed = debit ? transfer.amount : -transfer.amount;
    if (!date || date < from) {
      opening += signed;
      continue;
    }
    if (date > to) continue;
    const reference = transfer.invoiceId != null ? String(transfer.invoiceId) : '';
    const code = String(transfer.code || '');
    const key = reference ? `${date}|${reference}|${code === 'RECEIPT' ? 'R' : ''}|${debit ? 'D' : 'C'}` : `${date}||${code}|${debit ? 'D' : 'C'}`;
    const row = grouped.get(key) || { date, reference, entry: ENTRY_LABELS[code] || entryFromReference(reference) || code || 'Entry', charged: 0n, paid: 0n, order: grouped.size };
    if (ENTRY_LABELS[code]) row.entry = ENTRY_LABELS[code];
    if (debit) row.charged += transfer.amount;
    else row.paid += transfer.amount;
    grouped.set(key, row);
  }
  let running = opening;
  const rows = [...grouped.values()]
    .sort((a, b) => (a.date === b.date ? a.order - b.order : a.date.localeCompare(b.date)))
    .map((row) => {
      running += row.charged - row.paid;
      return { date: row.date, reference: row.reference, entry: row.entry, charged: toRupees(row.charged), paid: toRupees(row.paid), balance: toRupees(running) };
    });
  const closing = running;
  const csv = csvRows([
    ['date', 'reference', 'entry', 'charged', 'paid', 'balance'],
    [from, '', 'Opening balance', '', '', toRupees(opening)],
    ...rows.map((r) => [r.date, r.reference, r.entry, r.charged, r.paid, r.balance]),
    [to, '', 'Closing balance', '', '', toRupees(closing)],
  ]);
  const owes = closing > 0n ? `owes you ${money(state, toRupees(closing))}` : closing < 0n ? `has ${money(state, toRupees(-closing))} in credit with you` : 'owes you nothing';
  return {
    ok: true,
    data: {
      customer: party.name,
      gstin: party.gstin || '',
      from,
      to,
      currency: countryInfo(state).currency,
      opening: toRupees(opening),
      rows,
      closing: toRupees(closing),
      fileName: `statement_${String(party.name).replace(/[^A-Za-z0-9]+/g, '_').slice(0, 40)}_${from}_${to}.csv`,
      csv,
      text: inWords(`${party.name}, ${from} to ${to}: ${rows.length} entries; ${party.name} ${owes}.`),
    },
  };
}
