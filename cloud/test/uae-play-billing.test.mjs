import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createBilling } from '../src/billing.mjs';
import { createPlayFake } from '../sandbox/play-fake.mjs';
import { startApi } from './helpers.mjs';

const INDIA = 'com.mldynamic.myca';
const UAE = 'com.mldynamic.myca.uae';
let api;
let play;
const config = { packageName: INDIA, productIds: { firm: 'myca_firm_monthly' }, notifyToken: 'play-notify-token-for-uae-tests-0123456789', countries: { AE: { packageName: UAE, productIds: {} } } };

before(async () => {
  api = await startApi({
    billing: ({ db, now }) => {
      play = createPlayFake({ now, packages: [INDIA, UAE] });
      return createBilling({ db, now, fetchImpl: play.handle, config });
    },
  });
});
after(() => api.close());

const post = (who, action, body) => api.call('POST', `/v1/businesses/${who.businessId}/${action}`, { token: who.token, body });
const get = (who, action) => api.call('GET', `/v1/businesses/${who.businessId}/${action}`, { token: who.token });

test('the UAE plans list is in AED and buyable once the UAE Play package is set', async () => {
  const out = await api.call('GET', '/v1/plans?country=AE');
  assert.equal(out.status, 200);
  assert.equal(out.body.currency, 'AED');
  assert.equal(out.body.packageName, UAE);
  assert.deepEqual(out.body.plans.map((plan) => [plan.id, plan.price, plan.productId, plan.buyable]), [['ae-starter', 299, 'myca_ae_starter_monthly', true], ['ae-business', 799, 'myca_ae_business_monthly', true], ['ae-firm', 2499, 'myca_ae_firm_monthly', true]]);
});

test('a UAE Firm purchase turns on the UAE Firm plan, not the India CA firm plan', async () => {
  const owner = await api.ownerWithBusiness('+919400000491', { name: 'Gulf Ledger Tax Agents', state: '29' });
  const token = play.buy(UAE, 'myca_ae_firm_monthly', { accountId: owner.businessId });
  const bought = await post(owner, 'subscription', { productId: 'myca_ae_firm_monthly', purchaseToken: token });
  assert.equal(bought.status, 200, bought.text);
  assert.equal(bought.body.plan, 'ae-firm');
  const got = (await get(owner, 'subscription')).body;
  assert.equal(got.plan, 'ae-firm');
  assert.equal(got.planTitle, 'Firm');
  assert.equal(got.limits.members, 25);
  assert.ok(got.features.includes('vat-returns') && got.features.includes('corporate-tax'));
  assert.ok(!got.features.includes('gst-returns'), 'no India GST features in the UAE plan');
  assert.match(got.manageUrl, /package=com\.mldynamic\.myca\.uae/);
  assert.ok(play.calls.every((call) => !call.url.includes(`/applications/${INDIA}/`)), 'a UAE purchase never asks the India package');
  const indiaToken = play.buy(UAE, 'myca_firm_monthly', { accountId: owner.businessId });
  assert.equal((await post(owner, 'subscription', { productId: 'myca_firm_monthly', purchaseToken: indiaToken })).body.error, 'PURCHASE_NOT_FOUND');
});
