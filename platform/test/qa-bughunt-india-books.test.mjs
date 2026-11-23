import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-qa-bughunt-books-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';

const SUPPLIER = '27AAACS5678G1Z2';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Patil Hardware', gstin: '27AABCU9603R1ZN', pan: 'AABCU9603R', state: '27', address: '5 Station Road', city: 'Nashik', pin: '422001' };
  return state;
}

const bill = (date, supplierInvoiceNo) => ({ partyName: 'Shree Steel', partyGstin: SUPPLIER, supplierInvoiceNo, date, lines: [{ description: 'Hinges', hsn: '8302', qty: 100, rate: 40, gstRate: 18 }] });

test('a supplier bill number used again in the next financial year is a new bill; in the same year it is a duplicate', async () => {
  const state = books();
  assert.equal((await runTool(state, 'create_purchase', bill('2026-03-20', '001'))).ok, true);
  const nextYear = await runTool(state, 'create_purchase', bill('2026-04-02', '001'));
  assert.equal(nextYear.ok, true, JSON.stringify(nextYear));
  const again = await runTool(state, 'create_purchase', bill('2027-03-31', '001'));
  assert.equal(again.ok, false);
  assert.equal(again.error, 'DUPLICATE_SUPPLIER_BILL');
});
