import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyLedger, createAccounts, createTransfers, verifyChain, freeze, hydrate, journal, lookupAccounts,
  paise, ACCOUNT_FLAGS, TRANSFER_FLAGS,
} from '../src/ledger.mjs';

const F = TRANSFER_FLAGS;

const LEGACY_EBFC5EF = {
  clock: '8',
  lastChecksum: 1980147358,
  accounts: [
    { id: '1001', ledger: 1, code: '1001', name: 'Cash', type: 'asset', gstin: '', flags: 2, userData: 0, timestamp: '1', debitsPending: '0', creditsPending: '0', debitsPosted: '0', creditsPosted: '0' },
    { id: '1002', ledger: 1, code: '1002', name: 'Bank', type: 'asset', gstin: '', flags: 0, userData: 0, timestamp: '2', debitsPending: '0', creditsPending: '0', debitsPosted: '30000', creditsPosted: '0' },
    { id: '1100', ledger: 1, code: '1100', name: 'Trade receivables', type: 'asset', gstin: '', flags: 0, userData: 0, timestamp: '3', debitsPending: '0', creditsPending: '0', debitsPosted: '150000', creditsPosted: '30000' },
    { id: '4000', ledger: 1, code: '4000', name: 'Sales', type: 'income', gstin: '', flags: 1, userData: 0, timestamp: '4', debitsPending: '0', creditsPending: '0', debitsPosted: '0', creditsPosted: '150000' },
  ],
  transfers: [
    { id: '101', debitAccountId: '1100', creditAccountId: '4000', amount: '100000', flags: 0, pending: false, posted: true, voided: false, userData: 0, invoiceId: 'INV-001', code: 'SALES', timestamp: '5', checksum: 816754264, prevChecksum: 0, resolvedBy: null },
    { id: '102', debitAccountId: '1100', creditAccountId: '4000', amount: '50000', flags: 1, pending: false, posted: true, voided: false, userData: 0, invoiceId: null, code: 'HOLD', timestamp: '6', checksum: 1270295127, prevChecksum: 816754264, resolvedBy: '104' },
    { id: '103', debitAccountId: '1002', creditAccountId: '1100', amount: '20000', flags: 1, pending: false, posted: false, voided: true, userData: 0, invoiceId: null, code: 'HOLD-RCPT', timestamp: '7', checksum: 2290587622, prevChecksum: 1270295127, resolvedBy: '106' },
    { id: '105', debitAccountId: '1002', creditAccountId: '1100', amount: '30000', flags: 0, pending: false, posted: true, voided: false, userData: '2026-08-01', invoiceId: 'INV-001', code: 'RECEIPT', timestamp: '8', checksum: 1631830432, prevChecksum: 3378438178, resolvedBy: null },
  ],
};

const LEGACY_EBFC5EF_OPEN_PENDING = {
  clock: '3',
  lastChecksum: 1331123196,
  accounts: [
    { id: '1100', ledger: 1, code: '1100', name: 'Trade receivables', type: 'asset', gstin: '', flags: 0, userData: 0, timestamp: '1', debitsPending: '7000', creditsPending: '0', debitsPosted: '0', creditsPosted: '0' },
    { id: '4000', ledger: 1, code: '4000', name: 'Sales', type: 'income', gstin: '', flags: 1, userData: 0, timestamp: '2', debitsPending: '0', creditsPending: '7000', debitsPosted: '0', creditsPosted: '0' },
  ],
  transfers: [
    { id: '301', debitAccountId: '1100', creditAccountId: '4000', amount: '7000', flags: 1, pending: true, posted: false, voided: false, userData: 0, invoiceId: null, code: 'HOLD', timestamp: '3', checksum: 1331123196, prevChecksum: 0, resolvedBy: null },
  ],
};

const legacy = () => hydrate(JSON.parse(JSON.stringify(LEGACY_EBFC5EF)));

