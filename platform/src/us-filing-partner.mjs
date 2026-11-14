// Embedded e-file partner route for US federal returns (the 2027 filing season).
//
// Owner decision 2026-11-11: file the 2027 season through a ready-made authorised e-file
// provider (Column Tax preferred, or April) under the MyCA brand, while MyCA's own EFIN and
// ATS testing run for 2028. MyCA prepares the return, shows the refund, takes the fee, and then
// hands the filer to the partner's hosted filing flow with everything it already knows filled
// in. The partner signs Form 8879 with the filer, transmits to the IRS as the ERO, and reports
// back through a signed webhook, so the 1040 hub shows submitted, accepted or rejected exactly
// as it does for MyCA's own MeF route.
//
// The partner's API is only published to signed partners. Everything provider-specific is kept
// in three places here (the session request, the session response and the webhook event) and
// is read leniently, so the adapter can be pointed at the real API with settings and a small
// change once the contract is signed. Until then the route runs against the simulator.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { loadEnvFile, productionCallsEnabled } from './runtime-config.mjs';
import { performExternalAction } from './action-gate.mjs';
import { normalizeClientId } from './books.mjs';
import { appendAuditEvent, stateDigest } from './ca-api.mjs';

export const PARTNERS = Object.freeze({
  'column-tax': Object.freeze({ label: 'Column Tax', site: 'https://www.columntax.com' }),
  april: Object.freeze({ label: 'April', site: 'https://www.getapril.com' }),
});

export const PARTNER_SIGNATURE_HEADER = 'x-myca-filer-signature';
const DEFAULT_SESSION_PATH = '/v1/sessions';
const SCOPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF = /^[0-9a-f]{24}$/;
const EXTERNAL_ID = /^myca\.([0-9a-f-]{36}|local)\.(\d{4})\.([0-9a-f]{24})$/i;
const TRUE_WORDS = new Set(['1', 'true', 'yes', 'on']);

