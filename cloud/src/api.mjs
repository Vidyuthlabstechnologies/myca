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
import { createJobs, jobTokenMatches, JOB_HEADER } from './jobs.mjs';
import { createGoogleKeys, createGoogleVerifier } from './google.mjs';
import { createOidcVerifier } from './oidc.mjs';
import { createDocumentVault } from './document-vault.mjs';
import { CA_SYNC_MODES, syncOf } from './ca-sync.mjs';
import { inWords } from '../../platform/src/words.mjs';
import { createInbound, INBOUND_HEADER, relayTokenMatches } from './inbound.mjs';
import { createWhatsApp } from './whatsapp.mjs';

const INDIA_OFFSET_MS = 330 * 60 * 1000;

function indiaDate(at) {
  return new Date(Number(at) + INDIA_OFFSET_MS).toISOString().slice(0, 10);
}

export const INBOUND_RELAY_HEADER = 'x-myca-relay-token';

const MAX_BODY_BYTES = 1024 * 1024;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_BUSINESS_BYTES = 200 * 1024 * 1024;
const MAX_CRASH_BYTES = 64 * 1024;

export const PROPOSABLE = new Set(['create_invoice', 'create_purchase', 'record_receipt', 'record_payment', 'record_filing', 'record_supplier_reminder', 'add_employee', 'set_tds_deductor', 'record_tds_deposit', 'change_salary', 'end_employment', 'post_expense', 'set_expense_head', 'create_credit_note', 'cancel_invoice', 'gst_review_answer', 'add_reminder', 'complete_reminder', 'set_cash_balance', 'set_payment_terms', 'ask_ca', 'reply_ca', 'close_ca', 'create_quote', 'mark_quote', 'convert_quote', 'exception_decide', 'create_purchase_note', 'import_settlement', 'import_marketplace_orders', 'import_tcs_statement', 'import_26as_credits', 'set_sku_cost', 'import_sku_costs', 'record_stock', 'record_stock_transfer', 'value_inventory', 'set_registration', 'retire_registration', 'set_channel_identity', 'set_invoice_template', 'set_supplier_terms', 'set_employee_bank', 'set_invoice_numbering', 'amend_invoice', 'create_debit_note', 'record_supplier_debit_note']);

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

function readRaw(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      bytes += chunk.length;
      if (bytes > limit) {
        tooLarge = true;
        chunks.length = 0;
        reject(httpError(413, 'BODY_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (tooLarge) return;
      resolve(Buffer.concat(chunks));
    });
  });
}

