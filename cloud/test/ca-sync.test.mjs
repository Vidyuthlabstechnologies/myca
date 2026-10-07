import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, SALE } from './helpers.mjs';
import { boundaryOf } from '../src/ca-sync.mjs';

let api;
before(async () => { api = await startApi(); });
after(async () => { await api.close(); });

let serial = 0;
async function setup() {
  serial += 1;
  const n = String(serial).padStart(2, '0');
  const owner = await api.ownerWithBusiness(`+9195000000${n}`, { name: `Sync Traders ${n}`, state: '29' });
  await api.call('POST', `/v1/businesses/${owner.businessId}/invitations`, { token: owner.token, body: { phone: `+9196000000${n}`, role: 'accountant' } });
  const ca = await api.signIn(`+9196000000${n}`);
  const me = await api.call('GET', '/v1/me', { token: ca.accessToken });
  await api.call('POST', `/v1/invitations/${me.body.invitations[0].id}/accept`, { token: ca.accessToken });
  return { owner: { token: owner.token, refresh: owner.refreshToken }, ca: { token: ca.accessToken, refresh: ca.refreshToken }, id: owner.businessId };
}

async function fresh(who) {
  const out = await api.call('POST', '/v1/auth/refresh', { body: { refreshToken: who.refresh } });
  who.token = out.body.accessToken;
  who.refresh = out.body.refreshToken;
}

const at = (b, action) => `/v1/businesses/${b.id}/${action}`;
async function sell(b) {
  const held = await api.call('POST', at(b, 'propose'), { token: b.owner.token, body: { name: 'create_invoice', args: SALE } });
  const done = await api.call('POST', at(b, 'confirm'), { token: b.owner.token, body: { token: held.body.preview.token } });
  assert.equal(done.body.posted, true, done.text);
}
const seen = async (b, who = b.ca) => (await api.call('GET', at(b, 'snapshot'), { token: who.token })).body;
const setMode = (b, mode, who = b.owner) => api.call('POST', at(b, 'ca-sync'), { token: who.token, body: { mode } });

test('by default the accountant sees the live books', async () => {
  const b = await setup();
  assert.deepEqual((await api.call('GET', at(b, 'ca-sync'), { token: b.ca.token })).body.mode, 'live');
  await sell(b);
  const view = await seen(b);
  assert.equal(view.invoices.length, 1);
  assert.equal(view.sharedAsOf, undefined);
});

test('shared only when the owner shares: later entries stay hidden until the next share', async () => {
  const b = await setup();
  await sell(b);
  const set = await setMode(b, 'manual');
  assert.equal(set.status, 200, set.text);
  assert.ok(set.body.sharedAsOf);
  await sell(b);
  const view = await seen(b);
  assert.equal(view.invoices.length, 1, 'the second sale was after the sync point');
  assert.ok(view.sharedAsOf);
  assert.equal((await seen(b, b.owner)).invoices.length, 2, 'the owner always sees live books');
  const shared = await api.call('POST', at(b, 'ca-share'), { token: b.owner.token });
  assert.equal(shared.status, 200, shared.text);
  assert.equal((await seen(b)).invoices.length, 2);
});

test('in a shared view the accountant can read and ask, but not post', async () => {
  const b = await setup();
  await sell(b);
  await setMode(b, 'manual');
  const refused = await api.call('POST', at(b, 'propose'), { token: b.ca.token, body: { name: 'create_invoice', args: SALE } });
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error, 'SHARED_VIEW_READ_ONLY');
  const listed = await api.call('POST', at(b, 'query'), { token: b.ca.token, body: { name: 'list_invoices' } });
  assert.equal(listed.status, 200, listed.text);
  const asked = await api.call('POST', at(b, 'ask'), { token: b.ca.token, body: { message: 'who owes me?' } });
  assert.match(asked.body.reply, /Kiran Stores owes you|Customers owe you/);
  const write = await api.call('POST', at(b, 'ask'), { token: b.ca.token, body: { message: 'invoice Kiran Stores 5000 GST 18%' } });
  assert.match(write.body.reply, /^These books are shared with you as they stood on \d{1,2} [A-Z][a-z]+ \d{4}, so nothing can be posted from here\./);
  const audit = await api.db.query("select count(*)::int as n from audit_log where business_id = $1 and user_id is not null and action <> ''", [b.id]);
  assert.ok(audit.rows[0].n > 0, 'shared reads are still audited');
});

test('daily: the accountant sees the books as they stood at midnight, even if the owner posts before they look', async () => {
  const b = await setup();
  await setMode(b, 'daily');
  await sell(b);
  assert.equal((await seen(b)).invoices.length, 0, 'same day: not yet');
  api.clock.advance(24 * 60 * 60 * 1000);
  await fresh(b.owner);
  await fresh(b.ca);
  await sell(b);
  const view = await seen(b);
  assert.equal(view.invoices.length, 1, 'yesterday\'s sale, not this morning\'s');
  assert.equal(new Date(view.sharedAsOf).getTime(), boundaryOf('daily', api.clock.now).getTime());
});

test('only the owner sets or pushes the sync, and the setting is checked', async () => {
  const b = await setup();
  assert.equal((await setMode(b, 'daily', b.ca)).status, 403);
  assert.equal((await setMode(b, 'hourly')).body.error, 'BAD_SYNC_MODE');
  const live = await api.call('POST', at(b, 'ca-share'), { token: b.owner.token });
  assert.equal(live.status, 409);
  assert.equal(live.body.error, 'CA_SEES_LIVE_BOOKS');
  assert.equal((await setMode(b, 'live')).body.sharedAsOf, null);
});

test('boundaries fall at midnight in India: each day, each Monday, the first of the month', () => {
  const now = Date.parse('2026-10-07T20:00:00Z');
  assert.equal(boundaryOf('daily', now).toISOString(), '2026-10-07T18:30:00.000Z');
  assert.equal(boundaryOf('weekly', now).toISOString(), '2026-10-04T18:30:00.000Z');
  assert.equal(boundaryOf('month_close', now).toISOString(), '2026-09-30T18:30:00.000Z');
  assert.equal(boundaryOf('manual', now), null);
  assert.equal(boundaryOf('live', now), null);
});
