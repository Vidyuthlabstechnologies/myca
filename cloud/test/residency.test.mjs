import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostedCountries, residencyProblem, residencyRefusal, publicCountries } from '../src/residency.mjs';
import { US_RETURN_PRICE_USD, US_PLUS_PRICE_USD, US_EXPERT_REVIEW_PRICE_USD } from '../src/billing.mjs';

test('a deployment hosts the countries it names, and every served country when it names none', () => {
  assert.deepEqual(hostedCountries({}), ['IN', 'US', 'GB', 'AE', 'MY']);
  assert.deepEqual(hostedCountries({ MYCA_COUNTRIES: 'in' }), ['IN']);
  assert.deepEqual(hostedCountries({ MYCA_COUNTRIES: 'US, us' }), ['US']);
  assert.deepEqual(hostedCountries({ MYCA_ENVIRONMENT: 'staging', K_SERVICE: 'myca-api-staging' }), ['IN', 'US', 'GB', 'AE', 'MY'], 'staging holds no real books');
});

test('a production deployment that names no country hosts only the country of its region, and India when the region is unknown', () => {
  assert.deepEqual(hostedCountries({ K_SERVICE: 'myca-api' }), ['IN']);
  assert.deepEqual(hostedCountries({ MYCA_PRODUCTION: '1' }), ['IN']);
  assert.deepEqual(hostedCountries({ K_SERVICE: 'myca-api', MYCA_REGION: 'asia-south1' }), ['IN']);
  assert.deepEqual(hostedCountries({ K_SERVICE: 'myca-api', MYCA_REGION: 'us-east4' }), ['US']);
  assert.deepEqual(hostedCountries({ K_SERVICE: 'myca-api', MYCA_REGION: 'europe-west2' }), ['GB']);
  assert.deepEqual(hostedCountries({ K_SERVICE: 'myca-api', MYCA_REGION: 'europe-west1' }), ['IN'], 'a region no served country lives in falls back to India');
  assert.deepEqual(hostedCountries({ K_SERVICE: 'myca-api', MYCA_COUNTRIES: 'US' }), ['US'], 'a named list always wins');
  assert.equal(residencyRefusal('US', { K_SERVICE: 'myca-api' }).error, 'COUNTRY_HOSTED_ELSEWHERE');
  assert.equal(residencyRefusal('IN', { K_SERVICE: 'myca-api' }), null);
  assert.equal(residencyProblem({ K_SERVICE: 'myca-api' }), '');
});

test('a deployment refuses to start where a country it hosts may not keep its data', () => {
  assert.equal(residencyProblem({ MYCA_COUNTRIES: 'IN', MYCA_REGION: 'asia-south1' }), '');
  assert.equal(residencyProblem({ MYCA_COUNTRIES: 'US', MYCA_REGION: 'us-east4' }), '');
  assert.match(residencyProblem({ MYCA_COUNTRIES: 'US', MYCA_REGION: 'asia-south1' }), /United States must stay in its own country/);
  assert.match(residencyProblem({ MYCA_COUNTRIES: 'IN,US', MYCA_REGION: 'asia-south1' }), /Deploy each country separately/);
  assert.match(residencyProblem({ MYCA_COUNTRIES: 'CA' }), /does not serve yet: CA/);
  assert.equal(residencyProblem({ MYCA_COUNTRIES: 'GB', MYCA_REGION: 'europe-west2' }), '');
  assert.match(residencyProblem({ MYCA_COUNTRIES: 'GB', MYCA_REGION: 'us-east4' }), /United Kingdom must stay in its own country/);
  assert.equal(residencyProblem({ MYCA_COUNTRIES: 'AE', MYCA_REGION: 'me-central1' }), '');
  assert.match(residencyProblem({ MYCA_COUNTRIES: 'AE', MYCA_REGION: 'asia-south1' }), /must stay in its own country/);
  assert.deepEqual(hostedCountries({ K_SERVICE: 'myca-api', MYCA_REGION: 'me-central1' }), ['AE']);
  assert.equal(residencyProblem({ MYCA_REGION: 'asia-south1' }), '', 'an unnamed country list still starts');
});

test('books for a country hosted elsewhere are refused and point at that country\'s app', () => {
  assert.equal(residencyRefusal('IN', { MYCA_COUNTRIES: 'IN' }), null);
  assert.equal(residencyRefusal('', { MYCA_COUNTRIES: 'IN' }), null, 'no country means India');
  const refused = residencyRefusal('US', { MYCA_COUNTRIES: 'IN' });
  assert.equal(refused.error, 'COUNTRY_HOSTED_ELSEWHERE');
  assert.match(refused.hint, /MyCA US app/);
});

test('the public country list carries what an app needs to set itself up, and nothing planned', () => {
  const listed = publicCountries({ MYCA_COUNTRIES: 'US' });
  assert.deepEqual(listed.countries.map((country) => country.code), ['IN', 'US', 'GB', 'AE', 'MY']);
  const us = listed.countries.find((country) => country.code === 'US');
  assert.equal(us.hostedHere, true);
  assert.equal(us.app.androidId, 'com.mldynamic.myca.us');
  assert.deepEqual(us.prices.map((price) => price.price), [US_RETURN_PRICE_USD, US_PLUS_PRICE_USD, US_EXPERT_REVIEW_PRICE_USD], 'the published prices are the prices billing charges');
  assert.deepEqual(us.prices.map((price) => price.price), [129, 249, 299]);
  assert.equal(listed.countries.find((country) => country.code === 'IN').hostedHere, false);
  assert.deepEqual([us.symbol, us.minorUnit, us.languages[0], us.taxName, us.yearLabel, us.yearStartDay], ['$', 'cents', 'en', 'Sales tax', 'calendar year', 1]);
  assert.equal(us.capabilities.profile.roles.country, 'country_profile');
});

