import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

test('the daily close lists what was posted, whether the bank is current, settlements, credits, margins and open exceptions, and says what needs you; the daily job carries it', async () => {
  const state = books();
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', lines: [{ description: 'Cotton', hsn: '5205', qty: 1, rate: 1000, gstRate: 5 }], date: '2026-09-15' });
  await runTool(state, 'create_purchase', { partyName: 'Ganga Mills', lines: [{ description: 'Yarn', hsn: '5205', qty: 1, rate: 400, gstRate: 5 }], date: '2026-09-15' });
  const empty = await runTool(state, 'daily_close', { asOf: '2026-09-15' });
  assert.equal(empty.ok, true, JSON.stringify(empty));
  assert.equal(empty.data.status, 'needs you');
  assert.deepEqual(empty.data.needsYou, ['Bank statement current']);
  assert.equal(empty.data.sales.today, 1);
  assert.equal(empty.data.sales.monthTotal, 1050);
  assert.equal(empty.data.purchases.monthTotal, 420);
  assert.equal(empty.data.receivable, 1050);

  await runTool(state, 'set_cash_balance', { on: '2026-09-15', bank: 50000, cash: 2000 });
  await runTool(state, 'import_settlement', { csv: 'order id,description,amount,date\nOD1,Sale,1000,2026-09-14\nOD1,Commission,-100,2026-09-14\nOD1,Late shipment penalty,-50,2026-09-14', channel: 'flipkart' });
  const closed = await runTool(state, 'daily_close', { asOf: '2026-09-15' });
  assert.equal(closed.data.checklist.find((row) => row.item === 'Bank statement current').ok, true);
  assert.equal(closed.data.cash.bank, 50000);
  assert.equal(closed.data.settlements.unmatched, 1);
  assert.equal(closed.data.status, 'needs you');
  assert.ok(closed.data.needsYou.includes('Settlements matched to the bank'), JSON.stringify(closed.data.needsYou));
  assert.ok(closed.data.exceptions.count >= 2, 'the unmatched payout and the penalty are open exceptions');

  const words = await chat(state, 'are the books closed?');
  assert.match(words.reply, /^Books for \d{4}-\d{2}-\d{2}|^Books for \d+ \w+ \d{4}/, words.reply);
  assert.match(words.reply, /! Settlements matched to the bank: 1 imported, 1 not in the bank/, words.reply);
  assert.match(words.reply, /✓ Sales posted/);

  const run = await runTool(state, 'run_automation', { asOf: '2026-09-16', force: true });
  assert.equal(run.ok, true, JSON.stringify(run));
  assert.equal(run.data.run.close.day, '2026-09-16');
  assert.equal(run.data.run.close.status, 'needs you');
  const status = await runTool(state, 'automation_status', {});
  assert.equal(status.data.last.close.sales.month, 1);
  const said = await chat(state, 'daily checks status');
  assert.match(said.reply, /Close: \d+ items? needs? you: /, said.reply);
});
