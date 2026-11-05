import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat, propose, confirmPending } from '../src/router.mjs';
import { parseDocument } from '../src/intent.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

const sale = (hsn) => ({ partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', partyState: '27', date: '2026-11-05', lines: [{ description: 'Rolls', qty: 10, rate: 50000, gstRate: 5, ...(hsn ? { hsn } : {}) }] });

async function post(state, args) {
  const held = propose(state, 'create_invoice', args);
  assert.ok(held.preview?.token, held.reply);
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, done.reply);
  return held;
}

test('a B2B sale without an HSN code still counts in GSTR-3B and GST payable, and GSTR-1 names it as left out', async () => {
  const state = books();
  const held = await post(state, sale());
  assert.match(held.reply, /no HSN code, so GSTR-1 leaves it out/);
  const r3b = await runTool(state, 'prepare_gstr3b', { period: '2026-11' });
  assert.equal(r3b.data.outward.totals.intraTaxable, 500000);
  assert.equal(r3b.data.outward.totals.intraCgst, 12500);
  assert.deepEqual(r3b.data.missingHsn, ['INV-0001']);
  const summary = await runTool(state, 'gst_period_summary', { period: '2026-11' });
  assert.equal(summary.data.taxableSales, 500000);
  const r1 = await chat(state, 'prepare GSTR-1');
  assert.match(r1.reply, /Left out of these tables until fixed/);
  assert.match(r1.reply, /INV-0001: no HSN code/);
  const r3bChat = await chat(state, 'prepare gstr-3b for 2026-11');
  assert.match(r3bChat.reply, /INV-0001 has no HSN code: the tax is counted here/);
});

test('an HSN code said in the chat lands on the line and the sale goes into GSTR-1', async () => {
  assert.equal(parseDocument('Invoice Retail Mart GSTIN 27AAACH7409R1Z1, HSN 5208, 10 rolls at 50000, GST 5%').lines[0].hsn, '5208');
  assert.equal(parseDocument('Invoice Retail Mart GSTIN 27AAACH7409R1Z1, 10 rolls at 50000, GST 5%, SAC code 998314').lines[0].hsn, '998314');
  assert.equal(parseDocument('Invoice Retail Mart GSTIN 27AAACH7409R1Z1, HSN 5208, 10 rolls at 50000, GST 5%').lines[0].rate, 50000);
  assert.equal(parseDocument('Invoice Retail Mart GSTIN 27AAACH7409R1Z1, HSN 5208, 10 rolls at 50000, GST 5%').partyName, 'Retail Mart');
  const said = await chat(books(), 'Invoice Retail Mart GSTIN 27AAACH7409R1Z1, HSN 5208, 10 rolls at 50000, GST 5%');
  assert.match(said.reply, /It goes into your GSTR-1/);
  const state = books();
  const held = await post(state, sale('5208'));
  assert.match(held.reply, /It goes into your GSTR-1/);
  const r1 = await runTool(state, 'prepare_gstr1', { period: '2026-11' });
  assert.equal(r1.data.gstr1.totalTaxable, 500000);
  assert.equal(r1.data.gstr1.errors.length, 0);
});

test('a sale without an HSN code points to the code used on the last invoice to the same buyer, without filling it in', async () => {
  const state = books();
  await post(state, sale('5208'));
  const held = propose(state, 'create_invoice', sale());
  assert.match(held.reply, /INV-0001 on 5 November 2026 to this buyer used HSN 5208; say "HSN 5208" if it is the same goods/);
  assert.equal(held.preview.args?.lines?.[0]?.hsn ?? '', '');
});
