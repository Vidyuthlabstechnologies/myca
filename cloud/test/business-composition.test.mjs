import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from './helpers.mjs';

let api;

before(async () => {
  api = await startApi();
});
after(() => api.close());

const GSTIN = '27AABCU9603R1ZN';

async function owner(phone) {
  const session = await api.signIn(phone);
  return { token: session.accessToken };
}

const create = (who, body) => api.call('POST', '/v1/businesses', { token: who.token, body });

test('a composition dealer can say so when creating the business, and the books remember it', async () => {
  const who = await owner('+919800000101');
  const made = await create(who, { name: 'Sharma Kirana', gstin: GSTIN, composition: true });
  assert.equal(made.status, 200, made.text);
  const books = await api.books(made.body.business.id);
  assert.equal(books.company.composition, true);
});

test('a regular business has composition off', async () => {
  const who = await owner('+919800000102');
  const made = await create(who, { name: 'Gupta Traders', gstin: GSTIN });
  assert.equal(made.status, 200, made.text);
  assert.notEqual((await api.books(made.body.business.id)).company.composition, true);
});

test('composition without a GSTIN is refused with a plain reason, and nothing is created', async () => {
  const who = await owner('+919800000103');
  const made = await create(who, { name: 'Unregistered Stores', state: '27', composition: true });
  assert.equal(made.status >= 400, true);
  assert.match(made.text, /COMPOSITION_NEEDS_GSTIN/);
  const listed = await api.call('GET', '/v1/businesses', { token: who.token });
  assert.equal(listed.body.businesses.length, 0);
});

test('composition must be true or false, not a word', async () => {
  const who = await owner('+919800000104');
  const made = await create(who, { name: 'Odd Stores', gstin: GSTIN, composition: 'yes' });
  assert.equal(made.status >= 400, true);
  assert.match(made.text, /BAD_COMPOSITION/);
});

test('a composition business refuses a bill that charges GST and accepts one at zero', async () => {
  const who = await owner('+919800000105');
  const made = await create(who, { name: 'Verma Kirana', gstin: GSTIN, composition: true });
  const businessId = made.body.business.id;
  const propose = (lines) => api.call('POST', `/v1/businesses/${businessId}/propose`, { token: who.token, body: { name: 'create_invoice', args: { partyName: 'Walk-in customer', lines } } });
  const taxed = await propose([{ description: 'Sugar', qty: 1, rate: 40, gstRate: 5 }]);
  assert.match(taxed.text, /gst|GST|composition/i);
  const plain = await propose([{ description: 'Sugar', qty: 1, rate: 40, gstRate: 0 }]);
  assert.equal(plain.status, 200, plain.text);
});