function config(name) {
  return String(process.env[name] ?? loadEnvFile()[name] ?? '').trim();
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function partnerSettings() {
  const provider = config('MYCA_US_FILER').toLowerCase();
  return {
    provider,
    label: PARTNERS[provider]?.label || '',
    baseUrl: config('MYCA_US_FILER_BASE_URL').replace(/\/+$/, ''),
    sessionPath: config('MYCA_US_FILER_SESSION_PATH') || DEFAULT_SESSION_PATH,
    apiKey: config('MYCA_US_FILER_API_KEY'),
    webhookSecret: config('MYCA_US_FILER_WEBHOOK_SECRET'),
    sendTins: TRUE_WORDS.has(config('MYCA_US_FILER_SEND_TINS').toLowerCase()),
  };
}

export function partnerMissing(settings = partnerSettings()) {
  const missing = [];
  if (!Object.hasOwn(PARTNERS, settings.provider)) missing.push('MYCA_US_FILER');
  let url = null;
  try {
    url = new URL(settings.baseUrl);
  } catch {
    url = null;
  }
  if (!url || url.protocol !== 'https:' || url.username || url.password) missing.push('MYCA_US_FILER_BASE_URL');
  if (!settings.apiKey) missing.push('MYCA_US_FILER_API_KEY');
  if (settings.webhookSecret.length < 24) missing.push('MYCA_US_FILER_WEBHOOK_SECRET');
  return missing;
}

/** 'partner' when an embedded filer is chosen (MYCA_US_FILER is set), otherwise MyCA's own MeF route. */
export function efileRoute(settings = partnerSettings()) {
  return settings.provider ? 'partner' : 'mef';
}

/** live only with the production switch and every partner setting present. */
export function partnerMode(settings = partnerSettings()) {
  return productionCallsEnabled() && partnerMissing(settings).length === 0 ? 'live' : 'sandbox';
}

export function partnerSetup() {
  const settings = partnerSettings();
  const missing = partnerMissing(settings);
  return { route: efileRoute(settings), provider: settings.provider || null, label: settings.label || null, mode: partnerMode(settings), configured: missing.length === 0, missing, sendsTins: settings.sendTins };
}

function bookOf(state) {
  if (!state.usEfile || typeof state.usEfile !== 'object') state.usEfile = { returns: {}, submissionSeq: 0 };
  if (!state.usEfile.returns || typeof state.usEfile.returns !== 'object') state.usEfile.returns = {};
  return state.usEfile;
}

export function externalIdFor(scope, taxYear, ref) {
  const owner = SCOPE.test(String(scope || '')) ? String(scope).toLowerCase() : 'local';
  return `myca.${owner}.${taxYear}.${ref}`;
}

export function parseExternalId(value) {
  const m = EXTERNAL_ID.exec(String(value || ''));
  if (!m) return null;
  return { scope: m[1] === 'local' ? null : m[1].toLowerCase(), taxYear: Number(m[2]), ref: m[3].toLowerCase() };
}

const money = (value) => Math.round(Number(value) || 0);

function person(item, sendTins) {
  if (!item) return null;
  return {
    first_name: item.firstName || '',
    last_name: item.lastName || '',
    date_of_birth: item.dob || item.dateOfBirth || '',
    occupation: item.occupation || '',
    ...(sendTins && item.ssn ? { ssn: String(item.ssn) } : {}),
  };
}

/**
 * What MyCA already knows, in the partner's import shape. SSNs and ITINs are only included
 * when MYCA_US_FILER_SEND_TINS is on (the partner contract and the IRC 7216 consent must allow
 * it); otherwise the filer types them once in the partner's own flow.
 */
export function partnerPrefill(computed, { sendTins = false, contact = {} } = {}) {
  const lines = computed.lines || {};
  const forms = Array.isArray(computed.forms) ? computed.forms : [];
  return {
    tax_year: computed.taxYear,
    filing_status: computed.filingStatus,
    taxpayer: { ...person(computed.taxpayer, sendTins), ...(contact.email ? { email: contact.email } : {}), ...(contact.phone ? { phone: contact.phone } : {}) },
    spouse: person(computed.spouse, sendTins),
    dependents: (computed.dependents || []).map((item) => ({ ...person(item, sendTins), relationship: item.relationship || '', months_lived_with_you: item.months ?? null })),
    address: computed.address ? { line1: computed.address.line1 || '', line2: computed.address.line2 || '', city: computed.address.city || '', state: computed.address.state || '', zip: computed.address.zip || '' } : null,
    w2s: (computed.w2s || []).map((w) => ({
      owner: w.owner,
      employer_name: w.employerName || '',
      employer_ein: w.ein || '',
      wages: money(w.wages),
      federal_withheld: money(w.fedWithheld),
      social_security_wages: money(w.ssWages),
      social_security_withheld: money(w.ssWithheld),
      medicare_wages: money(w.medicareWages),
      medicare_withheld: money(w.medicareWithheld),
      state: w.state || '',
      state_wages: money(w.stateWages),
      state_withheld: money(w.stateWithheld),
    })),
    other_forms: forms.filter((f) => f.kind !== 'W-2').map((f) => ({ kind: f.kind, owner: f.owner, payer: f.payer || '', payer_tin: f.payerTin || '', fields: f.fields || {} })),
    digital_assets: computed.digitalAssets === true,
    myca_estimate: { adjusted_gross_income: money(lines['11']), total_tax: money(lines['24']), refund: money(lines['35a']), amount_owed: money(lines['37']) },
  };
}

function firstText(...values) {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim();
  return '';
}

/** Reads the partner's create-session response leniently: a URL to open and a session id. */
export function readSessionResponse(data = {}) {
  const d = data && typeof data === 'object' ? data : {};
  const inner = d.data && typeof d.data === 'object' ? d.data : {};
  const url = firstText(d.url, d.user_url, d.session_url, d.link, d.redirect_url, inner.url, inner.user_url, inner.session_url, inner.link);
  let handoffUrl = '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') handoffUrl = parsed.toString();
  } catch {
    handoffUrl = '';
  }
  return { handoffUrl, sessionId: firstText(d.id, d.session_id, d.user_id, inner.id, inner.session_id, inner.user_id).slice(0, 120) };
}

const STATUS_WORDS = [
  [/reject/i, 'rejected'],
  [/accept/i, 'accepted'],
  [/submit|transmit|e-?filed|filed/i, 'submitted'],
  [/start|creat|progress|open|resum/i, 'in_progress'],
];

