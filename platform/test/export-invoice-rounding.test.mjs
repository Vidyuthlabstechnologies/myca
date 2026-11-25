import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invoiceFigures } from '../src/invoice.mjs';

test('an export line is converted once, on the whole amount, not on a rounded unit rate', () => {
  const figures = invoiceFigures(
    [{ description: 'Design work' }],
    [{ qty: 1000, rate: 0.333, gstRate: 18 }],
    { supplierState: '29', pos: '96', exportSale: { currency: 'USD', exchangeRate: 83.5, withTax: false } },
  );
  assert.equal(figures.lines[0].taxable, 27805.5);
  assert.equal(figures.lines[0].foreignAmount, 333);
});
