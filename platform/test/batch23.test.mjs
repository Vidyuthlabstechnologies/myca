import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { localToday } from '../src/dates.mjs';

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
const KARNATAKA = withCheck('29AABCU9603R1Z');

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: PRINCIPAL, state: '27' };
  return state;
}

const MTR = [
  'Order Id,Shipment Date,Transaction Type,Ship To State,Sku,Quantity,Tax Exclusive Gross,Total Tax Amount,Tax Rate,Invoice Amount',
  '403-1,2026-09-03,Shipment,KARNATAKA,SKU-A,1,1000.00,180.00,18,1180.00',
  '403-2,2026-09-04,Shipment,MAHARASHTRA,SKU-A,1,500.00,25.00,5,525.00',
].join('\n');

test('GSTR-1 table 14 reports supplies through an e-commerce operator by its GSTIN once the channel identity is set, and warns until then', async () => {
  const state = books();
  await runTool(state, 'import_marketplace_orders', { csv: MTR, channel: 'amazon' });
  const before = await runTool(state, 'export_gstr1_json', { fp: '092026' });
  assert.equal(before.data.supeco, undefined);
  assert.ok(before.data.warnings.some((w) => /table 14/.test(w)), JSON.stringify(before.data.warnings));
  await runTool(state, 'set_channel_identity', { channel: 'amazon', gstin: '29AAACA1234A1ZX' });
  const after = await runTool(state, 'export_gstr1_json', { fp: '092026' });
  assert.deepEqual(after.data.supeco, { clttx: [{ etin: '29AAACA1234A1ZX', suppval: 1500, igst: 180, cgst: 12.5, sgst: 12.5, csamt: 0 }] });
  assert.ok(!after.data.warnings.some((w) => /table 14/.test(w)));
});

test('the daily checks remind about GSTR-1 and GSTR-3B for each extra registration separately, once', async () => {
  const state = books();
  await runTool(state, 'set_registration', { gstin: KARNATAKA, kind: 'apob', label: 'Amazon BLR' });
  const today = localToday();
  const run = await runTool(state, 'run_automation', { asOf: today, force: true });
  assert.equal(run.ok, true, JSON.stringify(run));
  const texts = (state.reminders || []).map((r) => r.text);
  const forBlr = texts.filter((t) => t.includes('Amazon BLR'));
  const plain = texts.filter((t) => /GSTR-(1|3B)/.test(t) && !t.includes('Amazon BLR'));
  assert.equal(forBlr.length, plain.length, `one reminder per registration: ${JSON.stringify(texts)}`);
  const again = await runTool(state, 'run_automation', { asOf: today, force: true });
  assert.equal(again.data.run.reminders.length, 0, 'nothing is reminded twice');
});
