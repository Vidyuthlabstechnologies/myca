import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSealed } from '../src/books-seal.mjs';
import { startApi, SALE } from './helpers.mjs';

const EVERYTHING = { from: '2000-01-01', to: '2100-12-31', view: 'all' };
const ENGINE_ORDER = ['tools', 'posted', 'replayed', 'error', 'ledgerClock', 'details'];

async function bookTwoInvoicesAndReadTheTrail(api, phone) {
  const owner = await api.ownerWithBusiness(phone);
  const path = (action) => `/v1/businesses/${owner.businessId}/${action}`;
  for (let n = 0; n < 2; n += 1) {
    const proposed = await api.call('POST', path('propose'), { token: owner.token, body: { name: 'create_invoice', args: SALE } });
    assert.equal(proposed.status, 200, proposed.text);
    const confirmed = await api.call('POST', path('confirm'), { token: owner.token, body: { token: proposed.body.preview.token } });
    assert.equal(confirmed.status, 200, confirmed.text);
    assert.equal(confirmed.body.posted, true, confirmed.text);
  }
  const trail = await api.call('POST', path('query'), { token: owner.token, body: { name: 'audit_trail', args: EVERYTHING } });
  assert.equal(trail.status, 200, trail.text);
  return { owner, data: trail.body.data };
}

test('R1-14: books kept without a books key as plain jsonb still verify their audit chain after a reload', async () => {
  const api = await startApi({ booksKey: '' });
  try {
    const { owner, data } = await bookTwoInvoicesAndReadTheTrail(api, '+919100000555');
    const stored = await api.db.query('select state from books where business_id = $1', [owner.businessId]);
    assert.equal(isSealed(stored.rows[0].state), false, 'the books really are stored unsealed');
    const book = await api.books(owner.businessId);
    const confirm = book.auditEvents.find((event) => event.action === 'chat.confirm');
    assert.notDeepEqual(Object.keys(confirm.metadata), ENGINE_ORDER, 'the column really did reorder the keys');
    assert.equal(data.count, 4);
    assert.equal(data.chain.ok, true, JSON.stringify(data.chain));
    assert.equal(data.chain.error, undefined);
    assert.ok(data.chain.chained >= 4, JSON.stringify(data.chain));
    assert.equal(data.chain.unchained, 0);
    assert.match(data.chain.last, /^[0-9a-f]{64}$/);
    assert.equal(data.ledger.ok, true);
  } finally {
    await api.close();
  }
});

test('R1-14: sealed books verify the same chain, so the two ways of keeping the books agree', async () => {
  const api = await startApi();
  try {
    const { owner, data } = await bookTwoInvoicesAndReadTheTrail(api, '+919100000556');
    const stored = await api.db.query('select state from books where business_id = $1', [owner.businessId]);
    assert.equal(isSealed(stored.rows[0].state), true);
    assert.equal(data.count, 4);
    assert.equal(data.chain.ok, true, JSON.stringify(data.chain));
    assert.ok(data.chain.chained >= 4);
    assert.equal(data.chain.unchained, 0);
  } finally {
    await api.close();
  }
});
