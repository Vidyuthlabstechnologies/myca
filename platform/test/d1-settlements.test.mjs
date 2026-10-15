import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat, propose } from '../src/router.mjs';
import { parseSettlementCsv } from '../src/settlements.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { createTransfers } from '../src/ledger.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

const AMAZON = [
  'settlement-id,transaction-type,order-id,amount-type,amount-description,amount,posted-date,sku,quantity-purchased',
  '12345678901,Order,403-1111111-1111111,ItemPrice,Principal,1200.00,2026-09-03,SKU-A,1',
  '12345678901,Order,403-1111111-1111111,ItemPrice,Tax,60.00,2026-09-03,SKU-A,1',
  '12345678901,Order,403-1111111-1111111,ItemFees,Commission,-180.00,2026-09-03,SKU-A,1',
  '12345678901,Order,403-1111111-1111111,ItemFees,FBAPerUnitFulfillmentFee,-65.00,2026-09-03,SKU-A,1',
  '12345678901,Order,403-2222222-2222222,ItemPrice,Principal,800.00,2026-09-05,SKU-B,1',
  '12345678901,Order,403-2222222-2222222,ItemPrice,Tax,40.00,2026-09-05,SKU-B,1',
  '12345678901,Order,403-2222222-2222222,ItemFees,Commission,-120.00,2026-09-05,SKU-B,1',
  '12345678901,Refund,403-3333333-3333333,ItemPrice,Principal,-500.00,2026-09-06,SKU-A,1',
  '12345678901,other-transaction,,,TCS,-20.00,2026-09-07,,',
  '12345678901,other-transaction,,,TDS 194-O,-20.00,2026-09-07,,',
  '12345678901,other-transaction,403-1111111-1111111,,SAFE-T Claim Reimbursement,100.00,2026-09-08,,',
  '12345678901,other-transaction,403-2222222-2222222,,Late Shipment Penalty,-50.00,2026-09-08,,',
  '12345678901,other-transaction,,,Subscription Fee,-999.00,2026-09-09,,',
].join('\n');

test('an Amazon settlement is typed line by line, adds up to an expected payout, matches the bank credit, and penalties become exceptions', async () => {
  const state = books();
  const parsed = parseSettlementCsv(AMAZON);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.equal(parsed.channel, 'amazon');
  assert.equal(parsed.shape, 'long');
  assert.equal(parsed.settlementId, '12345678901');
  assert.deepEqual(parsed.totals, { sale: 2000, tax: 100, refund: -500, fee: -1364, penalty: -50, reimbursement: 100, tcs: -20, tds: -20, adjustment: 0 });
  assert.equal(parsed.expected, 246);
  assert.equal(parsed.orders, 2);

  const t = createTransfers(state.ledger, [{ id: 1, debitAccountId: 1002, creditAccountId: 1100, amount: 24600n, code: 'BANK', invoiceId: 'bank-row-1', userData: '2026-09-12' }]);
  assert.equal(t[0].ok, true, JSON.stringify(t));
  state.pendingFile = { name: 'settlement.csv', content: AMAZON };
  const held = await chat(state, 'import amazon settlement');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /Amazon settlement 12345678901 \(3 September 2026 to 9 September 2026\): 2 orders, sales ₹2,100\.00, refunds ₹500\.00, fees ₹1,364\.00, penalties ₹50\.00, TCS ₹20\.00, TDS 194-O ₹20\.00, reimbursements ₹100\.00\. Expected payout ₹246\.00\. Paid: ₹246\.00 in the bank on 12 September 2026, matches\./, held.reply);
  const posted = await chat(state, 'yes');
  assert.match(posted.reply, /^Recorded STL-0001\./, posted.reply);
  assert.equal(state.settlements.length, 1);
  assert.equal(state.settlements[0].status, 'matched');
  assert.equal(state.settlements[0].bank.transferId, '1');
  assert.equal(state.imports.at(-1).source, 'settlement:amazon');

  state.pendingFile = { name: 'settlement.csv', content: AMAZON };
  const again = await chat(state, 'import settlement');
  assert.match(again.reply, /already in the books as STL-0001/);

  const exceptions = await runTool(state, 'exceptions', {});
  const rows = (exceptions.data?.exceptions || exceptions.data?.rows || exceptions.data?.queue || exceptions.exceptions || []);
  const penalty = rows.find((row) => row.code === 'MARKETPLACE_PENALTY');
  assert.ok(penalty, JSON.stringify(exceptions).slice(0, 400));
  assert.equal(penalty.moneyAtRisk, 50);
  assert.match(penalty.title, /403-2222222-2222222/);

  const status = await chat(state, 'did amazon pay correctly?');
  assert.match(status.reply, /Amazon: 1 settlement to 9 September 2026, expected ₹246\.00, paid ₹246\.00, penalties ₹50\.00 \(TCS ₹20\.00, TDS ₹20\.00 to claim\)/, status.reply);
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(copy.settlements[0].id, 'STL-0001');
  assert.equal(validateAssistantToolCall('import_settlement', { csv: 'x', channel: 'ebay' }).ok, false);
});

