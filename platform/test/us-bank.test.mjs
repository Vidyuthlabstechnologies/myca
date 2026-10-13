import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { listAccounts } from '../src/ledger.mjs';
import { usBankMatrix, usBankDate } from '../src/us-bank.mjs';

const SIGNED = `Date,Description,Amount,Running Bal.
10/01/2026,CAFE LUNA PAYMENT,"541.25","5,541.25"
10/02/2026,FLOUR MILL CO,-324.75,"5,216.50"
10/03/2026,MAPLE REALTY RENT,"(2,000.00)","3,216.50"
`;

const SPLIT = `Posted Date,Payee,Debit,Credit,Balance
2026-10-04,HILL COUNTRY DELI,,213.00,3429.50
13/10/2026,BAD DATE,10.00,,
`;

test('a US bank CSV with one signed amount column or debit and credit columns is read with month-first dates', () => {
  assert.equal(usBankDate('10/02/2026'), '2026-10-02');
  assert.equal(usBankDate('1/5/26'), '2026-01-05');
  assert.equal(usBankDate('2026-10-02'), '2026-10-02');
  assert.equal(usBankDate('13/10/2026'), '', 'a day-first date is refused rather than guessed');
  const signed = usBankMatrix(SIGNED);
  assert.equal(signed.ok, true, JSON.stringify(signed));
  assert.deepEqual(signed.rows[0], ['Date', 'Narration', 'Withdrawal', 'Deposit', 'Balance', 'Ref No']);
  assert.deepEqual(signed.rows[1], ['2026-10-01', 'CAFE LUNA PAYMENT', '', '541.25', '5541.25', '']);
  assert.deepEqual(signed.rows[2], ['2026-10-02', 'FLOUR MILL CO', '324.75', '', '5216.50', '']);
  assert.deepEqual(signed.rows[3], ['2026-10-03', 'MAPLE REALTY RENT', '2000.00', '', '3216.50', '']);
  const split = usBankMatrix(SPLIT);
  assert.equal(split.count, 1);
  assert.equal(split.held[0].reason, 'INVALID_DATE');
  assert.equal(usBankMatrix('a,b\n1,2').error, 'NO_HEADER');
});

test('import_bank for a US business posts the statement through the shared bank engine', async () => {
  const state = createState();
  state.company = { name: 'Maple Street Bakery', country: 'US', gstin: '', state: '', ein: '12-3456789' };
  const out = await runTool(state, 'import_bank', { content: SIGNED, type: 'csv', fileName: 'chase.csv' });
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300));
  assert.equal(out.data.ledger.posted, 3, JSON.stringify(out.data.ledger));
  const bank = listAccounts(state.ledger).find((a) => a.code === '1002');
  assert.equal(bank.debitsPosted, 541.25);
  assert.equal(bank.creditsPosted, 2324.75);
  const again = await runTool(state, 'import_bank', { content: SIGNED, type: 'csv' });
  assert.equal(again.data.ledger.posted, 0);
  assert.equal(again.data.ledger.skipped.filter((s) => s.reason === 'exists').length, 3);
  const bad = await runTool(state, 'import_bank', { content: 'a,b\n1,2', type: 'csv' });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'NO_HEADER');
});
