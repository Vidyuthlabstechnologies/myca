import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:8090';
const PHONE = '9876543210';

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { unparsed: text.slice(0, 200) };
  }
  return { status: res.status, body: parsed };
}

const fail = (step, res) => {
  console.error(`FAIL ${step}: status=${res.status}`, JSON.stringify(res.body).slice(0, 300));
  process.exit(1);
};

let r = await call('POST', '/v1/auth/otp', { body: { phone: PHONE } });
if (r.status !== 200) fail('otp', r);
const challengeId = r.body.challengeId;
console.log('otp ok, challenge:', String(challengeId).slice(0, 12) + '...');

const log = readFileSync('.api-dev.log', 'utf8');
const codes = [...log.matchAll(/\[dev otp\][^\n]*?->\s*(\d{4,8})/g)].map((m) => m[1]);
const fallback = [...log.matchAll(/code[^0-9]*(\d{6})/gi)].map((m) => m[1]);
const code = codes.at(-1) ?? fallback.at(-1);
if (!code) {
  console.error('FAIL verify: no OTP code in server log tail:');
  console.error(log.split('\n').slice(-8).join('\n'));
  process.exit(1);
}

r = await call('POST', '/v1/auth/verify', {
  body: { challengeId, phone: PHONE, code, deviceLabel: 'smoke test' },
});
if (r.status !== 200) fail('verify', r);
const token = r.body.accessToken;
console.log('verify ok, token:', String(token).slice(0, 10) + '...');

r = await call('POST', '/v1/me/consent', {
  token,
  body: { document: 'privacy', version: 'draft-2026-10-07' },
});
if (r.status !== 200 && r.status !== 409) fail('consent', r);
console.log('consent ok:', r.status);

r = await call('POST', '/v1/businesses', {
  token,
  body: { name: 'Smoke Traders', state: '29' },
});
if (r.status !== 200) fail('create-business', r);
const businessId = r.body.business.id;
console.log('business ok:', businessId);

r = await call('GET', `/v1/businesses/${businessId}/snapshot`, { token });
if (r.status !== 200) fail('snapshot', r);
console.log('snapshot ok, keys:', Object.keys(r.body).join(','));

r = await call('POST', `/v1/businesses/${businessId}/ask`, {
  token,
  body: { message: 'What falls due soon?' },
});
if (r.status !== 200) fail('ask', r);
console.log('ask ok, reply length:', JSON.stringify(r.body).length);

r = await call('POST', `/v1/businesses/${businessId}/query`, {
  token,
  body: { name: 'business_summary', args: {} },
});
if (r.status !== 200) fail('query', r);
console.log('query ok:', JSON.stringify(r.body).slice(0, 120));

r = await call('POST', `/v1/businesses/${businessId}/propose`, {
  token,
  body: { name: 'create_invoice', args: { partyName: 'Kiran Stores', lines: [{ description: 'Supply', qty: 1, rate: 8000, gstRate: 18 }] } },
});
if (r.status !== 200) fail('propose', r);
console.log('propose ok, awaiting:', r.body.awaitingConfirmation === true, 'token:', String(r.body.preview?.token ?? '').slice(0, 12) + '...');
const confirmToken = r.body.preview?.token;
if (confirmToken) {
  r = await call('POST', `/v1/businesses/${businessId}/confirm`, { token, body: { token: confirmToken } });
  if (r.status !== 200) fail('confirm', r);
  console.log('confirm ok');
} else {
  console.log('no preview token (posted directly or refused)');
}

r = await call('POST', '/v1/crash-reports', {
  token,
  body: { reports: [{ kind: 'flutter', type: 'StateError', message: 'smoke', stack: 's', appVersion: 'dev', count: 1 }] },
});
if (![200, 202, 204].includes(r.status)) fail('crash-report', r);
console.log('crash-report ok:', r.status);

r = await call('POST', `/v1/businesses/${businessId}/uploads`, {
  token,
  body: { name: 'bill.txt', content: 'smoke upload' },
});
if (r.status !== 200) fail('upload', r);
console.log('upload ok, sha:', String(r.body.sha256 ?? r.body.hash ?? '?').slice(0, 12) + '...');

console.log('SMOKE-PASS businessId=' + businessId);
