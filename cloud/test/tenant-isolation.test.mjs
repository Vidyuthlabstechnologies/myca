import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startApi, SALE } from './helpers.mjs';
import { PROPOSABLE } from '../src/api.mjs';
import { DEMO_BLOCKED_ACTIONS } from '../src/demo.mjs';

const SOURCE = readFileSync(new URL('../src/api.mjs', import.meta.url), 'utf8');
const ROUTED = [...new Set([
  ...SOURCE.matchAll(/action === '([a-z0-9-]+)'/g),
  ...SOURCE.matchAll(/\['([a-z0-9-]+)', '(?:OWNER_ONLY|SHARED_VIEW_READ_ONLY)'\]/g),
].map((match) => match[1]))].sort();

const ROLES = ['owner', 'staff', 'accountant', 'shared'];
const DENIALS = new Set(['OWNER_ONLY', 'NOT_FOR_STAFF', 'NOT_FOR_ACCOUNTANTS', 'SHARED_VIEW_READ_ONLY', 'BUSINESS_NOT_FOUND', 'NOT_FOUND', 'UNAUTHENTICATED', 'DEMO_BUSINESS']);

const rule = (staff, accountant, shared, owner = '') => ({ owner, staff, accountant, shared });
const EVERYONE = rule('', '', '');
const OWNER = rule('OWNER_ONLY', 'OWNER_ONLY', 'OWNER_ONLY');
const OWNER_WRITES = rule('OWNER_ONLY', 'OWNER_ONLY', 'SHARED_VIEW_READ_ONLY');
const NOT_STAFF = rule('NOT_FOR_STAFF', '', '');
const OWNER_AND_LIVE_ACCOUNTANT = rule('NOT_FOR_STAFF', '', 'SHARED_VIEW_READ_ONLY');
const LIVE_BOOKS = rule('', '', 'SHARED_VIEW_READ_ONLY');
const NOT_ACCOUNTANTS = rule('', 'NOT_FOR_ACCOUNTANTS', 'NOT_FOR_ACCOUNTANTS');
const NO_GET = rule('NOT_FOUND', 'NOT_FOUND', 'NOT_FOUND', 'NOT_FOUND');
const NO_POST = rule('NOT_FOUND', 'NOT_FOUND', 'SHARED_VIEW_READ_ONLY', 'NOT_FOUND');

const MATRIX = {
  access: [OWNER, NO_POST],
  approvals: [EVERYONE, LIVE_BOOKS],
  ask: [NO_GET, EVERYONE],
  brief: [EVERYONE, NOT_ACCOUNTANTS],
  'ca-share': [NO_GET, OWNER],
  'ca-sync': [EVERYONE, OWNER],
  company: [NO_GET, OWNER_WRITES],
  confirm: [NO_GET, LIVE_BOOKS],
  'connector-sync': [NO_GET, OWNER_WRITES],
  connectors: [OWNER, OWNER_WRITES],
  discard: [NO_GET, LIVE_BOOKS],
  einvoice: [NO_GET, LIVE_BOOKS],
  ewaybill: [NO_GET, OWNER_AND_LIVE_ACCOUNTANT],
  export: [OWNER, NO_POST],
  'gst-filings': [OWNER_AND_LIVE_ACCOUNTANT, NO_POST],
  'gst-gstr1': [NO_GET, OWNER_AND_LIVE_ACCOUNTANT],
  'gst-gstr3b': [NO_GET, OWNER_AND_LIVE_ACCOUNTANT],
  'gst-portal': [OWNER_AND_LIVE_ACCOUNTANT, OWNER_AND_LIVE_ACCOUNTANT],
  'gstin-check': [NO_GET, EVERYONE],
  'gusto-connect': [NO_GET, OWNER_WRITES],
  inbound: [OWNER, OWNER_WRITES],
  invitations: [NO_GET, OWNER_WRITES],
  members: [EVERYONE, NO_POST],
  'plaid-exchange': [NO_GET, OWNER_WRITES],
  'plaid-link-token': [NO_GET, OWNER_WRITES],
  propose: [NO_GET, LIVE_BOOKS],
  query: [NO_GET, EVERYONE],
  quicko: [NOT_STAFF, OWNER_AND_LIVE_ACCOUNTANT],
  'quicko-session': [NO_GET, OWNER_AND_LIVE_ACCOUNTANT],
  replace: [NO_GET, OWNER_WRITES],
  snapshot: [EVERYONE, NO_POST],
  subscription: [EVERYONE, OWNER_WRITES],
  'taxjar-rate': [NO_GET, OWNER_WRITES],
  'tds-fvu': [NO_GET, OWNER_AND_LIVE_ACCOUNTANT],
  uploads: [NO_GET, LIVE_BOOKS],
  'us-checkout': [NO_GET, OWNER_WRITES],
  'us-checkout-confirm': [NO_GET, OWNER_WRITES],
  'us-plus': [EVERYONE, NO_POST],
  'us-plus-cancel': [NO_GET, OWNER_WRITES],
  'us-plus-purchase': [NO_GET, OWNER_WRITES],
  'us-return-purchase': [EVERYONE, OWNER_WRITES],
  'us-waitlist': [NO_GET, OWNER_WRITES],
};

