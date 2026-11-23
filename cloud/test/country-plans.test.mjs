import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billingConfigFromEnv, countryPlanOffers, createBilling, COUNTRY_PLANS_NOT_OPEN } from '../src/billing.mjs';

test('UK plans are served in pounds with placeholder Play products, and nothing can be bought yet', () => {
  const offers = countryPlanOffers('GB');
  assert.equal(offers.currency, 'GBP');
  assert.equal(offers.buyable, false);
  assert.equal(offers.hint, COUNTRY_PLANS_NOT_OPEN);
  const byId = Object.fromEntries(offers.plans.map((plan) => [plan.id, plan]));
  assert.deepEqual(Object.keys(byId), ['uk-sole-trader', 'uk-business', 'uk-accountant', 'uk-self-assessment']);
  assert.deepEqual([byId['uk-sole-trader'].price, byId['uk-business'].price, byId['uk-accountant'].price, byId['uk-self-assessment'].price], [49, 99, 499, 149]);
  assert.equal(byId['uk-sole-trader'].productId, 'myca_uk_sole_trader_monthly');
  assert.equal(byId['uk-business'].productId, 'myca_uk_business_monthly');
  assert.equal(byId['uk-accountant'].productId, 'myca_uk_accountant_monthly');
  assert.equal(byId['uk-sole-trader'].placeholderProduct, true);
  assert.equal(byId['uk-self-assessment'].productId, '', 'tax filing is sold outside Play');
  assert.equal(byId['uk-self-assessment'].provider, 'stripe');
  assert.ok(offers.plans.every((plan) => plan.buyable === false && plan.currency === 'GBP'));
  assert.doesNotMatch(JSON.stringify(offers), /₹|INR|GST|monthlyRupees/);
});

test('real Play product ids from the environment replace the placeholders', () => {
  const cfg = billingConfigFromEnv({ MYCA_PLAY_PACKAGE_GB: 'com.mldynamic.myca.uk', MYCA_PLAY_PRODUCT_UK_BUSINESS: 'uk_business_live' });
  assert.equal(cfg.countries.GB.packageName, 'com.mldynamic.myca.uk');
  const offers = countryPlanOffers('GB', cfg.countries);
  const business = offers.plans.find((plan) => plan.id === 'uk-business');
  assert.equal(business.productId, 'uk_business_live');
  assert.equal(business.placeholderProduct, false);
  assert.equal(offers.packageName, 'com.mldynamic.myca.uk');
});

test('India and the US keep their own plans, and unknown countries fall back to them', () => {
  assert.equal(countryPlanOffers('IN'), null);
  assert.equal(countryPlanOffers('US'), null);
  assert.equal(countryPlanOffers('ZZ'), null);
  const billing = createBilling({ db: { query: async () => ({ rows: [] }) } });
  assert.equal(billing.plans().currency, 'INR');
  assert.equal(billing.plans({ country: 'ZZ' }).currency, 'INR');
  const uk = billing.plans({ country: 'gb' });
  assert.equal(uk.ok, true);
  assert.equal(uk.currency, 'GBP');
  assert.equal(uk.plans.length, 4);
});

test('UAE plans are served in dirhams with their own Play products, never the India plan ids', () => {
  const offers = countryPlanOffers('AE');
  assert.equal(offers.currency, 'AED');
  const byId = Object.fromEntries(offers.plans.map((plan) => [plan.id, plan]));
  assert.deepEqual(Object.keys(byId), ['ae-starter', 'ae-business', 'ae-firm']);
  assert.deepEqual(offers.plans.map((plan) => [plan.price, plan.productId, plan.members]), [[299, 'myca_ae_starter_monthly', 2], [799, 'myca_ae_business_monthly', 5], [2499, 'myca_ae_firm_monthly', 25]]);
  assert.doesNotMatch(JSON.stringify(offers), /₹|INR|GST|monthlyRupees/);
  const cfg = billingConfigFromEnv({ MYCA_PLAY_PACKAGE: 'com.mldynamic.myca', MYCA_PLAY_PRODUCT_FIRM: 'india_firm_live', MYCA_PLAY_PACKAGE_AE: 'com.mldynamic.myca.uae' });
  assert.equal(cfg.countries.AE.packageName, 'com.mldynamic.myca.uae');
  assert.deepEqual(cfg.countries.AE.productIds, {});
  const live = countryPlanOffers('AE', cfg.countries);
  assert.equal(live.plans.find((plan) => plan.id === 'ae-firm').productId, 'myca_ae_firm_monthly', 'the India firm product must not leak into the UAE edition');
  assert.ok(live.plans.every((plan) => plan.buyable));
  const own = billingConfigFromEnv({ MYCA_PLAY_PACKAGE_AE: 'com.mldynamic.myca.uae', MYCA_PLAY_PRODUCT_AE_FIRM: 'ae_firm_live' });
  assert.equal(countryPlanOffers('AE', own.countries).plans.find((plan) => plan.id === 'ae-firm').productId, 'ae_firm_live');
});
