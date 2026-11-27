import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { rule, setRuleOverlay } from '../../sprints/statutory-rules/src/index.mjs';
import { createRules } from '../src/rules.mjs';

const admins = [];
let api;
let admin;
let other;
before(async () => {
  api = await startApi({ adminUserIds: () => admins });
  admin = await api.signIn('+919600000071');
  other = await api.signIn('+919600000072');
  admins.push(admin.user.id);
});
after(async () => { await api.close(); });
afterEach(async () => {
  const listed = await api.call('GET', '/v1/admin/rules', { token: admin.accessToken });
  for (const row of listed.body.records.filter((entry) => !entry.revokedAt)) await api.call('DELETE', `/v1/admin/rules/${row.id}`, { token: admin.accessToken, body: { reason: 'cleanup' } });
  setRuleOverlay([]);
});

const record = (id, from, to, value) => ({ id, value, basis: 'period_end', effectiveFrom: from, effectiveTo: to, act: 'CGST', section: 'x', source: 'notification test', attestations: [] });
const add = (body, who = admin) => api.call('POST', '/v1/admin/rules', { token: who.accessToken, body });

test('only an admin can see or change rules; anyone else gets 404', async () => {
  assert.equal((await api.call('GET', '/v1/admin/rules', { token: other.accessToken })).status, 404);
  assert.equal((await add({ record: record('gst.demo.a', '2030-01-01', null, { n: 1 }), reason: 'x' }, other)).status, 404);
  assert.equal((await api.call('DELETE', '/v1/admin/rules/1', { token: other.accessToken, body: { reason: 'x' } })).status, 404);
});

test('an admin adds a rule change, it applies at once, is listed with who and why, and is logged', async () => {
  const sent = await add({ record: record('gst.itc.time-limit', '2030-12-01', null, { month: 12, day: 31, after: 'end_of_financial_year_of_the_invoice', orAnnualReturnIfEarlier: true }), reason: 'Notification 99/2030' });
  assert.equal(sent.status, 200, sent.text);
  assert.equal(sent.body.applied, true);
  assert.equal(rule('gst.itc.time-limit', '2031-01-15').value.day, 31);
  assert.equal(rule('gst.itc.time-limit', '2030-11-30').value.day, 30, 'earlier dates keep the old rule');
  const listed = await api.call('GET', '/v1/admin/rules', { token: admin.accessToken });
  const row = listed.body.records[0];
  assert.equal(row.addedBy, admin.user.id);
  assert.equal(row.reason, 'Notification 99/2030');
  assert.ok(api.logs.some((entry) => entry.rules === 'added' && entry.by === admin.user.id));
});

test('a deactivated change stops applying, and stays in the list as history', async () => {
  const sent = await add({ record: record('gst.demo.b', '2030-01-01', null, { n: 1 }), reason: 'trial' });
  assert.equal(rule('gst.demo.b', '2030-06-01').value.n, 1);
  const gone = await api.call('DELETE', `/v1/admin/rules/${sent.body.ids[0]}`, { token: admin.accessToken, body: { reason: 'withdrawn' } });
  assert.equal(gone.status, 200, gone.text);
  assert.equal(rule('gst.demo.b', '2030-06-01').ok, false);
  const listed = await api.call('GET', '/v1/admin/rules', { token: admin.accessToken });
  assert.equal(listed.body.records[0].revokedReason, 'withdrawn');
  assert.equal((await api.call('DELETE', `/v1/admin/rules/${sent.body.ids[0]}`, { token: admin.accessToken, body: { reason: 'again' } })).status, 404);
});

test('a malformed change, a missing reason, or one that overlaps an active change is refused and nothing changes', async () => {
  assert.equal((await add({ record: record('gst.demo.c', '2030-01-01', null, { n: 1 }) })).status, 400);
  const bad = await add({ record: { ...record('gst.demo.c', '2030-01-01', null, { n: 1 }), act: '' }, reason: 'x' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'RULE_INVALID');
  assert.equal((await add({ reason: 'x' })).status, 400);
  assert.equal((await add({ record: record('gst.demo.c', '2030-01-01', null, { n: 1 }), reason: 'first' })).status, 200);
  const overlap = await add({ record: record('gst.demo.c', '2030-06-01', null, { n: 2 }), reason: 'second' });
  assert.equal(overlap.status, 409);
  assert.equal(overlap.body.error, 'RULE_CONFLICT');
  assert.equal(rule('gst.demo.c', '2030-09-01').value.n, 1);
});

test('another instance picks the change up on its next reload, and a withdrawn change disappears there too', async () => {
  const sent = await add({ record: record('gst.demo.d', '2030-01-01', null, { n: 7 }), reason: 'multi instance' });
  setRuleOverlay([]);
  assert.equal(rule('gst.demo.d', '2030-06-01').ok, false);
  const second = createRules({ db: api.db, now: () => Date.now() });
  assert.equal((await second.load()).changed, true);
  assert.equal(rule('gst.demo.d', '2030-06-01').value.n, 7);
  assert.equal((await second.load()).changed, false, 'nothing new, nothing reloaded');
  await api.call('DELETE', `/v1/admin/rules/${sent.body.ids[0]}`, { token: admin.accessToken, body: { reason: 'withdrawn' } });
  setRuleOverlay([record('gst.demo.d', '2030-01-01', null, { n: 7 })]);
  assert.equal((await second.load()).changed, true);
  assert.equal(rule('gst.demo.d', '2030-06-01').ok, false);
});
