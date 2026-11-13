import { createHash } from 'node:crypto';
import { sandboxOperationById, createSandboxHandoff } from './sandbox-adapter-contract.mjs';
import { invoiceToNicPayload, nicDocumentById, nicPartyFor, nicPayloadRefusal } from './nic-config.mjs';
import { performExternalAction } from './action-gate.mjs';
import { quickoOperation } from './sandbox-endpoints.mjs';
import { documentsOf, isSha256 } from './document-store.mjs';
import { omitSecrets } from './secret-keys.mjs';
import { EWB_ADAPTERS, EWB_MOCK_ADAPTERS, EWB_REQUEST_BUILDERS } from './ewb-adapter.mjs';

function fromClient(res, data) {
  if (res && res.ok === false && res.error) return { ok: false, error: res.error, ...(res.message ? { hint: res.message } : {}) };
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
    const invoice = nicDocumentById(state, invoiceId) || (state?.purchases || []).find((i) => i.id === invoiceId);
    if (!invoice) return { ok: false, error: 'INVOICE_NOT_FOUND', invoiceId };
    const refused = nicPayloadRefusal(state, invoice);
    if (refused) return refused;
    return { ok: true, invoice, payload: invoiceToNicPayload(state.company, invoice, nicPartyFor(state, invoice)) };
  }
  if (params.payload) return { ok: true, invoice: null, payload: params.payload };
  return { ok: false, error: 'PAYLOAD_REQUIRED', hint: 'Pass params.invoiceId or a NIC JSON params.payload.' };
}

const PORTAL_PAYLOAD = (what) => ({ params }) => (params.payload
  ? { ok: true, payload: { ...periodParts(params), payload: params.payload } }
  : { ok: false, error: 'PAYLOAD_REQUIRED', hint: `Pass the ${what} as params.payload.` });

function portalError(res) {
  const inner = res?.data?.data || {};
  if (String(inner.status_cd ?? '') === '0' && inner.error) return { ok: false, error: String(inner.error.error_cd || 'PORTAL_REFUSED'), hint: String(inner.error.message || '') };
  return null;
}

function ledgerIdsOf(data) {
  const ids = {};
  for (const row of [...(data?.tx_pmt?.tx_py || []), ...(data?.liab_ldg || []), ...(data?.tx_py || [])]) {
    if (row && row.trans_typ != null && row.liab_ldg_id != null) ids[Number(row.trans_typ)] = Number(row.liab_ldg_id);
  }
  return ids;
}

