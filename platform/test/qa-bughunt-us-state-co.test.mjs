import { test } from 'node:test';
import assert from 'node:assert/strict';
import { household, residency, stateReturn, w2 } from './us-states/helpers.mjs';

async function coloradoTabor(dateOfBirth, stateWithheld = 0) {
  const state = await household({ state: 'CO', dateOfBirth, forms: [w2(5000, { state: 'CO', stateWithheld, federalWithheld: 0 })] });
  await residency(state, '2025', [{ state: 'CO', residency: 'full-year' }]);
  const co = await stateReturn(state, '2025', 'CO');
  assert.equal(co.lines['13'], 0);
  return co.lines['38'];
}

test('Book 104 (2025) line 38: under 18 on January 1, 2025 with no Colorado tax and no wage withholding gets no TABOR refund', async () => {
  assert.equal(await coloradoTabor('2007-06-01'), 0);
  assert.equal(await coloradoTabor('2007-01-02'), 0);
});

test('Book 104 (2025) line 38: 18 or older on January 1, 2025, or under 18 claiming back Colorado withholding, gets the TABOR refund', async () => {
  assert.equal(await coloradoTabor('2007-01-01'), 19);
  assert.equal(await coloradoTabor('2006-12-31'), 19);
  assert.equal(await coloradoTabor('2007-06-01', 50), 19);
});
