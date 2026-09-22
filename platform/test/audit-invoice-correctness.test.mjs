import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice, createPurchase, recordReceipt } from '../src/invoice.mjs';
import { lockPeriod, isPeriodLocked } from '../src/period-lock.mjs';
import { isoDate, localToday } from '../src/dates.mjs';
import { listAccounts, trialBalance } from '../src/ledger.mjs';

const line = (over = {}) => ({ description: 'Fabric', hsn: '5208', qty: 1, rate: 1000, gstRate: 18, ...over });

test('H13: isoDate reads the usual Indian and ISO forms and refuses impossible days', () => {
  assert.equal(isoDate('2026-6-1'), '2026-06-01');
  assert.equal(isoDate('2026/06/01'), '2026-06-01');
  assert.equal(isoDate('01-06-2026'), '2026-06-01');
  assert.equal(isoDate('1/6/2026'), '2026-06-01');
  assert.equal(isoDate('2026-02-30'), null);
  assert.equal(isoDate('June 1'), null);
  assert.equal(isoDate(''), null);
});

test('H13: unnormalised dates no longer slip past a period lock', () => {
  const state = createState();
  lockPeriod(state, '2026-06-30');
  for (const date of ['2026-6-1', '2026/06/01', '15-06-2026']) {
    assert.equal(isPeriodLocked(state, date), true, date);
    const out = createInvoice(state, { date, partyName: 'A', lines: [line()] });
    assert.equal(out.error, 'PERIOD_LOCKED', date);
  }
  assert.equal(isPeriodLocked(state, 'not a date'), true, 'an unreadable date is treated as locked');
  assert.equal(isPeriodLocked(state, '2026-07-01'), false);
});

test('H13: invoices store the normalised date and reject impossible ones', () => {
  const state = createState();
  const ok = createInvoice(state, { date: '2026/08/05', partyName: 'A', lines: [line()] });
  assert.equal(ok.invoice.date, '2026-08-05');
  assert.equal(createInvoice(state, { date: '2026-02-30', partyName: 'A', lines: [line()] }).error, 'INVALID_DATE');
  assert.equal(createPurchase(state, { date: '31/02/2026', partyName: 'V', lines: [line()] }).error, 'INVALID_DATE');
});

test('H13: a blank date means the local day, not the UTC day', () => {
  const state = createState();
  const out = createInvoice(state, { partyName: 'A', lines: [line()] });
  assert.equal(out.invoice.date, localToday());
  assert.equal(localToday(new Date(2026, 8, 22, 1, 0)), '2026-09-22', '01:00 IST is still the 22nd locally');
});

test('H15: same name with a new GSTIN is a new party, and the sale follows the new state', () => {
  const state = createState();
  state.company.state = '27';
  createInvoice(state, { date: '2026-08-01', partyName: 'Sharma Traders', partyGstin: '27AAACH7409R1Z1', lines: [line()] });
  const inter = createInvoice(state, { date: '2026-08-02', partyName: 'Sharma Traders', partyGstin: '29AAACF7856R1ZO', lines: [line()] });
  assert.equal(inter.invoice.partyGstin, '29AAACF7856R1ZO');
  assert.deepEqual([inter.invoice.cgst, inter.invoice.sgst, inter.invoice.igst], [0, 0, 180]);
  assert.equal(state.parties.filter((p) => p.name === 'Sharma Traders').length, 2);
});

test('H15: an unregistered buyer place of supply is taken per invoice, never carried over', () => {
  const state = createState();
  state.company.state = '27';
  createInvoice(state, { date: '2026-08-01', partyName: 'Walk-in', partyState: '29', lines: [line()] });
  const local = createInvoice(state, { date: '2026-08-02', partyName: 'Walk-in', lines: [line()] });
  assert.equal(local.invoice.placeOfSupply, '27');
  assert.deepEqual([local.invoice.cgst, local.invoice.sgst, local.invoice.igst], [90, 90, 0]);
  const away = createInvoice(state, { date: '2026-08-03', partyName: 'Walk-in', partyState: '7', lines: [line()] });
  assert.equal(away.invoice.placeOfSupply, '07');
  assert.equal(away.invoice.igst, 180);
});

test('H15: a receipt settles the invoice party by account, not by a shared name', () => {
  const state = createState();
  const a = createInvoice(state, { date: '2026-08-01', partyName: 'Sharma Traders', partyGstin: '27AAACH7409R1Z1', lines: [line()] });
  const b = createInvoice(state, { date: '2026-08-01', partyName: 'Sharma Traders', partyGstin: '29AAACF7856R1ZO', lines: [line()] });
  const paid = recordReceipt(state, { invoiceId: b.invoice.id, date: '2026-08-10' });
  assert.equal(paid.ok, true);
  const acc = Object.fromEntries(listAccounts(state.ledger).map((x) => [x.id, x]));
  assert.equal(acc[a.invoice.partyAccountId].creditsPosted, 0);
  assert.equal(acc[b.invoice.partyAccountId].creditsPosted, b.invoice.total);
});

test('DUPLICATE_ID: an explicit invoice or bill id already in use is refused, and the sequence skips taken ids', () => {
  const state = createState();
  assert.equal(createInvoice(state, { id: 'INV-0001', date: '2026-08-01', partyName: 'A', lines: [line()] }).ok, true);
  assert.equal(createInvoice(state, { id: 'INV-0001', date: '2026-08-01', partyName: 'A', lines: [line()] }).error, 'DUPLICATE_ID');
  const next = createInvoice(state, { date: '2026-08-02', partyName: 'A', lines: [line()] });
  assert.equal(next.invoice.id, 'INV-0002');
  assert.equal(createPurchase(state, { id: 'B-1', date: '2026-08-01', partyName: 'V', lines: [line()] }).ok, true);
  assert.equal(createPurchase(state, { id: 'B-1', date: '2026-08-01', partyName: 'V', lines: [line()] }).error, 'DUPLICATE_ID');
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('CGST equals SGST on every intra-state line, even at odd paise', () => {
  const state = createState();
  state.company.state = '27';
  const out = createInvoice(state, { date: '2026-08-01', partyName: 'A', partyState: '27', lines: [line({ rate: 1234.57 }), line({ rate: 0.33, gstRate: 5 })] });
  for (const l of out.invoice.lines) assert.equal(l.cgst, l.sgst);
  assert.equal(out.invoice.cgst, out.invoice.sgst);
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('post_expense: GST-inclusive amount splits into equal CGST and SGST that add back exactly', async () => {
  const { runTool } = await import('../src/tools.mjs');
  const state = createState();
  assert.equal((await runTool(state, 'post_expense', { narration: 'Rent', amount: 1180.01, gstRate: 18, date: '2026/08/05' })).ok, true);
  const acc = Object.fromEntries(listAccounts(state.ledger).map((x) => [x.code, x]));
  assert.equal(acc['1200'].debitsPosted, 90);
  assert.equal(acc['1201'].debitsPosted, 90);
  assert.equal(acc['5100'].debitsPosted, 1000.01);
  assert.equal(trialBalance(state.ledger).balanced, true);
  assert.equal((await runTool(state, 'post_expense', { amount: -5 })).error, 'BAD_AMOUNT');
  assert.equal((await runTool(state, 'post_expense', { amount: 10, date: '2026-02-30' })).error, 'INVALID_DATE');
  lockPeriod(state, '2026-08-31');
  assert.equal((await runTool(state, 'post_expense', { amount: 10, date: '2026-8-1' })).error, 'PERIOD_LOCKED');
});
