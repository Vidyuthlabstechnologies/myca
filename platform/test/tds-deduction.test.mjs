import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat, propose, confirmPending } from '../src/router.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { listAccounts } from '../src/ledger.mjs';
import { billOutstanding } from '../src/invoice.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { localToday } from '../src/dates.mjs';
import { inWords } from '../src/words.mjs';

const RAO = { tdsSection: '194J', tdsCategory: 'professional', payeePan: 'AAAFR1234K' };

function books({ deductor = true } = {}) {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27', ...(deductor ? { tdsDeductor: true, tan: 'MUMA12345B' } : {}) };
  return state;
}

const bill = (date, rate, gstRate, extra = RAO, partyName = 'Rao & Co') => ({ partyName, date, lines: [{ description: 'Fees', qty: 1, rate, gstRate }], ...extra });

async function post(state, tool, args) {
  const held = propose(state, tool, args);
  assert.ok(held.preview?.token, held.reply);
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, done.reply);
  return { held, done };
}

const payable = (state) => listAccounts(state.ledger).find((a) => a.code === '2200');

test('194J professional fees: nothing under the yearly limit, then 10% on the whole year once it is crossed', async () => {
  const state = books();
  const first = await post(state, 'create_purchase', bill('2026-10-05', 40000, 18));
  assert.equal(first.held.preview.figures.tds, 0);
  assert.match(first.held.reply, /No TDS yet under 194J: payments to Rao & Co this year are within the limit\./);
  const second = await post(state, 'create_purchase', bill('2026-10-20', 20000, 18));
  assert.equal(second.held.preview.figures.tds, 6000);
  assert.equal(second.held.preview.figures.tdsRate, 10);
  assert.match(second.held.reply, /Deduct ₹6,000\.00 TDS under 194J at 10% on ₹20,000\.00 before GST; you owe Rao & Co ₹17,600\.00\. This includes TDS on earlier payments this year/);
  assert.match(second.held.reply, /Deposit it with the government by 7 November 2026\./);
  assert.match(second.held.reply, /your CA has not reviewed yet/);
  assert.match(second.done.reply, /₹6,000\.00 TDS under 194J is held back, so ₹17,600\.00 is owed to Rao & Co\.$/);
  assert.equal(payable(state).creditsPosted, 6000);
  assert.equal(billOutstanding(state.purchases[1]), 17600);
  assert.equal(previewOf(state, 'record_payment', { billId: state.purchases[1].id }).figures.amount, 17600);
});

test('194C contractor: 1% for an individual, 2% for a firm, on a single payment above the limit', async () => {
  const state = books();
  const one = previewOf(state, 'create_purchase', bill('2026-10-06', 35000, 0, { tdsSection: '194C', payeePan: 'ABCPR1234Q' }, 'Ravi'));
  assert.equal(one.figures.tds, 350);
  const firm = previewOf(state, 'create_purchase', bill('2026-10-06', 35000, 0, { tdsSection: '194C', payeePan: 'AAAFR1234K' }, 'Builders'));
  assert.equal(firm.figures.tds, 700);
  const small = previewOf(state, 'create_purchase', bill('2026-10-06', 25000, 0, { tdsSection: '194C', payeePan: 'ABCPR1234Q' }, 'Ravi'));
  assert.equal(small.figures.tds, 0);
});

test('194I rent: 10% on building rent above the monthly limit; an expense pays the net from the bank', async () => {
  const state = books();
  const bank = () => { const a = listAccounts(state.ledger).find((x) => x.code === '1002'); return a ? a.debitsPosted - a.creditsPosted : 0; };
  const before = bank();
  const rent = await post(state, 'post_expense', { narration: 'Office rent', payee: 'Mehta', amount: 60000, gstRate: 0, mode: 'bank', date: '2026-10-01', tdsSection: '194I', tdsAsset: 'building', payeePan: 'ABCPM1234Q' });
  assert.equal(rent.held.preview.figures.tds, 6000);
  assert.match(rent.held.reply, /₹54,000\.00 goes out of your bank\./);
  assert.equal(before - bank(), 54000);
  assert.equal(state.expenses[0].tds.amount, 6000);
  const small = previewOf(state, 'post_expense', { narration: 'Store rent', payee: 'Shah', amount: 40000, gstRate: 0, mode: 'bank', date: '2026-10-01', tdsSection: '194I', tdsAsset: 'building', payeePan: 'ABCPS1234Q' });
  assert.equal(small.figures.tds, 0);
});

test('MyCA refuses to guess: no deductor, no PAN, no 194J category, no 194I asset, an unknown section', () => {
  const plain = books({ deductor: false });
  assert.match(previewOf(plain, 'create_purchase', bill('2026-10-05', 60000, 18)).blockers[0], /not set up to deduct TDS/);
  const state = books();
  const cases = [
    [{ ...RAO, payeePan: 'ABC123' }, /PAN is not in the right form/],
    [{ tdsSection: '194J', payeePan: 'AAAFR1234K' }, /professional services, technical services or director/],
    [{ tdsSection: '194I', payeePan: 'AAAFR1234K' }, /land, building or furniture, or for plant/],
    [{ tdsSection: '194Q', payeePan: 'AAAFR1234K' }, /194A \(interest\), 194C/],
  ];
  for (const [extra, reason] of cases) {
    const preview = previewOf(state, 'create_purchase', bill('2026-10-05', 60000, 18, extra));
    assert.match(String(preview.blockers[0]), reason, JSON.stringify(extra));
  }
  assert.equal(state.purchases.length, 0);
});

