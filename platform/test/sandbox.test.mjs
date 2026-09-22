import test from 'node:test';
import assert from 'node:assert/strict';
import { SandboxClient } from '../src/sandbox-client.mjs';
import { NimClient, getNimClient } from '../src/nim-client.mjs';
import { runTool } from '../src/tools.mjs';
import { createState } from '../src/store.mjs';
import { createInvoice } from '../src/invoice.mjs';
import { chat } from '../src/router.mjs';
import { planLocalToolCall } from '../src/assistant-contract.mjs';
import { nicAuthenticate, nicGenerateIrn, generateMockIrnPayload } from '../src/govt.mjs';

test('sandbox client: initialization and credential validation', () => {
  const unconfigured = new SandboxClient({ apiKey: '', apiSecret: '', baseUrl: 'https://test-api.sandbox.co.in' });
  assert.equal(unconfigured.isConfigured(), false);

  const configured = new SandboxClient({ apiKey: 'key_123', apiSecret: 'sec_123', baseUrl: 'https://test-api.sandbox.co.in' });
  assert.equal(configured.isConfigured(), true);
  assert.equal(configured.baseUrl, 'https://test-api.sandbox.co.in');
});

test('sandbox client: mock authentication and token caching', async () => {
  let callCount = 0;
  const mockFetch = async (url, opts) => {
    callCount++;
    if (url.endsWith('/authenticate')) {
      assert.equal(opts.headers['x-api-key'], 'key_test');
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'jwt_mock_token_abc', expires_in: 3600 }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const client = new SandboxClient({
    apiKey: 'key_test',
    apiSecret: 'sec_test',
    fetchFn: mockFetch,
  });

  const firstAuth = await client.authenticate();
  assert.equal(firstAuth.ok, true);
  assert.equal(client.token, 'jwt_mock_token_abc');
  assert.equal(callCount, 1);

  // Cached call should not trigger fetch
  const secondAuth = await client.authenticate();
  assert.equal(secondAuth.ok, true);
  assert.equal(secondAuth.cached, true);
  assert.equal(callCount, 1);

  // Force reauth triggers fetch
  const thirdAuth = await client.authenticate(true);
  assert.equal(thirdAuth.ok, true);
  assert.equal(callCount, 2);
});

test('sandbox client: handles 401 by refreshing token and retrying request', async () => {
  let requestAttempts = 0;
  let authAttempts = 0;

  const mockFetch = async (url, opts) => {
    if (url.endsWith('/authenticate')) {
      authAttempts++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: `token_${authAttempts}`, expires_in: 3600 }),
      };
    }
    requestAttempts++;
    if (requestAttempts === 1) {
      return { ok: false, status: 401, json: async () => ({ message: 'Token expired' }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: { lgnm: 'RETRY SUCCESS CORP' } }),
    };
  };

  const client = new SandboxClient({
    apiKey: 'k',
    apiSecret: 's',
    fetchFn: mockFetch,
  });

  const res = await client.request('/test-endpoint');
  assert.equal(res.ok, true);
  assert.equal(res.status, 200);
  assert.equal(res.data.data.lgnm, 'RETRY SUCCESS CORP');
  assert.equal(authAttempts, 2);
  assert.equal(requestAttempts, 2);
});

test('sandbox client: searchGstin parses legalName, tradeName, status, and natureOfBusiness', async () => {
  const mockFetch = async (url, opts) => {
    if (url.endsWith('/authenticate')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'tok' }),
      };
    }
    if (url.includes('/gstin/search')) {
      const body = JSON.parse(opts.body);
      assert.equal(body.gstin, '27AAACH7409R1Z1');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            data: {
              lgnm: 'ABC TEXTILES PRIVATE LIMITED',
              tradeNam: 'ABC TEXTILES',
              sts: 'Active',
              dty: 'Regular',
              stjCd: '27',
              rgdt: '01/07/2017',
              einvoiceStatus: 'Yes',
              nba: ['Manufacturer', 'Wholesale Business'],
            },
          },
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const client = new SandboxClient({ apiKey: 'k', apiSecret: 's', fetchFn: mockFetch });
  const out = await client.searchGstin('27AAACH7409R1Z1');
  assert.equal(out.ok, true);
  assert.equal(out.gstin, '27AAACH7409R1Z1');
  assert.equal(out.legalName, 'ABC TEXTILES PRIVATE LIMITED');
  assert.equal(out.tradeName, 'ABC TEXTILES');
  assert.equal(out.status, 'Active');
  assert.equal(out.eInvoiceStatus, 'Yes');
  assert.deepEqual(out.natureOfBusiness, ['Manufacturer', 'Wholesale Business']);
});

