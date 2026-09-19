import { getSandboxClient } from './sandbox-client.mjs';
import { liveCallsEnabled } from './runtime-config.mjs';
import { sandboxOperationById, createSandboxHandoff } from './sandbox-adapter-contract.mjs';
import { approvalStatus, findApproval, consumeApproval } from './approvals.mjs';
import { appendAuditEvent, stateDigest } from './ca-api.mjs';
import { invoiceToNicPayload } from './govt.mjs';

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

// Each adapter is a strict translator into MyCA shapes. No statutory logic lives here.
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
    let payload = params.payload;
    if (!payload && params.invoiceId) {
      const invoice = [...(state?.invoices || []), ...(state?.purchases || [])].find((i) => i.id === params.invoiceId);
      if (!invoice) return { ok: false, error: 'INVOICE_NOT_FOUND', invoiceId: params.invoiceId };
      payload = invoiceToNicPayload(state.company, invoice);
    }
    if (!payload) return { ok: false, error: 'PAYLOAD_REQUIRED', hint: 'Pass params.invoiceId or a NIC JSON params.payload.' };
    const res = await client.generateEinvoice(payload);
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

export async function runSandboxOperation({ operationId, actorId = 'ca', caApprovalId = '', params = {}, payloadSummary = {}, clientId = 'SELF', allowLive = null } = {}, deps = {}) {
  const operation = sandboxOperationById(operationId);
  if (!operation) return { ok: false, error: 'UNKNOWN_SANDBOX_OPERATION' };

  const state = deps.state;
  const client = deps.client || getSandboxClient();
  const live = allowLive == null ? liveCallsEnabled() : Boolean(allowLive);

  const handoff = createSandboxHandoff({ operationId, actorId, caApprovalId, payloadSummary });
  if (!handoff.ok) return handoff;

  if (!live) {
    return {
      ok: false,
      error: 'LIVE_CALLS_DISABLED',
      operationId,
      requirementId: operation.requirementId,
      hint: 'Set MYCA_ENABLE_LIVE_CALLS=1 in platform/.env to allow outbound provider calls.',
    };
  }

  let approval = null;
  if (operation.caApprovalRequired) {
    approval = findApproval(state, caApprovalId);
    if (!approval) return { ok: false, error: 'APPROVAL_NOT_FOUND', operationId };
    if (approval.operationId !== operationId) return { ok: false, error: 'APPROVAL_OPERATION_MISMATCH', operationId };
    const status = approvalStatus(approval);
    if (status !== 'approved') return { ok: false, error: 'APPROVAL_NOT_ACTIVE', status, operationId };
  }

  const adapter = ADAPTERS[operationId];
  if (!adapter) {
    return { ok: false, error: 'NOT_IMPLEMENTED', operationId, hint: 'Operation is declared in the adapter contract but has no verified provider endpoint wired yet.' };
  }

  const beforeHash = state ? stateDigest(state) : null;
  let result;
  try {
    result = await adapter({ client, params, state });
  } catch (err) {
    result = { ok: false, error: String(err.message || err) };
  }

  if (result.ok && approval) consumeApproval(state, caApprovalId, { consumedBy: actorId });

  if (state) {
    appendAuditEvent(state, {
      actorId,
      clientId,
      action: `sandbox.${operationId}`,
      beforeHash,
      afterHash: stateDigest(state),
      metadata: {
        operationId,
        requirementId: operation.requirementId,
        caApprovalRequired: operation.caApprovalRequired,
        caApprovalId: caApprovalId || '',
        mapsToTools: operation.mapsToTools,
        ok: result.ok !== false,
      },
    });
  }

  return {
    ...result,
    operationId,
    requirementId: operation.requirementId,
    mapsToTools: operation.mapsToTools,
    ownerModules: operation.ownerModules,
  };
}