const FLIPKART = [
  'Order Item ID,Settlement Date,FSN,Sale Amount,GST,Commission,Shipping Fee,Collection Fee,TCS,TDS,Refund,Penalty,Settlement Value',
  'OD1,2026-09-10,FSN1,1000,50,100,60,20,10,10,0,0,850',
  'OD2,2026-09-10,FSN2,2000,100,200,60,40,20,20,0,30,1730',
  'OD3,2026-09-11,FSN1,0,0,0,80,0,0,0,1000,0,-1080',
].join('\n');

test('a Flipkart-style sheet with one row per order is read wide, a stated bank amount gives the shortfall, and an unmatched payout is an exception until the statement arrives', async () => {
  const state = books();
  const parsed = parseSettlementCsv(FLIPKART);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.equal(parsed.channel, 'flipkart');
  assert.equal(parsed.shape, 'wide');
  assert.equal(parsed.totals.sale, 3000);
  assert.equal(parsed.totals.fee, -560);
  assert.equal(parsed.totals.refund, -1000);
  assert.equal(parsed.totals.penalty, -30);
  assert.equal(parsed.expected, 1500);
  assert.equal(parsed.fileValue, 1500);
  assert.equal(parsed.fileDiffers, false);

  state.pendingFile = { name: 'fk.csv', content: FLIPKART };
  const short = await chat(state, 'import flipkart settlement, bank received 1,400');
  assert.equal(short.awaitingConfirmation, true, short.reply);
  assert.match(short.reply, /Paid: ₹1,400\.00, short by ₹100\.00/);
  const posted = await chat(state, 'yes');
  assert.match(posted.reply, /Recorded STL-0001/);
  assert.equal(state.settlements[0].status, 'short');

  const unmatched = propose(state, 'import_settlement', { csv: FLIPKART.replace('OD1', 'OD9').replace(/2026-09-1/g, '2026-10-1'), channel: 'flipkart' });
  assert.equal(unmatched.awaitingConfirmation, true, unmatched.reply);
  assert.match(unmatched.reply, /Not found in the bank yet/);
  await chat(state, 'yes');
  const exceptions = await runTool(state, 'exceptions', {});
  const rows = (exceptions.data?.exceptions || exceptions.data?.rows || exceptions.data?.queue || exceptions.exceptions || []);
  assert.ok(rows.some((row) => row.code === 'SETTLEMENT_SHORT' && row.moneyAtRisk === 100), JSON.stringify(rows.map((r) => r.code)));
  assert.ok(rows.some((row) => row.code === 'SETTLEMENT_NOT_IN_BANK'), JSON.stringify(rows.map((r) => r.code)));
  const status = await runTool(state, 'settlement_status', { channel: 'flipkart' });
  assert.equal(status.data.byChannel.flipkart.settlements, 2);
  assert.equal(status.data.byChannel.flipkart.short, 100);
  assert.equal(status.data.byChannel.flipkart.unmatched, 1);
  assert.equal(status.data.settlements[0].lines, undefined, 'lines stay out of the status listing');
  const bad = parseSettlementCsv('a,b\n1,2');
  assert.equal(bad.error, 'NO_HEADER');
});
