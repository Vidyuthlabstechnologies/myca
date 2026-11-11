import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';

const KEY = 'connector-key-for-tests-0123456789abcdef0123456789';
const seen = [];
let api;
let owner;

function reply(data, status = 200) {
  return new Response(JSON.stringify({ code: 200, data, timestamp: Date.now(), transaction_id: 'tx' }), { status });
}

async function fakeSandbox(url, init = {}) {
  const at = new URL(String(url));
  const path = at.pathname;
  const auth = init.headers?.authorization || '';
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
  const sentFile = init.body instanceof FormData ? init.body.get('file') : null;
  seen.push({ host: at.host, method: init.method || 'GET', path, auth, body, file: sentFile ? Buffer.from(await sentFile.arrayBuffer()).toString() : null });
  if (path === '/it/ocr/form-16/pdf') return reply({ 'Part A': { assessment_year: '2026-27', employer: { name: 'Acme Pvt Ltd', tan: 'BLRA12345B' } }, 'Part B': { employee: { pan: 'ABCDE1234F', first_name: 'Asha' }, details_of_salary_paid: { total_taxable_income: 1725000 } } });
  if (path === '/authenticate') return new Response(JSON.stringify({ code: 200, data: { access_token: 'PLATFORM-TOKEN' } }), { status: 200 });
  if (path === '/it/compliance/portal/tax-payer/authorize') {
    if (body?.password !== 'right-password') return new Response(JSON.stringify({ code: 401, message: 'Invalid credentials' }), { status: 400 });
    return reply({ access_token: 'ITD-SESSION-1', expires_in: 3600 });
  }
  if (path === '/itd/portal/tax-payer/ais') return auth === 'ITD-SESSION-1' ? reply({ ais: { tds: 2 } }) : new Response(JSON.stringify({ code: 401 }), { status: 401 });
  if (path === '/tds/compliance/206ab/check') return reply({ pan: body.pan, name: 'ASHA RAO', 'specified_person_us_206ab_&_206cca': 'no', pan_status: 'operative' });
  return new Response(JSON.stringify({ code: 404 }), { status: 404 });
}

const saved = {};
before(async () => {
  for (const [name, value] of Object.entries({ MYCA_PROVIDER_ENV: 'test', MYCA_MOCK_MODE: '0', MYCA_GSP_API_KEY: 'key_test_service', MYCA_GSP_API_SECRET: 'secret_test_service', MYCA_GSP_ENV: 'test' })) {
    saved[name] = process.env[name];
    process.env[name] = value;
  }
  api = await startApi({ connectorKey: KEY, gspFetch: fakeSandbox });
  owner = await api.ownerWithBusiness('+919400000091', { name: 'Asha Traders', gstin: '29AABCU9603R1ZJ', state: '29' });
});
after(async () => {
  await api.close();
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const post = (action, body) => api.call('POST', `/v1/businesses/${owner.businessId}/${action}`, { token: owner.token, body });
const get = (action) => api.call('GET', `/v1/businesses/${owner.businessId}/${action}`, { token: owner.token });

test('the app runs a Quicko lookup on the test host with the service key', async () => {
  const out = await post('quicko', { tool: 'check_206ab', args: { pan: 'ABCDE1234F', consent: true } });
  assert.equal(out.status, 200, out.text);
  assert.equal(out.body.ok, true, out.text);
  assert.equal(out.body.data.specifiedPerson, 'no');
  assert.equal(out.body.mode, 'test');
  const call = seen.find((c) => c.path === '/tds/compliance/206ab/check');
  assert.equal(call.host, 'test-api.sandbox.co.in');
  assert.equal(call.body.consent, 'Y');
});

test('the app cannot run filing or sign-in operations through the general route, or tools outside the list', async () => {
  const filing = await post('quicko', { tool: 'sandbox_operation', args: { operationId: 'quicko_itd_portal_tax_payer_itrs_e_file', params: {} } });
  assert.equal(filing.body.error, 'NOT_FROM_THE_APP');
  const other = await post('quicko', { tool: 'set_company', args: {} });
  assert.equal(other.body.error, 'UNKNOWN_TOOL');
});

test('an income tax portal sign-in is sealed per business, used on the next request, and never sent back', async () => {
  const refused = await post('quicko-session', { portal: 'itd', pan: 'ABCDE1234F', password: 'wrong' });
  assert.equal(refused.body.ok, false, refused.text);
  const before = await post('quicko', { tool: 'sandbox_operation', args: { operationId: 'quicko_itd_portal_tax_payer_ais', params: { query: { financial_year: 'FY 2025-26' } } } });
  assert.equal(before.body.error, 'PORTAL_SESSION_REQUIRED', before.text);
  const signed = await post('quicko-session', { portal: 'itd', pan: 'abcde1234f', password: 'right-password' });
  assert.equal(signed.body.ok, true, signed.text);
  assert.doesNotMatch(signed.text, /ITD-SESSION-1|right-password/);
  const row = await api.db.query('select token, subject from quicko_portal_sessions where business_id = $1', [owner.businessId]);
  assert.equal(row.rows[0].subject, 'ABCDE1234F');
  assert.doesNotMatch(row.rows[0].token, /ITD-SESSION-1/);
  const ais = await post('quicko', { tool: 'sandbox_operation', args: { operationId: 'quicko_itd_portal_tax_payer_ais', params: { query: { financial_year: 'FY 2025-26' } } } });
  assert.equal(ais.body.ok, true, ais.text);
  assert.doesNotMatch(ais.text, /ITD-SESSION-1/);
  const status = await get('quicko');
  assert.equal(status.body.sessions[0].portal, 'itd');
  assert.equal(status.body.sessions[0].connected, true);
  const gone = await post('quicko-session', { portal: 'itd', step: 'disconnect' });
  assert.equal(gone.body.disconnected, true);
  const after = await get('quicko');
  assert.equal(after.body.sessions.length, 0);
});

test('an uploaded Form 16 PDF is read through the hosted route with its stored bytes', async () => {
  const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 hosted form16').toString('base64')}`;
  const up = await post('uploads', { name: 'form16.pdf', content: pdf });
  assert.equal(up.status, 200, up.text);
  const sha = up.body.sha256 || up.body.data?.sha256;
  const out = await post('quicko', { tool: 'read_form16', args: { documentSha256: sha } });
  assert.equal(out.body.ok, true, out.text);
  assert.equal(out.body.data.summary.employer.name, 'Acme Pvt Ltd');
  assert.equal(out.body.data.summary.figuresAsPrinted.totalTaxableIncome, 1725000);
  assert.equal(seen.find((c) => c.path === '/it/ocr/form-16/pdf').file, '%PDF-1.4 hosted form16');
});
