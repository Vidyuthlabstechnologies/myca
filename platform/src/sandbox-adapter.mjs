import { createHash } from 'node:crypto';
import { sandboxOperationById, createSandboxHandoff } from './sandbox-adapter-contract.mjs';
import { invoiceToNicPayload } from './nic-config.mjs';
import { performExternalAction } from './action-gate.mjs';

function fromClient(res, data) {
  if (res && res.ok === false && res.error) return { ok: false, error: res.error };
  if (res && res.ok === false) return { ok: false, error: `HTTP_${res.status || 'ERROR'}`, provider: res.data || null };
  return { ok: true, data };
}

function periodParts(params = {}) {
  if (params.year && params.month) return { year: params.year, month: params.month };
  const period = String(params.period || params.returnPeriod || '');
  const m = period.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return { year: Number(m[1]), month: Number(m[2]) };
  return { year: params.year, month: params.month };
}

function einvoicePayload(params, state) {
  const invoiceId = params.invoiceId ? String(params.invoiceId) : '';
  if (invoiceId && params.payload) {
    return { ok: false, error: 'PAYLOAD_CONFLICTS_WITH_INVOICE', hint: 'Pass either params.invoiceId (the payload is built from the books) or a NIC JSON params.payload, not both.' };
  }
  if (invoiceId) {
    const invoice = [...(state?.invoices || []), ...(state?.purchases || [])].find((i) => i.id === invoiceId);
    if (!invoice) return { ok: false, error: 'INVOICE_NOT_FOUND', invoiceId };
    return { ok: true, invoice, payload: invoiceToNicPayload(state.company, invoice) };
  }
  if (params.payload) return { ok: true, invoice: null, payload: params.payload };
  return { ok: false, error: 'PAYLOAD_REQUIRED', hint: 'Pass params.invoiceId or a NIC JSON params.payload.' };
}

const REQUEST_BUILDERS = {
  einvoice_generate: ({ params, state }) => einvoicePayload(params, state),
  gst_save_gstr1: ({ params }) => (params.payload
    ? { ok: true, payload: { ...periodParts(params), payload: params.payload } }
    : { ok: false, error: 'PAYLOAD_REQUIRED', hint: 'Pass the GSTN GSTR-1 JSON as params.payload (see export_gstr1_json).' }),
};