const CONNECTOR_KEY = 'connector-key-for-tests-0123456789abcdef0123456789';
const path = (businessId, action) => `/v1/businesses/${businessId}/${action}`;

let api;
let asha;
let bala;
let tokens;
let booksOf;

async function memberOf(phone, businessId, role) {
  const session = await api.signIn(phone);
  await api.db.query('insert into memberships (user_id, business_id, role) values ($1, $2, $3)', [session.user.id, businessId, role]);
  return session;
}

async function rowsAbout(businessId, userId) {
  const version = await api.db.query('select version from books where business_id = $1', [businessId]);
  const access = await api.db.query('select count(*)::int as n from access_log where business_id = $1 and user_id = $2', [businessId, userId]);
  const audit = await api.db.query('select count(*)::int as n from audit_log where business_id = $1 and user_id = $2', [businessId, userId]);
  return { version: Number(version.rows[0].version), access: access.rows[0].n, audit: audit.rows[0].n };
}

before(async () => {
  api = await startApi({ connectorKey: CONNECTOR_KEY });
  asha = await api.ownerWithBusiness('+919100000101', { name: 'Asha Traders', state: '29' });
  bala = await api.ownerWithBusiness('+919100000102', { name: 'Bala Stores', gstin: '27AABCU9603R1ZN' });
  const staff = await memberOf('+919100000103', asha.businessId, 'staff');
  const accountant = await memberOf('+919100000104', asha.businessId, 'accountant');
  const shared = await memberOf('+919100000105', bala.businessId, 'accountant');
  const frozen = await api.call('POST', path(bala.businessId, 'ca-sync'), { token: bala.token, body: { mode: 'manual' } });
  assert.equal(frozen.status, 200, frozen.text);
  tokens = { owner: asha.token, staff: staff.accessToken, accountant: accountant.accessToken, shared: shared.accessToken };
  booksOf = { owner: asha.businessId, staff: asha.businessId, accountant: asha.businessId, shared: bala.businessId };
});
after(async () => { await api.close(); });

test('every business route in api.mjs has a row in the role matrix', () => {
  assert.ok(ROUTED.length >= 40, `only ${ROUTED.length} routes were read from api.mjs`);
  assert.deepEqual(Object.keys(MATRIX).sort(), ROUTED, 'a business route was added or removed: say in MATRIX which roles may call it');
});

test('someone who is not a member gets BUSINESS_NOT_FOUND on every business route and method, and leaves no trace', async () => {
  const held = await api.call('POST', path(bala.businessId, 'propose'), { token: bala.token, body: { name: 'create_invoice', args: SALE } });
  assert.equal(held.status, 200, held.text);
  const before = await rowsAbout(bala.businessId, asha.user.id);
  const body = { name: 'create_invoice', args: SALE, token: held.body.preview.token, message: 'what is my gst payable', mode: 'live', weekly: true, gstin: '27AABCU9603R1ZN', role: 'owner' };
  const targets = ROUTED.map((action) => path(bala.businessId, action)).concat([
    `/v1/businesses/${bala.businessId}`,
    `/v1/businesses/${bala.businessId}/members/${bala.user.id}`,
    `/v1/businesses/${bala.businessId}/inbound/${bala.user.id}`,
    `/v1/businesses/${bala.businessId}/invitations/${bala.user.id}`,
  ]);
  for (const target of targets) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const out = await api.call(method, target, { token: asha.token, body: method === 'GET' ? undefined : body });
      assert.equal(out.status, 404, `${method} ${target}`);
      assert.match(out.body.error, /^(BUSINESS_NOT_FOUND|NOT_FOUND)$/, `${method} ${target}`);
      assert.equal(out.text.includes('Bala'), false, `${method} ${target}`);
    }
  }
  for (const action of ROUTED) {
    const out = await api.call('GET', path(bala.businessId, action), { token: asha.token });
    assert.equal(out.body.error, 'BUSINESS_NOT_FOUND', `GET ${action}`);
    const posted = await api.call('POST', path(bala.businessId, action), { token: asha.token, body });
    assert.equal(posted.body.error, 'BUSINESS_NOT_FOUND', `POST ${action}`);
  }
  assert.deepEqual(await rowsAbout(bala.businessId, asha.user.id), before);
  const kept = await api.call('POST', path(bala.businessId, 'confirm'), { token: bala.token, body: { token: held.body.preview.token } });
  assert.equal(kept.body.posted, true, kept.text);
});

