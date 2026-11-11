import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { runTool } from '../src/tools.mjs';
import { runSandboxOperation } from '../src/sandbox-adapter.mjs';
import { requestApproval, decideApproval } from '../src/approvals.mjs';
import { withProviderContext } from '../src/provider-context.mjs';
import { clearIrpSessions, resetSandboxClient, SandboxClient } from '../src/sandbox-client.mjs';
import { ewayBillPartA } from '../src/eway-bill.mjs';
import { ewbRefusal } from '../src/ewb-errors.mjs';

const LIVE_HOST = 'https://api.sandbox.co.in';
const TEST_HOST = 'https://test-api.sandbox.co.in';
const IRP_USER = { username: 'asha_api', password: 'pw-1', gstin: '27AABCU9603R1ZN' };
const calls = [];
let answers = {};

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const ok = (data) => ({ code: 200, data: { alert: null, data, status: '1' } });
const refused = (codes) => ({ code: 200, data: { error: { errorCodes: codes }, info: '', status: '0' } });

globalThis.fetch = async (url, init = {}) => {
  const target = new URL(String(url));
  if (![LIVE_HOST, TEST_HOST].includes(target.origin)) throw new Error(`NETWORK_FORBIDDEN_IN_TESTS ${url}`);
  const body = init.body ? JSON.parse(init.body) : undefined;
  calls.push({ host: target.origin, method: init.method || 'GET', path: target.pathname, query: target.search, body, auth: init.headers?.authorization || '' });
  if (target.pathname === '/authenticate') return reply({ access_token: 'platform-token', expires_in: 3600 });
  if (target.pathname === '/gst/compliance/e-way-bill/tax-payer/authenticate') {
    if (body.password !== IRP_USER.password) return reply(refused('108'));
    return reply({ code: 200, data: { Status: 1, access_token: 'irp-token', expiry: Date.now() + 3600000 } });
  }
  const custom = answers[`${init.method || 'GET'} ${target.pathname}`];
  if (custom) return reply(custom);
  if (target.pathname === '/gst/compliance/e-way-bill/consignor/bill') return reply(ok({ ewayBillNo: 291010077005, ewayBillDate: '11/11/2026 05:00:00 PM', validUpto: '12/11/2026 11:59:00 PM', alert: '' }));
  if (/\/e-invoice\/tax-payer\/invoice\/[^/]+\/e-way-bill$/.test(target.pathname)) return reply({ code: 200, data: { Data: { EwbDt: '2026-11-11 17:23:00', EwbNo: 171010315489, EwbValidTill: '2026-11-12 23:59:00' }, ErrorDetails: null, Status: 1 } });
  if (/\/consignor\/bill\/\d+\/cancel$/.test(target.pathname)) return reply(ok({ cancelDate: '11/11/2026 07:56:00 PM', ewayBillNo: '291010077005' }));
  if (/\/consignor\/bill\/\d+\/vehicle$/.test(target.pathname)) return reply(ok({ validUpto: '13/11/2026 11:59:00 PM', vehUpdDate: '11/11/2026 01:06:00 PM' }));
  if (/\/consignor\/bill\/\d+\/transporter$/.test(target.pathname)) return reply(ok({ ewayBillNo: '291010077005', transUpdateDate: '11/11/2026 01:10:00 PM', transporterId: body.transporterId }));
  if (/\/consignor\/bill\/\d+\/extend$/.test(target.pathname)) return reply(ok({ ewayBillNo: '291010077005', updatedDate: '12/11/2026 05:07:00 PM', validUpto: '14/11/2026 11:59:00 PM' }));
  if (target.pathname === '/gst/compliance/e-way-bill/consignor/consolidated-bill') return reply(ok({ cEwbDate: '11/11/2026 02:43:00 PM', cEwbNo: '2210011690' }));
  if (/\/multi-vehicle$/.test(target.pathname)) return reply(ok({ ewbNo: '291010077005', groupNo: '1', createdDate: '11/11/2026 04:00:00 PM' }));
  if (/\/multi-vehicle\/vehicle$/.test(target.pathname) && init.method === 'POST') return reply(ok({ ewbNo: '291010077005', groupNo: '1', vehAddedDate: '11/11/2026 04:19:00 PM' }));
  if (/\/multi-vehicle\/vehicle$/.test(target.pathname)) return reply(ok({ ewbNo: '291010077005', groupNo: '1', vehUpdDate: '11/11/2026 04:30:00 PM' }));
  if (target.pathname === '/gst/compliance/e-way-bill/consignee/bills') return reply(ok([{ ewbNo: 261010077217, fromGstin: '24AAACQ3770E004', status: 'ACT' }]));
  if (/\/consignee\/bill\/\d+\/reject$/.test(target.pathname)) return reply(ok({ ewayBillNo: '261010077217', ewbRejectedDate: '11/11/2026 07:43:00 PM' }));
  if (/\/tax-payer\/bill\/\d+$/.test(target.pathname)) return reply(ok({ ewbNo: 291010077005, status: 'ACT', validUpto: '12/11/2026 11:59:00 PM' }));
  throw new Error(`UNEXPECTED_PROVIDER_PATH ${init.method} ${target.pathname}`);
};

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

