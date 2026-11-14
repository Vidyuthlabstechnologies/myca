import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.APPDATA = mkdtempSync(join(tmpdir(), 'myca-qa-eway-'));
process.env.HOME = process.env.APPDATA;

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { runTool } from '../src/tools.mjs';
import { ewayBillNeed, planTransport, setTransport, transportPayload, ewayBillPartA } from '../src/eway-bill.mjs';
import { fileGstr3bOnPortal } from '../src/gstr3b-portal.mjs';
import { EWB_REQUEST_BUILDERS } from '../src/ewb-adapter.mjs';
import { SandboxClient } from '../src/sandbox-client.mjs';
import { fileGstr1OnPortal, saveGstr1ToPortal, submitGstr1OnPortal } from '../src/portal-filing.mjs';

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
const BUYER_MH = withCheck('27AAACK1234F1Z');
const BUYER_GJ = '24AAACF7856R1ZY';

async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: PRINCIPAL, pan: 'AABCU9603R', state: '27', address: '4 Mill Lane', city: 'Pune', pin: '411001' };
  return state;
}

function sale(state, lines, extra = {}) {
  const out = createInvoice(state, { date: '2026-09-05', partyName: 'Gujarat Mills', partyGstin: BUYER_GJ, lines, ...extra });
  assert.notEqual(out.ok, false, JSON.stringify(out));
  return out.invoice;
}

test('the consignment value leaves out service lines on the same invoice', () => {
  const state = books();
  const invoice = sale(state, [
    { description: 'Cloth', hsn: '5208', qty: 1, rate: 40000, gstRate: 5 },
    { description: 'Installation', hsn: '998391', qty: 1, rate: 20000, gstRate: 18 },
  ]);
  const need = ewayBillNeed(state, invoice);
  assert.equal(need.value, 42000);
  assert.equal(need.needed, false, need.why);
});

test('the consignment value leaves out exempt, nil-rated and non-GST goods (rule 138, explanation 2)', () => {
  const state = books();
  const invoice = sale(state, [
    { description: 'Cloth', hsn: '5208', qty: 1, rate: 40000, gstRate: 5 },
    { description: 'Rice', hsn: '1006', qty: 1, rate: 15000, gstRate: 0, supply: 'exempt' },
  ]);
  const need = ewayBillNeed(state, invoice);
  assert.equal(need.value, 42000);
  assert.equal(need.needed, false, need.why);
  const above = sale(state, [
    { description: 'Cloth', hsn: '5208', qty: 1, rate: 48000, gstRate: 5 },
    { description: 'Rice', hsn: '1006', qty: 1, rate: 15000, gstRate: 0, supply: 'nil' },
  ]);
  assert.equal(ewayBillNeed(state, above).value, 50400);
  assert.equal(ewayBillNeed(state, above).needed, true);
});

test('road movement may record only the transporter id, leaving Part B (vehicle) for the transporter', () => {
  const state = books();
  const invoice = sale(state, [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 60000, gstRate: 5 }]);
  const plan = planTransport(state, { invoiceId: invoice.id, distanceKm: 300, transporterId: '27AABCU9603R1ZN' });
  assert.equal(plan.ok, true, JSON.stringify(plan));
  assert.equal(planTransport(state, { invoiceId: invoice.id, distanceKm: 300 }).error, 'VEHICLE_REQUIRED');
});

test('the transport document date is the date given, not the day it was typed in', () => {
  const state = books();
  const invoice = sale(state, [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 60000, gstRate: 5 }]);
  const set = setTransport(state, { invoiceId: invoice.id, mode: 'rail', distanceKm: 900, docNo: 'RR4471', docDate: '2026-09-06' });
  assert.equal(set.ok, true, JSON.stringify(set));
  assert.equal(transportPayload(invoice.transport).TransDocDt, '06/09/2026');
  assert.equal(planTransport(state, { invoiceId: invoice.id, mode: 'rail', distanceKm: 900, docNo: 'RR4471', docDate: '2026-02-30' }).error, 'BAD_DOC_DATE');
  assert.equal(planTransport(state, { invoiceId: invoice.id, mode: 'rail', distanceKm: 900, docNo: 'RR4471', docDate: '06/09/2026' }).error, 'BAD_DOC_DATE');
});