test('no business route answers without a signed-in user', async () => {
  for (const action of ROUTED) {
    for (const method of ['GET', 'POST']) {
      const out = await api.call(method, path(asha.businessId, action), { body: method === 'GET' ? undefined : {} });
      assert.equal(out.status, 401, `${method} ${action}`);
      assert.equal(out.body.error, 'UNAUTHENTICATED', `${method} ${action}`);
    }
  }
});

test('each role reaches exactly the routes the matrix gives it', async () => {
  for (const action of ROUTED) {
    const [reading, writing] = MATRIX[action];
    for (const [method, expected] of [['GET', reading], ['POST', writing]]) {
      for (const role of ROLES) {
        const out = await api.call(method, path(booksOf[role], action), { token: tokens[role], body: method === 'GET' ? undefined : {} });
        const where = `${method} ${action} as ${role}: ${out.status} ${out.text.slice(0, 160)}`;
        if (expected[role]) {
          assert.equal(out.body.error, expected[role], where);
          assert.equal(out.status, expected[role] === 'NOT_FOUND' ? 404 : 403, where);
        } else {
          assert.ok(![401, 403, 404].includes(out.status), where);
          assert.ok(!DENIALS.has(out.body.error), where);
        }
      }
    }
  }
});

test('staff may read and list e-way bills but not create or change them', async () => {
  for (const op of ['get', 'consignee_list']) {
    const out = await api.call('POST', path(asha.businessId, 'ewaybill'), { token: tokens.staff, body: { op } });
    assert.notEqual(out.body.error, 'NOT_FOR_STAFF', op);
  }
  for (const op of ['generate', 'cancel', 'vehicle', 'transporter', 'extend', 'consolidate', 'reject']) {
    const out = await api.call('POST', path(asha.businessId, 'ewaybill'), { token: tokens.staff, body: { op } });
    assert.equal(out.status, 403, op);
    assert.equal(out.body.error, 'NOT_FOR_STAFF', op);
  }
});

test('no tool can be proposed by a stranger or by an accountant on a shared copy of the books', async () => {
  assert.ok(PROPOSABLE.size >= 80);
  const before = await rowsAbout(bala.businessId, asha.user.id);
  for (const name of PROPOSABLE) {
    const stranger = await api.call('POST', path(bala.businessId, 'propose'), { token: asha.token, body: { name, args: {} } });
    assert.equal(stranger.status, 404, name);
    assert.equal(stranger.body.error, 'BUSINESS_NOT_FOUND', name);
    const shared = await api.call('POST', path(bala.businessId, 'propose'), { token: tokens.shared, body: { name, args: {} } });
    assert.equal(shared.status, 403, name);
    assert.equal(shared.body.error, 'SHARED_VIEW_READ_ONLY', name);
  }
  assert.deepEqual(await rowsAbout(bala.businessId, asha.user.id), before);
  assert.equal((await api.books(bala.businessId)).pendingChatAction || null, null);
});

test('who is acting comes from the session even when the arguments name someone else', async () => {
  for (const claim of [{ actorId: asha.user.id }, { role: 'admin' }, { requestedBy: asha.user.id }, { decidedBy: asha.user.id }, { actorId: 'assistant' }]) {
    const refused = await api.call('POST', path(asha.businessId, 'propose'), { token: tokens.staff, body: { name: 'create_invoice', args: { ...SALE, ...claim } } });
    assert.equal(refused.body.blocked, true, JSON.stringify(claim));
    assert.equal(refused.body.preview, undefined, JSON.stringify(claim));
  }
  const held = await api.call('POST', path(asha.businessId, 'propose'), { token: tokens.staff, body: { name: 'create_invoice', args: SALE } });
  assert.equal(held.status, 200, held.text);
  const confirmed = await api.call('POST', path(asha.businessId, 'confirm'), { token: tokens.staff, body: { token: held.body.preview.token } });
  assert.equal(confirmed.body.posted, true, confirmed.text);
  const staffId = (await api.call('GET', '/v1/me', { token: tokens.staff })).body.user.id;
  const events = (await api.books(asha.businessId)).auditEvents.filter((event) => event.action === 'chat.propose' || event.action === 'chat.confirm').slice(-2);
  assert.deepEqual(events.map((event) => event.actorId), [staffId, staffId]);

  const asked = await api.call('POST', path(asha.businessId, 'approvals'), { token: tokens.staff, body: { operation: 'einvoice', invoiceId: 'INV-0001', requestedBy: asha.user.id, actorId: 'assistant' } });
  assert.equal(asked.status, 200, asked.text);
  assert.equal(asked.body.approval.requestedBy, staffId);
  const own = await api.call('POST', path(asha.businessId, 'approvals'), { token: tokens.staff, body: { approvalId: asked.body.approval.approvalId, decision: 'approve', decidedBy: asha.user.id, role: 'admin' } });
  assert.equal(own.body.ok, false, own.text);
  assert.match(own.body.error, /^(MAKER_CHECKER_VIOLATION|APPROVER_ROLE_REQUIRED)$/);
});

