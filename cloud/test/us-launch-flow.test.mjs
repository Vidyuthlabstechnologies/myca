// The whole 2027-season path for one US filer, with every outside service faked:
// sign in, set up a household, add a W-2, pay the filing fee by card (Stripe test
// mode), hand the return to the e-file partner, and see the IRS acceptance come back.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createBilling } from '../src/billing.mjs';
import { stripeSignature } from '../src/stripe.mjs';
import { signPartnerBody, PARTNER_SIGNATURE_HEADER } from '../../platform/src/us-filing-partner.mjs';
import { startApi } from './helpers.mjs';

const STRIPE_HOOK = 'whsec_test_launch_flow';
const PARTNER_HOOK = 'whsec-partner-launch-0123456789';
const PARTNER_ENV = {
  MYCA_US_FILER: 'column-tax',
  MYCA_US_FILER_BASE_URL: 'https://api.partner.example',
  MYCA_US_FILER_API_KEY: 'key_test_launch',
  MYCA_US_FILER_WEBHOOK_SECRET: PARTNER_HOOK,
  MYCA_PROVIDER_ENV: 'test',
};
const checkouts = new Map();
const partnerSessions = [];
const realFetch = globalThis.fetch;
let nextId = 1;
let api;
let year;

async function fakeStripe(url, init = {}) {
  const text = String(url);
  const form = init.body ? Object.fromEntries(new URLSearchParams(init.body)) : {};
  const json = (status, data) => new Response(JSON.stringify(data), { status });
  if (text === 'https://api.stripe.com/v1/checkout/sessions' && init.method === 'POST') {
    const id = `cs_test_flow_${nextId++}`;
    const metadata = Object.fromEntries(Object.entries(form).filter(([key]) => key.startsWith('metadata[')).map(([key, value]) => [key.slice(9, -1), value]));
    const session = { id, url: `https://checkout.stripe.com/c/pay/${id}`, status: 'open', payment_status: 'unpaid', mode: form.mode, metadata, client_reference_id: form.client_reference_id, amount_total: Number(form['line_items[0][price_data][unit_amount]']), livemode: false };
    checkouts.set(id, session);
    return json(200, session);
  }
  const got = text.match(/^https:\/\/api\.stripe\.com\/v1\/checkout\/sessions\/([^/?]+)$/);
  if (got && checkouts.has(got[1])) return json(200, checkouts.get(got[1]));
  return json(404, {});
}

before(async () => {
  Object.assign(process.env, PARTNER_ENV);
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.partner.example/')) {
      partnerSessions.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: `cu_${partnerSessions.length}`, user_url: `https://file.partner.example/s/${partnerSessions.length}` }), { status: 200 });
    }
    return realFetch(url, init);
  };
  api = await startApi({
    billing: ({ db, now }) => createBilling({
      db,
      now,
      fetchImpl: fakeStripe,
      config: { stripe: { secretKey: 'sk_test_launch', webhookSecret: STRIPE_HOOK, plusPriceId: 'price_plus_yearly', returnUrl: 'https://myca.example/us/paid' } },
    }),
  });
  year = new Date(api.clock.now).getUTCFullYear() - 1;
});

after(async () => {
  globalThis.fetch = realFetch;
  for (const key of Object.keys(PARTNER_ENV)) delete process.env[key];
  await api.close();
});

const post = (who, action, body) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });
const get = (who, path) => api.call('GET', `/v1/businesses/${who.businessId}/${path}`, { token: who.token });

async function write(who, name, args) {
  const proposed = await post(who, 'propose', { name, args });
  assert.equal(proposed.status, 200, proposed.text);
  assert.ok(proposed.body.preview?.token, proposed.text);
  const confirmed = await post(who, 'confirm', { token: proposed.body.preview.token });
  assert.equal(confirmed.status, 200, confirmed.text);
  return confirmed.body;
}

function stripeHook(session) {
  const raw = JSON.stringify({ type: 'checkout.session.completed', data: { object: session } });
  const at = Math.floor(api.clock.now / 1000);
  return api.call('POST', '/v1/billing/stripe/webhook', { raw, headers: { 'stripe-signature': `t=${at},v1=${stripeSignature(STRIPE_HOOK, raw, at)}` } });
}

