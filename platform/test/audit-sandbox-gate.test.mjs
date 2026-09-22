import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { runTool } from '../src/tools.mjs';
import { runSandboxOperation } from '../src/sandbox-adapter.mjs';
import { findApproval, approvalStatus, paramsHash, requestApproval, decideApproval } from '../src/approvals.mjs';

const BASE_URL = 'https://test-api.sandbox.co.in';
process.env.MYCA_GSP_API_KEY = 'k';
process.env.MYCA_GSP_API_SECRET = 's';
process.env.MYCA_GSP_BASE_URL = BASE_URL;

const providerCalls = [];

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

globalThis.fetch = async (url, init = {}) => {
  const target = new URL(String(url));
  if (target.origin !== BASE_URL) throw new Error(`NETWORK_FORBIDDEN_IN_TESTS ${url}`);
  if (target.pathname === '/authenticate') return reply({ access_token: 'tok', expires_in: 3600 });
  providerCalls.push({ path: target.pathname, body: init.body });
  const filed = target.pathname.match(/\/gstr-1\/(\d+)\/(\d+)\/file$/);
  if (filed) return reply({ data: { ack_num: `ACK-${filed[1]}-${filed[2]}` } });
  if (/\/gstr-1\/\d+\/\d+$/.test(target.pathname)) return reply({ message: 'provider down' }, 500);
  if (target.pathname.endsWith('/gstin/search')) return reply({ data: { data: { lgnm: 'Nalanda Textiles', sts: 'Active', stjCd: '27' } } });
  if (target.pathname.endsWith('/e-invoice/tax-payer/invoice')) return reply({ data: { Status: 1, Data: { Irn: 'irn_test', AckNo: '1126', AckDt: '2026-09-19', SignedQRCode: 'qr' } } });
  throw new Error(`UNEXPECTED_PROVIDER_PATH ${target.pathname}`);
};

beforeEach(() => {
  providerCalls.length = 0;
});

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

const LIVE = { MYCA_ENABLE_LIVE_CALLS: '1', MYCA_MOCK_MODE: '0' };
const MOCK = { MYCA_MOCK_MODE: '1' };

async function approveViaTools(state, { operationId, params, clientId }) {
  const req = await runTool(state, 'approval_request', { operationId, params, clientId, requestedBy: 'ca' });
  assert.equal(req.ok, true);
  const dec = await runTool(state, 'approval_decide', { approvalId: req.data.approval.approvalId, decision: 'approve', decidedBy: 'partner1', role: 'partner' });
  assert.equal(dec.ok, true);
  return req.data.approval.approvalId;
}

const AUG = { period: '2026-08', pan: 'AABCU9603R', otp: '123456', summary: { chksum: 'AUG' } };
const NOV = { period: '2026-11', pan: 'AABCU9603R', otp: '123456', summary: { chksum: 'NOV' } };

test('H8: an August GSTR-1 approval cannot file November', async () => {
  const state = createState();
  const approvalId = await approveViaTools(state, { operationId: 'gst_file_gstr1_evc', params: AUG });
  await withEnv(LIVE, async () => {
    const nov = await runSandboxOperation({ actorId: 'ca', operationId: 'gst_file_gstr1_evc', caApprovalId: approvalId, params: NOV }, { state });
    assert.equal(nov.ok, false);
    assert.equal(nov.error, 'APPROVAL_PARAMS_MISMATCH');
    assert.equal(nov.operationId, 'gst_file_gstr1_evc');
    assert.equal(providerCalls.length, 0);
    assert.equal(approvalStatus(findApproval(state, approvalId)), 'approved');

    const aug = await runSandboxOperation({ actorId: 'ca', operationId: 'gst_file_gstr1_evc', caApprovalId: approvalId, params: { ...AUG, otp: '654321' } }, { state });
    assert.equal(aug.ok, true);
    assert.equal(aug.data.ackNum, 'ACK-2026-8');
    assert.equal(providerCalls.length, 1);
    assert.equal(approvalStatus(findApproval(state, approvalId)), 'used');
    const audit = state.auditEvents.filter((e) => e.action === 'sandbox.gst_file_gstr1_evc').at(-1);
    assert.equal(audit.metadata.paramsHash, paramsHash(AUG));
    assert.equal(audit.metadata.caApprovalId, approvalId);
    assert.equal(JSON.stringify(state.auditEvents).includes('654321'), false);
  });
});

test('H8: an approval requested for one client cannot run for another', async () => {
  const state = createState();
  const approvalId = await approveViaTools(state, { operationId: 'gst_file_gstr1_evc', params: AUG, clientId: 'SELF' });
  await withEnv(LIVE, async () => {
    const other = await runSandboxOperation({ actorId: 'ca', operationId: 'gst_file_gstr1_evc', caApprovalId: approvalId, clientId: 'C2', params: AUG }, { state });
    assert.equal(other.error, 'APPROVAL_CLIENT_MISMATCH');
  });
  assert.equal(providerCalls.length, 0);
});