function book() {
  const l = emptyLedger();
  createAccounts(l, [
    { id: 1001, code: '1001', name: 'Cash', type: 'asset', flags: ACCOUNT_FLAGS.CREDITS_MUST_NOT_EXCEED_DEBITS },
    { id: 1002, code: '1002', name: 'Bank', type: 'asset', flags: 0 },
    { id: 1100, code: '1100', name: 'Trade receivables', type: 'asset', flags: 0 },
    { id: 3000, code: '3000', name: 'Capital', type: 'equity', flags: ACCOUNT_FLAGS.DEBITS_MUST_NOT_EXCEED_CREDITS },
    { id: 4000, code: '4000', name: 'Sales', type: 'income', flags: ACCOUNT_FLAGS.DEBITS_MUST_NOT_EXCEED_CREDITS },
    { id: 5100, code: '5100', name: 'Operating expenses', type: 'expense', flags: 0 },
  ]);
  return l;
}

const roundTrip = (l) => hydrate(JSON.parse(JSON.stringify(freeze(l))));
const tamper = (l, edit) => {
  assert.equal(verifyChain(l).ok, true);
  const snap = JSON.parse(JSON.stringify(freeze(l)));
  edit(snap);
  return hydrate(snap);
};
const sale = (id, amount, extra = {}) => ({ id, debitAccountId: 1100, creditAccountId: 4000, amount, code: 'SALES', ...extra });
const balances = (l, id) => {
  const [a] = lookupAccounts(l, [id]);
  return { debitsPosted: a.debitsPosted, creditsPosted: a.creditsPosted, debitsPending: a.debitsPending, creditsPending: a.creditsPending };
};

function mixed() {
  const l = book();
  createTransfers(l, [sale(1, 100000n, { invoiceId: 'INV-1' }), sale(2, 25000n, { flags: F.LINKED }), sale(3, 5000n)]);
  createTransfers(l, [{ id: 4, debitAccountId: 1002, creditAccountId: 1100, amount: 40000n, flags: F.PENDING }]);
  createTransfers(l, [{ id: 5, debitAccountId: 1100, creditAccountId: 4000, amount: 7000n, flags: F.PENDING }]);
  createTransfers(l, [{ id: 6, pendingId: 4, flags: F.POST_PENDING }]);
  createTransfers(l, [{ id: 7, pendingId: 5, flags: F.VOID_PENDING }]);
  createTransfers(l, [{ id: 8, debitAccountId: 1002, creditAccountId: 1100, amount: 1234n, code: 'RECEIPT', userData: '2026-08-01' }]);
  return l;
}

test('ledger chain: an untouched mixed ledger verifies before and after freeze/hydrate', () => {
  const l = mixed();
  assert.equal(l.transfers.length, 8);
  assert.equal(verifyChain(l).ok, true);
  assert.equal(verifyChain(roundTrip(l)).ok, true);
  assert.equal(verifyChain(roundTrip(roundTrip(l))).ok, true);
  assert.equal(verifyChain(emptyLedger()).ok, true);
  assert.equal(verifyChain(book()).ok, true);
});

test('ledger chain: post and void append resolve rows, so later transfers do not break the chain', () => {
  const l = book();
  createTransfers(l, [{ id: 20, debitAccountId: 1100, creditAccountId: 4000, amount: 500n, flags: F.PENDING }]);
  const posted = createTransfers(l, [{ id: 21, pendingId: 20, flags: F.POST_PENDING }]);
  assert.equal(posted[0].ok, true);
  createTransfers(l, [sale(22, 1n)]);
  assert.deepEqual(l.transfers.map((t) => t.id.toString()), ['20', '21', '22']);
  assert.equal(l.transfers[1].prevChecksum, l.transfers[0].checksum);
  assert.equal(l.transfers[2].prevChecksum, l.transfers[1].checksum);
  assert.equal(l.lastChecksum, l.transfers[2].checksum);
  assert.equal(verifyChain(l).ok, true);
  const rows = journal(l);
  assert.equal(rows[1].pendingId, '20');
  assert.equal(rows[1].posted, false);
  assert.equal(rows[0].posted, true);
});

function postedOnly() {
  const l = book();
  createTransfers(l, [sale(1, 100000n, { invoiceId: 'INV-1' }), sale(2, 25000n)]);
  createTransfers(l, [{ id: 3, debitAccountId: 1002, creditAccountId: 1100, amount: 40000n, code: 'RECEIPT' }]);
  return l;
}

