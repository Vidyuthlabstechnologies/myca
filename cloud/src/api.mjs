import { confirmationIntent } from '../../platform/src/chat-confirm.mjs';
import { PARTNER_SIGNATURE_HEADER, efileRoute, partnerSignatureValid, normalizePartnerEvent, parseExternalId, applyPartnerEvent } from '../../platform/src/us-filing-partner.mjs';
import { randomUUID } from 'node:crypto';
import { mockModeEnabled, serviceProviderEnvironment } from '../../platform/src/runtime-config.mjs';
import { runSmoke, serverSmokeEnv } from './sandbox-smoke.mjs';
import { withProviderContext } from '../../platform/src/provider-context.mjs';
import { createGovtActions } from './govt-actions.mjs';
import { createGstPortal } from './gst-portal.mjs';
import { createQuicko } from './quicko.mjs';
import { createBilling, readOnlyChat, US_PLUS_TOOLS } from './billing.mjs';
import { gstin } from '../../platform/src/sprint-load.mjs';
import { rule } from '../../sprints/statutory-rules/src/index.mjs';
import { createAuth, isUuid, OTP_MAX_GLOBAL_PER_HOUR } from './auth.mjs';
import { createSecondFactor } from './second-factor.mjs';
import { createDevices } from './devices.mjs';
import { createBusinesses, engineRole } from './businesses.mjs';
import { publicCountries } from './residency.mjs';
import { createBooksRunner } from './books-runner.mjs';
import { createMembers } from './members.mjs';
import { IMPORT_CONTENT_ARG, isImport } from '../../platform/src/import-documents.mjs';
import { assertSecret } from './tokens.mjs';
import { createBodyBudget, defaultBodyBudgetBytes } from './body-budget.mjs';
import { createCrashReports } from './crash-reports.mjs';
import { createGrowth } from './growth.mjs';
import { PRIVACY_NOTICE, consentExempt, createConsent, noticeFor } from './consent.mjs';
import { createJobs, jobTokenMatches, JOB_HEADER } from './jobs.mjs';
import { createGoogleKeys, createGoogleVerifier } from './google.mjs';
import { createOidcVerifier } from './oidc.mjs';
import { createDocumentVault } from './document-vault.mjs';
import { createConnectorStore } from './connectors.mjs';
import { syncChannels } from '../../platform/src/channel-connectors.mjs';
import { plaidLinkToken, plaidExchange, gustoConnectUrl, gustoCallback, taxjarRate } from '../../platform/src/us-connectors.mjs';
import { channelPullsEnabled } from '../../platform/src/runtime-config.mjs';
import { CA_SYNC_MODES, syncOf } from './ca-sync.mjs';
import { inWords } from '../../platform/src/words.mjs';
import { createInbound, INBOUND_HEADER, relayTokenMatches } from './inbound.mjs';
import { createWhatsApp } from './whatsapp.mjs';
import { chatText } from './chat-text.mjs';
import { htmlEscape } from '../../platform/src/text-safe.mjs';
import { DEMO_BLOCKED_ACTIONS, seedDemo } from './demo.mjs';
import { createRateLimits, LIMITS } from './rate-limits.mjs';
import { ENGINE_WRITE_TOOLS } from '../../platform/src/countries/manifests.mjs';

const INDIA_OFFSET_MS = 330 * 60 * 1000;

function indiaDate(at) {
  return new Date(Number(at) + INDIA_OFFSET_MS).toISOString().slice(0, 10);
}

export const INBOUND_RELAY_HEADER = 'x-myca-relay-token';
export const PLAY_NOTIFY_HEADER = 'x-myca-notify-token';
export const STRIPE_SIGNATURE_HEADER = 'stripe-signature';
export const US_SUPPORTED_FORMS = Object.freeze({
  supported: ['1040', 'Schedule 1', 'Schedule 1-A', 'Schedule 2', 'Schedule 3', 'Schedule A', 'Schedule B', 'Schedule C', 'Schedule D', 'Schedule SE', 'Form 8949', 'Form 8812', 'Form 8863', 'Form 8959', 'Form 8960', 'Form 8995', 'W-2', '1099-INT', '1099-DIV', '1099-B', '1099-NEC', '1099-MISC', '1099-G', '1099-R', 'SSA-1099', '1098', '1098-E', '1098-T'],
  coming: ['Form 2441', 'Form 8962', 'Form 8995-A', 'Form 2210', 'Schedule E'],
  notThisSeason: ['State returns', 'Form 1040-NR', 'Dual-status returns', 'FBAR (FinCEN 114)', 'Form 8938', 'Form 1116', 'Form 1040-X'],
});

const MAX_BODY_BYTES = 1024 * 1024;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_BUSINESS_BYTES = 200 * 1024 * 1024;
const MAX_CRASH_BYTES = 64 * 1024;
const SMALL_BODY_BYTES = 64 * 1024;
const MERGE_BYTES = 16 * 1024;
const MERGE_PIECES = 256;

const US_FILE_TOOL = 'file_us_return';
const OWNER_ONLY_POSTS = new Map([
  ['ca-sync', 'OWNER_ONLY'],
  ['ca-share', 'OWNER_ONLY'],
  ['subscription', 'SHARED_VIEW_READ_ONLY'],
  ['us-return-purchase', 'SHARED_VIEW_READ_ONLY'],
  ['us-checkout', 'SHARED_VIEW_READ_ONLY'],
  ['us-checkout-confirm', 'SHARED_VIEW_READ_ONLY'],
  ['us-plus-cancel', 'SHARED_VIEW_READ_ONLY'],
  ['us-plus-purchase', 'SHARED_VIEW_READ_ONLY'],
  ['us-waitlist', 'SHARED_VIEW_READ_ONLY'],
  ['invitations', 'SHARED_VIEW_READ_ONLY'],
  ['inbound', 'SHARED_VIEW_READ_ONLY'],
  ['connectors', 'SHARED_VIEW_READ_ONLY'],
  ['plaid-link-token', 'SHARED_VIEW_READ_ONLY'],
  ['plaid-exchange', 'SHARED_VIEW_READ_ONLY'],
  ['gusto-connect', 'SHARED_VIEW_READ_ONLY'],
  ['taxjar-rate', 'SHARED_VIEW_READ_ONLY'],
  ['connector-sync', 'SHARED_VIEW_READ_ONLY'],
  ['replace', 'SHARED_VIEW_READ_ONLY'],
]);

const WRITES = new Set(['replace', 'uploads', 'propose', 'confirm', 'connector-sync', 'plaid-exchange', 'gusto-connect']);

