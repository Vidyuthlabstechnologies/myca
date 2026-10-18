import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-close-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { monthCloseOf } from '../src/month-close.mjs';
import { REMOTE_QUERY_TOOLS } from '../src/remote-contract.mjs';
import { localToday } from '../src/dates.mjs';

const TODAY = localToday();
function monthsAgo(n) {
  const [y, m] = TODAY.slice(0, 7).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
const LAST = monthsAgo(1);
const BEFORE = monthsAgo(2);
const SHA = 'a'.repeat(64);

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}
const sale = (state, party, date, rate) => runTool(state, 'create_invoice', { partyName: party, lines: [{ description: 'Cloth', qty: 1, rate, gstRate: 5 }], date });
const bill = (state, party, date, rate, extra = {}) => runTool(state, 'create_purchase', { partyName: party, lines: [{ description: 'Yarn', qty: 1, rate, gstRate: 5 }], date, ...extra });

test('the month close runs nine checks, finds duplicates and missing documents, explains the moves, and locks the books on sign-off', async () => {
  const state = books();
  await sale(state, 'Retail Mart', `${BEFORE}-10`, 100000);
  await sale(state, 'Retail Mart', `${LAST}-05`, 60000);
  await sale(state, 'Kiran Stores', `${LAST}-12`, 20000);
  await bill(state, 'Mehta Fabrics', `${LAST}-08`, 90000, { supplierInvoiceNo: 'MF/27' });
  await bill(state, 'Mehta Fabrics', `${LAST}-10`, 90000, { supplierInvoiceNo: 'MF/29' });
  await bill(state, 'Small Co', `${LAST}-15`, 3000, { supplierInvoiceNo: 'SC/1' });
  await bill(state, 'Documented Co', `${LAST}-16`, 12000, { supplierInvoiceNo: 'DC/4', documentSha256: SHA });
  await runTool(state, 'post_expense', { narration: 'office rent', amount: 25000, payee: 'Landlord', date: `${LAST}-03`, documentSha256: SHA });
  await runTool(state, 'post_expense', { narration: 'repairs', amount: 7000, payee: 'Fixit', date: `${LAST}-20` });
  await runTool(state, 'set_cash_balance', { bank: 200000, cash: 0, on: `${LAST}-28` });

  const close = monthCloseOf(state, { period: LAST });
  assert.equal(close.ok, true, JSON.stringify(close));
  const d = close.data;
  assert.equal(d.checks.length, 9);
  assert.deepEqual(d.duplicates.map((p) => p.ids), [['BILL-0001', 'BILL-0002']]);
  assert.deepEqual(d.withoutDocument.map((r) => r.id), ['BILL-0001', 'BILL-0002', 'EXP-0002']);
  assert.ok(d.moves.some((m) => m.label === 'Sales' && m.pct === -20), JSON.stringify(d.moves));
  assert.ok(d.needsYou.includes('duplicates') && d.needsYou.includes('documents') && d.needsYou.includes('gstr2b') && d.needsYou.includes('moves'));
  assert.equal(d.needsYou.includes('bank'), false);
  assert.equal(d.needsYou.includes('payroll'), false, 'no employees means no payroll check');
  assert.match(d.narrative, /^.* sales ₹84,000 \(down 20% on .*\), purchases ₹2,04,750, expenses ₹32,000\./);
  assert.ok(REMOTE_QUERY_TOOLS.has('month_close'));

  const words = await chat(state, 'close the month');
  assert.match(words.reply, /^Close .*: 9 checks, 4 need you\./, words.reply);
  assert.match(words.reply, /! No possible duplicates: BILL-0001 and BILL-0002 \(Mehta Fabrics, ₹94,500, 2 days apart\)\./);
  assert.match(words.reply, /! Documents for bills and expenses above ₹5,000: 3 without a document/);
  assert.match(words.reply, /Say "approve the close with a note" to sign it off/);

  const noNote = await runTool(state, 'month_close_approve', { period: LAST, draftHash: d.draftHash });
  assert.equal(noNote.error, 'NOTE_REQUIRED');
  const stale = await runTool(state, 'month_close_approve', { period: LAST, draftHash: 'f'.repeat(64), note: 'x' });
  assert.equal(stale.error, 'DRAFT_CHANGED');
  const held = await chat(state, 'approve the close: the two Mehta bills are different consignments');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /books lock through/, held.reply);
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.equal(state.lockThrough, `${LAST}-${new Date(Date.UTC(Number(LAST.slice(0, 4)), Number(LAST.slice(5, 7)), 0)).getUTCDate()}`);
  assert.equal(state.monthCloses[LAST].openItems.length, 4);
  assert.equal(state.monthCloses[LAST].note, 'the two Mehta bills are different consignments');
  const late = await bill(state, 'Late Co', `${LAST}-20`, 1000);
  assert.equal(late.error, 'PERIOD_LOCKED');
  const again = await chat(state, `close ${LAST}`);
  assert.match(again.reply, /Closed on .* by .*; the books are locked through/, again.reply);
  const back = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(back.monthCloses[LAST].draftHash, d.draftHash);
});

test('a month that is not over, or an empty month, is answered honestly', async () => {
  const state = books();
  const current = await runTool(state, 'month_close', { period: TODAY.slice(0, 7) });
  assert.equal(current.error, 'MONTH_NOT_OVER');
  const empty = monthCloseOf(state, { period: LAST }).data;
  assert.equal(empty.checks.find((c) => c.id === 'entries').ok, false);
  const words = await chat(state, 'mahina band karo');
  assert.match(words.reply, /! Entries posted: 0 sales, 0 bills, 0 expenses/, words.reply);
});
