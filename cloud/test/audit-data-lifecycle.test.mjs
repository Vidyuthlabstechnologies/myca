import { createHmac, randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { clearIrpSessions } from '../../platform/src/sandbox-client.mjs';
import { startApi, SALE } from './helpers.mjs';
import { JOB_HEADER } from '../src/jobs.mjs';
import { scrubCrashText, cleanCrashReport } from '../src/crash-reports.mjs';
import { createWahaSender } from '../src/waha.mjs';
import { smsSenderFromEnv } from '../src/sms-sender.mjs';
import { messageKey } from '../src/whatsapp.mjs';

const JOB_TOKEN = 'job-token-for-data-lifecycle-tests-0123456789';
const CONNECTOR_KEY = 'connector-key-for-tests-0123456789abcdef0123456789';
const WAHA_SECRET = 'waha-hook-secret';
const WAHA = { provider: 'waha', waha: { baseUrl: 'http://waha.local', apiKey: 'k', session: 'default', webhookSecret: WAHA_SECRET } };
const DAY = 24 * 60 * 60 * 1000;
const UNKNOWN = '11111111-1111-4111-8111-111111111111';
const realFetch = globalThis.fetch;
const providerCalls = [];
const replies = [];
const sender = { provider: 'waha', async sendText(phone, text) { replies.push({ phone, text }); }, async phoneOfLid() { return ''; } };
let api;

function provider(url, init = {}) {
  const target = new URL(String(url));
  const headers = init.headers || {};
  const body = init.body ? JSON.parse(init.body) : {};
  providerCalls.push({ path: target.pathname, authorization: headers.authorization || '', body });
  const reply = (value, status = 200) => new Response(JSON.stringify(value), { status });
  if (target.pathname === '/authenticate') return reply({ access_token: 'platform-token', expires_in: 3600 });
  if (target.pathname.endsWith('/tax-payer/authenticate')) {
    return body.password === 'right-password'
      ? reply({ code: 200, data: { Status: 1, access_token: 'session-of-the-real-taxpayer', expiry: Date.now() + 3600000 } })
      : reply({ code: 200, data: { Status: 0, ErrorDetails: [{ ErrorCode: '238', ErrorMessage: 'Invalid login credentials' }] } });
  }
  if (target.pathname === '/gst/compliance/e-invoice/tax-payer/invoice') {
    return reply({ code: 200, data: { Status: 1, Data: { Irn: 'SANDBOXIRN'.padEnd(64, '0'), AckNo: 112610000000001, AckDt: '2026-11-05 10:00:00', SignedQRCode: 'qr' } } });
  }
  return reply({ message: 'no route' }, 404);
}

before(async () => {
  globalThis.fetch = async (url, init) => (String(url).startsWith('http://127.0.0.1') ? realFetch(url, init) : provider(url, init));
  api = await startApi({ jobToken: JOB_TOKEN, connectorKey: CONNECTOR_KEY, whatsapp: WAHA, whatsappSender: sender });
});
after(async () => {
  await api.close();
  globalThis.fetch = realFetch;
});

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function everyCell() {
  const tables = await api.db.query(`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`);
  const rows = [];
  for (const { table_name: table } of tables.rows) {
    const found = await api.db.query(`select row_to_json(t)::text as row from "${table}" t`);
    for (const row of found.rows) rows.push({ table, row: row.row });
  }
  return rows;
}

const holding = (rows, needle) => [...new Set(rows.filter((entry) => entry.row.includes(needle)).map((entry) => entry.table))];
const daily = () => api.call('POST', '/v1/jobs/daily', { headers: { [JOB_HEADER]: JOB_TOKEN } });
const path = (who, action) => `/v1/businesses/${who.businessId}/${action}`;

async function onWhatsApp(from, id, text) {
  const raw = JSON.stringify({ event: 'message', session: 'default', payload: { id, from: `${from}@c.us`, fromMe: false, body: text, hasMedia: false } });
  const out = await api.call('POST', '/v1/whatsapp/waha', { raw, headers: { 'x-webhook-hmac': createHmac('sha512', WAHA_SECRET).update(raw).digest('hex'), 'x-webhook-hmac-algorithm': 'sha512' } });
  assert.equal(out.status, 200, out.text);
  return out.body.results[0];
}

async function join(owner, phone, role) {
  const invited = await api.call('POST', path(owner, 'invitations'), { token: owner.token, body: { phone, role } });
  assert.equal(invited.status, 200, invited.text);
  const session = await api.signIn(phone);
  assert.equal((await api.call('POST', `/v1/invitations/${invited.body.invitation.id}/accept`, { token: session.accessToken })).status, 200);
  return { ...session, token: session.accessToken, businessId: owner.businessId };
}

test('a WhatsApp message is remembered by a hash of its id, so the sender\'s number is not kept, and a repeat is still handled once', async () => {
  const member = await api.ownerWithBusiness('+919300000061', { name: 'Hash Traders', state: '29' });
  assert.ok(member.businessId);
  const id = 'false_919300000061@c.us_3EB0A1B2C3D4E5F60718';
  assert.equal((await onWhatsApp('919300000061', id, 'who owes me?')).replied, true);
  assert.equal((await onWhatsApp('919300000061', id, 'who owes me?')).duplicate, true);
  const stored = (await api.db.query('select id from whatsapp_messages')).rows.map((row) => row.id);
  assert.ok(stored.length >= 1);
  for (const value of stored) assert.match(value, /^[a-f0-9]{64}$/);
  assert.ok(stored.includes(messageKey(`waha:${id}`)));

  const old = 'false_919300000061@c.us_OLDROWFROMBEFORE';
  await api.db.query('insert into whatsapp_messages (id, received_at) values ($1, now())', [`waha:${old}`]);
  await api.db.query(readFileSync(new URL('../migrations/027_whatsapp_message_keys.sql', import.meta.url), 'utf8'));
  assert.deepEqual(holding(await everyCell(), '9300000061').filter((table) => table === 'whatsapp_messages'), [], 'the migration leaves no number behind');
  assert.equal((await onWhatsApp('919300000061', old, 'who owes me?')).duplicate, true, 'a message recorded before the migration is still known');
});

test('erasing an account leaves the phone number nowhere: not in WhatsApp rows, not in another business\'s books, not in the logs', async () => {
  const phone = '+919300000062';
  const digits = phone.slice(3);
  const leaving = await api.ownerWithBusiness(phone, { name: 'Leaving Traders', state: '29' });
  const staying = await api.ownerWithBusiness('+919300000063', { name: 'Staying Stores', state: '29' });
  const invited = await api.call('POST', path(staying, 'invitations'), { token: staying.token, body: { phone, role: 'staff' } });
  assert.equal((await api.call('POST', `/v1/invitations/${invited.body.invitation.id}/accept`, { token: leaving.token })).status, 200);
  const held = await api.call('POST', path(staying, 'propose'), { token: leaving.token, body: { name: 'create_invoice', args: SALE } });
  assert.equal((await api.call('POST', path(staying, 'confirm'), { token: leaving.token, body: { token: held.body.preview.token } })).body.posted, true);
  assert.equal((await onWhatsApp(digits.padStart(12, '91'), `false_91${digits}@c.us_AAAA1111`, 'who owes me?')).replied, true);

  assert.equal((await api.call('DELETE', '/v1/me', { token: leaving.token })).status, 200);
  await onWhatsApp(`91${digits}`, `false_91${digits}@c.us_BBBB2222`, 'hello');
  api.clock.advance(25 * DAY);
  await onWhatsApp(`91${digits}`, `false_91${digits}@c.us_CCCC3333`, 'hello again');
  api.clock.advance(6 * DAY);
  const due = await daily();
  assert.equal(due.status, 200, due.text);
  assert.equal(due.body.purge.users, 1, due.text);
  assert.deepEqual(due.body.purge.failed, []);

  const rows = await everyCell();
  assert.deepEqual(holding(rows, digits), [], 'no table holds the number in any form');
  assert.deepEqual(holding(rows, leaving.user.id).filter((table) => table !== 'audit_log'), []);
  const kept = JSON.stringify(await api.books(staying.businessId));
  assert.equal(kept.includes(digits), false, 'the business that stays has no copy of the number in its books');
  assert.equal(kept.includes('INV-0001'), true, 'and keeps the entry the person posted');
  assert.equal(api.logs.some((entry) => JSON.stringify(entry).includes(digits)), false, 'no log line carries the whole number');
});

test('purging a business leaves its id, name and GSTIN in no table', async () => {
  const owner = await api.ownerWithBusiness('+919300000064', { name: 'Zanzibar Spice Exports', gstin: '27AABCU9603R1ZN' });
  assert.equal((await api.call('POST', path(owner, 'connectors'), { token: owner.token, body: { channel: 'razorpay', keyId: 'rzp_test_key', keySecret: 'purge-me-secret' } })).status, 200);
  assert.equal((await api.call('POST', path(owner, 'inbound'), { token: owner.token, body: { label: 'Till', source: 'pos' } })).status, 200);
  assert.equal((await api.call('POST', path(owner, 'uploads'), { token: owner.token, body: { name: 'bill.txt', content: 'Zanzibar Spice Exports bill' } })).status, 200);
  assert.equal((await api.call('POST', path(owner, 'invitations'), { token: owner.token, body: { phone: '+919300000065', role: 'staff' } })).status, 200);
  assert.equal((await onWhatsApp('919300000064', 'false_919300000064@c.us_DDDD4444', 'who owes me?')).replied, true);
  const before = await everyCell();
  assert.ok(holding(before, owner.businessId).length >= 6, holding(before, owner.businessId).join(','));

  assert.equal((await api.call('DELETE', `/v1/businesses/${owner.businessId}`, { token: owner.token })).status, 200);
  api.clock.advance(31 * DAY);
  const due = await daily();
  assert.equal(due.body.purge.businesses >= 1, true, due.text);
  assert.deepEqual(due.body.purge.failed, []);
  const rows = await everyCell();
  for (const needle of [owner.businessId, 'Zanzibar', '27AABCU9603R1ZN', 'purge-me-secret']) assert.deepEqual(holding(rows, needle), [], needle);
});

test('sign-in answers the same for a number with an account and a number without one', async () => {
  await api.ownerWithBusiness('+919300000066', { name: 'Known Traders', state: '29' });
  const shape = (out) => ({ status: out.status, keys: Object.keys(out.body).sort(), error: out.body.error || '', left: out.body.attemptsRemaining });
  const known = await api.call('POST', '/v1/auth/otp', { body: { phone: '+919300000066' } });
  const unknown = await api.call('POST', '/v1/auth/otp', { body: { phone: '+919300000067' } });
  assert.deepEqual(shape(known), shape(unknown));
  assert.deepEqual(shape(known), { status: 200, keys: ['challengeId', 'expiresInSeconds', 'ok'], error: '', left: undefined });
  const wrongKnown = await api.call('POST', '/v1/auth/verify', { body: { challengeId: known.body.challengeId, phone: '+919300000066', code: '000000' } });
  const wrongUnknown = await api.call('POST', '/v1/auth/verify', { body: { challengeId: unknown.body.challengeId, phone: '+919300000067', code: '000000' } });
  assert.deepEqual(shape(wrongKnown), shape(wrongUnknown));
  assert.equal(wrongKnown.body.error, 'INVALID_CODE');
  const strayKnown = await api.call('POST', '/v1/auth/verify', { body: { challengeId: UNKNOWN, phone: '+919300000066', code: '000000' } });
  const strayUnknown = await api.call('POST', '/v1/auth/verify', { body: { challengeId: UNKNOWN, phone: '+919300000067', code: '000000' } });
  assert.deepEqual(shape(strayKnown), shape(strayUnknown));
});

test('an invitation, a device, a member and an invitation id answer the same whether the thing exists for someone else or not at all', async () => {
  const asha = await api.ownerWithBusiness('+919300000068', { name: 'Asha Traders', state: '29' });
  const bala = await api.ownerWithBusiness('+919300000069', { name: 'Bala Stores', state: '29' });
  const shape = (out) => ({ status: out.status, error: out.body.error || '', keys: Object.keys(out.body).sort() });

  const toMember = await api.call('POST', path(asha, 'invitations'), { token: asha.token, body: { phone: '+919300000069', role: 'staff' } });
  const toNobody = await api.call('POST', path(asha, 'invitations'), { token: asha.token, body: { phone: '+919300000070', role: 'staff' } });
  assert.deepEqual(shape(toMember), shape(toNobody));
  assert.deepEqual(Object.keys(toMember.body.invitation).sort(), Object.keys(toNobody.body.invitation).sort());
  assert.equal(JSON.stringify(toMember.body).includes('Bala'), false, 'inviting a number never shows who holds it');

  const devices = await api.call('GET', '/v1/me/devices', { token: bala.token });
  const theirs = await api.call('POST', `/v1/me/devices/${devices.body.devices[0].id}/sign-out`, { token: asha.token });
  const nobodys = await api.call('POST', `/v1/me/devices/${UNKNOWN}/sign-out`, { token: asha.token });
  assert.deepEqual(shape(theirs), shape(nobodys));
  assert.equal(theirs.status, 404);
  assert.equal((await api.call('GET', '/v1/me', { token: bala.token })).status, 200, 'the other person stays signed in');

  const carol = await api.signIn('+919300000071');
  const notMine = await api.call('POST', `/v1/invitations/${toMember.body.invitation.id}/accept`, { token: carol.accessToken });
  const notThere = await api.call('POST', `/v1/invitations/${UNKNOWN}/accept`, { token: carol.accessToken });
  assert.deepEqual(shape(notMine), shape(notThere));
  assert.equal(notMine.status, 404);

  const realPerson = await api.call('DELETE', path(asha, `members/${bala.user.id}`), { token: asha.token });
  const noPerson = await api.call('DELETE', path(asha, `members/${UNKNOWN}`), { token: asha.token });
  assert.deepEqual(shape(realPerson), shape(noPerson));
  assert.equal(realPerson.status, 404);
});

test('the owner\'s export holds no connector secret, no inbound key, no phone number and nothing of another business', async () => {
  const asha = await api.ownerWithBusiness('+919300000072', { name: 'Export Traders', state: '29' });
  await api.ownerWithBusiness('+919300000073', { name: 'Quokka Neighbour Stores', state: '29' });
  assert.equal((await api.call('POST', path(asha, 'connectors'), { token: asha.token, body: { channel: 'razorpay', keyId: 'rzp_test_EXPORTKEY', keySecret: 'export-secret-value-1' } })).status, 200);
  const key = await api.call('POST', path(asha, 'inbound'), { token: asha.token, body: { label: 'Till', source: 'pos' } });
  assert.match(key.body.key.secret, /^mk_/);
  await join(asha, '+919300000074', 'staff');
  const out = await api.call('GET', path(asha, 'export'), { token: asha.token });
  assert.equal(out.status, 200, out.text);
  for (const needle of ['export-secret-value-1', key.body.key.secret, 'Quokka', '9300000072', '9300000074', asha.refreshToken]) {
    assert.equal(out.text.includes(needle), false, needle);
  }
  assert.equal(out.body.members.length, 2);
});

test('a business that saves another taxpayer\'s GSTIN and API user name with a guessed password never rides on that taxpayer\'s e-invoice session', async () => {
  await withEnv({ MYCA_PROVIDER_ENV: 'test', MYCA_MOCK_MODE: '0', MYCA_GSP_TEST_API_KEY: 'key_test_platform', MYCA_GSP_TEST_API_SECRET: 'secret_test_platform' }, async () => {
    clearIrpSessions();
    const sale = { partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', partyAddress: '12 FC Road, Pune 411004', lines: [{ description: 'Fabric', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }] };
    const invoice = async (who) => {
      const held = await api.call('POST', path(who, 'propose'), { token: who.token, body: { name: 'create_invoice', args: sale } });
      assert.equal(held.status, 200, held.text);
      const posted = await api.call('POST', path(who, 'confirm'), { token: who.token, body: { token: held.body.preview.token } });
      assert.equal(posted.body.posted, true, posted.text);
      return (await api.books(who.businessId)).invoices.at(-1).id;
    };
    const company = { gstin: '27AABCU9603R1ZN', address: 'Plot 4, MIDC, Pune 411019', city: 'Pune', pin: '411019' };
    const real = await api.ownerWithBusiness('+919300000075', { name: 'Nalanda Textiles', ...company });
    const other = await api.ownerWithBusiness('+919300000076', { name: 'Borrowed Name Textiles', ...company });
    const nic = (password) => ({ channel: 'nic', username: 'nalanda_api', password, gstin: company.gstin, environment: 'sandbox' });
    assert.equal((await api.call('POST', path(real, 'connectors'), { token: real.token, body: nic('right-password') })).status, 200);
    assert.equal((await api.call('POST', path(other, 'connectors'), { token: other.token, body: nic('a-guess') })).status, 200);

    const mine = await api.call('POST', path(real, 'einvoice'), { token: real.token, body: { invoiceId: await invoice(real) } });
    assert.equal(mine.body.ok, true, mine.text);
    assert.ok(providerCalls.some((call) => call.authorization === 'session-of-the-real-taxpayer'));

    const theirInvoice = await invoice(other);
    providerCalls.length = 0;
    const theirs = await api.call('POST', path(other, 'einvoice'), { token: other.token, body: { invoiceId: theirInvoice } });
    assert.notEqual(theirs.body.ok, true, theirs.text);
    assert.equal(providerCalls.some((call) => call.authorization === 'session-of-the-real-taxpayer'), false, 'the real taxpayer\'s session is not used for them');
    assert.equal(providerCalls.some((call) => call.path.endsWith('/tax-payer/authenticate') && call.body.password === 'a-guess'), true, 'they have to sign in with what they saved');
    assert.equal((await api.books(other.businessId)).invoices.at(-1).sandboxIrn, undefined);
    clearIrpSessions();
  });
});

const PEOPLE = ['Asha Menon', 'Ravi Kumar', 'Leela Traders', 'Kiran Stores'];
const pick = (list) => list[randomInt(list.length)];
const digitsOf = (n, first = '') => first + Array.from({ length: n - first.length }, () => String(randomInt(10))).join('');
const letters = (n) => Array.from({ length: n }, () => String.fromCharCode(65 + randomInt(26))).join('');

function secrets() {
  const pan = `${letters(5)}${digitsOf(4)}${letters(1)}`;
  return {
    phone: digitsOf(10, pick(['6', '7', '8', '9'])),
    email: `${letters(6).toLowerCase()}.${letters(4).toLowerCase()}@example.com`,
    gstin: `${digitsOf(2, pick(['2', '3']))}${pan}1Z${letters(1)}`,
    pan,
    amount: digitsOf(randomInt(5, 9), pick(['1', '2', '3', '4', '5'])),
    ssn: `${digitsOf(3, '5')}-${digitsOf(2, '4')}-${digitsOf(4, '7')}`,
    ein: `${digitsOf(2, '8')}-${digitsOf(7, '3')}`,
    usPhone: `${digitsOf(3, '4')}-${digitsOf(3, '5')}-${digitsOf(4, '0')}`,
    account: digitsOf(randomInt(11, 17), '5'),
    name: pick(PEOPLE),
  };
}

const SHAPES = [
  (s) => `FormatException: Unexpected character (at character 12)\n{"name":"${s.name}","phone":${s.phone},"total":${s.amount},"account":${s.account}}`,
  (s) => `Bad state: phone:${s.phone} gstin:${s.gstin} pan:${s.pan} amount:${s.amount} email:${s.email}`,
  (s) => `duplicate key value violates unique constraint "users_phone_key" Key (phone)=(+91${s.phone}) already exists`,
  (s) => `user_${s.phone} could not pay ${s.amount}.50 from account.${s.account}`,
  (s) => `Invalid argument(s): ssn=${s.ssn} ein:${s.ein} call ${s.usPhone} or (${s.usPhone.slice(0, 3)}) ${s.usPhone.slice(4)}`,
  (s) => `type 'String' is not a subtype of type 'int' in {phone: ${s.phone}, total: ${s.amount}, party: '${s.name}', mail: ${s.email}}`,
  (s) => `HttpException: 422 at https://api.example.in/v1/x?phone=${s.phone}&pan=${s.pan} body [${s.amount},${s.account},${s.phone}]`,
  (s) => `RangeError (index): ${s.account};${s.phone}|${s.amount}/${s.gstin}\t${s.email}`,
];

test('whatever shape an error message takes, a crash report keeps no phone, email, GSTIN, PAN, amount, account, SSN or EIN from it', () => {
  for (let round = 0; round < 4000; round += 1) {
    const seeded = secrets();
    const message = pick(SHAPES)(seeded);
    const clean = scrubCrashText(message);
    for (const [kind, value] of Object.entries(seeded)) {
      if (kind === 'name') continue;
      assert.equal(clean.includes(value), false, `${kind} ${value} survived in ${JSON.stringify(clean)} from ${JSON.stringify(message)}`);
    }
    const report = cleanCrashReport({ kind: 'flutter', type: 'StateError', appVersion: '1.0.0', message, stack: message });
    for (const [kind, value] of Object.entries(seeded)) {
      if (kind === 'name') continue;
      assert.equal(`${report.report.message}\n${report.report.stack}`.includes(value), false, `${kind} ${value} survived in the stored report`);
    }
  }
});

test('a name in quotes is removed, and file, line and column numbers in a stack are kept', () => {
  assert.equal(scrubCrashText('Bad state: "Asha Menon" owes \'Kiran Stores\''), 'Bad state: "[TEXT]" owes \'[TEXT]\'');
  const frames = [
    '#0      _InvoiceScreenState.build (package:myca/screens/invoice_screen.dart:5799:49)',
    '#1      StatelessElement.build (package:flutter/src/widgets/framework.dart:12345:1234)',
    '    at route (file:///app/cloud/src/api.mjs:1234:5678)',
    '    at com.mldynamic.myca.MainActivity.onCreate(MainActivity.kt:10234)',
    '    at A.cV.$1 (main.dart.js:4121:38)',
    '    at Object.a.$2$onError (main.dart.js:912:7)',
  ].join('\n');
  assert.equal(scrubCrashText('refund $1,250.00 or USD 300 due'), 'refund [AMOUNT] or [AMOUNT] due');
  assert.equal(scrubCrashText(frames), frames);
});

test('a provider\'s error text is logged with long numbers masked', async () => {
  const echo = async (url, init) => ({ ok: false, status: 400, text: async () => `{"error":"chat 919300000077@c.us not found, to +919300000077 failed","body":${init.body || '""'}}` });
  await assert.rejects(createWahaSender({ baseUrl: 'https://wa.example.in', apiKey: 'k', session: 's', fetchImpl: echo }).sendText('+919300000077', 'hello'), (err) => {
    assert.equal(err.message.includes('9300000077'), false, err.message);
    assert.match(err.message, /answered 400/);
    assert.match(err.message, /x{9}077/);
    return true;
  });
  await assert.rejects(smsSenderFromEnv({ MYCA_SMS_PROVIDER: 'msg91', MYCA_SMS_MSG91_AUTHKEY: 'key', MYCA_SMS_MSG91_TEMPLATE_ID: 'tpl' }, { fetchImpl: echo }).send('+919300000077', '123456'), (err) => {
    assert.equal(err.message.includes('9300000077'), false, err.message);
    return true;
  });
});
