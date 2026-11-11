import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createBilling, billingConfigFromEnv, US_RETURN_PRICE_USD } from '../src/billing.mjs';
import { startApi } from './helpers.mjs';

const PACKAGE = 'com.mldynamic.myca';
const US_PACKAGE = 'com.mldynamic.myca.us';
const PRODUCT = 'myca_us_1040';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const calls = [];
const purchases = new Map();

async function fakeGoogle(url, init = {}) {
  const text = String(url);
  calls.push({ url: text, method: init.method || 'GET' });
  const json = (status, data) => new Response(JSON.stringify(data), { status });
  if (text === 'https://oauth2.googleapis.com/token') return json(200, { access_token: 'ya29.test', expires_in: 3600 });
  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${US_PACKAGE}/purchases/products/`;
  if (!text.startsWith(base)) return json(404, {});
  const rest = text.slice(base.length);
  const ack = rest.match(/^([^/]+)\/tokens\/([^/:]+):acknowledge$/);
  if (ack) {
    const found = purchases.get(decodeURIComponent(ack[2]));
    if (found) found.acknowledgementState = 1;
    return json(200, {});
  }
  const get = rest.match(/^([^/]+)\/tokens\/([^/]+)$/);
  if (get && decodeURIComponent(get[1]) === PRODUCT) {
    const found = purchases.get(decodeURIComponent(get[2]));
    return found ? json(200, found) : json(404, {});
  }
  return json(404, {});
}

function bought(token, { accountId = '', state = 0, test = true } = {}) {
  purchases.set(token, { purchaseState: state, consumptionState: 0, acknowledgementState: 0, ...(accountId ? { obfuscatedExternalAccountId: accountId } : {}), ...(test ? { purchaseType: 0 } : {}) });
}

let api;
let year;
before(async () => {
  api = await startApi({
    billing: ({ db, now }) => createBilling({
      db,
      now,
      fetchImpl: fakeGoogle,
      config: { packageName: PACKAGE, productIds: { pro: 'myca_pro_monthly' }, usReturn: { packageName: US_PACKAGE, productId: PRODUCT, priceUsd: 39 }, serviceAccount: { clientEmail: 'play@test.iam.gserviceaccount.com', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }), tokenUri: 'https://oauth2.googleapis.com/token' } },
    }),
  });
  year = new Date(api.clock.now).getUTCFullYear() - 1;
});
after(() => api.close());

async function household(phone, name = 'Jordan Rivera') {
  const session = await api.signIn(phone);
  const created = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name, country: 'US', kind: 'household' } });
  assert.equal(created.status, 200, created.text);
  return { token: session.accessToken, businessId: created.body.business.id };
}
const post = (who, action, body) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });
const get = (who, path) => api.call('GET', `/v1/businesses/${who.businessId}/${path}`, { token: who.token });

test('the price of a US return is $39 by default and the operator can change it', () => {
  assert.equal(US_RETURN_PRICE_USD, 39);
  assert.deepEqual(billingConfigFromEnv({ MYCA_PLAY_PRODUCT_US_1040: 'myca_us_1040', MYCA_PLAY_PACKAGE_US: 'com.mldynamic.myca.us' }).usReturn, { packageName: 'com.mldynamic.myca.us', productId: 'myca_us_1040', priceUsd: 39 });
  assert.equal(billingConfigFromEnv({ MYCA_US_RETURN_PRICE_USD: '49' }).usReturn.priceUsd, 49);
  assert.equal(billingConfigFromEnv({ MYCA_US_RETURN_PRICE_USD: 'free' }).usReturn.priceUsd, 39);
});

test('plans list the US return as a one-time $39 per tax year', async () => {
  const out = await api.call('GET', '/v1/plans');
  assert.deepEqual(out.body.usReturn, { title: 'MyCA Return', priceUsd: 39, currency: 'USD', per: 'tax_year', priceLine: '$39 to file. Federal only. No state, refund or upgrade fees.', checkout: 'play', packageName: US_PACKAGE, productId: PRODUCT, buyable: true });
  assert.equal(out.body.usPlus.buyable, false, 'MyCA Plus needs card checkout');
  assert.equal(out.body.usExpertReview.available, false, 'Expert Review stays hidden until the operator turns it on');
  assert.deepEqual(out.body.usWaitlist.map((item) => item.id), ['done_for_you', 'international']);
  assert.ok(out.body.usWaitlist.every((item) => item.priceUsd === undefined), 'waitlist products show no price');
});

test('a household never lapses into read-only: preparing a return is free', async () => {
  const who = await household('+919400000071');
  await api.db.query('update businesses set created_at = created_at - interval \'60 days\' where id = $1', [who.businessId]);
  const plan = await get(who, 'subscription');
  assert.equal(plan.body.plan, 'household', plan.text);
  assert.equal(plan.body.trial, null);
  assert.ok(plan.body.features.includes('post'));
  assert.equal(plan.body.usReturn.priceUsd, 39);
});

test('filing is refused until that tax year is paid, and the answer says how much', async () => {
  const who = await household('+919400000072');
  const status = await get(who, `us-return-purchase?taxYear=${year}`);
  assert.equal(status.body.paid, false, status.text);
  assert.equal(status.body.priceUsd, 39);
  const refused = await post(who, 'propose', { name: 'file_us_return', args: { taxYear: year } });
  assert.equal(refused.body.error, 'US_RETURN_UNPAID', refused.text);
  assert.equal(refused.body.priceUsd, 39);
  assert.match(refused.body.hint, /\$39/);
});

test('a Play payment is checked with Google, acknowledged, recorded for one tax year, and audited', async () => {
  const who = await household('+919400000073');
  bought('us-token-1', { accountId: who.businessId });
  calls.length = 0;
  const paid = await post(who, 'us-return-purchase', { taxYear: year, productId: PRODUCT, purchaseToken: 'us-token-1' });
  assert.equal(paid.status, 200, paid.text);
  assert.equal(paid.body.paid, true);
  assert.equal(paid.body.purchased, true);
  assert.equal(paid.body.testPurchase, true);
  assert.ok(calls.some((c) => c.method === 'POST' && c.url.endsWith(':acknowledge')));
  assert.ok(calls.filter((c) => c.url.includes('/applications/')).every((c) => c.url.includes(`/applications/${US_PACKAGE}/`)), 'US payments are checked against the US app');
  assert.equal(purchases.get('us-token-1').acknowledgementState, 1);
  const again = await post(who, 'us-return-purchase', { taxYear: year, productId: PRODUCT, purchaseToken: 'us-token-1' });
  assert.equal(again.body.paid, true, 'sending the same payment twice is harmless');
  const other = await get(who, `us-return-purchase?taxYear=${year + 1}`);
  assert.equal(other.body.paid, false, 'each tax year is paid on its own');
  const reused = await post(who, 'us-return-purchase', { taxYear: year + 1, productId: PRODUCT, purchaseToken: 'us-token-1' });
  assert.equal(reused.body.error, 'PURCHASE_ALREADY_USED');
  const filing = await post(who, 'propose', { name: 'file_us_return', args: { taxYear: year } });
  assert.notEqual(filing.body.error, 'US_RETURN_UNPAID', filing.text);
  const audit = await api.db.query("select metadata from audit_log where business_id = $1 and action = 'billing.us_return_paid'", [who.businessId]);
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].metadata.taxYear, year);
});

test('a payment made for someone else, unknown, unfinished, or for a business is refused', async () => {
  const who = await household('+919400000074');
  const someone = await household('+919400000075', 'Sam Lee');
  bought('us-token-other', { accountId: someone.businessId });
  assert.equal((await post(who, 'us-return-purchase', { taxYear: year, productId: PRODUCT, purchaseToken: 'us-token-other' })).body.error, 'PURCHASE_BELONGS_TO_ANOTHER_BUSINESS');
  assert.equal((await post(who, 'us-return-purchase', { taxYear: year, productId: PRODUCT, purchaseToken: 'nope' })).body.error, 'PURCHASE_NOT_FOUND');
  bought('us-token-pending', { state: 2 });
  assert.equal((await post(who, 'us-return-purchase', { taxYear: year, productId: PRODUCT, purchaseToken: 'us-token-pending' })).body.error, 'PURCHASE_NOT_COMPLETE');
  assert.equal((await post(who, 'us-return-purchase', { taxYear: year, productId: 'myca_pro_monthly', purchaseToken: 'x' })).body.error, 'UNKNOWN_PRODUCT');
  assert.equal((await post(who, 'us-return-purchase', { taxYear: 1999, productId: PRODUCT, purchaseToken: 'x' })).body.error, 'BAD_TAX_YEAR');
  const shop = await api.ownerWithBusiness('+919400000076', { name: 'Kiran Stores', state: '29' });
  bought('us-token-shop');
  assert.equal((await post(shop, 'us-return-purchase', { taxYear: year, productId: PRODUCT, purchaseToken: 'us-token-shop' })).body.error, 'NOT_A_PERSONAL_RETURN');
});

test('without a Play product for US returns, filing is not held back', async () => {
  const plain = await startApi();
  try {
    const session = await plain.signIn('+919400000077');
    const created = await plain.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Pat Kim', country: 'US', kind: 'household' } });
    const who = { token: session.accessToken, businessId: created.body.business.id };
    const y = new Date(plain.clock.now).getUTCFullYear() - 1;
    const status = await plain.call('GET', `/v1/businesses/${who.businessId}/us-return-purchase?taxYear=${y}`, { token: who.token });
    assert.equal(status.body.paid, true, status.text);
    assert.equal(status.body.enforced, false);
    const filing = await plain.call('POST', `/v1/businesses/${who.businessId}/propose`, { token: who.token, body: { name: 'file_us_return', args: { taxYear: y } } });
    assert.notEqual(filing.body.error, 'US_RETURN_UNPAID');
  } finally {
    await plain.close();
  }
});
