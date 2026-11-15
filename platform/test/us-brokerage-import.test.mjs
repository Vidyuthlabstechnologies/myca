import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { usBrokerageCsv, parseCsvText, usBrokerageCsvWords } from '../src/us-brokerage-import.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';

const BROKER = [
  'Account 1234 realized gain/loss,,,,,,',
  'Description,Date Acquired,Date Sold,Proceeds,Cost Basis,Wash Sale Loss Disallowed,Term',
  '"APPLE INC, 10 SH",01/15/2024,03/01/2025,"$2,500.00","$1,800.00",,Long Term',
  'TESLA 5 SH,2025-02-01,2025-06-01,1000,1200.50,50,Short Term',
  'VANGUARD ETF,2024-03-01,2025-02-01,900,100,,',
  'BAD BASIS,2024-03-01,2025-02-01,900,(100),,',
  'Total,,,4400,2900.5,50,',
].join('\n');

test('a broker export becomes 1099-B sales with terms and totals', () => {
  const out = usBrokerageCsv({}, { csv: BROKER, taxYear: '2025', payer: 'Schwab' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.data.format, 'realized-sales');
  const [form] = out.data.forms;
  assert.equal(form.payer, 'Schwab');
  assert.equal(form.fields.transactions.length, 3);
  assert.deepEqual(form.fields.transactions[0], { description: 'APPLE INC, 10 SH', dateAcquired: '2024-01-15', dateSold: '2025-03-01', proceeds: 2500, costBasis: 1800, term: 'long' });
  assert.equal(form.fields.transactions[1].washSaleLossDisallowed, 50);
  assert.equal(form.fields.transactions[2].term, 'short');
  assert.equal(out.data.totals.longTermGain, 700);
  assert.equal(out.data.totals.shortTermGain, 649.5);
  assert.equal(out.data.skippedRows, 1);
  assert.match(out.data.problems[0], /Row 6: cost basis cannot be negative/);
  assert.match(usBrokerageCsvWords(out.data), /long-term gain \$700/);
});

test('crypto trades are matched first in, first out with holding periods and fees', () => {
  const csv = [
    'Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price at Transaction,Fees and/or Spread',
    '2024-01-10T10:00:00Z,Buy,BTC,1,20000,100',
    '2024-12-01T10:00:00Z,Buy,BTC,1,40000,0',
    '2025-03-01T10:00:00Z,Sell,BTC,1.5,60000,90',
    '2025-04-01T10:00:00Z,Staking Income,ETH,0.1,3000,0',
    '2025-05-01T10:00:00Z,Send,BTC,0.5,0,0',
  ].join('\n');
  const out = usBrokerageCsv({}, { csv, taxYear: '2025' });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.data.format, 'crypto-trades');
  const rows = out.data.forms[0].fields.transactions;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => [row.dateAcquired, row.term, row.proceeds, row.costBasis]), [['2024-01-10', 'long', 59940, 20100], ['2024-12-01', 'short', 29970, 20000]]);
  assert.equal(out.data.rewardIncome, 300);
  assert.equal(out.data.totals.longTermGain, 39840);
});

test('a Coinbase export uses the total with fees, not the subtotal, and flags converts', () => {
  const csv = [
    'Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price Currency,Spot Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes',
    '2025-01-10T10:00:00Z,Buy,BTC,1,USD,20000,20000,20100,100,',
    '2025-03-01T10:00:00Z,Sell,BTC,1,USD,30000,30000,29900,100,',
    '2025-04-01T10:00:00Z,Convert,ETH,1,USD,3000,3000,2990,10,Converted 1 ETH to 0.05 BTC',
  ].join('\n');
  const out = usBrokerageCsv({}, { csv, taxYear: '2025' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const [sale] = out.data.forms[0].fields.transactions;
  assert.equal(sale.costBasis, 20100);
  assert.equal(sale.proceeds, 29900);
  assert.ok(out.data.notes.some((note) => /Convert \(1\)/.test(note)));
});

test('a sale without an earlier buy has zero basis and is called out', () => {
  const out = usBrokerageCsv({}, { csv: 'Date,Type,Asset,Quantity,Price\n2025-01-02,Sell,SOL,2,100' });
  assert.equal(out.data.forms[0].fields.transactions[0].costBasis, 0);
  assert.equal(out.data.skippedRows, 1);
  assert.ok(out.data.notes.some((note) => /no cost basis/.test(note)));
});

test('unknown columns and empty files are refused; quoted cells parse', () => {
  assert.equal(usBrokerageCsv({}, { csv: '' }).error, 'CSV_REQUIRED');
  assert.equal(usBrokerageCsv({}, { csv: 'a,b\n1,2' }).error, 'CSV_COLUMNS_UNKNOWN');
  assert.deepEqual(parseCsvText('a,"b ""c"", d"\r\n1,2'), [['a', 'b "c", d'], ['1', '2']]);
});

test('more than 500 sales are split into several 1099-B forms that add_us_tax_form accepts', async () => {
  const lines = ['Description,Date Acquired,Date Sold,Proceeds,Cost Basis'];
  for (let index = 0; index < 501; index += 1) lines.push(`X${index},2025-01-01,2025-02-01,10,9`);
  const out = usBrokerageCsv({}, { csv: lines.join('\n'), taxYear: '2025' });
  assert.equal(out.data.forms.length, 2);
  const state = createState();
  state.company = { name: 'Diaz household', country: 'US', entityType: 'household' };
  await runTool(state, 'set_us_taxpayer', { taxYear: '2025', filingStatus: 'single', taxpayer: { firstName: 'Ana', lastName: 'Diaz', ssn: '400-12-3456', dateOfBirth: '1988-04-02' } });
  const added = await runTool(state, 'add_us_tax_form', { taxYear: '2025', kind: '1099-B', payer: 'Broker', fields: out.data.forms[0].fields });
  assert.equal(added.ok, true, JSON.stringify(added));
  assert.equal(isRemoteQuery('us_brokerage_csv'), true);
  assert.equal(validateAssistantToolCall('us_brokerage_csv', { csv: 'x' }).ok, true);
});
