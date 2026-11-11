import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostedCountries, residencyProblem, residencyRefusal, publicCountries } from '../src/residency.mjs';

test('a deployment hosts the countries it names, and every served country when it names none', () => {
  assert.deepEqual(hostedCountries({}), ['IN', 'US']);
  assert.deepEqual(hostedCountries({ MYCA_COUNTRIES: 'in' }), ['IN']);
  assert.deepEqual(hostedCountries({ MYCA_COUNTRIES: 'US, us' }), ['US']);
});

test('a deployment refuses to start where a country it hosts may not keep its data', () => {
  assert.equal(residencyProblem({ MYCA_COUNTRIES: 'IN', MYCA_REGION: 'asia-south1' }), '');
  assert.equal(residencyProblem({ MYCA_COUNTRIES: 'US', MYCA_REGION: 'us-east4' }), '');
  assert.match(residencyProblem({ MYCA_COUNTRIES: 'US', MYCA_REGION: 'asia-south1' }), /United States must stay in its own country/);
  assert.match(residencyProblem({ MYCA_COUNTRIES: 'IN,US', MYCA_REGION: 'asia-south1' }), /Deploy each country separately/);
  assert.match(residencyProblem({ MYCA_COUNTRIES: 'GB' }), /does not serve yet: GB/);
  assert.equal(residencyProblem({ MYCA_REGION: 'asia-south1' }), '', 'an unnamed country list keeps today\'s single deployment working');
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
  assert.deepEqual(listed.countries.map((country) => country.code), ['IN', 'US']);
  const us = listed.countries.find((country) => country.code === 'US');
  assert.equal(us.hostedHere, true);
  assert.equal(us.app.androidId, 'com.mldynamic.myca.us');
  assert.deepEqual(us.prices.map((price) => price.price), [39, 79, 129]);
  assert.equal(listed.countries.find((country) => country.code === 'IN').hostedHere, false);
});

test('India prices in the country pack are the prices billing charges', async () => {
  const { PLANS } = await import('../src/billing.mjs');
  const { countryPack } = await import('../../platform/src/countries/index.mjs');
  for (const plan of countryPack('IN').billing.plans) assert.equal(PLANS[plan.id].monthlyRupees, plan.price, plan.id);
});
