const SANDBOX_DOCS_BASE = 'https://developer.sandbox.co.in';

export const PROVIDER_CATALOG = [
  {
    providerId: 'sandbox',
    name: 'Sandbox by Quicko',
    docsUrl: `${SANDBOX_DOCS_BASE}/api-reference/gst/overview`,
    posture: 'provider_adapter_only',
    notes: [
      'Sandbox is a tax API provider target for GST, e-invoice, e-way bill, TDS, and income-tax workflows.',
      'Adapters must map provider payloads into existing MyCA engines instead of duplicating filing, reconciliation, or books logic.',
      'GST taxpayer APIs require ASP onboarding with Quicko GSP or another supported GSP path.',
    ],
    requirements: [
      {
        requirementId: 'REQ-CA-006',
        capability: 'GSTN/GSP filing, portal data, ledgers, IMS, and GSTR reconciliation',
        existingOwners: [
          'platform/src/gstr1-json.mjs',
          'sprints/sprint-3-gst-recon/src/index.mjs',
          'sprints/sprint-3-gst-recon/src/gstr2b.mjs',
          'sprints/sprint-3-gst-recon/src/match2b.mjs',
          'sprints/sprint-3-gst-recon/src/gstr1.mjs',
          'sprints/sprint-3-gst-recon/src/gstr3b.mjs',
          'sprints/sprint-3-gst-recon/src/ims.mjs',
          'sprints/sprint-5-filing-assistant/src/gstr1.mjs',
          'sprints/sprint-5-filing-assistant/src/gstr3b.mjs',
        ],
        adapterAction: 'wrap_existing_outputs_for_provider_payloads',
        autonomousAssistantAllowed: false,
        duplicateBusinessLogicAllowed: false,
        sandboxDocs: [
          {
            title: 'GST overview',
            url: `${SANDBOX_DOCS_BASE}/api-reference/gst/overview`,
          },
          {
            title: 'Generate taxpayer OTP',
            url: `${SANDBOX_DOCS_BASE}/api-reference/gst/compliance/endpoints/taxpayer/authentication/generate_otp.md`,
          },
          {
            title: 'Verify taxpayer OTP',
            url: `${SANDBOX_DOCS_BASE}/api-reference/gst/compliance/endpoints/taxpayer/authentication/verify_otp.md`,
          },
          {
            title: 'GSTR-2B reconciliation submit job',
            url: `${SANDBOX_DOCS_BASE}/api-reference/gst/analytics/endpoints/gstr-2b-reconciliation/submit_job.md`,
          },
          {
            title: 'GSTR-2B reconciliation poll job',
            url: `${SANDBOX_DOCS_BASE}/api-reference/gst/analytics/endpoints/gstr-2b-reconciliation/poll_job.md`,
          },
          {
            title: 'Track authenticated returns',
            url: `${SANDBOX_DOCS_BASE}/api-reference/gst/compliance/endpoints/taxpayer/common/track_returns.md`,
          },
          {
            title: 'Cash and ITC balance ledger',
            url: `${SANDBOX_DOCS_BASE}/api-reference/gst/compliance/endpoints/taxpayer/ledgers/cash_itc_balance_ledger.md`,
          },
        ],
      },
      {
        requirementId: 'REQ-CA-007',
        capability: 'NIC e-invoice, e-way bill by IRN, PDF, cancel, and IRN lookup',
        existingOwners: [
          'platform/src/govt.mjs',
          'platform/src/invoice.mjs',
          'sprints/sprint-5-filing-assistant/src/gstr1.mjs',
        ],
        adapterAction: 'wrap_existing_nic_payload_and_status_flow',
        autonomousAssistantAllowed: false,
        duplicateBusinessLogicAllowed: false,
        sandboxDocs: [
          {
            title: 'E-invoice overview',
            url: `${SANDBOX_DOCS_BASE}/api-reference/gst/compliance/guides/e-invoice/overview.md`,
          },
          {
            title: 'E-invoice authentication',
            url: `${SANDBOX_DOCS_BASE}/api-reference/gst/compliance/endpoints/e-invoice/authenticate.md`,
          },
          {
            title: 'Generate e-invoice',
            url: `${SANDBOX_DOCS_BASE}/api-reference/gst/compliance/endpoints/e-invoice/generate_e_invoice.md`,
          },
          {
            title: 'Generate e-invoice PDF',
            url: `${SANDBOX_DOCS_BASE}/api-reference/gst/compliance/endpoints/e-invoice/generate_e_invoice_pdf.md`,
          },
          {
            title: 'Cancel e-invoice',
            url: `${SANDBOX_DOCS_BASE}/api-reference/gst/compliance/endpoints/e-invoice/cancel_e_invoice.md`,
          },
        ],
      },
      {
        requirementId: 'REQ-CA-008',
        capability: 'GSTIN search, verification, PAN-to-GSTIN lookup, and return tracking',
        existingOwners: [
          'sprints/sprint-3-gst-recon/src/gstin.mjs',
          'platform/src/tools.mjs',
        ],
        adapterAction: 'enrich_existing_gstin_validation_with_provider_status',
        autonomousAssistantAllowed: true,
        duplicateBusinessLogicAllowed: false,
        sandboxDocs: [
          {
            title: 'GST public APIs overview',
            url: `${SANDBOX_DOCS_BASE}/api-reference/gst/compliance/guides/public/overview.md`,
          },
          {
            title: 'Search GSTIN',
            url: `${SANDBOX_DOCS_BASE}/api-reference/gst/compliance/endpoints/public/search_gstin.md`,
          },
          {
            title: 'Verify GSTIN',
            url: `${SANDBOX_DOCS_BASE}/api-reference/gst/compliance/endpoints/public/verify_gstin.md`,
          },
          {
            title: 'Track GST returns',
            url: `${SANDBOX_DOCS_BASE}/api-reference/gst/compliance/endpoints/public/track_gstrs.md`,
          },
        ],
      },
      {
        requirementId: 'REQ-CA-009',
        capability: 'Income-tax calculators and AIS/26AS reconciliation inputs',
        existingOwners: [
          'sprints/sprint-5-filing-assistant/src/itr.mjs',
        ],
        adapterAction: 'map_provider_income_tax_outputs_into_existing_itr_reconciliation',
        autonomousAssistantAllowed: false,
        duplicateBusinessLogicAllowed: false,
        sandboxDocs: [
          {
            title: 'Income Tax overview',
            url: `${SANDBOX_DOCS_BASE}/api-reference/it/overview.md`,
          },
          {
            title: 'Income Tax calculator overview',
            url: `${SANDBOX_DOCS_BASE}/api-reference/it/calculator/overview.md`,
          },
        ],
      },
      {
        requirementId: 'REQ-CA-010',
        capability: 'TDS/TCS analytics, reports, FVU generation, e-file status, and Form 16/16A jobs',
        existingOwners: [
          'sprints/sprint-5-filing-assistant/src/tdsmonitor.mjs',
          'sprints/sprint-5-filing-assistant/src/core.mjs',
        ],
        adapterAction: 'map_provider_jobs_into_existing_tds_threshold_and_return_prep',
        autonomousAssistantAllowed: false,
        duplicateBusinessLogicAllowed: false,
        sandboxDocs: [
          {
            title: 'TDS analytics submit job',
            url: `${SANDBOX_DOCS_BASE}/api-reference/tds/analytics/tds-analytics/endpoints/submit_job.md`,
          },
          {
            title: 'TDS reports submit job',
            url: `${SANDBOX_DOCS_BASE}/api-reference/tds/reports/tds-reports/endpoints/submit_job.md`,
          },
          {
            title: 'TDS compliance overview',
            url: `${SANDBOX_DOCS_BASE}/api-reference/tds/compliance/overview.md`,
          },
          {
            title: 'Generate FVU submit job',
            url: `${SANDBOX_DOCS_BASE}/api-reference/tds/compliance/generate-fvu/endpoints/submit_job.md`,
          },
        ],
      },
    ],
  },
];

export function providerCatalog(providerId) {
  if (!providerId) return PROVIDER_CATALOG;
  const key = String(providerId).trim().toLowerCase();
  return PROVIDER_CATALOG.find((provider) => provider.providerId === key) || null;
}

export function providerRequirementMap(providerId) {
  const provider = providerCatalog(providerId);
  if (!provider) return [];
  return provider.requirements.map((req) => ({
    providerId: provider.providerId,
    providerName: provider.name,
    docsUrl: provider.docsUrl,
    ...req,
  }));
}

export function providerRequirementIds(providerId) {
  return providerRequirementMap(providerId).map((req) => req.requirementId);
}
