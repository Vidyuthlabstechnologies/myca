import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';
import { financialYear } from '../src/businesses.mjs';

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
