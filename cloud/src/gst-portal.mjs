import { SandboxClient } from '../../platform/src/sandbox-client.mjs';
import { withProviderContext } from '../../platform/src/provider-context.mjs';
import { providerEnvironment, serviceProviderEnvironment, mockModeEnabled } from '../../platform/src/runtime-config.mjs';
import { regArg } from '../../platform/src/registrations.mjs';
import { saveGstr1ToPortal, checkGstr1OnPortal, submitGstr1OnPortal, gstr1PortalSummary, requestGstr1Evc, fileGstr1OnPortal, portalStatus } from '../../platform/src/portal-filing.mjs';
import { sealSecrets, openSecrets } from './connectors.mjs';
import { modeOf } from './govt-connectors.mjs';

const GSTIN = /^[0-9]{2}[A-Z0-9]{13}$/;
const USERNAME = /^[A-Za-z0-9._@-]{3,60}$/;
const SIX_HOURS = 6 * 3600 * 1000;
const REFRESH_AHEAD_MS = 90 * 60 * 1000;
const USE_AHEAD_MS = 10 * 60 * 1000;
const REFRESH_BATCH = 200;
const ENDED = new Set(['AUTH4037', 'AUTH4042', 'AUTH4033']);
const STEPS = ['save', 'check', 'submit', 'summary', 'otp', 'file'];

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function gstinOf(value) {
  return String(value || '').trim().toUpperCase();
}

function expiryOf(res, now) {
  const inner = res?.data?.data || {};
  const at = Number(inner.token_expiry || inner.session_expiry || 0);
  return new Date(at > now ? at : now + SIX_HOURS);
}

function providerError(res) {
  return fail(String(res?.error || 'GSP_CALL_FAILED'), res?.message ? { hint: res.message } : {});
}

function serviceMode(env) {
  return String(env.MYCA_GSP_ENV || '').trim().toLowerCase() === 'live' ? 'live' : 'test';
}

