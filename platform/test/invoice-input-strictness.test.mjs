import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice, createPurchase } from '../src/invoice.mjs';

function books() {
  const state = createState();
  state.invoices = [];
  state.purchases = [];
  return state;
}

const sale = (line, date = '2026-10-10') => ({
  date,
  partyName: 'Rajesh Stores',
  lines: [{ description: 'Item', qty: 1, rate: 100, gstRate: 18, ...line }],
});

test('a sale at a rate that is not in force on its date is refused and posts nothing', () => {
  for (const gstRate of [7, 28, 13.5, 1000]) {
    const state = books();
    const result = createInvoice(state, sale({ gstRate }));
    assert.equal(result.ok, false, `rate ${gstRate}`);
    assert.equal(result.error, 'GST_RATE_NOT_IN_FORCE', `rate ${gstRate}`);
    assert.equal(state.invoices.length, 0);
  }
});

test('the same rate is accepted on a date when it was in force', () => {
  const state = books();
  const result = createInvoice(state, sale({ gstRate: 28 }, '2025-08-20'));
  assert.equal(result.ok, true, JSON.stringify(result));
});

test('a nil rate and the current slabs are accepted', () => {
  for (const gstRate of [0, 5, 18, 40]) {
    const state = books();
    const result = createInvoice(state, sale({ gstRate }));
    assert.equal(result.ok, true, `rate ${gstRate}: ${JSON.stringify(result)}`);
  }
});

test('a purchase at a rate that is not in force is refused too', () => {
  const state = books();
  const result = createPurchase(state, { ...sale({ gstRate: 7 }), partyName: 'Supplier Co' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'GST_RATE_NOT_IN_FORCE');
  assert.equal(state.purchases.length, 0);
});

test('hex, exponent, empty and null amounts are not read as numbers', () => {
  for (const rate of ['0x10', '1e3', '', null, 'abc', ' ', '1,5']) {
    const state = books();
    const result = createInvoice(state, sale({ rate }));
    assert.equal(result.ok, false, `rate ${JSON.stringify(rate)}`);
    assert.equal(state.invoices.length, 0);
  }
  for (const qty of ['0x2', '1e1', 'two']) {
    const state = books();
    const result = createInvoice(state, sale({ qty }));
    assert.equal(result.ok, false, `qty ${JSON.stringify(qty)}`);
  }
});

test('plain decimal strings still work', () => {
  const state = books();
  const result = createInvoice(state, sale({ rate: '100.50', qty: '2' }));
  assert.equal(result.ok, true, JSON.stringify(result));
});