test('sandbox client: real endpoint paths and payloads', async () => {
  const calls = [];
  const mockFetch = async (url, opts) => {
    if (url.endsWith('/authenticate')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'tok' }) };
    }
    calls.push({ url, method: opts.method, body: opts.body ? JSON.parse(opts.body) : null });
    return { ok: true, status: 200, json: async () => ({ data: { status_cd: '1', data: { ok: true }, access_token: 'session_tok', Status: 1 } }) };
  };
  const client = new SandboxClient({ apiKey: 'k', apiSecret: 's', fetchFn: mockFetch });

  await client.generateTaxpayerOtp('test_user', '27AAACH7409R1Z1');
  assert.equal(calls[0].url.includes('/gst/compliance/tax-payer/otp'), true);
  assert.equal(calls[0].url.includes('/otp/verify'), false);
  assert.equal(calls[0].body.username, 'test_user');
  assert.equal(calls[0].body.gstin, '27AAACH7409R1Z1');

  await client.verifyTaxpayerOtp('test_user', '27AAACH7409R1Z1', '123456');
  assert.match(calls[1].url, /\/gst\/compliance\/tax-payer\/otp\/verify\?otp=123456/);
  assert.equal(calls[1].body.otp, undefined);

  await client.trackGstrs('27AAACH7409R1Z1', '2026-27');
  assert.match(calls[2].url, /\/gst\/compliance\/public\/gstrs\/track\?financial_year=2026-27/);

  await client.submitGstr2bReconJob({ gstin: '27AAACH7409R1Z1', year: 2026, month: 8 });
  assert.equal(calls[3].url.endsWith('/gst/analytics/gstr-2b-reconciliation'), true);
  assert.equal(calls[3].body['@entity'], 'in.co.sandbox.gst.analytics.gstr-2b_reconciliation.request');
  assert.equal(calls[3].body.year, 2026);
  assert.equal(calls[3].body.month, 8);

  await client.saveGstr1({ year: 2026, month: 8, payload: { fp: '082026' } });
  assert.match(calls[4].url, /\/gst\/compliance\/tax-payer\/gstrs\/gstr-1\/2026\/8$/);
  assert.equal(calls[4].body.fp, '082026');

  await client.submitTdsFvuJob({ taxYear: 'TY 2026-27', quarter: 'Q1', form: '26Q', tan: 'MUMB12345A' });
  assert.equal(calls[5].url.endsWith('/tds/compliance/fvu/generate'), true);
  assert.equal(calls[5].body['@entity'], 'in.co.sandbox.tds.compliance.fvu.generate.request');

  await client.submitTdsAnalyticsJob({ quarter: 'Q1', tan: 'MUMB12345A', form: '26Q', financialYear: 'FY 2026-27' });
  assert.equal(calls[6].url.endsWith('/tds/analytics/potential-notices'), true);
  assert.equal(calls[6].body.financial_year, 'FY 2026-27');
});

