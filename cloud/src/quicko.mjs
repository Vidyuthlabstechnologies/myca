import { SandboxClient } from '../../platform/src/sandbox-client.mjs';
import { withProviderContext } from '../../platform/src/provider-context.mjs';
import { providerEnvironment, mockModeEnabled } from '../../platform/src/runtime-config.mjs';
import { quickoOperation } from '../../platform/src/sandbox-endpoints.mjs';
import { sealSecrets, openSecrets } from './connectors.mjs';
import { modeOf } from './govt-connectors.mjs';

export const QUICKO_HOSTED_TOOLS = Object.freeze(new Set([
  'quicko_catalog', 'read_form16', 'read_form26as', 'capital_gains_pnl', 'quicko_tax_check', 'verify_pan', 'pan_aadhaar_status',
  'check_206ab', 'search_tan', 'lookup_ifsc', 'verify_bank_account', 'mca_company', 'gstins_for_pan',
]));

const KINDS = Object.freeze({
  itd: { kind: 'itd_taxpayer', login: 'quicko_it_compliance_portal_tax_payer_authorize', logout: 'quicko_itd_portal_tax_payer_logout' },
  traces: { kind: 'traces_deductor', login: 'quicko_tds_traces_deductors_authenticate', logout: null },
});

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const TAN = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
const DEFAULT_SESSION_MS = 60 * 60 * 1000;

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function serviceMode(env) {
  return String(env.MYCA_GSP_ENV || '').trim().toLowerCase() === 'live' ? 'live' : 'test';
}

