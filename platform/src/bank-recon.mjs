import { createTransfers, createAccounts, listAccounts, paise, rupees, ACCOUNT_FLAGS } from './ledger.mjs';
import { recordReceipt, recordPayment, planPayment, billOutstanding } from './invoice.mjs';
import { outstandingOf } from './credit-notes.mjs';
import { planExpense, postExpense, tagExpense, headNamed } from './expenses.mjs';
import { isPeriodLocked } from './period-lock.mjs';
import { postingDate, isoDate, localToday } from './dates.mjs';
import { salaryPrivate } from './employees.mjs';
import { ensureInterestIncomeAccount } from './chart.mjs';
import { bankFingerprint } from './post-import.mjs';
import { bank } from './sprint-load.mjs';
import { regexOf, safePatternProblem } from './safe-pattern.mjs';

export { MAX_PATTERN, MAX_QUANTIFIERS, MAX_OPEN_REPEATS, safePattern, safePatternProblem } from './safe-pattern.mjs';

export const DEFAULT_ACCOUNT = '1002';
export const CHARGES_HEAD = '5180';
export const INTEREST_INCOME = 4100;
export const LINE_KINDS = ['books', 'receipt', 'payment', 'expense', 'charge', 'interest', 'transfer', 'ignore'];
export const RULE_KINDS = ['receipt', 'payment', 'expense', 'charge', 'interest', 'transfer', 'ignore'];
export const LINE_STATUSES = ['unmatched', 'matched', 'booked', 'ignored'];
export const ACCOUNT_KINDS = ['bank', 'cash', 'wallet'];
export const BUILT_IN_ACCOUNTS = [
  { id: '1001', label: 'Cash', kind: 'cash' },
  { id: '1002', label: 'Bank', kind: 'bank' },
];

const FIRST_OWN_ACCOUNT = 1003;
const LAST_OWN_ACCOUNT = 1099;
const AMOUNT_TOLERANCE = 1;
const LINK_DAYS = 3;
const SUGGEST_DAYS = 12;
const MAX_SUGGESTIONS = 5;
const DEFAULT_WINDOW_DAYS = 90;
const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 2000;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const NAME_FILLERS = new Set(['PRIVATE', 'LIMITED', 'COMPANY', 'INDIA']);
const KIND_SIDE = { receipt: 'in', interest: 'in', payment: 'out', expense: 'out', charge: 'out' };
const RELOCATED = new Set(['receipt', 'payment', 'expense', 'charge']);
const PAID_KINDS = new Set(['receipt', 'payment']);
const DOC_NAMES = { receipt: 'Receipt', payment: 'Payment', expense: 'Expense', settlement: 'Settlement', transfer: 'Transfer', salary: 'Salary', gst: 'Tax payment', other: 'Entry' };
const LEDGER_WORDS = { exceeds_debits: 'the account would go below zero', exceeds_credits: 'the account cannot be debited past its credits', account_not_found: 'the account is not in the ledger' };

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function actorOf(state) {
  return String(state?.__actor?.userId || '');
}

function dayNumber(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

function daysApart(a, b) {
  return Math.abs(dayNumber(a) - dayNumber(b));
}

export function plusDays(iso, days) {
  return new Date((dayNumber(iso) + days) * 86400000).toISOString().slice(0, 10);
}

function nextTransferId(state) {
  return BigInt(state.transferSeq = (state.transferSeq || 100000) + 1);
}

function nameKey(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function byDateThenId(a, b) {
  return String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id));
}

function findById(list, id) {
  const text = String(id == null ? '' : id).trim();
  if (!text) return null;
  return (list || []).find((doc) => doc.id === text) || (list || []).find((doc) => String(doc.id).toUpperCase() === text.toUpperCase()) || null;
}

function uniqueByName(list, name) {
  const key = nameKey(name);
  if (!key) return null;
  const exact = (list || []).find((item) => nameKey(item.name) === key);
  if (exact) return exact;
  const close = (list || []).filter((item) => nameKey(item.name).includes(key));
  return close.length === 1 ? close[0] : null;
}

function sameNamed(list, name) {
  const key = nameKey(name);
  return key ? (list || []).filter((item) => nameKey(item.name) === key) : [];
}

function partyOfDocument(list, doc) {
  return (list || []).find((item) => doc.partyAccountId != null && item.accountId === doc.partyAccountId) || null;
}

function ofParty(party) {
  if (party && typeof party === 'object') return (doc) => (doc.partyAccountId != null && party.accountId != null ? doc.partyAccountId === party.accountId : nameKey(doc.partyName) === nameKey(party.name));
  return (doc) => nameKey(doc.partyName) === nameKey(party);
}

export function findCustomer(state, name) {
  return uniqueByName(state.parties, name);
}

export function findSupplier(state, name) {
  return uniqueByName(state.vendors, name);
}

export function linesOf(state) {
  if (!Array.isArray(state.bankLines)) state.bankLines = [];
  return state.bankLines;
}

export function rulesOf(state) {
  if (!Array.isArray(state.bankRules)) state.bankRules = [];
  return state.bankRules;
}

export function findBankLine(state, id) {
  const key = String(id == null ? '' : id).trim().toUpperCase();
  return key ? linesOf(state).find((line) => line.id === key) || null : null;
}

export function sideOf(line) {
  return Number(line.in || 0) > 0 ? 'in' : 'out';
}

export function amountOf(line) {
  return round2(Number(line.in || 0) > 0 ? line.in : line.out);
}

export function categoryOf(line) {
  if (line.category) return line.category;
  const read = bank.classify(String(line.narration || ''), { kind: sideOf(line) === 'in' ? 'credit' : 'debit' });
  return read?.category || '';
}

function docIdsOf(line) {
  const id = line.match?.id;
  return id ? String(id).split(/,\s*/) : [];
}

