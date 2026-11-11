import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/store.mjs';
import { runTool, TOOL_MAP } from '../src/tools.mjs';
import { withProviderContext } from '../src/provider-context.mjs';
import { createMemoryDocumentStore } from '../src/store-ports.mjs';
import { QUICKO_ENDPOINTS, QUICKO_OPERATIONS, quickoEndpoint, quickoOperation, quickoCatalog } from '../src/sandbox-endpoints.mjs';
import { ACTION_CLASSES } from '../src/action-gate.mjs';
import { OUTSIDE_SENTENCES } from '../src/audit-trail.mjs';
import { SANDBOX_OPERATIONS } from '../src/sandbox-adapter-contract.mjs';
import { TOOL_ARG_SCHEMAS } from '../src/assistant-contract.mjs';
import { runSandboxOperation } from '../src/sandbox-adapter.mjs';
import { requestApproval, decideApproval } from '../src/approvals.mjs';
import { jobUrlAllowed } from '../src/sandbox-client.mjs';

const S3 = 'https://in-co-sbox-it-calc-tax-pnl-sec-dev.s3.ap-south-1.amazonaws.com/job/input?X-Amz-Signature=abc';

function json(body, status = 200) {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), headers: new Headers({ 'content-type': 'application/json' }) };
}

function provider(routes) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    const call = { url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body };
    calls.push(call);
    if (call.url.endsWith('/authenticate')) return json({ access_token: 'platform-token', expires_in: 3600 });
    for (const [match, reply] of routes) if (call.url.includes(match)) return typeof reply === 'function' ? reply(call) : json(reply);
    return json({ code: 404 }, 404);
  };
  return { calls, fetchFn };
}

async function live(fetchFn, fn, extra = {}, environment = 'test') {
  const saved = process.env.MYCA_PROVIDER_ENV;
  process.env.MYCA_PROVIDER_ENV = environment;
  try {
    return await withProviderContext({ environment, sandbox: { apiKey: 'key_test_x', apiSecret: 'secret_x', environment, fetchFn, ...extra } }, fn);
  } finally {
    if (saved === undefined) delete process.env.MYCA_PROVIDER_ENV;
    else process.env.MYCA_PROVIDER_ENV = saved;
  }
}

function approved(state, operationId, params) {
  const req = requestApproval(state, { operationId, params, actor: { userId: 'ca' } });
  decideApproval(state, { approvalId: req.approval.approvalId, decision: 'approve', actor: { userId: 'partner1', role: 'partner' } });
  return req.approval.approvalId;
}

test('the catalogue covers every documented Sandbox endpoint and each one is gated, worded and declared', () => {
  assert.ok(QUICKO_ENDPOINTS.length >= 360, `${QUICKO_ENDPOINTS.length} endpoints`);
  assert.equal(new Set(QUICKO_ENDPOINTS.map((e) => e.id)).size, QUICKO_ENDPOINTS.length);
  assert.ok(QUICKO_OPERATIONS.length >= 280);
  const declared = new Set(SANDBOX_OPERATIONS.map((op) => op.operationId));
  for (const endpoint of QUICKO_OPERATIONS) {
    assert.ok(ACTION_CLASSES[endpoint.id], endpoint.id);
    assert.equal(ACTION_CLASSES[endpoint.id].actionClass, endpoint.actionClass, endpoint.id);
    assert.ok(OUTSIDE_SENTENCES[endpoint.id], endpoint.id);
    assert.ok(declared.has(endpoint.id), endpoint.id);
  }
  for (const family of ['gst', 'tds', 'kyc', 'bank', 'income_tax_ocr', 'income_tax_calculator', 'income_tax_report', 'income_tax_compliance']) {
    assert.ok(QUICKO_OPERATIONS.some((e) => e.family === family), family);
  }
});