test('sandbox client: e-invoice auth stores token, generate and cancel use it', async () => {
  const calls = [];
  const mockFetch = async (url, opts) => {
    if (url.endsWith('/authenticate')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'platform_tok' }) };
    }
    calls.push({ url, auth: opts.headers.authorization, body: opts.body ? JSON.parse(opts.body) : null });
    if (url.includes('/e-invoice/tax-payer/authenticate')) {
      return { ok: true, status: 200, json: async () => ({ data: { Status: 1, access_token: 'einv_tok', expiry: Date.now() + 3600000 } }) };
    }
    if (url.includes('/invoice/') && url.endsWith('/cancel')) {
      return { ok: true, status: 200, json: async () => ({ data: { Status: 1, Data: { Irn: 'abc', CancelDate: '2026-09-19' } } }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: { Status: 1, Data: { Irn: 'irn123', AckNo: '1', AckDt: '2026-09-19', SignedQRCode: 'qr' } } }) };
  };
  const client = new SandboxClient({ apiKey: 'k', apiSecret: 's', fetchFn: mockFetch });

  const auth = await client.einvoiceAuthenticate({ username: 'u', password: 'p', gstin: '27AABCU9603R1ZN' });
  assert.equal(auth.ok, true);
  assert.equal(client.einvoiceToken, 'einv_tok');
  assert.match(calls[0].url, /\/gst\/compliance\/e-invoice\/tax-payer\/authenticate\?force=false/);

  const gen = await client.generateEinvoice({ Version: '1.1' });
  assert.equal(gen.ok, true);
  assert.equal(calls[1].url.endsWith('/gst/compliance/e-invoice/tax-payer/invoice'), true);
  assert.equal(calls[1].auth, 'einv_tok');

  await client.cancelEinvoice({ irn: 'irn123', reason: '1', remark: 'duplicate' });
  assert.equal(calls[2].url.endsWith('/gst/compliance/e-invoice/tax-payer/invoice/irn123/cancel'), true);
  assert.equal(calls[2].body.Irn, 'irn123');
  assert.equal(calls[2].body.CnlRsn, '1');
});

test('tools: sandbox_status and sandbox_connect operate across 5 requirements', async () => {
  const state = createState();

  const status = await runTool(state, 'sandbox_status', {});
  assert.equal(status.ok, true);
  assert.equal(typeof status.data.configured, 'boolean');

  const connect = await runTool(state, 'sandbox_connect', {});
  if (status.data.configured) {
    assert.equal(connect.ok, true);
    assert.equal(connect.data.connected.length, 5);
    assert.equal(state.integrationConnections['REQ-CA-006'].status, 'connected');
    assert.equal(state.integrationConnections['REQ-CA-007'].status, 'connected');
    assert.equal(state.integrationConnections['REQ-CA-008'].status, 'connected');
    assert.equal(state.integrationConnections['REQ-CA-009'].status, 'connected');
    assert.equal(state.integrationConnections['REQ-CA-010'].status, 'connected');
  } else {
    assert.equal(connect.ok, false);
    assert.equal(connect.error, 'MISSING_SANDBOX_CREDENTIALS');
  }
});

test('nic mock: high-fidelity simulation produces valid IRN, AckNo and QR Code', async () => {
  const state = createState();
  const inv = createInvoice(state, {
    date: '2026-08-05',
    partyName: 'Retail Mart',
    partyGstin: '27AAACH7409R1Z1',
    partyState: '27',
    lines: [{ description: 'Fabric', hsn: '5208', qty: 2, rate: 10000, gstRate: 5 }],
  });
  assert.equal(inv.ok, true);

  // 1. Direct mock authenticate
  const auth = await nicAuthenticate({ env: 'mock' });
  assert.equal(auth.ok, true);
  assert.equal(auth.mock, true);
  assert.ok(auth.token.startsWith('mock_nic_jwt_'));

  // 2. Generate mock IRN
  const irnResult = await nicGenerateIrn(state, 'INV-0001', undefined, { mock: true });
  assert.equal(irnResult.ok, true);
  assert.equal(irnResult.mock, true);
  assert.equal(irnResult.irn.length, 64);
  assert.ok(irnResult.ackNo.length >= 10);
  assert.ok(irnResult.signedQrCode.length > 20);

  // 3. Check that state invoice was updated
  const storedInv = state.invoices.find((i) => i.id === 'INV-0001');
  assert.equal(storedInv.mockIrn, irnResult.irn);
  assert.equal(storedInv.mockAckNo, irnResult.ackNo);
  assert.equal(storedInv.irn, undefined);

  // 4. govt_nic_mock tool
  const toolMock = await runTool(state, 'govt_nic_mock', { invoiceId: 'INV-0001' });
  assert.equal(toolMock.ok, true);
  assert.equal(toolMock.data.mock, true);
});

