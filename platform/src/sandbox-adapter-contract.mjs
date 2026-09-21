import { providerCatalog, providerRequirementMap } from './provider-catalog.mjs';
import { hasSecretKey } from './secret-keys.mjs';

export const SANDBOX_OPERATIONS = [
  {
    operationId: 'gst_taxpayer_generate_otp',
    requirementId: 'REQ-CA-006',
    title: 'Generate GST taxpayer OTP',
    mode: 'auth',
    caApprovalRequired: true,
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
    caApprovalRequired: true,
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
    caApprovalRequired: false,
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
    caApprovalRequired: false,
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
    caApprovalRequired: true,
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
    caApprovalRequired: true,
    assistantBlocked: true,
    mapsToTools: ['filing_pack'],
    ownerModules: ['platform/src/tools.mjs'],
    docsTitle: 'GST overview',
  },
  {
    operationId: 'einvoice_authenticate',
    requirementId: 'REQ-CA-007',
    title: 'Authenticate e-invoice session',
    mode: 'auth',
    caApprovalRequired: true,
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
    caApprovalRequired: true,
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
    caApprovalRequired: true,
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
    caApprovalRequired: false,
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
    caApprovalRequired: false,
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
    caApprovalRequired: false,
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
    caApprovalRequired: true,
    assistantBlocked: true,
    mapsToTools: ['monitor_tds'],
    ownerModules: ['sprints/sprint-5-filing-assistant/src/tdsmonitor.mjs'],
    docsTitle: 'Generate FVU submit job',
  },
];

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