export function createQuicko({ db, connectors, withBooks, key = '', env = process.env, fetchFn = null, now = () => Date.now() }) {
  const sealing = key.length >= 32;

  async function keysFor(businessId) {
    const own = await connectors.load(businessId, 'quicko');
    if (own && own.enabled !== false && own.apiKey && own.apiSecret) {
      return { mode: modeOf(own), sandbox: { apiKey: own.apiKey, apiSecret: own.apiSecret, environment: own.environment } };
    }
    return { mode: serviceMode(env), sandbox: {} };
  }

  function contextFor(keys, extra = {}) {
    return { environment: keys.mode, sandbox: { ...keys.sandbox, ...(fetchFn ? { fetchFn } : {}), ...extra } };
  }

  function blocked(keys) {
    if (mockModeEnabled()) return null;
    return withProviderContext(contextFor(keys), () => {
      if (providerEnvironment() === 'off') return fail('QUICKO_OFF', { hint: 'Calls to Sandbox by Quicko are switched off on this service.' });
      if (!new SandboxClient(fetchFn ? { fetchFn } : {}).isConfigured()) return fail('GSP_KEYS_MISSING', { hint: 'The service has no Sandbox by Quicko API key yet.' });
      return null;
    });
  }

  async function audit(businessId, ctx, action, metadata) {
    await db.query(
      `insert into audit_log (business_id, user_id, device_id, request_id, action, metadata) values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [businessId, ctx?.userId || null, ctx?.deviceId || null, ctx?.requestId || '', action, JSON.stringify(metadata)],
    );
  }

  async function sessionsOf(businessId) {
    if (!sealing) return {};
    const found = await db.query(`select kind, subject, token, token_expires_at as "expiresAt" from quicko_portal_sessions where business_id = $1`, [businessId]);
    const out = {};
    for (const row of found.rows) {
      const opened = row.token ? openSecrets(key, businessId, row.token) : {};
      const expiresAt = row.expiresAt ? new Date(row.expiresAt).getTime() : 0;
      if (opened.token && (!expiresAt || expiresAt > now())) out[row.kind] = { token: String(opened.token), refreshToken: String(opened.refreshToken || ''), expiresAt };
    }
    return out;
  }

  async function keep(businessId, kind, session, { subject = null, connectedBy = null } = {}) {
    if (!session) {
      await db.query('delete from quicko_portal_sessions where business_id = $1 and kind = $2', [businessId, kind]);
      return;
    }
    const sealed = sealSecrets(key, businessId, { token: session.token, refreshToken: session.refreshToken || '' });
    const expiresAt = new Date(session.expiresAt || now() + DEFAULT_SESSION_MS);
    await db.query(
      `insert into quicko_portal_sessions (business_id, kind, subject, token, token_expires_at, connected_by)
         values ($1, $2, coalesce($3, ''), $4, $5, $6)
       on conflict (business_id, kind) do update set token = excluded.token, token_expires_at = excluded.token_expires_at,
         subject = coalesce($3, quicko_portal_sessions.subject), refreshed_at = now()`,
      [businessId, kind, subject, sealed, expiresAt, connectedBy],
    );
  }

  async function status(businessId) {
    const rows = await db.query(`select kind, subject, token_expires_at as "expiresAt", connected_at as "connectedAt" from quicko_portal_sessions where business_id = $1`, [businessId]);
    return {
      ok: true,
      available: sealing || mockModeEnabled(),
      simulated: mockModeEnabled(),
      tools: [...QUICKO_HOSTED_TOOLS],
      sessions: rows.rows.map((row) => ({
        portal: row.kind === 'itd_taxpayer' ? 'itd' : 'traces',
        subject: row.subject,
        connected: Boolean(row.expiresAt) && new Date(row.expiresAt).getTime() > now(),
        expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
        connectedAt: row.connectedAt ? new Date(row.connectedAt).toISOString() : null,
      })),
    };
  }

  async function connect(businessId, ctx, body = {}) {
    const portal = Object.hasOwn(KINDS, body.portal) ? KINDS[body.portal] : null;
    if (!portal) return fail('UNKNOWN_PORTAL', { portals: Object.keys(KINDS) });
    if (!sealing && !mockModeEnabled()) return fail('QUICKO_SESSIONS_UNAVAILABLE', { hint: 'The service has no connector key; ask the operator to set MYCA_CONNECTOR_KEY.' });
    if (body.step === 'disconnect') {
      await keep(businessId, portal.kind, null);
      await audit(businessId, ctx, 'quicko.session.disconnected', { portal: body.portal });
      return { ok: true, portal: body.portal, disconnected: true };
    }
    const password = String(body.password || '');
    if (!password) return fail('PASSWORD_REQUIRED');
    let subject;
    let request;
    if (body.portal === 'itd') {
      subject = String(body.pan || '').trim().toUpperCase();
      if (!PAN.test(subject)) return fail('INVALID_PAN');
      request = { body: { pan: subject, password } };
    } else {
      subject = String(body.tan || '').trim().toUpperCase();
      if (!TAN.test(subject)) return fail('INVALID_TAN');
      const pan = String(body.pan || '').trim().toUpperCase();
      if (pan && !PAN.test(pan)) return fail('INVALID_PAN');
      request = { body: { '@entity': quickoOperation(portal.login).entity, tan: subject, password, ...(pan ? { pan } : {}) } };
    }
    const keys = await keysFor(businessId);
    const stop = blocked(keys);
    if (stop) return stop;
    let session = { token: 'SIMULATED-PORTAL-SESSION', expiresAt: now() + DEFAULT_SESSION_MS };
    if (!mockModeEnabled()) {
      const captured = [];
      const res = await withProviderContext(contextFor(keys, { onSession: (kind, value) => captured.push([kind, value]) }), () => new SandboxClient(fetchFn ? { fetchFn } : {}).callEndpoint(portal.login, request));
      const found = captured.find(([kind, value]) => kind === portal.kind && value?.token);
      if (!res.ok || !found) {
        await audit(businessId, ctx, 'quicko.session.refused', { portal: body.portal, error: String(res.error || 'NO_TOKEN') });
        return fail(String(res.error || 'PORTAL_SIGN_IN_REFUSED'), res.status ? { status: res.status } : {});
      }
      session = found[1];
    }
    await keep(businessId, portal.kind, session, { subject, connectedBy: ctx?.userId || null });
    await audit(businessId, ctx, 'quicko.session.connected', { portal: body.portal, subject, simulated: mockModeEnabled() });
    return { ok: true, portal: body.portal, subject, connected: true, simulated: mockModeEnabled() };
  }

  async function run(businessId, ctx, actor, body = {}) {
    const tool = String(body.tool || '');
    const args = body.args && typeof body.args === 'object' && !Array.isArray(body.args) ? body.args : {};
    if (tool === 'sandbox_operation') {
      const operation = quickoOperation(args.operationId);
      if (!operation) return fail('UNKNOWN_OPERATION', { hint: 'Use quicko_catalog to find the operationId.' });
      if (operation.actionClass !== 'read') return fail('NOT_FROM_THE_APP', { hint: 'Filing, payment, OTP and sign-in calls are not run from the app yet; use the desktop app with a CA approval.' });
    } else if (!QUICKO_HOSTED_TOOLS.has(tool)) {
      return fail('UNKNOWN_TOOL', { tools: [...QUICKO_HOSTED_TOOLS, 'sandbox_operation'] });
    }
    const keys = await keysFor(businessId);
    const stop = tool === 'quicko_catalog' ? null : blocked(keys);
    if (stop) return stop;
    const sessions = await sessionsOf(businessId);
    const changed = [];
    const hashes = [args.documentSha256, args.jobInputSha256].filter((value) => typeof value === 'string');
    const out = await withProviderContext(contextFor(keys, { sessions, onSession: (kind, value) => changed.push([kind, value]) }), () => withBooks(businessId, ctx, async (session) => {
      const result = await session.tool(tool, { ...args, actorId: actor.actor.userId, role: actor.actor.role }, actor);
      return { ...result, mode: providerEnvironment(), simulated: mockModeEnabled() };
    }, { hashes }));
    for (const [kind, value] of changed) if (kind !== 'gst_taxpayer') await keep(businessId, kind, value);
    if (tool !== 'quicko_catalog') await audit(businessId, ctx, 'quicko.call', { tool, operationId: tool === 'sandbox_operation' ? String(args.operationId) : '', ok: out.ok === true, error: out.ok ? '' : String(out.error || '') });
    return out;
  }

  return { status, connect, run };
}
