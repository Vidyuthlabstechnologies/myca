import { createHmac } from 'node:crypto';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { INBOUND_HEADER } from '../src/inbound.mjs';
import { JOB_HEADER } from '../src/jobs.mjs';
import { OTP_MAX_PER_ADDRESS_PER_HOUR } from '../src/auth.mjs';
import { createJwksKeys } from '../src/oidc.mjs';
import { clientAddress, trustedProxyHops } from '../src/api.mjs';
import { startApi, SALE } from './helpers.mjs';

const CONFIG = { verifyToken: 'verify-me', appSecret: 'app-secret', phoneNumberId: '1234', accessToken: 'tok' };
const JOB_TOKEN = 'job-token-for-tests-0123456789abcdef0123456789';
let api;
const replies = [];
const sender = { async sendText(phone, text) { replies.push({ phone, text }); } };

before(async () => { api = await startApi({ whatsapp: CONFIG, whatsappSender: sender, jobToken: JOB_TOKEN }); });
after(async () => { await api.close(); });

function signed(body) {
  const raw = JSON.stringify(body);
  return { raw, headers: { 'x-hub-signature-256': `sha256=${createHmac('sha256', CONFIG.appSecret).update(raw).digest('hex')}` } };
}
const incoming = (from, id, text) => ({ object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ value: { messaging_product: 'whatsapp', messages: [{ from, id, timestamp: '1', type: 'text', text: { body: text } }] }, field: 'messages' }] }] });
const biz = (who, action) => `/v1/businesses/${who.businessId}/${action}`;

async function withAccountant(ownerPhone, caPhone) {
  const owner = await api.ownerWithBusiness(ownerPhone, { name: 'Shared Traders', state: '29' });
  await api.call('POST', biz(owner, 'invitations'), { token: owner.token, body: { phone: caPhone, role: 'accountant' } });
  const ca = await api.signIn(caPhone);
  const me = await api.call('GET', '/v1/me', { token: ca.accessToken });
  await api.call('POST', `/v1/invitations/${me.body.invitations[0].id}/accept`, { token: ca.accessToken });
  return { owner, ca };
}

test('an accountant on WhatsApp sees the shared books and cannot post when the owner shares them daily', async () => {
  const { owner } = await withAccountant('+919700000101', '+919700000102');
  const held = await api.call('POST', biz(owner, 'propose'), { token: owner.token, body: { name: 'create_invoice', args: SALE } });
  await api.call('POST', biz(owner, 'confirm'), { token: owner.token, body: { token: held.body.preview.token } });
  assert.equal((await api.call('POST', biz(owner, 'ca-sync'), { token: owner.token, body: { mode: 'daily' } })).status, 200);
  const ask = signed(incoming('919700000102', 'wamid.h1', 'Invoice Kiran Stores 1 item at 100 GST 5%'));
  const out = await api.call('POST', '/v1/whatsapp/webhook', ask);
  assert.equal(out.status, 200, out.text);
  assert.match(replies.at(-1).text, /shared with you as they stood/, replies.at(-1).text);
  assert.equal((await api.call('POST', '/v1/whatsapp/webhook', signed(incoming('919700000102', 'wamid.h2', 'yes')))).status, 200);
  const books = (await api.books(owner.businessId));
  assert.equal(books.invoices.length, 1, 'nothing was posted from the accountant on WhatsApp');
  const own = signed(incoming('919700000101', 'wamid.h3', 'who owes me?'));
  await api.call('POST', '/v1/whatsapp/webhook', own);
  assert.doesNotMatch(replies.at(-1).text, /shared with you/);
});

test('the rate-limit address comes from the trusted hop, never from what the caller prepends', () => {
  const req = (xff, socket = '10.0.0.7') => ({ headers: xff == null ? {} : { 'x-forwarded-for': xff }, socket: { remoteAddress: socket } });
  assert.equal(trustedProxyHops({}), 0);
  assert.equal(trustedProxyHops({ K_SERVICE: 'myca-api' }), 1);
  assert.equal(trustedProxyHops({ K_SERVICE: 'myca-api', MYCA_TRUSTED_PROXY_HOPS: '2' }), 2);
  assert.equal(clientAddress(req('1.2.3.4'), 0), '10.0.0.7', 'without a proxy the header is ignored');
  assert.equal(clientAddress(req('spoofed, 203.0.113.9'), 1), '203.0.113.9', 'behind one proxy the last entry is the client');
  assert.equal(clientAddress(req('spoofed, 203.0.113.9, 35.1.1.1'), 2), '203.0.113.9');
  assert.equal(clientAddress(req(null), 1), '', 'behind a proxy a missing header is unknown, not the socket');
});

test('one address cannot burn OTP quotas for many numbers', async () => {
  let last;
  for (let i = 0; i < OTP_MAX_PER_ADDRESS_PER_HOUR; i += 1) {
    last = await api.call('POST', '/v1/auth/otp', { body: { phone: `+9198${String(10000000 + i).padStart(8, '0')}` }, headers: { 'x-forwarded-for': 'spoofed, 203.0.113.9' } });
    assert.equal(last.status, 200, last.text);
  }
  const blocked = await api.call('POST', '/v1/auth/otp', { body: { phone: '+919899999999' }, headers: { 'x-forwarded-for': '203.0.113.9' } });
  assert.equal(blocked.body.error, 'TOO_MANY_REQUESTS');
  const other = await api.call('POST', '/v1/auth/otp', { body: { phone: '+919899999999' }, headers: { 'x-forwarded-for': '203.0.113.10' } });
  assert.equal(other.status, 200, other.text);
  const row = (await api.db.query("select requester from otp_challenges where requester = '203.0.113.9' limit 1")).rows[0];
  assert.equal(row.requester, '203.0.113.9');
});

