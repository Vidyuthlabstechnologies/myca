import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { signPartnerBody, PARTNER_SIGNATURE_HEADER } from '../../platform/src/us-filing-partner.mjs';

const SECRET = 'whsec-partner-0123456789abcdef';
const sessions = [];
const realFetch = globalThis.fetch;
let api;
let year;

before(async () => {
  Object.assign(process.env, {
    MYCA_US_FILER: 'column-tax',
    MYCA_US_FILER_BASE_URL: 'https://api.partner.example',
    MYCA_US_FILER_API_KEY: 'key_test_123',
    MYCA_US_FILER_WEBHOOK_SECRET: SECRET,
    MYCA_PROVIDER_ENV: 'test',
  });
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.partner.example/')) {
      sessions.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: `cu_${sessions.length}`, user_url: `https://file.partner.example/s/${sessions.length}` }), { status: 200 });
    }
    return realFetch(url, init);
  };
  api = await startApi();
  year = 2026;
});

after(async () => {
  globalThis.fetch = realFetch;
  for (const key of ['MYCA_US_FILER', 'MYCA_US_FILER_BASE_URL', 'MYCA_US_FILER_API_KEY', 'MYCA_US_FILER_WEBHOOK_SECRET', 'MYCA_PROVIDER_ENV']) delete process.env[key];
  await api.close();
});

async function household(phone) {
  const session = await api.signIn(phone);
  const created = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Jordan Rivera', country: 'US', kind: 'household' } });
  assert.equal(created.status, 200, created.text);
  return { token: session.accessToken, businessId: created.body.business.id };
}
const post = (who, action, body) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });
const query = (who, name, args) => post(who, 'query', { name, args });

async function write(who, name, args) {
  const proposed = await post(who, 'propose', { name, args });
  assert.equal(proposed.status, 200, proposed.text);
  assert.ok(proposed.body.preview?.token, proposed.text);
  const confirmed = await post(who, 'confirm', { token: proposed.body.preview.token });
  assert.equal(confirmed.status, 200, confirmed.text);
  return confirmed.body;
}

function hook(body, secret = SECRET) {
  const raw = JSON.stringify(body);
  return api.call('POST', '/v1/us/filer/webhook', { raw, headers: { 'content-type': 'application/json', [PARTNER_SIGNATURE_HEADER]: signPartnerBody(raw, secret) } });
}

test('the app hands a return to the e-file partner and the partner webhook moves the 1040 hub status', async () => {
  const who = await household('+919400000181');
  await write(who, 'set_us_taxpayer', { taxYear: String(year), filingStatus: 'single', taxpayer: { firstName: 'Jordan', lastName: 'Rivera', ssn: '400-12-3456', dateOfBirth: '1990-04-02', occupation: 'Designer' }, address: { line1: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' } });
  await write(who, 'add_us_tax_form', { taxYear: String(year), kind: 'W-2', payer: 'Hill Studio', payerTin: '12-3456789', fields: { wages: 60000, federalWithheld: 6000, socialSecurityWages: 60000, socialSecurityTax: 3720, medicareWages: 60000, medicareTax: 870 } });

  const filed = await write(who, 'file_us_return', { taxYear: year, partnerScope: '00000000-0000-4000-8000-000000000000' });
  const handoff = filed.tools?.find((t) => t.name === 'file_us_return')?.result?.data?.handoffUrl;
  assert.equal(sessions.length, 1, JSON.stringify(filed));
  const externalId = sessions[0].external_id;
  assert.ok(externalId.startsWith(`myca.${who.businessId}.${year}.`), 'the server, not the caller, names the business');
  assert.equal(sessions[0].prefill.w2s[0].wages, 60000);
  assert.equal(sessions[0].prefill.taxpayer.ssn, undefined, 'no SSN leaves MyCA unless the operator allows it');
  assert.equal(handoff, 'https://file.partner.example/s/1', JSON.stringify(filed));

  const before = await query(who, 'us_efile_status', { taxYear: year });
  assert.equal(before.body.result?.data?.status ?? before.body.data?.status ?? before.body.status, 'in_progress', before.text);

  const forged = await hook({ type: 'return.accepted', data: { external_id: externalId } }, 'wrong-secret-0123456789abcdef');
  assert.equal(forged.status, 401);

  const submitted = await hook({ type: 'return.submitted', data: { external_id: externalId, submission_id: '12345620270320000001' } });
  assert.equal(submitted.status, 200, submitted.text);
  assert.equal(submitted.body.status, 'submitted');
  const accepted = await hook({ type: 'return.accepted', data: { external_id: externalId } });
  assert.equal(accepted.body.status, 'accepted', accepted.text);

  const after = await query(who, 'us_efile_status', { taxYear: year });
  const status = after.body.result?.data ?? after.body.data ?? after.body;
  assert.equal(status.status, 'accepted', after.text);
  assert.equal(status.route, 'partner');

  const unknown = await hook({ type: 'return.accepted', data: { external_id: `myca.${who.businessId}.${year}.${'f'.repeat(24)}` } });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.ignored, 'FILER_EVENT_UNKNOWN_RETURN');
  const nobody = await hook({ type: 'return.accepted', data: { external_id: `myca.11111111-2222-4333-8444-555555555555.${year}.${'f'.repeat(24)}` } });
  assert.equal(nobody.body.ignored, 'FILER_EVENT_UNKNOWN_RETURN', nobody.text);
});

test('a "yes" in chat confirms a pending US filing the same way: the partner session opens for this business', async () => {
  const who = await household('+919400000182');
  await write(who, 'set_us_taxpayer', { taxYear: String(year), filingStatus: 'single', taxpayer: { firstName: 'Sam', lastName: 'Lee', ssn: '400-12-3457', dateOfBirth: '1991-05-02', occupation: 'Teacher' }, address: { line1: '2 Oak St', city: 'Austin', state: 'TX', zip: '78701' } });
  await write(who, 'add_us_tax_form', { taxYear: String(year), kind: 'W-2', payer: 'School', payerTin: '12-3456780', fields: { wages: 40000, federalWithheld: 3000, socialSecurityWages: 40000, socialSecurityTax: 2480, medicareWages: 40000, medicareTax: 580 } });
  const before = sessions.length;
  const proposed = await post(who, 'propose', { name: 'file_us_return', args: { taxYear: year } });
  assert.ok(proposed.body.preview?.token, proposed.text);
  const said = await post(who, 'ask', { message: 'yes' });
  assert.equal(said.status, 200, said.text);
  assert.equal(sessions.length, before + 1, said.text);
  assert.ok(sessions.at(-1).external_id.startsWith(`myca.${who.businessId}.${year}.`));
});
