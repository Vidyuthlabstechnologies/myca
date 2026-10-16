const HEADER = ['Date', 'Narration', 'Withdrawal', 'Deposit', 'Balance', 'Ref No'];
const MAX_DEPTH = 8;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function looksLikeAaJson(text) {
  const trimmed = String(text || '').trim();
  return (trimmed.startsWith('{') || trimmed.startsWith('[')) && /"transactions?"/i.test(trimmed);
}

function pick(record, ...names) {
  for (const name of names) {
    if (record && record[name] != null && record[name] !== '') return record[name];
    const lower = Object.keys(record || {}).find((key) => key.toLowerCase() === name.toLowerCase());
    if (lower && record[lower] != null && record[lower] !== '') return record[lower];
  }
  return undefined;
}

function transactionList(account) {
  const holder = pick(account, 'Transactions', 'transactions');
  if (Array.isArray(holder)) return holder;
  if (holder && typeof holder === 'object') {
    const list = pick(holder, 'Transaction', 'transaction');
    if (Array.isArray(list)) return list;
  }
  return null;
}

function findAccounts(node, depth, found) {
  if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return;
  if (Array.isArray(node)) {
    for (const item of node) findAccounts(item, depth + 1, found);
    return;
  }
  if (transactionList(node)) {
    found.push(node);
    return;
  }
  for (const value of Object.values(node)) findAccounts(value, depth + 1, found);
}

function dateOf(txn) {
  const value = String(pick(txn, 'valueDate', 'transactionTimestamp', 'date') || '').trim();
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = value.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return '';
}

function amountOf(value) {
  const text = String(value ?? '').replace(/[,\s]/g, '');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

function rowOf(txn) {
  const date = dateOf(txn);
  const amount = amountOf(pick(txn, 'amount'));
  if (!date || amount == null) return null;
  const type = String(pick(txn, 'type') || '').toUpperCase();
  const balance = amountOf(pick(txn, 'currentBalance', 'balance'));
  const narration = String(pick(txn, 'narration', 'description', 'remarks') || '').trim();
  const mode = String(pick(txn, 'mode') || '').trim();
  const ref = String(pick(txn, 'reference', 'txnId', 'transactionId') || '').trim();
  const text = narration || (mode ? `${mode} transaction` : 'Account Aggregator transaction');
  return [date, text, type === 'DEBIT' ? amount.toFixed(2) : '', type === 'CREDIT' ? amount.toFixed(2) : '', balance == null ? '' : balance.toFixed(2), ref];
}

export function parseAaFiData(text) {
  let json;
  try {
    json = JSON.parse(String(text || ''));
  } catch {
    return fail('NOT_JSON', { hint: 'The Account Aggregator file must be the decrypted FI data JSON (the account with its Transactions).' });
  }
  const accounts = [];
  findAccounts(json, 0, accounts);
  if (!accounts.length) return fail('NO_TRANSACTIONS', { hint: 'No account with a Transactions list was found in the JSON.' });
  const rows = [HEADER];
  const summary = [];
  let skipped = 0;
  for (const account of accounts) {
    const list = transactionList(account);
    let kept = 0;
    for (const txn of list) {
      const row = rowOf(txn);
      if (!row) { skipped += 1; continue; }
      rows.push(row);
      kept += 1;
    }
    const profile = pick(account, 'Summary', 'summary') || {};
    summary.push({
      maskedAccNumber: String(pick(account, 'maskedAccNumber', 'maskedAccountNumber') || pick(profile, 'maskedAccNumber') || ''),
      fipId: String(pick(account, 'fipId', 'fipID', 'FIP') || ''),
      accountType: String(pick(profile, 'type', 'accountType') || pick(account, 'type') || ''),
      currentBalance: amountOf(pick(profile, 'currentBalance')),
      transactions: kept,
    });
  }
  if (rows.length < 2) return fail('NO_TRANSACTIONS', { hint: 'Every transaction was missing a date or an amount.' });
  return { ok: true, rows, accounts: summary, skipped };
}

export function aaBankFeed(args = {}) {
  const content = String(args.content || '');
  if (args.type !== 'aa' && !looksLikeAaJson(content)) return null;
  const parsed = parseAaFiData(content);
  if (!parsed.ok) return parsed;
  return { ok: true, feed: { type: 'matrix', rows: parsed.rows }, accounts: parsed.accounts, skipped: parsed.skipped };
}