test('e-way bills and IRNs stay on their own flows and the old hand-wired GST calls keep their names', () => {
  const ewb = QUICKO_ENDPOINTS.filter((e) => e.path.includes('/e-way-bill'));
  assert.ok(ewb.length > 20);
  for (const e of ewb) assert.equal(quickoOperation(e.id), null, e.id);
  assert.equal(quickoOperation('quicko_gst_compliance_e_invoice_tax_payer_invoice_post'), null);
  const save = QUICKO_ENDPOINTS.find((e) => e.key === 'POST /gst/compliance/tax-payer/gstrs/gstr-1/{year}/{month}');
  assert.equal(save.coveredBy, 'gst_save_gstr1');
  assert.equal(quickoOperation(save.id), null);
  const listed = quickoCatalog({ operationId: save.id }).endpoints[0];
  assert.equal(listed.useOperation, 'gst_save_gstr1');
});

test('filing, money and OTP calls are writes that need a CA approval; lookups are reads', () => {
  const writes = {
    'POST /itd/portal/tax-payer/itrs/e-file': 'file',
    'POST /it/compliance/eri/tax-payers/{tax_payer_id}/itrs/submit': 'file',
    'POST /it/compliance/eri/tax-payers/{tax_payer_id}/itrs/e-verify/otp/verify': 'file',
    'POST /tds/compliance/e-file': 'file',
    'POST /gst/compliance/tax-payer/gstrs/gstr-9/file': 'file',
    'POST /bank/virtual/accounts/{account_number}/payments/payout': 'money',
    'GET /bank/{ifsc}/accounts/{account_number}/verify': 'money',
    'POST /kyc/aadhaar/okyc/otp': 'otp',
    'POST /it/compliance/portal/tax-payer/authorize': 'login',
    'DELETE /tds/traces/deductors/credential': 'destroy',
  };
  for (const [key, kind] of Object.entries(writes)) {
    const endpoint = QUICKO_ENDPOINTS.find((e) => e.key === key);
    assert.ok(endpoint, key);
    assert.equal(endpoint.kind, kind, key);
    assert.equal(endpoint.actionClass, 'write', key);
    assert.equal(SANDBOX_OPERATIONS.find((op) => op.operationId === endpoint.id).caApprovalRequired, true, key);
  }
  for (const key of ['POST /kyc/pan/verify', 'POST /it/ocr/form-16/pdf', 'POST /tds/compliance/206ab/check', 'GET /bank/{ifsc}/accounts/{account_number}/penniless-verify', 'POST /calculators/income-tax/new', 'POST /gst/compliance/public/gstrs/preference']) {
    assert.equal(QUICKO_ENDPOINTS.find((e) => e.key === key).actionClass, 'read', key);
  }
});

test('every new tool has a strict schema and a risk', () => {
  for (const name of ['quicko_catalog', 'read_form16', 'read_form26as', 'capital_gains_pnl', 'quicko_tax_check', 'verify_pan', 'pan_aadhaar_status', 'check_206ab', 'search_tan', 'lookup_ifsc', 'verify_bank_account', 'mca_company', 'gstins_for_pan']) {
    assert.ok(TOOL_MAP[name], name);
    assert.equal(TOOL_ARG_SCHEMAS[name].additionalProperties, false, name);
  }
});

test('a catalogue read goes to the test host with the platform token and the documented @entity', async () => {
  const { calls, fetchFn } = provider([['/kyc/pan/verify', { code: 200, data: { status: 'valid', name_as_per_pan_match: true } }]]);
  const state = createState();
  const out = await live(fetchFn, () => runTool(state, 'verify_pan', { pan: 'abcde1234f', name: 'Asha Rao', dateOfBirth: '01/01/1990', consent: true }));
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.data.result.status, 'valid');
  const call = calls.find((c) => c.url.endsWith('/kyc/pan/verify'));
  assert.ok(call.url.startsWith('https://test-api.sandbox.co.in/'));
  assert.equal(call.headers.authorization, 'platform-token');
  const body = JSON.parse(call.body);
  assert.equal(body['@entity'], 'in.co.sandbox.kyc.pan_verification.request');
  assert.equal(body.pan, 'ABCDE1234F');
  assert.equal(body.consent, 'Y');
});

