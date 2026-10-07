import { randomUUID } from 'node:crypto';
import { liveCallsEnabled } from '../../platform/src/runtime-config.mjs';
import { gstin } from '../../platform/src/sprint-load.mjs';
import { rule } from '../../sprints/statutory-rules/src/index.mjs';
import { createAuth, isUuid } from './auth.mjs';
import { createBusinesses, engineRole } from './businesses.mjs';
import { createBooksRunner } from './books-runner.mjs';
import { createMembers } from './members.mjs';
import { IMPORT_CONTENT_ARG, isImport } from '../../platform/src/import-documents.mjs';
import { assertSecret } from './tokens.mjs';
import { createCrashReports } from './crash-reports.mjs';
import { PRIVACY_NOTICE, consentExempt, createConsent } from './consent.mjs';
import { createGoogleKeys, createGoogleVerifier } from './google.mjs';

const MAX_BODY_BYTES = 1024 * 1024;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_CRASH_BYTES = 64 * 1024;

export const PROPOSABLE = new Set(['create_invoice', 'create_purchase', 'record_receipt', 'record_payment', 'post_expense', 'set_expense_head', 'create_credit_note', 'cancel_invoice', 'gst_review_answer', 'add_reminder', 'complete_reminder', 'set_cash_balance', 'set_payment_terms', 'ask_ca', 'reply_ca', 'close_ca', 'create_quote', 'mark_quote', 'convert_quote', 'exception_decide']);

const NOT_A_PLACE_OF_BUSINESS = new Set(['97', '99']);