test('ledger chain: a tampered amount is detected', () => {
  assert.equal(verifyChain(tamper(postedOnly(), (s) => { s.transfers[0].amount = '99999900'; })).ok, false);
  assert.equal(verifyChain(tamper(mixed(), (s) => { s.transfers[0].amount = '99999900'; })).ok, false);
});

test('ledger chain: a tampered account on a posted-only ledger is detected', () => {
  assert.equal(verifyChain(tamper(postedOnly(), (s) => { s.transfers[0].creditAccountId = '1002'; })).ok, false);
  assert.equal(verifyChain(tamper(postedOnly(), (s) => { s.accounts.find((a) => a.id === '1002').debitsPosted = '1'; })).ok, false);
  assert.equal(verifyChain(tamper(postedOnly(), (s) => { s.transfers.pop(); })).ok, false);
});

test('ledger chain: a tampered amount with matching balances is still detected by the CRC', () => {
  const t = tamper(mixed(), (s) => {
    s.transfers[0].amount = '100100';
    const ar = s.accounts.find((a) => a.id === '1100');
    const sales = s.accounts.find((a) => a.id === '4000');
    ar.debitsPosted = String(BigInt(ar.debitsPosted) + 100n);
    sales.creditsPosted = String(BigInt(sales.creditsPosted) + 100n);
  });
  const r = verifyChain(t);
  assert.equal(r.ok, false);
  assert.equal(r.at, '1');
});

test('ledger chain: a tampered debit or credit account is detected', () => {
  assert.equal(verifyChain(tamper(mixed(), (s) => { s.transfers[0].creditAccountId = '1002'; })).ok, false);
  assert.equal(verifyChain(tamper(mixed(), (s) => { s.transfers[0].debitAccountId = '1002'; })).ok, false);
});

test('ledger chain: tampered flags, timestamp, code, invoice id and pending link are detected', () => {
  assert.equal(verifyChain(tamper(mixed(), (s) => { s.transfers[1].flags = 0; })).ok, false);
  assert.equal(verifyChain(tamper(mixed(), (s) => { s.transfers[1].timestamp = '999'; })).ok, false);
  assert.equal(verifyChain(tamper(mixed(), (s) => { s.transfers[0].code = 'REFUND'; })).ok, false);
  assert.equal(verifyChain(tamper(mixed(), (s) => { s.transfers[0].invoiceId = 'INV-2'; })).ok, false);
  assert.equal(verifyChain(tamper(mixed(), (s) => { s.transfers[5].pendingId = '5'; })).ok, false);
});

test('ledger chain: a tampered account balance is detected', () => {
  const r = verifyChain(tamper(mixed(), (s) => {
    s.accounts.find((a) => a.id === '1002').debitsPosted = '1';
  }));
  assert.equal(r.ok, false);
  assert.equal(verifyChain(tamper(mixed(), (s) => {
    s.accounts.find((a) => a.id === '3000').creditsPosted = '500';
  })).ok, false);
});

test('ledger chain: a dropped last transfer is detected', () => {
  assert.equal(verifyChain(tamper(mixed(), (s) => { s.transfers.pop(); })).ok, false);
  assert.equal(verifyChain(tamper(mixed(), (s) => {
    const dropped = s.transfers.pop();
    const bank = s.accounts.find((a) => a.id === '1002');
    const ar = s.accounts.find((a) => a.id === '1100');
    bank.debitsPosted = String(BigInt(bank.debitsPosted) - BigInt(dropped.amount));
    ar.creditsPosted = String(BigInt(ar.creditsPosted) - BigInt(dropped.amount));
  })).ok, false);
});

test('ledger chain: a flipped pending status is detected', () => {
  assert.equal(verifyChain(tamper(mixed(), (s) => {
    const row = s.transfers.find((t) => t.id === '4');
    row.posted = false;
    row.voided = true;
  })).ok, false);
});

