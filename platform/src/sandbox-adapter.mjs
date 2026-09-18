import { getSandboxClient } from './sandbox-client.mjs';
import { liveCallsEnabled } from './runtime-config.mjs';
import { sandboxOperationById, createSandboxHandoff } from './sandbox-adapter-contract.mjs';
import { approvalStatus, findApproval, consumeApproval } from './approvals.mjs';
import { appendAuditEvent, stateDigest } from './ca-api.mjs';

function fromClient(res, data) {
  if (res && res.ok === false && res.error) return { ok: false, error: res.error };
  if (res && res.ok === false) return { ok: false, error: `HTTP_${res.status || 'ERROR'}` };
  return { ok: true, data };
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
    const res = await client.trackReturns(params.gstin, params.fy);
    return fromClient(res, { gstin: String(params.gstin || '').toUpperCase(), returns: res.data?.data || res.data || null });
  },
  income_tax_calculate: async ({ client, params }) => {
    const res = await client.calculateIncomeTax(params);
    return { ...fromClient(res, res.data?.data || res.data || null), advisory: true };
  },
  tds_analytics_job: async ({ client, params }) => {
    const res = await client.submitTdsAnalyticsJob(params);
    return fromClient(res, res.data?.data || res.data || null);
  },
  gst_gstr2b_recon_submit: async ({ client, params }) => {
    const res = await client.submitGstr2bReconJob(params);
    return fromClient(res, { job: res.data?.data || res.data || null, note: 'Job output feeds gst_reconcile; the sprint-3 engine remains the source of truth.' });
  },
  einvoice_authenticate: async ({ client }) => {
    const auth = await client.authenticate(true);
    return fromClient(auth, { authenticated: true, cached: Boolean(auth.cached) });
  },
  einvoice_generate: async ({ client, params }) => {
    const res = await client.generateEInvoice(params);
    return fromClient(res, res.data?.data || res.data || null);
  },
  einvoice_cancel: async ({ client, params }) => {
    const res = await client.cancelEInvoice(params);
    return fromClient(res, res.data?.data || res.data || null);
  },
  gst_taxpayer_generate_otp: async ({ client, params }) => {
    const res = await client.generateTaxpayerOtp(params.gstin, params.username);
    return fromClient(res, res.data?.data || res.data || null);
  },
  gst_taxpayer_verify_otp: async ({ client, params }) => {
    const res = await client.verifyTaxpayerOtp(params.gstin, params.username, params.otp);
    return fromClient(res, res.data?.data || res.data || null);
  },
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

  // Contract gate 1: no secrets in any handoff metadata.
  const handoff = createSandboxHandoff({ operationId, actorId, caApprovalId, payloadSummary });
  if (!handoff.ok) return handoff;

  // Contract gate 2: outbound calls are opt-in.
  if (!live) {
    return {
      ok: false,
      error: 'LIVE_CALLS_DISABLED',
      operationId,
      requirementId: operation.requirementId,
      hint: 'Set MYCA_ENABLE_LIVE_CALLS=1 in platform/.env to allow outbound provider calls.',
    };
  }

  // Contract gate 3: gated operations need an approved, unused, matching CA approval.
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
