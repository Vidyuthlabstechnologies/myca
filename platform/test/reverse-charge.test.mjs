import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { listAccounts, trialBalance } from '../src/ledger.mjs';
import { creditAtRisk } from '../src/gstr2b-check.mjs';

const acc = (state, code) => listAccounts(state.ledger).find((a) => a.code === code);

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

const RCM_BILL = {
  partyName: 'GTA Transport',
  partyGstin: '27AABCT1332L1ZE',
  date: '2026-08-10',
  lines: [{ description: 'Freight', qty: 1, rate: 20000, gstRate: 5 }],
  reverseCharge: true,
};

test('a reverse-charge bill pays the supplier the taxable value only, and the tax is your liability with its credit', async () => {
  const state = books();
  const out = await runTool(state, 'create_purchase', RCM_BILL);
  assert.equal(out.ok, true, JSON.stringify(out));
  const bill = out.invoice;
  assert.equal(bill.reverseCharge, true);
  assert.deepEqual(bill.rcmTax, { cgst: 500, sgst: 500, igst: 0 });
  assert.equal(bill.total, 20000, 'the supplier is not paid the tax');
  assert.equal(acc(state, '80001').creditsPosted, 20000);
  assert.equal(acc(state, '1200').debitsPosted, 500);
  assert.equal(acc(state, '1201').debitsPosted, 500);
  assert.equal(acc(state, '2100').creditsPosted, 500);
  assert.equal(acc(state, '2101').creditsPosted, 500);
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('a reverse-charge bill with blocked credit adds the tax to cost and still records the liability', async () => {
  const state = books();
  const out = await runTool(state, 'create_purchase', { ...RCM_BILL, itcEligible: false });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.invoice.total, 20000);
  assert.equal(acc(state, '80001').creditsPosted, 20000);
  assert.equal(acc(state, '1200')?.debitsPosted || 0, 0);
  assert.equal(acc(state, '5000').debitsPosted, 21000);
  assert.equal(acc(state, '2100').creditsPosted, 500);
  assert.equal(acc(state, '2101').creditsPosted, 500);
  assert.equal(trialBalance(state.ledger).balanced, true);
});

test('the reverse-charge preview says who pays the tax and keeps it out of the supplier total', () => {
  const state = books();
  const preview = previewOf(state, 'create_purchase', RCM_BILL);
  assert.deepEqual(preview.blockers, []);
  assert.match(preview.summary, /under reverse charge/);
  assert.match(preview.summary, /paid by you, not the supplier/);
  assert.equal(preview.figures.total, 20000);
  assert.equal(preview.figures.reverseCharge, true);
  assert.match(preview.effects.join(' '), /stays out of the supplier's GSTR-2B/);
});

test('chat routes reverse-charge words to the purchase tool with the flag set', async () => {
  const state = books();
  const held = await chat(state, 'bill from GTA Transport GSTIN 27AABCT1332L1ZE 20000 GST 5% reverse charge');
  assert.equal(held.preview?.tool, 'create_purchase', held.reply);
  assert.equal(held.preview?.figures?.reverseCharge, true, JSON.stringify(held.preview?.figures));
  assert.match(held.preview?.summary || '', /under reverse charge/);
});

test('a reverse-charge bill never counts as credit at risk in GSTR-2B', async () => {
  const state = books();
  const rcm = await runTool(state, 'create_purchase', RCM_BILL);
  assert.equal(rcm.ok, true, JSON.stringify(rcm));
  const normal = await runTool(state, 'create_purchase', {
    partyName: 'Fabric Co',
    partyGstin: '27AABCT1332L1ZE',
    date: '2026-08-11',
    lines: [{ description: 'Grey cloth', qty: 10, rate: 2000, gstRate: 5 }],
  });
  assert.equal(normal.ok, true, JSON.stringify(normal));
  const risks = creditAtRisk(state, { period: '2026-08' });
  assert.equal(risks.ok, true, JSON.stringify(risks));
  assert.ok(risks.data.risks.every((r) => r.billId !== rcm.invoice.id), 'the RCM bill is not checked against 2B');
  assert.ok(risks.data.risks.some((r) => r.billId === normal.invoice.id), 'an ordinary bill still is');
});