test('sandbox_operation tool refuses a clientId other than the active client', async () => {
  const state = createState();
  const out = await runTool(state, 'sandbox_operation', { operationId: 'gstin_verify', clientId: 'C2', params: { gstin: '27AABCU9603R1ZN' } });
  assert.equal(out.ok, false);
  assert.equal(out.error, 'CLIENT_NOT_ACTIVE');
});

test('a failed Sandbox write consumes its approval and is not retried', async () => {
  const state = createState();
  const params = { period: '2026-08', payload: { gstin: '27AABCU9603R1ZN' } };
  const approvalId = await approveViaTools(state, { operationId: 'gst_save_gstr1', params });
  await withEnv(LIVE, async () => {
    const first = await runSandboxOperation({ actorId: 'ca', operationId: 'gst_save_gstr1', caApprovalId: approvalId, params }, { state });
    assert.equal(first.ok, false);
    assert.equal(approvalStatus(findApproval(state, approvalId)), 'failed');
    const again = await runSandboxOperation({ actorId: 'ca', operationId: 'gst_save_gstr1', caApprovalId: approvalId, params }, { state });
    assert.equal(again.error, 'APPROVAL_NOT_ACTIVE');
  });
  assert.equal(providerCalls.length, 1);
});

test('live switch off: a Sandbox filing leaves a redacted dry run and never calls the provider', async () => {
  const state = createState();
  const out = await runSandboxOperation({ actorId: 'ca', operationId: 'gst_file_gstr1_evc', params: AUG }, { state });
  assert.equal(out.error, 'LIVE_CALLS_DISABLED');
  assert.equal(out.requirementId, 'REQ-CA-006');
  const record = state.dryRuns.at(-1);
  assert.equal(record.actionId, 'gst_file_gstr1_evc');
  assert.equal(record.payload.otp, '[REDACTED]');
  assert.equal(record.payload.period, '2026-08');
  const assistant = await runSandboxOperation({ operationId: 'gst_file_gstr1_evc', actorId: 'assistant', params: AUG }, { state });
  assert.equal(assistant.error, 'ASSISTANT_BLOCKED_FOR_OPERATION');
  const unapproved = await withEnv(LIVE, () => runSandboxOperation({ actorId: 'ca', operationId: 'gst_file_gstr1_evc', params: AUG }, { state }));
  assert.equal(unapproved.error, 'CA_APPROVAL_REQUIRED');
  assert.equal(providerCalls.length, 0);
});

test('mock mode: a Sandbox e-invoice fixture never touches the real IRN fields', async () => {
  const state = createState();
  const inv = createInvoice(state, { partyName: 'Retail', partyGstin: '', partyState: '27', lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }] });
  const out = await withEnv(MOCK, () => runSandboxOperation({ actorId: 'ca', operationId: 'einvoice_generate', params: { invoiceId: inv.invoice.id } }, { state }));
  assert.equal(out.ok, true);
  assert.equal(out.mock, true);
  const stored = state.invoices.find((i) => i.id === inv.invoice.id);
  for (const field of ['irn', 'ackNo', 'ackDate', 'signedQrCode']) assert.equal(stored[field], undefined, field);
  assert.equal(stored.mockIrn, out.data.irn);
  assert.ok(stored.mockSignedQrCode);
});

test('mock mode: the assistant block and the handoff checks apply exactly as they do live', async () => {
  const state = createState();
  const inv = createInvoice(state, { partyName: 'Retail', partyGstin: '', partyState: '27', lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }] });
  await withEnv(MOCK, async () => {
    const filing = await runSandboxOperation({ operationId: 'gst_file_gstr1_evc', actorId: 'assistant', params: AUG }, { state });
    assert.equal(filing.error, 'ASSISTANT_BLOCKED_FOR_OPERATION');
    assert.equal(filing.mock, undefined);
    const irn = await runSandboxOperation({ operationId: 'einvoice_generate', actorId: 'assistant', params: { invoiceId: inv.invoice.id } }, { state });
    assert.equal(irn.error, 'ASSISTANT_BLOCKED_FOR_OPERATION');
    const secret = await runSandboxOperation({ operationId: 'gstin_verify', actorId: 'ca', params: { gstin: '27AABCU9603R1ZN' }, payloadSummary: { apiKey: 'x' } }, { state });
    assert.equal(secret.error, 'SECRET_FIELDS_NOT_ALLOWED_IN_HANDOFF');
  });
  assert.equal(state.invoices[0].mockIrn, undefined);
});

test('mock mode: the income-tax fixture invents no tax figure and matches the live adapter', async () => {
  const live = await withEnv(LIVE, () => runSandboxOperation({ actorId: 'ca', operationId: 'income_tax_calculate', params: { ay: '2026-27' } }, { state: createState() }));
  const mock = await withEnv(MOCK, () => runSandboxOperation({ actorId: 'ca', operationId: 'income_tax_calculate', params: { ay: '2026-27' } }, { state: createState() }));
  assert.equal(live.ok, false);
  assert.equal(mock.ok, false);
  assert.equal(mock.mock, true);
  assert.equal(mock.error, live.error);
  assert.equal(mock.error, 'PROVIDER_ENDPOINT_UNDOCUMENTED');
  assert.equal(JSON.stringify(mock).match(/taxPayable|totalIncome/), null);
});