function picked(params, names) {
  const out = {};
  for (const name of names) if (params[name] !== undefined && params[name] !== null && params[name] !== '') out[name] = params[name];
  return out;
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

export function catalogueRequest(endpoint, params = {}) {
  const pathParams = { ...picked(params, endpoint.pathParams), ...(plainObject(params.path) || {}) };
  const query = { ...picked(params, endpoint.query.map((q) => q.name)), ...(plainObject(params.query) || {}) };
  const missingPath = endpoint.pathParams.filter((name) => pathParams[name] === undefined || String(pathParams[name]).trim() === '');
  if (missingPath.length) return { ok: false, error: 'PATH_PARAMS_REQUIRED', missing: missingPath, hint: `Pass params.path { ${missingPath.join(', ')} }.` };
  const missingQuery = endpoint.query.filter((q) => q.required && (query[q.name] === undefined || query[q.name] === '')).map((q) => q.name);
  if (missingQuery.length) return { ok: false, error: 'QUERY_PARAMS_REQUIRED', missing: missingQuery, hint: `Pass params.query { ${missingQuery.join(', ')} }.` };
  if (endpoint.needsConsent && endpoint.query.some((q) => q.name === 'consent') && !/^y$/i.test(String(query.consent || ''))) {
    return { ok: false, error: 'CONSENT_REQUIRED', hint: 'This lookup needs consent. Ask the person, then pass query.consent "Y" and query.reason.' };
  }
  let body;
  if (endpoint.body === 'json') {
    const given = params.body;
    if (given !== undefined && given !== null && typeof given !== 'object') return { ok: false, error: 'BODY_MUST_BE_JSON' };
    body = Array.isArray(given) ? given : { ...(endpoint.entity ? { '@entity': endpoint.entity } : {}), ...(given || {}) };
    if (!Array.isArray(body)) {
      const missing = endpoint.bodyRequired.filter((name) => body[name] === undefined || body[name] === null || body[name] === '');
      if (missing.length) return { ok: false, error: 'BODY_FIELDS_REQUIRED', missing, hint: `Pass params.body with ${missing.join(', ')}.` };
      if (endpoint.needsConsent && !/^y$/i.test(String(body.consent || ''))) {
        return { ok: false, error: 'CONSENT_REQUIRED', hint: 'This lookup needs the person\'s consent. Ask them, then pass body.consent "Y" and body.reason.' };
      }
    }
  }
  const documentSha256 = String(params.documentSha256 || '').trim().toLowerCase();
  if (endpoint.body === 'multipart' && !isSha256(documentSha256)) return { ok: false, error: 'FILE_REQUIRED', hint: 'Upload the PDF with /api/upload and pass params.documentSha256.' };
  const jobInputSha256 = String(params.jobInputSha256 || '').trim().toLowerCase();
  if (jobInputSha256 && !isSha256(jobInputSha256)) return { ok: false, error: 'INVALID_SHA256' };
  return {
    ok: true,
    call: { pathParams, query, ...(body === undefined ? {} : { body }) },
    payload: {
      method: endpoint.method,
      path: endpoint.path,
      pathParams,
      query,
      ...(body === undefined ? {} : { body }),
      ...(documentSha256 ? { documentSha256 } : {}),
      ...(params.jobInput !== undefined ? { jobInput: 'inline JSON' } : {}),
      ...(jobInputSha256 ? { jobInputSha256 } : {}),
    },
  };
}

function storedBytes(state, sha256, fallbackType) {
  const stored = documentsOf(state).readVerified(sha256);
  if (!stored.ok) return stored;
  const content = String(stored.content || '');
  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(content.trim());
  if (match) return { ok: true, bytes: Buffer.from(match[2].replace(/\s+/g, ''), 'base64'), type: match[1].toLowerCase() };
  return { ok: true, bytes: Buffer.from(content, 'utf8'), type: fallbackType };
}

function withoutTokens(value) {
  if (Array.isArray(value)) return value.map(withoutTokens);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) if (!/token|password|secret/i.test(key)) out[key] = withoutTokens(child);
  return out;
}

function outputUrl(inner) {
  if (!inner || typeof inner !== 'object') return '';
  for (const key of ['output_url', 'download_url', 'output', 'url', 'report_url', 'result_url']) {
    if (typeof inner[key] === 'string' && /^https:/.test(inner[key])) return inner[key];
  }
  return '';
}