function partnerHook(body) {
  const raw = JSON.stringify(body);
  return api.call('POST', '/v1/us/filer/webhook', { raw, headers: { 'content-type': 'application/json', [PARTNER_SIGNATURE_HEADER]: signPartnerBody(raw, PARTNER_HOOK) } });
}

test('a US filer prepares a return, pays by card in Stripe test mode, and e-files through the partner', async () => {
  const session = await api.signIn('+919400000191');
  const created = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Avery Stone', country: 'US', kind: 'household' } });
  assert.equal(created.status, 200, created.text);
  const who = { token: session.accessToken, businessId: created.body.business.id };

  await write(who, 'set_us_taxpayer', { taxYear: String(year), filingStatus: 'single', taxpayer: { firstName: 'Avery', lastName: 'Stone', ssn: '400-12-3458', dateOfBirth: '1988-09-12', occupation: 'Nurse' }, address: { line1: '9 Elm St', city: 'Denver', state: 'CO', zip: '80202' } });
  await write(who, 'add_us_tax_form', { taxYear: String(year), kind: 'W-2', payer: 'City Hospital', payerTin: '12-3456781', fields: { wages: 72000, federalWithheld: 8100, socialSecurityWages: 72000, socialSecurityTax: 4464, medicareWages: 72000, medicareTax: 1044 } });

  // Preparing is free; filing is not, and nothing reaches the partner before the fee.
  const unpaid = await get(who, `us-return-purchase?taxYear=${year}`);
  assert.equal(unpaid.body.paid, false, unpaid.text);
  assert.equal(unpaid.body.checkout, 'card');
  const refused = await post(who, 'propose', { name: 'file_us_return', args: { taxYear: year } });
  assert.equal(refused.body.error, 'US_RETURN_UNPAID', refused.text);
  assert.equal(partnerSessions.length, 0, 'no partner session before the fee is paid');

  // The fee by card: Stripe Checkout in test mode, recorded by the signed webhook.
  const checkout = await post(who, 'us-checkout', { product: 'return', taxYear: year });
  assert.equal(checkout.status, 200, checkout.text);
  assert.match(checkout.body.url, /^https:\/\/checkout\.stripe\.com\//);
  const paidSession = Object.assign(checkouts.get(checkout.body.sessionId), { status: 'complete', payment_status: 'paid' });
  const recorded = await stripeHook(paidSession);
  assert.equal(recorded.body.recorded, true, recorded.text);
  const paid = await get(who, `us-return-purchase?taxYear=${year}`);
  assert.equal(paid.body.paid, true, paid.text);
  assert.equal(paid.body.testPurchase, true, 'a Stripe test-mode payment is marked as a test purchase');

  // Filing now opens the partner session for this business, without the SSN.
  const filed = await write(who, 'file_us_return', { taxYear: year });
  const handoff = filed.tools?.find((t) => t.name === 'file_us_return')?.result?.data?.handoffUrl;
  assert.equal(handoff, 'https://file.partner.example/s/1', JSON.stringify(filed));
  assert.equal(partnerSessions.length, 1);
  const externalId = partnerSessions[0].external_id;
  assert.ok(externalId.startsWith(`myca.${who.businessId}.${year}.`));
  assert.equal(partnerSessions[0].prefill.w2s[0].wages, 72000);
  assert.equal(partnerSessions[0].prefill.taxpayer.ssn, undefined);

  // The partner reports back, and the 1040 hub shows the IRS acceptance.
  assert.equal((await partnerHook({ type: 'return.submitted', data: { external_id: externalId, submission_id: '12345620270320000002' } })).body.status, 'submitted');
  assert.equal((await partnerHook({ type: 'return.accepted', data: { external_id: externalId } })).body.status, 'accepted');
  const status = await post(who, 'query', { name: 'us_efile_status', args: { taxYear: year } });
  const data = status.body.result?.data ?? status.body.data ?? status.body;
  assert.equal(data.status, 'accepted', status.text);
  assert.equal(data.route, 'partner');
});
