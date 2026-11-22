import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-qa-bughunt-gst-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { gstr3bPortalJson } from '../src/gstr3b-portal.mjs';
import { paymentFor } from '../src/gst-payment.mjs';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function withCheck(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const product = ALPHABET.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return first14 + ALPHABET[(36 - (sum % 36)) % 36];
}
const PRINCIPAL = withCheck('27AABCU9603R1Z');
const BUYER_MH = withCheck('27AAACS5678G1Z');
const BUYER_KA = withCheck('29AAACS5678G1Z');
const PERIOD = '2026-09';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Zaveri Jewellers', gstin: PRINCIPAL, pan: 'AABCU9603R', state: '27', address: '12 Market Road', city: 'Mumbai', pin: '400002' };
  return state;
}

async function sell(state, args) {
  const made = await runTool(state, 'create_invoice', { date: `${PERIOD}-10`, ...args });
  assert.equal(made.ok, true, JSON.stringify(made));
  return made.invoice;
}

test('GSTR-3B and the GST to pay count B2B sales at 3%, 0.25% and 40%, and a B2B sale shipped to another state, not only 5/12/18/28%', async () => {
  const state = books();
  await sell(state, { partyName: 'Gold Buyer', partyGstin: BUYER_MH, lines: [{ description: 'Gold chain', hsn: '7113', qty: 1, rate: 100000, gstRate: 3 }] });
  await sell(state, { partyName: 'Diamond Buyer', partyGstin: BUYER_MH, lines: [{ description: 'Rough diamond', hsn: '7102', qty: 1, rate: 100000, gstRate: 0.25 }] });
  await sell(state, { partyName: 'Pan Buyer', partyGstin: BUYER_MH, lines: [{ description: 'Pan masala', hsn: '2106', qty: 1, rate: 100000, gstRate: 40 }] });
  await sell(state, { partyName: 'Karnataka Buyer', partyGstin: BUYER_KA, partyState: '27', lines: [{ description: 'Silver coin', hsn: '7106', qty: 1, rate: 100000, gstRate: 3 }] });
  const portal = gstr3bPortalJson(state, PERIOD);
  assert.equal(portal.ok, true, JSON.stringify(portal));
  assert.deepEqual(portal.body.sup_details.osup_det, { txval: 400000, iamt: 0, camt: 23125, samt: 23125, csamt: 0 });
  const pay = paymentFor(state, PERIOD);
  assert.equal(pay.ok, true, JSON.stringify(pay));
  assert.equal(pay.data.output.total, 46250);
});

test('the GSTN filing pack GSTR-3B is net of the month\'s credit notes, the same figures the GST to pay is worked from', async () => {
  const state = books();
  const sale = await sell(state, { partyName: 'Ravi', lines: [{ description: 'Shirt', hsn: '6205', qty: 2, rate: 1000, gstRate: 5 }] });
  const note = await runTool(state, 'create_credit_note', { invoiceId: sale.id, amount: 1050, reason: 'Goods returned', date: `${PERIOD}-12` });
  assert.equal(note.ok, true, JSON.stringify(note));
  const pack = await runTool(state, 'filing_pack', { period: PERIOD });
  assert.equal(pack.ok, true, JSON.stringify(pack));
  assert.deepEqual(pack.data.gstr3b.outward.totals, { interTaxable: 0, interIgst: 0, intraTaxable: 1000, intraCgst: 25, intraSgst: 25 });
  assert.equal(pack.data.payable, 50);
});
