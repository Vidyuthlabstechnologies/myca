import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat, propose } from '../src/router.mjs';
import { parseOrdersCsv, stateCodeFromName } from '../src/marketplace-orders.mjs';
import { trialBalance, listAccounts } from '../src/ledger.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: '27AABCU9603R1ZN', state: '27' };
  return state;
}

const MTR = [
  'Order Id,Shipment Date,Transaction Type,Ship To State,Sku,Quantity,Tax Exclusive Gross,Total Tax Amount,Tax Rate,Invoice Amount',
  '403-1111111-1111111,2026-09-03,Shipment,MAHARASHTRA,SKU-A,1,1200.00,60.00,5,1260.00',
  '403-2222222-2222222,2026-09-03,Shipment,KARNATAKA,SKU-B,2,800.00,40.00,5,840.00',
  '403-4444444-4444444,2026-09-03,Shipment,KARNATAKA,SKU-C,1,1000.00,180.00,18,1180.00',
  '403-5555555-5555555,2026-09-04,Shipment,Delhi,SKU-A,1,1200.00,60.00,5,1260.00',
  '403-2222222-2222222,2026-09-06,Refund,KARNATAKA,SKU-B,-1,-400.00,-20.00,5,-420.00',
  '403-9999999-9999999,2026-09-06,Refund,KARNATAKA,SKU-B,-1,-400.00,-20.00,5,-420.00',
  '403-7777777-7777777,2026-09-07,Shipment,Narnia,SKU-A,1,100.00,5.00,5,105.00',
].join('\n');

const SETTLEMENT = [
  'settlement-id,transaction-type,order-id,amount-type,amount-description,amount,posted-date',
  '777,Order,403-1111111-1111111,ItemPrice,Principal,1200.00,2026-09-03',
  '777,Order,403-1111111-1111111,ItemPrice,Tax,60.00,2026-09-03',
  '777,Order,403-1111111-1111111,ItemFees,Commission,-150.00,2026-09-03',
  '777,Order,403-2222222-2222222,ItemPrice,Principal,800.00,2026-09-03',
  '777,Order,403-2222222-2222222,ItemPrice,Tax,40.00,2026-09-03',
  '777,Order,403-2222222-2222222,ItemFees,Commission,-100.00,2026-09-03',
  '777,Refund,403-2222222-2222222,ItemPrice,Principal,-400.00,2026-09-06',
  '777,Refund,403-2222222-2222222,ItemPrice,Tax,-20.00,2026-09-06',
  '777,other-transaction,,,TCS,-16.00,2026-09-08',
  '777,other-transaction,,,TDS 194-O,-16.00,2026-09-08',
].join('\n');

