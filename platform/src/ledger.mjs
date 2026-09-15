const LEDGER_ID = 1n;

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

function crc32(str) {
  let c = 0xffffffff;
  for (let i = 0; i < str.length; i++) {
    c ^= str.charCodeAt(i);
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function paise(rupees) {
  return BigInt(Math.round(Number(rupees) * 100));
}

export function rupees(p) {
  return Number(p) / 100;
}

export function emptyLedger() {
  return {
    accounts: new Map(),
    transfers: [],
    byId: new Map(),
    clock: 0n,
    lastChecksum: 0,
  };
}

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
      timestamp: BigInt(t.timestamp),
    };
    l.transfers.push(row);
    l.byId.set(row.id.toString(), row);
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

function applyPosted(ledger, debit, credit, amount) {
  debit.debitsPosted += amount;
  credit.creditsPosted += amount;
}

function applyPending(ledger, debit, credit, amount, sign) {
  debit.debitsPending += amount * sign;
  credit.creditsPending += amount * sign;
}

function checkLimits(account, nextDebits, nextCredits) {
  if ((account.flags & ACCOUNT_FLAGS.DEBITS_MUST_NOT_EXCEED_CREDITS) && nextDebits > nextCredits) {
    return 'exceeds_credits';
  }
  if ((account.flags & ACCOUNT_FLAGS.CREDITS_MUST_NOT_EXCEED_DEBITS) && nextCredits > nextDebits) {
    return 'exceeds_debits';
  }
  return null;
}

export function createTransfers(ledger, transfers) {
  const results = Array(transfers.length);
  const staged = [];

  const linkedAbort = (failedIndex) => transfers.map((t, i) => {
    if (results[i]) return results[i];
    return {
      id: String(t.id),
      ok: false,
      error: i === failedIndex ? 'linked_abort' : 'linked_abort',
    };
  });

  for (let index = 0; index < transfers.length; index++) {
    const spec = transfers[index];
    const id = BigInt(spec.id);
    if (ledger.byId.has(id.toString())) {
      results[index] = { id: id.toString(), ok: true, exists: true };
      continue;
    }
    const flags = spec.flags || 0;
    if (flags & TRANSFER_FLAGS.POST_PENDING || flags & TRANSFER_FLAGS.VOID_PENDING) {
      const pending = ledger.byId.get(String(spec.pendingId));
      if (!pending || !(pending.flags & TRANSFER_FLAGS.PENDING) || pending.posted || pending.voided) {
        results[index] = { id: id.toString(), ok: false, error: 'pending_not_found' };
        return linkedAbort(index);
      }
      staged.push({ kind: 'resolve', spec, pending, id, flags, index });
      continue;
    }
    const debit = ledger.accounts.get(BigInt(spec.debitAccountId));
    const credit = ledger.accounts.get(BigInt(spec.creditAccountId));
    if (!debit || !credit) {
      results[index] = { id: id.toString(), ok: false, error: 'account_not_found' };
      if (flags & TRANSFER_FLAGS.LINKED) return linkedAbort(index);
      continue;
    }
    const amount = BigInt(spec.amount);
    if (amount <= 0n) {
      results[index] = { id: id.toString(), ok: false, error: 'amount_must_be_positive' };
      if (flags & TRANSFER_FLAGS.LINKED) return linkedAbort(index);
      continue;
    }
    staged.push({ kind: 'create', spec, debit, credit, amount, id, flags, index });
  }

  const balances = new Map();
  const balanceOf = (account) => {
    const key = account.id.toString();
    if (!balances.has(key)) {
      balances.set(key, {
        debitsPosted: account.debitsPosted,
        creditsPosted: account.creditsPosted,
        debitsPending: account.debitsPending,
        creditsPending: account.creditsPending,
      });
    }
    return balances.get(key);
  };

  for (const item of staged) {
    if (item.kind !== 'create') continue;
    const pending = Boolean(item.flags & TRANSFER_FLAGS.PENDING);
    const d = balanceOf(item.debit);
    const c = balanceOf(item.credit);
    const nextD = {
      debitsPosted: d.debitsPosted + (pending ? 0n : item.amount),
      creditsPosted: d.creditsPosted,
      debitsPending: d.debitsPending + (pending ? item.amount : 0n),
      creditsPending: d.creditsPending,
    };
    const nextC = {
      debitsPosted: c.debitsPosted,
      creditsPosted: c.creditsPosted + (pending ? 0n : item.amount),
      debitsPending: c.debitsPending,
      creditsPending: c.creditsPending + (pending ? item.amount : 0n),
    };
    const failD = checkLimits(item.debit, nextD.debitsPosted + nextD.debitsPending, nextD.creditsPosted + nextD.creditsPending);
    const failC = checkLimits(item.credit, nextC.debitsPosted + nextC.debitsPending, nextC.creditsPosted + nextC.creditsPending);
    if (failD || failC) {
      results[item.index] = { id: item.id.toString(), ok: false, error: failD || failC };
      if (item.flags & TRANSFER_FLAGS.LINKED) return linkedAbort(item.index);
      continue;
    }
    balances.set(item.debit.id.toString(), nextD);
    balances.set(item.credit.id.toString(), nextC);
  }

  for (const item of staged) {
    if (results[item.index]) continue;
    if (item.kind === 'create') {
      const pending = Boolean(item.flags & TRANSFER_FLAGS.PENDING);
      if (pending) applyPending(ledger, item.debit, item.credit, item.amount, 1n);
      else applyPosted(ledger, item.debit, item.credit, item.amount);
      const body = JSON.stringify({
        id: item.id.toString(),
        debit: item.debit.id.toString(),
        credit: item.credit.id.toString(),
        amount: item.amount.toString(),
        prev: ledger.lastChecksum,
      });
      const checksum = crc32(body);
      const row = {
        id: item.id,
        debitAccountId: item.debit.id,
        creditAccountId: item.credit.id,
        amount: item.amount,
        flags: item.flags,
        pending: pending,
        posted: !pending,
        voided: false,
        userData: item.spec.userData || 0,
        invoiceId: item.spec.invoiceId || null,
        code: item.spec.code || '',
        timestamp: tick(ledger),
        checksum,
        prevChecksum: ledger.lastChecksum,
      };
      ledger.lastChecksum = checksum;
      ledger.transfers.push(row);
      ledger.byId.set(row.id.toString(), row);
      results[item.index] = { id: row.id.toString(), ok: true, exists: false, checksum };
    } else {
      const { pending } = item;
      const debit = ledger.accounts.get(pending.debitAccountId);
      const credit = ledger.accounts.get(pending.creditAccountId);
      applyPending(ledger, debit, credit, pending.amount, -1n);
      if (item.flags & TRANSFER_FLAGS.POST_PENDING) {
        applyPosted(ledger, debit, credit, pending.amount);
        pending.posted = true;
        pending.pending = false;
      } else {
        pending.voided = true;
        pending.pending = false;
      }
      pending.resolvedBy = item.id.toString();
      const checksum = crc32(`${pending.id}:${item.flags}:${ledger.lastChecksum}`);
      ledger.lastChecksum = checksum;
      results[item.index] = { id: item.id.toString(), ok: true, exists: false, checksum, resolved: pending.id.toString() };
    }
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
    pending: t.pending,
    posted: t.posted,
    voided: t.voided,
    checksum: t.checksum,
    prevChecksum: t.prevChecksum,
  }));
}

export function trialBalance(ledger) {
  const rows = listAccounts(ledger).filter((a) => a.debitsPosted || a.creditsPosted);
  const debit = rows.reduce((s, a) => s + a.debitsPosted, 0);
  const credit = rows.reduce((s, a) => s + a.creditsPosted, 0);
  return { rows, debit, credit, balanced: Math.abs(debit - credit) < 0.001 };
}

export function verifyChain(ledger) {
  let prev = 0;
  for (const t of ledger.transfers) {
    if (t.prevChecksum !== prev) return { ok: false, at: t.id.toString() };
    prev = t.checksum;
  }
  return { ok: true, last: prev };
}
