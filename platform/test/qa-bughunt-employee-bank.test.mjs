import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-employee-bank-'));
process.env.HOME = process.env.APPDATA;
process.env.MYCA_MOCK_MODE = '1';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { propose, confirmPending } from '../src/router.mjs';
import { restoredPending } from '../src/chat-confirm.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

test('the phone records an employee bank account through a preview and its token', async () => {
  const state = books();
  const added = await runTool(state, 'add_employee', { name: 'Ravi Kumar', joinedOn: '2026-04-01', components: [{ name: 'Basic', amount: 30000 }] });
  assert.equal(added.ok, true, JSON.stringify(added));
  const id = added.employee.id;
  const held = await propose(state, 'set_employee_bank', { id, bankAccount: '12345678901', ifsc: 'HDFC0001234' });
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.preview.summary, /Ravi Kumar/);
  assert.match(held.preview.summary, /8901/);
  assert.doesNotMatch(held.preview.summary, /12345678901/);
  assert.equal(state.employees[0].bankAccount || '', '');
  assert.equal(restoredPending(JSON.parse(JSON.stringify(state.pendingChatAction)))?.name, 'set_employee_bank');
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.posted, true, done.reply);
  assert.equal(state.employees[0].bankAccount, '12345678901');
  assert.equal(state.employees[0].ifsc, 'HDFC0001234');

  const unknown = await propose(state, 'set_employee_bank', { id: 'EMP-0099', bankAccount: '12345678901', ifsc: 'HDFC0001234' });
  assert.equal(unknown.blocked, true);
  const wrongIfsc = await propose(state, 'set_employee_bank', { id, bankAccount: '12345678901', ifsc: 'HDFC1234567' });
  assert.equal(wrongIfsc.blocked, true);
});

test('the confirmation of an employee bank account says where they are paid', async () => {
  const state = books();
  const added = await runTool(state, 'add_employee', { name: 'Ravi Kumar', joinedOn: '2026-04-01', components: [{ name: 'Basic', amount: 30000 }] });
  const held = await propose(state, 'set_employee_bank', { id: added.employee.id, bankAccount: '12345678901', ifsc: 'HDFC0001234' });
  const done = await confirmPending(state, held.preview.token);
  assert.equal(done.reply, 'Ravi Kumar is paid into account xxxx8901, HDFC0001234, on the salary payout file.');
});
