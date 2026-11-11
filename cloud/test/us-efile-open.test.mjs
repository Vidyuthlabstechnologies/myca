import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createBilling, US_EFILE_NOT_OPEN_HINT } from '../src/billing.mjs';
import { usFilingOpen } from '../src/environment.mjs';
import { startApi } from './helpers.mjs';

const stripeCalls = [];
async function fakeStripe(url, init = {}) {
  stripeCalls.push({ url: String(url), method: init.method || 'GET' });
  return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1', status: 'open', payment_status: 'unpaid' }), { status: 200 });
}

let open = false;
let api;
let year;
before(async () => {
  api = await startApi({
    billing: ({ db, now }) => createBilling({
      db,
      now,
      fetchImpl: fakeStripe,
      usFilingOpen: () => open,
      config: { stripe: { secretKey: 'sk_test_123', webhookSecret: 'whsec_test_secret', plusPriceId: 'price_plus_yearly', returnUrl: 'https://myca.example/us/paid' } },
    }),
  });
  year = new Date(api.clock.now).getUTCFullYear() - 1;
});
after(() => api.close());

async function household(phone) {
  const session = await api.signIn(phone);
  const created = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Jordan Rivera', country: 'US', kind: 'household' } });
  assert.equal(created.status, 200, created.text);
  return { token: session.accessToken, businessId: created.body.business.id };
}
const post = (who, action, body) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });
const get = (who, path) => api.call('GET', `/v1/businesses/${who.businessId}/${path}`, { token: who.token });

test('IRS e-file is open outside production, and in production only when the IRS route is live', () => {
  assert.equal(usFilingOpen({}, 'sandbox'), true, 'a local run may use the simulator');
  assert.equal(usFilingOpen({ MYCA_ENVIRONMENT: 'staging', K_SERVICE: 'myca-api-staging' }, 'sandbox'), true, 'staging may use the simulator');
  assert.equal(usFilingOpen({ K_SERVICE: 'myca-api' }, 'sandbox'), false);
  assert.equal(usFilingOpen({ MYCA_PRODUCTION: '1' }, 'sandbox'), false);
  assert.equal(usFilingOpen({ K_SERVICE: 'myca-api' }, 'live'), true);
});

test('while IRS e-file is not open, no filing fee is asked for or sold and a return is refused instead of being sent to the simulator', async () => {
  open = false;
  const who = await household('+919400000171');
  const fee = await get(who, `us-return-purchase?taxYear=${year}`);
  assert.equal(fee.status, 200, fee.text);
  assert.deepEqual({ enforced: fee.body.enforced, paid: fee.body.paid, buyable: fee.body.buyable, filingOpen: fee.body.filingOpen }, { enforced: false, paid: true, buyable: false, filingOpen: false }, 'the app shows no payment step');

  stripeCalls.length = 0;
  const checkout = await post(who, 'us-checkout', { product: 'return', taxYear: year });
  assert.equal(checkout.body.error, 'US_EFILE_NOT_OPEN', checkout.text);
  assert.equal(checkout.body.hint, US_EFILE_NOT_OPEN_HINT);
  assert.equal(stripeCalls.length, 0, 'no checkout was opened');

  const refused = await post(who, 'propose', { name: 'file_us_return', args: { taxYear: year } });
  assert.equal(refused.body.error, 'US_EFILE_NOT_OPEN', refused.text);
  assert.match(refused.body.hint, /nothing has been charged/);
});

test('once IRS e-file is open, the fee is asked for again before filing', async () => {
  open = true;
  const who = await household('+919400000172');
  const fee = await get(who, `us-return-purchase?taxYear=${year}`);
  assert.deepEqual({ enforced: fee.body.enforced, paid: fee.body.paid, buyable: fee.body.buyable, filingOpen: fee.body.filingOpen }, { enforced: true, paid: false, buyable: true, filingOpen: true });
  const refused = await post(who, 'propose', { name: 'file_us_return', args: { taxYear: year } });
  assert.equal(refused.body.error, 'US_RETURN_UNPAID', refused.text);
  const checkout = await post(who, 'us-checkout', { product: 'return', taxYear: year });
  assert.equal(checkout.status, 200, checkout.text);
  assert.match(checkout.body.url, /^https:\/\/checkout\.stripe\.com\//);
  open = false;
});