export const PROPOSABLE = new Set(['sign_us_return', 'file_us_return', 'import_payroll_tax_forms', 'import_payroll_summary', 'create_invoice', 'create_purchase', 'record_receipt', 'record_payment', 'record_filing', 'record_supplier_reminder', 'add_employee', 'set_tds_deductor', 'record_tds_deposit', 'change_salary', 'end_employment', 'post_expense', 'set_expense_head', 'create_credit_note', 'cancel_invoice', 'gst_review_answer', 'add_reminder', 'complete_reminder', 'set_cash_balance', 'set_payment_terms', 'ask_ca', 'reply_ca', 'close_ca', 'create_quote', 'mark_quote', 'convert_quote', 'exception_decide', 'ims_decide', 'create_purchase_note', 'import_settlement', 'import_marketplace_orders', 'import_tcs_statement', 'import_26as_credits', 'record_tds_withheld', 'add_bill_tds', 'set_business_address', 'set_party_address', 'set_sku_cost', 'import_sku_costs', 'record_stock', 'record_stock_transfer', 'value_inventory', 'set_registration', 'retire_registration', 'set_channel_identity', 'set_invoice_template', 'set_supplier_terms', 'set_employee_bank', 'set_invoice_numbering', 'amend_invoice', 'create_debit_note', 'record_supplier_debit_note', 'record_collection_reminder', 'record_payment_run', 'attach_document', 'approve_payroll', 'record_salary_payment', 'tds_review_answer', 'record_gst_payment', 'close_year', 'set_transport', 'set_sales_tax_nexus', 'sales_tax_review_answer', 'record_sales_tax_payment', 'record_sales_tax_filing', 'set_suta_rate', 'add_recurring', 'stop_recurring', 'match_bank_line', 'unmatch_bank_line', 'book_bank_charges', 'add_bank_rule', 'remove_bank_rule', 'run_bank_rules', 'set_bank_account', 'record_transfer', 'set_us_taxpayer', 'add_us_tax_form', 'remove_us_tax_form', 'answer_us_interview']);

const NOT_A_PLACE_OF_BUSINESS = new Set(['97', '99']);

for (const name of ENGINE_WRITE_TOOLS) PROPOSABLE.add(name);