test('a lookup that needs consent sends nothing without it', async () => {
  const { calls, fetchFn } = provider([]);
  const state = createState();
  const tool = await live(fetchFn, () => runTool(state, 'check_206ab', { pan: 'ABCDE1234F' }));
  assert.equal(tool.error, 'CONSENT_REQUIRED');
  const raw = await live(fetchFn, () => runTool(state, 'sandbox_operation', { operationId: 'quicko_kyc_pan_verify', params: { body: { pan: 'ABCDE1234F', name_as_per_pan: 'A', date_of_birth: '01/01/1990', reason: 'kyc', consent: 'N' } } }));
  assert.equal(raw.error, 'CONSENT_REQUIRED');
  assert.equal(calls.filter((c) => !c.url.endsWith('/authenticate')).length, 0);
});

test('missing path, query and body fields are named before anything is sent', async () => {
  const { calls, fetchFn } = provider([]);
  const state = createState();
  const noPath = await live(fetchFn, () => runTool(state, 'sandbox_operation', { operationId: 'quicko_bank_ifsc', params: {} }));
  assert.equal(noPath.error, 'PATH_PARAMS_REQUIRED');
  assert.deepEqual(noPath.missing, ['ifsc']);
  const noQuery = await live(fetchFn, () => runTool(state, 'sandbox_operation', { operationId: 'quicko_it_calculator_tax_pnl_securities_domestic_post', params: {} }));
  assert.equal(noQuery.error, 'QUERY_PARAMS_REQUIRED');
  const noBody = await live(fetchFn, () => runTool(state, 'sandbox_operation', { operationId: 'quicko_tds_compliance_206ab_check', params: { body: { consent: 'Y' } } }));
  assert.equal(noBody.error, 'BODY_FIELDS_REQUIRED');
  assert.deepEqual(noBody.missing, ['pan', 'reason']);
  assert.equal(calls.length, 0);
});

test('read_form16 sends the uploaded PDF as a file and returns the figures as printed', async () => {
  const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 form16').toString('base64')}`;
  const store = createMemoryDocumentStore();
  const { sha256 } = store.put(pdf);
  const state = createState();
  state._documents = store;
  const reply = {
    code: 200,
    data: {
      'Part A': { assessment_year: '2026-27', employer: { name: 'Acme Pvt Ltd', tan: 'BLRA12345B' }, tds: [{}, {}, {}, {}] },
      'Part B': {
        employee: { pan: 'ABCDE1234F', first_name: 'Asha', last_name: 'Rao' },
        details_of_salary_paid: {
          gross_salary: { salary_as_per_provisions_contained_in_section_17_1: 1800000 },
          deduction_us_16: { standard_deduction_us_16_ia: 75000 },
          total_taxable_income: 1725000,
          net_tax_payable: 180000,
        },
      },
    },
  };
  let sent = null;
  const { fetchFn } = provider([['/it/ocr/form-16/pdf', (call) => { sent = call; return json(reply); }]]);
  const out = await live(fetchFn, () => runTool(state, 'read_form16', { documentSha256: sha256, password: 'ABCDE1990' }));
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.ok(sent.body instanceof FormData);
  const file = sent.body.get('file');
  assert.equal(file.type, 'application/pdf');
  assert.equal(Buffer.from(await file.arrayBuffer()).toString(), '%PDF-1.4 form16');
  assert.equal(sent.headers['content-type'], undefined);
  assert.match(sent.url, /password=ABCDE1990/);
  assert.equal(out.data.summary.employer.tan, 'BLRA12345B');
  assert.equal(out.data.summary.employee.name, 'Asha Rao');
  assert.equal(out.data.summary.figuresAsPrinted.salaryUnderSection17_1, 1800000);
  assert.equal(out.data.summary.figuresAsPrinted.standardDeduction, 75000);
  assert.equal(out.data.summary.figuresAsPrinted.totalTaxableIncome, 1725000);
  assert.equal(out.data.summary.tdsQuarters, 4);
  assert.equal(state.dryRuns?.length || 0, 0);
});

