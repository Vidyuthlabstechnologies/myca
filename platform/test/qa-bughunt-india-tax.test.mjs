import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-qa-bughunt-tax-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { listAccounts, trialBalance } from '../src/ledger.mjs';
import { advanceTax } from '../src/advance-tax.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Kale Stores', gstin: '27AABCU9603R1ZN', pan: 'AABPK1234C', state: '27', address: '9 Main Road', city: 'Satara', pin: '415001', entityType: 'proprietorship' };
  return state;
}

test('advance tax paid and inventory are kept in two accounts, not both in account 1300', async () => {
  const state = books();
  assert.equal((await runTool(state, 'set_sku_cost', { sku: 'RICE', cost: 40 })).ok, true);
  assert.equal((await runTool(state, 'record_stock', { sku: 'RICE', qty: 1000, location: 'own', date: '2026-06-01' })).ok, true);
  const valued = await runTool(state, 'value_inventory', { asOf: '2026-06-30' });
  assert.equal(valued.ok, true, JSON.stringify(valued));
  const paid = await runTool(state, 'record_advance_tax', { amount: 15000, date: '2026-06-14', challan: '0510001234567' });
  assert.equal(paid.ok, true, JSON.stringify(paid));
  const byName = Object.fromEntries(listAccounts(state.ledger).map((account) => [account.name, account]));
  assert.equal(byName.Inventory.debitsPosted - byName.Inventory.creditsPosted, 40000);
  assert.equal(byName['Advance tax paid'].debitsPosted, 15000);
  assert.notEqual(byName.Inventory.code, byName['Advance tax paid'].code);
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('a sale cancelled by a credit note counts once, not twice, in the profit used for advance tax and in the weekly sales', async () => {
  const state = books();
  const sale = await runTool(state, 'create_invoice', { partyName: 'Kiran', lines: [{ description: 'Rice', hsn: '1006', qty: 100, rate: 50, gstRate: 5 }], date: '2026-06-10' });
  assert.equal(sale.ok, true, JSON.stringify(sale));
  const kept = await runTool(state, 'create_invoice', { partyName: 'Mohan', lines: [{ description: 'Rice', hsn: '1006', qty: 200, rate: 50, gstRate: 5 }], date: '2026-06-11' });
  assert.equal(kept.ok, true, JSON.stringify(kept));
  assert.equal((await runTool(state, 'cancel_invoice', { invoiceId: sale.invoice.id, date: '2026-06-12' })).ok, true);
  const estimate = advanceTax(state, { asOf: '2026-06-30' });
  assert.equal(estimate.ok, true, JSON.stringify(estimate));
  assert.equal(estimate.data.toDate.sales, 10000);
  const brief = await runTool(state, 'weekly_brief', { asOf: '2026-06-14' });
  assert.equal(brief.ok, true, JSON.stringify(brief));
  assert.equal(brief.data.sales.thisWeek, 10500);
});