/** Reads a partner webhook body leniently into { externalId, status, submissionId, errors, at }. */
export function normalizePartnerEvent(body = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const d = b.data && typeof b.data === 'object' ? b.data : {};
  const user = (b.user && typeof b.user === 'object' ? b.user : null) || (d.user && typeof d.user === 'object' ? d.user : {});
  const raw = firstText(d.status, b.status, d.return_status, b.event, b.type, b.event_type);
  const status = STATUS_WORDS.find(([re]) => re.test(raw))?.[1] || null;
  const errorList = [b.errors, d.errors, d.rejections, b.rejections].find(Array.isArray) || [];
  return {
    externalId: firstText(b.external_id, b.externalId, d.external_id, d.externalId, user.external_id, user.externalId),
    status,
    rawStatus: raw.slice(0, 80),
    submissionId: firstText(d.submission_id, b.submission_id, d.irs_submission_id, b.irs_submission_id).slice(0, 40),
    at: firstText(d.occurred_at, b.occurred_at, d.timestamp, b.timestamp, b.created_at),
    errors: errorList.slice(0, 50).map((e) => ({ ruleNumber: firstText(e?.rule_number, e?.ruleNumber, e?.code).slice(0, 40), message: firstText(e?.message, e?.description).slice(0, 500) })),
  };
}

/** HMAC-SHA256 of the raw body with MYCA_US_FILER_WEBHOOK_SECRET, hex, optionally "sha256=" prefixed. */
export function partnerSignatureValid(raw, header, secret = partnerSettings().webhookSecret) {
  if (!secret || secret.length < 24) return false;
  const given = String(header || '').trim().replace(/^sha256=/i, '');
  if (!/^[0-9a-f]{64}$/i.test(given)) return false;
  const expected = createHmac('sha256', secret).update(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw ?? ''), 'utf8')).digest();
  return timingSafeEqual(expected, Buffer.from(given, 'hex'));
}

export function signPartnerBody(raw, secret) {
  return createHmac('sha256', secret).update(raw).digest('hex');
}

function audit(state, action, beforeHash, metadata) {
  appendAuditEvent(state, { actorId: metadata.actorId || 'owner', clientId: normalizeClientId(state.activeClientId), action, beforeHash, afterHash: stateDigest(state), metadata });
}