const ADAPTERS = {
  gstin_verify: async ({ client, params }) => {
    const gstin = String(params.gstin || '').trim().toUpperCase();
    const res = await client.searchGstin(gstin);
    if (res.ok === false) return { ok: false, error: res.error || `HTTP_${res.status}` };
    if (res.legalName || res.tradeName) {
      return {
        ok: true,
        data: {
          gstin: res.gstin || gstin,
          providerGstin: res.raw?.gstin || '',
          legalName: res.legalName || '',
          tradeName: res.tradeName || '',
          status: res.status || '',
          taxpayerType: res.taxpayerType || '',
          stateCode: res.stateCode || '',
          registrationDate: res.registrationDate || '',
          eInvoiceStatus: res.eInvoiceStatus || '',
          valid: true,
        },
      };
    }
    const inner = res.data?.data?.data || res.data?.data || {};
    return {
      ok: true,
      data: {
        gstin: inner.gstin || gstin,
        legalName: inner.legalName || inner.lgnm || '',
        status: inner.status || '',
        stateName: inner.stateName || '',
        pan: inner.pan || '',
        valid: inner.validGstin !== false,
      },
    };
  },

  gst_return_status: async ({ client, params }) => {
    const gstin = String(params.gstin || '').trim().toUpperCase();
    const res = await client.trackGstrs(gstin, params.fy, params.gstr);
    return fromClient(res, { gstin, returns: res.data?.data?.EFiledlist || res.data?.data || res.data || null });
  },

  gst_taxpayer_generate_otp: async ({ client, params }) => {
    const res = await client.generateTaxpayerOtp(params.username, params.gstin);
    return fromClient(res, { requested: true, provider: res.data?.data || res.data || null });
  },

  gst_taxpayer_verify_otp: async ({ client, params }) => {
    const res = await client.verifyTaxpayerOtp(params.username, params.gstin, params.otp);
    return fromClient(res, { sessionEstablished: true, tokenExpiry: res.data?.data?.token_expiry || null });
  },

  gst_gstr2b_recon_submit: async ({ client, params }) => {
    const { year, month } = periodParts(params);
    const res = await client.submitGstr2bReconJob({
      gstin: params.gstin,
      year,
      month,
      reconciliationCriteria: params.reconciliationCriteria,
      filingPreference: params.filingPreference,
    });
    return fromClient(res, { job: res.data?.data || res.data || null, note: 'Upload GSTR-2B and the purchase ledger to the two signed URLs, then poll the job. The sprint-3 engine remains the source of truth.' });
  },

  gst_save_gstr1: async ({ client, params }) => {
    const { year, month } = periodParts(params);
    if (!params.payload) return { ok: false, error: 'PAYLOAD_REQUIRED', hint: 'Pass the GSTN GSTR-1 JSON as params.payload (see export_gstr1_json).' };
    const res = await client.saveGstr1({ year, month, payload: params.payload });
    return fromClient(res, { saved: true, referenceId: res.data?.data?.data?.reference_id || res.data?.data?.reference_id || null });
  },

  gst_file_gstr1_evc: async ({ client, params }) => {
    const { year, month } = periodParts(params);
    if (!params.pan || !params.otp) return { ok: false, error: 'PAN_AND_EVC_OTP_REQUIRED', hint: 'Generate an EVC OTP (gst_taxpayer_generate_otp flow) and pass pan + otp.' };
    if (!params.summary) return { ok: false, error: 'SUMMARY_REQUIRED', hint: 'Pass the summary returned by new-proceed (newSumFlag, sec_sum, chksum).' };
    const res = await client.fileGstr1({ year, month, pan: params.pan, otp: params.otp, summary: params.summary });
    return fromClient(res, { filed: true, ackNum: res.data?.data?.data?.ack_num || res.data?.data?.ack_num || null });
  },

  einvoice_authenticate: async ({ client, params }) => {
    const res = await client.einvoiceAuthenticate({
      username: params.username,
      password: params.password,
      gstin: params.gstin,
      force: params.force,
    });
    const data = res.data?.data || {};
    if (res.ok && Number(data.Status) === 1) {
      return { ok: true, data: { authenticated: true, expiry: data.expiry || null } };
    }
    const err = data.ErrorDetails?.[0]?.ErrorMessage || data.error?.message || res.error || 'NIC_AUTH_FAILED';
    return { ok: false, error: err, provider: data };
  },

  einvoice_generate: async ({ client, params, state }) => {
    const built = einvoicePayload(params, state);
    if (!built.ok) return built;
    const res = await client.generateEinvoice(built.payload);
    const data = res.data?.data || {};
    if (res.ok && Number(data.Status) === 1) {
      return { ok: true, data: { irn: data.Data?.Irn || null, ackNo: data.Data?.AckNo || null, ackDate: data.Data?.AckDt || null, signedQrCode: data.Data?.SignedQRCode || null, status: data.Data?.Status || 'ACT' } };
    }
    const err = data.ErrorDetails?.[0]?.ErrorMessage || data.error?.message || res.error || 'IRN_FAILED';
    return { ok: false, error: err, provider: data };
  },

  einvoice_cancel: async ({ client, params }) => {
    if (!params.irn) return { ok: false, error: 'IRN_REQUIRED' };
    const res = await client.cancelEinvoice({ irn: params.irn, reason: params.reason, remark: params.remark });
    const data = res.data?.data || {};
    if (res.ok && Number(data.Status) === 1) {
      return { ok: true, data: { cancelled: true, irn: data.Data?.Irn || params.irn, cancelDate: data.Data?.CancelDate || null } };
    }
    const err = data.ErrorDetails?.[0]?.ErrorMessage || data.error?.message || res.error || 'CANCEL_FAILED';
    return { ok: false, error: err, provider: data };
  },

  tds_analytics_job: async ({ client, params }) => {
    const res = await client.submitTdsAnalyticsJob({
      quarter: params.quarter,
      tan: params.tan,
      form: params.form,
      financialYear: params.fy || params.financialYear,
    });
    return fromClient(res, { job: res.data?.data || res.data || null, note: 'Poll the job for the potential-notices report; the sprint-5 TDS monitor remains the source of truth.' });
  },

  tds_fvu_generate: async ({ client, params }) => {
    const res = await client.submitTdsFvuJob({
      taxYear: params.taxYear,
      quarter: params.quarter,
      form: params.form,
      tan: params.tan,
      filingType: params.filingType,
    });
    return fromClient(res, { job: res.data?.data || res.data || null, note: 'Upload the TXT/CSI files to the signed URLs, then poll the job.' });
  },

  income_tax_calculate: async () => ({
    ok: false,
    error: 'PROVIDER_ENDPOINT_UNDOCUMENTED',
    hint: 'Sandbox publishes no stable income-tax calculator path in its API reference. Use prepare_itr (sprint-5 engine) for ITR maths.',
  }),
};