test('ledger idempotency: a re-submitted id with a different payload is an error', () => {
  const l = book();
  assert.equal(createTransfers(l, [sale(1, 100n)])[0].ok, true);
  const same = createTransfers(l, [sale(1, 100n)]);
  assert.equal(same[0].ok, true);
  assert.equal(same[0].exists, true);
  for (const variant of [
    sale(1, 999999n),
    { ...sale(1, 100n), debitAccountId: 1002 },
    { ...sale(1, 100n), creditAccountId: 3000 },
    { ...sale(1, 100n), flags: F.PENDING },
    { ...sale(1, 100n), code: 'OTHER' },
    { ...sale(1, 100n), invoiceId: 'INV-9' },
  ]) {
    const r = createTransfers(l, [variant]);
    assert.equal(r[0].ok, false);
    assert.equal(r[0].error, 'exists_with_different_payload');
  }
  assert.equal(l.transfers.length, 1);
  assert.equal(balances(l, 1100).debitsPosted, '100');
  assert.equal(verifyChain(l).ok, true);
});

test('ledger idempotency: duplicate ids inside one batch are rejected', () => {
  const l = book();
  const r = createTransfers(l, [sale(7, 100n), sale(7, 100n)]);
  assert.equal(r.length, 2);
  assert.equal(r.every((x) => x.ok === false && x.error === 'duplicate_id_in_batch'), true);
  assert.equal(l.transfers.length, 0);
  assert.equal(balances(l, 1100).debitsPosted, '0');
  const linked = createTransfers(l, [sale(8, 100n, { flags: F.LINKED }), sale(9, 100n, { flags: F.LINKED }), sale(9, 5n)]);
  assert.equal(linked.some((x) => x.error === 'duplicate_id_in_batch'), true);
  assert.equal(linked.find((x) => x.id === '8').error, 'linked_abort');
  assert.equal(l.transfers.length, 0);
  assert.equal(verifyChain(l).ok, true);
});

test('ledger idempotency: a pending transfer cannot be posted twice in one batch', () => {
  const l = book();
  createTransfers(l, [{ id: 10, debitAccountId: 1100, creditAccountId: 4000, amount: 500n, flags: F.PENDING }]);
  const r = createTransfers(l, [{ id: 11, pendingId: 10, flags: F.POST_PENDING }, { id: 12, pendingId: 10, flags: F.POST_PENDING }]);
  assert.equal(r[0].ok, false);
  assert.equal(r[1].ok, false);
  assert.equal(r.some((x) => x.error === 'pending_already_posted'), true);
  assert.deepEqual(balances(l, 1100), { debitsPosted: '0', creditsPosted: '0', debitsPending: '500', creditsPending: '0' });
  assert.equal(verifyChain(l).ok, true);
});

test('ledger idempotency: a pending transfer cannot be posted and voided in one batch', () => {
  const l = book();
  createTransfers(l, [{ id: 10, debitAccountId: 1100, creditAccountId: 4000, amount: 500n, flags: F.PENDING }]);
  const r = createTransfers(l, [{ id: 11, pendingId: 10, flags: F.POST_PENDING }, { id: 12, pendingId: 10, flags: F.VOID_PENDING }]);
  assert.equal(r.some((x) => x.error === 'pending_already_posted'), true);
  assert.equal(l.transfers[0].posted, false);
  assert.equal(l.transfers[0].voided, false);
  assert.equal(l.transfers[0].pending, true);
  assert.deepEqual(balances(l, 1100), { debitsPosted: '0', creditsPosted: '0', debitsPending: '500', creditsPending: '0' });
  assert.equal(verifyChain(l).ok, true);
});