const LIVE = { MYCA_PROVIDER_ENV: 'live', MYCA_MOCK_MODE: '0', MYCA_GSP_API_KEY: 'key_live_x', MYCA_GSP_API_SECRET: 'secret_live_x', MYCA_GSP_ENV: 'live', MYCA_GSP_BASE_URL: LIVE_HOST };
const TEST = { MYCA_PROVIDER_ENV: 'test', MYCA_MOCK_MODE: '0', MYCA_GSP_API_KEY: 'key_test_x', MYCA_GSP_API_SECRET: 'secret_test_x', MYCA_GSP_ENV: 'test' };

const live = (fn) => withProviderContext({ govt: IRP_USER }, () => withEnv(LIVE, fn));

function books() {
  const state = createState();
  state.company = { ...state.company, name: 'Asha Traders', gstin: '27AABCU9603R1ZN', state: '27', address: '4 Mill Lane, Pune 411001', pin: '411001', city: 'Pune' };
  const sale = createInvoice(state, { id: 'INV-0001', date: '2026-11-10', partyName: 'Gujarat Mills', partyGstin: '24AAACF7856R1ZY', partyAddress: '7 Ring Road, Surat 395002', lines: [{ description: 'Cotton cloth', hsn: '5208', qty: 100, rate: 1000, gstRate: 5 }] });
  assert.notEqual(sale.ok, false, JSON.stringify(sale));
  state.invoices[0].transport = { mode: 'road', vehicleNo: 'MH12AB1234', distanceKm: 260, transporterName: 'ABC Logistics', transporterId: '', docNo: '', setOn: '2026-11-10' };
  return state;
}

function approved(state, operationId, params) {
  const req = requestApproval(state, { operationId, params, actor: { userId: 'maker' } });
  decideApproval(state, { approvalId: req.approval.approvalId, decision: 'approve', actor: { userId: 'partner1', role: 'partner' } });
  return req.approval.approvalId;
}

function run(state, operationId, params) {
  return runSandboxOperation({ actorId: 'ca', operationId, caApprovalId: approved(state, operationId, params), params }, { state });
}

beforeEach(() => {
  calls.length = 0;
  answers = {};
  clearIrpSessions();
  resetSandboxClient();
});

