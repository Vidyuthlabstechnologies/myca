import { withProviderContext } from '../../platform/src/provider-context.mjs';
import { providerEnvironment, serviceProviderEnvironment, mockModeEnabled } from '../../platform/src/runtime-config.mjs';
import { runTool } from '../../platform/src/tools.mjs';
import { runSandboxOperation } from '../../platform/src/sandbox-adapter.mjs';
import { normalizeClientId } from '../../platform/src/books.mjs';
import { requestApproval, decideApproval, approvalStatus } from '../../platform/src/approvals.mjs';
import { modeOf } from './govt-connectors.mjs';
import { filingApprovalSubject } from '../../platform/src/portal-filing.mjs';

// E-way bill operations offered at POST /ewaybill { op, ...params }. Each runs as the
// Sandbox by Quicko operation of the same name through the action gate.
export const EWB_OPS = Object.freeze({
  generate: 'ewb_generate',
  get: 'ewb_get',
  cancel: 'ewb_cancel',
  vehicle: 'ewb_update_vehicle',
  transporter: 'ewb_update_transporter',
  extend: 'ewb_extend',
  consolidate: 'ewb_consolidate',
  multi_vehicle_start: 'ewb_multi_vehicle_start',
  multi_vehicle_add: 'ewb_multi_vehicle_add',
  multi_vehicle_change: 'ewb_multi_vehicle_change',
  consignee_list: 'ewb_consignee_list',
  reject: 'ewb_reject',
});

const EWB_FIELDS = ['invoiceId', 'ewbNo', 'ewbNos', 'invoiceIds', 'docType', 'docNo', 'date', 'reasonCode', 'remark', 'reasonRem', 'vehicleNo', 'vehicleType', 'fromPlace', 'fromState', 'fromPincode', 'toPlace', 'toState', 'transMode', 'mode', 'transDocNo', 'transDocDate', 'transporterId', 'remainingDistance', 'consignmentStatus', 'transitType', 'addressLine1', 'addressLine2', 'addressLine3', 'totalQuantity', 'unitCode', 'groupNo', 'quantity', 'oldVehicleNo', 'newVehicleNo', 'oldTranNo', 'newTranNo'];

// Only known fields, so that the approval binds exactly what will be sent.
export function ewbParams(body = {}) {
  const params = {};
  for (const field of EWB_FIELDS) {
    const value = body[field];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) params[field] = value.slice(0, 50).map((item) => String(item).slice(0, 20));
    else if (typeof value === 'number' || typeof value === 'string') params[field] = typeof value === 'string' ? value.slice(0, 120) : value;
  }
  return params;
}

const OPERATIONS = {
  einvoice: 'einvoice_generate',
  ...Object.fromEntries(Object.entries(EWB_OPS).filter(([, id]) => id !== 'ewb_get' && id !== 'ewb_consignee_list').map(([op, id]) => [`ewaybill_${op}`, id])),
  gstr1_save: 'gst_save_gstr1',
  gstr1_submit: 'gst_gstr1_proceed',
  gstr1_otp: 'gst_evc_otp',
  gstr1_file: 'gst_file_gstr1_evc',
  gstr3b_save: 'gst_save_gstr3b',
  gstr3b_offset: 'gst_gstr3b_offset',
  gstr3b_otp: 'gst_evc_otp',
  gstr3b_file: 'gst_file_gstr3b_evc',
  tds_fvu: 'tds_fvu_generate',
};

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function publicApproval(approval) {
  return {
    approvalId: approval.approvalId,
    operation: approval.operationId === 'gst_evc_otp' ? (approval.paramsPreview?.form === 'GSTR-3B' ? 'gstr3b_otp' : 'gstr1_otp') : Object.keys(OPERATIONS).find((key) => OPERATIONS[key] === approval.operationId) || approval.operationId,
    params: approval.paramsPreview,
    requestedBy: approval.requestedBy,
    requestedAt: approval.requestedAt,
    decidedBy: approval.decidedBy,
    decidedAt: approval.decidedAt,
    status: approvalStatus(approval),
  };
}

function irpUser(config) {
  return { username: config.username, password: config.password, gstin: config.gstin };
}

function modeWords(mode) {
  return mode === 'live' ? 'live' : mode === 'test' ? 'test (sandbox)' : 'off';
}

