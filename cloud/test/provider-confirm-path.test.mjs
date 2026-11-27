import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { PRIVACY_NOTICE_MY } from '../src/consent.mjs';

const ENV = { MYCA_PROVIDER_ENV: 'off', MYCA_MOCK_MODE: '0', MYCA_MYINVOIS_CLIENT_ID: '', MYCA_MYINVOIS_CLIENT_SECRET: '', MYCA_MYINVOIS_CERT_PATH: '', MYCA_MYINVOIS_KEY_PATH: '', MYCA_MYINVOIS_SANDBOX: '1', MYCA_COUNTRIES: 'MY', MYCA_REGION: 'asia-southeast1' };
const saved = {};
let api;

before(async () => {
  for (const [key, value] of Object.entries(ENV)) { saved[key] = process.env[key]; process.env[key] = value; }
  api = await startApi();
});

after(async () => {
  for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  await api.close();
});

async function business(phone) {
  const session = await api.signIn(phone, { agree: false });
  assert.equal((await api.call('POST', '/v1/me/consent', { token: session.accessToken, body: { document: 'privacy', version: PRIVACY_NOTICE_MY.version, adult: true, sensitive: true } })).status, 200);
  const created = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Kedai Contoh', country: 'MY' } });
  assert.equal(created.status, 200, created.text);
  const id = created.body.business.id;
  const post = (action, body) => api.call('POST', `/v1/businesses/${id}/${action}`, { token: session.accessToken, body });
  return { id, post };
}

function watching() {
  const seen = [];
  const original = api.db.query;
  api.db.query = (text, ...rest) => {
    seen.push(String(text));
    return original.call(api.db, text, ...rest);
  };
  return { seen, stop: () => { api.db.query = original; } };
}

const PROFILE = { name: 'Kedai Contoh Sdn Bhd', tin: 'C20830570210', idType: 'BRN', idValue: '202001234567', msic: '46510', phone: '+60123456789', address: { lines: ['Lot 66'], city: 'Kuala Lumpur', state: 'Selangor' } };
const INVOICE = { number: 'INV-MY-1', buyer: { name: 'Pelanggan Bhd', tin: 'C10987654320', idValue: '199901000111', address: { city: 'Shah Alam', state: '10' } }, lines: [{ description: 'Consulting', classification: '022', quantity: 1, unitPrice: 1000, taxType: '02', taxRateBasisPoints: 800 }] };

async function confirm(post, name, args) {
  const held = await post('propose', { name, args });
  assert.equal(held.status, 200, held.text);
  const done = await post('confirm', { token: held.body.preview.token });
  assert.equal(done.status, 200, done.text);
  return done.body;
}

test('an ordinary confirm never touches the provider journal', async () => {
  const { post } = await business('+60123001111');
  const spy = watching();
  try {
    await confirm(post, 'set_my_einvoice_profile', PROFILE);
  } finally {
    spy.stop();
  }
  assert.equal(spy.seen.some((sql) => /provider_journal/.test(sql)), false);
});

test('confirming a provider tool steps aside, claims the action, works without a lock held and releases the claim', async () => {
  const { post } = await business('+60123002222');
  await confirm(post, 'set_my_einvoice_profile', PROFILE);
  const spy = watching();
  let done;
  try {
    done = await confirm(post, 'issue_my_einvoice', INVOICE);
  } finally {
    spy.stop();
  }
  assert.match(JSON.stringify(done), /submissionUid/);
  assert.equal(spy.seen.some((sql) => /insert into provider_journal/.test(sql)), true, 'the action was claimed');
  assert.equal(spy.seen.some((sql) => /delete from provider_journal/.test(sql)), true, 'and released');
});

test('confirming the same provider preview again does not issue a second e-invoice', async () => {
  const { id, post } = await business('+60123003333');
  await confirm(post, 'set_my_einvoice_profile', PROFILE);
  const held = await post('propose', { name: 'issue_my_einvoice', args: INVOICE });
  const token = held.body.preview.token;
  const answers = await Promise.all([1, 2, 3].map(() => post('confirm', { token })));
  const issued = answers.filter((answer) => answer.body.posted === true && answer.body.replayed !== true);
  assert.ok(issued.length <= 1, JSON.stringify(answers.map((answer) => [answer.status, answer.body.error || answer.body.replayed || answer.body.posted])));
  const claimed = await api.db.query("select count(*)::int as n from provider_journal where business_id = $1 and seq = 0", [id]);
  assert.equal(claimed.rows[0].n, 0, 'no claim is left behind');
  const listed = await post('query', { name: 'my_einvoices', args: {} });
  assert.equal(listed.body.data.documents.filter((doc) => doc.number === 'INV-MY-1').length, 1, 'one e-invoice exists');
});