test('a deposit clears TDS payable from the bank, defaults to what is due, and refuses too much or a reused challan', async () => {
  const state = books();
  await post(state, 'create_purchase', bill('2026-10-05', 60000, 18));
  assert.equal(previewOf(state, 'record_tds_deposit', { challan: '0510308 05112026 12345', amount: 9000 }).blockers[0], 'That is more than the ₹6,000.00 of TDS still to deposit.');
  const deposit = await post(state, 'record_tds_deposit', { challan: '0510308 05112026 12345', date: '2026-10-07' });
  assert.equal(deposit.done.reply, 'Recorded the TDS deposit of ₹6,000.00 on 7 October 2026, challan 05103080511202612345. Nothing is left to deposit.');
  assert.equal(payable(state).debitsPosted, 6000);
  assert.equal(payable(state).creditsPosted, 6000);
  const summary = (await runTool(state, 'tds_summary', {})).data;
  assert.deepEqual([summary.deducted, summary.deposited, summary.due], [6000, 6000, 0]);
  assert.match(previewOf(state, 'record_tds_deposit', { challan: '0510308 05112026 12345' }).blockers[0], /already recorded|no TDS waiting/);
  assert.deepEqual(deserialize(serialize(state)).tdsEntries, state.tdsEntries);
  assert.deepEqual(deserialize(serialize(state)).tdsDeposits, state.tdsDeposits);
});

test('chat: set up as a deductor, a bill and rent with TDS, the summary and a deposit', async () => {
  const state = books({ deductor: false });
  const said = async (message) => (await chat(state, message)).reply;
  assert.match(await said('we deduct TDS'), /Say the TAN as well/);
  assert.match(await said('we deduct TDS, TAN MUMA12345B'), /^This business deducts TDS, TAN MUMA12345B\./);
  assert.equal(await said('yes'), 'Done. This business deducts TDS under TAN MUMA12345B.');
  const rent = await chat(state, 'paid 60000 office rent to Mehta tds 194I PAN ABCPM1234Q');
  assert.equal(rent.preview?.tool, 'post_expense', rent.reply);
  assert.match(rent.preview.summary, /^Rent: office rent ₹60,000\.00/);
  assert.match(rent.reply, /pay Mehta ₹54,000\.00/);
  await said('yes');
  const fees = await chat(state, 'bill from Rao and Co 60000 for audit GST 18% with TDS u/s 194J professional, PAN AAAFR1234K');
  assert.equal(fees.preview?.figures?.tds, 6000, fees.reply);
  await said('yes');
  assert.match(await said('bill from Ravi 35000 painting GST 0% with tds'), /^Say which TDS section applies/);
  const today = localToday();
  const [y, m] = today.split('-').map(Number);
  const monthName = (year, month) => new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  const depositBy = m === 3 ? `30 April ${y}` : `7 ${monthName(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1)} ${m === 12 ? y + 1 : y}`;
  const summary = await said('my tds');
  assert.ok(summary.startsWith('TDS deducted ₹12,000.00, deposited ₹0.00, still to deposit ₹12,000.00.\n'), summary);
  assert.ok(summary.endsWith(`· ${monthName(y, m)} ${y}: deducted ₹12,000.00, deposit by ${depositBy}`), summary);
  const challanDate = `${today.slice(8, 10)}${today.slice(5, 7)}${today.slice(0, 4)}`;
  assert.match(await said(`deposited TDS, challan 0510308 ${challanDate} 12345`), /^TDS deposit of ₹12,000\.00/);
  assert.match(await said('yes'), /Nothing is left to deposit\.$/);
});

test('the summary is a phone query; the writes are strict and proposable', () => {
  assert.equal(isRemoteQuery('tds_summary'), true);
  assert.equal(validateAssistantToolCall('create_purchase', { partyName: 'A', lines: [{ description: 'x', qty: 1, rate: 1, gstRate: 0 }], tdsSection: '194Z' }).ok, false);
  assert.equal(validateAssistantToolCall('record_tds_deposit', { challan: 'X12345', bsr: '1' }).ok, false);
  assert.equal(validateAssistantToolCall('post_expense', { amount: 1, tdsSection: '194I', tdsAsset: 'building', payeePan: 'ABCPM1234Q' }).ok, true);
});

function monthsAgo(n) {
  const [y, m] = localToday().split('-').map(Number);
  const index = y * 12 + (m - 1) - n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

test('TDS deposit deadlines follow the books: nothing deducted means nothing due, a deposit settles the month', async () => {
  const state = books();
  const deducted = monthsAgo(2);
  const deposits = async () => (await runTool(state, 'deadlines', {})).data.deadlines.filter((row) => row.returnType === 'TDS_DEPOSIT');
  const titles = async () => (await runTool(state, 'exceptions', {})).data.exceptions.map((item) => item.title);
  assert.equal((await deposits()).find((row) => row.period === deducted).level, 'nothing_due');
  assert.equal((await titles()).some((title) => /TDS deposit/.test(title)), false);
  await post(state, 'create_purchase', bill(`${deducted}-05`, 60000, 18));
  assert.equal((await deposits()).find((row) => row.period === deducted).level, 'overdue');
  assert.ok((await titles()).includes(`TDS deposit for ${inWords(deducted)} is not recorded as deposited`));
  await post(state, 'record_tds_deposit', { challan: '0510308 05112026 12345', date: `${monthsAgo(1)}-05` });
  const row = (await deposits()).find((item) => item.period === deducted);
  assert.deepEqual([row.level, row.filed.arn, row.filed.late], ['filed', '05103080511202612345', false]);
  assert.equal((await titles()).some((title) => /TDS deposit/.test(title)), false);
});