test('ledger idempotency: a posted or voided pending cannot be resolved again across batches', () => {
  const l = book();
  createTransfers(l, [
    { id: 10, debitAccountId: 1100, creditAccountId: 4000, amount: 500n, flags: F.PENDING },
    { id: 20, debitAccountId: 1100, creditAccountId: 4000, amount: 300n, flags: F.PENDING },
  ]);
  assert.equal(createTransfers(l, [{ id: 11, pendingId: 10, flags: F.POST_PENDING }])[0].ok, true);
  assert.equal(createTransfers(l, [{ id: 21, pendingId: 20, flags: F.VOID_PENDING }])[0].ok, true);
  assert.equal(createTransfers(l, [{ id: 12, pendingId: 10, flags: F.POST_PENDING }])[0].error, 'pending_already_posted');
  assert.equal(createTransfers(l, [{ id: 13, pendingId: 10, flags: F.VOID_PENDING }])[0].error, 'pending_already_posted');
  assert.equal(createTransfers(l, [{ id: 22, pendingId: 20, flags: F.POST_PENDING }])[0].error, 'pending_already_voided');
  assert.equal(createTransfers(l, [{ id: 30, pendingId: 1, flags: F.POST_PENDING }])[0].error, 'pending_not_found');
  createTransfers(l, [sale(40, 100n)]);
  assert.equal(createTransfers(l, [{ id: 41, pendingId: 40, flags: F.POST_PENDING }])[0].error, 'pending_not_pending');
  assert.deepEqual(balances(l, 1100), { debitsPosted: '600', creditsPosted: '0', debitsPending: '0', creditsPending: '0' });
  assert.equal(verifyChain(l).ok, true);
});

test('ledger idempotency: a replayed resolve id is idempotent and a changed replay is an error', () => {
  const l = book();
  createTransfers(l, [{ id: 20, debitAccountId: 1100, creditAccountId: 4000, amount: 500n, flags: F.PENDING }]);
  assert.equal(createTransfers(l, [{ id: 21, pendingId: 20, flags: F.POST_PENDING }])[0].ok, true);
  const replay = createTransfers(l, [{ id: 21, pendingId: 20, flags: F.POST_PENDING }]);
  assert.equal(replay[0].ok, true);
  assert.equal(replay[0].exists, true);
  const again = roundTrip(l);
  const replayed = createTransfers(again, [{ id: 21, pendingId: 20, flags: F.POST_PENDING }]);
  assert.equal(replayed[0].exists, true);
  assert.equal(createTransfers(l, [{ id: 21, pendingId: 20, flags: F.VOID_PENDING }])[0].error, 'exists_with_different_payload');
  assert.equal(createTransfers(l, [sale(21, 500n)])[0].error, 'exists_with_different_payload');
  assert.equal(createTransfers(l, [{ id: 20, pendingId: 21, flags: F.POST_PENDING }])[0].error, 'exists_with_different_payload');
  assert.equal(l.transfers.length, 2);
  assert.equal(balances(l, 1100).debitsPosted, '500');
  assert.equal(verifyChain(l).ok, true);
});

test('ledger limits: pending credits are not available funds', () => {
  const l = book();
  createTransfers(l, [{ id: 50, debitAccountId: 1001, creditAccountId: 3000, amount: 10000n, flags: F.PENDING }]);
  const spend = createTransfers(l, [{ id: 51, debitAccountId: 5100, creditAccountId: 1001, amount: 10000n }]);
  assert.equal(spend[0].ok, false);
  assert.equal(spend[0].error, 'exceeds_debits');
  createTransfers(l, [{ id: 52, pendingId: 50, flags: F.VOID_PENDING }]);
  assert.deepEqual(balances(l, 1001), { debitsPosted: '0', creditsPosted: '0', debitsPending: '0', creditsPending: '0' });
  const capital = createTransfers(l, [{ id: 60, debitAccountId: 1002, creditAccountId: 3000, amount: 1000n, flags: F.PENDING }]);
  assert.equal(capital[0].ok, true);
  const draw = createTransfers(l, [{ id: 61, debitAccountId: 3000, creditAccountId: 1002, amount: 1000n }]);
  assert.equal(draw[0].error, 'exceeds_credits');
});

test('ledger limits: posted funds and pending debits still behave', () => {
  const l = book();
  assert.equal(createTransfers(l, [{ id: 1, debitAccountId: 1001, creditAccountId: 3000, amount: 1000n }])[0].ok, true);
  assert.equal(createTransfers(l, [{ id: 2, debitAccountId: 5100, creditAccountId: 1001, amount: 600n, flags: F.PENDING }])[0].ok, true);
  assert.equal(createTransfers(l, [{ id: 3, debitAccountId: 5100, creditAccountId: 1001, amount: 401n }])[0].error, 'exceeds_debits');
  assert.equal(createTransfers(l, [{ id: 4, debitAccountId: 5100, creditAccountId: 1001, amount: 400n }])[0].ok, true);
  assert.equal(verifyChain(l).ok, true);
});

