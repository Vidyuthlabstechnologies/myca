import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createBilling } from '../src/billing.mjs';
import { createPlayFake } from '../sandbox/play-fake.mjs';
import { startApi } from './helpers.mjs';

const DAY = 24 * 60 * 60 * 1000;
const NOTIFY = 'play-notify-token-for-uk-tests-0123456789';
const INDIA = 'com.mldynamic.myca';
const UK = 'com.mldynamic.myca.uk';
let api;
let play;
let billing;
const config = { packageName: INDIA, productIds: { pro: 'myca_pro_monthly' }, notifyToken: NOTIFY, countries: { GB: { packageName: UK, productIds: {} } } };

before(async () => {
  api = await startApi({
    billing: ({ db, now }) => {
      play = createPlayFake({ now, packages: [INDIA, UK] });
      billing = createBilling({ db, now, fetchImpl: play.handle, config });
      return billing;
    },
  });
});
after(() => api.close());

const post = (who, action, body) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });
const get = (who, action) => api.call('GET', `/v1/businesses/${who.businessId}/${action}`, { token: who.token });

function notify(purchaseToken, packageName) {
  const data = Buffer.from(JSON.stringify({ version: '1.0', packageName, eventTimeMillis: String(api.clock.now), subscriptionNotification: { version: '1.0', notificationType: 4, purchaseToken } })).toString('base64');
  return api.call('POST', '/v1/billing/play/notify', { raw: JSON.stringify({ message: { data, messageId: `uk-${Math.random()}` } }), headers: { 'content-type': 'application/json', 'x-myca-notify-token': NOTIFY } });
}

test('with the UK Play package set, the UK plans can be bought with the placeholder product ids', async () => {
  const out = await api.call('GET', '/v1/plans?country=GB');
  assert.equal(out.status, 200);
  assert.equal(out.body.currency, 'GBP');
  assert.equal(out.body.packageName, UK);
  const byId = Object.fromEntries(out.body.plans.map((plan) => [plan.id, plan]));
  assert.equal(byId['uk-business'].buyable, true);
  assert.equal(byId['uk-business'].productId, 'myca_uk_business_monthly');
  assert.equal(byId['uk-self-assessment'].buyable, false, 'Self Assessment is paid by card, not Play');
});

test('a UK Play purchase is checked against the UK package, acknowledged, and turns on the UK plan', async () => {
  const owner = await api.ownerWithBusiness('+919400000391', { name: 'Brighton Plumbing', state: '29' });
  const token = play.buy(UK, 'myca_uk_business_monthly', { accountId: owner.businessId });
  const bought = await post(owner, 'subscription', { productId: 'myca_uk_business_monthly', purchaseToken: token });
  assert.equal(bought.status, 200, bought.text);
  assert.equal(bought.body.plan, 'uk-business');
  assert.equal(bought.body.testPurchase, true);
  assert.equal(play.purchase(UK, token).acknowledgementState, 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED');
  const got = (await get(owner, 'subscription')).body;
  assert.equal(got.plan, 'uk-business');
  assert.equal(got.planTitle, 'Business');
  assert.equal(got.limits.members, 5);
  assert.ok(got.features.includes('vat-returns') && got.features.includes('mtd-income-tax'));
  assert.match(got.manageUrl, /package=com\.mldynamic\.myca\.uk/);
  assert.match(got.manageUrl, /sku=myca_uk_business_monthly/);
  assert.ok(play.calls.every((call) => !call.url.includes(`/applications/${INDIA}/`)), 'a UK purchase never asks the India package');
});

test('UK purchase checks refuse unknown products, purchases Play does not know, and another business\'s purchase', async () => {
  const owner = await api.ownerWithBusiness('+919400000392', { name: 'Leeds Bakes', state: '29' });
  const other = await api.ownerWithBusiness('+919400000393', { name: 'York Joinery', state: '29' });
  const unknown = await post(owner, 'subscription', { productId: 'myca_uk_gold_monthly', purchaseToken: 'x' });
  assert.equal(unknown.body.error, 'UNKNOWN_PLAN');
  assert.ok(unknown.body.products.includes('myca_uk_sole_trader_monthly'));
  const indiaToken = play.buy(INDIA, 'myca_uk_sole_trader_monthly');
  assert.equal((await post(owner, 'subscription', { productId: 'myca_uk_sole_trader_monthly', purchaseToken: indiaToken })).body.error, 'PURCHASE_NOT_FOUND');
  const mismatch = play.buy(UK, 'myca_uk_accountant_monthly');
  assert.equal((await post(owner, 'subscription', { productId: 'myca_uk_sole_trader_monthly', purchaseToken: mismatch })).body.error, 'PURCHASE_PRODUCT_MISMATCH');
  const theirs = play.buy(UK, 'myca_uk_sole_trader_monthly', { accountId: other.businessId });
  assert.equal((await post(owner, 'subscription', { productId: 'myca_uk_sole_trader_monthly', purchaseToken: theirs })).body.error, 'PURCHASE_BELONGS_TO_ANOTHER_BUSINESS');
});

test('UK Play notifications and renewal checks use the UK package, and an expired UK plan stops paying', async () => {
  const owner = await api.ownerWithBusiness('+919400000394', { name: 'Bristol Books', state: '29' });
  const token = play.buy(UK, 'myca_uk_sole_trader_monthly', { accountId: owner.businessId, days: 3 });
  assert.equal((await post(owner, 'subscription', { productId: 'myca_uk_sole_trader_monthly', purchaseToken: token })).body.plan, 'uk-sole-trader');
  play.purchase(UK, token).subscriptionState = 'SUBSCRIPTION_STATE_ON_HOLD';
  const heard = await notify(token, UK);
  assert.equal(heard.status, 200, heard.text);
  assert.equal(heard.body.ok, true);
  assert.equal(heard.body.ignored, undefined);
  assert.equal((await get(owner, 'subscription')).body.subscription.status, 'on_hold');
  assert.equal((await notify(token, 'com.example.other')).body.ignored, true);
  play.purchase(UK, token).subscriptionState = 'SUBSCRIPTION_STATE_ACTIVE';
  play.purchase(UK, token).lineItems[0].expiryTime = new Date(api.clock.now + 33 * DAY).toISOString();
  await api.db.query("update subscriptions set status = 'active', current_end = $2 where business_id = $1", [owner.businessId, new Date(api.clock.now + DAY)]);
  const summary = await billing.refreshDue();
  assert.ok(summary.checked >= 1 && summary.failed === 0, JSON.stringify(summary));
  const renewed = (await get(owner, 'subscription')).body;
  assert.equal(renewed.plan, 'uk-sole-trader');
  assert.ok(new Date(renewed.subscription.currentEnd).getTime() > api.clock.now + 30 * DAY);
});
