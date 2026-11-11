import { providerCatalog, providerRequirementMap } from './provider-catalog.mjs';
import { hasSecretKey } from './secret-keys.mjs';
import { ACTION_CLASSES } from './action-gate.mjs';
import { QUICKO_OPERATIONS } from './sandbox-endpoints.mjs';

const OPERATIONS = [
  {
    operationId: 'gst_taxpayer_generate_otp',
    requirementId: 'REQ-CA-006',
    title: 'Generate GST taxpayer OTP',
    mode: 'auth',
    assistantBlocked: true,
    mapsToTools: [],
    ownerModules: ['provider_session_vault', 'platform/src/ca-api.mjs'],
    docsTitle: 'Generate taxpayer OTP',
  },
  {
    operationId: 'gst_taxpayer_verify_otp',
    requirementId: 'REQ-CA-006',
    title: 'Verify GST taxpayer OTP',
    mode: 'auth',
    assistantBlocked: true,
    mapsToTools: [],
    ownerModules: ['provider_session_vault', 'platform/src/ca-api.mjs'],
    docsTitle: 'Verify taxpayer OTP',
  },
  {
    operationId: 'gst_gstr2b_recon_submit',
    requirementId: 'REQ-CA-006',
    title: 'Submit GSTR-2B reconciliation job',
    mode: 'read_prepare',
    assistantBlocked: false,
    mapsToTools: ['gst_reconcile'],
    ownerModules: [
      'sprints/sprint-3-gst-recon/src/gstr2b.mjs',
      'sprints/sprint-3-gst-recon/src/match2b.mjs',
    ],
    docsTitle: 'GSTR-2B reconciliation submit job',
  },
  {
    operationId: 'gst_return_status',
    requirementId: 'REQ-CA-006',
    title: 'Track GST return status',
    mode: 'read',
    assistantBlocked: false,
    mapsToTools: ['integration_readiness'],
    ownerModules: ['platform/src/integration-contract.mjs'],
    docsTitle: 'Track authenticated returns',
  },
  {
    operationId: 'gst_save_gstr1',
    requirementId: 'REQ-CA-006',
    title: 'Save GSTR-1 draft',
    mode: 'write_prepare',
    assistantBlocked: true,
    mapsToTools: ['prepare_gstr1', 'export_gstr1_json'],
    ownerModules: [
      'platform/src/gstr1-json.mjs',
      'sprints/sprint-5-filing-assistant/src/gstr1.mjs',
    ],
    docsTitle: 'GST overview',
  },
  {
    operationId: 'gst_file_gstr1_evc',
    requirementId: 'REQ-CA-006',
    title: 'File GSTR-1 with EVC',
    mode: 'file',
    assistantBlocked: true,
    mapsToTools: ['filing_pack'],
    ownerModules: ['platform/src/tools.mjs'],
    docsTitle: 'GST overview',
  },
  {
    operationId: 'gst_save_gstr3b',
    requirementId: 'REQ-CA-006',
    title: 'Save GSTR-3B draft',
    mode: 'write_prepare',
    assistantBlocked: true,
    mapsToTools: ['save_gstr3b_portal'],
    ownerModules: ['platform/src/gstr3b-portal.mjs'],
    docsTitle: 'GST overview',
  },
  {
    operationId: 'gst_gstr3b_liability',
    requirementId: 'REQ-CA-006',
    title: 'Read the GSTR-3B liability the portal worked out',
    mode: 'read',
    assistantBlocked: false,
    mapsToTools: ['gstr3b_portal_liability'],
    ownerModules: ['platform/src/gstr3b-portal.mjs'],
    docsTitle: 'GST overview',
  },
  {
    operationId: 'gst_gstr3b_offset',
    requirementId: 'REQ-CA-006',
    title: 'Set off GSTR-3B liability from credit and cash',
    mode: 'file',
    assistantBlocked: true,
    mapsToTools: ['offset_gstr3b_portal'],
    ownerModules: ['platform/src/gstr3b-portal.mjs', 'platform/src/gst-setoff.mjs'],
    docsTitle: 'GST overview',
  },
  {
    operationId: 'gst_file_gstr3b_evc',
    requirementId: 'REQ-CA-006',
    title: 'File GSTR-3B with EVC',
    mode: 'file',
    assistantBlocked: true,
    mapsToTools: ['file_gstr3b_portal'],
    ownerModules: ['platform/src/gstr3b-portal.mjs'],
    docsTitle: 'GST overview',
  },
  {
    operationId: 'gst_gstr1_processing',
    requirementId: 'REQ-CA-006',
    title: 'Check GSTR-1 save processing',
    mode: 'read',
    assistantBlocked: false,
    mapsToTools: ['portal_status'],
    ownerModules: ['platform/src/portal-filing.mjs'],
    docsTitle: 'GST overview',
  },
  {
    operationId: 'gst_gstr1_proceed',
    requirementId: 'REQ-CA-006',
    title: 'Submit GSTR-1 (new proceed to file)',
    mode: 'write_prepare',
    assistantBlocked: true,
    mapsToTools: ['submit_gstr1_portal'],
    ownerModules: ['platform/src/portal-filing.mjs'],
    docsTitle: 'GST overview',
  },
  {
    operationId: 'gst_gstr1_summary',
    requirementId: 'REQ-CA-006',
    title: 'Read GSTR-1 summary for filing',
    mode: 'read',
    assistantBlocked: false,
    mapsToTools: ['file_gstr1_portal'],
    ownerModules: ['platform/src/portal-filing.mjs'],
    docsTitle: 'GST overview',
  },
  {
    operationId: 'gst_evc_otp',
    requirementId: 'REQ-CA-006',
    title: 'Generate EVC OTP for filing',
    mode: 'auth',
    assistantBlocked: true,
    mapsToTools: ['file_gstr1_portal'],
    ownerModules: ['platform/src/portal-filing.mjs'],
    docsTitle: 'GST overview',
  },
  {
    operationId: 'einvoice_authenticate',
    requirementId: 'REQ-CA-007',
    title: 'Authenticate e-invoice session',
    mode: 'auth',
    assistantBlocked: true,
    mapsToTools: ['govt_nic_auth'],
    ownerModules: ['platform/src/govt.mjs'],
    docsTitle: 'E-invoice authentication',
  },
  {
    operationId: 'einvoice_generate',
    requirementId: 'REQ-CA-007',
    title: 'Generate e-invoice IRN',
    mode: 'write_government',
    assistantBlocked: true,
    mapsToTools: ['govt_generate_irn'],
    ownerModules: ['platform/src/govt.mjs', 'platform/src/invoice.mjs'],
    docsTitle: 'Generate e-invoice',
  },
  {
    operationId: 'einvoice_cancel',
    requirementId: 'REQ-CA-007',
    title: 'Cancel e-invoice',
    mode: 'write_government',
    assistantBlocked: true,
    mapsToTools: [],
    ownerModules: ['platform/src/govt.mjs'],
    docsTitle: 'Cancel e-invoice',
  },
  {
    operationId: 'gstin_verify',
    requirementId: 'REQ-CA-008',
    title: 'Verify GSTIN with public API',
    mode: 'read',
    assistantBlocked: false,
    mapsToTools: ['validate_gstin'],
    ownerModules: ['sprints/sprint-3-gst-recon/src/gstin.mjs', 'platform/src/tools.mjs'],
    docsTitle: 'Verify GSTIN',
  },
  {
    operationId: 'income_tax_calculate',
    requirementId: 'REQ-CA-009',
    title: 'Map income-tax calculator output',
    mode: 'read_prepare',
    assistantBlocked: false,
    mapsToTools: ['prepare_itr'],
    ownerModules: ['sprints/sprint-5-filing-assistant/src/itr.mjs'],
    docsTitle: 'Income Tax calculator overview',
  },
  {
    operationId: 'tds_analytics_job',
    requirementId: 'REQ-CA-010',
    title: 'Map TDS analytics job',
    mode: 'read_prepare',
    assistantBlocked: false,
    mapsToTools: ['monitor_tds'],
    ownerModules: ['sprints/sprint-5-filing-assistant/src/tdsmonitor.mjs'],
    docsTitle: 'TDS analytics submit job',
  },
  {
    operationId: 'tds_fvu_generate',
    requirementId: 'REQ-CA-010',
    title: 'Generate TDS FVU package',
    mode: 'write_prepare',
    assistantBlocked: true,
    mapsToTools: ['monitor_tds'],
    ownerModules: ['sprints/sprint-5-filing-assistant/src/tdsmonitor.mjs'],
    docsTitle: 'Generate FVU submit job',
  },
];

