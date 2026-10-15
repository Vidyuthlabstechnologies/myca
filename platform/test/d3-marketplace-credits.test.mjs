import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { periodOf, quarterOfDate } from '../src/marketplace-credits.mjs';
import { trialBalance, listAccounts } from '../src/ledger.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

const MTR = [
  'Order Id,Shipment Date,Transaction Type,Ship To State,Sku,Quantity,Tax Exclusive Gross,Total Tax Amount,Tax Rate,Invoice Amount',
  '403-1,2026-09-03,Shipment,KARNATAKA,SKU-A,1,10000.00,1800.00,18,11800.00',
  '403-2,2026-09-04,Shipment,MAHARASHTRA,SKU-A,1,10000.00,1800.00,18,11800.00',
].join('\n');

const SETTLEMENT = [
  'settlement-id,transaction-type,order-id,amount-type,amount-description,amount,posted-date',
  '901,Order,403-1,ItemPrice,Principal,10000.00,2026-09-03',
  '901,Order,403-1,ItemPrice,Tax,1800.00,2026-09-03',
  '901,Order,403-2,ItemPrice,Principal,10000.00,2026-09-04',
  '901,Order,403-2,ItemPrice,Tax,1800.00,2026-09-04',
  '901,Order,,ItemFees,Commission,-2000.00,2026-09-04',
  '901,other-transaction,,,TCS,-100.00,2026-09-30',
  '901,other-transaction,,,TDS 194-O,-200.00,2026-09-30',
].join('\n');

test('TCS and TDS 194-O deducted in settlements are matched to the portal statement and 26AS by GSTIN and TAN, a short month is an exception, and confirmed TCS pays GST from the cash ledger before new cash', async () => {
  const state = books();
  assert.equal(periodOf('Sep-2026'), '2026-09');
  assert.equal(periodOf('09/2026'), '2026-09');
  assert.equal(quarterOfDate('2026-09-30'), 'Q2 2026-27');
  assert.equal(quarterOfDate('2027-02-01'), 'Q4 2026-27');

  const naming = await chat(state, 'amazon GSTIN 29AAACA1234A1ZX TAN BLRA12345A');
  assert.equal(naming.awaitingConfirmation, true, naming.reply);
  const named = await chat(state, 'yes');
  assert.match(named.reply, /Amazon: GSTIN 29AAACA1234A1ZX, TAN BLRA12345A/, named.reply);
  assert.equal((await runTool(state, 'set_channel_identity', { channel: 'flipkart', gstin: 'nope' })).error, 'BAD_GSTIN');

  const orders = await runTool(state, 'import_marketplace_orders', { csv: MTR, channel: 'amazon' });
  assert.equal(orders.ok, true, JSON.stringify(orders));
  const settled = await runTool(state, 'import_settlement', { csv: SETTLEMENT, channel: 'amazon', bankAmount: 21300 });
  assert.equal(settled.ok, true, JSON.stringify(settled));
  assert.equal(settled.data.posting.posted, true);

  const before = await runTool(state, 'marketplace_credits', {});
  assert.equal(before.data.tcs[0].status, 'awaiting statement');
  assert.equal(before.data.tcs[0].recorded, 100);
  assert.equal(before.data.tds[0].quarter, 'Q2 2026-27');
  assert.equal(before.data.tds[0].recorded, 200);
  assert.equal(before.data.totals.tcsAvailable, 0);

  const tcsCsv = 'GSTIN of E-Commerce Operator,Name of E-Commerce Operator,Period,Taxable Value,Integrated Tax,Central Tax,State/UT Tax\n29AAACA1234A1ZX,Amazon Seller Services,Sep-2026,20000,50,15,15\n07AAACF1234F1Z9,Flipkart Internet,Sep-2026,5000,25,0,0';
  state.pendingFile = { name: 'tcs.csv', content: tcsCsv };
  const held = await chat(state, 'import tcs statement');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /TCS statement: 2 operator-months totalling ₹105\.00/, held.reply);
  const posted = await chat(state, 'yes');
  assert.match(posted.reply, /Recorded 2 operator-months of TCS totalling ₹105\.00\./, posted.reply);
  assert.equal(state.tcsStatements.find((row) => row.gstin === '07AAACF1234F1Z9').channel, 'flipkart', 'matched by name when the number is not set');

  const after = await runTool(state, 'marketplace_credits', {});
  const amazon = after.data.tcs.find((row) => row.channel === 'amazon');
  assert.equal(amazon.reported, 80);
  assert.equal(amazon.gap, 20);
  assert.equal(amazon.status, 'short in statement');
  assert.equal(after.data.totals.tcsAvailable, 105);
  const exceptions = await runTool(state, 'exceptions', {});
  const short = exceptions.data.exceptions.find((row) => row.code === 'TCS_NOT_REPORTED');
  assert.ok(short, JSON.stringify(exceptions.data.exceptions.map((r) => r.code)));
  assert.equal(short.moneyAtRisk, 20);

  const payment = await runTool(state, 'gst_payable', { period: '2026-09' });
  assert.equal(payment.ok, true, JSON.stringify(payment));
  assert.equal(payment.data.cash.total, 3600, 'output tax before TCS');
  assert.deepEqual(payment.data.tcsUsed, { igst: 75, cgst: 15, sgst: 15, total: 105 });
  assert.equal(payment.data.toPay, 3495);
  const recorded = await runTool(state, 'record_gst_payment', { period: '2026-09', date: '2026-10-15', cpin: '26101234567890' });
  assert.equal(recorded.ok, true, JSON.stringify(recorded));
  assert.equal(recorded.payment.cashTotal, 3495);
  assert.equal(recorded.payment.tcsUsed.total, 105);
  const accounts = Object.fromEntries(listAccounts(state.ledger).map((a) => [a.code, a]));
  assert.equal(accounts['1210'].creditsPosted, 105);
  assert.equal(accounts['1210'].debitsPosted, 100, 'the receivable the settlement booked');
  assert.equal(trialBalance(state.ledger).balanced, true);
  assert.equal((await runTool(state, 'marketplace_credits', {})).data.totals.tcsAvailable, 0);

  const form26as = 'Section,Name of Deductor,TAN of Deductor,Amount Paid/Credited,Tax Deducted,Date of Booking\n194O,AMAZON SELLER SERVICES PVT LTD,BLRA12345A,20000,150,2026-09-30\n194C,SOME CLIENT,MUMS12345B,50000,1000,2026-09-10';
  const credits = await runTool(state, 'import_26as_credits', { csv: form26as });
  assert.equal(credits.ok, true, JSON.stringify(credits));
  assert.equal(credits.data.imported, 1);
  assert.equal(credits.data.otherSections, 1);
  const tds = (await runTool(state, 'marketplace_credits', {})).data.tds[0];
  assert.equal(tds.in26as, 150);
  assert.equal(tds.status, 'short in 26AS');
  const again = await runTool(state, 'import_26as_credits', { csv: form26as });
  assert.equal(again.data.imported, 0);
  const words = await chat(state, 'tcs and tds credits');
  assert.match(words.reply, /GST TCS: ₹100\.00 deducted by marketplaces in settlements, ₹105\.00 confirmed by the portal statement, ₹105\.00 used against GST, ₹0\.00 available\./, words.reply);
  assert.match(words.reply, /TDS 194-O: ₹200\.00 deducted in settlements, ₹150\.00 in Form 26AS\./);
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(copy.channels.amazon.tan, 'BLRA12345A');
  assert.equal(copy.tdsCreditStatements.length, 1);
});