export function businessStates(onDate) {
  const current = rule('gst.gstin.state-codes', onDate);
  const codes = current.ok ? current.value : [];
  return codes
    .filter((code) => !NOT_A_PLACE_OF_BUSINESS.has(code) && gstin.STATE_CODES[code])
    .map((code) => ({ code, name: gstin.STATE_CODES[code] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function httpError(statusCode, error, extra = {}) {
  const err = new Error(error);
  err.statusCode = statusCode;
  err.body = { ok: false, error, ...extra };
  return err;
}

function readJson(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > limit) {
        reject(httpError(413, 'BODY_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
      } catch {
        reject(httpError(400, 'INVALID_JSON'));
      }
    });
  });
}

function bearer(req) {
  const match = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
  return match ? match[1] : '';
}

function statusOf(result) {
  if (!result || result.ok !== false) return 200;
  if (result.error === 'TOO_MANY_REQUESTS' || result.error === 'TOO_MANY_ATTEMPTS') return 429;
  if (result.error === 'OWNER_ONLY') return 403;
  if (result.error === 'PHONE_SIGN_IN_UNAVAILABLE' || result.error === 'GOOGLE_SIGN_IN_UNAVAILABLE') return 503;
  if (result.error === 'GOOGLE_UNREACHABLE') return 502;
  if (result.error === 'INVITATION_NOT_FOUND' || result.error === 'MEMBER_NOT_FOUND') return 404;
  return 400;
}

function appSnapshot(snapshot, user, role) {
  return {
    ok: true,
    company: snapshot.company,
    invoices: snapshot.invoices,
    purchases: snapshot.purchases,
    role,
    user: { id: user.userId, name: user.name },
  };
}

export function createApi({ db, secret, otpSender = null, googleClientIds = [], googleKeys, now = () => Date.now(), log = () => {}, version = 'dev' }) {
  assertSecret(secret);
  if (liveCallsEnabled()) throw new Error('the hosted API must not start with live provider calls enabled');
  const auth = createAuth({ db, secret, otpSender, now });
  const businesses = createBusinesses({ db, now });
  const withBooks = createBooksRunner({ db });
  const members = createMembers({ db, secret, now });
  const crashes = createCrashReports({ db, now });
  const consent = createConsent({ db, now });
  const google = createGoogleVerifier({ clientIds: googleClientIds, keys: googleKeys || createGoogleKeys({ now }), now });
  if (!otpSender && !google.enabled) throw new Error('no sign-in method: configure an SMS sender or MYCA_GOOGLE_CLIENT_IDS');

  async function withConsent(signedIn) {
    return signedIn.ok && signedIn.user ? { ...signedIn, consent: await consent.status(signedIn.user.id) } : signedIn;
  }

  async function signedIn(req) {
    const who = await auth.authenticate(bearer(req));
    if (!who.ok) throw httpError(401, 'UNAUTHENTICATED', { reason: who.error });
    return who;
  }

  async function member(user, businessId) {
    const membership = await businesses.membership(user.userId, businessId);
    if (!membership) throw httpError(404, 'BUSINESS_NOT_FOUND');
    return membership.role;
  }

  async function route(req, requestId) {
    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    const method = req.method;
    if (parts[0] !== 'v1') throw httpError(404, 'NOT_FOUND');

    if (parts[1] === 'health' && method === 'GET') return { ok: true };
    if (parts[1] === 'privacy-notice' && parts.length === 2 && method === 'GET') return { ok: true, notice: PRIVACY_NOTICE };
    if (parts[1] === 'auth' && parts[2] === 'methods' && parts.length === 3 && method === 'GET') {
      return { ok: true, phone: auth.phoneEnabled, google: google.enabled };
    }

    if (parts[1] === 'auth' && method === 'POST') {
      const body = await readJson(req);
      if (parts[2] === 'otp') return auth.requestOtp(body.phone);
      if (parts[2] === 'verify') return withConsent(await auth.verifyOtp(body));
      if (parts[2] === 'google') {
        const identity = await google.verify(body.idToken);
        if (!identity.ok) return identity;
        return withConsent(await auth.signInWithGoogle(identity, body.deviceLabel));
      }
      if (parts[2] === 'refresh') return auth.refresh(body.refreshToken);
      if (parts[2] === 'logout') return auth.logout((await signedIn(req)).deviceId);
      throw httpError(404, 'NOT_FOUND');
    }

    const user = await signedIn(req);

    if (!consentExempt(method, parts) && !(await consent.accepted(user.userId))) {
      throw httpError(403, 'CONSENT_REQUIRED', { document: PRIVACY_NOTICE.document, version: PRIVACY_NOTICE.version });
    }

    if (parts[1] === 'me' && parts[2] === 'consent' && parts.length === 3 && method === 'POST') {
      return consent.accept(user.userId, user.deviceId, await readJson(req));
    }

    if (parts[1] === 'crash-reports' && parts.length === 2 && method === 'POST') {
      return crashes.record(await readJson(req, MAX_CRASH_BYTES));
    }

    if (parts[1] === 'reference' && parts[2] === 'states' && method === 'GET') {
      return { ok: true, states: businessStates(new Date(now()).toISOString().slice(0, 10)) };
    }

    if (parts[1] === 'me' && parts.length === 2) {
      if (method === 'GET') {
        return {
          ok: true,
          user: { id: user.userId, name: user.name },
          consent: await consent.status(user.userId),
          businesses: await businesses.listFor(user.userId),
          invitations: await members.pendingFor(user.phone),
        };
      }
      if (method === 'PATCH') return auth.setName(user.userId, (await readJson(req)).name);
      if (method === 'DELETE') return auth.deleteAccount(user.userId);
    }

    if (parts[1] === 'invitations' && parts.length === 4 && method === 'POST' && (parts[3] === 'accept' || parts[3] === 'decline')) {
      const context = { userId: user.userId, deviceId: user.deviceId, requestId };
      return members.respond(user, context, parts[2], parts[3] === 'accept');
    }

    if (parts[1] === 'businesses' && parts.length === 5 && method === 'DELETE') {
      const businessId = parts[2];
      if (!isUuid(businessId)) throw httpError(404, 'BUSINESS_NOT_FOUND');
      const role = await member(user, businessId);
      const context = { userId: user.userId, deviceId: user.deviceId, requestId };
      if (parts[3] === 'members') return members.remove(businessId, context, role, parts[4]);
      if (parts[3] === 'invitations') {
        if (role !== 'owner') throw httpError(403, 'OWNER_ONLY');
        return members.revoke(businessId, context, parts[4]);
      }
      throw httpError(404, 'NOT_FOUND');
    }

    if (parts[1] === 'businesses' && parts.length === 2) {
      if (method === 'GET') return { ok: true, businesses: await businesses.listFor(user.userId) };
      if (method === 'POST') return businesses.create(user.userId, await readJson(req));
    }

    if (parts[1] === 'businesses' && parts.length === 4) {
      const businessId = parts[2];
      if (!isUuid(businessId)) throw httpError(404, 'BUSINESS_NOT_FOUND');
      const role = await member(user, businessId);
      const context = { userId: user.userId, deviceId: user.deviceId, requestId };
      const actor = { actor: { userId: user.userId, role: engineRole(role), name: user.name || user.userId } };
      const action = parts[3];

      if (method === 'GET' && action === 'snapshot') {
        return withBooks(businessId, context, async (session) => appSnapshot(session.snapshot(), user, role));
      }
      if (method === 'GET' && action === 'members') {
        return {
          ok: true,
          members: await businesses.members(businessId),
          invitations: role === 'owner' ? await members.openFor(businessId) : [],
        };
      }
      if (method !== 'POST') throw httpError(404, 'NOT_FOUND');

      const body = await readJson(req, action === 'uploads' ? MAX_UPLOAD_BYTES : MAX_BODY_BYTES);
      if (action === 'invitations') {
        if (role !== 'owner') throw httpError(403, 'OWNER_ONLY');
        return members.invite(businessId, context, body);
      }
      if (action === 'uploads') {
        return withBooks(businessId, context, (session) => session.uploadDocument(body.name, body.content, actor));
      }
      if (action === 'propose') {
        const name = String(body.name || '');
        const args = body.args && typeof body.args === 'object' ? body.args : {};
        if (isImport(name)) {
          if (IMPORT_CONTENT_ARG[name] in args || typeof args.documentSha256 !== 'string') throw httpError(400, 'IMPORT_NEEDS_UPLOAD');
          return withBooks(businessId, context, (session) => session.propose(name, args, actor), { hashes: [args.documentSha256] });
        }
        if (!PROPOSABLE.has(name)) throw httpError(400, 'NOT_PROPOSABLE', { tool: name });
        return withBooks(businessId, context, (session) => session.propose(name, args, actor));
      }
      if (action === 'confirm') return withBooks(businessId, context, (session) => session.confirm(body.token, actor));
      if (action === 'discard') return withBooks(businessId, context, (session) => session.discard(actor));
      if (action === 'query') return withBooks(businessId, context, (session) => session.query(body.name, body.args || {}, actor));
      if (action === 'ask') {
        const message = String(body.message ?? '').slice(0, 2000);
        if (!message.trim()) throw httpError(400, 'MESSAGE_REQUIRED');
        return withBooks(businessId, context, (session) => session.chat(message, actor));
      }
      if (action === 'company') {
        if (role !== 'owner') throw httpError(403, 'OWNER_ONLY');
        return withBooks(businessId, context, async (session) => {
          const out = await session.updateCompany(body, actor);
          if (out.ok !== false) await businesses.rename(businessId, session.state.company);
          return out;
        });
      }
    }
    throw httpError(404, 'NOT_FOUND');
  }

  return async function handler(req, res) {
    const requestId = randomUUID();
    let status = 200;
    let body;
    try {
      body = await route(req, requestId);
      status = statusOf(body);
    } catch (err) {
      status = err.statusCode || 500;
      body = err.body || { ok: false, error: status === 500 ? 'INTERNAL_ERROR' : String(err.message) };
      if (status === 500) {
        log({ requestId, error: String(err && err.stack ? err.stack : err) });
        await crashes.recordServer(err, version).catch(() => {});
      }
    }
    log({ requestId, method: req.method, path: new URL(req.url, 'http://localhost').pathname.replace(/[0-9a-f-]{36}/gi, ':id'), status });
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-request-id': requestId });
    res.end(JSON.stringify(body, (_key, value) => (typeof value === 'bigint' ? Number(value) : value)));
  };
}