test('ledger linked chain: a failing chain terminator aborts the linked transfers before it', () => {
  const l = book();
  const r = createTransfers(l, [sale(40, 100n, { flags: F.LINKED }), { id: 41, debitAccountId: 1100, creditAccountId: 999999, amount: 100n }]);
  assert.equal(r.find((x) => x.id === '41').error, 'account_not_found');
  assert.equal(r.find((x) => x.id === '40').error, 'linked_abort');
  assert.equal(l.transfers.length, 0);
});

test('paise: rounds half-up on the decimal value, not the binary float', () => {
  assert.equal(paise(1.005), 101n);
  assert.equal(paise(1.015), 102n);
  assert.equal(paise(2.675), 268n);
  assert.equal(paise(0.125), 13n);
  assert.equal(paise(1.004), 100n);
  assert.equal(paise('1.005'), 101n);
  assert.equal(paise('1000.50'), 100050n);
  assert.equal(paise(0.1 + 0.2), 30n);
  assert.equal(paise(1234.5), 123450n);
  assert.equal(paise(-1.005), -101n);
  assert.equal(paise(-0.004), 0n);
  assert.equal(paise(0), 0n);
  assert.equal(paise(1e21), 10n ** 23n);
  assert.equal(paise(1e-7), 0n);
  assert.equal(paise(0.005), 1n);
  assert.equal(paise(99999999.995), 10000000000n);
  assert.throws(() => paise(Number.NaN), RangeError);
  assert.throws(() => paise('1,00,000.50'), RangeError);
  assert.throws(() => paise(Infinity), RangeError);
});

test('legacy ledger from ebfc5ef: hydrates and verifies, including its post/void checksum gaps', () => {
  const l = legacy();
  assert.equal(verifyChain(l).ok, true);
  assert.equal(verifyChain(roundTrip(l)).ok, true);
  assert.equal(l.transfers.length, 4);
  assert.equal(l.transfers[0].pendingId, null);
  assert.deepEqual(balances(l, 1100), { debitsPosted: '150000', creditsPosted: '30000', debitsPending: '0', creditsPending: '0' });
});

test('legacy ledger from ebfc5ef: tampering is detected', () => {
  const edit = (fn) => {
    const snap = JSON.parse(JSON.stringify(LEGACY_EBFC5EF));
    fn(snap);
    return verifyChain(hydrate(snap)).ok;
  };
  assert.equal(edit((s) => { s.transfers[0].amount = '100100'; }), false);
  assert.equal(edit((s) => { s.transfers[3].creditAccountId = '4000'; }), false);
  assert.equal(edit((s) => { s.transfers.pop(); }), false);
  assert.equal(edit((s) => { s.accounts[1].debitsPosted = '1'; }), false);
  assert.equal(edit((s) => { s.transfers[2].voided = false; s.transfers[2].posted = true; }), false);
  assert.equal(edit((s) => { s.transfers[1].resolvedBy = null; s.transfers[1].posted = false; s.transfers[1].pending = true; }), false);
  assert.equal(edit((s) => { s.lastChecksum = s.transfers[3].checksum; }), false);
});