async function catalogueAdapter({ client, params, state, endpoint }) {
  const built = catalogueRequest(endpoint, params);
  if (!built.ok) return built;
  let file;
  if (endpoint.body === 'multipart') {
    const read = storedBytes(state, String(params.documentSha256).toLowerCase(), 'application/pdf');
    if (!read.ok) return read;
    if (!/pdf/.test(read.type)) return { ok: false, error: 'PDF_REQUIRED', hint: 'Upload the document as a PDF.' };
    file = { bytes: read.bytes, type: read.type, name: `${endpoint.family}.pdf` };
  }
  const res = await client.callEndpoint(endpoint.id, { ...built.call, ...(file ? { file } : {}) });
  if (res.ok === false) {
    const failed = fromClient(res);
    return { ...failed, ...(res.missing ? { missing: res.missing } : {}), ...(res.session ? { session: res.session } : {}), ...(res.hint && !failed.hint ? { hint: res.hint } : {}) };
  }
  const clean = endpoint.opensSession ? omitSecrets(withoutTokens(res.data)) : withoutTokens(res.data);
  const inner = clean?.data ?? clean;
  const data = {
    operationId: endpoint.id,
    source: 'Sandbox by Quicko',
    provider: inner,
    ...(res.sessionEstablished ? { sessionEstablished: true, session: res.session } : {}),
  };
  const jobInputSha256 = String(params.jobInputSha256 || '').trim().toLowerCase();
  if (params.jobInput !== undefined || jobInputSha256) {
    const uploadUrl = typeof res.data?.data?.url === 'string' ? res.data.data.url : '';
    if (!uploadUrl) return { ok: false, error: 'JOB_URL_MISSING', provider: inner, hint: 'The job was created but Sandbox returned no upload URL.' };
    let bytes;
    let contentType = 'application/json';
    if (jobInputSha256) {
      const read = storedBytes(state, jobInputSha256, 'text/csv');
      if (!read.ok) return read;
      bytes = read.bytes;
      contentType = read.type;
    } else {
      bytes = JSON.stringify(params.jobInput);
    }
    const uploaded = await client.uploadJobPayload(uploadUrl, { bytes, contentType });
    if (!uploaded.ok) return { ok: false, error: uploaded.error, provider: inner, hint: 'The job exists but its input did not upload; submit the job again.' };
    data.uploaded = true;
    data.provider = { ...inner, url: undefined };
  }
  if (params.fetchOutput && endpoint.method === 'GET') {
    const url = outputUrl(res.data?.data);
    if (url) {
      const output = await client.fetchJobOutput(url);
      if (!output.ok) return { ok: false, error: output.error, provider: inner };
      data.output = output.output ?? output.text;
    }
  }
  return { ok: true, data };
}

async function catalogueMock({ params, endpoint }) {
  const built = catalogueRequest(endpoint, params);
  if (!built.ok) return built;
  return {
    ok: true,
    ...MOCK_TAG,
    data: {
      operationId: endpoint.id,
      source: 'Sandbox by Quicko (simulated)',
      accepted: true,
      request: { method: endpoint.method, path: endpoint.path, pathParams: built.call.pathParams, query: built.call.query },
      note: 'Mock mode: nothing was sent and no figures were made up. Turn mock mode off and use the test key to see real responses.',
    },
  };
}

const REQUEST_BUILDERS = {
  ...Object.fromEntries(Object.entries(EWB_REQUEST_BUILDERS).map(([id, builder]) => [id, (input) => {
    const built = builder(input);
    return built.ok ? { ok: true, payload: built.payload } : built;
  }])),
  gst_save_gstr3b: PORTAL_PAYLOAD('GSTN GSTR-3B JSON'),
  gst_gstr3b_offset: PORTAL_PAYLOAD('GSTR-3B offset (pdcash and pditc)'),
  einvoice_generate: ({ params, state }) => einvoicePayload(params, state),
  gst_save_gstr1: ({ params }) => (params.payload
    ? { ok: true, payload: { ...periodParts(params), payload: params.payload } }
    : { ok: false, error: 'PAYLOAD_REQUIRED', hint: 'Pass the GSTN GSTR-1 JSON as params.payload (see export_gstr1_json).' }),
};