export function createGstPortal({ db, connectors, withBooks, billing = null, key = '', env = process.env, fetchFn = null, now = () => Date.now() }) {
  const sealing = key.length >= 32;

  async function keysFor(businessId) {
    const own = await connectors.load(businessId, 'quicko');
    if (own && own.enabled !== false && own.apiKey && own.apiSecret) {
      return { mode: modeOf(own), sandbox: { apiKey: own.apiKey, apiSecret: own.apiSecret, environment: own.environment }, source: 'business' };
    }
    return { mode: serviceMode(env), sandbox: {}, source: 'service' };
  }

  function contextFor(keys, session = null) {
    return {
      environment: keys.mode,
      sandbox: {
        ...keys.sandbox,
        ...(session?.token ? { taxpayerToken: session.token, taxpayerExpiresAt: session.expiresAt?.getTime() || 0 } : {}),
        ...(fetchFn ? { fetchFn } : {}),
      },
    };
  }

  function clientFor() {
    return new SandboxClient(fetchFn ? { fetchFn } : {});
  }

  async function sessionRow(businessId, gstin) {
    const found = await db.query(
      `select gstin, username, token, token_expires_at as "expiresAt", otp_sent_at as "otpSentAt", connected_at as "connectedAt", refreshed_at as "refreshedAt", last_error as "lastError"
         from gst_portal_sessions where business_id = $1 and gstin = $2`,
      [businessId, gstin],
    );
    const row = found.rows[0];
    if (!row) return null;
    const token = row.token ? String(openSecrets(key, businessId, row.token).token || '') : '';
    return { ...row, token };
  }

  function publicSession(row) {
    const at = now();
    const expiresAt = row.expiresAt ? new Date(row.expiresAt) : null;
    const connected = Boolean(row.token) && Boolean(expiresAt) && expiresAt.getTime() > at;
    return {
      gstin: row.gstin,
      username: row.username,
      connected,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      connectedAt: row.connectedAt ? new Date(row.connectedAt).toISOString() : null,
      refreshedAt: row.refreshedAt ? new Date(row.refreshedAt).toISOString() : null,
      waitingForOtp: !connected && Boolean(row.otpSentAt),
      needsReconnect: !connected && Boolean(row.connectedAt),
      lastError: row.lastError || '',
    };
  }

  async function audit(businessId, ctx, action, metadata) {
    await db.query(
      `insert into audit_log (business_id, user_id, device_id, request_id, action, metadata) values ($1, $2, $3, $4, $5, $6::jsonb)`,
      [businessId, ctx?.userId || null, ctx?.deviceId || null, ctx?.requestId || '', action, JSON.stringify(metadata)],
    );
  }

  async function storeToken(businessId, gstin, token, expiresAt, { connectedBy = null, refreshed = false } = {}) {
    const sealed = sealSecrets(key, businessId, { token });
    if (refreshed) {
      await db.query(`update gst_portal_sessions set token = $3, token_expires_at = $4, refreshed_at = now(), last_error = '' where business_id = $1 and gstin = $2`, [businessId, gstin, sealed, expiresAt]);
      return;
    }
    await db.query(
      `update gst_portal_sessions set token = $3, token_expires_at = $4, connected_by = $5, connected_at = now(), refreshed_at = null, otp_sent_at = null, last_error = '' where business_id = $1 and gstin = $2`,
      [businessId, gstin, sealed, expiresAt, connectedBy],
    );
  }

  async function endSession(businessId, gstin, error) {
    await db.query(`update gst_portal_sessions set token = '', token_expires_at = null, last_error = $3 where business_id = $1 and gstin = $2`, [businessId, gstin, String(error || '').slice(0, 200)]);
  }

  function ready(keys) {
    if (mockModeEnabled()) return null;
    if (!sealing) return fail('GST_PORTAL_UNAVAILABLE', { hint: 'The service has no connector key; ask the operator to set MYCA_CONNECTOR_KEY.' });
    return withProviderContext(contextFor(keys), () => {
      if (providerEnvironment() === 'off') return fail('GST_PORTAL_OFF', { hint: 'Calls to the GST portal are switched off on this service.' });
      if (!clientFor().isConfigured()) return fail('GSP_KEYS_MISSING', { hint: 'The service has no Sandbox by Quicko API key yet (MYCA_GSP_API_KEY and MYCA_GSP_API_SECRET).' });
      return null;
    });
  }

  async function registered(businessId, ctx, gstin) {
    return withBooks(businessId, ctx, async (session) => {
      const reg = regArg(session.state, gstin);
      if (!reg.ok) return reg;
      if (!reg.gstin) return fail('GSTIN_REQUIRED', { hint: 'Add the business GSTIN first.' });
      return { ok: true, gstin: reg.gstin };
    });
  }

  async function refreshOne(businessId, row, keys) {
    if (mockModeEnabled()) {
      const expiresAt = new Date(now() + SIX_HOURS);
      await storeToken(businessId, row.gstin, row.token, expiresAt, { refreshed: true });
      return { ok: true, expiresAt };
    }
    const res = await withProviderContext(contextFor(keys, row), () => {
      const client = clientFor();
      return client.refreshTaxpayerSession().then((out) => ({ out, token: client.taxpayerToken }));
    });
    if (!res.out.ok) {
      if (ENDED.has(String(res.out.error))) await endSession(businessId, row.gstin, res.out.error);
      return providerError(res.out);
    }
    const expiresAt = expiryOf(res.out, now());
    await storeToken(businessId, row.gstin, res.token, expiresAt, { refreshed: true });
    return { ok: true, expiresAt };
  }

  async function liveSession(businessId, gstin, keys) {
    const row = await sessionRow(businessId, gstin);
    if (!row || !row.token || !row.expiresAt) return fail('GST_PORTAL_NOT_CONNECTED', { gstin, hint: 'Connect the GST portal for this GSTIN first: enable API access on gst.gov.in, then verify the OTP here.' });
    const expiresAt = new Date(row.expiresAt);
    if (expiresAt.getTime() <= now()) {
      await endSession(businessId, gstin, 'SESSION_EXPIRED');
      return fail('GST_PORTAL_SESSION_ENDED', { gstin, hint: 'The GST portal session ended; ask for a new OTP to reconnect.' });
    }
    if (expiresAt.getTime() - now() < USE_AHEAD_MS) {
      const refreshed = await refreshOne(businessId, row, keys);
      if (refreshed.ok) return { ok: true, row: await sessionRow(businessId, gstin) };
    }
    return { ok: true, row: { ...row, expiresAt } };
  }

  async function status(businessId) {
    const keys = await keysFor(businessId);
    const rows = await db.query(
      `select gstin, username, token, token_expires_at as "expiresAt", otp_sent_at as "otpSentAt", connected_at as "connectedAt", refreshed_at as "refreshedAt", last_error as "lastError"
         from gst_portal_sessions where business_id = $1 order by gstin`,
      [businessId],
    );
    const blocked = ready(keys);
    return {
      ok: true,
      available: !blocked,
      ...(blocked ? { reason: blocked.error } : {}),
      mode: withProviderContext(contextFor(keys), () => providerEnvironment()),
      serviceMode: serviceProviderEnvironment(),
      simulated: mockModeEnabled(),
      keys: keys.source,
      sessions: rows.rows.map(publicSession),
    };
  }

  async function sendOtp(businessId, ctx, actor, body) {
    const keys = await keysFor(businessId);
    const blocked = ready(keys);
    if (blocked) return blocked;
    const username = String(body.username || '').trim();
    if (!USERNAME.test(username)) return fail('USERNAME_REQUIRED', { hint: 'Enter the GST portal username of this GSTIN.' });
    const wanted = gstinOf(body.gstin);
    if (wanted && !GSTIN.test(wanted)) return fail('GSTIN_REQUIRED');
    const reg = await registered(businessId, ctx, wanted);
    if (!reg.ok) return reg;
    if (!mockModeEnabled()) {
      const res = await withProviderContext(contextFor(keys), () => clientFor().generateTaxpayerOtp(username, reg.gstin));
      if (!res.ok) return providerError(res);
    }
    await db.query(
      `insert into gst_portal_sessions (business_id, gstin, username, otp_sent_at) values ($1, $2, $3, now())
       on conflict (business_id, gstin) do update set username = excluded.username, otp_sent_at = now(), last_error = ''`,
      [businessId, reg.gstin, username],
    );
    await audit(businessId, ctx, 'gst_portal.otp_sent', { gstin: reg.gstin, mode: keys.mode, simulated: mockModeEnabled() });
    return { ok: true, gstin: reg.gstin, otpSent: true, simulated: mockModeEnabled(), hint: 'The GST portal sent an OTP to the phone and email registered for this GSTIN.' };
  }

  async function verifyOtp(businessId, ctx, actor, body) {
    const keys = await keysFor(businessId);
    const blocked = ready(keys);
    if (blocked) return blocked;
    const otp = String(body.otp || '').trim();
    if (!/^\d{6}$/.test(otp)) return fail('OTP_REQUIRED', { hint: 'Enter the six-digit OTP from the GST portal.' });
    const reg = await registered(businessId, ctx, gstinOf(body.gstin));
    if (!reg.ok) return reg;
    const row = await sessionRow(businessId, reg.gstin);
    if (!row || !row.otpSentAt) return fail('OTP_NOT_REQUESTED', { hint: 'Ask for the OTP first.' });
    let token = 'SIMULATED-TAXPAYER-SESSION';
    let expiresAt = new Date(now() + SIX_HOURS);
    if (!mockModeEnabled()) {
      const out = await withProviderContext(contextFor(keys), async () => {
        const client = clientFor();
        const res = await client.verifyTaxpayerOtp(row.username, reg.gstin, otp);
        return { res, token: client.taxpayerToken };
      });
      if (!out.res.ok || !out.token) {
        await db.query('update gst_portal_sessions set last_error = $3 where business_id = $1 and gstin = $2', [businessId, reg.gstin, String(out.res.error || 'OTP_REFUSED').slice(0, 200)]);
        return out.res.ok ? fail('OTP_REFUSED') : providerError(out.res);
      }
      token = out.token;
      expiresAt = expiryOf(out.res, now());
    }
    await storeToken(businessId, reg.gstin, token, expiresAt, { connectedBy: ctx?.userId || null });
    await audit(businessId, ctx, 'gst_portal.connected', { gstin: reg.gstin, mode: keys.mode, expiresAt: expiresAt.toISOString(), simulated: mockModeEnabled() });
    return { ok: true, ...publicSession(await sessionRow(businessId, reg.gstin)), simulated: mockModeEnabled() };
  }

  async function disconnect(businessId, ctx, actor, body) {
    const wanted = gstinOf(body.gstin);
    if (!GSTIN.test(wanted)) return fail('GSTIN_REQUIRED');
    const gone = await db.query('delete from gst_portal_sessions where business_id = $1 and gstin = $2', [businessId, wanted]);
    if (gone.rowCount) await audit(businessId, ctx, 'gst_portal.disconnected', { gstin: wanted });
    return { ok: true, gstin: wanted, disconnected: gone.rowCount > 0 };
  }

  async function connection(businessId, ctx, actor, body = {}) {
    const step = String(body.step || '');
    if (step === 'otp') return sendOtp(businessId, ctx, actor, body);
    if (step === 'verify') return verifyOtp(businessId, ctx, actor, body);
    if (step === 'disconnect') return disconnect(businessId, ctx, actor, body);
    return fail('UNKNOWN_STEP', { steps: ['otp', 'verify', 'disconnect'] });
  }

  async function gstr1(businessId, ctx, actor, body = {}) {
    const step = String(body.step || '');
    if (!STEPS.includes(step)) return fail('UNKNOWN_STEP', { steps: STEPS });
    if (billing) {
      const allowed = await billing.allows(businessId, 'gst-returns');
      if (!allowed.ok) return allowed;
    }
    const keys = await keysFor(businessId);
    const blocked = ready(keys);
    if (blocked) return blocked;
    const wanted = gstinOf(body.gstin);
    const reg = await registered(businessId, ctx, wanted);
    if (!reg.ok) return reg;
    let row = null;
    if (!mockModeEnabled()) {
      const live = await liveSession(businessId, reg.gstin, keys);
      if (!live.ok) return live;
      row = live.row;
    }
    const args = { period: String(body.period || '').trim(), gstin: reg.gstin, otp: body.otp, pan: body.pan, actorId: actor.actor.userId, role: actor.actor.role };
    const out = await withProviderContext(contextFor(keys, row), () => withBooks(businessId, ctx, async (session) => {
      const run = {
        save: saveGstr1ToPortal,
        check: checkGstr1OnPortal,
        submit: submitGstr1OnPortal,
        summary: gstr1PortalSummary,
        otp: requestGstr1Evc,
        file: fileGstr1OnPortal,
      }[step];
      const result = await run(session.state, args, actor.actor);
      if (result.ok || step === 'check') session.persist();
      return { ...result, mode: providerEnvironment(), simulated: mockModeEnabled() };
    }));
    if (!out.ok && ENDED.has(String(out.error))) await endSession(businessId, reg.gstin, out.error);
    await audit(businessId, ctx, `gst_portal.gstr1_${step}`, { gstin: reg.gstin, period: args.period, ok: out.ok === true, error: out.ok ? '' : String(out.error || ''), simulated: mockModeEnabled() });
    return out;
  }

  async function filings(businessId, ctx) {
    return withBooks(businessId, ctx, async (session) => portalStatus(session.state));
  }

  async function refreshDue() {
    const cutoff = new Date(now() + REFRESH_AHEAD_MS);
    const due = await db.query(
      `select business_id as "businessId", gstin from gst_portal_sessions
        where token <> '' and token_expires_at > $2 and token_expires_at <= $1
        order by token_expires_at limit ${REFRESH_BATCH}`,
      [cutoff, new Date(now())],
    );
    const summary = { checked: 0, refreshed: 0, ended: 0, failed: 0 };
    for (const item of due.rows) {
      summary.checked += 1;
      try {
        const keys = await keysFor(item.businessId);
        if (ready(keys)) {
          summary.failed += 1;
          continue;
        }
        const row = await sessionRow(item.businessId, item.gstin);
        if (!row?.token) continue;
        const out = await refreshOne(item.businessId, row, keys);
        if (out.ok) summary.refreshed += 1;
        else if (ENDED.has(String(out.error))) summary.ended += 1;
        else summary.failed += 1;
      } catch {
        summary.failed += 1;
      }
    }
    const lapsed = await db.query(`update gst_portal_sessions set token = '', token_expires_at = null, last_error = 'SESSION_EXPIRED' where token <> '' and token_expires_at <= $1`, [new Date(now())]);
    summary.ended += lapsed.rowCount || 0;
    return summary;
  }

  return { status, connection, gstr1, filings, refreshDue };
}