test('legacy ledger from ebfc5ef: new postings append cleanly and resolve replays stay idempotent', () => {
  const l = legacy();
  const replay = createTransfers(l, [{ id: 104, pendingId: 102, flags: F.POST_PENDING }]);
  assert.equal(replay[0].ok, true);
  assert.equal(replay[0].exists, true);
  assert.equal(createTransfers(l, [{ id: 104, pendingId: 102, flags: F.VOID_PENDING }])[0].error, 'exists_with_different_payload');
  assert.equal(createTransfers(l, [{ id: 106, pendingId: 103, flags: F.VOID_PENDING }])[0].exists, true);
  assert.equal(createTransfers(l, [{ id: 107, pendingId: 102, flags: F.POST_PENDING }])[0].error, 'pending_already_posted');
  assert.equal(createTransfers(l, [sale(101, 100000n, { invoiceId: 'INV-001' })])[0].exists, true);
  assert.equal(createTransfers(l, [sale(101, 1n)])[0].error, 'exists_with_different_payload');
  assert.equal(createTransfers(l, [sale(200, 999n)])[0].ok, true);
  assert.equal(createTransfers(l, [{ id: 201, debitAccountId: 1100, creditAccountId: 4000, amount: 50n, flags: F.PENDING }])[0].ok, true);
  assert.equal(createTransfers(l, [{ id: 202, pendingId: 201, flags: F.POST_PENDING }])[0].ok, true);
  assert.equal(verifyChain(l).ok, true);
  const again = roundTrip(l);
  assert.equal(verifyChain(again).ok, true);
  assert.equal(again.transfers.length, 7);
  assert.equal(createTransfers(again, [{ id: 104, pendingId: 102, flags: F.POST_PENDING }])[0].exists, true);
  assert.equal(verifyChain(tamper(again, (s) => { s.transfers[0].amount = '1'; })).ok, false);
  assert.equal(verifyChain(tamper(again, (s) => { s.transfers[4].amount = '1'; })).ok, false);
});

test('legacy ledger from ebfc5ef: an open legacy pending can be posted by the new chain', () => {
  const l = hydrate(JSON.parse(JSON.stringify(LEGACY_EBFC5EF_OPEN_PENDING)));
  assert.equal(verifyChain(l).ok, true);
  const posted = createTransfers(l, [{ id: 302, pendingId: 301, flags: F.POST_PENDING }]);
  assert.equal(posted[0].ok, true);
  assert.equal(l.transfers[1].prevChecksum, 1331123196);
  assert.equal(verifyChain(l).ok, true);
  const again = roundTrip(l);
  assert.equal(verifyChain(again).ok, true);
  assert.equal(createTransfers(again, [{ id: 302, pendingId: 301, flags: F.POST_PENDING }])[0].exists, true);
  assert.equal(createTransfers(again, [{ id: 303, pendingId: 301, flags: F.VOID_PENDING }])[0].error, 'pending_already_posted');
  assert.deepEqual(balances(again, 1100), { debitsPosted: '7000', creditsPosted: '0', debitsPending: '0', creditsPending: '0' });
  assert.equal(verifyChain(tamper(again, (s) => { s.transfers[0].posted = false; s.transfers[0].voided = true; })).ok, false);
});

test('ledger input: unusable ids and fractional amounts are rejected, not thrown', () => {
  const l = book();
  const r = createTransfers(l, [
    { id: undefined, debitAccountId: 1100, creditAccountId: 4000, amount: 1n },
    { id: 'abc', debitAccountId: 1100, creditAccountId: 4000, amount: 1n },
    { id: 400, debitAccountId: 1100, creditAccountId: 4000, amount: 1.5 },
    { id: 401, debitAccountId: 1100, creditAccountId: 4000, amount: 150 },
  ]);
  assert.deepEqual(r.map((x) => x.error ?? 'ok'), ['id_invalid', 'id_invalid', 'amount_invalid', 'ok']);
  assert.equal(l.transfers.length, 1);
  assert.equal(verifyChain(l).ok, true);
});

