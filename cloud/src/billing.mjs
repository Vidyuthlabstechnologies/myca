import { createSign, timingSafeEqual } from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 3;
const LIVE_STATUSES = new Set(['active', 'in_grace_period', 'canceled']);
const PLAY_API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const PLAY_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const RENEW_AHEAD_DAYS = 2;
const RENEW_LOOKBACK_DAYS = 30;
const RENEW_BATCH = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PLANS = Object.freeze({
  lapsed: Object.freeze({ id: 'lapsed', title: 'Trial ended', monthlyRupees: 0, yearlyRupees: 0, limits: { invoicesPerMonth: 0, members: 1 }, features: ['books'] }),
  essentials: Object.freeze({ id: 'essentials', title: 'Essentials', monthlyRupees: 399, yearlyRupees: 3999, limits: { invoicesPerMonth: null, members: 2 }, features: ['books', 'post', 'chat', 'gst-reports', 'team'] }),
  pro: Object.freeze({ id: 'pro', title: 'Pro', monthlyRupees: 799, yearlyRupees: 7999, limits: { invoicesPerMonth: null, members: 5 }, features: ['books', 'post', 'chat', 'gst-reports', 'gst-returns', 'einvoice', 'connectors', 'whatsapp', 'team'] }),
  household: Object.freeze({ id: 'household', title: 'Personal tax return', monthlyRupees: 0, yearlyRupees: 0, limits: { invoicesPerMonth: 0, members: 3 }, features: ['books', 'post', 'chat', 'team'] }),
  firm: Object.freeze({ id: 'firm', title: 'CA firm', monthlyRupees: 2499, yearlyRupees: 24999, limits: { invoicesPerMonth: null, members: 25 }, features: ['books', 'post', 'chat', 'gst-reports', 'gst-returns', 'einvoice', 'connectors', 'whatsapp', 'team', 'priority-support'] }),
});

const PAID = ['essentials', 'pro', 'firm'];
export const US_RETURN_PRICE_USD = 39;
const US_RETURN_YEARS_BACK = 3;

function cheapestWith(feature) {
  return PAID.map((id) => PLANS[id]).filter((plan) => plan.features.includes(feature)).map((plan) => plan.title);
}

export const READ_ONLY_REPLY = 'The free trial has ended, so the books are read-only: you can still ask questions and export everything, but nothing new is posted. The owner can choose a plan under Plan and billing.';

export async function readOnlyChat(session, message, actor) {
  if (session.state.pendingChatAction) await session.discard(actor);
  const out = await session.chat(message, actor);
  if (!out.preview && !out.awaitingConfirmation && !out.pending) return out;
  await session.discard(actor);
  return { reply: READ_ONLY_REPLY, tools: [], error: 'PLAN_REQUIRED' };
}

function unset(value) {
  const text = String(value || '').trim();
  return text === 'unset' ? '' : text;
}

function parseServiceAccount(text) {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed.client_email && parsed.private_key ? { clientEmail: parsed.client_email, privateKey: parsed.private_key, tokenUri: parsed.token_uri || 'https://oauth2.googleapis.com/token' } : null;
  } catch {
    return null;
  }
}

export function billingConfigFromEnv(env = process.env) {
  const prices = Object.fromEntries(String(env.MYCA_PLAN_PRICES || '').split(',').map((pair) => pair.split('=').map((part) => part.trim())).filter(([plan, price]) => PAID.includes(plan) && /^[0-9]{1,6}$/.test(price || '')).map(([plan, price]) => [plan, Number(price)]));
  return {
    packageName: unset(env.MYCA_PLAY_PACKAGE),
    productIds: { essentials: unset(env.MYCA_PLAY_PRODUCT_ESSENTIALS), pro: unset(env.MYCA_PLAY_PRODUCT_PRO), firm: unset(env.MYCA_PLAY_PRODUCT_FIRM) },
    usReturn: { packageName: unset(env.MYCA_PLAY_PACKAGE_US), productId: unset(env.MYCA_PLAY_PRODUCT_US_1040), priceUsd: /^[0-9]{1,4}$/.test(String(env.MYCA_US_RETURN_PRICE_USD || '').trim()) ? Number(env.MYCA_US_RETURN_PRICE_USD) : US_RETURN_PRICE_USD },
    notifyToken: unset(env.MYCA_PLAY_NOTIFY_TOKEN),
    serviceAccount: parseServiceAccount(unset(env.MYCA_PLAY_SERVICE_ACCOUNT_JSON)),
    prices,
  };
}