test('Bharat-series and temporary vehicle numbers are accepted when transport is set and when Part B is updated', () => {
  const state = books();
  const invoice = sale(state, [{ description: 'Cloth', hsn: '5208', qty: 1, rate: 60000, gstRate: 5 }]);
  assert.equal(planTransport(state, { invoiceId: invoice.id, distanceKm: 100, vehicleNo: '22 BH 1234 AB' }).ok, true);
  assert.equal(planTransport(state, { invoiceId: invoice.id, distanceKm: 100, vehicleNo: 'TM123456' }).ok, true);
  assert.equal(planTransport(state, { invoiceId: invoice.id, distanceKm: 100, vehicleNo: '22BH12AB' }).error, 'BAD_VEHICLE');
  const partB = EWB_REQUEST_BUILDERS.ewb_update_vehicle({ state, params: { ewbNo: '291010077005', vehicleNo: '22BH1234AB', fromPlace: 'Pune', fromState: 27, reasonCode: 1 } });
  assert.equal(partB.ok, true, JSON.stringify(partB));
});

test('a Part B update by road needs the vehicle number, a transport document alone is not enough', () => {
  const state = books();
  const byDoc = EWB_REQUEST_BUILDERS.ewb_update_vehicle({ state, params: { ewbNo: '291010077005', transDocNo: 'LR99', transDocDate: '2026-09-06', fromPlace: 'Pune', fromState: 27, reasonCode: 1 } });
  assert.equal(byDoc.error, 'VEHICLE_REQUIRED');
  const byRail = EWB_REQUEST_BUILDERS.ewb_update_vehicle({ state, params: { ewbNo: '291010077005', mode: 'rail', docNo: 'RR99', docDate: '2026-09-06', fromPlace: 'Pune', fromState: 27, reasonCode: 1 } });
  assert.equal(byRail.ok, true, JSON.stringify(byRail));
});

test('an expired GST portal session is not sent on a catalogue call', async () => {
  const sent = [];
  const client = new SandboxClient({
    apiKey: 'key_test_x', apiSecret: 'secret_x', baseUrl: 'https://test-api.sandbox.co.in', saved: null,
    taxpayerToken: 'OLD-TAXPAYER', taxpayerExpiresAt: Date.now() - 1000,
    fetchFn: async (url, init) => {
      sent.push({ url: String(url), auth: init.headers?.authorization });
      return new Response(JSON.stringify({ access_token: 'P', data: {} }), { status: 200 });
    },
  });
  const res = await client.callEndpoint('quicko_gst_compliance_tax_payer_e_invoice_irn', { pathParams: { irn: 'a'.repeat(64) } });
  assert.equal(res.error, 'PORTAL_SESSION_REQUIRED');
  assert.equal(sent.filter((call) => call.auth === 'OLD-TAXPAYER').length, 0);
});