function legacyCrc(str) {
  let c = 0xffffffff;
  for (let i = 0; i < str.length; i++) {
    c ^= str.charCodeAt(i);
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function legacySnapshot(accounts, ops) {
  let clock = 0n;
  let last = 0;
  const books = accounts.map((a) => ({
    id: String(a.id), ledger: 1, code: String(a.id), name: a.name, type: a.type, gstin: '', flags: a.flags, userData: 0,
    timestamp: String(++clock), debitsPending: 0n, creditsPending: 0n, debitsPosted: 0n, creditsPosted: 0n,
  }));
  const book = (id) => books.find((a) => a.id === String(id));
  const transfers = [];
  for (const op of ops) {
    if (op.pendingId) {
      const target = transfers.find((t) => t.id === String(op.pendingId));
      const post = Boolean(op.flags & F.POST_PENDING);
      book(target.debitAccountId).debitsPending -= BigInt(target.amount);
      book(target.creditAccountId).creditsPending -= BigInt(target.amount);
      if (post) {
        book(target.debitAccountId).debitsPosted += BigInt(target.amount);
        book(target.creditAccountId).creditsPosted += BigInt(target.amount);
      }
      Object.assign(target, { pending: false, posted: post, voided: !post, resolvedBy: String(op.id) });
      last = legacyCrc(`${op.pendingId}:${op.flags}:${last}`);
      continue;
    }
    const pending = Boolean(op.flags & F.PENDING);
    const bucket = pending ? 'Pending' : 'Posted';
    book(op.debit)[`debits${bucket}`] += BigInt(op.amount);
    book(op.credit)[`credits${bucket}`] += BigInt(op.amount);
    const checksum = legacyCrc(JSON.stringify({ id: String(op.id), debit: String(op.debit), credit: String(op.credit), amount: String(op.amount), prev: last }));
    transfers.push({
      id: String(op.id), debitAccountId: String(op.debit), creditAccountId: String(op.credit), amount: String(op.amount), flags: op.flags || 0,
      pending, posted: !pending, voided: false, userData: op.userData || 0, invoiceId: op.invoiceId || null, code: op.code || '',
      timestamp: String(++clock), checksum, prevChecksum: last, resolvedBy: null,
    });
    last = checksum;
  }
  const text = (a) => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v]));
  return { clock: clock.toString(), lastChecksum: last, accounts: books.map(text), transfers };
}

const LEGACY_ACCOUNTS = [
  { id: 1001, name: 'Cash', type: 'asset', flags: 2 },
  { id: 1002, name: 'Bank', type: 'asset', flags: 0 },
  { id: 1100, name: 'Trade receivables', type: 'asset', flags: 0 },
  { id: 4000, name: 'Sales', type: 'income', flags: 1 },
];

test('legacy emulator reproduces the ebfc5ef fixture byte for byte', () => {
  const snap = legacySnapshot(LEGACY_ACCOUNTS, [
    { id: 101, debit: 1100, credit: 4000, amount: 100000, code: 'SALES', invoiceId: 'INV-001' },
    { id: 102, debit: 1100, credit: 4000, amount: 50000, flags: F.PENDING, code: 'HOLD' },
    { id: 103, debit: 1002, credit: 1100, amount: 20000, flags: F.PENDING, code: 'HOLD-RCPT' },
    { id: 104, pendingId: 102, flags: F.POST_PENDING },
    { id: 105, debit: 1002, credit: 1100, amount: 30000, code: 'RECEIPT', invoiceId: 'INV-001', userData: '2026-08-01' },
    { id: 106, pendingId: 103, flags: F.VOID_PENDING },
  ]);
  snap.accounts.forEach((a, i) => { a.name = LEGACY_EBFC5EF.accounts[i].name; });
  assert.deepEqual(snap, LEGACY_EBFC5EF);
});

test('legacy ledger with thousands of post/void gaps verifies quickly and still catches tampering', () => {
  const ops = [];
  const open = [];
  let id = 1;
  for (let i = 0; i < 3000; i++) {
    const pid = id++;
    ops.push({ id: pid, debit: 1100, credit: 4000, amount: 100 + i, flags: F.PENDING });
    open.push(pid);
    if (i % 3 === 2) {
      const target = open.splice(Math.floor(open.length / 2), 1)[0];
      ops.push({ id: id++, pendingId: target, flags: i % 2 ? F.POST_PENDING : F.VOID_PENDING | F.LINKED });
    }
    if (i % 7 === 0) ops.push({ id: id++, debit: 1002, credit: 1100, amount: 5 });
  }
  const snap = legacySnapshot(LEGACY_ACCOUNTS, ops);
  const started = process.hrtime.bigint();
  const verdict = verifyChain(hydrate(JSON.parse(JSON.stringify(snap))));
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(verdict.ok, true);
  assert.ok(elapsedMs < 5000, `legacy verify took ${elapsedMs} ms`);
  const tampered = JSON.parse(JSON.stringify(snap));
  const resolved = tampered.transfers.find((t) => t.posted && t.flags === F.PENDING);
  resolved.posted = false;
  resolved.voided = true;
  assert.equal(verifyChain(hydrate(tampered)).ok, false);
});