const ADAPTERS = {
  ...EWB_ADAPTERS,

  gst_save_gstr3b: async ({ client, params }) => {
    const { year, month } = periodParts(params);
    if (!params.payload) return { ok: false, error: 'PAYLOAD_REQUIRED' };
    const res = await client.saveGstr3b({ year, month, payload: params.payload });
    return portalError(res) || fromClient(res, { saved: true, referenceId: res.data?.data?.data?.reference_id || res.data?.data?.reference_id || '' });
  },

  gst_gstr3b_liability: async ({ client, params }) => {
    const { year, month } = periodParts(params);
    const res = await client.gstr3bAutoLiability(year, month);
    const inner = res.data?.data?.data || null;
    return portalError(res) || fromClient(res, { liability: inner, ledgerIds: ledgerIdsOf(inner) });
  },

  gst_gstr3b_offset: async ({ client, params }) => {
    const { year, month } = periodParts(params);
    if (!params.payload) return { ok: false, error: 'PAYLOAD_REQUIRED' };
    const res = await client.offsetGstr3bLiability({ year, month, payload: params.payload });
    return portalError(res) || fromClient(res, { offset: true, message: String(res.data?.data?.data?.Message || res.data?.data?.data?.message || '') });
  },

  gst_file_gstr3b_evc: async ({ client, params }) => {
    const { year, month } = periodParts(params);
    if (!params.pan || !params.otp) return { ok: false, error: 'PAN_AND_EVC_OTP_REQUIRED' };
    if (!params.payload) return { ok: false, error: 'PAYLOAD_REQUIRED' };
    const res = await client.fileGstr3b({ year, month, pan: params.pan, otp: params.otp, payload: params.payload });
    return portalError(res) || fromClient(res, { filed: true, ackNum: res.data?.data?.data?.ack_num || res.data?.data?.ack_num || null });
  },

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

  gst_gstr1_processing: async ({ client, params }) => {
    const { year, month } = periodParts(params);
    if (!params.referenceId) return { ok: false, error: 'REFERENCE_REQUIRED' };
    const res = await client.returnProcessingStatus(year, month, params.referenceId);
    const inner = res.data?.data?.data || {};
    return fromClient(res, { action: String(inner.action || ''), status: String(inner.status_cd || ''), errorReport: inner.error_report || null });
  },

  gst_gstr1_proceed: async ({ client, params }) => {
    const { year, month } = periodParts(params);
    const res = await client.newProceedGstr1({ year, month, gstr: 'gstr-1', isNil: params.nil ? 'Y' : undefined });
    return fromClient(res, { submitted: true, referenceId: res.data?.data?.data?.reference_id || '' });
  },

  gst_gstr1_summary: async ({ client, params }) => {
    const { year, month } = periodParts(params);
    const res = await client.gstr1Summary(year, month);
    const inner = res.data?.data?.data || {};
    if (res.ok !== false && !Array.isArray(inner.sec_sum)) return { ok: false, error: 'SUMMARY_NOT_READY', hint: 'The portal has no GSTR-1 summary for the month yet; submit it first, then try again in a minute.' };
    return fromClient(res, { summary: { newSumFlag: inner.newSumFlag !== false, sec_sum: inner.sec_sum || [], chksum: String(inner.chksum || '') } });
  },

  gst_evc_otp: async ({ client, params }) => {
    if (!params.pan) return { ok: false, error: 'PAN_REQUIRED' };
    const res = await client.generateEvcOtp(params.pan, params.gstr === 'gstr-3b' ? 'gstr-3b' : 'gstr-1');
    return fromClient(res, { sent: true });
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
      const d = data.Data || {};
      if (built.invoice && d.Irn) {
        const prefix = res.environment === 'live' ? '' : 'sandbox';
        const field = (name) => (prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name);
        built.invoice[field('irn')] = d.Irn;
        built.invoice[field('ackNo')] = d.AckNo || built.invoice[field('ackNo')];
        built.invoice[field('ackDate')] = d.AckDt || built.invoice[field('ackDate')];
        built.invoice[field('signedQrCode')] = d.SignedQRCode || built.invoice[field('signedQrCode')];
      }
      return { ok: true, sandbox: res.environment !== 'live', data: { irn: d.Irn || null, ackNo: d.AckNo || null, ackDate: d.AckDt || null, signedQrCode: d.SignedQRCode || null, status: d.Status || 'ACT' } };
    }
    const err = res.error || data.ErrorDetails?.[0]?.ErrorMessage || data.error?.message || 'IRN_FAILED';
    return { ok: false, error: err, ...(res.message ? { hint: res.message } : {}), provider: data };
  },

  einvoice_cancel: async ({ client, params }) => {
    if (!params.irn) return { ok: false, error: 'IRN_REQUIRED' };
    const res = await client.cancelEinvoice({ irn: params.irn, reason: params.reason, remark: params.remark });
    const data = res.data?.data || {};
    if (res.ok && Number(data.Status) === 1) {
      return { ok: true, data: { cancelled: true, irn: data.Data?.Irn || params.irn, cancelDate: data.Data?.CancelDate || null } };
    }
    const err = res.error || data.ErrorDetails?.[0]?.ErrorMessage || data.error?.message || 'CANCEL_FAILED';
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
    hint: 'Use quicko_tax_check (Sandbox old and new regime calculators) to cross-check prepare_itr; prepare_itr stays the source of truth.',
  }),
};

