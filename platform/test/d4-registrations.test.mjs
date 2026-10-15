import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat, propose } from '../src/router.mjs';
import { trialBalance, listAccounts } from '../src/ledger.mjs';
import { localToday } from '../src/dates.mjs';

const TODAY = localToday();

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function withCheck(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const product = ALPHABET.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return first14 + ALPHABET[(36 - (sum % 36)) % 36];
}
const PRINCIPAL = withCheck('27AABCU9603R1Z');
const KARNATAKA = withCheck('29AABCU9603R1Z');
const DELHI = withCheck('07AABCU9603R1Z');
const OTHER_PAN = withCheck('29AAACG1234A1Z');

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Nalanda Textiles', gstin: PRINCIPAL, state: '27', address: '12 Market Road', city: 'Pune', pin: '411001' };
  return state;
}

test('a second registration shares the PAN and takes one state; documents under it split GST from its state; returns, payments and filings run per registration; it cannot retire with open documents', async () => {
  const state = books();
  assert.equal((await runTool(state, 'set_registration', { gstin: OTHER_PAN })).error, 'DIFFERENT_PAN');
  assert.equal((await runTool(state, 'set_registration', { gstin: PRINCIPAL })).error, 'IS_PRINCIPAL');
  const added = await chat(state, `add registration ${KARNATAKA} as apob called Amazon BLR`);
  assert.ok(added.reply.includes(`Added Amazon BLR ${KARNATAKA} (apob, state 29)`), added.reply);
  assert.equal((await runTool(state, 'set_registration', { gstin: withCheck('29AABCU9603R2Z') })).error, 'STATE_TAKEN');
  const listed = await runTool(state, 'registrations', {});
  assert.equal(listed.data.registrations.length, 2);
  assert.equal(listed.data.several, true);

  const sale = await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyState: '29', lines: [{ description: 'Cotton', hsn: '5205', qty: 1, rate: 1000, gstRate: 18 }], date: '2026-09-10', registrationGstin: KARNATAKA });
  assert.equal(sale.ok, true, JSON.stringify(sale));
  assert.equal(sale.invoice.registrationGstin, KARNATAKA);
  assert.equal(sale.invoice.cgst, 90, 'intra-state from the Karnataka registration to a Karnataka buyer');
  assert.equal(sale.invoice.igst, 0);
  const principalSale = await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyState: '29', lines: [{ description: 'Cotton', hsn: '5205', qty: 1, rate: 1000, gstRate: 18 }], date: '2026-09-11' });
  assert.equal(principalSale.invoice.igst, 180, 'from Maharashtra to Karnataka it is IGST');
  assert.equal(principalSale.invoice.registrationGstin, undefined);
  const unknown = await runTool(state, 'create_invoice', { partyName: 'X', lines: [{ description: 'x', qty: 1, rate: 1, gstRate: 0 }], registrationGstin: DELHI });
  assert.equal(unknown.error, 'UNKNOWN_REGISTRATION');
  const bill = await runTool(state, 'create_purchase', { partyName: 'Ganga Mills', partyGstin: '29AAACG1234A1Z5', lines: [{ description: 'Yarn', hsn: '5205', qty: 1, rate: 500, gstRate: 5 }], date: '2026-09-12', registrationGstin: KARNATAKA });
  assert.equal(bill.ok, true, JSON.stringify(bill));
  assert.equal(bill.invoice.cgst, 12.5, 'a Karnataka supplier to the Karnataka registration is intra-state');
  const doc = await runTool(state, 'invoice_document', { id: sale.invoice.id });
  assert.equal(doc.data.seller.gstin, KARNATAKA);
  assert.equal(doc.data.seller.state.code, '29');
  const printed = await runTool(state, 'print_invoice', { id: sale.invoice.id });
  assert.match(printed.html, new RegExp(KARNATAKA));

  const ka = await runTool(state, 'gst_payable', { period: '2026-09', gstin: KARNATAKA });
  assert.equal(ka.ok, true, JSON.stringify(ka));
  assert.equal(ka.data.gstin, KARNATAKA);
  assert.equal(ka.data.output.total, 180);
  assert.equal(ka.data.credit.total, 25);
  const mh = await runTool(state, 'gst_payable', { period: '2026-09' });
  assert.equal(mh.data.output.total, 180);
  assert.equal(mh.data.credit.total, 0, 'the Karnataka bill is not the principal\'s credit');
  const json = await runTool(state, 'export_gstr1_json', { period: '2026-09', gstin: KARNATAKA, fp: '092026' });
  assert.equal(json.data.gstin, KARNATAKA);
  assert.equal(json.data.b2cl.length + json.data.b2cs.length, 1);
  const review = await runTool(state, 'gst_review', { period: '2026-09', gstin: KARNATAKA });
  assert.equal(review.data.gstin, KARNATAKA);
  assert.equal(review.data.toPay, 155);
  const paid = await runTool(state, 'record_gst_payment', { period: '2026-09', date: TODAY, gstin: KARNATAKA, cpin: '26101234567890' });
  assert.equal(paid.ok, true, JSON.stringify(paid));
  assert.equal(paid.payment.id, `GSTP-2026-09-${KARNATAKA}`);
  assert.equal(paid.payment.cashTotal, 155);
  assert.ok(state.gstPayments[`2026-09@${KARNATAKA}`]);
  assert.equal((await runTool(state, 'record_gst_payment', { period: '2026-09', date: TODAY, gstin: KARNATAKA })).error, 'ALREADY_RECORDED');
  const principalPaid = await runTool(state, 'record_gst_payment', { period: '2026-09', date: TODAY });
  assert.equal(principalPaid.ok, true, JSON.stringify(principalPaid));
  assert.equal(principalPaid.payment.cashTotal, 180);
  assert.equal(trialBalance(state.ledger).balanced, true);

  const filed = await runTool(state, 'record_filing', { returnType: 'GSTR-3B', period: '2026-09', arn: 'AA290926123456K', filedOn: TODAY, gstin: KARNATAKA });
  assert.equal(filed.ok, true, JSON.stringify(filed));
  assert.equal(filed.filing.gstin, KARNATAKA);
  const again = await runTool(state, 'record_filing', { returnType: 'GSTR-3B', period: '2026-09', arn: 'AA270926123456M', filedOn: TODAY });
  assert.equal(again.ok, true, 'the principal can file the same return for the same period');
  const status = (await runTool(state, 'registrations', {})).data.registrations.find((reg) => reg.gstin === KARNATAKA);
  assert.equal(status.periods.find((p) => p.period === '2026-09').gstr3b, true);

  const blocked = await runTool(state, 'retire_registration', { gstin: KARNATAKA });
  assert.equal(blocked.error, 'OPEN_DOCUMENTS');
  assert.deepEqual(blocked.invoices, [sale.invoice.id]);
  await runTool(state, 'record_receipt', { invoiceId: sale.invoice.id, amount: 1180, date: '2026-09-20' });
  await runTool(state, 'record_payment', { billId: bill.invoice.id, amount: 525, date: '2026-09-20' });
  const retired = await runTool(state, 'retire_registration', { gstin: KARNATAKA, effectiveTo: TODAY });
  assert.equal(retired.ok, true, JSON.stringify(retired));
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(copy.company.registrations[0].effectiveTo, TODAY);
});