test('live switch off: the e-invoice dry run is the NIC payload built from the books', async () => {
  const state = createState();
  const inv = createInvoice(state, { date: '2026-09-05', partyName: 'Retail', partyGstin: '27AAACH7409R1Z1', partyState: '27', lines: [{ description: 'x', hsn: '5208', qty: 1, rate: 100, gstRate: 5 }] });
  const out = await runSandboxOperation({ actorId: 'ca', operationId: 'einvoice_generate', caApprovalId: 'APR-000001', params: { invoiceId: inv.invoice.id } }, { state });
  assert.equal(out.error, 'LIVE_CALLS_DISABLED');
  const record = state.dryRuns.at(-1);
  assert.equal(record.actionId, 'einvoice_generate');
  assert.equal(record.payload.DocDtls.No, inv.invoice.id);
  assert.equal(record.payload.Version, '1.1');
  assert.equal(record.paramsHash, paramsHash({ invoiceId: inv.invoice.id }));
});

test('live switch off: the GSTR-1 save dry run is the exact request body', async () => {
  const state = createState();
  const gstr1 = { gstin: '27AABCU9603R1ZN', fp: '082026', b2b: [] };
  await runSandboxOperation({ actorId: 'ca', operationId: 'gst_save_gstr1', caApprovalId: 'APR-000001', params: { period: '2026-08', payload: gstr1 } }, { state });
  assert.deepEqual(state.dryRuns.at(-1).payload, { year: 2026, month: 8, payload: gstr1 });
});

test('C3: an e-invoice cannot carry both an invoice id and a caller-built payload', async () => {
  const state = createState();
  const inv = createInvoice(state, { partyName: 'Retail', partyGstin: '', partyState: '27', lines: [{ description: 'x', qty: 1, rate: 100, gstRate: 5 }] });
  const params = { invoiceId: inv.invoice.id, payload: { DocDtls: { No: 'FORGED-99' } } };
  const off = await runSandboxOperation({ actorId: 'ca', operationId: 'einvoice_generate', caApprovalId: 'APR-000001', params }, { state });
  assert.equal(off.error, 'PAYLOAD_CONFLICTS_WITH_INVOICE');
  const mock = await withEnv(MOCK, () => runSandboxOperation({ actorId: 'ca', operationId: 'einvoice_generate', params }, { state }));
  assert.equal(mock.error, 'PAYLOAD_CONFLICTS_WITH_INVOICE');
  assert.equal(state.invoices[0].mockIrn, undefined);
  assert.equal((state.dryRuns || []).length, 0);
});

test('a Sandbox write with no actor is refused instead of running as a default user', async () => {
  const state = createState();
  const approvalId = await approveViaTools(state, { operationId: 'gst_file_gstr1_evc', params: AUG });
  const out = await withEnv(LIVE, () => runSandboxOperation({ operationId: 'gst_file_gstr1_evc', caApprovalId: approvalId, params: AUG }, { state }));
  assert.equal(out.error, 'ACTOR_REQUIRED');
  assert.equal(providerCalls.length, 0);
  assert.equal(approvalStatus(findApproval(state, approvalId)), 'approved');
});

test('an injected client never replaces the gate-scoped transport', async () => {
  const state = createState();
  const injected = [];
  const client = {
    searchGstin: async () => {
      injected.push('searchGstin');
      return { ok: true, legalName: 'INJECTED' };
    },
  };
  const out = await withEnv(LIVE, () => runSandboxOperation({ actorId: 'ca', operationId: 'gstin_verify', params: { gstin: '27AABCU9603R1ZN' } }, { state, client }));
  assert.deepEqual(injected, []);
  assert.equal(out.ok, true);
  assert.equal(out.data.legalName, 'Nalanda Textiles');
  assert.deepEqual(providerCalls.map((c) => c.path), ['/gst/compliance/public/gstin/search']);
});

test('live Sandbox reads map the provider response, and an approved e-invoice write consumes its approval', async () => {
  const state = createState();
  await withEnv(LIVE, async () => {
    const ran = await runSandboxOperation({ actorId: 'ca', operationId: 'gstin_verify', params: { gstin: '27aabcu9603r1zn' } }, { state });
    assert.equal(ran.ok, true);
    assert.equal(ran.requirementId, 'REQ-CA-008');
    assert.equal(ran.data.gstin, '27AABCU9603R1ZN');

    const params = { payload: { Version: '1.1' } };
    const request = requestApproval(state, { operationId: 'einvoice_generate', params, actor: { userId: 'maker' } });
    decideApproval(state, { approvalId: request.approval.approvalId, decision: 'approve', actor: { userId: 'partner1', role: 'partner' } });
    const gated = await runSandboxOperation({ actorId: 'ca', operationId: 'einvoice_generate', caApprovalId: request.approval.approvalId, params }, { state });
    assert.equal(gated.ok, true);
    assert.equal(gated.data.irn, 'irn_test');
    assert.equal(approvalStatus(findApproval(state, request.approval.approvalId)), 'used');
    assert.equal(state.auditEvents.some((e) => e.action === 'sandbox.einvoice_generate'), true);
  });
});