export function adapterSupports(operationId) {
  return Boolean(ADAPTERS[operationId] || quickoOperation(operationId));
}

const MOCK_TAG = { mock: true, simulated: true };

const MOCK_ADAPTERS = {
  ...EWB_MOCK_ADAPTERS,

  gst_save_gstr3b: async ({ params }) => {
    const { year, month } = periodParts(params);
    if (!params.payload) return { ok: false, error: 'PAYLOAD_REQUIRED' };
    return { ok: true, ...MOCK_TAG, data: { saved: true, referenceId: `MOCK-GSTR3B-${year}-${String(month).padStart(2, '0')}` } };
  },

  gst_gstr3b_liability: async () => ({ ok: true, ...MOCK_TAG, data: { liability: { mock: true }, ledgerIds: {} } }),

  gst_gstr3b_offset: async ({ params }) => (params.payload ? { ok: true, ...MOCK_TAG, data: { offset: true, message: 'Payment of tax successfully done' } } : { ok: false, error: 'PAYLOAD_REQUIRED' }),

  gst_file_gstr3b_evc: async ({ params }) => {
    const { year, month } = periodParts(params);
    if (!params.pan || !params.otp) return { ok: false, error: 'PAN_AND_EVC_OTP_REQUIRED' };
    return { ok: true, ...MOCK_TAG, data: { filed: true, ackNum: `MOCK-ACK3B-${year}-${String(month).padStart(2, '0')}` } };
  },

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

  gst_gstr1_processing: async ({ params }) => (params.referenceId ? { ok: true, ...MOCK_TAG, data: { action: 'SAVE', status: 'P', errorReport: null } } : { ok: false, error: 'REFERENCE_REQUIRED' }),

  gst_gstr1_proceed: async ({ params }) => {
    const { year, month } = periodParts(params);
    return { ok: true, ...MOCK_TAG, data: { submitted: true, referenceId: `MOCK-PROCEED-${year}-${String(month).padStart(2, '0')}` } };
  },

  gst_gstr1_summary: async () => ({ ok: true, ...MOCK_TAG, data: { summary: { newSumFlag: true, sec_sum: [], chksum: 'MOCK-CHKSUM' } } }),

  gst_evc_otp: async ({ params }) => (params.pan ? { ok: true, ...MOCK_TAG, data: { sent: true } } : { ok: false, error: 'PAN_REQUIRED' }),

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

export async function runSandboxOperation({ operationId, actorId = '', actor = null, caApprovalId = '', params = {}, payloadSummary = {}, clientId = 'SELF', approvalSubject = null } = {}, deps = {}) {
  const operation = sandboxOperationById(operationId);
  if (!operation) return { ok: false, error: 'UNKNOWN_SANDBOX_OPERATION' };

  const state = deps.state;
  const endpoint = quickoOperation(operation.operationId);
  const adapter = endpoint ? (args) => catalogueAdapter({ ...args, endpoint }) : ADAPTERS[operation.operationId];
  const mockAdapter = endpoint ? (args) => catalogueMock({ ...args, endpoint }) : MOCK_ADAPTERS[operation.operationId];
  const requester = actor || { userId: actorId };
  const request = endpoint ? catalogueRequest(endpoint, params) : REQUEST_BUILDERS[operation.operationId]?.({ params, state }) || { ok: true, payload: params };
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
    ...(approvalSubject ? { approvalSubject } : {}),
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