test('GSTR-1 filed once is not filed again on a retry', async () => {
  const state = books();
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: BUYER_MH, lines: [{ description: 'Cotton', hsn: '5205', qty: 1, rate: 1000, gstRate: 5 }], date: '2026-09-05' });
  const review = await runTool(state, 'gst_review', { period: '2026-09' });
  for (const step of review.data.steps) await runTool(state, 'gst_review_answer', { period: '2026-09', step: step.id, answer: step.id === 'approve' ? 'approve' : 'correct', draftHash: review.data.draftHash });
  const actor = { userId: 'owner', role: 'owner' };
  await withEnv({ MYCA_MOCK_MODE: '1' }, () => saveGstr1ToPortal(state, { period: '2026-09' }, actor));
  await withEnv({ MYCA_MOCK_MODE: '1' }, () => submitGstr1OnPortal(state, { period: '2026-09' }, actor));
  const saved = Object.values(state.portalSaves)[0];
  const mockFiled = await withEnv({ MYCA_MOCK_MODE: '1' }, () => fileGstr1OnPortal(state, { period: '2026-09', otp: '123456', summary: { chksum: 'X' } }, actor));
  assert.equal(mockFiled.ok, true, JSON.stringify(mockFiled));
  assert.equal(mockFiled.mock, true);
  saved.filedAck = 'AA2709260012345';
  saved.filedMock = false;
  const again = await withEnv({ MYCA_MOCK_MODE: '1' }, () => fileGstr1OnPortal(state, { period: '2026-09', otp: '654321', summary: { chksum: 'X' } }, actor));
  assert.equal(again.error, 'ALREADY_FILED', JSON.stringify(again));
  assert.equal(again.ackNum, 'AA2709260012345');
});

test('a simulated GSTR-1 filing does not block the real one and is shown as simulated', async () => {
  const state = books();
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: BUYER_MH, lines: [{ description: 'Cotton', hsn: '5205', qty: 1, rate: 1000, gstRate: 5 }], date: '2026-09-05' });
  const review = await runTool(state, 'gst_review', { period: '2026-09' });
  for (const step of review.data.steps) await runTool(state, 'gst_review_answer', { period: '2026-09', step: step.id, answer: step.id === 'approve' ? 'approve' : 'correct', draftHash: review.data.draftHash });
  const actor = { userId: 'owner', role: 'owner' };
  await withEnv({ MYCA_MOCK_MODE: '1' }, () => saveGstr1ToPortal(state, { period: '2026-09' }, actor));
  const saved = Object.values(state.portalSaves)[0];
  saved.mock = false;
  await withEnv({ MYCA_MOCK_MODE: '1' }, () => submitGstr1OnPortal(state, { period: '2026-09' }, actor));
  const first = await withEnv({ MYCA_MOCK_MODE: '1' }, () => fileGstr1OnPortal(state, { period: '2026-09', otp: '123456', summary: { chksum: 'X' } }, actor));
  assert.equal(first.ok, true, JSON.stringify(first));
  const second = await withEnv({ MYCA_MOCK_MODE: '1' }, () => fileGstr1OnPortal(state, { period: '2026-09', otp: '123456', summary: { chksum: 'X' } }, actor));
  assert.equal(second.ok, true, JSON.stringify(second));
  const status = await runTool(state, 'portal_status', {});
  assert.equal(status.data.gstr1[0].filedMock, true);
  assert.equal((state.filings || []).length, 0);
});

test('Part A totals are the sums of the items sent, and the service value goes in otherValue', () => {
  const state = books();
  const invoice = sale(state, [
    { description: 'Cloth', hsn: '5208', qty: 1, rate: 60000, gstRate: 5 },
    { description: 'Installation', hsn: '998391', qty: 1, rate: 20000, gstRate: 18 },
  ], { partyAddress: '7 Ring Road, Surat 395002' });
  invoice.transport = { mode: 'road', vehicleNo: 'MH12AB1234', distanceKm: 260, transporterName: '', transporterId: '', docNo: '', setOn: '2026-09-05' };
  const built = ewayBillPartA(state, invoice);
  assert.equal(built.ok, true, JSON.stringify(built));
  const a = built.partA;
  assert.equal(a.totalValue, a.itemList.reduce((sum, item) => sum + item.taxableAmount, 0));
  assert.equal(a.totalValue, 60000);
  assert.equal(a.igstValue, 3000);
  assert.equal(a.totInvValue, 86600);
  assert.equal(a.otherValue, 23600);
  assert.equal(a.totalValue + a.cgstValue + a.sgstValue + a.igstValue + a.cessValue + a.otherValue, a.totInvValue);
});