const CATALOGUE_OPERATIONS = QUICKO_OPERATIONS.map((endpoint) => ({
  operationId: endpoint.id,
  requirementId: endpoint.requirementId,
  title: endpoint.title,
  mode: endpoint.mode,
  assistantBlocked: endpoint.actionClass === 'write',
  mapsToTools: [],
  ownerModules: ['platform/src/sandbox-endpoints.mjs'],
  docsTitle: endpoint.title,
  catalogue: { method: endpoint.method, path: endpoint.path, family: endpoint.family, session: endpoint.session, irreversible: endpoint.irreversible },
}));

export const SANDBOX_OPERATIONS = [...OPERATIONS, ...CATALOGUE_OPERATIONS].map((operation) => ({
  ...operation,
  caApprovalRequired: ACTION_CLASSES[operation.operationId].actionClass === 'write',
}));

function docsFor(requirement, docsTitle) {
  return (requirement?.sandboxDocs || []).find((doc) => doc.title === docsTitle) || requirement?.sandboxDocs?.[0] || null;
}

export function sandboxOperationById(operationId) {
  const key = String(operationId || '').trim();
  if (!key) return null;
  return SANDBOX_OPERATIONS.find((operation) => operation.operationId === key) || null;
}

export function sandboxAdapterPlan({ requirementId, operationId } = {}) {
  const provider = providerCatalog('sandbox');
  const requirements = providerRequirementMap('sandbox');
  const requirementById = new Map(requirements.map((req) => [req.requirementId, req]));
  let operations = SANDBOX_OPERATIONS;
  if (requirementId) operations = operations.filter((operation) => operation.requirementId === requirementId);
  if (operationId) operations = operations.filter((operation) => operation.operationId === operationId);

  return {
    providerId: provider.providerId,
    providerName: provider.name,
    docsUrl: provider.docsUrl,
    posture: provider.posture,
    operations: operations.map((operation) => {
      const requirement = requirementById.get(operation.requirementId);
      return {
        ...operation,
        capability: requirement?.capability || '',
        adapterAction: requirement?.adapterAction || '',
        duplicateBusinessLogicAllowed: false,
        docs: docsFor(requirement, operation.docsTitle),
      };
    }),
  };
}

export function createSandboxHandoff({ operationId, actorId = 'system', caApprovalId = '', payloadRef = '', payloadSummary = {} } = {}) {
  const operation = sandboxOperationById(operationId);
  if (!operation) return { ok: false, error: 'UNKNOWN_SANDBOX_OPERATION' };
  if (hasSecretKey(payloadSummary)) return { ok: false, error: 'SECRET_FIELDS_NOT_ALLOWED_IN_HANDOFF' };
  if (operation.assistantBlocked && String(actorId || '').trim().toLowerCase() === 'assistant') {
    return { ok: false, error: 'ASSISTANT_BLOCKED_FOR_OPERATION', operation };
  }
  if (operation.caApprovalRequired && !String(caApprovalId || '').trim()) {
    return { ok: false, error: 'CA_APPROVAL_REQUIRED', operation };
  }
  return {
    ok: true,
    handoff: {
      providerId: 'sandbox',
      operationId: operation.operationId,
      requirementId: operation.requirementId,
      actorId,
      caApprovalId: String(caApprovalId || ''),
      payloadRef: String(payloadRef || ''),
      payloadSummary,
      mapsToTools: operation.mapsToTools,
      ownerModules: operation.ownerModules,
      createdAt: new Date().toISOString(),
    },
  };
}
