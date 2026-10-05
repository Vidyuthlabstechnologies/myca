import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { chat, propose } from '../src/router.mjs';

const SALE = {
  partyName: 'Kiran Stores',
  partyGstin: '',
  lines: [{ description: 'Supply', qty: 2, rate: 4000, gstRate: 18 }],
};

test('propose previews a structured sale with engine figures and posts nothing', () => {
  const state = createState();
  const out = propose(state, 'create_invoice', SALE);
  assert.equal(out.awaitingConfirmation, true);
  assert.equal(out.posted, false);
  assert.equal(out.preview.tool, 'create_invoice');
  assert.equal(out.preview.figures.taxable, 8000);
  assert.equal(out.preview.figures.tax, 1440);
  assert.equal(out.preview.figures.total, 9440);
  assert.equal(state.invoices.length, 0);
});

test('a proposed sale posts only when its token comes back', async () => {
  const state = createState();
  const out = propose(state, 'create_invoice', SALE);
  const posted = await chat(state, `confirm ${out.preview.token}`);
  assert.equal(posted.posted, true);
  assert.equal(state.invoices.length, 1);
  assert.equal(state.invoices[0].total, 9440);
  const again = await chat(state, `confirm ${out.preview.token}`);
  assert.notEqual(again.posted, true);
  assert.equal(state.invoices.length, 1);
});

test('a proposed sale can be discarded', async () => {
  const state = createState();
  propose(state, 'create_invoice', SALE);
  const out = await chat(state, 'no');
  assert.equal(out.posted, false);
  assert.equal(state.invoices.length, 0);
  assert.equal(state.pendingChatAction, null);
});

test('propose refuses tools that are not previewed, and unknown arguments', () => {
  const state = createState();
  const direct = propose(state, 'seed_demo', {});
  assert.equal(direct.blocked, true);
  assert.equal(direct.error, 'NOT_PROPOSABLE');
  const stray = propose(state, 'create_invoice', { ...SALE, surprise: 1 });
  assert.equal(stray.blocked, true);
  assert.equal(state.pendingChatAction, null);
  assert.equal(state.invoices.length, 0);
});

test('a sale with no GST rate is blocked rather than assumed', () => {
  const state = createState();
  const out = propose(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: '', lines: [{ description: 'Supply', qty: 1, rate: 8000 }] });
  assert.notEqual(out.awaitingConfirmation, true);
  assert.equal(state.invoices.length, 0);
});