export function createGovtActions({ connectors, withBooks, fetchFn = null }) {
  async function context(businessId, channel) {
    const config = await connectors.load(businessId, channel);
    if (!config || config.enabled === false) return { config: null, chosen: 'test' };
    return { config, chosen: modeOf(config) };
  }

  // The business's own Quicko key when it saved one, otherwise the service key.
  async function quickoKeys(businessId) {
    const own = await connectors.load(businessId, 'quicko');
    if (own && own.enabled !== false && own.apiKey && own.apiSecret) return { apiKey: own.apiKey, apiSecret: own.apiSecret, environment: own.environment };
    return {};
  }

  function described(chosen, effective) {
    return { mode: effective, chosenMode: chosen, serviceMode: serviceProviderEnvironment(), simulated: mockModeEnabled(), modeWords: modeWords(effective), provider: 'sandbox' };
  }

  // Runs one Quicko IRP / e-way bill operation for the business: its own API user, its
  // own (or the service) Quicko key, the owner's test/live switch, and the books.
  async function irpOperation(businessId, ctx, actor, operationId, params) {
    const { config, chosen } = await context(businessId, 'nic');
    if (!config && !mockModeEnabled()) return fail('NIC_NOT_CONNECTED', { hint: 'Add this business\'s e-invoice / e-way bill API user (username, password, GSTIN) under Connections first. Create it on the e-way bill portal and pick Sandbox by Quicko as the GSP.' });
    const sandbox = await quickoKeys(businessId);
    const providerContext = {
      environment: chosen,
      sandbox: { ...sandbox, ...(fetchFn ? { fetchFn } : {}), ...(config ? { irpUser: irpUser(config) } : {}) },
      ...(config ? { govt: { env: config.environment, ...irpUser(config) } } : {}),
    };
    return withProviderContext(providerContext, () => withBooks(businessId, ctx, async (session) => {
      const effective = providerEnvironment();
      const out = await runSandboxOperation({
        operationId,
        actor: actor.actor,
        actorId: actor.actor.userId,
        params,
        clientId: normalizeClientId(session.state.activeClientId),
      }, { state: session.state });
      session.persist();
      const { payload, ...rest } = out;
      return { ...rest, ...described(chosen, effective) };
    }));
  }

  return {
    async einvoice(businessId, ctx, actor, body = {}) {
      const invoiceId = String(body.invoiceId || '').trim();
      if (!/^[A-Za-z0-9/_-]{1,40}$/.test(invoiceId)) return fail('INVOICE_ID_REQUIRED');
      const out = await irpOperation(businessId, ctx, actor, 'einvoice_generate', { invoiceId });
      return out.error === 'CA_APPROVAL_REQUIRED' ? { ...out, error: 'APPROVAL_REQUIRED' } : out;
    },

    async ewaybill(businessId, ctx, actor, body = {}) {
      const op = String(body.op || '');
      if (!Object.hasOwn(EWB_OPS, op)) return fail('UNKNOWN_EWB_OP', { known: Object.keys(EWB_OPS) });
      const out = await irpOperation(businessId, ctx, actor, EWB_OPS[op], ewbParams(body));
      return out.error === 'CA_APPROVAL_REQUIRED' ? { ...out, error: 'APPROVAL_REQUIRED' } : out;
    },

    async gstinCheck(businessId, ctx, actor, body = {}) {
      const gstin = String(body.gstin || '').trim().toUpperCase();
      if (!/^[0-9A-Z]{15}$/.test(gstin)) return fail('GSTIN_REQUIRED');
      const { config, chosen } = await context(businessId, 'quicko');
      return withProviderContext({ environment: chosen, sandbox: config ? { apiKey: config.apiKey, apiSecret: config.apiSecret, environment: config.environment } : undefined }, async () => {
        const effective = providerEnvironment();
        const out = await runTool({}, 'validate_gstin', { gstin, actorId: actor.actor.userId, role: actor.actor.role });
        return { ...(out.data || out), ...described(chosen, effective) };
      });
    },

    async approvals(businessId, ctx, actor, method, body = {}) {
      if (method === 'GET') {
        return withBooks(businessId, ctx, async (session) => ({ ok: true, approvals: (session.state.approvals || []).filter((a) => Object.values(OPERATIONS).includes(a.operationId)).map(publicApproval).reverse().slice(0, 50) }));
      }
      return withBooks(businessId, ctx, async (session) => {
        if (body.approvalId) {
          const out = decideApproval(session.state, { approvalId: String(body.approvalId), decision: body.decision, actor: actor.actor, reason: body.reason });
          if (!out.ok) return out;
          session.persist();
          return { ok: true, approval: publicApproval(out.approval) };
        }
        const operation = String(body.operation || '');
        const operationId = Object.hasOwn(OPERATIONS, operation) ? OPERATIONS[operation] : '';
        if (!operationId) return fail('UNKNOWN_OPERATION', { known: Object.keys(OPERATIONS) });
        if (operation.startsWith('ewaybill_')) {
          const params = ewbParams(body);
          const asked = requestApproval(session.state, { operationId, clientId: normalizeClientId(session.state.activeClientId), params, actor: actor.actor });
          if (!asked.ok) return asked;
          session.persist();
          return { ok: true, approval: publicApproval(asked.approval), hint: 'An owner or the accountant, other than you, approves it; then send the same e-way bill request again.' };
        }
        if (operation !== 'einvoice') {
          const subject = filingApprovalSubject(session.state, operationId, { period: body.period, gstin: body.gstin, quarter: body.quarter, form: operation === 'gstr3b_otp' ? 'GSTR-3B' : body.form, tan: body.tan });
          if (!subject.ok) return subject;
          const asked = requestApproval(session.state, { operationId, clientId: normalizeClientId(session.state.activeClientId), params: subject.subject, actor: actor.actor });
          if (!asked.ok) return asked;
          session.persist();
          return { ok: true, approval: publicApproval(asked.approval), hint: 'An owner or the accountant, other than you, approves it. It stays good while the books for that month do not change.' };
        }
        const invoiceId = String(body.invoiceId || '').trim();
        if (!invoiceId) return fail('INVOICE_ID_REQUIRED');
        const out = requestApproval(session.state, { operationId, clientId: normalizeClientId(session.state.activeClientId), params: { invoiceId }, actor: actor.actor });
        if (!out.ok) return out;
        session.persist();
        return { ok: true, approval: publicApproval(out.approval), hint: 'An owner or the accountant, other than you, approves it; then generate the e-invoice.' };
      });
    },
  };
}