test('read_form26as lists each deductor as printed', async () => {
  const store = createMemoryDocumentStore();
  const { sha256 } = store.put(`data:application/pdf;base64,${Buffer.from('%PDF 26as').toString('base64')}`);
  const state = createState();
  state._documents = store;
  const { fetchFn } = provider([['/it/ocr/form-26as/pdf', { code: 200, data: { pan: 'ABCDE1234F', 'Part I': [{ name_of_deductor: 'Acme', tan_of_deductor: 'BLRA12345B', total_amount_paid_credited: '1,800,000.00', total_tax_deducted: '180000', total_tds_deposited: '180000', deduction_wise: [{}, {}] }] } }]]);
  const out = await live(fetchFn, () => runTool(state, 'read_form26as', { documentSha256: sha256 }));
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.deepEqual(out.data.summary.deductors[0], { deductor: 'Acme', tan: 'BLRA12345B', amountPaidOrCredited: 1800000, taxDeducted: 180000, tdsDeposited: 180000, entries: 2 });
});

test('a portal sign-in keeps its token inside MyCA, uses it for that portal, and logout drops it', async () => {
  const kept = [];
  const { calls, fetchFn } = provider([
    ['/it/compliance/portal/tax-payer/authorize', { code: 200, data: { access_token: 'itd-session-token', expires_in: 3600 } }],
    ['/itd/portal/tax-payer/ais', { code: 200, data: { ais: 'here' } }],
    ['/itd/portal/tax-payer/logout', { code: 200, data: {} }],
  ]);
  const state = createState();
  const sessions = {};
  const onSession = (kind, session) => { kept.push([kind, session ? 'set' : 'cleared']); if (session) sessions[kind] = session; else delete sessions[kind]; };
  const before = await live(fetchFn, () => runSandboxOperation({ actorId: 'ca', operationId: 'quicko_itd_portal_tax_payer_ais', params: { query: { financial_year: 'FY 2025-26' } } }, { state }), { sessions, onSession });
  assert.equal(before.error, 'PORTAL_SESSION_REQUIRED');
  const login = { body: { pan: 'ABCDE1234F', password: 'portal-pass' } };
  const approvalId = approved(state, 'quicko_it_compliance_portal_tax_payer_authorize', login);
  const signed = await live(fetchFn, () => runSandboxOperation({ actorId: 'ca', operationId: 'quicko_it_compliance_portal_tax_payer_authorize', caApprovalId: approvalId, params: login }, { state }), { sessions, onSession });
  assert.equal(signed.ok, true, JSON.stringify(signed));
  assert.equal(signed.data.sessionEstablished, true);
  assert.doesNotMatch(JSON.stringify(signed), /itd-session-token|portal-pass/);
  assert.equal(sessions.itd_taxpayer.token, 'itd-session-token');
  const ais = await live(fetchFn, () => runSandboxOperation({ actorId: 'ca', operationId: 'quicko_itd_portal_tax_payer_ais', params: { query: { financial_year: 'FY 2025-26' } } }, { state }), { sessions, onSession });
  assert.equal(ais.ok, true, JSON.stringify(ais));
  assert.equal(calls.find((c) => c.url.includes('/itd/portal/tax-payer/ais')).headers.authorization, 'itd-session-token');
  const logoutApproval = approved(state, 'quicko_itd_portal_tax_payer_logout', {});
  const out = await live(fetchFn, () => runSandboxOperation({ actorId: 'ca', operationId: 'quicko_itd_portal_tax_payer_logout', caApprovalId: logoutApproval, params: {} }, { state }), { sessions, onSession });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.deepEqual(kept, [['itd_taxpayer', 'set'], ['itd_taxpayer', 'cleared']]);
});

test('the assistant cannot run a filing call and, live, a person needs a CA approval for it', async () => {
  const { calls, fetchFn } = provider([]);
  const state = createState();
  const params = { path: { tax_payer_id: 'ABCDE1234F' }, body: { ITR: { PersonalInfo: { PAN: 'ABCDE1234F' } } } };
  const byAssistant = await live(fetchFn, () => runSandboxOperation({ actorId: 'assistant', operationId: 'quicko_it_compliance_eri_tax_payers_tax_payer_id_itrs_submit', params }, { state }));
  assert.equal(byAssistant.ok, false);
  const byCa = await live(fetchFn, () => runSandboxOperation({ actorId: 'ca', operationId: 'quicko_it_compliance_eri_tax_payers_tax_payer_id_itrs_submit', params }, { state }), {}, 'live');
  assert.equal(byCa.error, 'CA_APPROVAL_REQUIRED');
  assert.equal(calls.filter((c) => c.url.includes('/itrs/submit')).length, 0);
});