test('marketplace orders post under the registration of the ship-from state, and a stock transfer between registrations raises the invoice at cost with IGST, the bill with credit, a contra settlement and the stock moves', async () => {
  const state = books();
  await runTool(state, 'set_registration', { gstin: KARNATAKA, kind: 'warehouse', label: 'FBA Bengaluru' });
  await runTool(state, 'set_sku_cost', { sku: 'SKU-A', cost: 400, gstRate: 12, hsn: '5205' });
  await runTool(state, 'record_stock', { sku: 'SKU-A', qty: 100, location: 'principal', date: '2026-09-01' });

  const moved = propose(state, 'record_stock_transfer', { sku: 'SKU-A', qty: 40, fromGstin: PRINCIPAL, toGstin: KARNATAKA, date: '2026-09-02' });
  assert.equal(moved.awaitingConfirmation, true, moved.reply);
  assert.ok(moved.reply.includes(`Transfer 40 of SKU-A from Principal (${PRINCIPAL}) to FBA Bengaluru (${KARNATAKA}) on 2 September 2026 at cost: ₹16,000.00 plus IGST ₹1,920.00`), moved.reply);
  const done = await chat(state, 'yes');
  assert.match(done.reply, /Moved 40 of SKU-A from Principal .* to FBA Bengaluru .* at cost: transfer invoice INV-000\d for ₹16,000\.00 plus IGST ₹1,920\.00/, done.reply);
  const transfer = state.invoices.find((inv) => inv.transfer);
  assert.equal(transfer.partyGstin, KARNATAKA);
  assert.equal(transfer.igst, 1920);
  assert.equal(transfer.status, 'paid');
  assert.equal(transfer.registrationGstin, undefined, 'sent from the principal');
  const received = state.purchases.find((bill) => bill.transfer);
  assert.equal(received.registrationGstin, KARNATAKA);
  assert.equal(received.igst, 1920);
  assert.equal(received.status, 'paid');
  assert.equal(trialBalance(state.ledger).balanced, true);
  const stock = await runTool(state, 'stock_position', { sku: 'SKU-A' });
  assert.deepEqual(stock.data.rows.map((row) => [row.location, row.qty]), [['fba-bengaluru', 40], ['principal', 60]]);
  assert.equal((await runTool(state, 'record_stock_transfer', { sku: 'SKU-B', qty: 1, fromGstin: PRINCIPAL, toGstin: KARNATAKA })).error, 'COST_REQUIRED');
  assert.equal((await runTool(state, 'record_stock_transfer', { sku: 'SKU-A', qty: 1, fromGstin: PRINCIPAL, toGstin: PRINCIPAL })).error, 'SAME_REGISTRATION');

  const mtr = [
    'Order Id,Shipment Date,Transaction Type,Ship To State,Ship From State,Sku,Quantity,Tax Exclusive Gross,Total Tax Amount,Tax Rate,Invoice Amount',
    '403-1,2026-09-05,Shipment,KARNATAKA,KARNATAKA,SKU-A,1,1000.00,120.00,12,1120.00',
    '403-2,2026-09-05,Shipment,KARNATAKA,MAHARASHTRA,SKU-A,1,1000.00,120.00,12,1120.00',
    '403-3,2026-09-05,Shipment,TAMIL NADU,KARNATAKA,SKU-A,1,1000.00,120.00,12,1120.00',
  ].join('\n');
  const orders = await runTool(state, 'import_marketplace_orders', { csv: mtr, channel: 'amazon' });
  assert.equal(orders.ok, true, JSON.stringify(orders));
  assert.equal(orders.data.created.length, 3);
  const fromKa = state.invoices.filter((inv) => inv.source === 'marketplace' && inv.registrationGstin === KARNATAKA);
  assert.equal(fromKa.length, 2);
  const kaToKa = fromKa.find((inv) => inv.placeOfSupply === '29');
  assert.equal(kaToKa.cgst, 60, 'shipped from the Karnataka warehouse to a Karnataka buyer: CGST and SGST');
  const kaToTn = fromKa.find((inv) => inv.placeOfSupply === '33');
  assert.equal(kaToTn.igst, 120);
  const mhToKa = state.invoices.find((inv) => inv.source === 'marketplace' && !inv.registrationGstin);
  assert.equal(mhToKa.igst, 120);
  const ka = await runTool(state, 'gst_payable', { period: '2026-09', gstin: KARNATAKA });
  assert.equal(ka.data.output.total, 240);
  assert.equal(ka.data.credit.total, 1920, 'the transfer credit sits with the receiving registration');
  const accounts = Object.fromEntries(listAccounts(state.ledger).map((a) => [a.code, a]));
  assert.equal(accounts['1202'].debitsPosted, 1920);
});