test('a demo business is refused every route that reaches a provider, billing or other people', async () => {
  const demo = await api.call('POST', '/v1/businesses', { token: asha.token, body: { demo: true } });
  assert.equal(demo.status, 200, demo.text);
  assert.ok(DEMO_BLOCKED_ACTIONS.has('gstin-check'));
  for (const action of DEMO_BLOCKED_ACTIONS) {
    assert.ok(ROUTED.includes(action), `${action} is blocked for demo businesses but is not a route`);
    const out = await api.call('POST', path(demo.body.business.id, action), { token: asha.token, body: { gstin: '27AABCU9603R1ZN' } });
    assert.equal(out.status, 403, action);
    assert.equal(out.body.error, 'DEMO_BUSINESS', action);
  }
});

test('the Gusto callback refuses a link without a business id and never fails as a server error', async () => {
  const crashesBefore = (await api.db.query('select count(*)::int as n from crash_reports')).rows[0].n;
  for (const state of ['', 'deadbeef.abc', 'deadbeef-dead-beef', `${asha.businessId}x.abc`, '..%2F..%2Fetc.abc', `'%20or%201=1--.abc`]) {
    const out = await api.call('GET', `/v1/oauth/gusto/callback?code=code-1&state=${state}`);
    assert.equal(out.status, 200, `${state}: ${out.text.slice(0, 120)}`);
    assert.match(out.text, /Gusto was not connected/, state);
    assert.match(out.text, /did not carry a business/, state);
  }
  assert.equal(api.logs.filter((entry) => entry.status === 500).length, 0);
  assert.equal((await api.db.query('select count(*)::int as n from crash_reports')).rows[0].n, crashesBefore);
});

test('a Gusto callback with the wrong state is refused before the books are opened', async () => {
  const saved = await api.call('POST', path(asha.businessId, 'connectors'), { token: asha.token, body: { channel: 'gusto', clientId: 'gusto-client-1', clientSecret: 'gusto-secret-1', environment: 'demo' } });
  assert.equal(saved.status, 200, saved.text);
  const connect = await api.call('POST', path(asha.businessId, 'gusto-connect'), { token: asha.token, body: {} });
  assert.equal(connect.status, 200, connect.text);
  const version = async () => Number((await api.db.query('select version from books where business_id = $1', [asha.businessId])).rows[0].version);
  const before = await version();
  const wrong = await api.call('GET', `/v1/oauth/gusto/callback?code=code-1&state=${asha.businessId}.${'f'.repeat(32)}`);
  assert.equal(wrong.status, 200, wrong.text);
  assert.match(wrong.text, /OAUTH_STATE_MISMATCH/);
  assert.equal(await version(), before);
});

test('GSTIN checks are capped per person', async () => {
  const capped = await startApi({ rateLimits: { gstinCheck: { max: 3, windowSeconds: 3600 } } });
  try {
    const owner = await capped.ownerWithBusiness('+919100000106', { name: 'Checks Ltd', state: '29' });
    const second = await capped.ownerWithBusiness('+919100000107', { name: 'Other Ltd', state: '29' });
    const check = (who) => capped.call('POST', path(who.businessId, 'gstin-check'), { token: who.token, body: { gstin: '27AABCU9603R1ZN' } });
    for (let i = 0; i < 3; i += 1) assert.equal((await check(owner)).status, 200);
    const over = await check(owner);
    assert.equal(over.status, 429, over.text);
    assert.equal(over.body.error, 'RATE_LIMITED');
    assert.ok(over.body.retryAfterSeconds > 0);
    assert.equal((await check(second)).status, 200, 'one person reaching the cap does not stop another');
  } finally {
    await capped.close();
  }
});