async function createSession(settings, payload, { fetchImpl, signal }) {
  const res = await fetchImpl(`${settings.baseUrl}${settings.sessionPath.startsWith('/') ? '' : '/'}${settings.sessionPath}`, {
    method: 'POST',
    redirect: 'error',
    signal,
    headers: { authorization: `Bearer ${settings.apiKey}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return fail('FILER_SESSION_FAILED', { status: res.status, hint: `${settings.label || 'The e-file partner'} did not open a filing session. Try again in a minute.` });
  const session = readSessionResponse(data);
  if (!session.handoffUrl) return fail('FILER_SESSION_NO_URL', { hint: 'The e-file partner answered without a link to continue.' });
  return { ok: true, data: session };
}

/**
 * Start (or resume) filing a computed return with the embedded partner. `computed` is the
 * engine's filing shape (computedForm1040ForFiling). In the simulator the partner's answer is
 * immediate: the return is submitted and accepted, the way the MeF simulator behaves.
 */
export async function startPartnerFiling(state, { taxYear, computed, scope, contact } = {}, actor, options = {}) {
  const settings = options.settings || partnerSettings();
  const missing = partnerMissing(settings);
  const book = bookOf(state);
  const entry = book.returns[String(taxYear)] || { taxYear, submissions: [] };
  const latest = entry.submissions?.at(-1);
  if (latest?.status === 'accepted') return fail('ALREADY_ACCEPTED', { submissionId: latest.submissionId });
  if (latest?.status === 'submitted') return fail('ALREADY_SUBMITTED', { submissionId: latest.submissionId, hint: 'Wait for the IRS acknowledgement.' });
  const ref = REF.test(String(entry.partner?.ref || '')) ? entry.partner.ref : randomBytes(12).toString('hex');
  const externalId = externalIdFor(scope, taxYear, ref);
  const nowIso = options.now || new Date().toISOString();
  const beforeHash = stateDigest(state);
  const configured = missing.length === 0;
  const mode = productionCallsEnabled() && configured ? 'live' : 'sandbox';
  let session;
  if (configured) {
    const payload = { external_id: externalId, tax_year: taxYear, prefill: partnerPrefill(computed, { sendTins: settings.sendTins, contact }) };
    const got = await performExternalAction(state, {
      actionId: 'us_filer_session',
      actor,
      params: { taxYear, provider: settings.provider, externalId },
      clientId: normalizeClientId(state.activeClientId),
      metadata: { taxYear, provider: settings.provider },
      fixture: async () => ({ ok: true, data: { handoffUrl: '', sessionId: 'mock' } }),
    }, (transports, ctx) => createSession(settings, payload, { fetchImpl: options.fetchImpl || transports.usFiler.request, signal: ctx.signal }));
    if (!got.ok) return { ...got, route: 'partner', mode };
    session = got.data || {};
  } else {
    session = { handoffUrl: '', sessionId: `sim-${ref.slice(0, 8)}` };
  }
  entry.partner = { provider: settings.provider || 'simulator', ref, externalId, sessionId: session.sessionId || '', status: 'in_progress', startedAt: entry.partner?.startedAt || nowIso, lastOpenedAt: nowIso, mode };
  entry.submissions = entry.submissions || [];
  book.returns[String(taxYear)] = entry;
  audit(state, 'us_efile.partner_start', beforeHash, { actorId: actor?.userId, taxYear, provider: entry.partner.provider, mode, sentTins: Boolean(configured && settings.sendTins) });
  if (!configured) {
    applyPartnerEvent(state, { externalId, status: 'submitted', submissionId: `SIM${ref.slice(0, 17)}`.toUpperCase(), at: nowIso, errors: [] }, { now: nowIso });
    applyPartnerEvent(state, { externalId, status: 'accepted', at: nowIso, errors: [] }, { now: nowIso });
    return { ok: true, route: 'partner', provider: 'simulator', mode: 'sandbox', status: 'accepted', handoffUrl: null, simulated: true, missing };
  }
  return { ok: true, route: 'partner', provider: settings.provider, label: settings.label, mode, status: 'in_progress', handoffUrl: session.handoffUrl || null };
}

/**
 * Records a partner status event against the matching return. Events for another return,
 * repeated events and events that would move an accepted return backwards change nothing.
 */
export function applyPartnerEvent(state, event, options = {}) {
  const id = parseExternalId(event?.externalId);
  if (!id) return fail('FILER_EVENT_UNKNOWN_RETURN');
  if (!event.status) return fail('FILER_EVENT_STATUS_UNKNOWN', { rawStatus: event.rawStatus || '' });
  const entry = bookOf(state).returns[String(id.taxYear)];
  if (!entry?.partner || entry.partner.ref !== id.ref) return fail('FILER_EVENT_UNKNOWN_RETURN');
  const at = String(event.at || options.now || new Date().toISOString());
  const beforeHash = stateDigest(state);
  entry.submissions = entry.submissions || [];
  let latest = entry.submissions.at(-1);
  const partnerOpen = latest && latest.transport === 'partner' && latest.status !== 'rejected';
  if (latest?.status === 'accepted') return { ok: true, changed: false, status: 'accepted' };
  if (event.status === 'in_progress') {
    if (entry.partner.status === 'in_progress') return { ok: true, changed: false, status: 'in_progress' };
    entry.partner.status = 'in_progress';
  } else {
    if (!partnerOpen) {
      latest = { submissionId: event.submissionId || `${entry.partner.provider}-${id.ref.slice(0, 8)}-${entry.submissions.length + 1}`, taxYear: id.taxYear, mode: entry.partner.mode || 'sandbox', transport: 'partner', provider: entry.partner.provider, submittedAt: at, status: 'submitted', ack: null };
      entry.submissions.push(latest);
    } else if (event.submissionId && !latest.submissionId.startsWith('SIM')) latest.submissionId = event.submissionId;
    if (event.status === 'submitted') {
      if (partnerOpen) return { ok: true, changed: false, status: latest.status };
    } else {
      latest.status = event.status;
      latest.ack = { status: event.status, statusDate: at.slice(0, 10), acknowledgedAt: at, errors: event.status === 'rejected' ? (event.errors || []).map((e) => ({ ruleNumber: String(e.ruleNumber || ''), severity: 'Reject', message: String(e.message || ''), xpath: '' })) : [] };
    }
    entry.partner.status = event.status;
  }
  audit(state, 'us_efile.partner_event', beforeHash, { taxYear: id.taxYear, provider: entry.partner.provider, status: event.status });
  return { ok: true, changed: true, status: event.status, taxYear: id.taxYear };
}
