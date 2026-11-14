import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runEngineTool } from '../src/countries/engines.mjs';
import { buildVatReturn } from '../src/countries/united-kingdom/vat.mjs';
import { penaltyPoints } from '../src/countries/united-kingdom/mtd.mjs';

test('a flat rate return with no word on goods spending uses the business\'s own rate, not the limited cost rate', () => {
  const out = buildVatReturn({ periodKey: '26A3', to: '2026-06-30', scheme: 'flat-rate', flatRateBasisPoints: 1450, sales: [{ net: 10000, rate: 'standard' }], purchases: [{ net: 50, rate: 'standard' }] });
  assert.equal(out.ok, true);
  assert.equal(out.data.flatRate.ratePercent, 14.5);
  assert.equal(out.data.flatRate.limitedCostTrader, null);
  assert.equal(out.data.boxes[1], 1740);
  assert.ok(out.data.notes.some((note) => /limited cost trader test was not applied/.test(note) && /16\.5%/.test(note)));
});

test('a flat rate return takes the limited cost answer when the business gives it', () => {
  const told = buildVatReturn({ periodKey: '26A3', to: '2026-06-30', scheme: 'flat-rate', flatRateBasisPoints: 1450, limitedCostTrader: true, sales: [{ net: 10000 }] });
  assert.equal(told.data.flatRate.ratePercent, 16.5);
  assert.equal(told.data.boxes[1], 1980);
  const notLimited = buildVatReturn({ periodKey: '26A3', to: '2026-06-30', scheme: 'flat-rate', flatRateBasisPoints: 1450, limitedCostTrader: false, sales: [{ net: 10000 }], purchases: [{ net: 10, relevantGoods: true }] });
  assert.equal(notLimited.data.flatRate.ratePercent, 14.5);
});

test('flat rate turnover leaves out sales outside the scope of VAT', () => {
  const out = buildVatReturn({ periodKey: '26A3', to: '2026-06-30', scheme: 'flat-rate', flatRateBasisPoints: 1000, limitedCostTrader: false, sales: [{ net: 1000, rate: 'standard' }, { net: 5000, rate: 'outside-scope' }] });
  assert.equal(out.data.flatRate.grossTurnover, 1200);
  assert.equal(out.data.boxes[6], 1200);
  assert.equal(out.data.boxes[1], 120);
});

test('a flat rate business building its return from the books is not put on 16.5% by default, and its bills reclaim no VAT', async () => {
  const { runTool } = await import('../src/tools.mjs');
  const state = createState();
  state.company = { ...(state.company || {}), country: 'GB', name: 'Flat Trader' };
  runEngineTool('set_gb_taxpayer', state, { vrn: 'GB999999973', vatScheme: 'flat-rate', flatRateBasisPoints: 1450 });
  const sale = await runTool(state, 'create_invoice', { partyName: 'Acme Ltd', date: '2026-05-01', lines: [{ description: 'Work', qty: 1, rate: 10000, gstRate: 20 }] });
  assert.equal(sale.ok, true);
  const bill = await runTool(state, 'create_purchase', { partyName: 'Stationers', date: '2026-05-02', lines: [{ description: 'Paper', qty: 1, rate: 100, gstRate: 20 }] });
  assert.equal(bill.ok, true);
  assert.equal(bill.invoice.vatReclaimed, 0);
  assert.equal(bill.invoice.itcEligible, false);
  assert.ok(bill.notes.some((note) => /Flat Rate Scheme/.test(note)));
  const vat = runEngineTool('gb_vat_return_check', state, { periodKey: '26A1', fromBooks: true, from: '2026-04-01', to: '2026-06-30' });
  assert.equal(vat.ok, true, JSON.stringify(vat));
  assert.equal(vat.data.flatRate.ratePercent, 14.5);
  assert.equal(vat.data.boxes[1], 1740);
  assert.equal(vat.data.boxes[4], 0);
});

test('a penalty point below the threshold lapses after 24 months and no longer counts towards the £200 penalty', () => {
  const late = (dueBy, submittedOn) => ({ dueBy, submittedOn });
  const spread = penaltyPoints({ frequency: 'quarterly', regime: 'vat', today: '2031-01-01', submissions: [late('2025-05-07', '2025-05-20'), late('2027-08-07', '2027-08-20'), late('2029-11-07', '2029-11-20'), late('2030-11-07', '2030-11-20')] });
  assert.equal(spread.data.penalties.length, 0);
  assert.equal(spread.data.points, 2);
  const lapsedByToday = penaltyPoints({ frequency: 'annual', regime: 'vat', today: '2029-01-01', submissions: [late('2026-01-31', '2026-02-10')] });
  assert.equal(lapsedByToday.data.points, 0);
  const stillHeld = penaltyPoints({ frequency: 'annual', regime: 'vat', today: '2028-01-31', submissions: [late('2026-01-31', '2026-02-10')] });
  assert.equal(stillHeld.data.points, 1);
  const close = penaltyPoints({ frequency: 'quarterly', regime: 'vat', today: '2027-12-01', submissions: [late('2026-08-07', '2026-08-20'), late('2026-11-07', '2026-11-20'), late('2027-02-07', '2027-02-20'), late('2027-05-07', '2027-05-20')] });
  assert.equal(close.data.points, 4);
  assert.equal(close.data.penalties.length, 1);
});