test('the India deployment does not accept a Singapore region, and a country engine\'s write tools can be proposed', async () => {
  assert.match(residencyProblem({ MYCA_COUNTRIES: 'IN', MYCA_REGION: 'asia-southeast1' }), /India must stay in its own country/);
  const { PROPOSABLE } = await import('../src/api.mjs');
  const { ENGINE_WRITE_TOOLS } = await import('../../platform/src/countries/manifests.mjs');
  for (const name of ENGINE_WRITE_TOOLS) assert.equal(PROPOSABLE.has(name), true, name);
  assert.equal(PROPOSABLE.has('country_profile'), false);
});

test('India prices in the country pack are the prices billing charges', async () => {
  const { PLANS } = await import('../src/billing.mjs');
  const { countryPack } = await import('../../platform/src/countries/index.mjs');
  for (const plan of countryPack('IN').billing.plans) assert.equal(PLANS[plan.id].monthlyRupees, plan.price, plan.id);
});

test('Malaysia is served from Singapore (asia-southeast1) and nowhere else', () => {
  assert.deepEqual(hostedCountries({ K_SERVICE: 'myca-api', MYCA_REGION: 'asia-southeast1' }), ['MY'], 'a production stack in Singapore hosts Malaysia only');
  assert.equal(residencyProblem({ MYCA_COUNTRIES: 'MY', MYCA_REGION: 'asia-southeast1' }), '');
  assert.equal(residencyProblem({ MYCA_COUNTRIES: 'my', MYCA_REGION: 'ASIA-SOUTHEAST1' }), '', 'codes and regions are read without regard to case');
  for (const region of ['asia-south1', 'asia-southeast2', 'asia-east1', 'us-central1', 'europe-west2', 'asia-southeast']) {
    assert.match(residencyProblem({ MYCA_COUNTRIES: 'MY', MYCA_REGION: region }), /Malaysia must stay in its own country \(asia-southeast1\)/, region);
  }
  assert.match(residencyProblem({ MYCA_COUNTRIES: 'MY,IN', MYCA_REGION: 'asia-southeast1' }), /India must stay in its own country/);
  assert.match(residencyProblem({ MYCA_COUNTRIES: 'IN', MYCA_REGION: 'asia-southeast1' }), /India must stay in its own country/);
  assert.equal(residencyRefusal('MY', { MYCA_COUNTRIES: 'MY' }), null);
  assert.equal(residencyRefusal('my', { MYCA_COUNTRIES: 'MY' }), null);
  const refused = residencyRefusal('MY', { MYCA_COUNTRIES: 'IN' });
  assert.equal(refused.error, 'COUNTRY_HOSTED_ELSEWHERE');
  assert.match(refused.hint, /MyCA Malaysia app/);
  assert.equal(residencyRefusal('IN', { MYCA_COUNTRIES: 'MY' }).error, 'COUNTRY_HOSTED_ELSEWHERE');
  assert.equal(residencyRefusal('US', { K_SERVICE: 'myca-api', MYCA_REGION: 'asia-southeast1' }).error, 'COUNTRY_HOSTED_ELSEWHERE');
});

test('the Malaysia app is listed with its Play prices in ringgit and its capabilities', async () => {
  const { PLANS } = await import('../src/billing.mjs');
  const listed = publicCountries({ MYCA_COUNTRIES: 'MY' });
  const my = listed.countries.find((country) => country.code === 'MY');
  assert.equal(my.hostedHere, true);
  assert.equal(listed.countries.find((country) => country.code === 'IN').hostedHere, false);
  assert.deepEqual([my.status, my.currency, my.symbol, my.minorUnit, my.taxId, my.taxName, my.yearLabel], ['beta', 'MYR', 'RM', 'sen', 'TIN', 'SST', 'year of assessment']);
  assert.deepEqual(my.languages, ['en', 'ms']);
  assert.deepEqual(my.app, { flavor: 'my', androidId: 'com.mldynamic.myca.my', label: 'MyCA Malaysia', edition: 'MY' });
  assert.deepEqual(my.prices, [
    { id: 'my-sme', kind: 'monthly', price: 299, provider: 'play' },
    { id: 'my-growth', kind: 'monthly', price: 699, provider: 'play' },
    { id: 'my-firm', kind: 'monthly', price: 1999, provider: 'play' },
  ]);
  const { countryPack } = await import('../../platform/src/countries/index.mjs');
  for (const plan of countryPack('MY').billing.plans) {
    assert.equal(plan.sells, 'software', plan.id);
    assert.ok(PLANS[plan.tier] && PLANS[plan.tier].monthlyRupees > 0, `${plan.id} unlocks a paid tier`);
  }
  assert.equal(my.capabilities['e-invoice'].roles.issue, 'issue_my_einvoice');
  assert.equal(my.capabilities['indirect-tax'].roles.return, 'my_sst_return');
  assert.deepEqual(my.filing.map((entry) => entry.id), ['myinvois', 'income-tax', 'sst']);
});