export function billingConfigProblem(env = process.env) {
  const cfg = billingConfigFromEnv(env);
  if (!(cfg.packageName && PAID.some((plan) => cfg.productIds[plan])) && !((cfg.usReturn.packageName || cfg.packageName) && cfg.usReturn.productId)) return '';
  const given = unset(env.MYCA_PLAY_SERVICE_ACCOUNT_JSON);
  if (given && !cfg.serviceAccount) return 'MYCA_PLAY_SERVICE_ACCOUNT_JSON is not a service account key: paste the whole JSON file Google Cloud gave for the Play service account.';
  if (!given && !env.K_SERVICE) return 'Google Play subscriptions are on but MYCA_PLAY_SERVICE_ACCOUNT_JSON is empty: outside Cloud Run the API has no other way to reach the Play Developer API.';
  return '';
}

export function notifyTokenMatches(expected, given) {
  if (!expected || typeof given !== 'string' || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function stateWord(value) {
  return String(value || '').replace(/^SUBSCRIPTION_STATE_/, '').toLowerCase() || 'unknown';
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

export function createBilling({ db, config = {}, now = () => Date.now(), fetchImpl = (...args) => globalThis.fetch(...args), log = () => {} }) {
  const cfg = { packageName: '', productIds: {}, notifyToken: '', serviceAccount: null, prices: {}, ...config };
  cfg.usReturn = { packageName: '', productId: '', priceUsd: US_RETURN_PRICE_USD, ...(config.usReturn || {}) };
  const enabled = Boolean(cfg.packageName && PAID.some((plan) => cfg.productIds[plan]));
  const usPackage = cfg.usReturn.packageName || cfg.packageName;
  const usEnforced = Boolean(usPackage && cfg.usReturn.productId);
  const planOfProduct = (productId) => PAID.find((plan) => cfg.productIds[plan] && cfg.productIds[plan] === productId) || null;
  let cachedToken = { value: '', until: 0 };

  async function accessToken() {
    if (cachedToken.value && cachedToken.until > now()) return cachedToken.value;
    let res;
    if (cfg.serviceAccount) {
      const iat = Math.floor(now() / 1000);
      const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify({ iss: cfg.serviceAccount.clientEmail, scope: PLAY_SCOPE, aud: cfg.serviceAccount.tokenUri, iat, exp: iat + 3600 }))}`;
      const signature = createSign('RSA-SHA256').update(unsigned).sign(cfg.serviceAccount.privateKey).toString('base64url');
      res = await fetchImpl(cfg.serviceAccount.tokenUri, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }).toString(),
        signal: AbortSignal.timeout(15000),
      });
    } else {
      res = await fetchImpl(`${METADATA_TOKEN_URL}?scopes=${encodeURIComponent(PLAY_SCOPE)}`, { headers: { 'metadata-flavor': 'Google' }, signal: AbortSignal.timeout(5000) });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw Object.assign(new Error('PLAY_AUTH_FAILED'), { status: res.status });
    cachedToken = { value: data.access_token, until: now() + Math.max(60, Number(data.expires_in) || 3600) * 1000 - 60000 };
    return cachedToken.value;
  }

  async function play(method, path, packageName = cfg.packageName) {
    const res = await fetchImpl(`${PLAY_API}/${encodeURIComponent(packageName)}/purchases/${path}`, {
      method,
      headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
      body: method === 'POST' ? '{}' : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    return { ok: res.ok, status: res.status, data };
  }

  async function lookup(purchaseToken) {
    const out = await play('GET', `subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`);
    if (!out.ok) return { ok: false, status: out.status };
    const items = Array.isArray(out.data.lineItems) ? out.data.lineItems : [];
    const item = items.find((line) => planOfProduct(line.productId)) || items[0] || {};
    const expiry = items.map((line) => Date.parse(line.expiryTime || '')).filter(Number.isFinite);
    return {
      ok: true,
      productId: String(item.productId || ''),
      plan: planOfProduct(item.productId),
      status: stateWord(out.data.subscriptionState),
      currentEnd: expiry.length ? new Date(Math.max(...expiry)) : null,
      accountId: String(out.data.externalAccountIdentifiers?.obfuscatedExternalAccountId || ''),
      linkedPurchaseToken: String(out.data.linkedPurchaseToken || ''),
      needsAck: out.data.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
      testPurchase: Boolean(out.data.testPurchase),
    };
  }

  async function acknowledge(found, purchaseToken) {
    if (!found.needsAck || !LIVE_STATUSES.has(found.status) || !found.productId) return;
    const out = await play('POST', `subscriptions/${encodeURIComponent(found.productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`);
    if (!out.ok) log({ billing: 'acknowledge_failed', status: out.status });
  }

  async function save(businessId, userId, purchaseToken, found) {
    await db.query(
      `insert into subscriptions (business_id, provider, provider_subscription_id, product_id, plan, status, current_end, test_purchase, created_by, updated_at)
       values ($1, 'play', $2, $3, $4, $5, $6, $7, $8, now())
       on conflict (business_id) do update set provider = excluded.provider, provider_subscription_id = excluded.provider_subscription_id, product_id = excluded.product_id, plan = excluded.plan, status = excluded.status, current_end = excluded.current_end, test_purchase = excluded.test_purchase, created_by = coalesce(excluded.created_by, subscriptions.created_by), updated_at = now()`,
      [businessId, purchaseToken, found.productId, found.plan, found.status, found.currentEnd, found.testPurchase, userId],
    );
  }

  async function row(businessId) {
    const found = await db.query('select provider, provider_subscription_id as "token", product_id as "productId", plan, status, current_end as "currentEnd", test_purchase as "testPurchase" from subscriptions where business_id = $1', [businessId]);
    return found.rows[0] || null;
  }

  async function ownerOfToken(purchaseToken) {
    if (!purchaseToken) return null;
    const found = await db.query("select business_id as \"businessId\" from subscriptions where provider = 'play' and provider_subscription_id = $1", [purchaseToken]);
    return found.rows[0]?.businessId || null;
  }

  function manageUrl(productId) {
    if (!cfg.packageName) return '';
    const sku = productId ? `sku=${encodeURIComponent(productId)}&` : '';
    return `https://play.google.com/store/account/subscriptions?${sku}package=${encodeURIComponent(cfg.packageName)}`;
  }

  async function entitlement(businessId) {
    const at = now();
    const business = await db.query('select created_at as "createdAt", demo, kind from businesses where id = $1', [businessId]);
    if (business.rows[0]?.kind === 'household') {
      const plan = PLANS.household;
      return { ok: true, enforced: enabled, plan: plan.id, planTitle: plan.title, limits: plan.limits, features: plan.features, trial: null, subscription: null, manageUrl: '', usReturn: { enforced: usEnforced, priceUsd: cfg.usReturn.priceUsd, productId: cfg.usReturn.productId } };
    }
    if (business.rows[0]?.demo) {
      return { ok: true, enforced: enabled, plan: 'pro', planTitle: PLANS.pro.title, limits: PLANS.pro.limits, features: PLANS.pro.features, trial: null, demo: true, subscription: null, manageUrl: '' };
    }
    const createdAt = business.rows[0] ? new Date(business.rows[0].createdAt).getTime() : at;
    const trialEndsAt = createdAt + TRIAL_DAYS * DAY_MS;
    const sub = await row(businessId);
    const paidUntil = sub?.currentEnd ? new Date(sub.currentEnd).getTime() + GRACE_DAYS * DAY_MS : 0;
    const paying = Boolean(sub && LIVE_STATUSES.has(sub.status) && PAID.includes(sub.plan) && paidUntil > at);
    const inTrial = !paying && at < trialEndsAt;
    const plan = paying ? sub.plan : inTrial ? 'pro' : 'lapsed';
    return {
      ok: true,
      enforced: enabled,
      plan,
      planTitle: PLANS[plan].title,
      limits: PLANS[plan].limits,
      features: PLANS[plan].features,
      trial: inTrial ? { endsAt: new Date(trialEndsAt).toISOString(), daysLeft: Math.max(0, Math.ceil((trialEndsAt - at) / DAY_MS)) } : null,
      subscription: sub ? { provider: sub.provider, plan: sub.plan, productId: sub.productId, status: sub.status, renews: sub.status === 'active' || sub.status === 'in_grace_period', currentEnd: sub.currentEnd ? new Date(sub.currentEnd).toISOString() : null, testPurchase: sub.testPurchase } : null,
      manageUrl: sub?.provider === 'play' ? manageUrl(sub.productId) : '',
    };
  }

  async function allows(businessId, feature) {
    if (!enabled) return { ok: true };
    const got = await entitlement(businessId);
    if (got.features.includes(feature)) return { ok: true, entitlement: got };
    const plans = cheapestWith(feature);
    const hint = got.plan === 'lapsed' ? 'The free trial has ended, so the books are read-only: you can see and export everything. The owner can choose a plan under Plan and billing.' : `${plans.join(' or ')} includes this. The owner can upgrade under Plan and billing.`;
    return fail('PLAN_REQUIRED', { feature, plan: got.plan, hint });
  }

  async function withinLimit(businessId, limit, used) {
    if (!enabled) return { ok: true };
    const got = await entitlement(businessId);
    const cap = got.limits[limit];
    if (cap == null || used < cap) return { ok: true };
    return fail('PLAN_LIMIT_REACHED', { limit, cap, plan: got.plan, hint: `The ${got.planTitle} plan allows ${cap}. The owner can upgrade under Plan and billing.` });
  }

  function usTaxYearProblem(taxYear) {
    const year = Number(taxYear);
    const latest = new Date(now()).getUTCFullYear();
    if (!Number.isInteger(year) || year > latest || year < latest - US_RETURN_YEARS_BACK) return fail('BAD_TAX_YEAR', { hint: `Pick a tax year from ${latest - US_RETURN_YEARS_BACK} to ${latest}.` });
    return null;
  }

  async function isHousehold(businessId) {
    const found = await db.query('select kind from businesses where id = $1', [businessId]);
    return found.rows[0]?.kind === 'household';
  }

  async function usPurchase(businessId, taxYear) {
    const found = await db.query('select product_id as "productId", price_usd as "priceUsd", test_purchase as "testPurchase", created_at as "createdAt" from us_return_purchases where business_id = $1 and tax_year = $2', [businessId, taxYear]);
    return found.rows[0] || null;
  }

  async function usReturn(businessId, taxYear) {
    const bad = usTaxYearProblem(taxYear);
    if (bad) return bad;
    const year = Number(taxYear);
    const bought = await usPurchase(businessId, year);
    return {
      ok: true,
      taxYear: year,
      enforced: usEnforced,
      paid: Boolean(bought) || !usEnforced,
      purchased: Boolean(bought),
      priceUsd: bought ? bought.priceUsd : cfg.usReturn.priceUsd,
      currency: 'USD',
      productId: cfg.usReturn.productId,
      buyable: usEnforced,
      purchasedAt: bought ? new Date(bought.createdAt).toISOString() : null,
      testPurchase: Boolean(bought?.testPurchase),
    };
  }

  async function usFilingAllowed(businessId, taxYear) {
    if (!usEnforced) return { ok: true };
    const bad = usTaxYearProblem(taxYear);
    if (bad) return bad;
    if (await usPurchase(businessId, Number(taxYear))) return { ok: true };
    return fail('US_RETURN_UNPAID', { taxYear: Number(taxYear), priceUsd: cfg.usReturn.priceUsd, productId: cfg.usReturn.productId, hint: `Preparing and reviewing your return is free. Filing it with the IRS is $${cfg.usReturn.priceUsd} for the ${taxYear} return, paid once on the Sign and e-file screen.` });
  }

  async function lookupProduct(productId, purchaseToken) {
    const out = await play('GET', `products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`, usPackage);
    if (!out.ok) return { ok: false, status: out.status };
    return {
      ok: true,
      purchased: Number(out.data.purchaseState ?? 0) === 0,
      accountId: String(out.data.obfuscatedExternalAccountId || ''),
      needsAck: Number(out.data.acknowledgementState ?? 0) === 0 && Number(out.data.consumptionState ?? 0) === 0,
      testPurchase: out.data.purchaseType === 0,
    };
  }

  async function verifyUsReturn(businessId, userId, { taxYear, productId, purchaseToken } = {}) {
    if (!usEnforced) return fail('BILLING_NOT_CONFIGURED', { hint: 'The operator has not set up the Google Play product for US returns yet.' });
    if (!(await isHousehold(businessId))) return fail('NOT_A_PERSONAL_RETURN', { hint: 'The filing fee is for a personal US return. Businesses use a monthly plan.' });
    const bad = usTaxYearProblem(taxYear);
    if (bad) return bad;
    const year = Number(taxYear);
    const token = String(purchaseToken || '');
    if (productId !== cfg.usReturn.productId || !token || token.length > 2000) return fail('UNKNOWN_PRODUCT', { products: [cfg.usReturn.productId] });
    const used = await db.query(`select business_id as "businessId", tax_year as "taxYear" from us_return_purchases where provider = 'play' and purchase_token = $1`, [token]);
    if (used.rows[0]) {
      if (used.rows[0].businessId === businessId && Number(used.rows[0].taxYear) === year) return usReturn(businessId, year);
      return fail('PURCHASE_ALREADY_USED', { hint: 'This Google Play payment already paid for another return. Each tax year is paid once.' });
    }
    if (await usPurchase(businessId, year)) return fail('ALREADY_PAID', { taxYear: year, hint: `The ${year} return is already paid for.` });
    let found;
    try {
      found = await lookupProduct(productId, token);
    } catch (error) {
      log({ billing: 'play_auth_failed', status: error.status || 0 });
      return fail('PROVIDER_UNAVAILABLE', { hint: 'Google Play could not be reached. Your payment is safe; try again in a minute.' });
    }
    if (!found.ok) return fail('PURCHASE_NOT_FOUND', { status: found.status, hint: 'Google Play does not know this payment.' });
    if (!found.purchased) return fail('PURCHASE_NOT_COMPLETE', { hint: 'Google Play has not finished this payment yet. It is picked up once it goes through.' });
    if (found.accountId && found.accountId !== businessId) return fail('PURCHASE_BELONGS_TO_ANOTHER_BUSINESS', { hint: 'This Google Play payment was made for another return.' });
    const saved = await db.query(
      `insert into us_return_purchases (business_id, tax_year, provider, purchase_token, product_id, price_usd, test_purchase, created_by)
       values ($1, $2, 'play', $3, $4, $5, $6, $7) on conflict do nothing returning tax_year`,
      [businessId, year, token, productId, cfg.usReturn.priceUsd, found.testPurchase, userId],
    );
    if (!saved.rows.length) return fail('PURCHASE_ALREADY_USED', { hint: 'This return or this payment was just recorded by another request.' });
    if (found.needsAck) {
      const ack = await play('POST', `products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`, usPackage);
      if (!ack.ok) log({ billing: 'acknowledge_failed', status: ack.status });
    }
    await audit(businessId, userId, 'billing.us_return_paid', { provider: 'play', taxYear: year, priceUsd: cfg.usReturn.priceUsd, testPurchase: found.testPurchase });
    return usReturn(businessId, year);
  }

  async function audit(businessId, userId, action, metadata) {
    await db.query(`insert into audit_log (business_id, user_id, request_id, action, metadata) values ($1, $2, '', $3, $4::jsonb)`, [businessId, userId, action, JSON.stringify(metadata)]);
  }

  return {
    enabled,
    plans: () => ({
      ok: true,
      enabled,
      store: 'play',
      packageName: cfg.packageName,
      trialDays: TRIAL_DAYS,
      currency: 'INR',
      plans: PAID.map((id) => PLANS[id]).map((plan) => ({ ...plan, monthlyRupees: cfg.prices[plan.id] ?? plan.monthlyRupees, productId: cfg.productIds[plan.id] || '', buyable: enabled && Boolean(cfg.productIds[plan.id]) })),
      usReturn: { title: 'US federal return', priceUsd: cfg.usReturn.priceUsd, currency: 'USD', per: 'tax_year', packageName: usPackage, productId: cfg.usReturn.productId, buyable: usEnforced },
    }),
    entitlement,
    usEnforced,
    usReturn,
    usFilingAllowed,
    verifyUsReturn,
    allows,
    withinLimit,

    async verify(businessId, userId, { productId, purchaseToken } = {}) {
      if (!enabled) return fail('BILLING_NOT_CONFIGURED', { hint: 'The operator has not set up Google Play subscriptions yet.' });
      const token = String(purchaseToken || '');
      if (!planOfProduct(productId) || !token || token.length > 2000) return fail('UNKNOWN_PLAN', { products: PAID.map((p) => cfg.productIds[p]).filter(Boolean) });
      const holder = await ownerOfToken(token);
      if (holder && holder !== businessId) return fail('PURCHASE_BELONGS_TO_ANOTHER_BUSINESS', { hint: 'This Google Play subscription already pays for another business.' });
      let found;
      try {
        found = await lookup(token);
      } catch (error) {
        log({ billing: 'play_auth_failed', status: error.status || 0 });
        return fail('PROVIDER_UNAVAILABLE', { hint: 'Google Play could not be reached. Your purchase is safe; open Plan and billing again in a minute.' });
      }
      if (!found.ok) return fail('PURCHASE_NOT_FOUND', { status: found.status, hint: 'Google Play does not know this purchase.' });
      if (!found.plan || found.productId !== productId) return fail('PURCHASE_PRODUCT_MISMATCH');
      if (found.accountId && found.accountId !== businessId) return fail('PURCHASE_BELONGS_TO_ANOTHER_BUSINESS', { hint: 'This Google Play subscription was bought for another business.' });
      await save(businessId, userId, token, found);
      await acknowledge(found, token);
      await audit(businessId, userId, 'billing.subscribe', { provider: 'play', plan: found.plan, status: found.status, testPurchase: found.testPurchase });
      return { ok: true, plan: found.plan, status: found.status, testPurchase: found.testPurchase, entitlement: await entitlement(businessId) };
    },

    async refreshDue() {
      const summary = { checked: 0, changed: 0, failed: 0 };
      if (!enabled) return summary;
      const at = now();
      const due = await db.query(
        `select business_id as "businessId", provider_subscription_id as "token", status, current_end as "currentEnd"
           from subscriptions
          where provider = 'play' and status = any($1::text[]) and current_end is not null and current_end < $2 and current_end > $3
          order by current_end limit $4`,
        [[...LIVE_STATUSES], new Date(at + RENEW_AHEAD_DAYS * DAY_MS), new Date(at - RENEW_LOOKBACK_DAYS * DAY_MS), RENEW_BATCH],
      );
      for (const sub of due.rows) {
        summary.checked += 1;
        let found;
        try {
          found = await lookup(sub.token);
        } catch (error) {
          summary.failed += 1;
          log({ billing: 'renewal_check_failed', businessId: sub.businessId, status: error.status || 0 });
          continue;
        }
        if (!found.ok || !found.plan) {
          summary.failed += 1;
          log({ billing: 'renewal_lookup_failed', businessId: sub.businessId, status: found.status || 0 });
          continue;
        }
        const before = `${sub.status}|${sub.currentEnd ? new Date(sub.currentEnd).getTime() : 0}`;
        const after = `${found.status}|${found.currentEnd ? found.currentEnd.getTime() : 0}`;
        await save(sub.businessId, null, sub.token, found);
        await acknowledge(found, sub.token);
        if (before !== after) {
          summary.changed += 1;
          await audit(sub.businessId, null, 'billing.renewal_check', { provider: 'play', status: found.status, plan: found.plan });
        }
      }
      return summary;
    },

    async notify(rawBody, givenToken, { pushVerified = false } = {}) {
      if (!enabled || (!cfg.notifyToken && !pushVerified)) return { ok: false, statusCode: 404, error: 'NOT_FOUND' };
      if (!pushVerified && !notifyTokenMatches(cfg.notifyToken, givenToken)) return { ok: false, statusCode: 401, error: 'BAD_TOKEN' };
      let message;
      let event;
      try {
        message = JSON.parse(rawBody.toString('utf8')).message || {};
        event = JSON.parse(Buffer.from(String(message.data || ''), 'base64').toString('utf8'));
      } catch {
        return { ok: true, ignored: true };
      }
      if (event.packageName !== cfg.packageName || !event.subscriptionNotification?.purchaseToken) return { ok: true, ignored: true };
      const token = String(event.subscriptionNotification.purchaseToken);
      let found;
      try {
        found = await lookup(token);
      } catch (error) {
        log({ billing: 'play_auth_failed', status: error.status || 0 });
        return { ok: false, statusCode: 503, error: 'PROVIDER_UNAVAILABLE' };
      }
      if (!found.ok) {
        log({ billing: 'notify_lookup_failed', status: found.status });
        return found.status >= 500 ? { ok: false, statusCode: 503, error: 'PROVIDER_UNAVAILABLE' } : { ok: true, unknown: true };
      }
      let businessId = (await ownerOfToken(token)) || (await ownerOfToken(found.linkedPurchaseToken));
      if (!businessId && UUID.test(found.accountId)) {
        const exists = await db.query('select id from businesses where id = $1', [found.accountId]);
        if (exists.rows.length) businessId = found.accountId;
      }
      if (!businessId || !found.plan) {
        log({ billing: 'notify_unknown_purchase' });
        return { ok: true, unknown: true };
      }
      await save(businessId, null, token, found);
      await acknowledge(found, token);
      await db.query("insert into billing_events (provider, event_id) values ('play', $1) on conflict do nothing", [String(message.messageId || message.message_id || `${token.slice(0, 40)}:${event.eventTimeMillis || ''}`).slice(0, 200)]);
      await audit(businessId, null, 'billing.event', { provider: 'play', notificationType: Number(event.subscriptionNotification.notificationType) || 0, status: found.status, plan: found.plan });
      return { ok: true };
    },
  };
}