test('a simulated GSTR-3B acknowledgement does not block the real filing', async () => {
  const state = books();
  await runTool(state, 'create_invoice', { partyName: 'Kiran Stores', partyGstin: BUYER_MH, lines: [{ description: 'Cotton', hsn: '5205', qty: 1, rate: 1000, gstRate: 5 }], date: '2026-09-05' });
  const review = await runTool(state, 'gst_review', { period: '2026-09' });
  for (const step of review.data.steps) await runTool(state, 'gst_review_answer', { period: '2026-09', step: step.id, answer: step.id === 'approve' ? 'approve' : 'correct', draftHash: review.data.draftHash });
  const actor = { userId: 'owner', role: 'owner' };
  const saved3b = await withEnv({ MYCA_MOCK_MODE: '1' }, () => runTool(state, 'save_gstr3b_portal', { period: '2026-09' }));
  assert.equal(saved3b.ok, true, JSON.stringify(saved3b));
  await withEnv({ MYCA_MOCK_MODE: '1' }, () => runTool(state, 'offset_gstr3b_portal', { period: '2026-09' }));
  const first = await withEnv({ MYCA_MOCK_MODE: '1' }, () => fileGstr3bOnPortal(state, { period: '2026-09', otp: '123456' }, actor));
  assert.equal(first.ok, true, JSON.stringify(first));
  const second = await withEnv({ MYCA_MOCK_MODE: '1' }, () => fileGstr3bOnPortal(state, { period: '2026-09', otp: '123456' }, actor));
  assert.equal(second.ok, true, JSON.stringify(second));
  const saved = Object.values(state.gstr3bPortal)[0];
  saved.filedMock = false;
  const third = await withEnv({ MYCA_MOCK_MODE: '1' }, () => fileGstr3bOnPortal(state, { period: '2026-09', otp: '123456' }, actor));
  assert.equal(third.error, 'ALREADY_FILED');
});

test('named GST portal calls refuse an expired taxpayer session instead of sending it', async () => {
  const sent = [];
  const client = new SandboxClient({
    apiKey: 'key_test_x', apiSecret: 'secret_x', baseUrl: 'https://test-api.sandbox.co.in', saved: null,
    taxpayerToken: 'OLD-TAXPAYER', taxpayerExpiresAt: Date.now() - 1000,
    fetchFn: async (url, init) => {
      sent.push({ url: String(url), auth: init.headers?.authorization });
      return new Response(JSON.stringify({ access_token: 'P', data: {} }), { status: 200 });
    },
  });
  const calls = [
    client.saveGstr1({ year: 2026, month: 9, payload: {} }),
    client.fileGstr1({ year: 2026, month: 9, pan: 'AABCU9603R', otp: '123456', summary: {} }),
    client.saveGstr3b({ year: 2026, month: 9, payload: {} }),
    client.fileGstr3b({ year: 2026, month: 9, pan: 'AABCU9603R', otp: '123456', payload: {} }),
  ];
  for (const res of await Promise.all(calls)) assert.equal(res.error, 'PORTAL_SESSION_REQUIRED');
  assert.equal(sent.length, 0);
  const live = new SandboxClient({
    apiKey: 'key_test_x', apiSecret: 'secret_x', baseUrl: 'https://test-api.sandbox.co.in', saved: null,
    taxpayerToken: 'NEW-TAXPAYER', taxpayerExpiresAt: Date.now() + 3600000,
    fetchFn: async (url, init) => {
      sent.push({ url: String(url), auth: init.headers?.authorization });
      return new Response(JSON.stringify({ data: { status_cd: '1' } }), { status: 200 });
    },
  });
  assert.equal((await live.saveGstr1({ year: 2026, month: 9, payload: {} })).ok, true);
  assert.equal(sent.at(-1).auth, 'NEW-TAXPAYER');
});
