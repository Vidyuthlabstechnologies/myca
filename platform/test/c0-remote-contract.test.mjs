import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createState } from '../src/store.mjs';
import { openSession } from '../src/session.mjs';
import { propose, confirmPending, discardPending, chat } from '../src/router.mjs';
import { REMOTE_QUERY_TOOLS, companyProfilePatch } from '../src/remote-contract.mjs';
import { CONFIRM_TOOLS } from '../src/chat-confirm.mjs';
import { TOOLS } from '../src/tools.mjs';

const SALE = {
  partyName: 'Kiran Stores',
  partyGstin: '',
  lines: [{ description: 'Supply', qty: 1, rate: 8000, gstRate: 18 }],
};

function session() {
  const s = openSession(join(mkdtempSync(join(tmpdir(), 'myca-c0-')), 'state.json'));
  s.state.company = { ...s.state.company, name: 'Test Co', gstin: '27AABCU9603R1ZN', state: '27', pan: 'AABCU9603R' };
  delete s.state.company.setupNeeded;
  return s;
}

test('confirmPending posts once and replays the same answer for a repeated token', async () => {
  const state = createState();
  const { preview } = propose(state, 'create_invoice', SALE);
  const first = await confirmPending(state, preview.token);
  assert.equal(first.posted, true);
  assert.equal(state.invoices.length, 1);
  const again = await confirmPending(state, preview.token);
  assert.equal(again.replayed, true);
  assert.equal(again.posted, true);
  assert.equal(again.reply, first.reply);
  assert.equal(state.invoices.length, 1);
});

test('confirmPending needs a well-formed token and leaves the preview alone without one', async () => {
  const state = createState();
  const { preview } = propose(state, 'create_invoice', SALE);
  for (const bad of ['', 'yes', null, undefined, 'zzzzzzzzzzzz', `${preview.token}0`]) {
    const out = await confirmPending(state, bad);
    assert.equal(out.error, 'TOKEN_REQUIRED');
    assert.equal(out.posted, false);
  }
  assert.equal(state.pendingChatAction.token, preview.token);
  assert.equal(state.invoices.length, 0);
});

test('a wrong token discards the preview and posts nothing', async () => {
  const state = createState();
  propose(state, 'create_invoice', SALE);
  const out = await confirmPending(state, 'abcdefabcdef');
  assert.equal(out.error, 'TOKEN_MISMATCH');
  assert.equal(state.pendingChatAction, null);
  assert.equal(state.invoices.length, 0);
});

test('an old token is not replayed once a newer preview is waiting', async () => {
  const state = createState();
  const first = propose(state, 'create_invoice', SALE);
  await confirmPending(state, first.preview.token);
  propose(state, 'create_invoice', SALE);
  const stale = await confirmPending(state, first.preview.token);
  assert.equal(stale.replayed, true);
  assert.equal(state.invoices.length, 1);
  assert.notEqual(state.pendingChatAction, null);
});

test('discardPending drops a preview and says so when there is none', () => {
  const state = createState();
  assert.match(discardPending(state).reply, /nothing waiting/);
  propose(state, 'create_invoice', SALE);
  const out = discardPending(state);
  assert.match(out.reply, /^Not posted: Invoice to Kiran Stores/);
  assert.equal(state.pendingChatAction, null);
});

test('chat "yes" still confirms, through the same path', async () => {
  const state = createState();
  const { preview } = propose(state, 'create_invoice', SALE);
  const out = await chat(state, 'yes');
  assert.equal(out.posted, true);
  assert.equal(state.lastConfirmation.token, preview.token);
});

test('every remote query tool exists and none of them is a previewed write', () => {
  const names = new Set(TOOLS.map((tool) => tool.name));
  for (const name of REMOTE_QUERY_TOOLS) {
    assert.ok(names.has(name), `${name} is a real tool`);
    assert.ok(!CONFIRM_TOOLS.has(name), `${name} is not a write`);
  }
});

test('session.query runs listed tools and refuses everything else', async () => {
  const s = session();
  const payable = await s.query('gst_payable', {});
  assert.equal(payable.ok, true);
  const invoicesBefore = s.state.invoices.length;
  for (const name of ['seed_demo', 'create_invoice', 'govt_save_credentials', 'approval_decide', 'set_company', 'nope', '']) {
    const out = await s.query(name, SALE);
    assert.equal(out.ok, false, name);
    assert.equal(out.error, 'NOT_QUERYABLE', name);
  }
  assert.equal(s.state.invoices.length, invoicesBefore);
});

test('session.updateCompany changes only profile fields', async () => {
  const s = session();
  const out = await s.updateCompany({ name: 'Kiran Traders', invoiceSeq: 999, ledger: null });
  assert.equal(out.ok, true);
  assert.equal(s.state.company.name, 'Kiran Traders');
  assert.notEqual(s.state.invoiceSeq, 999);
  assert.ok(s.state.ledger);
  assert.deepEqual(companyProfilePatch({ name: 'A', fy: '2020-21', role: 'admin' }), { name: 'A' });
});

test('session.confirm and session.discard are audited', async () => {
  const s = session();
  const { preview } = await s.propose('create_invoice', SALE);
  const posted = await s.confirm(preview.token);
  assert.equal(posted.posted, true);
  await s.propose('create_invoice', SALE);
  await s.discard();
  const actions = s.state.auditEvents.map((event) => event.action);
  assert.ok(actions.includes('chat.confirm'));
  assert.ok(actions.includes('chat.discard'));
});