export function adapterSupports(operationId) {
  return Boolean(ADAPTERS[operationId]);
}

const MOCK_TAG = { mock: true, simulated: true };

const MOCK_ADAPTERS = {
  gstin_verify: async ({ params }) => {
    const gstin = String(params.gstin || '').trim().toUpperCase();
    if (gstin.length !== 15) return { ok: false, error: 'INVALID_GSTIN_FORMAT' };
    return {
      ok: true,
      ...MOCK_TAG,
      data: {
        gstin,
        providerGstin: gstin,
        legalName: 'Nalanda Textiles Private Limited',
        tradeName: 'Nalanda Textiles',
        status: 'Active',
        taxpayerType: 'Regular',
        stateCode: gstin.slice(0, 2),
        registrationDate: '01/04/2019',
        eInvoiceStatus: 'Y',
        valid: true,
      },
    };
  },

  gst_return_status: async ({ params }) => {
    const gstin = String(params.gstin || '').trim().toUpperCase();
    return {
      ok: true,
      ...MOCK_TAG,
      data: {
        gstin,
        returns: [
          { ret_prd: '092026', rtntype: params.gstr || 'GSTR1', filing_flg: 'Y', file_dt: '20/09/2026', arn: `MOCK-ARN-${gstin}-092026` },
        ],
      },
    };
  },

  gst_taxpayer_generate_otp: async () => ({
    ok: true,
    ...MOCK_TAG,
    data: { requested: true, provider: { result: 'OTP sent to the registered mobile (simulated)' } },
  }),

  gst_taxpayer_verify_otp: async () => ({
    ok: true,
    ...MOCK_TAG,
    data: { sessionEstablished: true, tokenExpiry: 'mock-taxpayer-session-6h' },
  }),

  gst_gstr2b_recon_submit: async ({ params }) => {
    const { year, month } = periodParts(params);
    const gstin = String(params.gstin || '').toUpperCase();
    return {
      ok: true,
      ...MOCK_TAG,
      data: {
        job: {
          job_id: `MOCK-2B-${gstin}-${year}-${String(month).padStart(2, '0')}`,
          status: 'completed',
          match_rate: 94,
          docs: [
            { purpose: 'GSTR-2B', url: 'https://example.in/mock/gstr2b.pdf' },
            { purpose: 'Purchase ledger', url: 'https://example.in/mock/purchase-ledger.csv' },
          ],
        },
        note: 'Mock GSTR-2B reconciliation job. The sprint-3 engine remains the source of truth.',
      },
    };
  },

  gst_save_gstr1: async ({ params }) => {
    const { year, month } = periodParts(params);
    if (!params.payload) return { ok: false, error: 'PAYLOAD_REQUIRED', hint: 'Pass the GSTN GSTR-1 JSON as params.payload (see export_gstr1_json).' };
    return {
      ok: true,
      ...MOCK_TAG,
      data: { saved: true, referenceId: `MOCK-GSTR1-${year}-${String(month).padStart(2, '0')}` },
    };
  },

  gst_file_gstr1_evc: async ({ params }) => {
    const { year, month } = periodParts(params);
    if (!params.pan || !params.otp) return { ok: false, error: 'PAN_AND_EVC_OTP_REQUIRED', hint: 'Generate an EVC OTP (gst_taxpayer_generate_otp flow) and pass pan + otp.' };
    if (!params.summary) return { ok: false, error: 'SUMMARY_REQUIRED', hint: 'Pass the summary returned by new-proceed (newSumFlag, sec_sum, chksum).' };
    return {
      ok: true,
      ...MOCK_TAG,
      data: { filed: true, ackNum: `MOCK-ACK-${year}-${String(month).padStart(2, '0')}` },
    };
  },

  einvoice_authenticate: async () => ({
    ok: true,
    ...MOCK_TAG,
    data: { authenticated: true, expiry: 'mock-einvoice-session-6h' },
  }),

  einvoice_generate: async ({ params, state }) => {
    const built = einvoicePayload(params, state);
    if (!built.ok) return built;
    const payload = built.payload;
    const hashed = createHash('sha256').update(`${payload?.TranDtls?.SupplyType || 'B2B'}:${payload?.CustDtls?.LglNm || 'MOCK'}:${params.invoiceId || 'INV-0001'}`).digest('hex').toUpperCase();
    const irn = hashed.slice(0, 64);
    if (built.invoice) {
      built.invoice.mockIrn = irn;
      built.invoice.mockAckNo = `MOCK-ACK-${params.invoiceId}`;
      built.invoice.mockAckDate = '2026-09-20 12:00:00';
      built.invoice.mockSignedQrCode = `mock_qr_${irn.slice(0, 16)}`;
    }
    return {
      ok: true,
      ...MOCK_TAG,
      data: { irn, ackNo: `MOCK-ACK-${params.invoiceId || 'INV'}`, ackDate: '2026-09-20 12:00:00', signedQrCode: `mock_qr_${irn.slice(0, 16)}`, status: 'ACT' },
    };
  },

  einvoice_cancel: async ({ params }) => {
    if (!params.irn) return { ok: false, error: 'IRN_REQUIRED' };
    return {
      ok: true,
      ...MOCK_TAG,
      data: { cancelled: true, irn: params.irn, cancelDate: '2026-09-20 13:00:00' },
    };
  },

  tds_analytics_job: async ({ params }) => ({
    ok: true,
    ...MOCK_TAG,
    data: {
      job: {
        job_id: `MOCK-TDS-${params.tan || 'TAN00000'}-${params.quarter || 'Q3'}`,
        status: 'completed',
        potential_notices: 2,
        url: 'https://example.in/mock/tds-possible-notices.pdf',
      },
      note: 'Mock TDS analytics job. The sprint-5 TDS monitor remains the source of truth.',
    },
  }),

  tds_fvu_generate: async ({ params }) => ({
    ok: true,
    ...MOCK_TAG,
    data: {
      job: {
        job_id: `MOCK-FVU-${params.tan || 'TAN00000'}-${params.quarter || 'Q3'}`,
        status: 'completed',
        fvu: 'https://example.in/mock/2643FVU.html',
        url: 'https://example.in/mock/fvu-upload-url',
      },
      note: 'Mock FVU package. Upload the TXT/CSI files to the signed URLs, then poll the job.',
    },
  }),

  income_tax_calculate: async () => ({
    ok: false,
    ...MOCK_TAG,
    error: 'PROVIDER_ENDPOINT_UNDOCUMENTED',
    hint: 'Sandbox publishes no stable income-tax calculator path, so mock mode invents no figure either. Use prepare_itr (sprint-5 engine) for ITR maths.',
  }),
};

