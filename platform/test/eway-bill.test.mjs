import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from '../src/store.mjs';
import { runTool } from '../src/tools.mjs';
import { chat } from '../src/router.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { previewOf } from '../src/chat-confirm.mjs';
import { ewayBillNeed, transportPayload } from '../src/eway-bill.mjs';
import { planTransportFromChat, planAddressFromChat } from '../src/eway-intent.mjs';
import { isRemoteQuery } from '../src/remote-contract.mjs';
import { validateAssistantToolCall } from '../src/assistant-contract.mjs';
import { bookView } from '../src/book-view.mjs';

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27', address: '4 Mill Lane, Pune' };
  const sale = (id, partyName, partyGstin, lines, extra = {}) => {
    const out = createInvoice(state, { id, date: '2026-09-05', partyName, partyGstin, lines, ...extra });
    assert.notEqual(out.ok, false, JSON.stringify(out));
    return out.invoice;
  };
  sale('INV-0001', 'Gujarat Mills', '24AAACF7856R1ZY', [{ description: 'Cloth', hsn: '5208', qty: 100, rate: 1000, gstRate: 5 }]);
  sale('INV-0002', 'Retail Mart', '27AAACH7409R1Z1', [{ description: 'Cloth', hsn: '5208', qty: 10, rate: 1000, gstRate: 5 }]);
  sale('INV-0003', 'Design Co', '27AAACH7409R1Z1', [{ description: 'Design', hsn: '998391', qty: 1, rate: 200000, gstRate: 18 }]);
  sale('INV-0004', 'Walk-in', '', [{ description: 'Cloth', qty: 60, rate: 1000, gstRate: 5 }]);
  return state;
}

test('whether an e-way bill is needed comes from the dated threshold rule, the goods lines and the value', () => {
  const state = books();
  const needed = ewayBillNeed(state, state.invoices[0]);
  assert.equal(needed.needed, true);
  assert.equal(needed.threshold, 50000);
  assert.equal(needed.interState, true);
  assert.equal(needed.ruleUsed, 'gst.ewaybill.threshold@2018-04-01');
  assert.match(needed.why, /Goods worth ₹1,05,000\.00 move to another state, above the ₹50,000\.00 limit/);
  assert.match(needed.why, /not reviewed yet/);
  const small = ewayBillNeed(state, state.invoices[1]);
  assert.equal(small.needed, false);
  assert.match(small.why, /not above ₹50,000\.00/);
  const service = ewayBillNeed(state, state.invoices[2]);
  assert.equal(service.needed, false);
  assert.match(service.why, /service/);
  const unknown = ewayBillNeed(state, state.invoices[3]);
  assert.equal(unknown.needed, true);
  assert.match(unknown.why, /within the state/);
  assert.match(unknown.why, /no HSN, so it is counted as goods/);
  assert.match(unknown.why, /Some states set a higher limit/);
});

