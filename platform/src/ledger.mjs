const LEDGER_ID = 1n;
const CHAIN_VERSION = 2;
const LEGACY_GAP_BUDGET = 200000;
const LEGACY_TOTAL_BUDGET = 5000000;

export const ACCOUNT_FLAGS = {
  LINKED_EVENT: 0,
  DEBITS_MUST_NOT_EXCEED_CREDITS: 1,
  CREDITS_MUST_NOT_EXCEED_DEBITS: 2,
  HISTORY: 4,
};

export const TRANSFER_FLAGS = {
  PENDING: 1,
  POST_PENDING: 2,
  VOID_PENDING: 4,
  LINKED: 8,
};

const RESOLVE_FLAGS = TRANSFER_FLAGS.POST_PENDING | TRANSFER_FLAGS.VOID_PENDING;
const LEGACY_POST_FLAGS = [2, 10, 3, 6, 11, 14, 7, 15];
const LEGACY_VOID_FLAGS = [4, 12, 5, 13];
const BALANCE_FIELDS = ['debitsPosted', 'creditsPosted', 'debitsPending', 'creditsPending'];
const DECIMAL = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(str) {
  let c = 0xffffffff;
  for (let i = 0; i < str.length; i++) {
    c ^= str.charCodeAt(i);
    c = CRC_TABLE[c & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function decimalText(value) {
  if (typeof value === 'string') {
    const text = value.trim();
    if (/\d/.test(text) && DECIMAL.test(text)) return text;
  }
  return String(Number(value));
}

export function paise(rupees) {
  if (typeof rupees === 'bigint') return rupees * 100n;
  if (!Number.isFinite(Number(rupees))) throw new RangeError(`paise: ${String(rupees)} is not a finite amount`);
  const [, sign, int, frac = '', exp = '0'] = DECIMAL.exec(decimalText(rupees));
  const digits = int + frac;
  const point = int.length + Number(exp) + 2;
  const whole = point > 0 ? digits.slice(0, point).padEnd(point, '0') : '0';
  const roundUp = point >= 0 && Number(digits[point] || 0) >= 5;
  const magnitude = BigInt(whole || '0') + (roundUp ? 1n : 0n);
  return sign === '-' ? -magnitude : magnitude;
}

export function rupees(p) {
  return Number(p) / 100;
}

export function emptyLedger() {
  return {
    accounts: new Map(),
    transfers: [],
    byId: new Map(),
    legacyResolves: new Map(),
    clock: 0n,
    lastChecksum: 0,
  };
}

function toBigInt(value) {
  if (!['bigint', 'number', 'string'].includes(typeof value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

const jsonSafe = (_, v) => (typeof v === 'bigint' ? v.toString() : v);
const canonical = (v) => JSON.stringify(v ?? null, jsonSafe);

export function hydrate(snapshot) {
  const l = emptyLedger();
  if (!snapshot) return l;
  l.clock = BigInt(snapshot.clock || 0);
  l.lastChecksum = snapshot.lastChecksum || 0;
  for (const a of snapshot.accounts || []) {
    l.accounts.set(BigInt(a.id), {
      id: BigInt(a.id),
      ledger: a.ledger,
      code: a.code,
      name: a.name,
      type: a.type,
      gstin: a.gstin || '',
      flags: a.flags,
      userData: a.userData || 0,
      timestamp: BigInt(a.timestamp || 0),
      debitsPending: BigInt(a.debitsPending),
      creditsPending: BigInt(a.creditsPending),
      debitsPosted: BigInt(a.debitsPosted),
      creditsPosted: BigInt(a.creditsPosted),
    });
  }
  for (const t of snapshot.transfers || []) {
    const row = {
      ...t,
      id: BigInt(t.id),
      debitAccountId: BigInt(t.debitAccountId),
      creditAccountId: BigInt(t.creditAccountId),
      amount: BigInt(t.amount),
      flags: t.flags || 0,
      pendingId: t.pendingId == null || t.pendingId === '' ? null : BigInt(t.pendingId),
      userData: t.userData || 0,
      invoiceId: t.invoiceId || null,
      code: t.code || '',
      timestamp: BigInt(t.timestamp),
      resolvedBy: t.resolvedBy == null ? null : String(t.resolvedBy),
      chainVersion: t.chainVersion || 1,
    };
    l.transfers.push(row);
    l.byId.set(row.id.toString(), row);
  }
  for (const row of l.transfers) {
    if (!row.resolvedBy || l.byId.has(row.resolvedBy)) continue;
    const known = l.legacyResolves.get(row.resolvedBy) || [];
    known.push(row);
    l.legacyResolves.set(row.resolvedBy, known);
  }
  return l;
}

export function freeze(ledger) {
  return {
    clock: ledger.clock.toString(),
    lastChecksum: ledger.lastChecksum,
    accounts: [...ledger.accounts.values()].map((a) => ({
      id: a.id.toString(),
      ledger: a.ledger,
      code: a.code,
      name: a.name,
      type: a.type,
      gstin: a.gstin || '',
      flags: a.flags,
      userData: a.userData || 0,
      timestamp: a.timestamp.toString(),
      debitsPending: a.debitsPending.toString(),
      creditsPending: a.creditsPending.toString(),
      debitsPosted: a.debitsPosted.toString(),
      creditsPosted: a.creditsPosted.toString(),
    })),
    transfers: ledger.transfers.map((t) => ({
      id: t.id.toString(),
      debitAccountId: t.debitAccountId.toString(),
      creditAccountId: t.creditAccountId.toString(),
      amount: t.amount.toString(),
      flags: t.flags,
      pendingId: t.pendingId == null ? null : t.pendingId.toString(),
      pending: t.pending,
      posted: t.posted,
      voided: t.voided,
      userData: t.userData || 0,
      invoiceId: t.invoiceId || null,
      code: t.code || '',
      timestamp: t.timestamp.toString(),
      checksum: t.checksum,
      prevChecksum: t.prevChecksum,
      resolvedBy: t.resolvedBy || null,
      chainVersion: t.chainVersion || 1,
    })),
  };
}

function tick(ledger) {
  ledger.clock += 1n;
  return ledger.clock;
}

function accountBalance(a) {
  return {
    debitsPosted: a.debitsPosted,
    creditsPosted: a.creditsPosted,
    debitsPending: a.debitsPending,
    creditsPending: a.creditsPending,
    posted: a.debitsPosted - a.creditsPosted,
    pending: a.debitsPending - a.creditsPending,
  };
}

export function lookupAccounts(ledger, ids) {
  return ids.map((id) => {
    const a = ledger.accounts.get(BigInt(id));
    if (!a) return { id: String(id), found: false };
    return { ...a, id: a.id.toString(), found: true, ...Object.fromEntries(Object.entries(accountBalance(a)).map(([k, v]) => [k, v.toString()])) };
  });
}

export function listAccounts(ledger) {
  return [...ledger.accounts.values()].sort((a, b) => a.code.localeCompare(b.code)).map((a) => {
    const bal = accountBalance(a);
    return {
      id: a.id.toString(),
      code: a.code,
      name: a.name,
      type: a.type,
      gstin: a.gstin || '',
      timestamp: a.timestamp.toString(),
      flags: a.flags,
      debitsPosted: rupees(bal.debitsPosted),
      creditsPosted: rupees(bal.creditsPosted),
      posted: rupees(bal.posted),
      pending: rupees(bal.pending),
    };
  });
}

export function createAccounts(ledger, accounts) {
  const results = [];
  for (const spec of accounts) {
    const id = BigInt(spec.id);
    if (ledger.accounts.has(id)) {
      results.push({ id: id.toString(), ok: true, exists: true });
      continue;
    }
    ledger.accounts.set(id, {
      id,
      ledger: Number(spec.ledger || LEDGER_ID),
      code: spec.code,
      name: spec.name,
      type: spec.type,
      gstin: spec.gstin || '',
      flags: spec.flags || 0,
      userData: spec.userData || 0,
      timestamp: tick(ledger),
      debitsPending: 0n,
      creditsPending: 0n,
      debitsPosted: 0n,
      creditsPosted: 0n,
    });
    results.push({ id: id.toString(), ok: true, exists: false });
  }
  return results;
}

function sameExtras(spec, row) {
  return canonical(spec.code || '') === canonical(row.code || '')
    && canonical(spec.invoiceId || null) === canonical(row.invoiceId || null)
    && canonical(spec.userData || 0) === canonical(row.userData || 0);
}

function samePayload(spec, row) {
  const flags = spec.flags || 0;
  if (flags !== row.flags || !sameExtras(spec, row)) return false;
  if (flags & RESOLVE_FLAGS) return row.pendingId != null && toBigInt(spec.pendingId) === row.pendingId;
  return row.pendingId == null
    && toBigInt(spec.debitAccountId) === row.debitAccountId
    && toBigInt(spec.creditAccountId) === row.creditAccountId
    && toBigInt(spec.amount) === row.amount;
}

function sameLegacyResolve(spec, pendingRow) {
  const flags = spec.flags || 0;
  if (!(flags & RESOLVE_FLAGS) || toBigInt(spec.pendingId) !== pendingRow.id) return false;
  return Boolean(flags & TRANSFER_FLAGS.POST_PENDING ? pendingRow.posted : pendingRow.voided);
}

function view(batch, account) {
  const staged = batch.overlay.get(account.id);
  if (staged) return { ...staged };
  return {
    debitsPosted: account.debitsPosted,
    creditsPosted: account.creditsPosted,
    debitsPending: account.debitsPending,
    creditsPending: account.creditsPending,
  };
}

function project(batch, debit, credit, change) {
  const d = view(batch, debit);
  change(d, 'debits');
  const c = debit === credit ? d : view(batch, credit);
  change(c, 'credits');
  return { d, c };
}

function commit(batch, debit, credit, { d, c }) {
  batch.overlay.set(debit.id, d);
  batch.overlay.set(credit.id, c);
}

function limitError(debit, d, credit, c) {
  if ((debit.flags & ACCOUNT_FLAGS.DEBITS_MUST_NOT_EXCEED_CREDITS) && d.debitsPosted + d.debitsPending > d.creditsPosted) {
    return 'exceeds_credits';
  }
  if ((credit.flags & ACCOUNT_FLAGS.CREDITS_MUST_NOT_EXCEED_DEBITS) && c.creditsPosted + c.creditsPending > c.debitsPosted) {
    return 'exceeds_debits';
  }
  return null;
}

function admitResolve(ledger, spec, id, flags, batch) {
  const pendingId = toBigInt(spec.pendingId);
  const pending = pendingId === null ? null : ledger.byId.get(pendingId.toString());
  if (!pending) return { error: 'pending_not_found', resolve: true };
  if (pending.pendingId != null || !(pending.flags & TRANSFER_FLAGS.PENDING)) return { error: 'pending_not_pending', resolve: true };
  const outcome = pending.posted ? 'posted' : pending.voided ? 'voided' : batch.claimed.get(pending.id);
  if (outcome) return { error: `pending_already_${outcome}`, resolve: true };
  const debit = ledger.accounts.get(pending.debitAccountId);
  const credit = ledger.accounts.get(pending.creditAccountId);
  if (!debit || !credit) return { error: 'account_not_found', resolve: true };
  const post = Boolean(flags & TRANSFER_FLAGS.POST_PENDING);
  const amount = pending.amount;
  const next = project(batch, debit, credit, (b, side) => {
    b[`${side}Pending`] -= amount;
    if (post) b[`${side}Posted`] += amount;
  });
  commit(batch, debit, credit, next);
  batch.claimed.set(pending.id, post ? 'posted' : 'voided');
  return { item: { kind: 'resolve', spec, id, flags, pending, post } };
}

function admitCreate(ledger, spec, id, flags, batch) {
  const debit = ledger.accounts.get(toBigInt(spec.debitAccountId));
  const credit = ledger.accounts.get(toBigInt(spec.creditAccountId));
  if (!debit || !credit) return { error: 'account_not_found' };
  const amount = toBigInt(spec.amount);
  if (amount === null) return { error: 'amount_invalid' };
  if (amount <= 0n) return { error: 'amount_must_be_positive' };
  const pending = Boolean(flags & TRANSFER_FLAGS.PENDING);
  const bucket = pending ? 'Pending' : 'Posted';
  const next = project(batch, debit, credit, (b, side) => {
    b[`${side}${bucket}`] += amount;
  });
  const error = limitError(debit, next.d, credit, next.c);
  if (error) return { error };
  commit(batch, debit, credit, next);
  return { item: { kind: 'create', spec, id, flags, debit, credit, amount, pending } };
}

function admit(ledger, spec, id, batch) {
  if (id === null) return { error: 'id_invalid' };
  if (batch.counts.get(id) > 1) return { error: 'duplicate_id_in_batch' };
  const key = id.toString();
  const existing = ledger.byId.get(key);
  if (existing) return samePayload(spec, existing) ? { exists: true } : { error: 'exists_with_different_payload' };
  const legacy = ledger.legacyResolves?.get(key);
  if (legacy) return legacy.some((row) => sameLegacyResolve(spec, row)) ? { exists: true } : { error: 'exists_with_different_payload' };
  const flags = spec.flags || 0;
  if (flags & RESOLVE_FLAGS) return admitResolve(ledger, spec, id, flags, batch);
  return admitCreate(ledger, spec, id, flags, batch);
}

function sealBody(t) {
  return JSON.stringify([
    CHAIN_VERSION,
    t.id,
    t.debitAccountId,
    t.creditAccountId,
    t.amount,
    t.flags,
    t.pendingId ?? null,
    t.timestamp,
    t.code || '',
    t.invoiceId || null,
    t.userData || 0,
    t.prevChecksum,
  ], jsonSafe);
}

function legacyBody(t) {
  return JSON.stringify({
    id: t.id.toString(),
    debit: t.debitAccountId.toString(),
    credit: t.creditAccountId.toString(),
    amount: t.amount.toString(),
    prev: t.prevChecksum,
  });
}

function seal(ledger, fields) {
  const row = { ...fields, timestamp: tick(ledger), prevChecksum: ledger.lastChecksum, chainVersion: CHAIN_VERSION };
  row.checksum = crc32(sealBody(row));
  ledger.lastChecksum = row.checksum;
  ledger.transfers.push(row);
  ledger.byId.set(row.id.toString(), row);
  return row;
}

function appendCreate(ledger, item) {
  const { debit, credit, amount, pending } = item;
  const bucket = pending ? 'Pending' : 'Posted';
  debit[`debits${bucket}`] += amount;
  credit[`credits${bucket}`] += amount;
  const row = seal(ledger, {
    id: item.id,
    debitAccountId: debit.id,
    creditAccountId: credit.id,
    amount,
    flags: item.flags,
    pendingId: null,
    pending,
    posted: !pending,
    voided: false,
    userData: item.spec.userData || 0,
    invoiceId: item.spec.invoiceId || null,
    code: item.spec.code || '',
    resolvedBy: null,
  });
  return { id: row.id.toString(), ok: true, exists: false, checksum: row.checksum };
}

function appendResolve(ledger, item) {
  const { pending, post } = item;
  const debit = ledger.accounts.get(pending.debitAccountId);
  const credit = ledger.accounts.get(pending.creditAccountId);
  debit.debitsPending -= pending.amount;
  credit.creditsPending -= pending.amount;
  if (post) {
    debit.debitsPosted += pending.amount;
    credit.creditsPosted += pending.amount;
  }
  pending.pending = false;
  pending.posted = post;
  pending.voided = !post;
  pending.resolvedBy = item.id.toString();
  const row = seal(ledger, {
    id: item.id,
    debitAccountId: pending.debitAccountId,
    creditAccountId: pending.creditAccountId,
    amount: pending.amount,
    flags: item.flags,
    pendingId: pending.id,
    pending: false,
    posted: false,
    voided: false,
    userData: item.spec.userData || 0,
    invoiceId: item.spec.invoiceId || null,
    code: item.spec.code || '',
    resolvedBy: null,
  });
  return { id: row.id.toString(), ok: true, exists: false, checksum: row.checksum, resolved: pending.id.toString() };
}

export function createTransfers(ledger, transfers) {
  const results = Array(transfers.length);
  const ids = transfers.map((spec) => toBigInt(spec?.id));
  const counts = new Map();
  for (const id of ids) if (id !== null) counts.set(id, (counts.get(id) || 0) + 1);
  const batch = { counts, overlay: new Map(), claimed: new Map() };
  const idText = (i) => (ids[i] === null ? String(transfers[i]?.id) : ids[i].toString());
  const linked = (i) => Boolean((transfers[i]?.flags || 0) & TRANSFER_FLAGS.LINKED);
  const inChain = (i) => linked(i) || (i > 0 && linked(i - 1));
  const abort = () => transfers.map((_, i) => results[i] || { id: idText(i), ok: false, error: 'linked_abort' });
  const staged = [];

  for (let index = 0; index < transfers.length; index++) {
    const verdict = admit(ledger, transfers[index] || {}, ids[index], batch);
    if (verdict.item) {
      staged.push({ ...verdict.item, index });
      continue;
    }
    if (verdict.exists) {
      results[index] = { id: idText(index), ok: true, exists: true };
      continue;
    }
    results[index] = { id: idText(index), ok: false, error: verdict.error };
    if (verdict.resolve || inChain(index)) return abort();
  }

  for (const item of staged) {
    results[item.index] = item.kind === 'create' ? appendCreate(ledger, item) : appendResolve(ledger, item);
  }
  return results.filter(Boolean);
}

export function journal(ledger) {
  return ledger.transfers.map((t) => ({
    id: t.id.toString(),
    timestamp: t.timestamp.toString(),
    debitAccountId: t.debitAccountId.toString(),
    creditAccountId: t.creditAccountId.toString(),
    amount: rupees(t.amount),
    code: t.code,
    invoiceId: t.invoiceId,
    pendingId: t.pendingId == null ? null : t.pendingId.toString(),
    pending: t.pending,
    posted: t.posted,
    voided: t.voided,
    checksum: t.checksum,
    prevChecksum: t.prevChecksum,
  }));
}

export function trialBalance(ledger) {
  const rows = listAccounts(ledger).filter((a) => a.debitsPosted || a.creditsPosted);
  let debit = 0n;
  let credit = 0n;
  for (const a of ledger.accounts.values()) {
    debit += a.debitsPosted;
    credit += a.creditsPosted;
  }
  return { rows, debit: rupees(debit), credit: rupees(credit), balanced: debit === credit };
}

function broken(error, at, extra = {}) {
  return { ok: false, error, at, ...extra };
}

function legacyCandidates(rows, position) {
  const candidates = [];
  for (const [index, row] of rows.entries()) {
    if (!(row.flags & TRANSFER_FLAGS.PENDING) || row.pendingId != null || !row.resolvedBy) continue;
    const resolver = rows[position.get(String(row.resolvedBy))];
    if (resolver && resolver.pendingId === row.id) continue;
    if (row.chainVersion === CHAIN_VERSION) return { error: 'resolve_mismatch', at: row.id.toString() };
    candidates.push({ index, row });
  }
  return { candidates };
}

function byResolveId(a, b) {
  if (a.key === b.key) return a.index - b.index;
  if (a.key === null) return 1;
  if (b.key === null) return -1;
  return a.key < b.key ? -1 : 1;
}

function legacyBridge(candidates) {
  const ordered = candidates.map((c) => ({ ...c, key: toBigInt(c.row.resolvedBy) })).sort(byResolveId);
  const consumed = new Set();
  let head = 0;
  let gapBudget = 0;
  let totalBudget = LEGACY_TOTAL_BUDGET;
  const search = (from, to, limit, depth) => {
    if (depth === 0) return from === to;
    for (let i = head; i < ordered.length; i++) {
      const candidate = ordered[i];
      if (candidate.index >= limit || consumed.has(candidate)) continue;
      consumed.add(candidate);
      for (const flags of candidate.row.posted ? LEGACY_POST_FLAGS : LEGACY_VOID_FLAGS) {
        gapBudget -= 1;
        totalBudget -= 1;
        if (gapBudget < 0 || totalBudget < 0) {
          consumed.delete(candidate);
          return false;
        }
        if (search(crc32(`${candidate.row.id}:${flags}:${from}`), to, limit, depth - 1)) return true;
      }
      consumed.delete(candidate);
    }
    return false;
  };
  return {
    bridge(from, to, limit) {
      if (from === to) return true;
      while (head < ordered.length && consumed.has(ordered[head])) head += 1;
      gapBudget = LEGACY_GAP_BUDGET;
      for (let depth = 1; depth <= ordered.length - head && gapBudget > 0 && totalBudget > 0; depth += 1) {
        if (search(from, to, limit, depth)) return true;
      }
      return false;
    },
    unconsumed: () => ordered.find((c) => !consumed.has(c))?.row.id.toString() ?? null,
  };
}

function statusError(t) {
  if (t.pendingId != null) return t.pending || t.posted || t.voided || t.resolvedBy;
  if (!(t.flags & TRANSFER_FLAGS.PENDING)) return !t.posted || t.pending || t.voided || t.resolvedBy;
  const states = [t.pending, t.posted, t.voided].filter(Boolean).length;
  return states !== 1 || Boolean(t.resolvedBy) === Boolean(t.pending);
}

function resolveError(rows, position, t, index) {
  const at = position.get(t.pendingId.toString());
  const target = rows[at];
  const post = Boolean(t.flags & TRANSFER_FLAGS.POST_PENDING);
  return !target
    || at >= index
    || target.pendingId != null
    || !(target.flags & TRANSFER_FLAGS.PENDING)
    || target.debitAccountId !== t.debitAccountId
    || target.creditAccountId !== t.creditAccountId
    || target.amount !== t.amount
    || target.resolvedBy !== t.id.toString()
    || target.posted !== post
    || target.voided !== !post;
}

function reconcile(ledger) {
  const totals = new Map();
  const add = (id, field, amount) => {
    const entry = totals.get(id) || { debitsPosted: 0n, creditsPosted: 0n, debitsPending: 0n, creditsPending: 0n };
    entry[field] += amount;
    totals.set(id, entry);
  };
  for (const t of ledger.transfers) {
    if (t.pendingId != null || t.voided) continue;
    const bucket = t.pending ? 'Pending' : 'Posted';
    add(t.debitAccountId, `debits${bucket}`, t.amount);
    add(t.creditAccountId, `credits${bucket}`, t.amount);
  }
  for (const account of ledger.accounts.values()) {
    const expected = totals.get(account.id);
    const mismatch = BALANCE_FIELDS.some((field) => account[field] !== (expected ? expected[field] : 0n));
    if (mismatch) return broken('balance_mismatch', null, { account: account.id.toString() });
  }
  return null;
}

export function verifyChain(ledger) {
  const rows = ledger.transfers;
  const position = new Map();
  for (const [index, t] of rows.entries()) {
    const key = t.id.toString();
    if (position.has(key)) return broken('duplicate_id', key);
    position.set(key, index);
  }
  const found = legacyCandidates(rows, position);
  if (found.error) return broken(found.error, found.at);
  const legacy = legacyBridge(found.candidates);
  let prev = 0;
  let previousTimestamp = -1n;
  let modern = false;
  for (const [index, t] of rows.entries()) {
    const key = t.id.toString();
    if (typeof t.timestamp !== 'bigint' || t.timestamp <= previousTimestamp || t.timestamp > ledger.clock) {
      return broken('timestamp_out_of_order', key);
    }
    previousTimestamp = t.timestamp;
    if (!ledger.accounts.has(t.debitAccountId) || !ledger.accounts.has(t.creditAccountId)) return broken('account_not_found', key);
    if (typeof t.amount !== 'bigint' || t.amount <= 0n) return broken('amount_invalid', key);
    const afterLegacy = index > 0 && !modern;
    if (t.chainVersion === CHAIN_VERSION) modern = true;
    else if (modern || (t.chainVersion ?? 1) !== 1) return broken('chain_version_invalid', key);
    if (crc32(modern ? sealBody(t) : legacyBody(t)) !== t.checksum) return broken('checksum_mismatch', key);
    if (t.prevChecksum !== prev && !(afterLegacy && legacy.bridge(prev, t.prevChecksum, index))) return broken('link_broken', key);
    const isResolve = t.pendingId != null;
    if (isResolve !== Boolean(t.flags & RESOLVE_FLAGS) || (isResolve && !modern)) return broken('row_shape_invalid', key);
    if (statusError(t)) return broken('status_mismatch', key);
    if (isResolve && resolveError(rows, position, t, index)) return broken('resolve_mismatch', key);
    prev = t.checksum;
  }
  const last = ledger.lastChecksum ?? 0;
  const tailIsLegacy = rows.length > 0 && !modern;
  if (last !== prev && !(tailIsLegacy && legacy.bridge(prev, last, rows.length))) {
    return broken('last_checksum_mismatch', rows.length ? rows[rows.length - 1].id.toString() : null);
  }
  const orphan = legacy.unconsumed();
  if (orphan) return broken('resolve_mismatch', orphan);
  return reconcile(ledger) || { ok: true, last };
}
