import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { financialYear } from '../src/businesses.mjs';
import { INBOUND_HEADER } from '../src/inbound.mjs';

let api;

before(async () => {
  api = await startApi();
});

after(async () => {
  await api.close();
});

test('the financial year turns on 1 April in India, not at midnight UTC', () => {
  assert.equal(financialYear(new Date('2027-03-31T19:00:00Z')), '2027-28');
  assert.equal(financialYear(new Date('2027-03-31T18:00:00Z')), '2026-27');
  assert.equal(financialYear(new Date('2027-03-31T23:59:00+05:30')), '2026-27');
  assert.equal(financialYear(new Date('2027-01-15T00:00:00Z')), '2026-27');
});

test('a business made at 00:30 IST on 1 April opens its books in the new financial year', async () => {
  api.clock.now = Date.parse('2027-03-31T19:00:00Z');
  const owner = await api.ownerWithBusiness('9876502101');
  const books = await api.books(owner.businessId);
  assert.equal(books.company.fy, '2027-28');
});

test("a till's sales today are counted from midnight IST, so last night's sales are not today's at 01:00 IST", async () => {
  api.clock.now = Date.parse('2027-01-10T12:00:00Z');
  const owner = await api.ownerWithBusiness('9876502102');
  const key = (await api.call('POST', `/v1/businesses/${owner.businessId}/inbound`, { token: owner.token, body: { label: 'Counter till', source: 'pos' } })).body.key;
  api.clock.now = Date.parse('2027-01-10T17:30:00Z');
  const sold = await api.call('POST', '/v1/inbound/sales', { headers: { [INBOUND_HEADER]: key.secret }, body: { saleId: 'POS-NIGHT-1', lines: [{ description: 'Tea', qty: 2, rate: 50, gstRate: 5 }] } });
  assert.equal(sold.status, 200, sold.text);
  const evening = await api.signIn('9876502102');
  const sameEvening = (await api.call('GET', `/v1/businesses/${owner.businessId}/inbound`, { token: evening.accessToken })).body.keys[0];
  assert.equal(sameEvening.todayCount, 1);
  api.clock.now = Date.parse('2027-01-10T19:30:00Z');
  const night = await api.signIn('9876502102');
  const nextDay = (await api.call('GET', `/v1/businesses/${owner.businessId}/inbound`, { token: night.accessToken })).body.keys[0];
  assert.deepEqual([nextDay.todayCount, nextDay.todayTotal], [0, 0]);
});