test('a job uploads its input to the pre-signed S3 URL with no keys, and the poll can fetch the output', async () => {
  let uploaded = null;
  const { calls, fetchFn } = provider([
    ['amazonaws.com/job/input', (call) => { uploaded = call; return json({}); }],
    ['amazonaws.com/job/output', { short_term: { gain: 1200 } }],
    ['/it/calculator/tax-pnl/securities/domestic?', (call) => (call.method === 'POST'
      ? json({ code: 200, data: { job_id: 'job-1', status: 'created', url: S3 } })
      : json({ code: 200, data: { job_id: 'job-1', status: 'succeeded', url: 'https://in-co-sbox.s3.ap-south-1.amazonaws.com/job/output?sig=1' } }))],
  ]);
  const state = createState();
  const query = { input: 'tradewise', output: 'json', financial_year: 'FY 2025-26' };
  const submit = await live(fetchFn, () => runTool(state, 'sandbox_operation', { operationId: 'quicko_it_calculator_tax_pnl_securities_domestic_post', params: { query, jobInput: { sheets: [] } } }));
  assert.equal(submit.ok, true, JSON.stringify(submit));
  assert.equal(submit.data.data.uploaded, true);
  assert.equal(uploaded.method, 'PUT');
  assert.equal(uploaded.headers['x-api-key'], undefined);
  assert.equal(uploaded.headers.authorization, undefined);
  assert.equal(uploaded.body, '{"sheets":[]}');
  const poll = await live(fetchFn, () => runTool(state, 'sandbox_operation', { operationId: 'quicko_it_calculator_tax_pnl_securities_domestic_get', params: { query: { job_id: 'job-1' }, fetchOutput: true } }));
  assert.equal(poll.ok, true, JSON.stringify(poll));
  assert.deepEqual(poll.data.data.output, { short_term: { gain: 1200 } });
  assert.ok(calls.some((c) => c.url.includes('/job/output')));
});

test('only Sandbox S3 job URLs are accepted for uploads and downloads', () => {
  assert.equal(jobUrlAllowed(S3), true);
  assert.equal(jobUrlAllowed('http://bucket.s3.ap-south-1.amazonaws.com/x'), false);
  assert.equal(jobUrlAllowed('https://evil.example.com/x'), false);
  assert.equal(jobUrlAllowed('https://amazonaws.com.evil.example/x'), false);
  assert.equal(jobUrlAllowed('https://user:pw@bucket.s3.amazonaws.com/x'), false);
  assert.equal(jobUrlAllowed('https://169.254.169.254/latest'), false);
});

test('mock mode answers without sending anything and invents no figure', async () => {
  const saved = process.env.MYCA_MOCK_MODE;
  process.env.MYCA_MOCK_MODE = '1';
  try {
    const state = createState();
    const out = await runTool(state, 'quicko_tax_check', { financialYear: 'FY 2025-26', income: { basic_salary: 1200000 } });
    assert.equal(out.ok, true, JSON.stringify(out));
    assert.deepEqual(out.data.regimes, { new: { mock: true }, old: { mock: true } });
  } finally {
    if (saved === undefined) delete process.env.MYCA_MOCK_MODE;
    else process.env.MYCA_MOCK_MODE = saved;
  }
});

test('quicko_catalog finds endpoints by family and words without calling Sandbox', async () => {
  const state = createState();
  const out = await runTool(state, 'quicko_catalog', { search: 'form 16' });
  assert.equal(out.ok, true);
  assert.ok(out.data.endpoints.some((e) => e.operationId === 'quicko_it_ocr_form_16_pdf'));
  const kyc = await runTool(state, 'quicko_catalog', { family: 'kyc', limit: 400 });
  assert.ok(kyc.data.endpoints.every((e) => e.family === 'kyc'));
  assert.ok(kyc.data.matched >= 20);
  assert.equal(quickoEndpoint('nope'), null);
});