function numberOfId(id) {
  const digits = String(id || '').replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

function nextLineId(state) {
  const lines = linesOf(state);
  let seq = Number(state.bankLineSeq || 0);
  const last = lines.length ? numberOfId(lines[lines.length - 1].id) : 0;
  if (seq < last) {
    seq = last;
    for (const line of lines) seq = Math.max(seq, numberOfId(line.id));
  }
  state.bankLineSeq = seq + 1;
  return `BL-${String(state.bankLineSeq).padStart(6, '0')}`;
}

function nextRuleId(state) {
  const taken = new Set(rulesOf(state).map((rule) => rule.id));
  let id;
  do {
    state.bankRuleSeq = Number(state.bankRuleSeq || 0) + 1;
    id = `BR-${String(state.bankRuleSeq).padStart(4, '0')}`;
  } while (taken.has(id));
  return id;
}

function nextContraId(state) {
  const taken = new Set((state.bankTransfers || []).map((transfer) => transfer.id));
  let id;
  do {
    state.bankTransferSeq = Number(state.bankTransferSeq || 0) + 1;
    id = `CTR-${String(state.bankTransferSeq).padStart(4, '0')}`;
  } while (taken.has(id));
  return id;
}

export function ownAccounts(state) {
  const extra = Array.isArray(state.bankAccounts) ? state.bankAccounts : [];
  return [
    ...BUILT_IN_ACCOUNTS.map((account) => ({ ...account, maskedNumber: '', ifsc: '', builtIn: true })),
    ...extra.map((account) => ({ ...account, builtIn: false })),
  ];
}

export function findOwnAccount(state, ref) {
  const text = String(ref == null ? '' : ref).trim();
  if (!text) return null;
  const all = ownAccounts(state);
  const lower = text.toLowerCase();
  const exact = all.find((account) => account.id === text) || all.find((account) => account.label.toLowerCase() === lower);
  if (exact) return exact;
  const close = all.filter((account) => account.label.toLowerCase().includes(lower));
  return close.length === 1 ? close[0] : null;
}

export function accountFor(state, ref) {
  return findOwnAccount(state, ref == null || ref === '' ? DEFAULT_ACCOUNT : ref);
}

function ledgerBalances(state) {
  const balances = new Map();
  for (const row of listAccounts(state.ledger)) balances.set(row.id, round2(row.debitsPosted - row.creditsPosted));
  return balances;
}

export function accountBalance(state, id) {
  return ledgerBalances(state).get(String(id)) || 0;
}

export function listBankAccounts(state) {
  const balances = ledgerBalances(state);
  const accounts = ownAccounts(state).map((account) => ({
    id: account.id,
    label: account.label,
    kind: account.kind,
    maskedNumber: account.maskedNumber || '',
    ifsc: account.ifsc || '',
    balance: balances.get(account.id) || 0,
    builtIn: account.builtIn,
  }));
  return { ok: true, data: { accounts } };
}

function maskNumber(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  const digits = text.replace(/\D/g, '');
  if (digits.length < 4 || digits.length > 18) return null;
  return `XXXX${digits.slice(-4)}`;
}

function freeAccountId(state) {
  const used = new Set([...ownAccounts(state).map((account) => Number(account.id)), ...[...state.ledger.accounts.keys()].map(Number)]);
  for (let id = FIRST_OWN_ACCOUNT; id <= LAST_OWN_ACCOUNT; id += 1) if (!used.has(id)) return String(id);
  return null;
}

export function planBankAccount(state, args = {}) {
  if (salaryPrivate(state)) return fail('OWNER_ONLY', { hint: 'Only the owner can add or change own accounts.' });
  const label = String(args.label || '').trim().slice(0, 60);
  if (!label) return fail('LABEL_REQUIRED');
  const id = args.id == null || args.id === '' ? '' : String(args.id).trim();
  let existing = null;
  if (id) {
    if (BUILT_IN_ACCOUNTS.some((account) => account.id === id)) return fail('BUILT_IN_ACCOUNT', { id });
    existing = (state.bankAccounts || []).find((account) => account.id === id) || null;
    if (!existing) return fail('ACCOUNT_NOT_FOUND', { account: id });
  }
  const kind = String(args.kind || existing?.kind || 'bank').trim().toLowerCase();
  if (!ACCOUNT_KINDS.includes(kind)) return fail('BAD_KIND', { kinds: ACCOUNT_KINDS });
  if (existing && kind !== existing.kind) return fail('KIND_FIXED', { id, kind: existing.kind });
  const maskedNumber = maskNumber(args.maskedNumber);
  if (maskedNumber === null) return fail('BAD_ACCOUNT_NUMBER');
  const ifsc = String(args.ifsc || '').trim().toUpperCase();
  if (ifsc && !IFSC.test(ifsc)) return fail('BAD_IFSC', { ifsc });
  const clash = ownAccounts(state).find((account) => account.label.toLowerCase() === label.toLowerCase() && account.id !== id);
  if (clash) return fail('LABEL_TAKEN', { id: clash.id, label: clash.label });
  const newId = id || freeAccountId(state);
  if (!newId) return fail('NO_FREE_ACCOUNT');
  return { ok: true, plan: { id: newId, label, kind, maskedNumber: maskedNumber || existing?.maskedNumber || '', ifsc: ifsc || existing?.ifsc || '', existing } };
}

export function setBankAccount(state, args = {}) {
  const planned = planBankAccount(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const flags = plan.kind === 'cash' ? ACCOUNT_FLAGS.CREDITS_MUST_NOT_EXCEED_DEBITS : 0;
  createAccounts(state.ledger, [{ id: Number(plan.id), code: plan.id, name: plan.label, type: 'asset', flags }]);
  const ledgerAccount = state.ledger.accounts.get(BigInt(plan.id));
  if (ledgerAccount && ledgerAccount.name !== plan.label) ledgerAccount.name = plan.label;
  if (!Array.isArray(state.bankAccounts)) state.bankAccounts = [];
  let record = plan.existing;
  if (record) {
    record.label = plan.label;
    record.maskedNumber = plan.maskedNumber;
    record.ifsc = plan.ifsc;
  } else {
    record = { id: plan.id, label: plan.label, kind: plan.kind, maskedNumber: plan.maskedNumber, ifsc: plan.ifsc, openedOn: localToday(), by: actorOf(state) };
    state.bankAccounts.push(record);
  }
  return { ok: true, account: { ...record, balance: accountBalance(state, record.id), builtIn: false }, created: !plan.existing };
}

export function planTransfer(state, args = {}) {
  const date = postingDate(args.date);
  if (!date) return fail('INVALID_DATE', { date: args.date });
  if (isPeriodLocked(state, date)) return fail('PERIOD_LOCKED', { date, lockThrough: state.lockThrough });
  const from = findOwnAccount(state, args.fromAccount);
  if (!from) return fail('ACCOUNT_NOT_FOUND', { account: args.fromAccount, which: 'from' });
  const to = findOwnAccount(state, args.toAccount);
  if (!to) return fail('ACCOUNT_NOT_FOUND', { account: args.toAccount, which: 'to' });
  if (from.id === to.id) return fail('SAME_ACCOUNT', { account: from.id });
  const amount = round2(args.amount);
  if (!Number.isFinite(amount) || amount <= 0) return fail('BAD_AMOUNT');
  if (from.kind === 'cash') {
    const inHand = accountBalance(state, from.id);
    if (inHand + 0.005 < amount) return fail('INSUFFICIENT_CASH', { inHand, amount });
  }
  const reference = String(args.reference || '').trim().slice(0, 120);
  return { ok: true, plan: { date, from, to, amount, reference } };
}

export function recordTransfer(state, args = {}) {
  const planned = planTransfer(state, args);
  if (!planned.ok) return planned;
  const { plan } = planned;
  const seqBefore = state.transferSeq;
  const contraSeqBefore = state.bankTransferSeq;
  const id = nextContraId(state);
  const posted = createTransfers(state.ledger, [{
    id: nextTransferId(state),
    debitAccountId: Number(plan.to.id),
    creditAccountId: Number(plan.from.id),
    amount: paise(plan.amount),
    code: 'CONTRA',
    invoiceId: id,
    userData: plan.date,
  }]);
  if (!posted[0].ok) {
    state.transferSeq = seqBefore;
    state.bankTransferSeq = contraSeqBefore;
    return fail('LEDGER_REJECT', { posted });
  }
  const transfer = { id, date: plan.date, fromAccount: plan.from.id, toAccount: plan.to.id, amount: plan.amount, reference: plan.reference, transferId: posted[0].id, by: actorOf(state) };
  if (!Array.isArray(state.bankTransfers)) state.bankTransfers = [];
  state.bankTransfers.push(transfer);
  return { ok: true, transfer, posted, from: plan.from, to: plan.to };
}

function takenTransferIds(state, account) {
  const taken = new Set();
  for (const line of linesOf(state)) {
    if (line.account !== account) continue;
    for (const id of line.match?.transferIds || []) taken.add(String(id));
  }
  return taken;
}

function transferDate(row) {
  return typeof row.userData === 'string' ? isoDate(row.userData.slice(0, 10)) || '' : '';
}

function docKindOf(code) {
  if (code === 'RECEIPT' || code === 'TALLY-RECEIPT') return 'receipt';
  if (code === 'PAYMENT' || code === 'TALLY-PAYMENT') return 'payment';
  if (/^(?:EXPENSE|ITC-|TDS-(?!DEPOSIT)|RETAG)/.test(code)) return 'expense';
  if (code === 'SETTLEMENT') return 'settlement';
  if (code === 'CONTRA') return 'transfer';
  if (code === 'SALARY-PAID') return 'salary';
  if (/^GST/.test(code)) return 'gst';
  return 'other';
}

function partyOf(state, docKind, docId) {
  if (!docId) return '';
  if (docKind === 'receipt') return (state.invoices || []).find((inv) => inv.id === docId)?.partyName || '';
  if (docKind === 'payment') return (state.purchases || []).find((bill) => bill.id === docId)?.partyName || '';
  if (docKind === 'expense') {
    const expense = (state.expenses || []).find((item) => item.id === docId);
    return expense ? expense.payee || expense.description || '' : '';
  }
  if (docKind === 'settlement') return (state.settlements || []).find((item) => item.id === docId)?.channel || '';
  return '';
}

function finishMovement(state, group) {
  const net = group.inPaise - group.outPaise;
  const side = net >= 0n ? 'in' : 'out';
  const amount = round2(rupees(net < 0n ? -net : net));
  const docKind = docKindOf(group.code);
  return {
    transferId: group.transferId,
    transferIds: group.transferIds,
    date: group.date,
    code: group.code,
    docKind,
    docId: group.docId || group.transferId,
    party: partyOf(state, docKind, group.docId),
    side,
    amount,
    in: side === 'in' ? amount : 0,
    out: side === 'out' ? amount : 0,
    linked: group.linked,
    otherAccount: group.otherAccount,
  };
}

function isRelocation(row) {
  return row.code === 'CONTRA' && Boolean(row.invoiceId) && !String(row.invoiceId).startsWith('CTR-');
}

function startGroup(list, groups, key, shape) {
  const group = { ...shape, transferId: shape.id, transferIds: [], inPaise: 0n, outPaise: 0n, linked: false, relocated: false };
  groups.set(key, group);
  list.push(group);
  return group;
}

function addToGroup(group, row, id, isDebit, taken) {
  group.transferIds.push(id);
  if (taken.has(id)) group.linked = true;
  if (isDebit) group.inPaise += row.amount;
  else group.outPaise += row.amount;
}

function relocationTarget(list, item) {
  const same = list.filter((group) => !group.relocated && group.docId === item.docId && group.date === item.date);
  return same.find((group) => (item.isDebit ? group.outPaise : group.inPaise) === item.row.amount) || same[0] || null;
}

export function bookMovements(state, account, { from = '', to = '', linked = null } = {}) {
  const acct = BigInt(account);
  const taken = takenTransferIds(state, account);
  const groups = new Map();
  const list = [];
  const relocations = [];
  for (const row of state.ledger.transfers) {
    if (!row.posted || row.voided || row.code === 'BANK') continue;
    const isDebit = row.debitAccountId === acct;
    if (!isDebit && row.creditAccountId !== acct) continue;
    const date = transferDate(row);
    if ((from && date && date < from) || (to && date && date > to)) continue;
    const id = row.id.toString();
    const docId = row.invoiceId ? String(row.invoiceId) : '';
    const shape = { id, date, code: row.code || '', docId, otherAccount: (isDebit ? row.creditAccountId : row.debitAccountId).toString() };
    if (isRelocation(row)) {
      relocations.push({ row, id, date, docId, isDebit, shape });
      continue;
    }
    const key = !docId || PAID_KINDS.has(docKindOf(shape.code)) ? id : `${docId}|${date}`;
    addToGroup(groups.get(key) || startGroup(list, groups, key, shape), row, id, isDebit, taken);
  }
  for (const item of relocations) {
    const target = relocationTarget(list, item);
    if (target) target.relocated = true;
    addToGroup(target || startGroup(list, groups, item.id, item.shape), item.row, item.id, item.isDebit, taken);
  }
  return list.map((group) => finishMovement(state, group)).filter((movement) => movement.amount > 0.005 && (linked == null || movement.linked === linked));
}

export function docWords(movement) {
  const label = DOC_NAMES[movement.docKind] || 'Entry';
  const joiner = movement.docKind === 'payment' ? 'to' : movement.docKind === 'receipt' ? 'from' : 'for';
  return `${label} ${movement.docId}${movement.party ? ` ${joiner} ${movement.party}` : ''}`;
}

function rowSide(row) {
  if (row.type === 'credit' || Number(row.credit) > 0) return 'in';
  if (row.type === 'debit' || Number(row.debit) > 0) return 'out';
  return '';
}

function rowAmount(row, side) {
  return round2(Math.abs(Number(side === 'in' ? row.credit || row.amount : row.debit || row.amount) || 0));
}

function bankPostings(state) {
  const postings = new Map();
  for (const row of state.ledger.transfers) {
    if (row.code === 'BANK' && row.invoiceId && row.posted && !row.voided) postings.set(String(row.invoiceId), row);
  }
  return postings;
}

function nearestMovement(open, line, days) {
  const side = sideOf(line);
  const amount = amountOf(line);
  let best = null;
  let bestGap = Infinity;
  for (const movement of open) {
    if (movement.side !== side || !movement.date || Math.abs(movement.amount - amount) > AMOUNT_TOLERANCE) continue;
    const gap = daysApart(movement.date, line.date);
    if (gap > days || gap >= bestGap) continue;
    best = movement;
    bestGap = gap;
  }
  return best;
}

function linkMovement(line, movement, kind, { ruleId = null, note = '' } = {}) {
  line.status = 'matched';
  line.match = { kind, id: movement.docId, transferIds: [...movement.transferIds], ruleId, note };
}

function newLine(state, row, { account, side, amount, fingerprint, importedOn, fileLabel, tieBreak }) {
  return {
    id: nextLineId(state),
    account,
    date: isoDate(row.date),
    narration: String(row.narration || row.description || '').trim().slice(0, 200),
    refNo: String(row.refNo || '').trim().slice(0, 40),
    in: side === 'in' ? amount : 0,
    out: side === 'out' ? amount : 0,
    balance: row.balance == null || !Number.isFinite(Number(row.balance)) ? null : round2(row.balance),
    fingerprint,
    category: String(row.classification?.category || ''),
    status: 'unmatched',
    match: null,
    importedOn,
    fileLabel: String(fileLabel || 'bank').slice(0, 80),
    tieBreak: Boolean(tieBreak),
  };
}

function probeLine(row, { account, side, amount }) {
  return {
    id: '',
    account,
    date: isoDate(row.date),
    narration: String(row.narration || row.description || '').trim(),
    in: side === 'in' ? amount : 0,
    out: side === 'out' ? amount : 0,
    category: String(row.classification?.category || ''),
    status: 'unmatched',
    match: null,
  };
}

function readRow(row, seenInFile) {
  if (row._blocking || row.type === 'balance-only') return { skip: row.type || 'blocking' };
  const side = rowSide(row);
  if (!side) return { skip: 'no-side' };
  const amount = rowAmount(row, side);
  if (!amount) return { skip: 'zero' };
  if (!isoDate(row.date)) return { skip: 'no-date' };
  return { side, amount, fingerprint: bankFingerprint(row, side, amount, seenInFile) };
}

export function recordStatementLines(state, rows, { account = DEFAULT_ACCOUNT, fileLabel = 'bank', issues = [] } = {}) {
  const lines = linesOf(state);
  const breaks = new Set((issues || []).filter((issue) => issue.code === 'BALANCE_BREAK').map((issue) => Number(issue.row)));
  const known = new Map(lines.filter((line) => line.account === account).map((line) => [line.fingerprint, line]));
  const posted = bankPostings(state);
  const open = bookMovements(state, account, { linked: false });
  const seenInFile = new Map();
  const importedOn = localToday();
  const result = { added: [], existing: [], matched: [], skipped: [], rowByLine: new Map(), newLines: [] };
  for (const row of rows || []) {
    const read = readRow(row, seenInFile);
    if (read.skip) {
      result.skipped.push({ sourceRow: row.sourceRow, reason: read.skip });
      continue;
    }
    const { side, amount, fingerprint } = read;
    const already = known.get(fingerprint);
    if (already) {
      result.existing.push(already.id);
      result.skipped.push({ sourceRow: row.sourceRow, reason: 'exists' });
      continue;
    }
    const line = newLine(state, row, { account, side, amount, fingerprint, importedOn, fileLabel, tieBreak: breaks.has(Number(row.sourceRow)) });
    lines.push(line);
    known.set(fingerprint, line);
    result.rowByLine.set(line.id, { ...row, fingerprint });
    const booked = posted.get(fingerprint);
    if (booked) {
      line.status = 'booked';
      line.match = { kind: 'auto', id: fingerprint, transferIds: [booked.id.toString()], ruleId: null, note: 'Posted to a guessed head by an earlier import.' };
      result.existing.push(line.id);
      result.skipped.push({ sourceRow: row.sourceRow, reason: 'exists' });
      continue;
    }
    result.added.push(line.id);
    result.newLines.push(line);
    const movement = nearestMovement(open, line, LINK_DAYS);
    if (movement) {
      linkMovement(line, movement, 'books');
      open.splice(open.indexOf(movement), 1);
      result.matched.push(line.id);
    }
  }
  return result;
}

export function previewStatementLines(state, rows, { account = DEFAULT_ACCOUNT } = {}) {
  const known = new Set(linesOf(state).filter((line) => line.account === account).map((line) => line.fingerprint));
  const posted = bankPostings(state);
  const open = bookMovements(state, account, { linked: false });
  const seenInFile = new Map();
  const counts = { existing: 0, toLink: 0, byRules: 0, rest: 0, transfers: 0 };
  for (const row of rows || []) {
    const read = readRow(row, seenInFile);
    if (read.skip) continue;
    if (known.has(read.fingerprint) || posted.has(read.fingerprint)) {
      counts.existing += 1;
      continue;
    }
    const line = probeLine(row, { account, side: read.side, amount: read.amount });
    const movement = nearestMovement(open, line, LINK_DAYS);
    if (movement) {
      counts.toLink += 1;
      open.splice(open.indexOf(movement), 1);
      continue;
    }
    const rule = ruleFor(state, line);
    if (rule && planMatch(state, line, intentOfRule(rule)).ok) {
      counts.byRules += 1;
      continue;
    }
    counts.rest += 1;
    if (line.category === 'transfer') counts.transfers += 1;
  }
  return counts;
}

export function rulePatternProblem(rule) {
  const pattern = String(rule?.pattern || '');
  if (!pattern) return '';
  return safePatternProblem(pattern) || (regexOf(pattern) ? '' : 'It is not a regular expression I can run.');
}

export function ruleMatches(rule, line) {
  const side = sideOf(line);
  if (rule.side && rule.side !== 'any' && rule.side !== side) return false;
  const amount = amountOf(line);
  if (rule.minAmount != null && amount < Number(rule.minAmount) - 0.005) return false;
  if (rule.maxAmount != null && amount > Number(rule.maxAmount) + 0.005) return false;
  const narration = String(line.narration || '');
  if (rule.contains && !narration.toUpperCase().includes(String(rule.contains).toUpperCase())) return false;
  if (rule.pattern) {
    const re = regexOf(rule.pattern);
    if (!re || !re.test(narration)) return false;
  }
  return true;
}

export function ruleFor(state, line) {
  return rulesOf(state).slice().sort((a, b) => a.id.localeCompare(b.id)).find((rule) => ruleMatches(rule, line)) || null;
}

export function intentOfRule(rule) {
  const then = rule.then || {};
  return { kind: then.kind, partyName: then.partyName || '', head: then.head || '', otherAccount: then.otherAccount || '', note: then.note || '' };
}

function amountArg(value) {
  if (value == null || value === '') return undefined;
  const amount = round2(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function thenOf(args) {
  if (args.then && typeof args.then === 'object') return args.then;
  return { kind: args.kind, partyName: args.partyName, head: args.head, otherAccount: args.otherAccount, note: args.note };
}

export function planBankRule(state, args = {}) {
  const side = String(args.side || 'any').trim().toLowerCase();
  if (!['in', 'out', 'any'].includes(side)) return fail('BAD_SIDE');
  const contains = String(args.contains || '').trim().slice(0, 80);
  const pattern = String(args.pattern || '').trim();
  if (!contains && !pattern) return fail('MATCH_REQUIRED');
  if (pattern) {
    const problem = rulePatternProblem({ pattern });
    if (problem) return fail('BAD_PATTERN', { pattern, hint: problem });
  }
  const minAmount = amountArg(args.minAmount);
  const maxAmount = amountArg(args.maxAmount);
  if (minAmount === null || maxAmount === null) return fail('BAD_AMOUNT');
  if (minAmount != null && maxAmount != null && minAmount > maxAmount) return fail('BAD_RANGE', { minAmount, maxAmount });
  const then = thenOf(args);
  const kind = String(then.kind || '').trim().toLowerCase();
  if (!RULE_KINDS.includes(kind)) return fail('BAD_KIND', { kinds: RULE_KINDS });
  let partyName = String(then.partyName || '').trim();
  let head = String(then.head || '').trim();
  let otherAccount = String(then.otherAccount || '').trim();
  const note = String(then.note || '').trim().slice(0, 120);
  const wants = KIND_SIDE[kind] || '';
  if (wants && side !== 'any' && side !== wants) return fail('SIDE_MISMATCH', { kind, side: wants });
  if (kind === 'receipt' || kind === 'payment') {
    if (!partyName) return fail('PARTY_REQUIRED', { kind });
    const party = kind === 'receipt' ? findCustomer(state, partyName) : findSupplier(state, partyName);
    if (!party) return fail('PARTY_NOT_FOUND', { partyName });
    partyName = party.name;
  }
  if (kind === 'charge') head = head || CHARGES_HEAD;
  if (kind === 'expense' && !head) return fail('HEAD_REQUIRED');
  if ((kind === 'expense' || kind === 'charge') && !headNamed(head)) return fail('UNKNOWN_HEAD', { head });
  if (kind === 'transfer') {
    if (!otherAccount) return fail('OTHER_ACCOUNT_REQUIRED');
    const other = findOwnAccount(state, otherAccount);
    if (!other) return fail('ACCOUNT_NOT_FOUND', { account: otherAccount });
    otherAccount = other.id;
  }
  if (kind !== 'expense' && kind !== 'charge') head = '';
  return { ok: true, plan: { side: wants || side, contains, pattern, minAmount: minAmount ?? null, maxAmount: maxAmount ?? null, then: { kind, partyName, head, otherAccount, note } } };
}

export function createBankRule(state, args = {}) {
  const planned = planBankRule(state, args);
  if (!planned.ok) return planned;
  const rule = { id: nextRuleId(state), ...planned.plan, hits: 0, createdOn: localToday(), by: actorOf(state) };
  rulesOf(state).push(rule);
  return { ok: true, rule };
}

function allocate(items, total) {
  let left = round2(total);
  const parts = [];
  for (const item of items) {
    if (left <= 0.005) break;
    const due = round2(item.due);
    if (due <= 0.005) continue;
    const amount = round2(Math.min(due, left));
    parts.push({ id: item.id, amount });
    left = round2(left - amount);
  }
  return { parts, remainder: left };
}

export function openInvoicesOf(state, party) {
  const mine = ofParty(party);
  return (state.invoices || [])
    .filter((inv) => inv.status !== 'cancelled' && mine(inv) && outstandingOf(state, inv) > 0.005)
    .sort(byDateThenId);
}

export function openBillsOf(state, party) {
  const mine = ofParty(party);
  return (state.purchases || [])
    .filter((bill) => bill.status !== 'cancelled' && mine(bill) && billOutstanding(bill) > 0.005)
    .sort(byDateThenId);
}

function existingMovementFor(state, line, docIds) {
  const wanted = new Set(docIds);
  if (!wanted.size) return null;
  const side = sideOf(line);
  const amount = amountOf(line);
  return bookMovements(state, line.account, { linked: false })
    .filter((movement) => wanted.has(movement.docId) && movement.side === side && movement.date && Math.abs(movement.amount - amount) <= AMOUNT_TOLERANCE && daysApart(movement.date, line.date) <= SUGGEST_DAYS)
    .sort((a, b) => daysApart(a.date, line.date) - daysApart(b.date, line.date))[0] || null;
}

function partyDocIds(list, party) {
  const mine = ofParty(party);
  return (list || []).filter((doc) => doc.status !== 'cancelled' && mine(doc)).map((doc) => doc.id);
}

function planReceiptMatch(state, line, intent) {
  if (sideOf(line) !== 'in') return fail('SIDE_MISMATCH', { kind: 'receipt', side: 'in' });
  let first = null;
  if (intent.invoiceId) {
    first = findById(state.invoices, intent.invoiceId);
    if (!first) return fail('INVOICE_NOT_FOUND', { invoiceId: intent.invoiceId });
    if (first.status === 'cancelled') return fail('INVOICE_CANCELLED', { invoiceId: first.id });
    const already = existingMovementFor(state, line, [first.id]);
    if (already) return { ok: true, plan: { kind: 'books', movement: already } };
  }
  const partyName = first ? first.partyName : String(intent.partyName || '').trim();
  if (!partyName) return fail('PARTY_REQUIRED', { kind: 'receipt' });
  const namesakes = first ? [] : sameNamed(state.parties, partyName);
  if (namesakes.length > 1) return fail('PARTY_AMBIGUOUS', { partyName, gstins: namesakes.map((item) => item.gstin || '') });
  const party = (first && partyOfDocument(state.parties, first)) || findCustomer(state, partyName);
  if (!party) return fail('PARTY_NOT_FOUND', { partyName });
  if (!first) {
    const recorded = existingMovementFor(state, line, partyDocIds(state.invoices, party));
    if (recorded) return { ok: true, plan: { kind: 'books', movement: recorded } };
  }
  const queue = [...(first ? [first] : []), ...openInvoicesOf(state, party).filter((inv) => !first || inv.id !== first.id)];
  const split = allocate(queue.map((inv) => ({ id: inv.id, due: outstandingOf(state, inv) })), amountOf(line));
  if (split.remainder > 0.005) return fail('RECEIPT_UNALLOCATED', { partyName: party.name, remainder: split.remainder, invoiceIds: split.parts.map((part) => part.id) });
  return { ok: true, plan: { kind: 'receipt', partyName: party.name, date: line.date, allocations: split.parts.map((part) => ({ invoiceId: part.id, amount: part.amount })) } };
}

function planPaymentMatch(state, line, intent) {
  if (sideOf(line) !== 'out') return fail('SIDE_MISMATCH', { kind: 'payment', side: 'out' });
  let first = null;
  if (intent.billId) {
    first = findById(state.purchases, intent.billId);
    if (!first) return fail('BILL_NOT_FOUND', { billId: intent.billId });
    const already = existingMovementFor(state, line, [first.id]);
    if (already) return { ok: true, plan: { kind: 'books', movement: already } };
  }
  const partyName = first ? first.partyName : String(intent.partyName || '').trim();
  if (!partyName) return fail('PARTY_REQUIRED', { kind: 'payment' });
  const namesakes = first ? [] : sameNamed(state.vendors, partyName);
  if (namesakes.length > 1) return fail('PARTY_AMBIGUOUS', { partyName, gstins: namesakes.map((item) => item.gstin || '') });
  const party = (first && partyOfDocument(state.vendors, first)) || findSupplier(state, partyName);
  if (!party) return fail('PARTY_NOT_FOUND', { partyName });
  if (!first) {
    const recorded = existingMovementFor(state, line, partyDocIds(state.purchases, party));
    if (recorded) return { ok: true, plan: { kind: 'books', movement: recorded } };
  }
  const queue = [...(first ? [first] : []), ...openBillsOf(state, party).filter((bill) => !first || bill.id !== first.id)];
  const split = allocate(queue.map((bill) => ({ id: bill.id, due: billOutstanding(bill) })), amountOf(line));
  if (split.remainder > 0.005) return fail('PAYMENT_UNALLOCATED', { partyName: party.name, remainder: split.remainder, billIds: split.parts.map((part) => part.id) });
  for (const part of split.parts) {
    const check = planPayment(state, { billId: part.id, amount: part.amount, date: line.date, mode: 'bank' });
    if (!check.ok) return check;
  }
  return { ok: true, plan: { kind: 'payment', partyName: party.name, date: line.date, allocations: split.parts.map((part) => ({ billId: part.id, amount: part.amount })) } };
}

function planExpenseMatch(state, line, intent, kind) {
  if (sideOf(line) !== 'out') return fail('SIDE_MISMATCH', { kind, side: 'out' });
  const payee = String(intent.partyName || '').trim();
  let head = String(intent.head || '').trim();
  if (kind === 'charge') head = head || CHARGES_HEAD;
  let guessed = false;
  if (!head) {
    const tag = tagExpense(state, { description: line.narration, payee });
    if (tag.source === 'default') return fail('HEAD_REQUIRED', { suggested: tag.head, why: tag.why });
    head = tag.head;
    guessed = true;
  }
  if (!headNamed(head)) return fail('UNKNOWN_HEAD', { head });
  const expense = { narration: line.narration, amount: amountOf(line), gstRate: 0, date: line.date, mode: 'bank', payee, ...(guessed ? {} : { head }) };
  const planned = planExpense(state, expense);
  if (!planned.ok) return planned;
  return { ok: true, plan: { kind, head, headName: headNamed(head).name, expense } };
}

function planInterestMatch(state, line) {
  if (sideOf(line) !== 'in') return fail('SIDE_MISMATCH', { kind: 'interest', side: 'in' });
  return { ok: true, plan: { kind: 'interest', amount: amountOf(line), date: line.date } };
}

function planBooksLink(state, line, intent) {
  const open = bookMovements(state, line.account, { linked: false });
  const wanted = String(intent.transferId || '').trim();
  if (!wanted) {
    const nearest = nearestMovement(open, line, SUGGEST_DAYS);
    if (!nearest) return fail('TRANSFER_NOT_FOUND', { hint: 'No entry in the books has this amount within twelve days.' });
    return { ok: true, plan: { kind: 'books', movement: nearest } };
  }
  const movement = open.find((item) => item.transferIds.includes(wanted) || item.docId.toUpperCase() === wanted.toUpperCase());
  if (!movement) return fail('TRANSFER_NOT_FOUND', { transferId: wanted });
  if (movement.side !== sideOf(line)) return fail('SIDE_MISMATCH', { kind: 'books', side: movement.side });
  if (Math.abs(movement.amount - amountOf(line)) > AMOUNT_TOLERANCE) return fail('AMOUNT_MISMATCH', { lineAmount: amountOf(line), bookAmount: movement.amount });
  return { ok: true, plan: { kind: 'books', movement } };
}

function planTransferLink(state, line, intent) {
  const ref = String(intent.otherAccount || '').trim();
  if (!ref) return fail('OTHER_ACCOUNT_REQUIRED');
  const other = findOwnAccount(state, ref);
  if (!other) return fail('ACCOUNT_NOT_FOUND', { account: ref });
  if (other.id === line.account) return fail('SAME_ACCOUNT', { account: other.id });
  const amount = amountOf(line);
  const wanted = String(intent.transferId || '').trim();
  const candidates = bookMovements(state, line.account, { linked: false })
    .filter((item) => item.code === 'CONTRA' && item.side === sideOf(line) && item.otherAccount === other.id && Math.abs(item.amount - amount) <= 0.005 && item.date && daysApart(item.date, line.date) <= LINK_DAYS);
  const movement = wanted
    ? candidates.find((item) => item.transferIds.includes(wanted) || item.docId.toUpperCase() === wanted.toUpperCase())
    : nearestMovement(candidates, line, LINK_DAYS);
  if (wanted && !movement) return fail('TRANSFER_NOT_FOUND', { transferId: wanted });
  if (movement) return { ok: true, plan: { kind: 'transfer', link: true, movement, other } };
  const inbound = sideOf(line) === 'in';
  const transfer = { fromAccount: inbound ? other.id : line.account, toAccount: inbound ? line.account : other.id, amount, date: line.date, reference: line.refNo || String(line.narration || '').slice(0, 60) };
  const planned = planTransfer(state, transfer);
  if (!planned.ok) return planned;
  return { ok: true, plan: { kind: 'transfer', link: false, transfer, other } };
}

export function planMatch(state, line, intent = {}) {
  if (line.status !== 'unmatched') return fail('LINE_NOT_OPEN', { lineId: line.id, status: line.status });
  const kind = String(intent.kind || '').trim().toLowerCase();
  if (!LINE_KINDS.includes(kind)) return fail('BAD_KIND', { kinds: LINE_KINDS });
  const note = String(intent.note || '').trim().slice(0, 200);
  if (kind === 'ignore') return { ok: true, plan: { kind, note } };
  if (kind === 'books') return planBooksLink(state, line, intent);
  if (kind === 'transfer') return planTransferLink(state, line, intent);
  if (isPeriodLocked(state, line.date)) return fail('PERIOD_LOCKED', { date: line.date, lockThrough: state.lockThrough });
  const planned = planPosting(state, line, intent, kind);
  if (!planned.ok) return planned;
  return relocationProblem(state, line, planned.plan) || planned;
}

function planPosting(state, line, intent, kind) {
  if (kind === 'receipt') return planReceiptMatch(state, line, intent);
  if (kind === 'payment') return planPaymentMatch(state, line, intent);
  if (kind === 'interest') return planInterestMatch(state, line);
  return planExpenseMatch(state, line, intent, kind);
}

function ledgerHasAccount(state, id) {
  return /^\d+$/.test(String(id)) && state.ledger.accounts.has(BigInt(id));
}

function relocationProblem(state, line, plan) {
  if (line.account === DEFAULT_ACCOUNT || !(RELOCATED.has(plan.kind) || plan.kind === 'interest')) return null;
  const own = findOwnAccount(state, line.account);
  if (!own || !ledgerHasAccount(state, line.account)) return fail('ACCOUNT_NOT_FOUND', { account: line.account, hint: `The line sits on account ${line.account}, which is not in the ledger. Add the account first.` });
  if (sideOf(line) !== 'out' || own.kind !== 'cash') return null;
  const balance = accountBalance(state, own.id);
  const amount = amountOf(line);
  if (balance + 0.005 >= amount) return null;
  return fail('INSUFFICIENT_CASH', { account: own.id, balance, inHand: balance, amount, hint: `${own.label} has ${plainMoney(balance)} and this line is ${plainMoney(amount)}.` });
}

function relocationWords(relocation) {
  const why = LEDGER_WORDS[relocation.error] || 'the ledger refused the move';
  return `could not be moved to ${relocation.label} (${relocation.account}): ${why} (${relocation.error}). The entry sits against Bank (${DEFAULT_ACCOUNT}) until you move it.`;
}

function relocate(state, line, docId, amount) {
  const inbound = sideOf(line) === 'in';
  const made = createTransfers(state.ledger, [{
    id: nextTransferId(state),
    debitAccountId: inbound ? Number(line.account) : Number(DEFAULT_ACCOUNT),
    creditAccountId: inbound ? Number(DEFAULT_ACCOUNT) : Number(line.account),
    amount: paise(amount),
    code: 'CONTRA',
    invoiceId: docId,
    userData: line.date,
  }]);
  if (!made[0].ok) return fail('LEDGER_REJECT', { posted: made, ledgerError: String(made[0].error || 'refused') });
  return { ok: true, transferId: made[0].id };
}

function moveToAccount(state, line, docId, amount, booking) {
  if (line.account === DEFAULT_ACCOUNT) return;
  const moved = relocate(state, line, docId, amount);
  if (!moved.ok) {
    booking.failures.push(moved.ledgerError);
    return;
  }
  booking.transferIds.push(moved.transferId);
  booking.posted.push({ transferId: moved.transferId, kind: 'transfer', id: docId });
}

function postAllocations(state, line, plan, booking) {
  for (const part of plan.allocations) {
    const docId = part.invoiceId || part.billId;
    const made = part.invoiceId
      ? recordReceipt(state, { invoiceId: part.invoiceId, amount: part.amount, date: plan.date, mode: 'bank' })
      : recordPayment(state, { billId: part.billId, amount: part.amount, date: plan.date, mode: 'bank' });
    if (!made.ok) return made;
    booking.transferIds.push(made.posted[0].id);
    booking.posted.push({ transferId: made.posted[0].id, kind: plan.kind, id: docId });
    moveToAccount(state, line, docId, part.amount, booking);
  }
  return { ok: true };
}

function postExpenseLine(state, line, plan, booking) {
  const made = postExpense(state, plan.expense);
  if (!made.ok) return made;
  booking.transferIds.push(...made.expense.transferIds.map(String));
  booking.posted.push({ transferId: made.expense.transferIds[0], kind: plan.kind, id: made.expense.id });
  moveToAccount(state, line, made.expense.id, plan.expense.amount, booking);
  return { ok: true, id: made.expense.id };
}

function postInterest(state, line, plan, booking) {
  ensureInterestIncomeAccount(state);
  const made = createTransfers(state.ledger, [{
    id: nextTransferId(state),
    debitAccountId: Number(line.account),
    creditAccountId: INTEREST_INCOME,
    amount: paise(plan.amount),
    code: 'INTEREST',
    invoiceId: line.id,
    userData: plan.date,
  }]);
  if (!made[0].ok) return fail('LEDGER_REJECT', { posted: made });
  booking.transferIds.push(made[0].id);
  booking.posted.push({ transferId: made[0].id, kind: 'interest', id: line.id });
  return { ok: true, id: line.id };
}

export function applyMatch(state, line, plan, { ruleId = null, note = '' } = {}) {
  const posted = [];
  const said = note || plan.note || '';
  if (plan.kind === 'ignore') {
    line.status = 'ignored';
    line.match = { kind: 'ignore', id: null, transferIds: [], ruleId, note: said };
    return { ok: true, line, posted };
  }
  if (plan.kind === 'books' || (plan.kind === 'transfer' && plan.link)) {
    linkMovement(line, plan.movement, plan.kind, { ruleId, note: said });
    return { ok: true, line, posted };
  }
  const booking = { posted, transferIds: [], failures: [] };
  let id = null;
  if (plan.kind === 'transfer') {
    const made = recordTransfer(state, plan.transfer);
    if (!made.ok) return made;
    id = made.transfer.id;
    booking.transferIds.push(made.transfer.transferId);
    posted.push({ transferId: made.transfer.transferId, kind: 'transfer', id });
  } else if (plan.kind === 'receipt' || plan.kind === 'payment') {
    const made = postAllocations(state, line, plan, booking);
    if (!made.ok) return made;
    id = plan.allocations.map((part) => part.invoiceId || part.billId).join(', ');
  } else if (plan.kind === 'interest') {
    const made = postInterest(state, line, plan, booking);
    if (!made.ok) return made;
    id = made.id;
  } else {
    const made = postExpenseLine(state, line, plan, booking);
    if (!made.ok) return made;
    id = made.id;
  }
  line.status = 'booked';
  const failed = [...new Set(booking.failures)].join(', ');
  line.match = { kind: plan.kind, id, transferIds: booking.transferIds, ruleId, note: failed ? [said, `relocationFailed: ${failed}`].filter(Boolean).join(' ') : said };
  if (!failed) return { ok: true, line, posted };
  const relocation = { account: line.account, label: findOwnAccount(state, line.account)?.label || line.account, error: failed };
  return { ok: true, line, posted, relocation, warning: `booked, but ${relocationWords(relocation)}` };
}

function longestRun(text) {
  const runs = String(text || '').toUpperCase().match(/[A-Z]{6,}/g) || [];
  return runs.sort((a, b) => b.length - a.length)[0] || '';
}

function ruleTail(then, otherLabel) {
  switch (then.kind) {
    case 'receipt': return `are receipts from ${then.partyName}`;
    case 'payment': return `are payments to ${then.partyName}`;
    case 'expense': return `are expenses under ${then.head} ${headNamed(then.head)?.name || ''}`.trim();
    case 'charge': return 'are bank charges';
    case 'interest': return 'are interest income';
    default: return `are transfers with ${otherLabel || then.otherAccount}`;
  }
}

export function ruleFromMatch(line, plan, intent = {}) {
  if (plan.kind === 'ignore' || plan.link || !RULE_KINDS.includes(plan.kind)) {
    return { spec: null, contains: '', tail: '', words: `No rule is saved: ${plan.kind === 'ignore' ? 'an ignored line' : 'a line matched to the books'} is not remembered as a rule` };
  }
  const partyName = plan.partyName || '';
  const narration = String(line.narration || '').toUpperCase();
  const contains = partyName && narration.includes(partyName.toUpperCase()) ? partyName.toUpperCase() : longestRun(line.narration);
  if (!contains) return { spec: null, contains: '', tail: '', words: 'No rule is saved: there is nothing in this narration to recognise it by' };
  const then = { kind: plan.kind, partyName, head: plan.head || '', otherAccount: plan.other?.id || '', note: String(intent.note || '').trim() };
  const tail = ruleTail(then, plan.other?.label);
  return { spec: { side: sideOf(line), contains, then }, contains, tail, words: `A rule is saved: lines containing '${contains}' ${tail}` };
}

export function matchBankLine(state, args = {}) {
  const line = findBankLine(state, args.lineId);
  if (!line) return fail('LINE_NOT_FOUND', { lineId: args.lineId });
  const planned = planMatch(state, line, args);
  if (!planned.ok) return planned;
  const result = applyMatch(state, line, planned.plan, { note: args.note });
  if (!result.ok) return result;
  if (args.remember === true) {
    const remembered = ruleFromMatch(line, planned.plan, args);
    const made = remembered.spec ? createBankRule(state, remembered.spec) : null;
    if (made?.ok) {
      result.rule = made.rule;
      result.ruleWords = `Saved ${made.rule.id}: lines containing '${remembered.contains}' ${remembered.tail}.`;
    } else {
      result.ruleWords = made ? `No rule is saved: the rule could not be made (${made.error}).` : `${remembered.words}.`;
    }
  }
  return result;
}

export function unmatchBankLine(state, { lineId } = {}) {
  const line = findBankLine(state, lineId);
  if (!line) return fail('LINE_NOT_FOUND', { lineId });
  if (line.status === 'unmatched') return fail('LINE_NOT_LINKED', { lineId: line.id });
  if (line.status === 'booked') return fail('BOOKED_LINE', { lineId: line.id, kind: line.match?.kind || '', ids: docIdsOf(line), hint: 'The entries it made stay in the books; reverse them first.' });
  const was = line.match;
  line.status = 'unmatched';
  line.match = null;
  return { ok: true, line, was };
}

export function looksLikeCharge(line) {
  return sideOf(line) === 'out' && categoryOf(line) === 'finance_cost' && !/\bEMI\b|\bLOAN\b/i.test(String(line.narration || ''));
}

export function looksLikeInterest(line) {
  return sideOf(line) === 'in' && categoryOf(line) === 'interest_income' && /\bINT\b|INTEREST/i.test(String(line.narration || ''));
}

function chargePlanFor(state, line) {
  if (looksLikeCharge(line)) return planMatch(state, line, { kind: 'charge' });
  if (looksLikeInterest(line)) return planMatch(state, line, { kind: 'interest' });
  return fail('NOT_A_CHARGE');
}

export function planBankCharges(state, args = {}) {
  const account = accountFor(state, args.account);
  if (!account) return fail('ACCOUNT_NOT_FOUND', { account: args.account });
  const from = args.from ? isoDate(args.from) : '';
  const to = args.to ? isoDate(args.to) : '';
  if (from === null || to === null) return fail('INVALID_DATE', { from: args.from, to: args.to });
  let lines;
  if (Array.isArray(args.lineIds) && args.lineIds.length) {
    lines = [];
    for (const id of args.lineIds) {
      const line = findBankLine(state, id);
      if (!line) return fail('LINE_NOT_FOUND', { lineId: id });
      lines.push(line);
    }
  } else {
    lines = linesOf(state).filter((line) => line.account === account.id && line.status === 'unmatched' && (!from || line.date >= from) && (!to || line.date <= to));
  }
  const items = [];
  const skipped = [];
  for (const line of lines) {
    if (line.status !== 'unmatched') {
      skipped.push({ lineId: line.id, reason: 'LINE_NOT_OPEN' });
      continue;
    }
    const planned = chargePlanFor(state, line);
    if (!planned.ok) skipped.push({ lineId: line.id, reason: planned.error });
    else items.push({ line, plan: planned.plan });
  }
  return { ok: true, plan: { account, items, skipped } };
}

export function bookBankCharges(state, args = {}) {
  const planned = planBankCharges(state, args);
  if (!planned.ok) return planned;
  const { items, skipped } = planned.plan;
  const booked = [];
  const total = { charges: 0, interest: 0 };
  for (const { line, plan } of items) {
    const applied = applyMatch(state, line, plan, { note: 'Booked with the bank charges.' });
    if (!applied.ok) {
      skipped.push({ lineId: line.id, reason: applied.error });
      continue;
    }
    const amount = amountOf(line);
    booked.push({ lineId: line.id, kind: plan.kind, id: line.match.id, amount, ...(applied.warning ? { warning: applied.warning } : {}) });
    if (plan.kind === 'charge') total.charges = round2(total.charges + amount);
    else total.interest = round2(total.interest + amount);
  }
  return { ok: true, booked, skipped, total };
}

function nameWords(name) {
  return String(name || '').toUpperCase().split(/[^A-Z]+/).filter((word) => word.length >= 4 && !NAME_FILLERS.has(word));
}

function namedIn(narration, name) {
  const words = nameWords(name);
  return words.length > 0 && words.every((word) => narration.includes(word));
}

function partySuggestions(state, line, money) {
  const narration = String(line.narration || '').toUpperCase();
  const out = [];
  if (sideOf(line) === 'in') {
    for (const party of state.parties || []) {
      if (!namedIn(narration, party.name)) continue;
      const open = openInvoicesOf(state, party);
      if (!open.length) continue;
      const due = round2(open.reduce((sum, inv) => sum + outstandingOf(state, inv), 0));
      out.push({ kind: 'receipt', partyName: party.name, invoiceIds: open.map((inv) => inv.id), amount: due, why: `${party.name} is named in the narration and has ${open.length} open ${open.length === 1 ? 'invoice' : 'invoices'} worth ${money(due)}.` });
    }
  } else {
    for (const vendor of state.vendors || []) {
      if (!namedIn(narration, vendor.name)) continue;
      const open = openBillsOf(state, vendor);
      if (!open.length) continue;
      const due = round2(open.reduce((sum, bill) => sum + billOutstanding(bill), 0));
      out.push({ kind: 'payment', partyName: vendor.name, billIds: open.map((bill) => bill.id), amount: due, why: `${vendor.name} is named in the narration and has ${open.length} open ${open.length === 1 ? 'bill' : 'bills'} worth ${money(due)}.` });
    }
  }
  return out;
}

function hintSuggestions(line) {
  if (looksLikeCharge(line)) return [{ kind: 'charge', head: CHARGES_HEAD, why: 'The narration reads like a bank charge.' }];
  if (looksLikeInterest(line)) return [{ kind: 'interest', why: 'The narration reads like interest credited by the bank.' }];
  if (categoryOf(line) === 'transfer') return [{ kind: 'transfer', why: 'The narration reads like a move between your own accounts.' }];
  return [];
}

export function suggestionsFor(state, line, open, money) {
  const side = sideOf(line);
  const amount = amountOf(line);
  const books = open
    .filter((movement) => movement.side === side && movement.date && Math.abs(movement.amount - amount) <= AMOUNT_TOLERANCE && daysApart(movement.date, line.date) <= SUGGEST_DAYS)
    .sort((a, b) => daysApart(a.date, line.date) - daysApart(b.date, line.date))
    .map((movement) => ({ kind: 'books', transferId: movement.transferId, docId: movement.docId, docKind: movement.docKind, party: movement.party, amount: movement.amount, date: movement.date, why: `${docWords(movement)} of ${money(movement.amount)} on ${movement.date} is in the books and not on the statement yet.` }));
  return [...books, ...partySuggestions(state, line, money), ...hintSuggestions(line)].slice(0, MAX_SUGGESTIONS);
}

function plainMoney(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function reconciledThrough(lines) {
  const dates = [...new Set(lines.map((line) => line.date))].sort();
  const firstOpen = lines.filter((line) => line.status === 'unmatched').map((line) => line.date).sort()[0] || null;
  if (!firstOpen) return dates.at(-1) || null;
  return dates.filter((date) => date < firstOpen).at(-1) || null;
}

function booksBalanceOn(state, account, through) {
  const acct = BigInt(account);
  let net = 0n;
  for (const row of state.ledger.transfers) {
    if (!row.posted || row.voided) continue;
    const date = transferDate(row);
    if (through && date && date > through) continue;
    if (row.debitAccountId === acct) net += row.amount;
    else if (row.creditAccountId === acct) net -= row.amount;
  }
  return round2(rupees(net));
}

function lineView(line, suggestions) {
  return {
    id: line.id,
    date: line.date,
    narration: line.narration,
    refNo: line.refNo || '',
    in: line.in || 0,
    out: line.out || 0,
    balance: line.balance == null ? null : line.balance,
    status: line.status,
    category: line.category || '',
    tieBreak: Boolean(line.tieBreak),
    match: line.match,
    suggestions,
  };
}

export function bankReconciliation(state, args = {}, { money = plainMoney } = {}) {
  const account = accountFor(state, args.account);
  if (!account) return fail('ACCOUNT_NOT_FOUND', { account: args.account });
  const status = String(args.status || 'all').trim().toLowerCase();
  if (status !== 'all' && !LINE_STATUSES.includes(status)) return fail('BAD_STATUS', { statuses: ['all', ...LINE_STATUSES] });
  const all = linesOf(state).filter((line) => line.account === account.id);
  const lastDate = all.map((line) => line.date).sort().at(-1) || localToday();
  const to = args.to ? isoDate(args.to) : lastDate;
  const from = args.from ? isoDate(args.from) : plusDays(to || lastDate, -DEFAULT_WINDOW_DAYS);
  if (!from || !to) return fail('INVALID_DATE', { from: args.from, to: args.to });
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(args.limit) || DEFAULT_LIMIT));
  const movements = bookMovements(state, account.id, {});
  const open = movements.filter((movement) => !movement.linked);
  const window = all
    .filter((line) => line.date >= from && line.date <= to && (status === 'all' || line.status === status))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, limit);
  const lines = window.map((line) => lineView(line, line.status === 'unmatched' ? suggestionsFor(state, line, open, money) : []));
  const books = open
    .filter((movement) => !movement.date || (movement.date >= from && movement.date <= to))
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((movement) => ({ transferId: movement.transferId, date: movement.date, docKind: movement.docKind, docId: movement.docId, party: movement.party, in: movement.in, out: movement.out }));
  const withBalance = all.filter((line) => line.balance != null).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const latest = withBalance.at(-1) || null;
  const statementOn = latest ? latest.date : null;
  const statementBalance = latest ? latest.balance : null;
  const booksBalance = booksBalanceOn(state, account.id, statementOn || to);
  const counts = { unmatched: 0, matched: 0, booked: 0, ignored: 0 };
  let unmatchedIn = 0;
  let unmatchedOut = 0;
  for (const line of all) {
    counts[line.status] = (counts[line.status] || 0) + 1;
    if (line.status === 'unmatched') {
      unmatchedIn = round2(unmatchedIn + Number(line.in || 0));
      unmatchedOut = round2(unmatchedOut + Number(line.out || 0));
    }
  }
  const balances = ledgerBalances(state);
  return {
    ok: true,
    data: {
      account: { id: account.id, label: account.label, kind: account.kind },
      from,
      to,
      lines,
      books,
      totals: {
        statementBalance,
        statementOn,
        booksBalance,
        difference: statementBalance == null ? null : round2(statementBalance - booksBalance),
        lines: counts,
        unmatchedIn,
        unmatchedOut,
      },
      reconciledThrough: reconciledThrough(all),
      rules: rulesOf(state).slice().sort((a, b) => a.id.localeCompare(b.id)),
      accounts: ownAccounts(state).map((item) => ({ id: item.id, label: item.label, kind: item.kind, balance: balances.get(item.id) || 0 })),
    },
  };
}

export function suggestionWords(suggestion, money = plainMoney) {
  if (suggestion.kind === 'books') return `could be ${docWords(suggestion).toLowerCase()} of ${money(suggestion.amount)} on ${suggestion.date}`;
  if (suggestion.kind === 'receipt') return `could be a receipt from ${suggestion.partyName} (${suggestion.invoiceIds.join(', ')} open)`;
  if (suggestion.kind === 'payment') return `could be a payment to ${suggestion.partyName} (${suggestion.billIds.join(', ')} open)`;
  if (suggestion.kind === 'charge') return 'reads like a bank charge';
  if (suggestion.kind === 'interest') return 'reads like interest from the bank';
  return 'reads like a move between your own accounts';
}

function lineWords(line, money) {
  const amount = line.in ? `${money(line.in)} in` : `${money(line.out)} out`;
  return `${line.id} ${line.date} "${String(line.narration || '').slice(0, 40)}" ${amount}`;
}

export function reconciliationWords(data, money = plainMoney) {
  const { account, totals } = data;
  const open = totals.lines.unmatched || 0;
  const total = Object.values(totals.lines).reduce((sum, n) => sum + n, 0);
  const balance = totals.statementOn
    ? `statement ${money(totals.statementBalance)} on ${totals.statementOn}, books ${money(totals.booksBalance)}, difference ${money(totals.difference)}`
    : `books ${money(totals.booksBalance)}, no statement balance yet`;
  const head = `${account.label} (${account.id}): ${balance}.`;
  const counts = total
    ? `${total} ${total === 1 ? 'line' : 'lines'}: ${totals.lines.matched} matched to the books, ${totals.lines.booked} booked, ${totals.lines.ignored} ignored, ${open} not matched yet${open ? ` (${money(totals.unmatchedIn)} in, ${money(totals.unmatchedOut)} out)` : ''}.`
    : 'No statement lines yet. Import a bank statement to start.';
  const through = total ? (data.reconciledThrough ? `Reconciled through ${data.reconciledThrough}.` : 'Nothing reconciled yet.') : '';
  const books = data.books.length ? `${data.books.length} ${data.books.length === 1 ? 'entry' : 'entries'} in the books ${data.books.length === 1 ? 'is' : 'are'} not on the statement yet.` : '';
  const shown = data.lines.filter((line) => line.status === 'unmatched').slice(0, 8)
    .map((line) => `· ${lineWords(line, money)}${line.suggestions[0] ? `: ${suggestionWords(line.suggestions[0], money)}` : ''}`);
  return [head, counts, through, books, ...shown].filter(Boolean).join('\n');
}

function kindWords(line, posted) {
  const ids = [...new Set(posted.filter((item) => item.kind === line.match.kind).map((item) => item.id))].join(', ');
  switch (line.match.kind) {
    case 'receipt': return `a receipt against ${ids}`;
    case 'payment': return `a payment against ${ids}`;
    case 'charge': return `bank charges (${ids})`;
    case 'expense': return `an expense (${ids})`;
    case 'interest': return 'interest income';
    case 'transfer': return `transfer ${ids}`;
    default: return line.match.kind;
  }
}

export function matchWords(result, money = plainMoney) {
  const { line } = result;
  const amount = line.in ? `${money(line.in)} in` : `${money(line.out)} out`;
  let text;
  if (line.status === 'ignored') text = `${line.id} (${amount}) ignored${line.match.note ? `: ${line.match.note}` : ''}.`;
  else if (line.status === 'matched') text = `${line.id} (${amount}) matched to ${line.match.id} already in the books. Nothing new was posted.`;
  else text = `${line.id} (${amount}) booked as ${kindWords(line, result.posted)}${result.relocation ? `, but ${relocationWords(result.relocation)}` : '.'}`;
  if (result.ruleWords) text += ` ${result.ruleWords}`;
  return text;
}

export function unmatchWords(result) {
  return `${result.line.id} is open again. Nothing in the books changed.`;
}

export function chargesWords(result, money = plainMoney) {
  if (!result.booked.length) return `No bank charges or interest to book${result.skipped.length ? ` (${result.skipped.length} ${result.skipped.length === 1 ? 'line' : 'lines'} skipped)` : ''}.`;
  const parts = [];
  if (result.total.charges) parts.push(`${money(result.total.charges)} bank charges`);
  if (result.total.interest) parts.push(`${money(result.total.interest)} interest`);
  const warned = result.booked.filter((row) => row.warning).map((row) => `${row.lineId} ${row.warning}`);
  return `Booked ${result.booked.length} ${result.booked.length === 1 ? 'line' : 'lines'}: ${parts.join(' and ')}.${result.skipped.length ? ` ${result.skipped.length} skipped.` : ''}${warned.length ? ` ${warned.join(' ')}` : ''}`;
}

export function accountWords(result) {
  const { account } = result;
  const extra = [account.kind, account.maskedNumber, account.ifsc].filter(Boolean).join(', ');
  return `${result.created ? 'Added' : 'Updated'} ${account.label} (${account.id}${extra ? `, ${extra}` : ''}).`;
}

export function accountsWords(data, money = plainMoney) {
  return ['Your accounts:', ...data.accounts.map((account) => `· ${account.id} ${account.label} (${account.kind}${account.maskedNumber ? ` ${account.maskedNumber}` : ''}): ${money(account.balance)}`)].join('\n');
}

export function transferWords(result, money = plainMoney) {
  const { transfer } = result;
  return `Moved ${money(transfer.amount)} from ${result.from.label} to ${result.to.label} on ${transfer.date} (${transfer.id}).${transfer.reference ? ` Reference: ${transfer.reference}.` : ''}`;
}