test('transport details are checked, previewed, kept with the invoice, and the status walks from transport to IRN to generated', async () => {
  const state = books();
  const before = await runTool(state, 'eway_bill_status', { invoiceId: 'INV-0001' });
  assert.equal(before.data.status, 'transport-needed');
  const bad = previewOf(state, 'set_transport', { invoiceId: 'INV-0001', distanceKm: 120 });
  assert.match(bad.blockers[0], /vehicle number/);
  assert.match(previewOf(state, 'set_transport', { invoiceId: 'INV-0001', vehicleNo: '12AB', distanceKm: 120 }).blockers[0], /not a vehicle number/);
  assert.match(previewOf(state, 'set_transport', { invoiceId: 'INV-0001', vehicleNo: 'MH12AB1234', distanceKm: 0 }).blockers[0], /whole kilometres/);
  assert.match(previewOf(state, 'set_transport', { invoiceId: 'INV-0001', mode: 'rail', distanceKm: 500 }).blockers[0], /transport document number/);
  const good = previewOf(state, 'set_transport', { invoiceId: 'INV-0001', vehicleNo: 'mh 12 ab 1234', distanceKm: 120, transporterName: 'ABC Logistics' });
  assert.deepEqual(good.blockers, []);
  assert.match(good.summary, /^Transport for INV-0001 \(Gujarat Mills\): 120 km by road, vehicle MH12AB1234, transporter ABC Logistics\./);
  assert.match(good.effects[0], /above the ₹50,000\.00 limit/);
  const set = await runTool(state, 'set_transport', { invoiceId: 'INV-0001', vehicleNo: 'mh 12 ab 1234', distanceKm: 120, transporterName: 'ABC Logistics' });
  assert.equal(set.ok, true, JSON.stringify(set));
  assert.equal(state.invoices[0].transport.vehicleNo, 'MH12AB1234');
  assert.deepEqual(transportPayload(state.invoices[0].transport), { Distance: 120, TransMode: '1', TransName: 'ABC Logistics', VehNo: 'MH12AB1234', VehType: 'R' });
  const status = await runTool(state, 'eway_bill_status', { invoiceId: 'INV-0001' });
  assert.equal(status.data.status, 'irn-needed');
  const blocked = await runTool(state, 'govt_generate_ewb', { invoiceId: 'INV-0001' });
  assert.equal(blocked.error, 'IRN_REQUIRED');
  assert.equal((await runTool(state, 'govt_generate_ewb', { invoiceId: 'INV-0002' })).error, 'TRANSPORT_REQUIRED');
  state.invoices[0].irn = 'a'.repeat(64);
  assert.equal((await runTool(state, 'eway_bill_status', { invoiceId: 'INV-0001' })).data.status, 'ready');
  const attempt = await runTool(state, 'govt_generate_ewb', { invoiceId: 'INV-0001' });
  assert.equal(attempt.ok === true && attempt.ewbNo !== '' && !process.env.MYCA_ENABLE_LIVE_CALLS, false, 'nothing is generated with the live switch off');
  assert.equal(state.invoices[0].ewbNo, undefined);
  const doc = await runTool(state, 'invoice_document', { id: 'INV-0001' });
  assert.equal(doc.data.ewayBill.needed, true);
  assert.equal(doc.data.ewayBill.status, 'ready');
  assert.equal(doc.data.ewayBill.transport.words, '120 km by road, vehicle MH12AB1234, transporter ABC Logistics');
  const copy = deserialize(JSON.parse(JSON.stringify(serialize(state))));
  assert.equal(copy.invoices[0].transport.distanceKm, 120);
  assert.equal(isRemoteQuery('eway_bill_status'), true);
  assert.equal(validateAssistantToolCall('set_transport', { invoiceId: 'INV-0001', vehicleNo: 'MH12AB1234', distanceKm: 120 }).ok, true);
  assert.equal(validateAssistantToolCall('set_transport', { invoiceId: 'INV-0001', distanceKm: 12.5 }).ok, false);
});

test('chat: transport details are read from one sentence and previewed; the address of a customer is set by typing', async () => {
  const state = books();
  assert.deepEqual(planTransportFromChat('transport for INV-0001: vehicle MH12AB1234, 120 km, transporter ABC Logistics'), { kind: 'tool', name: 'set_transport', args: { invoiceId: 'INV-0001', distanceKm: 120, mode: 'road', vehicleNo: 'MH12AB1234', transporterName: 'ABC Logistics' } });
  assert.deepEqual(planTransportFromChat('INV-0001 goes by rail 500 km, RR no 123456'), { kind: 'tool', name: 'set_transport', args: { invoiceId: 'INV-0001', distanceKm: 500, mode: 'rail', docNo: '123456' } });
  assert.match(planTransportFromChat('transport for INV-0001 vehicle MH12AB1234').reply, /distance/);
  assert.equal(planTransportFromChat('how do e-way bills work?'), null);
  const held = await chat(state, 'transport for INV-0001: vehicle MH12AB1234, 120 km, transporter ABC Logistics');
  assert.equal(held.preview?.tool, 'set_transport', held.reply);
  assert.equal(state.invoices[0].transport, undefined, 'nothing before yes');
  const done = await chat(state, 'yes');
  assert.match(done.reply, /^Recorded transport for INV-0001: 120 km by road, vehicle MH12AB1234, transporter ABC Logistics\. Goods worth/);
  assert.deepEqual(planAddressFromChat(state, 'address of Gujarat Mills is 7 Ring Road, Surat'), { kind: 'tool', name: 'set_party_address', args: { partyName: 'Gujarat Mills', partyGstin: '24AAACF7856R1ZY', address: '7 Ring Road, Surat' } });
  assert.match(planAddressFromChat(state, 'address of Nobody is 1 Lane').reply, /do not have a customer called Nobody/);
  assert.equal(planAddressFromChat(state, 'what is the address of Gujarat Mills?'), null);
  const addr = await chat(state, "Gujarat Mills's address is 7 Ring Road, Surat");
  assert.equal(addr.preview?.tool, 'set_party_address', addr.reply);
  const saved = await chat(state, 'yes');
  assert.match(saved.reply, /^Recorded the address of Gujarat Mills: 7 Ring Road, Surat\./);
  assert.equal(state.parties.find((p) => p.name === 'Gujarat Mills').address, '7 Ring Road, Surat');
});

