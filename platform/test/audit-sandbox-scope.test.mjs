import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { SANDBOX_OPERATIONS } from '../src/sandbox-adapter-contract.mjs';
import { adapterSupports, runSandboxOperation } from '../src/sandbox-adapter.mjs';
import { requestApproval, decideApproval } from '../src/approvals.mjs';
import { ACTION_CLASSES } from '../src/action-gate.mjs';

const BASE_URL = 'https://test-api.sandbox.co.in';
const urls = [];

globalThis.fetch = async (url) => {
  urls.push(String(url));
  return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600, data: { Status: 1, Data: {} } }), { status: 200 });
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

const PARAMS = {
  gst_taxpayer_generate_otp: { username: 'tp', gstin: '27AABCU9603R1ZN' },
  gst_taxpayer_verify_otp: { username: 'tp', gstin: '27AABCU9603R1ZN', otp: '123456' },
  gst_gstr2b_recon_submit: { gstin: '27AABCU9603R1ZN', period: '2026-08' },
  gst_return_status: { gstin: '27AABCU9603R1ZN', fy: '2026-27', gstr: 'GSTR1' },
  gst_save_gstr1: { period: '2026-08', payload: { gstin: '27AABCU9603R1ZN' } },
  gst_file_gstr1_evc: { period: '2026-08', pan: 'AABCU9603R', otp: '123456', summary: { chksum: 'X' } },
  gst_gstr1_processing: { period: '2026-08', referenceId: 'ref-1' },
  gst_gstr1_proceed: { period: '2026-08' },
  gst_gstr1_summary: { period: '2026-08' },
  gst_evc_otp: { pan: 'AABCU9603R' },
  gst_save_gstr3b: { period: '2026-08', payload: { gstin: '27AABCU9603R1ZN' } },
  gst_gstr3b_liability: { period: '2026-08' },
  gst_gstr3b_offset: { period: '2026-08', payload: { pdcash: [], pditc: {} } },
  gst_file_gstr3b_evc: { period: '2026-08', pan: 'AABCU9603R', otp: '123456', payload: { gstin: '27AABCU9603R1ZN' } },
  einvoice_authenticate: { username: 'api', password: 'pw', gstin: '27AABCU9603R1ZN' },
  einvoice_cancel: { irn: 'IRN-1', reason: '1' },
  gstin_verify: { gstin: '27AABCU9603R1ZN' },
  tds_analytics_job: { quarter: 'Q1', tan: 'PNEA12345B', form: '26Q', fy: 'FY 2026-27' },
  tds_fvu_generate: { taxYear: '2026-27', quarter: 'Q1', form: '26Q', tan: 'PNEA12345B' },
};

test('every Sandbox adapter calls only the transport functions its action declares, on the configured host', async () => {
  const state = createState();
  state.company = { ...state.company, address: 'Plot 4, MIDC, Pune 411019', pin: '411019', city: 'Pune' };
  const inv = createInvoice(state, { partyName: 'Retail', partyGstin: '27AAACH7409R1Z1', partyState: '27', partyAddress: '12 FC Road, Pune 411004', lines: [{ description: 'x', hsn: '5208', qty: 1, rate: 100, gstRate: 5 }] });
  const params = { ...PARAMS, einvoice_generate: { invoiceId: inv.invoice.id } };
  await withEnv({ MYCA_ENABLE_LIVE_CALLS: '1', MYCA_MOCK_MODE: '0', MYCA_GSP_API_KEY: 'k', MYCA_GSP_API_SECRET: 's', MYCA_GSP_BASE_URL: BASE_URL }, async () => {
    for (const operation of SANDBOX_OPERATIONS.filter((op) => adapterSupports(op.operationId))) {
      const { operationId } = operation;
      const opParams = params[operationId] || {};
      let caApprovalId = '';
      if (operation.caApprovalRequired) {
        const req = requestApproval(state, { operationId, params: opParams, actor: { userId: 'ca' } });
        decideApproval(state, { approvalId: req.approval.approvalId, decision: 'approve', actor: { userId: 'partner1', role: 'partner' } });
        caApprovalId = req.approval.approvalId;
      }
      const before = urls.length;
      const out = await runSandboxOperation({ actorId: 'ca', operationId, caApprovalId, params: opParams }, { state });
      assert.doesNotMatch(String(out.error || ''), /is not a function|UNKNOWN_TRANSPORT/, operationId);
      if (ACTION_CLASSES[operationId].uses.length) assert.ok(urls.length > before, `${operationId} made no request: ${out.error}`);
    }
  });
  assert.ok(urls.length > 0);
  for (const url of urls) assert.ok(url.startsWith(`${BASE_URL}/`), url);
});