test('an Amazon MTR posts one invoice per day and state under B2CS, returns become credit notes, and a settlement then settles those invoices with fees and the TDS and TCS receivables', async () => {
  const state = books();
  assert.equal(stateCodeFromName('MAHARASHTRA'), '27');
  assert.equal(stateCodeFromName('Delhi'), '07');
  assert.equal(stateCodeFromName('29'), '29');
  assert.equal(stateCodeFromName('Narnia'), '');
  const parsed = parseOrdersCsv(MTR);
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.equal(parsed.channel, 'amazon');
  assert.equal(parsed.sales.length, 4);
  assert.equal(parsed.returns.length, 2);
  assert.equal(parsed.held[0].reason, 'STATE_UNKNOWN');

  state.pendingFile = { name: 'mtr.csv', content: MTR };
  const held = await chat(state, 'import amazon orders');
  assert.equal(held.awaitingConfirmation, true, held.reply);
  assert.match(held.reply, /Amazon orders: 4 orders over 3 day-and-state invoices across 3 states, taxable ₹4,200\.00, 1 return; held back: 1 rows with a delivery state I cannot place; 1 returns for orders not in the books\./, held.reply);
  const posted = await chat(state, 'yes');
  assert.match(posted.reply, /Amazon: 4 orders posted as 3 invoices \(one per day and delivery state\) totalling ₹4,540\.00; 1 return as credit notes totalling ₹420\.00\./, posted.reply);
  const invoices = state.invoices.filter((inv) => inv.source === 'marketplace');
  assert.equal(invoices.length, 3);
  const karnataka = invoices.find((inv) => inv.placeOfSupply === '29');
  assert.equal(karnataka.partyName, 'Amazon customers');
  assert.equal(karnataka.lines.length, 2);
  assert.equal(karnataka.igst, 220);
  assert.equal(karnataka.cgst, 0);
  assert.deepEqual(karnataka.orders.map((o) => o.orderId), ['403-2222222-2222222', '403-4444444-4444444']);
  const maharashtra = invoices.find((inv) => inv.placeOfSupply === '27');
  assert.equal(maharashtra.cgst, 30);
  assert.equal(state.creditNotes.length, 1);
  assert.equal(state.creditNotes[0].invoiceId, karnataka.id);
  assert.equal(state.creditNotes[0].total, 420);
  assert.equal(state.creditNotes[0].marketplaceOrderId, '403-2222222-2222222');

  const json = await runTool(state, 'export_gstr1_json', { period: '2026-09' });
  assert.equal(json.ok, true);
  assert.equal((json.data.b2cl || []).length, 0);
  const b2cs = json.data.b2cs || [];
  assert.ok(b2cs.some((row) => row.pos === '29' && row.rt === 18 && row.txval === 1000), JSON.stringify(b2cs));
  assert.ok(b2cs.some((row) => row.pos === '07' && row.sply_ty === 'INTER'), JSON.stringify(b2cs));

  state.pendingFile = { name: 'mtr.csv', content: MTR };
  const again = propose(state, 'import_marketplace_orders', { csv: MTR, channel: 'amazon' });
  assert.match(again.reply, /4 already in the books/, again.reply);
  await chat(state, 'no');

  const settle = propose(state, 'import_settlement', { csv: SETTLEMENT, channel: 'amazon', bankAmount: 1398 });
  assert.equal(settle.awaitingConfirmation, true, settle.reply);
  assert.match(settle.reply, /It settles 2 marketplace invoices in the books/, settle.reply);
  const done = await chat(state, 'yes');
  assert.match(done.reply, /Settled 2 invoices: ₹1,398\.00 to the bank, fees ₹250\.00, TDS ₹16\.00 and TCS ₹16\.00 to claim/, done.reply);
  const settlement = state.settlements[0];
  assert.equal(settlement.status, 'matched');
  assert.equal(settlement.posting.settled, 1680);
  assert.equal(settlement.posting.leftOpen, 1180, 'the 18% Karnataka order was not in this settlement');
  assert.equal(maharashtra.status, 'paid');
  assert.equal(karnataka.status, 'partial', 'the 18% order in Karnataka was not in this settlement');
  const accounts = Object.fromEntries(listAccounts(state.ledger).map((a) => [a.code, a]));
  assert.equal(accounts['5210'].debitsPosted, 250);
  assert.equal(accounts['1150'].debitsPosted, 16);
  assert.equal(accounts['1210'].debitsPosted, 16);
  assert.equal(accounts['1002'].debitsPosted, 1398);
  assert.equal(trialBalance(state.ledger).balanced, true);
  const status = await runTool(state, 'settlement_status', {});
  assert.equal(status.data.byChannel.amazon.tds, 16);
});

test('a Flipkart GST report with state names and invoice totals is read by deriving the taxable value from the rate, and a settlement with no orders in the books is recorded without posting', async () => {
  const state = books();
  const csv = [
    'Order ID,Order Date,Event Type,Customer\'s Delivery State,FSN,Item Quantity,GST Rate,Total Invoice Value',
    'OD1,2026-09-10,Sale,Tamil Nadu,FSN1,1,12,1120',
    'OD2,2026-09-10,Sale,Tamil Nadu,FSN2,1,12,2240',
    'OD3,2026-09-11,Sale,Gujarat,FSN1,1,5,1050',
  ].join('\n');
  const out = await runTool(state, 'import_marketplace_orders', { csv });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.data.channel, 'flipkart');
  assert.equal(out.data.created.length, 2);
  const tn = state.invoices.find((inv) => inv.placeOfSupply === '33');
  assert.equal(tn.taxable, 3000);
  assert.equal(tn.igst, 360);
  const settle = await runTool(state, 'import_settlement', { csv: 'order id,description,amount,date\nOD9,Sale,1000,2026-09-20\nOD9,Commission,-100,2026-09-20', channel: 'flipkart', bankAmount: 900 });
  assert.equal(settle.ok, true, JSON.stringify(settle));
  assert.equal(settle.data.posting.posted, false);
  assert.equal(settle.data.posting.reason, 'NO_ORDERS_IN_BOOKS');
  assert.equal(trialBalance(state.ledger).balanced, true);
});
