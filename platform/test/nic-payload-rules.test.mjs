import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { invoiceToNicPayload, nicPayloadProblems, nicPayloadRefusal, nicCancelProblem, nicPartyFor, nicSupplyType } from '../src/nic-config.mjs';
import { nicGenerateIrn, nicCancelIrn } from '../src/nic-client.mjs';

const ADDRESS = 'Plot 4, MIDC, Pune 411019';

function books() {
  const state = createState();
  state.company = { ...state.company, address: ADDRESS, pin: '411019', city: 'Pune' };
  return state;
}

function codes(state, inv) {
  return nicPayloadProblems(state.company, inv, nicPartyFor(state, inv)).map((problem) => problem.code);
}

test('a B2B invoice with HSN codes and both addresses builds a payload with real PINs and no problems', () => {
  const state = books();
  const { invoice } = createInvoice(state, { date: '2026-09-05', partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', partyState: '27', partyAddress: '12 FC Road, Shivajinagar, Pune 411004', lines: [{ description: 'Fabric', hsn: '520811', qty: 2, rate: 1000, gstRate: 5 }, { description: 'Design fee', hsn: '998391', qty: 1, rate: 5000, gstRate: 18 }] });
  assert.deepEqual(codes(state, invoice), []);
  const payload = invoiceToNicPayload(state.company, invoice, nicPartyFor(state, invoice));
  assert.equal(payload.TranDtls.SupTyp, 'B2B');
  assert.equal(payload.SellerDtls.Pin, 411019);
  assert.equal(payload.BuyerDtls.Pin, 411004);
  assert.equal(payload.BuyerDtls.Addr1, '12 FC Road, Shivajinagar, Pune 411004');
  assert.deepEqual(payload.ItemList.map((item) => [item.HsnCd, item.IsServc]), [['520811', 'N'], ['998391', 'Y']]);
  assert.equal(nicPayloadRefusal(state, invoice), null);
});

test('nothing is made up: a missing HSN, seller PIN, seller address or buyer PIN is a problem, never a default', () => {
  const state = createState();
  state.company = { ...state.company, address: '', pin: '', city: '' };
  const { invoice } = createInvoice(state, { date: '2026-09-05', partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', partyState: '27', lines: [{ description: 'Fabric', qty: 1, rate: 1000, gstRate: 5 }, { description: 'Lace', hsn: '58', qty: 1, rate: 100, gstRate: 5 }] });
  assert.deepEqual(codes(state, invoice).sort(), ['BUYER_PIN_REQUIRED', 'HSN_REQUIRED', 'SELLER_ADDRESS_REQUIRED', 'SELLER_PIN_REQUIRED']);
  const payload = invoiceToNicPayload(state.company, invoice);
  assert.equal(payload.ItemList[0].HsnCd, '');
  assert.notEqual(payload.SellerDtls.Pin, 411001);
  assert.notEqual(payload.SellerDtls.Loc, 'Pune');
  const refusal = nicPayloadRefusal(state, invoice);
  assert.equal(refusal.error, 'IRN_PAYLOAD_INVALID');
  assert.match(refusal.hint, /Line 1, 2 needs an HSN or SAC code/);
});

test('a B2C invoice gets no IRN, and an export carries EXPWP or EXPWOP with the country, currency and shipping bill', () => {
  const state = books();
  const b2c = createInvoice(state, { date: '2026-09-05', partyName: 'Walk-in', partyState: '27', lines: [{ description: 'Fabric', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }] }).invoice;
  assert.equal(nicSupplyType(b2c), '');
  assert.deepEqual(codes(state, b2c), ['B2C_NO_IRN']);
  const exported = createInvoice(state, { date: '2026-09-06', partyName: 'Acme LLC', lines: [{ description: 'Software', hsn: '998314', qty: 1, rate: 1000, gstRate: 18 }], exportSale: { currency: 'USD', exchangeRate: 84, withTax: false, countryCode: 'us', shippingBillNo: '1234567', shippingBillDate: '2026-09-07', portCode: 'INBOM4' } });
  assert.equal(exported.ok, true, JSON.stringify(exported));
  assert.deepEqual(codes(state, exported.invoice), []);
  const payload = invoiceToNicPayload(state.company, exported.invoice);
  assert.equal(payload.TranDtls.SupTyp, 'EXPWOP');
  assert.deepEqual([payload.BuyerDtls.Gstin, payload.BuyerDtls.Pos, payload.BuyerDtls.Pin, payload.BuyerDtls.Stcd], ['URP', '96', 999999, '96']);
  assert.deepEqual(payload.ExpDtls, { CntCode: 'US', ForCur: 'USD', ShipBNo: '1234567', ShipBDt: '07/09/2026', Port: 'INBOM4' });
  const paid = createInvoice(state, { date: '2026-09-06', partyName: 'Gulf Traders', lines: [{ description: 'Fabric', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }], exportSale: { currency: 'AED', exchangeRate: 23, withTax: true } }).invoice;
  assert.equal(nicSupplyType(paid), 'EXPWP');
  assert.deepEqual(codes(state, paid), ['EXPORT_COUNTRY_REQUIRED']);
  assert.equal(createInvoice(state, { partyName: 'X', lines: [{ description: 'a', qty: 1, rate: 1, gstRate: 0 }], exportSale: { currency: 'USD', exchangeRate: 84, countryCode: 'IN' } }).error, 'BAD_COUNTRY_CODE');
});

test('documents before 1 October 2021 or in the future are refused', () => {
  const state = books();
  const base = { partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', partyAddress: 'Pune 411004', lines: [{ hsn: '5208' }] };
  assert.ok(nicPayloadProblems(state.company, { ...base, date: '2021-09-30' }, { address: 'Pune 411004' }).some((p) => p.code === 'DOCUMENT_TOO_OLD'));
  assert.ok(nicPayloadProblems(state.company, { ...base, date: '2026-12-01' }, { address: 'Pune 411004' }, '2026-11-09').some((p) => p.code === 'FUTURE_DOCUMENT'));
});

test('the live IRN call refuses an invalid payload before any request, and cancelling after 24 hours is refused with the credit note route', async () => {
  const state = createState();
  createInvoice(state, { id: 'INV-0009', date: '2026-09-05', partyName: 'Walk-in', partyState: '27', lines: [{ description: 'Fabric', qty: 1, rate: 1000, gstRate: 5 }] });
  let calls = 0;
  const out = await nicGenerateIrn(state, 'INV-0009', async () => { calls += 1; throw new Error('no network'); }, { mock: false });
  assert.equal(out.error, 'IRN_PAYLOAD_INVALID');
  assert.equal(calls, 0);
  const now = new Date('2026-11-09T12:00:00Z');
  assert.equal(nicCancelProblem({ ackDate: '2026-11-09 10:00:00' }, now), null);
  assert.equal(nicCancelProblem({ ackDate: '2026-11-07 10:00:00' }, now).code, 'IRN_CANCEL_WINDOW_PASSED');
  const old = { id: 'INV-0010', irn: 'a'.repeat(64), ackDate: '2020-01-01 10:00:00' };
  const late = await nicCancelIrn({ invoices: [old] }, { invoiceId: 'INV-0010' }, async () => { calls += 1; throw new Error('no network'); });
  assert.equal(late.error, 'IRN_CANCEL_WINDOW_PASSED');
  assert.match(late.hint, /credit note/);
  assert.equal(calls, 0);
});

test('chat records the business address with its PIN after a preview, which clears the seller problems', async () => {
  const { chat } = await import('../src/router.mjs');
  const { planLocalToolCall } = await import('../src/assistant-contract.mjs');
  const state = createState();
  state.company = { ...state.company, address: '', pin: '', city: '' };
  assert.deepEqual(planLocalToolCall(state, 'business address: Plot 4, MIDC, Pune 411019').args, { address: 'Plot 4, MIDC, Pune 411019', pin: '411019', city: 'Pune' });
  assert.match(planLocalToolCall(state, 'our business address is Plot 4, MIDC, Pune').reply, /6-digit PIN code/);
  const asked = await chat(state, 'business address: Plot 4, MIDC, Pune 411019');
  assert.equal(asked.preview.tool, 'set_business_address', asked.reply);
  assert.equal(state.company.pin, '');
  const done = await chat(state, 'yes');
  assert.equal(done.posted, true, done.reply);
  assert.equal(state.company.pin, '411019');
  const { invoice } = createInvoice(state, { date: '2026-09-05', partyName: 'Retail Mart', partyGstin: '27AAACH7409R1Z1', partyState: '27', partyAddress: '12 FC Road, Pune 411004', lines: [{ description: 'Fabric', hsn: '5208', qty: 1, rate: 1000, gstRate: 5 }] });
  assert.deepEqual(codes(state, invoice), []);
});