test('the buyer address prints on the invoice, is flagged when missing for a registered or large buyer, and new invoices can carry it', async () => {
  const state = books();
  const before = await runTool(state, 'invoice_document', { id: 'INV-0001' });
  assert.equal(before.data.buyer.address, '');
  assert.ok(before.data.missing.includes('BUYER_ADDRESS'));
  const walkIn = await runTool(state, 'invoice_document', { id: 'INV-0002' });
  assert.equal(walkIn.data.missing.includes('BUYER_ADDRESS'), true, 'registered buyer needs an address');
  await runTool(state, 'set_party_address', { partyName: 'Gujarat Mills', partyGstin: '24AAACF7856R1ZY', address: '7 Ring Road, Surat' });
  const after = await runTool(state, 'invoice_document', { id: 'INV-0001' });
  assert.equal(after.data.buyer.address, '7 Ring Road, Surat');
  assert.equal(after.data.missing.includes('BUYER_ADDRESS'), false);
  const withAddress = createInvoice(state, { id: 'INV-0009', date: '2026-09-06', partyName: 'New Buyer', partyGstin: '27AAACH7409R1Z1', partyAddress: '9 Station Road, Pune', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 100, gstRate: 5 }] });
  assert.equal(withAddress.ok, true, JSON.stringify(withAddress));
  assert.equal((await runTool(state, 'invoice_document', { id: 'INV-0009' })).data.buyer.address, '9 Station Road, Pune');
  const small = createInvoice(state, { id: 'INV-0010', date: '2026-09-06', partyName: 'Cash Buyer', lines: [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 100, gstRate: 5 }] });
  assert.equal((await runTool(state, 'invoice_document', { id: small.invoice.id })).data.missing.includes('BUYER_ADDRESS'), false, 'a small unregistered sale needs none');
});

test('a share is recorded with who, when and how; a cancelled share leaves nothing; the document lists shares', async () => {
  const root = books();
  const state = bookView(root, root, { actor: { userId: 'u-owner', role: 'admin' } });
  const cancelled = await runTool(state, 'record_share', { invoiceId: 'INV-0001', channel: 'share_sheet', outcome: 'cancelled' });
  assert.deepEqual(cancelled, { ok: true, invoiceId: 'INV-0001', recorded: false });
  assert.equal(root.invoices[0].shares, undefined);
  const shared = await runTool(state, 'record_share', { invoiceId: 'INV-0001', channel: 'share_sheet', outcome: 'shared' });
  assert.equal(shared.recorded, true);
  assert.equal(shared.share.by, 'u-owner');
  assert.equal(shared.count, 1);
  const printed = await runTool(state, 'record_share', { invoiceId: 'INV-0001', channel: 'print', outcome: 'printed' });
  assert.equal(printed.count, 2);
  const doc = await runTool(state, 'invoice_document', { id: 'INV-0001' });
  assert.equal(doc.data.shares.length, 2);
  assert.equal(doc.data.shares[0].channel, 'share_sheet');
  assert.equal((await runTool(state, 'record_share', { invoiceId: 'INV-0099' })).error, 'INVOICE_NOT_FOUND');
  assert.equal((await runTool(state, 'record_share', { invoiceId: 'INV-0001', outcome: 'lost' })).error, 'BAD_OUTCOME');
  assert.equal(isRemoteQuery('record_share'), true);
  assert.equal(validateAssistantToolCall('record_share', { invoiceId: 'INV-0001', outcome: 'shared' }).ok, true);
});