test('nvidia nim: unconfigured behavior and mock completion', async () => {
  // 1. Unconfigured client
  const unconfigured = new NimClient({ apiKey: '' });
  assert.equal(unconfigured.isConfigured(), false);
  const unconfiguredPing = await unconfigured.ping();
  assert.equal(unconfiguredPing.ok, false);
  assert.equal(unconfiguredPing.configured, false);
  assert.equal(unconfiguredPing.error, 'MISSING_NIM_KEY');

  const unconfiguredComplete = await unconfigured.complete({ prompt: 'Tax test' });
  assert.equal(unconfiguredComplete.ok, false);
  assert.equal(unconfiguredComplete.error, 'MISSING_NIM_KEY');

  // 2. Mock completion
  const mockFetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    assert.equal(body.model, 'meta/llama-3.3-70b-instruct');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Section 194C covers TDS on payments to contractors at 1% for individuals/HUF and 2% for others.' } }],
        usage: { total_tokens: 35 },
      }),
    };
  };

  const configured = new NimClient({ apiKey: 'nvapi-mock-key', fetchFn: mockFetch });
  assert.equal(configured.isConfigured(), true);
  const complete = await configured.complete({ prompt: 'Explain 194C' });
  assert.equal(complete.ok, true);
  assert.match(complete.reply, /194C/);

  // 3. nim_status tool
  const state = createState();
  const nimStatus = await runTool(state, 'nim_status', {});
  assert.equal(nimStatus.ok, true);
  assert.equal(nimStatus.data.provider, 'nvidia_nim');
});

test('chat router: routes sandbox status, connect sandbox, nim status, and mock IRN', async () => {
  const state = createState();
  createInvoice(state, {
    date: '2026-08-05',
    partyName: 'Retail Mart',
    partyGstin: '27AAACH7409R1Z1',
    partyState: '27',
    lines: [{ description: 'Fabric', hsn: '5208', qty: 2, rate: 10000, gstRate: 5 }],
  });

  // Route: sandbox status
  const planStatus = planLocalToolCall(state, 'sandbox status');
  assert.equal(planStatus.name, 'sandbox_status');

  const chatStatus = await chat(state, 'sandbox status');
  assert.equal(chatStatus.tools[0].name, 'sandbox_status');
  assert.match(chatStatus.reply, /Quicko Sandbox/i);

  // Route: connect sandbox
  const planConnect = planLocalToolCall(state, 'connect sandbox');
  assert.equal(planConnect.name, 'sandbox_connect');

  const chatConnect = await chat(state, 'connect sandbox');
  assert.equal(chatConnect.tools[0].name, 'sandbox_connect');

  // Route: NIM status
  const planNim = planLocalToolCall(state, 'nim status');
  assert.equal(planNim.name, 'nim_status');

  const chatNim = await chat(state, 'nim status');
  assert.equal(chatNim.tools[0].name, 'nim_status');
  assert.match(chatNim.reply, /NVIDIA NIM/);

  // Route: Mock IRN
  const planMockIrn = planLocalToolCall(state, 'mock irn INV-0001');
  assert.equal(planMockIrn.name, 'govt_nic_mock');
  assert.equal(planMockIrn.args.invoiceId, 'INV-0001');

  const chatMockIrn = await chat(state, 'mock irn INV-0001');
  assert.equal(chatMockIrn.tools[0].name, 'govt_nic_mock');
  assert.match(chatMockIrn.reply, /NIC Sandbox Mock/);

  // Route: standalone GSTIN
  const planStandalone = planLocalToolCall(state, 'gstin 27AAACH7409R1Z1');
  assert.equal(planStandalone.name, 'validate_gstin');
});