function readJson(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let tooLarge = false;
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) {
      req.resume();
      reject(httpError(413, 'BODY_TOO_LARGE'));
      return;
    }
    req.on('data', (chunk) => {
      if (tooLarge) return;
      bytes += chunk.length;
      if (bytes > limit) {
        tooLarge = true;
        chunks.length = 0;
        reject(httpError(413, 'BODY_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      if (tooLarge) return;
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
  if (result.error === 'INVITATION_NOT_FOUND' || result.error === 'MEMBER_NOT_FOUND' || result.error === 'BUSINESS_NOT_FOUND') return 404;
  if (result.error === 'STORAGE_FULL') return 413;
  if (result.error === 'KEY_NOT_FOUND' || result.error === 'ADDRESS_NOT_FOUND') return 404;
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

export function createApi({ db, secret, otpSender = null, googleClientIds = [], googleKeys, oidc = {}, oidcKeys = null, documentVault = null, now = () => Date.now(), log = () => {}, version = 'dev', jobToken = '', inboundEmail = {}, whatsapp = {}, whatsappSender = null }) {
  assertSecret(secret);
  if (liveCallsEnabled()) throw new Error('the hosted API must not start with live provider calls enabled');
  const auth = createAuth({ db, secret, otpSender, now });
  const businesses = createBusinesses({ db, now });
  const vault = documentVault || createDocumentVault({ now, log });
  const runner = createBooksRunner({ db, now, vault });
  const withBooks = runner.withBooks;
  const members = createMembers({ db, secret, now, notify: otpSender && typeof otpSender.sendText === 'function' ? (phone, text) => otpSender.sendText(phone, text) : null });
  const crashes = createCrashReports({ db, now });
  const inbound = createInbound({ db, secret, now, withBooks, email: { domain: inboundEmail.domain } });
  const whatsApp = createWhatsApp({ db, withBooks, config: whatsapp, sender: whatsappSender, now, log });
  const consent = createConsent({ db, now });
  const jobs = createJobs({ db, withBooks, log });
  const google = createGoogleVerifier({ clientIds: googleClientIds, keys: googleKeys || createGoogleKeys({ now }), now });
  const openId = createOidcVerifier({ issuer: oidc.issuer || '', clientIds: oidc.clientIds || [], jwksUrl: oidc.jwksUrl || '', keys: oidcKeys, now });
  if (!otpSender && !google.enabled && !openId.enabled) throw new Error('no sign-in method: configure an SMS sender, MYCA_GOOGLE_CLIENT_IDS or MYCA_OIDC_ISSUER with MYCA_OIDC_CLIENT_IDS');

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
      return { ok: true, phone: auth.phoneEnabled, google: google.enabled, oidc: openId.enabled, ...(openId.enabled ? { oidcIssuer: openId.issuer } : {}) };
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
      if (parts[2] === 'oidc') {
        const identity = await openId.verify(body.idToken);
        if (!identity.ok) return identity;
        return withConsent(await auth.signInWithOidc(identity, body.deviceLabel));
      }
      if (parts[2] === 'refresh') return auth.refresh(body.refreshToken);
      if (parts[2] === 'logout') return auth.logout((await signedIn(req)).deviceId);
      throw httpError(404, 'NOT_FOUND');
    }

    if (parts[1] === 'whatsapp' && parts[2] === 'webhook' && parts.length === 3) {
      if (method === 'GET') {
        const verified = whatsApp.verify(url.searchParams);
        if (!verified.ok) throw httpError(verified.statusCode, verified.error);
        return { __text: verified.text };
      }
      if (method === 'POST') {
        const raw = await readRaw(req, MAX_BODY_BYTES);
        const received = await whatsApp.receive(requestId, raw, req.headers['x-hub-signature-256']);
        if (!received.ok) throw httpError(received.statusCode, received.error);
        return received;
      }
      throw httpError(405, 'METHOD_NOT_ALLOWED');
    }

    if (parts[1] === 'inbound' && parts[2] === 'email' && parts.length === 3 && method === 'POST') {
      if (!relayTokenMatches(String(inboundEmail.relayToken || ''), req.headers[INBOUND_RELAY_HEADER])) throw httpError(401, 'INVALID_RELAY_TOKEN');
      return inbound.mail(requestId, await readJson(req, MAX_UPLOAD_BYTES * 2), indiaDate(now()));
    }

    if (parts[1] === 'inbound' && parts.length === 3 && method === 'POST') {
      const key = await inbound.authenticate(req.headers[INBOUND_HEADER]);
      if (!key) throw httpError(401, 'INVALID_KEY');
      if (parts[2] === 'sales') return inbound.sale(key, requestId, await readJson(req));
      if (parts[2] === 'documents') return inbound.document(key, requestId, await readJson(req, MAX_UPLOAD_BYTES), indiaDate(now()));
      throw httpError(404, 'NOT_FOUND');
    }

    if (parts[1] === 'jobs' && parts[2] === 'daily' && parts.length === 3 && method === 'POST') {
      if (!jobTokenMatches(jobToken, req.headers[JOB_HEADER])) throw httpError(404, 'NOT_FOUND');
      return jobs.daily(requestId);
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

    if (parts[1] === 'businesses' && parts.length === 3 && method === 'DELETE') {
      const businessId = parts[2];
      if (!isUuid(businessId)) throw httpError(404, 'BUSINESS_NOT_FOUND');
      const role = await member(user, businessId);
      if (role !== 'owner') throw httpError(403, 'OWNER_ONLY');
      return businesses.requestDeletion(businessId, { userId: user.userId, deviceId: user.deviceId, requestId });
    }

    if (parts[1] === 'businesses' && parts.length === 5 && parts[3] === 'members' && method === 'PATCH') {
      const businessId = parts[2];
      if (!isUuid(businessId)) throw httpError(404, 'BUSINESS_NOT_FOUND');
      const role = await member(user, businessId);
      const context = { userId: user.userId, deviceId: user.deviceId, requestId };
      return members.changeRole(businessId, context, role, parts[4], String((await readJson(req)).role || ''));
    }

    if (parts[1] === 'businesses' && parts.length === 5 && method === 'DELETE') {
      const businessId = parts[2];
      if (!isUuid(businessId)) throw httpError(404, 'BUSINESS_NOT_FOUND');
      const role = await member(user, businessId);
      const context = { userId: user.userId, deviceId: user.deviceId, requestId };
      if (parts[3] === 'members') return members.remove(businessId, context, role, parts[4]);
      if (parts[3] === 'inbound') {
        if (role !== 'owner') throw httpError(403, 'OWNER_ONLY');
        return inbound.disable(businessId, context, parts[4]);
      }
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
      const sync = await syncOf((text, params) => db.query(text, params), businessId);
      const sharedView = role === 'accountant' && sync && sync.mode !== 'live';

      if (method === 'GET' && action === 'snapshot') {
        if (sharedView) {
          return runner.withSharedBooks(businessId, context, async (session, { asOf }) => ({ ...appSnapshot(session.snapshot(), user, role), sharedAsOf: asOf }));
        }
        return runner.withReadOnlyBooks(businessId, context, async (session) => appSnapshot(session.snapshot(), user, role));
      }
      if (method === 'GET' && action === 'ca-sync') {
        return { ok: true, mode: sync.mode, sharedAsOf: sync.mode === 'live' ? null : sync.asOf, modes: CA_SYNC_MODES };
      }
      if (method === 'GET' && action === 'inbound') {
        if (role !== 'owner') throw httpError(403, 'OWNER_ONLY');
        return inbound.list(businessId);
      }
      if (method === 'GET' && action === 'export') {
        if (role !== 'owner') throw httpError(403, 'OWNER_ONLY');
        const business = (await businesses.listFor(user.userId)).find((b) => b.id === businessId) || { id: businessId };
        const people = await businesses.members(businessId);
        const auditRows = await db.query('select id, user_id as "userId", request_id as "requestId", action, before_hash as "beforeHash", after_hash as "afterHash", metadata, at from audit_log where business_id = $1 order by id', [businessId]);
        const inboundKeys = await inbound.list(businessId);
        const out = await runner.withReadOnlyBooks(businessId, context, async (session) => session.backup());
        const stored = await vault.all((text, params) => db.query(text, params), businessId);
        const documents = Object.fromEntries(stored.map((row) => [row.sha256, row.content]));
        await db.query(
          `insert into audit_log (business_id, user_id, device_id, request_id, action, metadata) values ($1, $2, $3, $4, 'business.exported', $5::jsonb)`,
          [businessId, user.userId, user.deviceId, requestId, JSON.stringify({ documents: stored.length, auditRows: auditRows.rowCount })],
        );
        return {
          ok: true,
          exportedAt: out.exportedAt,
          business: { id: business.id, name: business.name || '', gstin: business.gstin || '' },
          members: people,
          connections: inboundKeys.keys || [],
          books: out.state,
          documents,
          audit: auditRows.rows,
          note: 'This is everything MyCA holds about this business: the books as one document, every uploaded file keyed by its sha256, who is a member, the connected systems, and the audit trail. Restore it on the Windows app or keep it.',
        };
      }
      if (method === 'GET' && action === 'members') {
        return {
          ok: true,
          members: await businesses.members(businessId),
          invitations: role === 'owner' ? await members.openFor(businessId) : [],
        };
      }
      if (method !== 'POST') throw httpError(404, 'NOT_FOUND');

      const body = await readJson(req, action === 'uploads' ? MAX_UPLOAD_BYTES : action === 'replace' ? MAX_BUSINESS_BYTES : MAX_BODY_BYTES);
      if (action === 'ca-sync') {
        if (role !== 'owner') throw httpError(403, 'OWNER_ONLY');
        const mode = String(body.mode || '');
        if (!CA_SYNC_MODES.includes(mode)) throw httpError(400, 'BAD_SYNC_MODE', { modes: CA_SYNC_MODES });
        await db.query('update businesses set ca_sync = $2 where id = $1', [businessId, mode]);
        const sharedAsOf = mode === 'live' ? null : await runner.share(businessId, user.userId);
        return { ok: true, mode, sharedAsOf };
      }
      if (action === 'ca-share') {
        if (role !== 'owner') throw httpError(403, 'OWNER_ONLY');
        if (sync.mode === 'live') throw httpError(409, 'CA_SEES_LIVE_BOOKS');
        return { ok: true, sharedAsOf: await runner.share(businessId, user.userId) };
      }
      if (sharedView) {
        if (action === 'query') return runner.withSharedBooks(businessId, context, (session) => session.query(body.name, body.args || {}, actor));
        if (action === 'ask') {
          const message = String(body.message ?? '').slice(0, 2000);
          if (!message.trim()) throw httpError(400, 'MESSAGE_REQUIRED');
          return runner.withSharedBooks(businessId, context, async (session, { asOf }) => {
            const out = await session.chat(message, actor);
            if (!out.preview && !out.awaitingConfirmation) return out;
            return { reply: `These books are shared with you as they stood on ${inWords(indiaDate(asOf.getTime()))}, so nothing can be posted from here. Ask the owner to make the change, or to share the books again.`, tools: [] };
          });
        }
        throw httpError(403, 'SHARED_VIEW_READ_ONLY', { sharedAsOf: sync.asOf });
      }
      if (action === 'invitations') {
        if (role !== 'owner') throw httpError(403, 'OWNER_ONLY');
        return members.invite(businessId, context, body);
      }
      if (action === 'inbound') {
        if (role !== 'owner') throw httpError(403, 'OWNER_ONLY');
        return inbound.create(businessId, context, body);
      }
      if (action === 'replace') {
        if (role !== 'owner') throw httpError(403, 'OWNER_ONLY');
        const state = body.books && !body.state ? body.books : body.state;
        if (!state || typeof state !== 'object') return { ok: false, error: 'INVALID_BACKUP', hint: 'Send the file saved by "Download everything" or a backup from the Windows app.' };
        const out = await runner.replaceBooks(businessId, context, { version: 1, state, documents: body.documents || {}, exportedAt: body.exportedAt || '' });
        if (out.ok !== false) await businesses.rename(businessId, state.company || {});
        return out;
      }
      if (action === 'uploads') {
        const stored = await businesses.storedBytes(businessId);
        const incoming = Buffer.byteLength(String(body.content || ''), 'utf8');
        if (stored + incoming > MAX_BUSINESS_BYTES) return { ok: false, error: 'STORAGE_FULL', storedBytes: stored, limitBytes: MAX_BUSINESS_BYTES };
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
      if (action === 'query') return runner.withReadOnlyBooks(businessId, context, (session) => session.query(body.name, body.args || {}, actor));
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
    if (body && typeof body === 'object' && typeof body.__text === 'string') {
      res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-request-id': requestId });
      res.end(body.__text);
      return;
    }
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-request-id': requestId });
    res.end(JSON.stringify(body, (_key, value) => (typeof value === 'bigint' ? Number(value) : value)));
  };
}
