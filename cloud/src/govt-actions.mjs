import { withProviderContext } from '../../platform/src/provider-context.mjs';
import { providerEnvironment, serviceProviderEnvironment, mockModeEnabled } from '../../platform/src/runtime-config.mjs';
import { generateIrn } from '../../platform/src/nic-actions.mjs';
import { runTool } from '../../platform/src/tools.mjs';
import { normalizeClientId } from '../../platform/src/books.mjs';
import { requestApproval, decideApproval, approvalStatus } from '../../platform/src/approvals.mjs';
import { modeOf } from './govt-connectors.mjs';
import { filingApprovalSubject } from '../../platform/src/portal-filing.mjs';

const OPERATIONS = {
  einvoice: 'nic_irn_generate',
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

function nicConfig(config) {
  return {
    env: config.environment === 'production' ? 'production' : 'sandbox',
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    username: config.username,
    password: config.password,
    gstin: config.gstin,
    publicKeyPem: config.publicKeyPem,
  };
}

function modeWords(mode) {
  return mode === 'live' ? 'live' : mode === 'test' ? 'test (sandbox)' : 'off';
}

export function createGovtActions({ connectors, withBooks }) {
  async function context(businessId, channel) {
    const config = await connectors.load(businessId, channel);
    if (!config || config.enabled === false) return { config: null, chosen: 'test' };
    return { config, chosen: modeOf(config) };
  }

  function described(chosen, effective) {
    return { mode: effective, chosenMode: chosen, serviceMode: serviceProviderEnvironment(), simulated: mockModeEnabled(), modeWords: modeWords(effective) };
  }

  return {
    async einvoice(businessId, ctx, actor, body = {}) {
      const invoiceId = String(body.invoiceId || '').trim();
      if (!/^[A-Za-z0-9/_-]{1,40}$/.test(invoiceId)) return fail('INVOICE_ID_REQUIRED');
      const { config, chosen } = await context(businessId, 'nic');
      if (!config && !mockModeEnabled()) return fail('NIC_NOT_CONNECTED', { hint: 'Add this business\'s NIC e-invoice API credentials under Connections first. Use the sandbox ones from einv-apisandbox.nic.in to test.' });
      return withProviderContext({ environment: chosen, govt: config ? nicConfig(config) : undefined }, () => withBooks(businessId, ctx, async (session) => {
        const effective = providerEnvironment();
        const out = await generateIrn(session.state, invoiceId, actor.actor);
        session.persist();
        const { payload, ...rest } = out;
        return { ...rest, ...described(chosen, effective) };
      }));
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