test('inbound documents and mail respect the storage cap, and a sale id is posted once under concurrent retries', async () => {
  const owner = await api.ownerWithBusiness('+919700000103', { name: 'Cap Traders', state: '29' });
  const docs = (await api.call('POST', biz(owner, 'inbound'), { token: owner.token, body: { label: 'Mail inbox', source: 'documents' } })).body.key;
  const small = await api.call('POST', '/v1/inbound/documents', { headers: { [INBOUND_HEADER]: docs.secret }, body: { name: 'a.txt', content: 'Supplier: Kiran\nTotal: 10' } });
  assert.equal(small.status, 200, small.text);
  const capped = await startApi({ inboundEmail: {}, connectorKey: '' });
  await capped.close();
  const pos = (await api.call('POST', biz(owner, 'inbound'), { token: owner.token, body: { label: 'Till', source: 'pos' } })).body.key;
  const sale = { ...SALE, saleId: 'POS-RACE-1' };
  const results = await Promise.all([1, 2, 3, 4].map(() => api.call('POST', '/v1/inbound/sales', { headers: { [INBOUND_HEADER]: pos.secret }, body: sale })));
  assert.ok(results.every((r) => r.status === 200), results.map((r) => r.text).join('\n'));
  const ids = new Set(results.map((r) => r.body.invoiceId));
  assert.equal(ids.size, 1, `one invoice for one sale id: ${[...ids].join(',')}`);
  assert.equal(results.filter((r) => r.body.duplicate === false).length, 1);
  const books = (await api.books(owner.businessId));
  assert.equal(books.invoices.length, 1);
});

test('a member who switches the Monday brief on gets it on WhatsApp from the weekly job; accountants and the others do not', async () => {
  const { owner } = await withAccountant('+919700000105', '+919700000106');
  await api.call('POST', biz(owner, 'propose'), { token: owner.token, body: { name: 'set_cash_balance', args: { bank: 250000, cash: 0, on: '2026-10-17' } } }).then((held) => api.call('POST', biz(owner, 'confirm'), { token: owner.token, body: { token: held.body.preview.token } }));
  const before = await api.call('GET', biz(owner, 'brief'), { token: owner.token });
  assert.equal(before.body.weekly, false);
  const on = await api.call('POST', biz(owner, 'brief'), { token: owner.token, body: { weekly: true } });
  assert.equal(on.status, 200, on.text);
  assert.equal(on.body.weekly, true);
  assert.equal(on.body.when, 'Monday 07:00 IST');
  const caToken = (await api.signIn('+919700000106')).accessToken;
  const refused = await api.call('POST', biz(owner, 'brief'), { token: caToken, body: { weekly: true } });
  assert.equal(refused.status, 403);
  const sentBefore = replies.length;
  const job = await api.call('POST', '/v1/jobs/weekly', { headers: { [JOB_HEADER]: JOB_TOKEN } });
  assert.equal(job.status, 200, job.text);
  assert.equal(job.body.sent, 1, JSON.stringify(job.body));
  const mine = replies.slice(sentBefore).filter((r) => r.phone === '+919700000105');
  assert.equal(mine.length, 1);
  assert.match(mine[0].text, /^Week of .*\nCash ₹2,50,000\.00/, mine[0].text);
  assert.match(mine[0].text, /The one thing:/);
  assert.equal(replies.slice(sentBefore).some((r) => r.phone === '+919700000106'), false, 'the accountant gets nothing');
  const off = await api.call('POST', biz(owner, 'brief'), { token: owner.token, body: { weekly: false } });
  assert.equal(off.body.weekly, false);
  const again = await api.call('POST', '/v1/jobs/weekly', { headers: { [JOB_HEADER]: JOB_TOKEN } });
  assert.equal(again.body.sent, 0);
});

test('the nightly job skips a business whose owner asked for deletion', async () => {
  const gone = await api.ownerWithBusiness('+919700000104', { name: 'Gone Traders', state: '29' });
  await api.db.query('update businesses set deletion_requested_at = now() where id = $1', [gone.businessId]);
  const daily = await api.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
  assert.equal(daily.status, 200, daily.text);
  const audit = await api.db.query("select count(*)::int as n from audit_log where business_id = $1 and request_id = $2", [gone.businessId, daily.requestId]);
  assert.equal(audit.rows[0].n, 0);
});

test('an unknown key id does not make the service refetch the issuer keys on every request', async () => {
  let fetched = 0;
  let clock = 0;
  const fetchImpl = async () => { fetched += 1; return new Response(JSON.stringify({ keys: [] }), { status: 200, headers: { 'cache-control': 'max-age=600' } }); };
  const keys = createJwksKeys({ url: 'https://issuer.example/keys', fetchImpl, now: () => clock });
  for (let i = 0; i < 50; i += 1) assert.equal(await keys.get(`random-${i}`), null);
  assert.equal(fetched, 1);
  clock = 61000;
  await keys.get('later');
  assert.equal(fetched, 2);
});