export function mockAdapterSupports(operationId) {
  return Boolean(MOCK_ADAPTERS[operationId]);
}

export async function runSandboxOperation({ operationId, actorId = '', actor = null, caApprovalId = '', params = {}, payloadSummary = {}, clientId = 'SELF' } = {}, deps = {}) {
  const operation = sandboxOperationById(operationId);
  if (!operation) return { ok: false, error: 'UNKNOWN_SANDBOX_OPERATION' };

  const state = deps.state;
  const adapter = ADAPTERS[operation.operationId];
  const mockAdapter = MOCK_ADAPTERS[operation.operationId];
  const requester = actor || { userId: actorId };
  const request = REQUEST_BUILDERS[operation.operationId]?.({ params, state }) || { ok: true, payload: params };
  const described = {
    operationId: operation.operationId,
    requirementId: operation.requirementId,
    mapsToTools: operation.mapsToTools,
    ownerModules: operation.ownerModules,
  };

  const result = await performExternalAction(state, {
    actionId: operation.operationId,
    clientId,
    params,
    actor: requester,
    approvalId: caApprovalId,
    metadata: {
      operationId: operation.operationId,
      requirementId: operation.requirementId,
      caApprovalId: caApprovalId || '',
      mapsToTools: operation.mapsToTools,
    },
    payload: request.payload,
    fixture: mockAdapter ? (copy) => mockAdapter({ params, state: copy }) : null,
    preflight: () => {
      const handoff = createSandboxHandoff({ operationId: operation.operationId, actorId: requester.userId, caApprovalId, payloadSummary });
      if (!handoff.ok && handoff.error !== 'CA_APPROVAL_REQUIRED') return handoff;
      if (!adapter) return { ok: false, error: 'NOT_IMPLEMENTED', hint: 'Operation is declared in the adapter contract but has no verified provider endpoint wired yet.' };
      return request.ok ? null : request;
    },
  }, (transports) => adapter({ client: transports.sandbox, params, state }));

  if (result.error === 'APPROVAL_REQUIRED' && !caApprovalId) return { ...result, error: 'CA_APPROVAL_REQUIRED', ...described };
  if (result.mock) {
    return { ...result, ...described, hint: 'Mock mode active (MYCA_MOCK_MODE=1). Simulated response — nothing was sent to the provider.' };
  }
  return { ...result, ...described };
}
