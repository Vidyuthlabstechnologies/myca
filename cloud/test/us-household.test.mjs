import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';

let api;
before(async () => {
  api = await startApi();
});
after(async () => { await api.close(); });

test('a US household is made for a personal return and says what it is', async () => {
  const session = await api.signIn('+919400000061');
  const created = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Jordan Rivera', country: 'US', kind: 'household' } });
  assert.equal(created.status, 200, created.text);
  assert.equal(created.body.business.country, 'US');
  assert.equal(created.body.business.kind, 'household');
  const books = await api.books(created.body.business.id);
  assert.equal(books.company.country, 'US');
  assert.equal(books.company.entityType, 'household');
});

test('a US business without a kind stays a business', async () => {
  const session = await api.signIn('+919400000062');
  const created = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Luna Bakery LLC', country: 'US' } });
  assert.equal(created.status, 200, created.text);
  assert.equal(created.body.business.kind, 'business');
  assert.equal(created.body.business.country, 'US');
});

test('a household is refused outside the US and an unknown kind is refused', async () => {
  const session = await api.signIn('+919400000063');
  const india = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Asha', state: '29', kind: 'household' } });
  assert.notEqual(india.status, 200);
  assert.equal(india.body.error, 'HOUSEHOLD_US_ONLY');
  const odd = await api.call('POST', '/v1/businesses', { token: session.accessToken, body: { name: 'Asha', country: 'US', kind: 'trust' } });
  assert.notEqual(odd.status, 200);
  assert.equal(odd.body.error, 'UNKNOWN_KIND');
});
