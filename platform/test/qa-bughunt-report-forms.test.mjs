import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-report-forms-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { chat, propose, confirmPending as confirm } from '../src/router.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

test('the phone Reports form saves a report through a preview and its token, and deletes one the same way', async () => {
  const state = books();
  const held = await propose(state, 'save_report', { name: 'Owed by customer', metric: 'owed', groupBy: 'customer', period: 'this-month', compare: true });
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.preview.summary, /Owed by customer/);
  assert.equal(Object.keys(state.reports || {}).length, 0, 'nothing is saved before the token comes back');
  const saved = await confirm(state, held.preview.token);
  assert.equal(saved.posted, true, saved.reply);
  assert.equal(state.reports['owed by customer'].metric, 'owed');

  const bad = await propose(state, 'save_report', { name: 'Bad', metric: 'profit' });
  assert.notEqual(bad.awaitingConfirmation, true);
  assert.equal(bad.blocked, true);

  const gone = await propose(state, 'delete_report', { name: 'Owed by customer' });
  assert.equal(gone.awaitingConfirmation, true, gone.reply);
  assert.match(gone.preview.summary, /Owed by customer/);
  const deleted = await confirm(state, gone.preview.token);
  assert.equal(deleted.posted, true, deleted.reply);
  assert.equal(Object.keys(state.reports).length, 0);

  const missing = await propose(state, 'delete_report', { name: 'Nothing here' });
  assert.equal(missing.blocked, true);
});

test('saving a report from chat still needs no confirmation', async () => {
  const state = books();
  const saved = await chat(state, 'save report Top customers: sales by customer this month vs last month');
  assert.equal(saved.awaitingConfirmation, undefined);
  assert.equal(Object.keys(state.reports).length, 1);
});

test('a held report preview survives the books being saved and loaded again, as the hosted API does between requests', async () => {
  const { restoredPending } = await import('../src/chat-confirm.mjs');
  const state = books();
  const held = await propose(state, 'save_report', { name: 'Sales by month', metric: 'sales', groupBy: 'month' });
  assert.equal(held.awaitingConfirmation, true, held.reply);
  const reloaded = JSON.parse(JSON.stringify(state.pendingChatAction));
  assert.equal(restoredPending(reloaded)?.name, 'save_report');
});