test('Part A is built from the invoice: GSTINs, PINs, state codes, HSN lines, rates and values', () => {
  const state = books();
  const built = ewayBillPartA(state, state.invoices[0]);
  assert.equal(built.ok, true, JSON.stringify(built));
  const a = built.partA;
  assert.equal(a.supplyType, 'O');
  assert.equal(a.docType, 'INV');
  assert.equal(a.docNo, 'INV-0001');
  assert.equal(a.docDate, '10/11/2026');
  assert.equal(a.fromGstin, '27AABCU9603R1ZN');
  assert.equal(a.fromPincode, 411001);
  assert.equal(a.fromStateCode, 27);
  assert.equal(a.toGstin, '24AAACF7856R1ZY');
  assert.equal(a.toPincode, 395002);
  assert.equal(a.toStateCode, 24);
  assert.equal(a.totalValue, 100000);
  assert.equal(a.igstValue, 5000);
  assert.equal(a.cgstValue, 0);
  assert.equal(a.totInvValue, 105000);
  assert.equal(a.otherValue, 0);
  assert.equal(a.transMode, '1');
  assert.equal(a.transDistance, '260');
  assert.equal(a.vehicleNo, 'MH12AB1234');
  assert.equal(a.vehicleType, 'R');
  assert.deepEqual(a.itemList.map((item) => [item.hsnCode, item.quantity, item.taxableAmount, item.igstRate, item.cgstRate]), [[5208, 100, 100000, 5, 0]]);

  for (const party of state.parties) if (party.name === 'Gujarat Mills') party.address = '7 Ring Road, Surat';
  const noPin = ewayBillPartA(state, state.invoices[0]);
  assert.equal(noPin.error, 'EWB_DETAILS_MISSING');
  assert.deepEqual(noPin.problems, ['BUYER_PIN']);
  assert.match(noPin.hint, /Gujarat Mills's address with its PIN code/);
});

test('live: an invoice without an IRN gets its e-way bill from Part A through Quicko, after approval, under one IRP session', async () => {
  const state = books();
  await live(async () => {
    const blocked = await runTool(state, 'govt_generate_ewb', { invoiceId: 'INV-0001' });
    assert.equal(blocked.error, 'CA_APPROVAL_REQUIRED');
    assert.equal(calls.length, 0, 'nothing is sent without an approval');

    const caApprovalId = approved(state, 'ewb_generate', { invoiceId: 'INV-0001' });
    const out = await runTool(state, 'govt_generate_ewb', { invoiceId: 'INV-0001', caApprovalId });
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(out.data.ewbNo, '291010077005', JSON.stringify(out));
    const inv = state.invoices[0];
    assert.equal(inv.ewbNo, '291010077005');
    assert.equal(inv.ewbValidity, '12/11/2026 11:59:00 PM');
    assert.equal(inv.ewbVia, 'invoice');
    const sent = calls.find((c) => c.path === '/gst/compliance/e-way-bill/consignor/bill');
    assert.equal(sent.method, 'POST');
    assert.equal(sent.host, LIVE_HOST);
    assert.equal(sent.auth, 'irp-token', 'the e-way bill call goes under the IRP session, not the platform token');
    assert.equal(sent.body.toGstin, '24AAACF7856R1ZY');
    const auth = calls.find((c) => c.path.endsWith('/e-way-bill/tax-payer/authenticate'));
    assert.deepEqual(auth.body, IRP_USER);
    assert.equal(calls.every((c) => !c.path.includes('/eiewb/') && !c.host.includes('nic.in')), true, 'no NIC direct call');

    const status = await runTool(state, 'eway_bill_status', { invoiceId: 'INV-0001' });
    assert.equal(status.data.status, 'generated');
    assert.equal((await runTool(state, 'govt_generate_ewb', { invoiceId: 'INV-0001' })).error, 'ALREADY_GENERATED');
  });
});

test('live: with an IRN the e-way bill goes by IRN on the e-invoice route', async () => {
  const state = books();
  state.invoices[0].irn = 'a'.repeat(64);
  await live(async () => {
    const out = await run(state, 'ewb_generate', { invoiceId: 'INV-0001' });
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.equal(out.data.via, 'irn');
    assert.equal(out.data.ewbNo, '171010315489');
    const sent = calls.find((c) => c.path.endsWith('/e-way-bill') && c.path.includes('/e-invoice/'));
    assert.equal(sent.path, `/gst/compliance/e-invoice/tax-payer/invoice/${'a'.repeat(64)}/e-way-bill`);
    assert.deepEqual(sent.body, { Irn: 'a'.repeat(64), Distance: 260, TransMode: '1', TransName: 'ABC Logistics', VehNo: 'MH12AB1234', VehType: 'R' });
    assert.equal(state.invoices[0].ewbNo, '171010315489');
    assert.equal(state.invoices[0].ewbValidity, '2026-11-12 23:59:00');
  });
});

test('test mode: the e-way bill goes to the Quicko test host with no approval and never lands in the real fields', async () => {
  const state = books();
  await withProviderContext({ govt: IRP_USER }, () => withEnv(TEST, async () => {
    const out = await runSandboxOperation({ actorId: 'ca', operationId: 'ewb_generate', params: { invoiceId: 'INV-0001' } }, { state });
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.ok(calls.length > 0 && calls.every((c) => c.host === TEST_HOST), JSON.stringify(calls.map((c) => c.host)));
  }));
  assert.equal(state.invoices[0].ewbNo, undefined);
  assert.equal(state.invoices[0].sandboxEwb.ewbNo, '291010077005');
  const status = await runTool(state, 'eway_bill_status', { invoiceId: 'INV-0001' });
  assert.equal(status.data.status, 'ready');
  assert.equal(status.data.sandboxEwbNo, '291010077005');
});

test('live: cancel, Part B, transporter, extension, consolidation, multi-vehicle, consignee list and reject all go through Quicko', async () => {
  const state = books();
  state.invoices[0].ewbNo = '291010077005';
  await live(async () => {
    const vehicle = await run(state, 'ewb_update_vehicle', { invoiceId: 'INV-0001', vehicleNo: 'MH 12 CD 9999', fromPlace: 'Lonavala', fromState: 27, reasonCode: 1 });
    assert.equal(vehicle.ok, true, JSON.stringify(vehicle));
    assert.equal(state.invoices[0].transport.vehicleNo, 'MH12CD9999');
    assert.equal(state.invoices[0].ewbValidity, '13/11/2026 11:59:00 PM');
    const partB = calls.find((c) => c.path.endsWith('/vehicle') && !c.path.includes('multi'));
    assert.equal(partB.method, 'PUT');
    assert.equal(partB.body.ewbNo, 291010077005);
    assert.equal(partB.body.reasonCode, '1');
    assert.equal(partB.body.reasonRem, 'Due to break down');

    const transporter = await run(state, 'ewb_update_transporter', { invoiceId: 'INV-0001', transporterId: '29AAACW6874H1ZS' });
    assert.equal(transporter.ok, true, JSON.stringify(transporter));
    assert.equal(state.invoices[0].transport.transporterId, '29AAACW6874H1ZS');

    const extend = await run(state, 'ewb_extend', { invoiceId: 'INV-0001', vehicleNo: 'MH12CD9999', fromPlace: 'Vapi', fromState: 24, fromPincode: 396191, remainingDistance: 120, reasonCode: 5, remark: 'Accident on the highway' });
    assert.equal(extend.ok, true, JSON.stringify(extend));
    assert.equal(state.invoices[0].ewbValidity, '14/11/2026 11:59:00 PM');
    const extended = calls.find((c) => c.path.endsWith('/extend'));
    assert.equal(extended.body.consignmentStatus, 'M');
    assert.equal(extended.body.extnRsnCode, 5);

    const consolidated = await run(state, 'ewb_consolidate', { ewbNos: ['291010077005', '291010077006'], vehicleNo: 'MH12CD9999', fromPlace: 'Pune', fromState: 27 });
    assert.equal(consolidated.ok, true, JSON.stringify(consolidated));
    assert.equal(consolidated.data.consolidatedEwbNo, '2210011690');
    assert.equal(state.invoices[0].consolidatedEwbNo, '2210011690');
    assert.deepEqual(calls.find((c) => c.path.endsWith('/consolidated-bill')).body.tripSheetEwbBills, [{ ewbNo: 291010077005 }, { ewbNo: 291010077006 }]);

    const started = await run(state, 'ewb_multi_vehicle_start', { invoiceId: 'INV-0001', fromPlace: 'Pune', fromState: 27, toPlace: 'Surat', toState: 24, totalQuantity: 100, reasonCode: 2 });
    assert.equal(started.ok, true, JSON.stringify(started));
    assert.equal(started.data.groupNo, '1');
    const added = await run(state, 'ewb_multi_vehicle_add', { invoiceId: 'INV-0001', groupNo: '1', vehicleNo: 'GJ05AB1234', quantity: 60 });
    assert.equal(added.ok, true, JSON.stringify(added));
    const changed = await run(state, 'ewb_multi_vehicle_change', { invoiceId: 'INV-0001', groupNo: 1, oldVehicleNo: 'GJ05AB1234', newVehicleNo: 'GJ05AB9999', fromPlace: 'Vapi', fromState: 24, reasonCode: 1 });
    assert.equal(changed.ok, true, JSON.stringify(changed));
    assert.equal(calls.filter((c) => c.path.endsWith('/multi-vehicle/vehicle')).map((c) => c.method).join(','), 'POST,PUT');

    const fetched = await runSandboxOperation({ actorId: 'ca', operationId: 'ewb_get', params: { ewbNo: '291010077005' } }, { state });
    assert.equal(fetched.ok, true, JSON.stringify(fetched));
    assert.equal(fetched.data.status, 'ACT');

    const list = await runSandboxOperation({ actorId: 'ca', operationId: 'ewb_consignee_list', params: { date: '2026-11-10' } }, { state });
    assert.equal(list.ok, true, JSON.stringify(list));
    assert.equal(calls.at(-1).query, '?generated_date=10%2F11%2F2026');
    assert.equal(list.data.bills[0].fromGstin, '24AAACQ3770E004');
    const rejected = await run(state, 'ewb_reject', { ewbNo: '261010077217' });
    assert.equal(rejected.ok, true, JSON.stringify(rejected));

    const cancelled = await run(state, 'ewb_cancel', { invoiceId: 'INV-0001', reasonCode: 2 });
    assert.equal(cancelled.ok, true, JSON.stringify(cancelled));
    assert.equal(state.invoices[0].ewbNo, undefined, 'a cancelled e-way bill no longer counts, so a new one can be generated');
    assert.equal(state.invoices[0].ewbHistory[0].ewbNo, '291010077005');
    const status = await runTool(state, 'eway_bill_status', { invoiceId: 'INV-0001' });
    assert.equal(status.data.status, 'ready');
    assert.equal(status.data.ewbCancelled[0].ewbNo, '291010077005');
    assert.equal(calls.filter((c) => c.path.endsWith('/e-way-bill/tax-payer/authenticate')).length, 1, 'one IRP session serves every call');
  });
});

test('refusals: bad input stops before the gate, and portal error codes come back in words', async () => {
  const state = books();
  state.invoices[0].ewbNo = '291010077005';
  await live(async () => {
    assert.equal((await runSandboxOperation({ actorId: 'ca', operationId: 'ewb_cancel', params: { invoiceId: 'INV-0001', reasonCode: 9 } }, { state })).error, 'BAD_CANCEL_REASON');
    assert.equal((await runSandboxOperation({ actorId: 'ca', operationId: 'ewb_update_transporter', params: { ewbNo: '123', transporterId: '29AAACW6874H1ZS' } }, { state })).error, 'BAD_EWB_NO');
    assert.equal((await runSandboxOperation({ actorId: 'ca', operationId: 'ewb_consolidate', params: { ewbNos: ['291010077005'], vehicleNo: 'MH12AB1234', fromPlace: 'Pune', fromState: 27 } }, { state })).error, 'TWO_EWBS_REQUIRED');
    assert.equal(calls.length, 0);

    answers['POST /gst/compliance/e-way-bill/consignor/bill/291010077005/extend'] = refused('382');
    const late = await run(state, 'ewb_extend', { invoiceId: 'INV-0001', vehicleNo: 'MH12AB1234', fromPlace: 'Vapi', fromState: 24, fromPincode: 396191, remainingDistance: 120, reasonCode: 1 });
    assert.equal(late.ok, false);
    assert.equal(late.error, 'EWB_382');
    assert.match(late.hint, /within 8 hours/);
  });
  assert.deepEqual(ewbRefusal({ status: '0', error: { errorCodes: '312,' } }).codes, ['312']);
  assert.equal(ewbRefusal({ Status: 0, ErrorDetails: [{ ErrorCode: '4002', ErrorMessage: 'EWB already generated' }] }).error, 'IRP_4002');
  assert.equal(ewbRefusal({ status: '1', data: {} }), null);
});

test('the e-way bill session needs the API user, and a wrong password is reported, not retried', async () => {
  const state = books();
  await withEnv(LIVE, async () => {
    const none = await withProviderContext({ govt: { username: '', password: '', gstin: '' } }, () => run(state, 'ewb_generate', { invoiceId: 'INV-0001' }));
    assert.equal(none.error, 'EWB_API_USER_MISSING');
    const wrong = await withProviderContext({ govt: { ...IRP_USER, password: 'nope' } }, () => run(state, 'ewb_generate', { invoiceId: 'INV-0001' }));
    assert.equal(wrong.error, 'EWB_108');
    assert.match(wrong.hint, /username or password is wrong/);
  });
  assert.equal(state.invoices[0].ewbNo, undefined);
});

test('mock mode: generate is checked like a live one and stores only a mock number', async () => {
  const state = books();
  const out = await withEnv({ MYCA_MOCK_MODE: '1' }, () => runSandboxOperation({ actorId: 'ca', operationId: 'ewb_generate', params: { invoiceId: 'INV-0001' } }, { state }));
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.mock, true);
  assert.equal(calls.length, 0);
  assert.equal(state.invoices[0].ewbNo, undefined);
});

test('the client keeps the session per API user, so another GSTIN never rides on it', async () => {
  await withEnv(LIVE, async () => {
    const a = new SandboxClient({ irpUser: IRP_USER });
    assert.equal((await a.irpToken()).ok, true);
    const b = new SandboxClient({ irpUser: IRP_USER });
    assert.equal((await b.irpToken()).token, 'irp-token');
    assert.equal(calls.filter((c) => c.path.endsWith('/e-way-bill/tax-payer/authenticate')).length, 1);
    const other = new SandboxClient({ irpUser: { ...IRP_USER, gstin: '24AAACF7856R1ZY' } });
    await other.irpToken();
    assert.equal(calls.filter((c) => c.path.endsWith('/e-way-bill/tax-payer/authenticate')).length, 2);
  });
});