export function businessStates(onDate) {
  const current = rule('gst.gstin.state-codes', onDate);
  const codes = current.ok ? current.value : [];
  return codes
    .filter((code) => !NOT_A_PLACE_OF_BUSINESS.has(code) && gstin.STATE_CODES[code])
    .map((code) => ({ code, name: gstin.STATE_CODES[code] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const RAW_BODIES = new WeakSet();

function rawBody(body) {
  RAW_BODIES.add(body);
  return body;
}

export function gustoPage(ok, text) {
  return rawBody({ __html: `<!doctype html><meta charset="utf-8"><title>MyCA</title><body style="font:16px system-ui;background:#0c1220;color:#e8edf6;padding:40px"><h1>${ok ? 'Gusto is connected' : 'Gusto was not connected'}</h1><p>${htmlEscape(text)}</p><p>You can close this tab and go back to the MyCA app.</p></body>` });
}

function httpError(statusCode, error, extra = {}) {
  const err = new Error(error);
  err.statusCode = statusCode;
  err.body = { ok: false, error, ...extra };
  return err;
}

function declaredLength(req) {
  const declared = Number(req.headers['content-length']);
  return Number.isFinite(declared) && declared > 0 ? declared : 0;
}

function connectionDropped(err) {
  return Boolean(err) && (err.code === 'ECONNRESET' || err.message === 'aborted');
}

function createBodyReaders(budget) {
  const accounts = new WeakMap();

  function release(req) {
    const account = accounts.get(req);
    if (!account || !account.give) return;
    account.give();
    account.give = null;
  }

  function hold(req, bytes, force) {
    let account = accounts.get(req);
    if (!account) {
      account = { give: null };
      accounts.set(req, account);
    }
    if (account.give) account.give();
    account.give = budget.reserve(bytes, { force });
    return account.give !== null;
  }

  function collect(req, routeLimit) {
    const limit = Math.min(routeLimit, Math.max(budget.limit, SMALL_BODY_BYTES));
    return new Promise((resolve, reject) => {
      let pieces = [];
      let pending = [];
      let pendingBytes = 0;
      let received = 0;
      let reserved = false;
      let settled = false;

      function flush() {
        if (!pending.length) return;
        pieces.push(pending.length === 1 ? pending[0] : Buffer.concat(pending, pendingBytes));
        pending = [];
        pendingBytes = 0;
      }

      function settle(failure) {
        if (settled) return;
        settled = true;
        req.removeListener('data', onData);
        req.removeListener('end', onEnd);
        req.removeListener('aborted', onGone);
        req.removeListener('close', onGone);
        req.removeListener('error', onError);
        if (failure) {
          pieces = [];
          pending = [];
          release(req);
          req.resume();
          reject(failure);
          return;
        }
        flush();
        resolve(pieces.length === 1 ? pieces[0] : Buffer.concat(pieces, received));
      }

      function onData(chunk) {
        received += chunk.length;
        if (received > limit) return settle(httpError(413, 'BODY_TOO_LARGE'));
        if (!reserved && !hold(req, received, received <= SMALL_BODY_BYTES)) return settle(httpError(503, 'SERVER_BUSY'));
        if (chunk.length >= MERGE_BYTES) {
          flush();
          pieces.push(chunk);
          return;
        }
        pending.push(chunk);
        pendingBytes += chunk.length;
        if (pendingBytes >= MERGE_BYTES || pending.length >= MERGE_PIECES) flush();
      }

      function onEnd() {
        settle(null);
      }

      function onGone() {
        settle(httpError(400, 'REQUEST_ABORTED'));
      }

      function onError(err) {
        settle(connectionDropped(err) ? httpError(400, 'REQUEST_ABORTED') : err);
      }

      if (req.destroyed) return settle(httpError(400, 'REQUEST_ABORTED'));
      const declared = declaredLength(req);
      if (declared > limit) return settle(httpError(413, 'BODY_TOO_LARGE'));
      if (declared > SMALL_BODY_BYTES) {
        if (!hold(req, declared, false)) return settle(httpError(503, 'SERVER_BUSY'));
        reserved = true;
      }
      req.on('data', onData);
      req.on('end', onEnd);
      req.on('aborted', onGone);
      req.on('close', onGone);
      req.on('error', onError);
    });
  }

  function readRaw(req, limit = MAX_BODY_BYTES) {
    return collect(req, limit);
  }

  async function readJson(req, limit = MAX_BODY_BYTES) {
    const body = await collect(req, limit);
    if (!body.length) return {};
    let parsed;
    try {
      parsed = JSON.parse(body.toString('utf8'));
    } catch {
      throw httpError(400, 'INVALID_JSON');
    }
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }

  return { readRaw, readJson, release };
}

function bearer(req) {
  const match = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
  return match ? match[1] : '';
}

function parseTarget(target) {
  try {
    return new URL(target, 'http://localhost');
  } catch {
    return null;
  }
}

function statusOf(result) {
  if (!result || result.ok !== false) return 200;
  if (result.error === 'TOO_MANY_REQUESTS' || result.error === 'TOO_MANY_ATTEMPTS') return 429;
  if (result.error === 'OWNER_ONLY') return 403;
  if (result.error === 'PHONE_SIGN_IN_UNAVAILABLE' || result.error === 'GOOGLE_SIGN_IN_UNAVAILABLE' || result.error === 'SERVER_BUSY') return 503;
  if (result.error === 'GOOGLE_UNREACHABLE') return 502;
  if (result.error === 'INVITATION_NOT_FOUND' || result.error === 'MEMBER_NOT_FOUND' || result.error === 'BUSINESS_NOT_FOUND' || result.error === 'DEVICE_NOT_FOUND') return 404;
  if (result.error === 'ALREADY_ENABLED' || result.error === 'CURRENT_DEVICE') return 409;
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
    expenses: snapshot.expenses,
    creditNotes: snapshot.creditNotes,
    quotes: snapshot.quotes,
    customerTerms: snapshot.customerTerms,
    role,
    user: { id: user.userId, name: user.name },
  };
}

export function trustedProxyHops(env = process.env) {
  const given = Number(env.MYCA_TRUSTED_PROXY_HOPS);
  if (Number.isInteger(given) && given >= 0) return given;
  return env.K_SERVICE ? 1 : 0;
}

function createAccessLog(db) {
  return async function recordAccess(businessId, context, method, action, role) {
    await db.query(
      'insert into access_log (business_id, user_id, device_id, request_id, method, action, role) values ($1, $2, $3, $4, $5, $6, $7)',
      [businessId, context.userId || null, context.deviceId || null, context.requestId || '', String(method || '').slice(0, 8), String(action || '').slice(0, 80), String(role || '').slice(0, 20)],
    );
  };
}

export function withRequestAddress(args, address) {
  const device = args.device && typeof args.device === 'object' ? args.device : {};
  const { ipAddress, ...rest } = device;
  const ip = String(address || '').replace(/^::ffff:/, '').slice(0, 45);
  return { ...args, device: ip ? { ...rest, ipAddress: ip } : rest };
}

export function clientAddress(req, hops = trustedProxyHops()) {
  const socket = String(req.socket?.remoteAddress || '').slice(0, 64);
  if (!hops) return socket;
  const parts = String(req.headers['x-forwarded-for'] || '').split(',').map((part) => part.trim()).filter(Boolean);
  return String(parts[parts.length - hops] || '').slice(0, 64);
}

export function createApi({ billing: billingGiven = null, db, secret, booksKey = '', otpSender = null, googleClientIds = [], googleKeys, oidc = {}, oidcKeys = null, documentVault = null, connectorKey = '', now = () => Date.now(), log = () => {}, version = 'dev', environment = 'local', healthTimeoutMs = 2000, playPush = {}, testSignIn = null, otpGlobalPerHour = OTP_MAX_GLOBAL_PER_HOUR, rateLimits: limitsGiven = LIMITS, adminUserIds = [], jobToken = '', inboundEmail = {}, whatsapp = {}, whatsappSender = null, bodyBudgetBytes = 0, gspFetch = null, smokeFetch = null, growth: growthConfig = {} }) {
  process.env.MYCA_HOSTED = '1';
  assertSecret(secret);
  const budget = createBodyBudget(Number.isSafeInteger(bodyBudgetBytes) && bodyBudgetBytes > 0 ? bodyBudgetBytes : defaultBodyBudgetBytes({ constrainedMemory: process.constrainedMemory(), ceiling: MAX_BUSINESS_BYTES }));
  const { readRaw, readJson, release: releaseBody } = createBodyReaders(budget);
  const providerMode = () => (mockModeEnabled() ? 'simulated' : serviceProviderEnvironment());
  const secondFactor = createSecondFactor({ db, secret, booksKey, now });
  const auth = createAuth({ db, secret, otpSender, now, secondFactor, testSignIn, otpGlobalPerHour, log });
  const devices = createDevices({ db, now });
  const businesses = createBusinesses({ db, now, booksKey });
  const vault = documentVault || createDocumentVault({ now, log });
  const runner = createBooksRunner({ db, now, vault, booksKey });
  const connectors = createConnectorStore({ db, key: connectorKey });
  const withBooks = runner.withBooks;
  async function unsupportedForms(businessId, context, actor, taxYear) {
    try {
      const review = await runner.withReadOnlyBooks(businessId, context, (session) => session.query('us_return_review', { taxYear }, actor));
      const data = review && typeof review === 'object' ? (review.data && typeof review.data === 'object' ? review.data : review) : {};
      const list = Array.isArray(data.unsupported) ? data.unsupported : [];
      return list.filter((item) => typeof item === 'string' || item?.required !== false).map((item) => (typeof item === 'string' ? { form: item, reason: '' } : { form: String(item?.form || ''), reason: String(item?.reason || ''), code: String(item?.code || '') })).filter((item) => item.form);
    } catch (err) {
      log({ billing: 'supported_forms_check_failed', error: String(err?.message || err) });
      return [];
    }
  }

  // Confirming a US filing: the server names the business for the e-file partner's webhook
  // (whatever proposed it, app or chat), and the call runs at the service's provider setting.
  function asUsFiling(session, businessId, run) {
    const pending = session.state.pendingChatAction;
    if (pending?.name === US_FILE_TOOL) pending.args = { ...(pending.args || {}), partnerScope: businessId };
    return withProviderContext({ environment: serviceProviderEnvironment() }, run);
  }

  async function unpaidFiling(businessId, session) {
    const pending = session.state.pendingChatAction;
    if (pending?.name !== US_FILE_TOOL || (!billing.usEnforced && billing.usFilingOpen?.() !== false)) return null;
    const paid = await billing.usFilingAllowed(businessId, pending.args?.taxYear);
    return paid.ok ? null : paid;
  }
  const billing = billingGiven || createBilling({ db, now, log });
  const govt = createGovtActions({ connectors, withBooks: (...args) => runner.withBooks(...args), fetchFn: gspFetch });
  const gstPortal = createGstPortal({ db, connectors, withBooks: (...args) => runner.withBooks(...args), billing, key: connectorKey, fetchFn: gspFetch, now });
  const quicko = createQuicko({ db, connectors, withBooks: (...args) => runner.withBooks(...args), key: connectorKey, fetchFn: gspFetch, now });
  const publicOrigin = (req) => {
    const configured = String(process.env.MYCA_PUBLIC_URL || '').trim().replace(/\/+$/, '');
    if (configured) return configured;
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
    return `${/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? 'http' : 'https'}://${host}`;
  };
  const members = createMembers({ db, secret, now, notify: otpSender && typeof otpSender.sendText === 'function' ? (phone, text) => otpSender.sendText(phone, text) : null });
  const crashes = createCrashReports({ db, now });
  const growth = createGrowth({ db, now, siteUrl: growthConfig.siteUrl ?? process.env.MYCA_SITE_URL ?? '', reward: growthConfig.reward ?? process.env.MYCA_REFERRAL_REWARD ?? '' });
  const inbound = createInbound({ db, secret, now, withBooks, email: { domain: inboundEmail.domain }, storedBytes: (businessId) => businesses.storedBytes(businessId), limitBytes: MAX_BUSINESS_BYTES });
  const rateLimits = createRateLimits({ db, now, limits: limitsGiven });
  const whatsApp = createWhatsApp({ db, withBooks, billing, withSharedBooks: runner.withSharedBooks, syncOf, rateLimits, config: whatsapp, sender: whatsappSender, now, log });
  const consent = createConsent({ db, now });
  const recordAccess = createAccessLog(db);
  const isAdmin = (userId) => {
    const listed = typeof adminUserIds === 'function' ? adminUserIds() : adminUserIds;
    return Array.isArray(listed) && listed.some((id) => isUuid(id) && id.toLowerCase() === String(userId).toLowerCase());
  };

  async function throttle(kind, who) {
    const taken = await rateLimits.take(kind, who);
    if (!taken.ok) throw httpError(429, 'RATE_LIMITED', { retryAfterSeconds: taken.retryAfterSeconds, hint: 'Too many requests in a short time. Wait a little and try again.' });
  }
  const jobs = createJobs({ db, secret, rateLimits, withBooks, connectors, syncChannels, pullsEnabled: channelPullsEnabled, sender: whatsappSender, vault, billing, now, log });
  const google = createGoogleVerifier({ clientIds: googleClientIds, keys: googleKeys || createGoogleKeys({ now }), now });
  const openId = createOidcVerifier({ issuer: oidc.issuer || '', clientIds: oidc.clientIds || [], jwksUrl: oidc.jwksUrl || '', keys: oidcKeys, now });
  if (!auth.phoneEnabled && !google.enabled && !openId.enabled) throw new Error('no sign-in method: configure an SMS sender, MYCA_GOOGLE_CLIENT_IDS or MYCA_OIDC_ISSUER with MYCA_OIDC_CLIENT_IDS');

  const pushAudience = String(playPush.audience || '').trim();
  const pushAccount = String(playPush.serviceAccount || '').trim().toLowerCase();
  const pushVerifier = pushAudience && pushAccount ? createGoogleVerifier({ clientIds: [pushAudience], keys: googleKeys || createGoogleKeys({ now }), now }) : null;

  async function playPushVerified(req) {
    if (!pushVerifier) return false;
    const given = bearer(req);
    if (!given) return false;
    const out = await pushVerifier.verify(given);
    return Boolean(out.ok && String(out.email || '').toLowerCase() === pushAccount);
  }

  function reviewer(user) {
    return Boolean(testSignIn && user && user.phone && testSignIn.isReviewer(user.phone));
  }

  async function databaseReachable() {
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(false), healthTimeoutMs); });
    const probe = db.query('select 1').then(() => true, () => false);
    try {
      return await Promise.race([probe, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

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

  async function route(req, requestId, url) {
    if (!url) throw httpError(404, 'NOT_FOUND');
    const parts = url.pathname.split('/').filter(Boolean);
    const method = req.method;
    if (parts[0] !== 'v1') throw httpError(404, 'NOT_FOUND');

    if (parts[1] === 'health' && parts[2] === 'live' && parts.length === 3 && method === 'GET') return { ok: true, environment, providerMode: providerMode(), version };
    if (parts[1] === 'countries' && parts.length === 2 && method === 'GET') return publicCountries();
    if (parts[1] === 'health' && parts.length === 2 && method === 'GET') {
      const database = await databaseReachable();
      if (!database) throw httpError(503, 'DATABASE_UNAVAILABLE', { environment, providerMode: providerMode(), database: 'unreachable' });
      return { ok: true, environment, providerMode: providerMode(), database: 'ok', version };
    }
    if (parts[1] === 'privacy-notice' && parts.length === 2 && method === 'GET') return { ok: true, notice: noticeFor(url.searchParams.get('region'), url.searchParams.get('lang')) };
    if (parts[1] === 'plans' && parts.length === 2 && method === 'GET') return billing.plans();
    if (parts[1] === 'billing' && parts[2] === 'play' && parts[3] === 'notify' && parts.length === 4 && method === 'POST') {
      if (url.searchParams.has('token')) throw httpError(401, 'TOKEN_IN_QUERY', { hint: `Send the token in the ${PLAY_NOTIFY_HEADER} header, or use Pub/Sub push authentication.` });
      const raw = await readRaw(req, MAX_BODY_BYTES);
      const pushVerified = await playPushVerified(req);
      const received = await billing.notify(raw, String(req.headers[PLAY_NOTIFY_HEADER] || ''), { pushVerified });
      if (!received.ok) throw httpError(received.statusCode, received.error);
      return received;
    }
    if (parts[1] === 'billing' && parts[2] === 'stripe' && parts[3] === 'webhook' && parts.length === 4 && method === 'POST') {
      const raw = await readRaw(req, MAX_BODY_BYTES);
      const received = await billing.stripeWebhook(raw, String(req.headers[STRIPE_SIGNATURE_HEADER] || ''));
      if (!received.ok) throw httpError(received.statusCode, received.error);
      return received;
    }
    if (parts[1] === 'us' && parts[2] === 'filer' && parts[3] === 'webhook' && parts.length === 4 && method === 'POST') {
      const raw = await readRaw(req, MAX_BODY_BYTES);
      if (!partnerSignatureValid(raw, req.headers[PARTNER_SIGNATURE_HEADER])) throw httpError(401, 'FILER_SIGNATURE_INVALID');
      let body;
      try {
        body = JSON.parse(raw.toString('utf8'));
      } catch {
        throw httpError(400, 'FILER_EVENT_UNREADABLE');
      }
      const event = normalizePartnerEvent(body);
      const target = parseExternalId(event.externalId);
      if (!target?.scope || !isUuid(target.scope)) return { ok: true, ignored: 'FILER_EVENT_UNKNOWN_RETURN' };
      const out = await withBooks(target.scope, { userId: null, deviceId: null, requestId }, async (session) => {
        const applied = applyPartnerEvent(session.state, event);
        if (applied.changed) session.persist();
        return applied;
      }).catch((err) => (err?.statusCode === 404 || err?.status === 404 ? { ok: false, error: 'FILER_EVENT_UNKNOWN_RETURN' } : Promise.reject(err)));
      return out.ok ? { ok: true, status: out.status, changed: Boolean(out.changed) } : { ok: true, ignored: out.error };
    }
    if (parts[1] === 'us' && parts[2] === 'supported-forms' && parts.length === 3 && method === 'GET') return { ok: true, taxYears: [2025, 2026], ...US_SUPPORTED_FORMS };
    if (parts[1] === 'auth' && parts[2] === 'methods' && parts.length === 3 && method === 'GET') {
      return { ok: true, phone: auth.phoneEnabled, google: google.enabled, oidc: openId.enabled, ...(openId.enabled ? { oidcIssuer: openId.issuer } : {}) };
    }

    if (parts[1] === 'oauth' && parts[2] === 'gusto' && parts[3] === 'callback' && parts.length === 4 && method === 'GET') {
      const code = url.searchParams.get('code') || '';
      const givenState = url.searchParams.get('state') || '';
      const businessId = givenState.split('.')[0] || '';
      const page = gustoPage;
      if (!isUuid(businessId)) return page(false, 'The link did not carry a business.');
      const config = await connectors.load(businessId, 'gusto');
      if (!config) return page(false, 'No Gusto application is saved for this business.');
      if (!config.oauthState || givenState !== config.oauthState) return page(false, 'OAUTH_STATE_MISMATCH: Start the connection again from the keys page; the link had expired or was not ours.');
      const out = await withBooks(businessId, { userId: null, deviceId: null, requestId }, async (session, q) => {
        const result = await gustoCallback(session.state, { code, state: givenState }, { userId: 'owner', role: 'owner' }, { config, save: (patch) => connectors.patch(businessId, 'gusto', patch, q) });
        session.persist();
        return result;
      });
      return page(out.ok, out.ok ? 'MyCA keeps the tokens sealed for this business.' : `${String(out.error || '')}${out.hint ? `: ${out.hint}` : ''}`);
    }

    if (parts[1] === 'auth' && method === 'POST') {
      if (parts[2] !== 'otp' && parts[2] !== 'logout') await throttle('signIn', clientAddress(req));
      const body = await readJson(req);
      if (parts[2] === 'otp') return auth.requestOtp(body.phone, clientAddress(req));
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
      if (parts[2] === 'second-step') return withConsent(await secondFactor.complete(body));
      if (parts[2] === 'logout') return auth.logout((await signedIn(req)).deviceId);
      throw httpError(404, 'NOT_FOUND');
    }

    if (parts[1] === 'whatsapp' && parts[2] === 'webhook' && parts.length === 3) {
      if (method === 'GET') {
        const verified = whatsApp.verify(url.searchParams);
        if (!verified.ok) throw httpError(verified.statusCode, verified.error);
        return rawBody({ __text: verified.text });
      }
      if (method === 'POST') {
        const raw = await readRaw(req, MAX_BODY_BYTES);
        const received = await whatsApp.receive(requestId, raw, req.headers['x-hub-signature-256']);
        if (!received.ok) throw httpError(received.statusCode, received.error);
        return received;
      }
      throw httpError(405, 'METHOD_NOT_ALLOWED');
    }

    if (parts[1] === 'whatsapp' && parts[2] === 'waha' && parts.length === 3) {
      if (method !== 'POST') throw httpError(405, 'METHOD_NOT_ALLOWED');
      const raw = await readRaw(req, MAX_BODY_BYTES);
      const received = await whatsApp.receiveWaha(requestId, raw, req.headers);
      if (!received.ok) throw httpError(received.statusCode, received.error);
      return received;
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

    if (parts[1] === 'jobs' && parts[2] === 'weekly' && parts.length === 3 && method === 'POST') {
      if (!jobTokenMatches(jobToken, req.headers[JOB_HEADER])) throw httpError(404, 'NOT_FOUND');
      return jobs.weekly(requestId);
    }
    if (parts[1] === 'jobs' && parts[2] === 'gst-sessions' && parts.length === 3 && method === 'POST') {
      if (!jobTokenMatches(jobToken, req.headers[JOB_HEADER])) throw httpError(404, 'NOT_FOUND');
      const summary = await gstPortal.refreshDue();
      log({ requestId, job: 'gst-sessions', ...summary });
      return { ok: true, job: 'gst-sessions', summary };
    }
    if (parts[1] === 'jobs' && parts[2] === 'sandbox-smoke' && parts.length === 3 && method === 'POST') {
      if (!jobTokenMatches(jobToken, req.headers[JOB_HEADER])) throw httpError(404, 'NOT_FOUND');
      if (providerMode() !== 'test') return { ok: true, job: 'sandbox-smoke', skipped: `The service runs in ${providerMode()} mode; the smoke test runs only against sandboxes, in test mode.` };
      const smoke = await runSmoke(serverSmokeEnv(process.env), smokeFetch ? { fetchFn: smokeFetch } : {});
      const summary = smoke.refused ? { refused: smoke.refused } : Object.fromEntries(smoke.results.map((r) => [r.id, `${r.status}: ${r.detail}`]));
      log({ requestId, job: 'sandbox-smoke', ok: smoke.ok && !smoke.refused, ...summary });
      return { ok: true, job: 'sandbox-smoke', passed: smoke.ok && !smoke.refused, refused: smoke.refused || undefined, results: smoke.results };
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

    if (parts[1] === 'me' && parts[2] === 'second-step') {
      if (parts.length === 3 && method === 'GET') return secondFactor.status(user.userId);
      if (parts.length === 4 && method === 'POST') {
        if (parts[3] === 'begin') return secondFactor.begin(user.userId);
        const body = await readJson(req);
        if (parts[3] === 'confirm') return secondFactor.confirm(user.userId, body.code);
        if (parts[3] === 'disable') return secondFactor.disable(user.userId, body.code);
        if (parts[3] === 'recovery-codes') return secondFactor.regenerateRecoveryCodes(user.userId, body.code);
      }
      throw httpError(404, 'NOT_FOUND');
    }

    if (parts[1] === 'me' && parts[2] === 'devices') {
      if (parts.length === 3 && method === 'GET') return devices.list(user.userId, user.deviceId);
      if (parts.length === 4 && parts[3] === 'sign-out-others' && method === 'POST') return devices.revokeOthers(user.userId, user.deviceId);
      if (parts.length === 5 && parts[4] === 'sign-out' && method === 'POST') {
        if (!isUuid(parts[3])) throw httpError(404, 'DEVICE_NOT_FOUND');
        return devices.revoke(user.userId, parts[3], user.deviceId);
      }
      throw httpError(404, 'NOT_FOUND');
    }

    if (parts[1] === 'crash-reports' && parts.length === 2 && method === 'POST') {
      await throttle('crash', user.userId);
      return crashes.record(await readJson(req, MAX_CRASH_BYTES));
    }

    if (parts[1] === 'funnel' && parts.length === 2 && method === 'POST') {
      await throttle('funnel', user.userId);
      return growth.record(user.userId, await readJson(req));
    }

    if (parts[1] === 'me' && parts[2] === 'referral') {
      if (parts.length === 3 && method === 'GET') return growth.referral(user.userId);
      if (parts.length === 4 && parts[3] === 'claim' && method === 'POST') {
        await throttle('referralClaim', user.userId);
        return growth.claim(user.userId, await readJson(req));
      }
      throw httpError(404, 'NOT_FOUND');
    }

    if (parts[1] === 'admin' && parts[2] === 'funnel' && parts.length === 3 && method === 'GET') {
      if (!isAdmin(user.userId)) throw httpError(404, 'NOT_FOUND');
      const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days')) || 30));
      log({ requestId, admin: 'funnel', userId: user.userId, days });
      return { days, ...(await growth.digest({ sinceMs: now() - days * 24 * 60 * 60 * 1000, edition: url.searchParams.get('edition') || 'india' })) };
    }

    if (parts[1] === 'admin' && parts[2] === 'crashes' && parts.length === 3 && method === 'GET') {
      if (!isAdmin(user.userId)) throw httpError(404, 'NOT_FOUND');
      const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days')) || 1));
      log({ requestId, admin: 'crash-digest', userId: user.userId, days });
      return { ok: true, days, versions: await crashes.digest(now() - days * 24 * 60 * 60 * 1000) };
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
      if (parts[3] === 'accept' && reviewer(user)) throw httpError(403, 'REVIEWER_DEMO_ONLY');
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
      await recordAccess(businessId, context, method, `${parts[3]}/${parts[4]}`, role);
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
      if (method === 'POST') {
        const body = await readJson(req);
        const demo = body.demo === true || reviewer(user);
        const created = await businesses.create(user.userId, body, { demo });
        if (!created.ok || !demo) return created;
        const context = { userId: user.userId, deviceId: user.deviceId, requestId };
        const seeded = await withBooks(created.business.id, context, (session) => seedDemo(session, indiaDate(now()), { actor: { userId: user.userId, role: 'admin', name: user.name || user.userId } }));
        if (!seeded.ok) log({ requestId, demo: 'seed failed', step: seeded.step, cause: seeded.cause });
        return { ...created, seeded: seeded.ok ? seeded.steps : 0 };
      }
    }

    if (parts[1] === 'businesses' && parts.length === 4) {
      const businessId = parts[2];
      if (!isUuid(businessId)) throw httpError(404, 'BUSINESS_NOT_FOUND');
      const membership = await businesses.membership(user.userId, businessId);
      if (!membership) throw httpError(404, 'BUSINESS_NOT_FOUND');
      const role = membership.role;
      const context = { userId: user.userId, deviceId: user.deviceId, requestId };
      const actor = { actor: { userId: user.userId, role: engineRole(role), name: user.name || user.userId } };
      const action = parts[3];
      if (membership.demo && method === 'POST' && DEMO_BLOCKED_ACTIONS.has(action)) {
        throw httpError(403, 'DEMO_BUSINESS', { hint: 'This is a demo business with fictional data, so it cannot reach the GST portal, the IRP, connected services, billing or other people. Create your own business to do that.' });
      }
      await recordAccess(businessId, context, method, action, role);
      if (method === 'GET' && action === 'access') {
        if (role !== 'owner') throw httpError(403, 'OWNER_ONLY');
        const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days')) || 30));
        const rows = await db.query(
          `select a.at, a.method, a.action, a.role, a.request_id as "requestId", u.name as "userName", a.user_id as "userId"
             from access_log a left join users u on u.id = a.user_id
            where a.business_id = $1 and a.at > $2 order by a.at desc limit 500`,
          [businessId, new Date(now() - days * 24 * 60 * 60 * 1000)],
        );
        return { ok: true, days, access: rows.rows, note: 'Every request to these books by a signed-in member in the period. Reads of the database by the operator are logged separately by the database (pgaudit) and are not shown here.' };
      }
      const sync = await syncOf((text, params) => db.query(text, params), businessId);
      const sharedView = role === 'accountant' && sync && sync.mode !== 'live';

      if (method === 'GET' && action === 'snapshot') {
        if (sharedView) {
          return runner.withSharedBooks(businessId, context, async (session, { asOf }) => ({ ...appSnapshot(session.snapshot(), user, role), sharedAsOf: asOf }));
        }
        return runner.withReadOnlyBooks(businessId, context, async (session) => appSnapshot(session.snapshot(), user, role));
      }
      if (method === 'GET' && action === 'brief') {
        const found = await db.query('select weekly_brief as weekly from memberships where business_id = $1 and user_id = $2', [businessId, user.userId]);
        return { ok: true, weekly: Boolean(found.rows[0]?.weekly), channel: 'whatsapp', when: 'Monday 07:00 IST' };
      }
      if (method === 'GET' && action === 'ca-sync') {
        return { ok: true, mode: sync.mode, sharedAsOf: sync.mode === 'live' ? null : sync.asOf, modes: CA_SYNC_MODES };
      }
      if (method === 'GET' && action === 'inbound') {
        if (role !== 'owner') throw httpError(403, 'OWNER_ONLY');
        return inbound.list(businessId);
      }
      if (method === 'GET' && action === 'connectors') {
        if (role !== 'owner') throw httpError(403, 'OWNER_ONLY');
        return { ...(await connectors.list(businessId)), pulls: channelPullsEnabled() };
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
      if (method === 'GET' && action === 'approvals') return govt.approvals(businessId, context, actor, 'GET');
      if (method === 'GET' && (action === 'gst-portal' || action === 'gst-filings')) {
        if (role === 'staff') throw httpError(403, 'NOT_FOR_STAFF');
        if (sharedView) throw httpError(403, 'SHARED_VIEW_READ_ONLY', { sharedAsOf: sync.asOf });
        return action === 'gst-portal' ? gstPortal.status(businessId) : gstPortal.filings(businessId, context);
      }
      if (method === 'GET' && action === 'quicko') {
        if (role === 'staff') throw httpError(403, 'NOT_FOR_STAFF');
        return quicko.status(businessId);
      }
      if (method === 'GET' && action === 'subscription') return billing.entitlement(businessId);
      if (method === 'GET' && action === 'us-return-purchase') return billing.usReturn(businessId, url.searchParams.get('taxYear'));
      if (method === 'GET' && action === 'us-plus') return billing.usPlus(businessId);
      if (method !== 'POST') throw httpError(404, 'NOT_FOUND');

      const ownerRule = OWNER_ONLY_POSTS.get(action);
      if (ownerRule && role !== 'owner') {
        if (ownerRule === 'SHARED_VIEW_READ_ONLY' && sharedView) throw httpError(403, 'SHARED_VIEW_READ_ONLY', { sharedAsOf: sync.asOf });
        throw httpError(403, 'OWNER_ONLY');
      }

      if (action === 'ask') await throttle('ask', user.userId);
      if (action === 'uploads') await throttle('upload', user.userId);
      const body = await readJson(req, action === 'uploads' ? MAX_UPLOAD_BYTES : action === 'replace' ? Math.min(MAX_BUSINESS_BYTES, budget.limit) : MAX_BODY_BYTES);
      if (action === 'brief') {
        if (role === 'accountant') throw httpError(403, 'NOT_FOR_ACCOUNTANTS');
        const weekly = body.weekly === true;
        await db.query('update memberships set weekly_brief = $3 where business_id = $1 and user_id = $2', [businessId, user.userId, weekly]);
        return { ok: true, weekly, channel: 'whatsapp', when: 'Monday 07:00 IST' };
      }
      if (action === 'ca-sync') {
        const mode = String(body.mode || '');
        if (!CA_SYNC_MODES.includes(mode)) throw httpError(400, 'BAD_SYNC_MODE', { modes: CA_SYNC_MODES });
        await db.query('update businesses set ca_sync = $2 where id = $1', [businessId, mode]);
        const sharedAsOf = mode === 'live' ? null : await runner.share(businessId, user.userId);
        return { ok: true, mode, sharedAsOf };
      }
      if (action === 'ca-share') {
        if (sync.mode === 'live') throw httpError(409, 'CA_SEES_LIVE_BOOKS');
        return { ok: true, sharedAsOf: await runner.share(businessId, user.userId) };
      }
      if (action === 'gstin-check') {
        await throttle('gstinCheck', user.userId);
        return govt.gstinCheck(businessId, context, actor, body);
      }
      if (action === 'quicko' || action === 'quicko-session') {
        if (role === 'staff') throw httpError(403, 'NOT_FOR_STAFF');
        if (sharedView) throw httpError(403, 'SHARED_VIEW_READ_ONLY', { sharedAsOf: sync.asOf });
        if (action === 'quicko') {
          await throttle('quickoBusiness', businessId);
          await throttle('quickoUser', user.userId);
          return quicko.run(businessId, context, actor, body);
        }
        if (body.step !== 'disconnect') {
          await throttle('portalSignInBusiness', businessId);
          await throttle('portalSignInSubject', `${String(body.portal || '')}:${String((body.portal === 'traces' ? body.tan : body.pan) || '').trim().toUpperCase()}`);
        }
        return quicko.connect(businessId, context, body);
      }
      if (action === 'gst-portal' || action === 'gst-gstr1' || action === 'gst-gstr3b' || action === 'tds-fvu') {
        if (role === 'staff') throw httpError(403, 'NOT_FOR_STAFF');
        if (sharedView) throw httpError(403, 'SHARED_VIEW_READ_ONLY', { sharedAsOf: sync.asOf });
        if (action === 'gst-portal') return gstPortal.connection(businessId, context, actor, body);
        if (action === 'gst-gstr3b') return gstPortal.gstr3b(businessId, context, actor, body);
        if (action === 'tds-fvu') return gstPortal.tdsFvu(businessId, context, actor, body);
        return gstPortal.gstr1(businessId, context, actor, body);
      }
      if (action === 'einvoice' || action === 'ewaybill' || action === 'approvals') {
        if (sharedView) throw httpError(403, 'SHARED_VIEW_READ_ONLY');
        const allowed = action === 'approvals' ? { ok: true } : await billing.allows(businessId, 'einvoice');
        if (!allowed.ok) return allowed;
        if (action === 'einvoice') return govt.einvoice(businessId, context, actor, body);
        if (action === 'ewaybill') {
          if (role === 'staff' && body.op !== 'get' && body.op !== 'consignee_list') throw httpError(403, 'NOT_FOR_STAFF');
          return govt.ewaybill(businessId, context, actor, body);
        }
        return govt.approvals(businessId, context, actor, 'POST', body);
      }
      if (sharedView) {
        if (action === 'query') return runner.withSharedBooks(businessId, context, (session) => session.query(body.name, body.args || {}, actor));
        if (action === 'ask') {
          const message = chatText(body.message);
          if (!message.trim()) throw httpError(400, 'MESSAGE_REQUIRED');
          return runner.withSharedBooks(businessId, context, async (session, { asOf }) => {
            const out = await session.chat(message, actor);
            if (!out.preview && !out.awaitingConfirmation) return out;
            return { reply: `These books are shared with you as they stood on ${inWords(indiaDate(asOf.getTime()))}, so nothing can be posted from here. Ask the owner to make the change, or to share the books again.`, tools: [] };
          });
        }
        throw httpError(403, 'SHARED_VIEW_READ_ONLY', { sharedAsOf: sync.asOf });
      }
      if (action === 'subscription') return billing.verify(businessId, user.userId, body);
      if (action === 'us-return-purchase') return billing.verifyUsReturn(businessId, user.userId, body);
      if (action === 'us-checkout') {
        // The e-file partner files forms MyCA's own engine does not, so only MyCA's own route refuses them.
        const unsupported = body.product === 'return' && efileRoute() !== 'partner' ? await unsupportedForms(businessId, context, actor, body.taxYear) : [];
        return billing.usCheckout(businessId, user.userId, body, { unsupported });
      }
      if (action === 'us-checkout-confirm') return billing.usCheckoutConfirm(businessId, user.userId, body);
      if (action === 'us-plus-cancel') return billing.cancelUsPlus(businessId, user.userId);
      if (action === 'us-plus-purchase') return billing.verifyUsPlus(businessId, user.userId, body);
      if (action === 'us-waitlist') return billing.joinUsWaitlist(businessId, user.userId, body);
      const posting = WRITES.has(action) ? await billing.allows(businessId, 'post') : { ok: true };
      if (!posting.ok) return posting;
      if (action === 'invitations') {
        const team = await billing.allows(businessId, 'team');
        if (!team.ok) return team;
        const seats = await billing.withinLimit(businessId, 'members', (await businesses.members(businessId)).length);
        if (!seats.ok) return seats;
        return members.invite(businessId, context, body);
      }
      if (action === 'inbound') return inbound.create(businessId, context, body);
      if (action === 'connectors') {
        const allowed = await billing.allows(businessId, 'connectors');
        if (!allowed.ok) return allowed;
        return connectors.save(businessId, context, body);
      }
      if (action === 'plaid-link-token' || action === 'plaid-exchange' || action === 'gusto-connect' || action === 'taxjar-rate') {
        const channel = action.startsWith('plaid') ? 'plaid' : action.startsWith('gusto') ? 'gusto' : 'taxjar';
        if (!connectors.enabled) return { ok: false, error: 'CONNECTORS_UNAVAILABLE', hint: 'The service has no connector key; ask the operator to set MYCA_CONNECTOR_KEY.' };
        const config = await connectors.load(businessId, channel);
        const flowIn = (q) => ({ config, save: (patch) => connectors.patch(businessId, channel, patch, q) });
        if (action === 'gusto-connect') return gustoConnectUrl({ redirectUri: `${publicOrigin(req)}/v1/oauth/gusto/callback`, statePrefix: businessId }, flowIn());
        return withBooks(businessId, context, async (session, q) => {
          const flow = flowIn(q);
          const out = action === 'plaid-link-token' ? await plaidLinkToken(session.state, { userId: user.userId }, actor.actor, flow)
            : action === 'plaid-exchange' ? await plaidExchange(session.state, { publicToken: body.publicToken }, actor.actor, flow)
            : await taxjarRate(session.state, { zip: body.zip, city: body.city, state: body.state, code: body.code, name: body.name, record: body.record }, actor.actor, flow);
          session.persist();
          return out;
        });
      }
      if (action === 'connector-sync') {
        const configured = await connectors.configured(businessId);
        if (!configured.length) return { ok: false, error: 'NO_CONNECTORS', hint: 'Connect a channel first.' };
        return withBooks(businessId, context, async (session) => {
          const out = await syncChannels(session.state, { to: body.to }, { actor: actor.actor, connectors: configured });
          session.persist();
          return out;
        });
      }
      if (action === 'replace') {
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
        if (name === US_FILE_TOOL) {
          const paid = await billing.usFilingAllowed(businessId, args.taxYear);
          if (!paid.ok) return paid;
        }
        if (!PROPOSABLE.has(name)) throw httpError(400, 'NOT_PROPOSABLE', { tool: name });
        const proposed = name === 'sign_us_return' ? withRequestAddress(args, clientAddress(req)) : name === US_FILE_TOOL ? { ...args, partnerScope: businessId } : args;
        return withBooks(businessId, context, (session) => session.propose(name, proposed, actor));
      }
      if (action === 'confirm') {
        return withBooks(businessId, context, async (session) => {
          const unpaid = await unpaidFiling(businessId, session);
          if (unpaid) return unpaid;
          // Requests run with provider calls off; filing a US return is the one confirm that may
          // reach the IRS or the e-file partner, at the service's own provider setting.
          if (session.state.pendingChatAction?.name === US_FILE_TOOL) return asUsFiling(session, businessId, () => session.confirm(body.token, actor));
          return session.confirm(body.token, actor);
        });
      }
      if (action === 'discard') return withBooks(businessId, context, (session) => session.discard(actor));
      if (action === 'query') {
        if (US_PLUS_TOOLS.includes(body.name)) {
          const plus = await billing.usPlusAllows(businessId);
          if (!plus.ok) return plus;
        }
        return runner.withReadOnlyBooks(businessId, context, (session) => session.query(body.name, body.args || {}, actor));
      }
      if (action === 'ask') {
        const message = chatText(body.message);
        if (!message.trim()) throw httpError(400, 'MESSAGE_REQUIRED');
        const canPost = await billing.allows(businessId, 'post');
        return withBooks(businessId, context, async (session) => {
          if (!canPost.ok) return readOnlyChat(session, message, actor);
          if (await unpaidFiling(businessId, session)) await session.discard(actor);
          // A "yes" in chat can confirm a pending US filing, which must reach the partner the same way.
          const out = session.state.pendingChatAction?.name === US_FILE_TOOL && confirmationIntent(message) && confirmationIntent(message) !== 'cancel' ? await asUsFiling(session, businessId, () => session.chat(message, actor)) : await session.chat(message, actor);
          const unpaid = await unpaidFiling(businessId, session);
          if (!unpaid) return out;
          await session.discard(actor);
          return { reply: unpaid.hint, tools: [], error: unpaid.error };
        });
      }
      if (action === 'company') {
        if (role !== 'owner') throw httpError(403, 'OWNER_ONLY');
        let renamed = null;
        const out = await withBooks(businessId, context, async (session) => {
          const result = await session.updateCompany(body, actor);
          if (result.ok !== false) renamed = { ...session.state.company };
          return result;
        });
        if (renamed) await businesses.rename(businessId, renamed);
        return out;
      }
    }
    throw httpError(404, 'NOT_FOUND');
  }

  async function serve(req, res) {
    const requestId = randomUUID();
    const url = parseTarget(req.url);
    let status = 200;
    let body;
    try {
      body = await withProviderContext({ environment: 'off' }, () => route(req, requestId, url));
      status = statusOf(body);
    } catch (err) {
      status = err.statusCode || 500;
      body = err.body || { ok: false, error: status === 500 ? 'INTERNAL_ERROR' : String(err.message) };
      if (status === 500) {
        log({ requestId, error: String(err && err.stack ? err.stack : err) });
        await crashes.recordServer(err, version).catch(() => {});
      }
    }
    log({ requestId, method: req.method, path: url ? url.pathname.replace(/[0-9a-f-]{36}/gi, ':id') : '(unreadable)', status, ...(body && body.error === 'SERVER_BUSY' ? { db: 'pool busy' } : {}) });
    const retry = status === 503 ? { 'retry-after': '2' } : status === 429 && body && Number.isSafeInteger(body.retryAfterSeconds) ? { 'retry-after': String(body.retryAfterSeconds) } : {};
    if (body && typeof body === 'object' && RAW_BODIES.has(body) && typeof body.__html === 'string') {
      res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'", 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', 'x-request-id': requestId, ...retry });
      res.end(body.__html);
      return;
    }
    if (body && typeof body === 'object' && RAW_BODIES.has(body) && typeof body.__text === 'string') {
      res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-request-id': requestId, ...retry });
      res.end(body.__text);
      return;
    }
    const payload = JSON.stringify(body, (_key, value) => (typeof value === 'bigint' ? Number(value) : value));
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-request-id': requestId, ...retry });
    res.end(payload);
  }

  return Object.assign(async function handler(req, res) {
    try {
      await serve(req, res);
    } catch {
      if (res.headersSent) {
        res.destroy();
      } else {
        res.writeHead(500, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end('{"ok":false,"error":"INTERNAL_ERROR"}');
      }
    } finally {
      releaseBody(req);
    }
  }, { bodyBudget: budget });
}
